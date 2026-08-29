/**
 * Trabajos de procesamiento de PDFs grandes.
 *
 * A diferencia del resto del almacén (fechas/boletas, que soporta archivo /
 * memoria / Supabase), esta pieza SÓLO existe con Supabase: necesita Storage
 * para guardar los chunks del PDF, algo que no tiene sentido en el motor de
 * archivos locales ni en memoria. Por eso vive aparte, no en `Almacen`.
 *
 * Si STORAGE_DRIVER no es "supabase", las rutas que usan este módulo devuelven
 * un error explicando que la carga de PDFs grandes necesita Supabase
 * configurado (ver README, sección "PDFs grandes").
 */

import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { PaginaExtraida } from "../pdf/extraer";

export const BUCKET_PDFS = process.env.PRODE_PDF_BUCKET ?? "prode-pdfs";

/**
 * Tamaño máximo por chunk. El plan gratuito de Supabase Storage rechaza
 * cualquier archivo de más de 50 MB (es un tope duro de la plataforma, no
 * configurable en el free tier): 45 MB deja margen de sobra.
 */
export const MAX_CHUNK_MB = Number(process.env.MAX_CHUNK_MB) > 0 ? Number(process.env.MAX_CHUNK_MB) : 45;

export type EstadoChunk = "pendiente" | "subido" | "extraido" | "error";

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
  | "error"
  | "cancelado";

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

const SELECT =
  "id,fecha_id,nombre_archivo,bytes_totales,paginas_totales,estado,chunks,paginas_extraidas,boletas_detectadas,mensaje,error,creado_en,actualizado_en";

let cliente: SupabaseClient | null = null;

export function supabaseAdminConfigurado(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

/** Cliente con la service_role: sólo se usa en el servidor (rutas API y worker), nunca en el navegador. */
export function supabaseAdmin(): SupabaseClient {
  if (!supabaseAdminConfigurado()) {
    throw new Error(
      "La carga de PDFs grandes necesita Supabase configurado (SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY). " +
        "Con STORAGE_DRIVER=file o memory, subí el PDF por el formulario normal (hasta el límite local).",
    );
  }
  if (!cliente) {
    cliente = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false },
    });
  }
  return cliente;
}

export async function crearTrabajo(datos: {
  fechaId: string;
  nombreArchivo: string;
  bytesTotales: number;
  paginasTotales: number;
}): Promise<Trabajo> {
  const fila: Omit<FilaTrabajo, "creado_en" | "actualizado_en"> = {
    id: randomUUID(),
    fecha_id: datos.fechaId,
    nombre_archivo: datos.nombreArchivo,
    bytes_totales: datos.bytesTotales,
    paginas_totales: datos.paginasTotales,
    estado: "subiendo",
    chunks: [],
    paginas_extraidas: 0,
    boletas_detectadas: 0,
    mensaje: null,
    error: null,
  };
  const { data, error } = await supabaseAdmin()
    .from("prode_trabajos")
    .insert(fila)
    .select(SELECT)
    .single();
  if (error) throw new Error(`No se pudo crear el trabajo: ${error.message}`);
  return aTrabajo(data as FilaTrabajo);
}

export async function obtenerTrabajo(id: string): Promise<Trabajo | null> {
  const { data, error } = await supabaseAdmin()
    .from("prode_trabajos")
    .select(SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`No se pudo leer el trabajo: ${error.message}`);
  return data ? aTrabajo(data as FilaTrabajo) : null;
}

/** El trabajo más reciente de una fecha: permite retomar el seguimiento tras recargar la página. */
export async function obtenerUltimoTrabajoDeFecha(fechaId: string): Promise<Trabajo | null> {
  const { data, error } = await supabaseAdmin()
    .from("prode_trabajos")
    .select(SELECT)
    .eq("fecha_id", fechaId)
    .order("creado_en", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`No se pudo buscar el trabajo: ${error.message}`);
  return data ? aTrabajo(data as FilaTrabajo) : null;
}

