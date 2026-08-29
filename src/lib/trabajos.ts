/**
 * Trabajos de procesamiento de PDF.
 *
 * Un "trabajo" es la subida y el procesamiento de UN PDF. El navegador parte el
 * archivo en partes ("chunks") y las sube DIRECTO a Supabase Storage con una
 * URL firmada: los bytes del PDF no pasan nunca por una función de Vercel, que
 * es lo que permite archivos de 250 MB o más. Un worker aparte los procesa de a
 * una parte por vez, guardando progreso después de cada una para poder retomar.
 */

import { randomUUID } from "node:crypto";
import { BUCKET_PDFS, supabase } from "./almacen";
import type { PaginaExtraida } from "./pdf/extraer";

export type EstadoChunk = "subido" | "extraido" | "error";

export interface ChunkTrabajo {
  indice: number;
  paginaDesde: number;
  paginaHasta: number;
  storagePath: string;
  bytes: number;
  estado: EstadoChunk;
  error?: string;
}

export type EstadoTrabajo =
  | "subiendo"
  | "pendiente"
  | "extrayendo"
  | "analizando"
  | "completado"
  | "error";

export interface Trabajo {
  id: string;
  fechaId: string;
  nombreArchivo: string;
  bytesTotales: number;
  paginasTotales: number;
  estado: EstadoTrabajo;
  chunks: ChunkTrabajo[];
  paginasExtraidas: number;
  boletasDetectadas: number;
  mensaje: string | null;
  error: string | null;
  creadoEn: string;
  actualizadoEn: string;
}

interface FilaTrabajo {
  id: string;
  fecha_id: string;
  nombre_archivo: string;
  bytes_totales: number;
  paginas_totales: number;
  estado: EstadoTrabajo;
  chunks: ChunkTrabajo[];
  paginas_extraidas: number;
  boletas_detectadas: number;
  mensaje: string | null;
  error: string | null;
  creado_en: string;
  actualizado_en: string;
}

const SELECT =
  "id,fecha_id,nombre_archivo,bytes_totales,paginas_totales,estado,chunks,paginas_extraidas,boletas_detectadas,mensaje,error,creado_en,actualizado_en";

function aTrabajo(f: FilaTrabajo): Trabajo {
  return {
    id: f.id,
    fechaId: f.fecha_id,
    nombreArchivo: f.nombre_archivo,
    bytesTotales: f.bytes_totales,
    paginasTotales: f.paginas_totales,
    estado: f.estado,
    chunks: f.chunks ?? [],
    paginasExtraidas: f.paginas_extraidas,
    boletasDetectadas: f.boletas_detectadas,
    mensaje: f.mensaje,
    error: f.error,
    creadoEn: f.creado_en,
    actualizadoEn: f.actualizado_en,
  };
}

export async function crearTrabajo(datos: {
  fechaId: string;
  nombreArchivo: string;
  bytesTotales: number;
  paginasTotales: number;
}): Promise<Trabajo> {
  const { data, error } = await supabase()
    .from("prode_trabajos")
    .insert({
      id: randomUUID(),
      fecha_id: datos.fechaId,
      nombre_archivo: datos.nombreArchivo,
      bytes_totales: datos.bytesTotales,
      paginas_totales: datos.paginasTotales,
      estado: "subiendo",
      chunks: [],
    })
    .select(SELECT)
    .single();
  if (error) throw new Error(`No se pudo crear el trabajo: ${error.message}`);
  return aTrabajo(data as FilaTrabajo);
}

export async function obtenerTrabajo(id: string): Promise<Trabajo | null> {
  const { data, error } = await supabase()
    .from("prode_trabajos")
    .select(SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`No se pudo leer el trabajo: ${error.message}`);
  return data ? aTrabajo(data as FilaTrabajo) : null;
}

/** El siguiente trabajo que el worker debe procesar (el más viejo primero). */
export async function siguienteTrabajoPendiente(): Promise<Trabajo | null> {
  const { data, error } = await supabase()
    .from("prode_trabajos")
    .select(SELECT)
    .in("estado", ["pendiente", "extrayendo", "analizando"])
    .order("creado_en", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`No se pudieron buscar trabajos pendientes: ${error.message}`);
  return data ? aTrabajo(data as FilaTrabajo) : null;
}

