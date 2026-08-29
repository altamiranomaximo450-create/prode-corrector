"use client";

/**
 * Subida de un PDF GRANDE: se parte en pedazos (chunks) con pdf-lib, en el
 * propio navegador, y cada pedazo se sube DIRECTO a Supabase Storage con una
 * URL firmada por el servidor. El PDF completo nunca pasa por una función de
 * Vercel: eso es lo que permite procesar archivos de cientos de MB con un
 * plan gratuito.
 *
 * El procesamiento en sí (leer el texto, detectar boletas) lo hace un worker
 * aparte (`npm run worker`), no esta página: acá sólo se sube el archivo y se
 * consulta el progreso con polling.
 */

import { useEffect, useRef, useState } from "react";
import { PDFDocument } from "pdf-lib";
import { createClient } from "@supabase/supabase-js";
import { pedir, useProde } from "./estado";
import { Iconos } from "./ui";

interface ChunkPlan {
  indice: number;
  paginaDesde: number;
  paginaHasta: number;
  blob: Blob;
}

interface TrabajoRemoto {
  id: string;
  fechaId: string;
  nombreArchivo: string;
  paginasTotales: number;
  estado: string;
  chunks: { indice: number; estado: string }[];
  paginasExtraidas: number;
  boletasDetectadas: number;
  mensaje: string | null;
  error: string | null;
}

const ESTADOS_TERMINALES = new Set(["completado", "error", "cancelado"]);

/** Parte el PDF en trozos que entren bajo el límite de Storage, ajustando el tamaño del lote si hace falta. */
async function dividirPdf(
  archivo: File,
  maxBytesPorChunk: number,
  onProgreso: (mensaje: string) => void,
): Promise<{ paginasTotales: number; chunks: ChunkPlan[] }> {
  const bytesOriginal = new Uint8Array(await archivo.arrayBuffer());
  const origen = await PDFDocument.load(bytesOriginal, { ignoreEncryption: true });
  const totalPaginas = origen.getPageCount();

  const chunks: ChunkPlan[] = [];
  let indice = 0;
  let desde = 0; // 0-based
  let tamanoLote = Math.max(1, Math.min(200, totalPaginas));

  while (desde < totalPaginas) {
    let lote = Math.min(tamanoLote, totalPaginas - desde);
    for (;;) {
      const indices = Array.from({ length: lote }, (_, i) => desde + i);
      const nuevo = await PDFDocument.create();
      const copiadas = await nuevo.copyPages(origen, indices);
      for (const p of copiadas) nuevo.addPage(p);
      const bytes = await nuevo.save();
      if (bytes.byteLength <= maxBytesPorChunk || lote === 1) {
        chunks.push({
          indice,
          paginaDesde: desde + 1,
          paginaHasta: desde + lote,
          blob: new Blob([bytes as BlobPart], { type: "application/pdf" }),
        });
        onProgreso(`Preparando el archivo: páginas ${desde + 1}-${desde + lote} de ${totalPaginas}...`);
        indice += 1;
        desde += lote;
        // Si este lote entró cómodo, el próximo puede volver a intentar el tamaño "normal".
        tamanoLote = Math.max(1, Math.min(200, totalPaginas - desde));
        break;
      }
      // El lote pesa demasiado (páginas con mucha imagen): se parte a la mitad y se reintenta.
      lote = Math.max(1, Math.floor(lote / 2));
    }
  }

  return { paginasTotales: totalPaginas, chunks };
}

