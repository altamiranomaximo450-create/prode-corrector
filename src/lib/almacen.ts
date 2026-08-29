/**
 * Persistencia. Supabase es el ÚNICO almacén.
 *
 * Antes había tres motores intercambiables (archivos JSON, memoria y Supabase)
 * elegidos por STORAGE_DRIVER, pero el pipeline de PDF (tabla prode_trabajos,
 * Storage y el worker) siempre habló con Supabase directamente. Con cualquier
 * driver que no fuera supabase la fecha se guardaba en un lado y se buscaba en
 * otro: el worker no la encontraba y el procesamiento moría con "la fecha no
 * existe", además de violar la clave foránea prode_trabajos.fecha_id. Un solo
 * almacén elimina esa clase de fallo de raíz.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Boleta, Fecha } from "./tipos";

const TABLA_FECHAS = "prode_fechas";
const TABLA_BOLETAS = "prode_boletas";

export const BUCKET_PDFS = process.env.PRODE_PDF_BUCKET ?? "prode-pdfs";

/**
 * Tamaño máximo por parte del PDF. Supabase Storage rechaza cualquier objeto de
 * más de 50 MB en el plan gratuito (tope duro de la plataforma), así que 45
 * deja margen. El PDF original puede pesar 250 MB o más: se sube partido.
 */
export const MAX_CHUNK_MB =
  Number(process.env.MAX_CHUNK_MB) > 0 ? Number(process.env.MAX_CHUNK_MB) : 45;

export function supabaseConfigurado(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

let cliente: SupabaseClient | null = null;

/** Cliente con la service_role. Vive sólo en el servidor y en el worker, nunca en el navegador. */
export function supabase(): SupabaseClient {
  if (!supabaseConfigurado()) {
    throw new Error(
      "Faltan SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY. Sin Supabase la aplicación no puede " +
        "guardar fechas ni procesar PDFs. Ver README.",
    );
  }
  if (!cliente) {
    cliente = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false },
    });
  }
  return cliente;
}

/* -------------------------------------------------------------------------- */
/*  Fechas y boletas                                                          */
/* -------------------------------------------------------------------------- */

interface FilaFecha {
  id: string;
  datos: Fecha;
}

export async function guardarFecha(fecha: Fecha): Promise<void> {
  const { error } = await supabase()
    .from(TABLA_FECHAS)
    .upsert(
      {
        id: fecha.id,
        datos: fecha,
        creada_en: fecha.creadaEn,
        actualizada_en: fecha.actualizadaEn,
      },
      { onConflict: "id" },
    );
  if (error) throw new Error(`No se pudo guardar la fecha: ${error.message}`);
}

export async function obtenerFecha(id: string): Promise<Fecha | null> {
  const { data, error } = await supabase()
    .from(TABLA_FECHAS)
    .select("id,datos")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`No se pudo leer la fecha: ${error.message}`);
  return data ? (data as FilaFecha).datos : null;
}

export async function listarBoletas(fechaId: string): Promise<Boleta[]> {
  const boletas: Boleta[] = [];
  // Supabase corta las respuestas en 1000 filas: una fecha grande trae miles de
  // boletas, así que se pagina hasta traerlas todas.
  const tanda = 1000;
  for (let desde = 0; ; desde += tanda) {
    const { data, error } = await supabase()
      .from(TABLA_BOLETAS)
      .select("datos")
      .eq("fecha_id", fechaId)
      .order("orden", { ascending: true })
      .range(desde, desde + tanda - 1);
    if (error) throw new Error(`No se pudieron leer las boletas: ${error.message}`);
    const filas = (data ?? []) as { datos: Boleta }[];
    boletas.push(...filas.map((f) => f.datos));
    if (filas.length < tanda) break;
  }
  return boletas;
}

/**
 * Reemplaza todas las boletas de una fecha.
 *
 * `alGuardar` recibe cuántas van guardadas después de cada tanda: es lo que le
 * permite a la pantalla mostrar "Guardando boletas: 500 de 1834" con números
 * reales en vez de quedarse congelada al final del procesamiento.
 */
/**
 * Reintenta UNA tanda antes de rendirse.
 *
 * Guardar miles de boletas son varias peticiones seguidas, y un corte de red de
 * un segundo en la última no puede obligar a rehacer todas las anteriores. Se
 * reintenta la tanda que falló, no el guardado entero.
 */
async function conReintentos<T>(fn: () => Promise<T>, que: string): Promise<T> {
  let ultimo: unknown;
  for (let intento = 1; intento <= 4; intento++) {
    try {
      return await fn();
    } catch (e) {
      ultimo = e;
      if (intento < 4) await new Promise((r) => setTimeout(r, 800 * intento));
    }
  }
  throw new Error(
    `${que}: ${ultimo instanceof Error ? ultimo.message : String(ultimo)} (tras 4 intentos)`,
  );
}

export async function reemplazarBoletas(
  fechaId: string,
  boletas: Boleta[],
  alGuardar?: (guardadas: number) => void,
): Promise<void> {
  await conReintentos(async () => {
    const { error } = await supabase().from(TABLA_BOLETAS).delete().eq("fecha_id", fechaId);
    if (error) throw new Error(error.message);
  }, "No se pudieron borrar las boletas previas");

  const tanda = 500;
  for (let i = 0; i < boletas.length; i += tanda) {
    const filas = boletas.slice(i, i + tanda).map((b) => ({
      id: b.id,
      fecha_id: b.fechaId,
      orden: b.orden,
      datos: b,
    }));
    await conReintentos(async () => {
      const { error } = await supabase().from(TABLA_BOLETAS).insert(filas);
      if (error) throw new Error(error.message);
    }, `No se pudieron guardar las boletas ${i + 1}-${i + filas.length}`);
    alGuardar?.(Math.min(i + tanda, boletas.length));
  }
}
