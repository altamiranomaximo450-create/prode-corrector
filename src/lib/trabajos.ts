/**
 * Trabajos de procesamiento de PDF.
 *
 * Un "trabajo" es la subida y el procesamiento de UN PDF. El navegador parte el
 * archivo en partes ("chunks") y las sube DIRECTO a Supabase Storage con una
 * URL firmada: los bytes del PDF no pasan nunca por una función de Vercel, que
 * es lo que permite archivos de 250 MB o más. Un worker aparte los procesa de a
 * una parte por vez, guardando progreso después de cada una para poder retomar.
 *
 * El worker no se arranca a mano: lo dispara la app al encolar (ver
 * src/lib/disparador.ts). Para que ese arranque sea confiable, cada trabajo
 * lleva además un LATIDO: mientras un worker lo está procesando escribe la hora
 * cada pocos segundos. Un trabajo en marcha cuyo latido se enfrió es un trabajo
 * abandonado (el runner se cayó, se cortó la red) y puede volver a tomarse
 * desde su último checkpoint, sin empezar de cero.
 */

import { randomUUID } from "node:crypto";
import { BUCKET_PDFS, supabase } from "./almacen";
import type { ResultadoDisparo } from "./disparador";
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
  | "guardando"
  | "completado"
  | "error";

/** Estados en los que hay trabajo por hacer: son los que toma un worker. */
export const ESTADOS_ACTIVOS: EstadoTrabajo[] = [
  "pendiente",
  "extrayendo",
  "analizando",
  "guardando",
];

/**
 * Si el latido tiene más de esto, damos por muerto al worker que lo tomó y el
 * trabajo vuelve a estar disponible. Es holgado a propósito: extraer una parte
 * grande puede tardar, y el worker late mientras trabaja.
 */
export const LATIDO_FRIO_MS =
  Number(process.env.PRODE_LATIDO_FRIO_MS) > 0 ? Number(process.env.PRODE_LATIDO_FRIO_MS) : 90_000;

export interface Trabajo {
  id: string;
  fechaId: string;
  nombreArchivo: string;
  bytesTotales: number;
  paginasTotales: number;
  estado: EstadoTrabajo;
  chunks: ChunkTrabajo[];
  paginasExtraidas: number;
  paginasRescatadas: number;
  boletasDetectadas: number;
  boletasGuardadas: number;
  mensaje: string | null;
  error: string | null;
  latidoEn: string | null;
  worker: string | null;
  disparadoEn: string | null;
  disparos: number;
  disparoModo: string | null;
  disparoDetalle: string | null;
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
  paginas_rescatadas: number;
  boletas_detectadas: number;
  boletas_guardadas: number;
  mensaje: string | null;
  error: string | null;
  latido_en: string | null;
  worker: string | null;
  disparado_en: string | null;
  disparos: number;
  disparo_modo: string | null;
  disparo_detalle: string | null;
  creado_en: string;
  actualizado_en: string;
}

// Una sola línea a propósito: partida con `+`, TypeScript la ensancha a `string`
// y el cliente de Supabase deja de poder deducir el tipo de las filas.
// prettier-ignore
const SELECT = "id,fecha_id,nombre_archivo,bytes_totales,paginas_totales,estado,chunks,paginas_extraidas,paginas_rescatadas,boletas_detectadas,boletas_guardadas,mensaje,error,latido_en,worker,disparado_en,disparos,disparo_modo,disparo_detalle,creado_en,actualizado_en";

function aTrabajo(f: FilaTrabajo): Trabajo {
  return {
    id: f.id,
    fechaId: f.fecha_id,
    nombreArchivo: f.nombre_archivo,
    bytesTotales: f.bytes_totales,
    paginasTotales: f.paginas_totales,
    estado: f.estado,
    chunks: f.chunks ?? [],
    paginasExtraidas: f.paginas_extraidas ?? 0,
    paginasRescatadas: f.paginas_rescatadas ?? 0,
    boletasDetectadas: f.boletas_detectadas ?? 0,
    boletasGuardadas: f.boletas_guardadas ?? 0,
    mensaje: f.mensaje,
    error: f.error,
    latidoEn: f.latido_en ?? null,
    worker: f.worker ?? null,
    disparadoEn: f.disparado_en ?? null,
    disparos: f.disparos ?? 0,
    disparoModo: f.disparo_modo ?? null,
    disparoDetalle: f.disparo_detalle ?? null,
    creadoEn: f.creado_en,
    actualizadoEn: f.actualizado_en,
  };
}