export async function actualizarTrabajo(
  id: string,
  cambios: Partial<
    Pick<
      FilaTrabajo,
      | "estado"
      | "chunks"
      | "paginas_extraidas"
      | "boletas_detectadas"
      | "mensaje"
      | "error"
      | "paginas_totales"
    >
  >,
): Promise<void> {
  const { error } = await supabase()
    .from("prode_trabajos")
    .update({ ...cambios, actualizado_en: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(`No se pudo actualizar el trabajo: ${error.message}`);
}

export async function agregarChunk(trabajoId: string, chunk: ChunkTrabajo): Promise<Trabajo> {
  const trabajo = await obtenerTrabajo(trabajoId);
  if (!trabajo) throw new Error("El trabajo no existe.");
  const chunks = [...trabajo.chunks.filter((c) => c.indice !== chunk.indice), chunk].sort(
    (a, b) => a.indice - b.indice,
  );
  await actualizarTrabajo(trabajoId, { chunks });
  return { ...trabajo, chunks };
}

export async function marcarChunkEstado(
  trabajoId: string,
  indice: number,
  estado: EstadoChunk,
  detalleError?: string,
): Promise<void> {
  const trabajo = await obtenerTrabajo(trabajoId);
  if (!trabajo) throw new Error("El trabajo no existe.");
  const chunks = trabajo.chunks.map((c) =>
    c.indice === indice ? { ...c, estado, error: detalleError } : c,
  );
  await actualizarTrabajo(trabajoId, { chunks });
}

/**
 * Guarda el resultado de extraer UNA parte del PDF: ese es el checkpoint.
 *
 * Cada parte escribe SU PROPIA fila en prode_trabajo_paginas. A propósito no se
 * acumula todo en una columna que crece con cada parte: con un PDF de miles de
 * páginas, la última parte terminaría reescribiendo varios MB sólo para agregar
 * un pedacito, y en la práctica eso hacía que Postgres cortara por timeout.
 * Es idempotente: reintentar la misma parte sobrescribe su fila, no duplica.
 */
export async function guardarChunkExtraido(
  trabajoId: string,
  chunk: Pick<ChunkTrabajo, "indice" | "paginaDesde" | "paginaHasta">,
  paginas: PaginaExtraida[],
  mensaje: string,
): Promise<void> {
  const { error: errPaginas } = await supabase()
    .from("prode_trabajo_paginas")
    .upsert(
      { trabajo_id: trabajoId, indice: chunk.indice, paginas },
      { onConflict: "trabajo_id,indice" },
    );
  if (errPaginas) throw new Error(`No se pudo guardar el progreso: ${errPaginas.message}`);

  const trabajo = await obtenerTrabajo(trabajoId);
  if (!trabajo) throw new Error("El trabajo no existe.");
  const chunks = trabajo.chunks.map((c) =>
    c.indice === chunk.indice ? { ...c, estado: "extraido" as const, error: undefined } : c,
  );
  const paginasExtraidas = chunks
    .filter((c) => c.estado === "extraido")
    .reduce((s, c) => s + (c.paginaHasta - c.paginaDesde + 1), 0);

  await actualizarTrabajo(trabajoId, { chunks, paginas_extraidas: paginasExtraidas, mensaje });
}

/** Todas las páginas ya extraídas, para armar el documento completo al final. */
export async function leerPaginasAcumuladas(trabajoId: string): Promise<PaginaExtraida[]> {
  const { data, error } = await supabase()
    .from("prode_trabajo_paginas")
    .select("paginas")
    .eq("trabajo_id", trabajoId)
    .order("indice", { ascending: true });
  if (error) throw new Error(`No se pudo leer el progreso: ${error.message}`);
  return (data ?? []).flatMap((fila) => (fila.paginas as PaginaExtraida[]) ?? []);
}

export async function borrarPaginasAcumuladas(trabajoId: string): Promise<void> {
  await supabase().from("prode_trabajo_paginas").delete().eq("trabajo_id", trabajoId);
}

/** URL firmada para que el navegador suba una parte directo a Storage. */
export async function crearUrlSubidaFirmada(path: string): Promise<{ path: string; token: string }> {
  const { data, error } = await supabase()
    .storage.from(BUCKET_PDFS)
    .createSignedUploadUrl(path, { upsert: true });
  if (error) throw new Error(`No se pudo firmar la subida: ${error.message}`);
  return { path: data.path, token: data.token };
}

/** Descarga una parte ya subida. Lo usa sólo el worker. */
export async function descargarChunk(path: string): Promise<Uint8Array> {
  const { data, error } = await supabase().storage.from(BUCKET_PDFS).download(path);
  if (error) throw new Error(`No se pudo descargar ${path}: ${error.message}`);
  return new Uint8Array(await data.arrayBuffer());
}

/** Borra del Storage las partes de un trabajo terminado. */
export async function borrarChunksDeStorage(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  await supabase().storage.from(BUCKET_PDFS).remove(paths);
}
