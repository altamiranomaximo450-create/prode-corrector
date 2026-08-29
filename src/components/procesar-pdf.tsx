"use client";

import { useRef, useState } from "react";
import { useProde } from "./estado";
import { Iconos } from "./ui";

export interface EventoStream {
  etapa: string;
  mensaje?: string;
  porcentaje?: number;
  detalle?: string;
  boletas?: number;
  enRevision?: number;
  problemasGlobales?: { mensaje: string }[];
}

export const ETAPAS: { clave: string; texto: string }[] = [
  { clave: "leyendo", texto: "Analizando el PDF" },
  { clave: "extrayendo", texto: "Extrayendo el texto" },
  { clave: "detectando", texto: "Detectando boletas" },
  { clave: "participantes", texto: "Identificando participantes" },
  { clave: "pronosticos", texto: "Extrayendo pronósticos" },
  { clave: "validando", texto: "Validando la información" },
  { clave: "duplicados", texto: "Buscando duplicados" },
  { clave: "listo", texto: "Calculando el ranking" },
];

/**
 * Sube el PDF y consume el flujo de Server-Sent Events con el progreso real
 * del servidor. Devuelve el evento final con el resumen del procesamiento.
 */
export async function procesarPdfStream(
  fechaId: string,
  pdf: File,
  onEvento: (evento: EventoStream) => void,
): Promise<EventoStream> {
  const formulario = new FormData();
  formulario.append("archivo", pdf);

  const res = await fetch(`/api/fechas/${fechaId}/procesar`, {
    method: "POST",
    body: formulario,
  });

  if (!res.ok || !res.body) {
    const datos = await res.json().catch(() => ({}));
    throw new Error(datos.error ?? `No se pudo procesar el PDF (${res.status}).`);
  }

  const lector = res.body.getReader();
  const decodificador = new TextDecoder();
  let resto = "";

  for (;;) {
    const { done, value } = await lector.read();
    if (done) break;
    resto += decodificador.decode(value, { stream: true });
    const bloques = resto.split("\n\n");
    resto = bloques.pop() ?? "";
    for (const bloque of bloques) {
      const linea = bloque.split("\n").find((l) => l.startsWith("data:"));
      if (!linea) continue;
      const evento = JSON.parse(linea.slice(5).trim()) as EventoStream;
      if (evento.etapa === "error") {
        throw new Error(evento.mensaje ?? "Error al procesar el PDF.");
      }
      onEvento(evento);
      if (evento.etapa === "resultado") return evento;
    }
  }
  throw new Error("La conexión se cortó antes de terminar el procesamiento.");
}

export function ZonaArchivo({
  archivo,
  onArchivo,
  deshabilitado,
  maxMb,
}: {
  archivo: File | null;
  onArchivo: (f: File | null) => void;
  deshabilitado?: boolean;
  maxMb: number;
}) {
  const entrada = useRef<HTMLInputElement>(null);
  return (
    <>
      <div
        className={`rounded-xl border-2 border-dashed p-6 text-center transition-colors ${
          archivo ? "border-acento-400 bg-acento-50/50" : "border-tinta-300 bg-tinta-50"
        }`}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          if (deshabilitado) return;
          const f = e.dataTransfer.files?.[0];
          if (f) onArchivo(f);
        }}
      >
        <Iconos.subir className="mx-auto h-7 w-7 text-tinta-400" />
        <p className="mt-3 text-sm font-semibold text-tinta-800">
          {archivo ? archivo.name : "Arrastrá el PDF acá o elegilo desde tu computadora"}
        </p>
        <p className="mt-1 text-xs text-tinta-500">
          {archivo ? `${(archivo.size / 1024 / 1024).toFixed(2)} MB` : `Sólo PDF, hasta ${maxMb} MB`}
        </p>
        <input
          ref={entrada}
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          onChange={(e) => onArchivo(e.target.files?.[0] ?? null)}
        />
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <button
            type="button"
            className="boton-secundario"
            onClick={() => entrada.current?.click()}
            disabled={deshabilitado}
          >
            Elegir archivo
          </button>
          {archivo && (
            <button
              type="button"
              className="boton-sutil"
              onClick={() => {
                onArchivo(null);
                if (entrada.current) entrada.current.value = "";
              }}
              disabled={deshabilitado}
            >
              Quitar
            </button>
          )}
        </div>
      </div>
      <p className="ayuda">
        El PDF tiene que tener texto (el que exporta el programa de boletas). Si es un escaneo o
        una foto, el sistema lo detecta y avisa en lugar de adivinar: esas boletas se pueden
        cargar a mano.
      </p>
    </>
  );
}

