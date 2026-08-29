"use client";

/**
 * La aplicación entera, en una sola pantalla y tres pasos:
 *
 *   FORMULARIO  ->  PROCESANDO  ->  RANKING
 *
 * El PDF se parte en el navegador con pdf-lib y cada parte se sube DIRECTO a
 * Supabase Storage con una URL firmada. El archivo no pasa nunca por una
 * función de Vercel: por eso admite PDFs de 250 MB o más.
 *
 * El procesamiento arranca solo: al terminar de subir, el servidor levanta el
 * worker (GitHub Actions en producción, un proceso hijo en desarrollo) y esta
 * pantalla muestra el progreso REAL que el worker va escribiendo en la base.
 * Todo lo que se ve acá —páginas leídas, boletas detectadas, boletas
 * guardadas— son números que vienen del PDF, nunca una animación de relleno.
 */

import { useRef, useState } from "react";
import { PDFDocument } from "pdf-lib";
import { createClient } from "@supabase/supabase-js";
import type { Fecha, FilaRanking, Pronostico, ResultadoCorreccion } from "@/lib/tipos";

type Paso = "formulario" | "procesando" | "ranking";

/** En qué punto del camino está la subida. Las tres primeras las controla el navegador. */
type Fase = "creando" | "preparando" | "subiendo" | "encolando" | "worker";

interface FilaPartido {
  nombre: string;
  resultado: Pronostico | null;
}

interface Trabajo {
  id: string;
  estado: string;
  paginasTotales: number;
  paginasExtraidas: number;
  paginasRescatadas: number;
  boletasDetectadas: number;
  boletasGuardadas: number;
  mensaje: string | null;
  error: string | null;
  disparoModo: string | null;
  disparoDetalle: string | null;
  disparos: number;
}

const OPCIONES: { valor: Pronostico; texto: string }[] = [
  { valor: "1", texto: "LOCAL" },
  { valor: "X", texto: "EMPATE" },
  { valor: "2", texto: "VISITANTE" },
];

const MEDALLAS = ["🥇", "🥈", "🥉"];

function tamano(bytes: number): string {
  const mb = bytes / 1024 / 1024;
  return mb < 1 ? `${Math.round(bytes / 1024)} KB` : `${mb.toFixed(1)} MB`;
}

async function pedir<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { ...(init?.body ? { "Content-Type": "application/json" } : {}), ...init?.headers },
  });
  const texto = await res.text();
  const datos = texto ? JSON.parse(texto) : {};
  if (!res.ok) throw new Error(datos.error ?? `La petición falló (${res.status}).`);
  return datos as T;
}

/** Parte el PDF en trozos que entren bajo el límite de Storage. */
async function partirPdf(
  archivo: File,
  maxBytes: number,
  aviso: (hechas: number, total: number) => void,
): Promise<{ paginasTotales: number; partes: { indice: number; desde: number; hasta: number; blob: Blob }[] }> {
  const origen = await PDFDocument.load(new Uint8Array(await archivo.arrayBuffer()), {
    ignoreEncryption: true,
  });
  const total = origen.getPageCount();
  const partes: { indice: number; desde: number; hasta: number; blob: Blob }[] = [];

  let indice = 0;
  let desde = 0;
  for (; desde < total; ) {
    let lote = Math.min(200, total - desde);
    for (;;) {
      const nuevo = await PDFDocument.create();
      const copiadas = await nuevo.copyPages(
        origen,
        Array.from({ length: lote }, (_, i) => desde + i),
      );
      for (const p of copiadas) nuevo.addPage(p);
      const bytes = await nuevo.save();
      if (bytes.byteLength <= maxBytes || lote === 1) {
        partes.push({
          indice,
          desde: desde + 1,
          hasta: desde + lote,
          blob: new Blob([bytes as BlobPart], { type: "application/pdf" }),
        });
        aviso(desde + lote, total);
        indice += 1;
        desde += lote;
        break;
      }
      // El lote pesa demasiado (páginas con mucha imagen): se parte al medio.
      lote = Math.max(1, Math.floor(lote / 2));
    }
  }
  return { paginasTotales: total, partes };
}

