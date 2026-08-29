"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { pedir, useProde } from "@/components/estado";
import {
  PanelProgreso,
  ZonaArchivo,
  procesarPdfStream,
  type EventoStream,
} from "@/components/procesar-pdf";
import { SelectorResultado } from "@/components/selector-resultado";
import { Encabezado } from "@/components/shell";
import { Iconos } from "@/components/ui";
import type { Fecha, Pronostico } from "@/lib/tipos";

interface FilaPartido {
  local: string;
  visitante: string;
  resultado: Pronostico | null;
}

function filaVacia(): FilaPartido {
  return { local: "", visitante: "", resultado: null };
}

export default function PaginaNuevaFecha() {
  const router = useRouter();
  const { sistema, refrescarTodo, seleccionar } = useProde();

  const [nombre, setNombre] = useState("");
  const [cantidad, setCantidad] = useState(10);
  const [partidos, setPartidos] = useState<FilaPartido[]>(() =>
    Array.from({ length: 10 }, filaVacia),
  );
  const [archivo, setArchivo] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progreso, setProgreso] = useState<EventoStream | null>(null);
  const [etapasHechas, setEtapasHechas] = useState<string[]>([]);

  const maxPartidos = sistema?.maxPartidos ?? 30;
  const maxMb = sistema?.maxPdfMb ?? 25;

  useEffect(() => {
    setPartidos((prev) => {
      if (cantidad === prev.length) return prev;
      if (cantidad < prev.length) return prev.slice(0, cantidad);
      return [...prev, ...Array.from({ length: cantidad - prev.length }, filaVacia)];
    });
  }, [cantidad]);

  function actualizarPartido(indice: number, cambios: Partial<FilaPartido>) {
    setPartidos((prev) => prev.map((p, i) => (i === indice ? { ...p, ...cambios } : p)));
  }

  function validar(): string | null {
    if (!nombre.trim()) return "Poné un nombre o número para la fecha.";
    if (cantidad < 1 || cantidad > maxPartidos)
      return `La cantidad de partidos debe estar entre 1 y ${maxPartidos}.`;
    for (let i = 0; i < partidos.length; i++) {
      if (!partidos[i].local.trim() || !partidos[i].visitante.trim()) {
        return `Faltan los equipos del partido ${i + 1}.`;
      }
    }
    if (archivo && archivo.size > maxMb * 1024 * 1024) {
      return `El PDF pesa ${(archivo.size / 1024 / 1024).toFixed(1)} MB y el máximo acá es ${maxMb} MB.`;
    }
    return null;
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    const problema = validar();
    if (problema) {
      setError(problema);
      return;
    }

    setError(null);
    setEnviando(true);
    setEtapasHechas([]);
    setProgreso(null);

    let fechaId: string | null = null;
    try {
      const { fecha } = await pedir<{ fecha: Fecha }>("/api/fechas", {
        method: "POST",
        body: JSON.stringify({
          nombre: nombre.trim(),
          cantidadPartidos: cantidad,
          partidos: partidos.map((p) => ({
            local: p.local.trim(),
            visitante: p.visitante.trim(),
            resultado: p.resultado,
          })),
          config: { desempate: "ninguna" },
        }),
      });
      fechaId = fecha.id;

      if (archivo) {
        await procesarPdfStream(fecha.id, archivo, (evento) => {
          setProgreso(evento);
          setEtapasHechas((prev) =>
            prev.includes(evento.etapa) ? prev : [...prev, evento.etapa],
          );
        });
      }

      seleccionar(fecha.id);
      await refrescarTodo();
      router.push(archivo ? "/boletas" : "/resultados");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo crear la fecha.");
      // Si el PDF falló, la fecha ya quedó creada: se selecciona para que el
      // administrador pueda reintentar la carga sin volver a tipear todo.
      if (fechaId) {
        seleccionar(fechaId);
        await refrescarTodo();
      }
      setEnviando(false);
    }
  }

  const procesando = enviando && archivo !== null;

  return (
    <>
      <Encabezado
        titulo="Nueva fecha"
        descripcion="Cargá los partidos de la fecha y, si ya lo tenés, el PDF con las boletas. Los resultados oficiales se pueden cargar ahora o después."
      />

      <form onSubmit={enviar} className="space-y-5">
        <section className="tarjeta">
          <div className="tarjeta-cabecera">
            <h2 className="titulo-seccion">1 · Datos de la fecha</h2>
          </div>
          <div className="grid gap-4 p-5 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <label className="etiqueta" htmlFor="nombre">
                Nombre o número de la fecha
              </label>
              <input
                id="nombre"
                className="campo"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Ej.: Fecha 13 — Torneo Apertura"
                disabled={enviando}
              />
            </div>
            <div>
              <label className="etiqueta" htmlFor="cantidad">
                Cantidad de partidos
              </label>
              <input
                id="cantidad"
                type="number"
                min={1}
                max={maxPartidos}
                className="campo num"
                value={cantidad}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (Number.isFinite(n)) setCantidad(Math.max(1, Math.min(maxPartidos, n)));
                }}
                disabled={enviando}
              />
              <p className="ayuda">
                Tiene que coincidir con la cantidad de partidos de las boletas.
              </p>
            </div>
          </div>
        </section>

        <section className="tarjeta">
          <div className="tarjeta-cabecera">
            <h2 className="titulo-seccion">2 · Partidos y resultados oficiales</h2>
            <span className="insignia-neutra">1 = LOCAL · X = EMPATE · 2 = VISITANTE</span>
          </div>
          <div className="divide-y divide-tinta-100">
            {partidos.map((p, i) => (
              <div
                key={i}
                className="grid items-center gap-3 px-5 py-3 lg:grid-cols-[2rem_1fr_1fr_auto]"
              >
                <span className="num text-sm font-semibold text-tinta-400">{i + 1}</span>
                <input
                  className="campo"
                  value={p.local}
                  onChange={(e) => actualizarPartido(i, { local: e.target.value })}
                  placeholder={`Local del partido ${i + 1}`}
                  aria-label={`Equipo local del partido ${i + 1}`}
                  disabled={enviando}
                />
                <input
                  className="campo"
                  value={p.visitante}
                  onChange={(e) => actualizarPartido(i, { visitante: e.target.value })}
                  placeholder={`Visitante del partido ${i + 1}`}
                  aria-label={`Equipo visitante del partido ${i + 1}`}
                  disabled={enviando}
                />
                <SelectorResultado
                  valor={p.resultado}
                  onCambio={(v) => actualizarPartido(i, { resultado: v })}
                  nombreGrupo={`Resultado del partido ${i + 1}`}
                />
              </div>
            ))}
          </div>
          <p className="border-t border-tinta-200 px-5 py-3 text-xs text-tinta-500">
            Los resultados son opcionales acá: podés cargarlos más tarde desde la sección
            Resultados. Los partidos sin resultado no se computan para nadie.
          </p>
        </section>

        <section className="tarjeta">
          <div className="tarjeta-cabecera">
            <h2 className="titulo-seccion">3 · PDF con las boletas</h2>
            {sistema?.procesamiento === false && (
              <span className="insignia-error">Procesamiento desactivado</span>
            )}
          </div>
          <div className="p-5">
            <ZonaArchivo
              archivo={archivo}
              onArchivo={setArchivo}
              deshabilitado={enviando || sistema?.procesamiento === false}
              maxMb={maxMb}
            />
          </div>
        </section>

        {error && (
          <div className="aviso-error">
            <Iconos.alerta className="h-5 w-5 shrink-0" />
            <p>{error}</p>
          </div>
        )}

        {procesando && <PanelProgreso progreso={progreso} etapasHechas={etapasHechas} />}

        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" className="boton-primario" disabled={enviando}>
            {enviando
              ? archivo
                ? "Procesando…"
                : "Creando…"
              : archivo
                ? "Procesar boletas"
                : "Crear fecha"}
          </button>
          <p className="text-xs text-tinta-500">
            {archivo
              ? "Se crea la fecha y se procesa el PDF en un solo paso."
              : "Podés crear la fecha ahora y subir el PDF después."}
          </p>
        </div>
      </form>
    </>
  );
}