export function SubidaGrandePdf({
  fechaId,
  maxPdfSincronoMb,
  onTerminado,
}: {
  fechaId: string;
  maxPdfSincronoMb: number;
  onTerminado: () => void;
}) {
  const { sistema, refrescarTodo } = useProde();
  const [archivo, setArchivo] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [trabajo, setTrabajo] = useState<TrabajoRemoto | null>(null);
  const entrada = useRef<HTMLInputElement>(null);
  const detenerPolling = useRef(false);

  const maxChunkMb = sistema?.maxChunkMb ?? 45;

  useEffect(() => {
    return () => {
      detenerPolling.current = true;
    };
  }, []);

  async function sondear(trabajoId: string) {
    while (!detenerPolling.current) {
      const { trabajo: t } = await pedir<{ trabajo: TrabajoRemoto }>(
        `/api/fechas/${fechaId}/subida/${trabajoId}`,
      );
      setTrabajo(t);
      if (ESTADOS_TERMINALES.has(t.estado)) {
        if (t.estado === "completado") await refrescarTodo();
        break;
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  async function subir() {
    if (!archivo) return;
    setEnviando(true);
    setError(null);
    setTrabajo(null);
    detenerPolling.current = false;

    try {
      setMensaje("Analizando el PDF en el navegador...");
      const maxBytesPorChunk = Math.round(maxChunkMb * 1024 * 1024);
      const { paginasTotales, chunks } = await dividirPdf(archivo, maxBytesPorChunk, setMensaje);

      setMensaje(`Iniciando la subida (${chunks.length} parte(s))...`);
      const inicio = await pedir<{
        trabajo: { id: string };
        bucket: string;
        supabaseUrl: string;
        supabaseAnonKey: string;
      }>(`/api/fechas/${fechaId}/subida`, {
        method: "POST",
        body: JSON.stringify({
          nombreArchivo: archivo.name,
          bytesTotales: archivo.size,
          paginasTotales,
        }),
      });

      const trabajoId = inicio.trabajo.id;
      const supabase = createClient(inicio.supabaseUrl, inicio.supabaseAnonKey);

      for (const chunk of chunks) {
        setMensaje(
          `Subiendo parte ${chunk.indice + 1} de ${chunks.length} (páginas ${chunk.paginaDesde}-${chunk.paginaHasta})...`,
        );
        let intentos = 0;
        for (;;) {
          try {
            const { bucket, path, token } = await pedir<{
              bucket: string;
              path: string;
              token: string;
            }>(`/api/fechas/${fechaId}/subida/${trabajoId}/token`, {
              method: "POST",
              body: JSON.stringify({ indice: chunk.indice }),
            });
            const { error: errSubida } = await supabase.storage
              .from(bucket)
              .uploadToSignedUrl(path, token, chunk.blob);
            if (errSubida) throw new Error(errSubida.message);

            await pedir(`/api/fechas/${fechaId}/subida/${trabajoId}/chunk`, {
              method: "POST",
              body: JSON.stringify({
                indice: chunk.indice,
                paginaDesde: chunk.paginaDesde,
                paginaHasta: chunk.paginaHasta,
                storagePath: path,
                bytes: chunk.blob.size,
              }),
            });
            break;
          } catch (e) {
            intentos += 1;
            if (intentos >= 3) throw e;
            await new Promise((r) => setTimeout(r, 1500 * intentos));
          }
        }
      }

      setMensaje("Subida completa. Encolando para procesar...");
      await pedir(`/api/fechas/${fechaId}/subida/${trabajoId}/encolar`, { method: "POST" });

      setMensaje(null);
      setArchivo(null);
      if (entrada.current) entrada.current.value = "";
      await sondear(trabajoId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo completar la subida.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="aviso-info">
        <Iconos.lupa className="h-5 w-5 shrink-0" />
        <p>
          Para PDFs de más de {maxPdfSincronoMb} MB. Se sube directo a Supabase Storage por
          partes (nunca pasa por Vercel) y lo procesa un worker aparte. Necesitás tenerlo corriendo
          (<code>npm run worker</code>) para que el trabajo avance; si lo apagás a mitad de camino,
          retoma solo desde donde quedó al volver a arrancarlo.
        </p>
      </div>

      <div
        className={`rounded-xl border-2 border-dashed p-6 text-center transition-colors ${
          archivo ? "border-acento-400 bg-acento-50/50" : "border-tinta-300 bg-tinta-50"
        }`}
      >
        <Iconos.subir className="mx-auto h-7 w-7 text-tinta-400" />
        <p className="mt-3 text-sm font-semibold text-tinta-800">
          {archivo ? archivo.name : "Elegí el PDF grande"}
        </p>
        <p className="mt-1 text-xs text-tinta-500">
          {archivo ? `${(archivo.size / 1024 / 1024).toFixed(1)} MB` : `Hasta el tope de Supabase`}
        </p>
        <input
          ref={entrada}
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
        />
        <button
          type="button"
          className="boton-secundario mt-4"
          onClick={() => entrada.current?.click()}
          disabled={enviando}
        >
          Elegir archivo
        </button>
      </div>

      {mensaje && (
        <div className="aviso-alerta">
          <span className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-amber-300 border-t-amber-700" />
          <p>{mensaje}</p>
        </div>
      )}

      {error && (
        <div className="aviso-error">
          <Iconos.alerta className="h-5 w-5 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {trabajo && (
        <div className="tarjeta overflow-hidden">
          <div className="tarjeta-cabecera">
            <h3 className="titulo-seccion">
              {trabajo.estado === "completado"
                ? "Procesamiento terminado"
                : trabajo.estado === "error"
                  ? "El procesamiento se detuvo"
                  : "Procesando en el worker..."}
            </h3>
            <span className="insignia-neutra">{trabajo.estado}</span>
          </div>
          <div className="space-y-3 p-5">
            <div
              className="h-2 w-full overflow-hidden rounded-full bg-tinta-200"
              role="progressbar"
              aria-valuenow={trabajo.paginasExtraidas}
              aria-valuemin={0}
              aria-valuemax={trabajo.paginasTotales}
            >
              <div
                className="h-full rounded-full bg-acento-600 transition-[width] duration-300"
                style={{
                  width: `${Math.min(100, Math.round((trabajo.paginasExtraidas / Math.max(1, trabajo.paginasTotales)) * 100))}%`,
                }}
              />
            </div>
            <p className="text-sm text-tinta-700">
              {trabajo.mensaje ??
                `Página ${trabajo.paginasExtraidas} de ${trabajo.paginasTotales}`}
            </p>
            {trabajo.estado === "completado" && (
              <p className="text-sm font-semibold text-emerald-700">
                {trabajo.boletasDetectadas} boletas procesadas.{" "}
                <button className="underline" onClick={onTerminado}>
                  Ver boletas
                </button>
              </p>
            )}
            {trabajo.error && <p className="aviso-error">{trabajo.error}</p>}
          </div>
        </div>
      )}

      <button className="boton-primario" onClick={subir} disabled={!archivo || enviando}>
        {enviando ? "Subiendo..." : "Subir y procesar"}
      </button>
    </div>
  );
}