/** El siguiente trabajo que el worker debe seguir procesando (el más viejo primero). */
export async function siguienteTrabajoPendiente(): Promise<Trabajo | null> {
  const { data, error } = await supabaseAdmin()
    .from("prode_trabajos")
    .select(SELECT)
    .in("estado", ["pendiente", "extrayendo", "analizando"])
    .order("creado_en", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`No se pudo buscar trabajos pendientes: ${error.message}`);
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
  const { error } = await supabaseAdmin()
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

/**
 * Marca un chunk como extraído (o con error): es un cambio de estado suelto,
 * sobre el array `chunks` (chico: unos pocos KB como mucho). Se usa para el
 * caso de error; el camino feliz usa `guardarChunkExtraido` (ver abajo).
 */
export async function marcarChunkEstado(
  trabajoId: string,
  indice: number,
  estado: EstadoChunk,
  detalleError?: string,
): Promise<Trabajo> {
  const trabajo = await obtenerTrabajo(trabajoId);
  if (!trabajo) throw new Error("El trabajo no existe.");
  const chunks = trabajo.chunks.map((c) =>
    c.indice === indice ? { ...c, estado, error: detalleError } : c,
  );
  await actualizarTrabajo(trabajoId, { chunks });
  return { ...trabajo, chunks };
}

/**
 * Guarda el resultado de extraer UN chunk.
 *
 * A propósito NO acumula las páginas en una sola columna que crece con cada
 * chunk: eso obligaba a reescribir un blob cada vez más grande en cada paso
 * (con un PDF de miles de páginas, el último chunk terminaría reescribiendo
 * varios MB enteros sólo para agregar un pedacito), y en la práctica eso hizo
 * que Postgres cortara la consulta por timeout a mitad de un trabajo real.
 *
 * En cambio, cada chunk escribe SU PROPIA fila en `prode_trabajo_paginas`
 * (upsert por `(trabajo_id, indice)`): el costo de guardar el progreso de un
 * chunk es siempre proporcional a ESE chunk, nunca a todo lo acumulado antes.
 * Es idempotente por diseño: reintentar el mismo chunk simplemente
 * sobrescribe su misma fila, sin duplicar páginas.
 */
export async function guardarChunkExtraido(
  trabajoId: string,
  chunk: Pick<ChunkTrabajo, "indice" | "paginaDesde" | "paginaHasta">,
  paginasNuevas: PaginaExtraida[],
  mensaje: string,
): Promise<void> {
  const { error: errPaginas } = await supabaseAdmin()
    .from("prode_trabajo_paginas")
    .upsert(
      { trabajo_id: trabajoId, indice: chunk.indice, paginas: paginasNuevas },
      { onConflict: "trabajo_id,indice" },
    );
  if (errPaginas) throw new Error(`No se pudo guardar el progreso del trabajo: ${errPaginas.message}`);

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

/** Crea una URL de subida firmada para un chunk: el navegador sube directo a Storage, sin pasar por Vercel. */
export async function crearUrlSubidaFirmada(
  path: string,
): Promise<{ path: string; token: string }> {
  const { data, error } = await supabaseAdmin()
    .storage.from(BUCKET_PDFS)
    .createSignedUploadUrl(path, { upsert: true });
  if (error) throw new Error(`No se pudo firmar la subida: ${error.message}`);
  return { path: data.path, token: data.token };
}

/** Descarga un chunk ya subido (lo usa sólo el worker; nunca pasa por una función de Vercel). */
export async function descargarChunk(path: string): Promise<Uint8Array> {
  const { data, error } = await supabaseAdmin().storage.from(BUCKET_PDFS).download(path);
  if (error) throw new Error(`No se pudo descargar el chunk ${path}: ${error.message}`);
  return new Uint8Array(await data.arrayBuffer());
}

export async function borrarChunks(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  await supabaseAdmin().storage.from(BUCKET_PDFS).remove(paths);
}

/**
 * Todas las páginas ya extraídas de este trabajo, juntando la fila de cada
 * chunk. Se usa una sola vez, al final (cuando ya se extrajeron todos los
 * chunks), para armar el documento completo antes de analizarlo.
 */
export async function leerPaginasAcumuladas(trabajoId: string): Promise<PaginaExtraida[]> {
  const { data, error } = await supabaseAdmin()
    .from("prode_trabajo_paginas")
    .select("paginas")
    .eq("trabajo_id", trabajoId)
    .order("indice", { ascending: true });
  if (error) throw new Error(`No se pudo leer el progreso del trabajo: ${error.message}`);
  return (data ?? []).flatMap((fila) => (fila.paginas as PaginaExtraida[]) ?? []);
}

/** Libera las filas de progreso una vez que el trabajo terminó (las boletas ya quedaron guardadas aparte). */
export async function borrarPaginasAcumuladas(trabajoId: string): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("prode_trabajo_paginas")
    .delete()
    .eq("trabajo_id", trabajoId);
  if (error) throw new Error(`No se pudo limpiar el progreso del trabajo: ${error.message}`);
}
