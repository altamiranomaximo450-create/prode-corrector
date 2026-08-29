import { obtenerAlmacen } from "@/lib/almacen";
import {
  crearTrabajo,
  obtenerUltimoTrabajoDeFecha,
  supabaseAdminConfigurado,
  MAX_CHUNK_MB,
  BUCKET_PDFS,
} from "@/lib/almacen/trabajos";
import { error, json, leerJson, manejarError } from "@/lib/api";
import { procesamientoHabilitado } from "@/lib/servicio";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Contexto = { params: Promise<{ id: string }> };

/**
 * Inicia un trabajo de subida "grande": el navegador ya partió el PDF en
 * chunks (con pdf-lib, en el propio navegador) y avisa acá cuántas páginas y
 * chunks va a subir. Esta ruta NO recibe ningún byte del PDF: sólo crea el
 * registro del trabajo. Los bytes van directo del navegador a Supabase
 * Storage con una URL firmada (ver la subruta /token).
 */
export async function POST(req: Request, { params }: Contexto) {
  try {
    const { id } = await params;

    if (!procesamientoHabilitado()) {
      return error("El procesamiento de PDF está desactivado en este entorno.", 503);
    }
    if (!supabaseAdminConfigurado()) {
      return error(
        "La carga de PDFs grandes necesita Supabase configurado en el servidor " +
          "(SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY). Con el almacenamiento actual, subí el PDF por el formulario normal.",
        503,
      );
    }

    const almacen = obtenerAlmacen();
    const fecha = await almacen.obtenerFecha(id);
    if (!fecha) return error("La fecha no existe.", 404);
    if (fecha.esDemo) {
      return error("Esta es una fecha de demostración y no admite carga de PDF.", 400);
    }

    const cuerpo = await leerJson<{
      nombreArchivo?: unknown;
      bytesTotales?: unknown;
      paginasTotales?: unknown;
    }>(req);

    const nombreArchivo = String(cuerpo.nombreArchivo ?? "boletas.pdf").slice(0, 200);
    const bytesTotales = Number(cuerpo.bytesTotales);
    const paginasTotales = Number(cuerpo.paginasTotales);
    if (!Number.isFinite(bytesTotales) || bytesTotales <= 0) {
      return error("Falta el tamaño del archivo.", 400);
    }
    if (!Number.isInteger(paginasTotales) || paginasTotales <= 0) {
      return error("Falta la cantidad de páginas del PDF.", 400);
    }

    const trabajo = await crearTrabajo({ fechaId: id, nombreArchivo, bytesTotales, paginasTotales });

    // Clave pública (anon/publishable): está diseñada para exponerse al
    // navegador -- Storage la acepta sólo junto con el token firmado que
    // autoriza esa subida puntual. La clave secreta (service_role) nunca sale
    // del servidor.
    const anon =
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY ?? null;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? null;
    if (!anon || !url) {
      return error(
        "Falta NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY en el servidor: son necesarias para que el navegador pueda subir directo a Storage.",
        503,
      );
    }
    // Se valida acá (no sólo se confía) que las claves públicas correspondan al proyecto.
    createClient(url, anon);

    return json({
      trabajo,
      bucket: BUCKET_PDFS,
      maxChunkMb: MAX_CHUNK_MB,
      supabaseUrl: url,
      supabaseAnonKey: anon,
    });
  } catch (e) {
    return manejarError(e);
  }
}

/** Trabajo más reciente de esta fecha: permite retomar el seguimiento si se recargó la página. */
export async function GET(_req: Request, { params }: Contexto) {
  try {
    const { id } = await params;
    if (!supabaseAdminConfigurado()) return json({ trabajo: null });
    const trabajo = await obtenerUltimoTrabajoDeFecha(id);
    return json({ trabajo });
  } catch (e) {
    return manejarError(e);
  }
}