export function PanelProgreso({
  progreso,
  etapasHechas,
}: {
  progreso: EventoStream | null;
  etapasHechas: string[];
}) {
  return (
    <section className="tarjeta overflow-hidden">
      <div className="tarjeta-cabecera">
        <h2 className="titulo-seccion">Procesando boletas…</h2>
        <span className="num text-sm font-bold text-acento-700">
          {progreso?.porcentaje ?? 0}%
        </span>
      </div>
      <div className="p-5">
        <div
          className="h-2 w-full overflow-hidden rounded-full bg-tinta-200"
          role="progressbar"
          aria-valuenow={progreso?.porcentaje ?? 0}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="h-full rounded-full bg-acento-600 transition-[width] duration-300"
            style={{ width: `${progreso?.porcentaje ?? 0}%` }}
          />
        </div>
        {progreso?.detalle && <p className="mt-2 text-xs text-tinta-500">{progreso.detalle}</p>}
        <ul className="mt-4 space-y-1.5">
          {ETAPAS.map((etapa) => {
            const hecha = etapasHechas.includes(etapa.clave) && progreso?.etapa !== etapa.clave;
            const actual = progreso?.etapa === etapa.clave;
            return (
              <li
                key={etapa.clave}
                className={`flex items-center gap-2.5 text-sm ${
                  actual
                    ? "font-semibold text-acento-700"
                    : hecha
                      ? "text-emerald-700"
                      : "text-tinta-400"
                }`}
              >
                {hecha ? (
                  <Iconos.ok className="h-4 w-4" />
                ) : actual ? (
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-acento-200 border-t-acento-600" />
                ) : (
                  <span className="h-3.5 w-3.5 rounded-full border-2 border-tinta-200" />
                )}
                {etapa.texto}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

/** Widget completo para procesar un PDF dentro de una fecha ya creada. */
export function SubirPdf({ fechaId, esDemo }: { fechaId: string; esDemo: boolean }) {
  const { sistema, refrescarTodo } = useProde();
  const [archivo, setArchivo] = useState<File | null>(null);
  const [procesando, setProcesando] = useState(false);
  const [progreso, setProgreso] = useState<EventoStream | null>(null);
  const [etapasHechas, setEtapasHechas] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [resumen, setResumen] = useState<EventoStream | null>(null);

  const maxMb = sistema?.maxPdfMb ?? 25;
  const habilitado = sistema?.procesamiento !== false && !esDemo;

  async function ejecutar() {
    if (!archivo) return;
    if (
      !window.confirm(
        "Al procesar el PDF se reemplazan TODAS las boletas de esta fecha, incluidas las correcciones manuales. ¿Continuar?",
      )
    ) {
      return;
    }
    setProcesando(true);
    setError(null);
    setResumen(null);
    setEtapasHechas([]);
    setProgreso(null);
    try {
      const final = await procesarPdfStream(fechaId, archivo, (evento) => {
        setProgreso(evento);
        setEtapasHechas((prev) =>
          prev.includes(evento.etapa) ? prev : [...prev, evento.etapa],
        );
      });
      setResumen(final);
      setArchivo(null);
      await refrescarTodo();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo procesar el PDF.");
    } finally {
      setProcesando(false);
    }
  }

  return (
    <div className="space-y-4">
      {esDemo && (
        <div className="aviso-demo">
          <Iconos.alerta className="h-5 w-5 shrink-0" />
          <p>
            Esta es una fecha de demostración y no admite cargar un PDF. Creá una fecha nueva
            para procesar boletas reales.
          </p>
        </div>
      )}
      {sistema?.procesamiento === false && (
        <div className="aviso-alerta">
          <Iconos.alerta className="h-5 w-5 shrink-0" />
          <p>El procesamiento de PDF está desactivado en este entorno.</p>
        </div>
      )}

      <ZonaArchivo
        archivo={archivo}
        onArchivo={setArchivo}
        deshabilitado={procesando || !habilitado}
        maxMb={maxMb}
      />

      {error && (
        <div className="aviso-error">
          <Iconos.alerta className="h-5 w-5 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {resumen && (
        <div className="aviso-info">
          <Iconos.ok className="h-5 w-5 shrink-0" />
          <p>
            Se procesaron <strong>{resumen.boletas}</strong> boletas.{" "}
            {resumen.enRevision
              ? `${resumen.enRevision} requieren revisión manual.`
              : "Ninguna requiere revisión."}
          </p>
        </div>
      )}

      {procesando && <PanelProgreso progreso={progreso} etapasHechas={etapasHechas} />}

      <button
        className="boton-primario"
        onClick={ejecutar}
        disabled={!archivo || procesando || !habilitado}
      >
        {procesando ? "Procesando…" : "Procesar boletas"}
      </button>
    </div>
  );
}
