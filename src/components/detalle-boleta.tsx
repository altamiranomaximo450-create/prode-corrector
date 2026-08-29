"use client";

import { useEffect, useMemo, useState } from "react";
import { useProde } from "./estado";
import { Iconos, InsigniaEstado, MarcaPronostico, Modal, formatearFechaHora } from "./ui";
import type { Boleta, FilaCorreccion, Pronostico } from "@/lib/tipos";

const OPCIONES: (Pronostico | "")[] = ["1", "X", "2", ""];

const ETIQUETA_ESTADO: Record<string, string> = {
  acierto: "Acierto",
  error: "Error",
  sin_pronostico: "Sin pronóstico legible",
  sin_resultado: "Sin resultado oficial",
};

/**
 * Detalle completo de una boleta: por qué obtuvo el puntaje que obtuvo.
 *
 * Muestra, para cada partido, el pronóstico leído, el resultado oficial, si
 * acertó, y el texto exacto del PDF del que se dedujo la lectura. Ese último
 * dato es el que permite auditar: nunca hay un número sin su origen.
 */
export function DetalleBoleta({
  fila,
  boleta,
  onCerrar,
}: {
  fila: FilaCorreccion;
  boleta: Boleta | undefined;
  onCerrar: () => void;
}) {
  const { correccion, editarBoleta, eliminarBoleta } = useProde();
  const partidos = correccion?.fecha.partidos ?? [];

  const [editando, setEditando] = useState(false);
  const [participante, setParticipante] = useState(fila.participante ?? "");
  const [numero, setNumero] = useState(fila.numeroBoleta ?? "");
  const [valores, setValores] = useState<(Pronostico | "")[]>(
    partidos.map((p) => fila.detalle.find((d) => d.partidoNumero === p.numero)?.pronostico ?? ""),
  );
  const [guardando, setGuardando] = useState(false);
  const [errorGuardar, setErrorGuardar] = useState<string | null>(null);
  const [verCrudo, setVerCrudo] = useState(false);

  useEffect(() => {
    setParticipante(fila.participante ?? "");
    setNumero(fila.numeroBoleta ?? "");
    setValores(
      partidos.map(
        (p) => fila.detalle.find((d) => d.partidoNumero === p.numero)?.pronostico ?? "",
      ),
    );
    setEditando(false);
    setErrorGuardar(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fila.boletaId]);

  const errores = useMemo(
    () => fila.problemas.filter((p) => p.severidad === "error"),
    [fila.problemas],
  );
  const avisos = useMemo(
    () => fila.problemas.filter((p) => p.severidad === "aviso"),
    [fila.problemas],
  );

  async function guardar(extra: Record<string, unknown> = {}) {
    setGuardando(true);
    setErrorGuardar(null);
    try {
      await editarBoleta(fila.boletaId, {
        participante: participante.trim() === "" ? null : participante.trim(),
        numeroBoleta: numero.trim() === "" ? null : numero.trim(),
        pronosticos: valores.map((v) => (v === "" ? null : v)),
        ...extra,
      });
      setEditando(false);
    } catch (e) {
      setErrorGuardar(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setGuardando(false);
    }
  }

  async function borrar() {
    if (
      !window.confirm(
        `¿Eliminar definitivamente la boleta de ${fila.participante ?? "(sin nombre)"}? Esta acción no se puede deshacer.`,
      )
    ) {
      return;
    }
    setGuardando(true);
    try {
      await eliminarBoleta(fila.boletaId);
      onCerrar();
    } catch (e) {
      setErrorGuardar(e instanceof Error ? e.message : "No se pudo eliminar.");
      setGuardando(false);
    }
  }

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo={fila.participante ?? "Boleta sin nombre"}
      descripcion={`Boleta ${fila.numeroBoleta ? `#${fila.numeroBoleta}` : "sin número"} · ${
        fila.paginas.length ? `página(s) ${fila.paginas.join(", ")} del PDF` : "carga manual"
      }`}
      ancho="max-w-4xl"
    >
      <div className="space-y-5 p-5">
        {/* Resumen numérico */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
            <p className="text-[11px] font-semibold tracking-wide text-emerald-700 uppercase">
              Aciertos
            </p>
            <p className="num text-2xl font-bold text-emerald-800">{fila.aciertos}</p>
          </div>
          <div className="rounded-lg border border-red-200 bg-red-50 p-3">
            <p className="text-[11px] font-semibold tracking-wide text-red-700 uppercase">
              Errores
            </p>
            <p className="num text-2xl font-bold text-red-800">{fila.errores}</p>
          </div>
          <div className="rounded-lg border border-tinta-200 bg-tinta-50 p-3">
            <p className="text-[11px] font-semibold tracking-wide text-tinta-600 uppercase">
              Porcentaje
            </p>
            <p className="num text-2xl font-bold text-tinta-900">{fila.porcentaje}%</p>
          </div>
          <div className="rounded-lg border border-tinta-200 bg-tinta-50 p-3">
            <p className="text-[11px] font-semibold tracking-wide text-tinta-600 uppercase">
              Estado
            </p>
            <div className="mt-1.5">
              <InsigniaEstado estado={fila.estado} />
            </div>
          </div>
        </div>

        {/* Explicación auditable */}
        <div className="aviso-info">
          <Iconos.lupa className="h-5 w-5 shrink-0" />
          <p>{fila.explicacion}</p>
        </div>

        {errores.length > 0 && (
          <div className="space-y-2">
            {errores.map((p, i) => (
              <div key={i} className="aviso-error">
                <Iconos.alerta className="h-5 w-5 shrink-0" />
                <div>
                  <p className="font-semibold">{p.mensaje}</p>
                  <p className="mt-1 text-xs opacity-80">
                    Código {p.codigo}
                    {p.pagina ? ` · página ${p.pagina} del PDF` : ""}
                  </p>
                  {p.textoProblematico && (
                    <p className="mt-1.5 rounded bg-white/70 px-2 py-1 font-mono text-[11px] break-all">
                      {p.textoProblematico}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {avisos.length > 0 && (
          <div className="space-y-2">
            {avisos.map((p, i) => (
              <div key={i} className="aviso-alerta">
                <Iconos.alerta className="h-5 w-5 shrink-0" />
                <div>
                  <p>{p.mensaje}</p>
                  <p className="mt-1 text-xs opacity-80">Código {p.codigo}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Identificación */}
        {editando && (
          <div className="grid gap-4 rounded-lg border border-acento-200 bg-acento-50/50 p-4 sm:grid-cols-2">
            <div>
              <label className="etiqueta" htmlFor="det-part">
                Participante
              </label>
              <input
                id="det-part"
                className="campo"
                value={participante}
                onChange={(e) => setParticipante(e.target.value)}
                placeholder="Nombre y apellido"
              />
            </div>
            <div>
              <label className="etiqueta" htmlFor="det-num">
                Número de boleta
              </label>
              <input
                id="det-num"
                className="campo"
                value={numero}
                onChange={(e) => setNumero(e.target.value)}
                placeholder="Ej.: 184"
              />
            </div>
          </div>
        )}

        {/* Tabla partido a partido */}
        <div className="overflow-x-auto rounded-lg border border-tinta-200">
          <table className="tabla min-w-[640px]">
            <thead>
              <tr>
                <th className="w-12">#</th>
                <th>Partido</th>
                <th className="w-28 text-center">Pronóstico</th>
                <th className="w-24 text-center">Resultado</th>
                <th className="w-40">Estado</th>
              </tr>
            </thead>
            <tbody>
              {fila.detalle.map((d, i) => {
                const tono =
                  d.estado === "acierto"
                    ? "acierto"
                    : d.estado === "error"
                      ? "error"
                      : "vacio";
                return (
                  <tr key={d.partidoNumero} className={d.estado === "acierto" ? "bg-emerald-50/40" : ""}>
                    <td className="num text-tinta-500">{d.partidoNumero}</td>
                    <td>
                      <p className="font-medium text-tinta-900">
                        {d.local} <span className="text-tinta-400">vs</span> {d.visitante}
                      </p>
                      {d.evidencia && (
                        <p
                          className="mt-0.5 truncate font-mono text-[11px] text-tinta-400"
                          title={d.evidencia}
                        >
                          {d.origen === "manual" ? "✎ " : ""}
                          {d.evidencia}
                        </p>
                      )}
                    </td>
                    <td className="text-center">
                      {editando ? (
                        <select
                          className="campo px-2 py-1.5 text-center"
                          value={valores[i] ?? ""}
                          onChange={(e) => {
                            const copia = [...valores];
                            copia[i] = e.target.value as Pronostico | "";
                            setValores(copia);
                          }}
                        >
                          {OPCIONES.map((o) => (
                            <option key={o || "vacio"} value={o}>
                              {o === "" ? "— sin dato —" : o}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <MarcaPronostico valor={d.pronostico} tono={tono} />
                      )}
                    </td>
                    <td className="text-center">
                      <MarcaPronostico valor={d.resultado} tono="neutro" />
                    </td>
                    <td>
                      <span
                        className={
                          d.estado === "acierto"
                            ? "insignia-ok"
                            : d.estado === "error"
                              ? "insignia-error"
                              : "insignia-neutra"
                        }
                      >
                        {d.estado === "acierto" ? "✅" : d.estado === "error" ? "❌" : "—"}
                        {ETIQUETA_ESTADO[d.estado]}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Texto crudo del PDF */}
        {boleta && (
          <div>
            <button
              className="boton-sutil boton-chico"
              onClick={() => setVerCrudo((v) => !v)}
            >
              <Iconos.ojo className="h-4 w-4" />
              {verCrudo ? "Ocultar" : "Ver"} el texto tal como salió del PDF
            </button>
            {verCrudo && (
              <pre className="mt-2 max-h-72 overflow-auto rounded-lg border border-tinta-200 bg-tinta-950 p-4 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-tinta-200">
                {boleta.textoCrudo}
              </pre>
            )}
            <p className="ayuda">
              Detectada con la estrategia <strong>{boleta.metodoDeteccion}</strong> ·{" "}
              {boleta.origen === "pdf"
                ? "leída del PDF"
                : boleta.origen === "manual"
                  ? "cargada a mano"
                  : "dato de demostración"}
              {boleta.editadaManualmente ? " · editada a mano" : ""} ·{" "}
              {formatearFechaHora(boleta.creadaEn)}
            </p>
          </div>
        )}

        {errorGuardar && <p className="aviso-error">{errorGuardar}</p>}

        {/* Acciones */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-tinta-200 pt-4">
          <div className="flex flex-wrap gap-2">
            {editando ? (
              <>
                <button
                  className="boton-primario"
                  onClick={() => guardar()}
                  disabled={guardando}
                >
                  {guardando ? "Guardando…" : "Guardar cambios"}
                </button>
                <button
                  className="boton-secundario"
                  onClick={() => setEditando(false)}
                  disabled={guardando}
                >
                  Cancelar
                </button>
              </>
            ) : (
              <button className="boton-secundario" onClick={() => setEditando(true)}>
                Corregir a mano
              </button>
            )}

            {fila.estado === "revision" && (
              <button
                className="boton-primario"
                onClick={() => guardar({ resolver: true })}
                disabled={guardando}
                title="La boleta pasa a contar en el ranking. Los problemas quedan registrados."
              >
                <Iconos.ok className="h-4 w-4" />
                Dar por revisada
              </button>
            )}
            {fila.estado === "resuelta_manual" && (
              <button
                className="boton-secundario"
                onClick={() => guardar({ resolver: false })}
                disabled={guardando}
              >
                Reabrir revisión
              </button>
            )}
          </div>

          <button className="boton-peligro boton-chico" onClick={borrar} disabled={guardando}>
            <Iconos.basura className="h-4 w-4" />
            Eliminar boleta
          </button>
        </div>
      </div>
    </Modal>
  );
}