/** true si el trabajo está en marcha pero nadie lo está tocando hace rato. */
export function latidoFrio(trabajo: Trabajo, ahora = Date.now()): boolean {
  if (!trabajo.latidoEn) return true;
  const t = Date.parse(trabajo.latidoEn);
  return !Number.isFinite(t) || ahora - t > LATIDO_FRIO_MS;
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

/**
 * Trabajos que un worker puede tomar ahora mismo: los pendientes y los que
 * quedaron a medias con el latido frío. Los que otro worker está procesando de
 * verdad quedan afuera.
 */
export async function trabajosTomables(limite = 20): Promise<Trabajo[]> {
  const { data, error } = await supabase()
    .from("prode_trabajos")
    .select(SELECT)
    .in("estado", ESTADOS_ACTIVOS)
    .order("creado_en", { ascending: true })
    .limit(limite);
  if (error) throw new Error(`No se pudieron buscar trabajos pendientes: ${error.message}`);
  const ahora = Date.now();
  return (data ?? [])
    .map((f) => aTrabajo(f as FilaTrabajo))
    .filter((t) => t.estado === "pendiente" || latidoFrio(t, ahora));
}

/**
 * Toma el trabajo para este worker. Es un compare-and-swap sobre el latido: la
 * condición del UPDATE es que el latido siga siendo el que se leyó, así que si
 * dos workers intentan a la vez, uno solo gana y el otro sigue de largo. Sin
 * esto, dos runners de GitHub Actions disparados casi juntos podrían procesar
 * el mismo PDF dos veces.
 */
export async function reclamarTrabajo(trabajo: Trabajo, workerId: string): Promise<boolean> {
  const ahora = new Date().toISOString();
  let consulta = supabase()
    .from("prode_trabajos")
    .update({
      estado: "extrayendo",
      worker: workerId,
      latido_en: ahora,
      actualizado_en: ahora,
      mensaje: "Leyendo el PDF...",
      error: null,
    })
    .eq("id", trabajo.id);

  consulta = trabajo.latidoEn
    ? consulta.eq("latido_en", trabajo.latidoEn)
    : consulta.is("latido_en", null);

  const { data, error } = await consulta.select("id");
  if (error) throw new Error(`No se pudo tomar el trabajo: ${error.message}`);
  return (data ?? []).length > 0;
}

/** Marca que este worker sigue vivo, y de paso guarda progreso. */
export async function latir(
  id: string,
  cambios: Partial<
    Pick<
      FilaTrabajo,
      | "estado"
      | "chunks"
      | "paginas_extraidas"
      | "paginas_rescatadas"
      | "boletas_detectadas"
      | "boletas_guardadas"
      | "mensaje"
    >
  > = {},
): Promise<void> {
  const ahora = new Date().toISOString();
  const { error } = await supabase()
    .from("prode_trabajos")
    .update({ ...cambios, latido_en: ahora, actualizado_en: ahora })
    .eq("id", id);
  if (error) throw new Error(`No se pudo guardar el latido: ${error.message}`);
}

export async function actualizarTrabajo(
  id: string,
  cambios: Partial<
    Pick<
      FilaTrabajo,
      | "estado"
      | "chunks"
      | "paginas_extraidas"
      | "paginas_rescatadas"
      | "boletas_detectadas"
      | "boletas_guardadas"
      | "mensaje"
      | "error"
      | "paginas_totales"
      | "latido_en"
      | "worker"
    >
  >,
): Promise<void> {
  const { error } = await supabase()
    .from("prode_trabajos")
    .update({ ...cambios, actualizado_en: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(`No se pudo actualizar el trabajo: ${error.message}`);
}

/**
 * Deja constancia de que se pidió arrancar un worker. Lo que quedó acá es lo
 * que se muestra en pantalla mientras el runner levanta, así que un fallo de
 * configuración se ve en la web en vez de quedar como un 0% eterno.
 */
export async function registrarDisparo(
  id: string,
  resultado: ResultadoDisparo,
  disparosPrevios: number,
): Promise<void> {
  const ahora = new Date().toISOString();
  const cambios: Record<string, unknown> = {
    disparado_en: ahora,
    disparos: disparosPrevios + 1,
    disparo_modo: resultado.modo,
    disparo_detalle: resultado.detalle,
    actualizado_en: ahora,
  };
  if (resultado.ok) {
    cambios.mensaje =
      resultado.modo === "github"
        ? "Arrancando el worker en GitHub Actions..."
        : "Arrancando el worker...";
  } else {
    // No se marca el trabajo como "error": el problema es del arranque, no del
    // PDF, y el vigía puede volver a intentarlo. Pero el motivo se ve.
    cambios.mensaje = `No se pudo arrancar el worker. ${resultado.detalle}`;
  }
  const { error } = await supabase().from("prode_trabajos").update(cambios).eq("id", id);
  if (error) throw new Error(`No se pudo registrar el disparo: ${error.message}`);
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
  datos: { mensaje: string; paginasRescatadas: number },
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

  await latir(trabajoId, {
    chunks,
    paginas_extraidas: paginasExtraidas,
    paginas_rescatadas: trabajo.paginasRescatadas + datos.paginasRescatadas,
    mensaje: datos.mensaje,
  });
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

/**
 * Tira las subidas que quedaron a medias.
 *
 * Si alguien empieza a subir un PDF y cierra la pestaña, el trabajo se queda en
 * "subiendo" para siempre y sus pedazos ocupan lugar en Storage. Nadie los va a
 * usar: para procesarse, un trabajo tiene que haber pasado por "encolar". Se
 * borran los que llevan más de un día así, con todo lo que hayan subido.
 *
 * Devuelve cuántos se limpiaron. Es best-effort: si algo falla, se ignora — no
 * puede impedir que se procesen los trabajos de verdad.
 */
export async function limpiarSubidasAbandonadas(horas = 24): Promise<number> {
  const limite = new Date(Date.now() - horas * 3600_000).toISOString();
  const { data, error } = await supabase()
    .from("prode_trabajos")
    .select("id,chunks")
    .eq("estado", "subiendo")
    .lt("creado_en", limite)
    .limit(50);
  if (error || !data?.length) return 0;

  for (const fila of data) {
    const paths = ((fila.chunks as ChunkTrabajo[]) ?? []).map((c) => c.storagePath);
    await borrarChunksDeStorage(paths).catch(() => undefined);
    await supabase().from("prode_trabajos").delete().eq("id", fila.id);
  }
  return data.length;
}