export function Corrector() {
  const [paso, setPaso] = useState<Paso>("formulario");

  const [nombre, setNombre] = useState("");
  const [cantidad, setCantidad] = useState(10);
  const [partidos, setPartidos] = useState<FilaPartido[]>(() =>
    Array.from({ length: 10 }, () => ({ nombre: "", resultado: null })),
  );
  const [archivo, setArchivo] = useState<File | null>(null);
  const entradaArchivo = useRef<HTMLInputElement>(null);

  const [fase, setFase] = useState<Fase>("creando");
  const [local, setLocal] = useState({ hechas: 0, total: 0, detalle: "" });
  const [trabajo, setTrabajo] = useState<Trabajo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [correccion, setCorreccion] = useState<ResultadoCorreccion | null>(null);
  const [abierta, setAbierta] = useState<string | null>(null);

  function cambiarCantidad(n: number) {
    const valor = Math.max(1, Math.min(30, n));
    setCantidad(valor);
    setPartidos((prev) =>
      valor <= prev.length
        ? prev.slice(0, valor)
        : [...prev, ...Array.from({ length: valor - prev.length }, () => ({ nombre: "", resultado: null }))],
    );
  }

  function cambiarPartido(i: number, cambios: Partial<FilaPartido>) {
    setPartidos((prev) => prev.map((p, j) => (j === i ? { ...p, ...cambios } : p)));
  }

  async function seguirProgreso(fechaId: string, trabajoId: string) {
    setFase("worker");
    for (;;) {
      const { trabajo: t } = await pedir<{ trabajo: Trabajo }>(
        `/api/fechas/${fechaId}/subida/${trabajoId}`,
      );
      setTrabajo(t);
      if (t.estado === "completado") {
        const { correccion } = await pedir<{ correccion: ResultadoCorreccion }>(
          `/api/fechas/${fechaId}`,
        );
        setCorreccion(correccion);
        setPaso("ranking");
        return;
      }
      if (t.estado === "error") {
        throw new Error(t.error ?? "El procesamiento se detuvo.");
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  async function procesar(e: React.FormEvent) {
    e.preventDefault();
    if (!nombre.trim()) return setError("Poné un nombre o número para la fecha.");
    if (!archivo) return setError("Elegí el PDF con las boletas.");

    setError(null);
    setTrabajo(null);
    setPaso("procesando");
    setFase("creando");
    setLocal({ hechas: 0, total: 0, detalle: "" });

    try {
      const { fecha } = await pedir<{ fecha: Fecha }>("/api/fechas", {
        method: "POST",
        body: JSON.stringify({
          nombre: nombre.trim(),
          cantidadPartidos: cantidad,
          partidos: partidos.map((p) => ({ nombre: p.nombre.trim(), resultado: p.resultado })),
        }),
      });

      // Relee la fecha recién creada antes de tocar el PDF: si no está en la
      // base, el error sale acá y no a mitad del procesamiento.
      const config = await pedir<{
        maxChunkMb: number;
        supabaseUrl: string;
        supabaseAnonKey: string;
      }>(`/api/fechas/${fecha.id}/subida`);

      setFase("preparando");
      const { paginasTotales, partes } = await partirPdf(
        archivo,
        Math.round(config.maxChunkMb * 1024 * 1024),
        (hechas, total) => setLocal({ hechas, total, detalle: "" }),
      );

      const { trabajo: creado } = await pedir<{ trabajo: { id: string } }>(
        `/api/fechas/${fecha.id}/subida`,
        {
          method: "POST",
          body: JSON.stringify({
            nombreArchivo: archivo.name,
            bytesTotales: archivo.size,
            paginasTotales,
          }),
        },
      );

      const trabajoId = creado.id;
      const almacenamiento = createClient(config.supabaseUrl, config.supabaseAnonKey);
      const bytesTotales = partes.reduce((s, p) => s + p.blob.size, 0);
      let bytesSubidos = 0;

      setFase("subiendo");
      setLocal({ hechas: 0, total: bytesTotales, detalle: `0 de ${partes.length} partes` });

      for (const parte of partes) {
        for (let intento = 1; ; intento++) {
          try {
            const { bucket, path, token } = await pedir<{
              bucket: string;
              path: string;
              token: string;
            }>(`/api/fechas/${fecha.id}/subida/${trabajoId}/token`, {
              method: "POST",
              body: JSON.stringify({ indice: parte.indice }),
            });
            const { error: errSubida } = await almacenamiento.storage
              .from(bucket)
              .uploadToSignedUrl(path, token, parte.blob);
            if (errSubida) throw new Error(errSubida.message);

            await pedir(`/api/fechas/${fecha.id}/subida/${trabajoId}/chunk`, {
              method: "POST",
              body: JSON.stringify({
                indice: parte.indice,
                paginaDesde: parte.desde,
                paginaHasta: parte.hasta,
                storagePath: path,
                bytes: parte.blob.size,
              }),
            });
            break;
          } catch (e) {
            if (intento >= 3) throw e;
            await new Promise((r) => setTimeout(r, 1500 * intento));
          }
        }
        bytesSubidos += parte.blob.size;
        setLocal({
          hechas: bytesSubidos,
          total: bytesTotales,
          detalle: `${parte.indice + 1} de ${partes.length} partes · páginas ${parte.desde}-${parte.hasta}`,
        });
      }

      setFase("encolando");
      await pedir(`/api/fechas/${fecha.id}/subida/${trabajoId}/encolar`, { method: "POST" });
      await seguirProgreso(fecha.id, trabajoId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo procesar el PDF.");
      setPaso("formulario");
    }
  }

  function empezarDeNuevo() {
    setPaso("formulario");
    setCorreccion(null);
    setTrabajo(null);
    setError(null);
    setAbierta(null);
    setArchivo(null);
    setNombre("");
    if (entradaArchivo.current) entradaArchivo.current.value = "";
  }

  /* ------------------------------------------------------------------ */

  if (paso === "procesando") {
    return (
      <main className="pantalla">
        <Procesando fase={fase} local={local} trabajo={trabajo} />
      </main>
    );
  }

  if (paso === "ranking" && correccion) {
    const top = correccion.ranking.filter((r) => r.posicion <= 10);
    return (
      <main className="pantalla">
        <h1 className="titulo">🏆 TOP 10</h1>
        <p className="subtitulo">
          {correccion.fecha.nombre} · {correccion.resumen.boletas} boletas ·{" "}
          {correccion.resumen.partidosConResultado} de {correccion.fecha.cantidadPartidos} partidos
          con resultado
        </p>

        <ol className="ranking">
          {top.map((fila) => (
            <FilaTop
              key={fila.boletaId}
              fila={fila}
              abierta={abierta === fila.boletaId}
              alAbrir={() => setAbierta(abierta === fila.boletaId ? null : fila.boletaId)}
            />
          ))}
        </ol>

        {top.length === 0 && <p className="tenue">No se detectó ninguna boleta en el PDF.</p>}

        <button className="boton" onClick={empezarDeNuevo}>
          Nueva fecha
        </button>
      </main>
    );
  }

  return (
    <main className="pantalla">
      <h1 className="titulo">Nueva fecha</h1>

      <form onSubmit={procesar}>
        <div className="fila-datos">
          <label>
            <span>Nombre o número de fecha</span>
            <input
              className="campo"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Fecha 13"
            />
          </label>
          <label>
            <span>Cantidad de partidos</span>
            <input
              className="campo num"
              type="number"
              min={1}
              max={30}
              value={cantidad}
              onChange={(e) => cambiarCantidad(Number(e.target.value) || 1)}
            />
          </label>
        </div>

        <table className="partidos">
          <thead>
            <tr>
              <th className="col-num">#</th>
              <th>Partido</th>
              <th className="col-res">Resultado oficial</th>
            </tr>
          </thead>
          <tbody>
            {partidos.map((p, i) => (
              <tr key={i}>
                <td className="col-num num">{i + 1}</td>
                <td>
                  <input
                    className="campo"
                    value={p.nombre}
                    onChange={(e) => cambiarPartido(i, { nombre: e.target.value })}
                    placeholder={`Partido ${i + 1}`}
                    aria-label={`Partido ${i + 1}`}
                  />
                </td>
                <td>
                  <div className="opciones" role="group" aria-label={`Resultado del partido ${i + 1}`}>
                    {OPCIONES.map((o) => (
                      <button
                        key={o.valor}
                        type="button"
                        aria-pressed={p.resultado === o.valor}
                        className={p.resultado === o.valor ? "opcion activa" : "opcion"}
                        onClick={() =>
                          cambiarPartido(i, {
                            resultado: p.resultado === o.valor ? null : o.valor,
                          })
                        }
                      >
                        <b>{o.valor}</b> {o.texto}
                      </button>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div
          className={archivo ? "zona con-archivo" : "zona"}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files?.[0];
            if (f) setArchivo(f);
          }}
        >
          <p className="zona-titulo">
            {archivo ? archivo.name : "Arrastrá el PDF con las boletas o elegilo"}
          </p>
          <p className="tenue">
            {archivo ? tamano(archivo.size) : "Sin límite de tamaño"}
          </p>
          <input
            ref={entradaArchivo}
            type="file"
            accept="application/pdf,.pdf"
            hidden
            onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
          />
          <button type="button" className="boton-secundario" onClick={() => entradaArchivo.current?.click()}>
            Elegir archivo
          </button>
        </div>

        {error && <p className="error">{error}</p>}

        <button type="submit" className="boton" disabled={!archivo || !nombre.trim()}>
          PROCESAR BOLETAS
        </button>
      </form>
    </main>
  );
}

/* -------------------------------------------------------------------------- */
/*  Pantalla de progreso                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Traduce el estado real a lo que se ve. No hay porcentajes inventados: cada
 * número sale o del navegador (partes subidas) o de la fila del trabajo en la
 * base, que escribe el worker mientras lee el PDF.
 */
function Procesando({
  fase,
  local,
  trabajo,
}: {
  fase: Fase;
  local: { hechas: number; total: number; detalle: string };
  trabajo: Trabajo | null;
}) {
  let titulo = "Preparando";
  let porcentaje: number | null = null;
  const lineas: string[] = [];

  if (fase === "creando") {
    titulo = "Creando la fecha";
  } else if (fase === "preparando") {
    titulo = "Preparando el PDF";
    if (local.total > 0) {
      porcentaje = Math.round((local.hechas / local.total) * 100);
      lineas.push(`Página ${local.hechas} / ${local.total}`);
    }
  } else if (fase === "subiendo") {
    titulo = "Subiendo el PDF";
    if (local.total > 0) porcentaje = Math.round((local.hechas / local.total) * 100);
    if (local.detalle) lineas.push(local.detalle);
    lineas.push(`${tamano(local.hechas)} de ${tamano(local.total)}`);
  } else if (fase === "encolando" || !trabajo) {
    titulo = "Arrancando el worker";
  } else {
    const total = Math.max(1, trabajo.paginasTotales);
    switch (trabajo.estado) {
      case "pendiente":
        titulo = "Arrancando el worker";
        break;
      case "extrayendo":
        titulo = "Leyendo el PDF";
        porcentaje = Math.min(100, Math.round((trabajo.paginasExtraidas / total) * 100));
        lineas.push(`Página ${trabajo.paginasExtraidas} / ${trabajo.paginasTotales}`);
        break;
      case "analizando":
        titulo = "Detectando boletas";
        porcentaje = 100;
        lineas.push(`Páginas leídas: ${trabajo.paginasExtraidas} / ${trabajo.paginasTotales}`);
        break;
      case "guardando":
        titulo = "Calculando aciertos";
        lineas.push(`Boletas detectadas: ${trabajo.boletasDetectadas}`);
        lineas.push(`Boletas procesadas: ${trabajo.boletasGuardadas}`);
        porcentaje =
          trabajo.boletasDetectadas > 0
            ? Math.round((trabajo.boletasGuardadas / trabajo.boletasDetectadas) * 100)
            : null;
        break;
      default:
        titulo = "Procesando";
    }
    if (trabajo.paginasRescatadas > 0) {
      lineas.push(`Páginas leídas con OCR: ${trabajo.paginasRescatadas}`);
    }
  }

  const mensaje =
    trabajo?.mensaje ??
    (fase === "encolando" ? "Pidiendo el worker que va a leer el PDF..." : "");

  return (
    <>
      <h1 className="titulo">{titulo}</h1>
      <div className="tarjeta">
        <div
          className="barra"
          role="progressbar"
          aria-valuenow={porcentaje ?? undefined}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className={porcentaje === null ? "barra-relleno indefinido" : "barra-relleno"}
            style={porcentaje === null ? undefined : { width: `${porcentaje}%` }}
          />
        </div>
        <p className="porcentaje">{porcentaje === null ? "···" : `${porcentaje}%`}</p>
        <ul className="progreso">
          {lineas.map((l, i) => (
            <li key={i}>{l}</li>
          ))}
          {mensaje && <li className="tenue">{mensaje}</li>}
        </ul>
      </div>
    </>
  );
}

/* -------------------------------------------------------------------------- */

function FilaTop({
  fila,
  abierta,
  alAbrir,
}: {
  fila: FilaRanking;
  abierta: boolean;
  alAbrir: () => void;
}) {
  const medalla = MEDALLAS[fila.posicion - 1];
  return (
    <li className="puesto">
      <button className="puesto-cabecera" onClick={alAbrir} aria-expanded={abierta}>
        <span className="posicion">{medalla ?? fila.posicion}</span>
        <span className="datos">
          <strong>{fila.participante}</strong>
          <small className="tenue">
            {fila.numeroBoleta ? `Boleta #${fila.numeroBoleta}` : "Sin número de boleta"}
            {fila.paginas.length > 0 && ` · página ${fila.paginas.join(", ")}`}
            {fila.empatado && " · empatado"}
          </small>
        </span>
        <span className="puntaje">
          <strong className="num">
            {fila.aciertos}/{fila.partidosEvaluados}
          </strong>
          <small className="tenue num">{fila.porcentaje}%</small>
        </span>
      </button>

      {abierta && (
        <table className="detalle">
          <tbody>
            {fila.detalle.map((d) => (
              <tr key={d.partidoNumero}>
                <td className="num tenue">{d.partidoNumero}</td>
                <td>{d.nombre || `Partido ${d.partidoNumero}`}</td>
                <td className="num">Pronóstico: {d.opciones.join("/") || "—"}</td>
                <td className="num">Resultado: {d.resultado ?? "—"}</td>
                <td>
                  {d.estado === "acierto"
                    ? "✅"
                    : d.estado === "error"
                      ? "❌"
                      : d.estado === "sin_pronostico"
                        ? "—"
                        : "sin resultado"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </li>
  );
}
