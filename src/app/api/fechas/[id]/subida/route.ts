import { MAX_CHUNK_MB, BUCKET_PDFS, obtenerFecha } from "@/lib/almacen";
import { crearTrabajo } from "@/lib/trabajos";
import { error, json, leerJson, manejarError } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Contexto = { params: Promise<{ id: string }> };

/** Claves públicas y límite de parte. Confirma además que la fecha existe en la base. */
export async function GET(_req: Request, { params }: Contexto) {
  try {
    const { id } = await params;
    if (!(await obtenerFecha(id))) return error("La fecha no existe.", 404);

    // Clave pública (anon): está diseñada para el navegador. Storage la acepta
    // sólo junto con el token firmado que autoriza esa subida puntual. La clave
    // secreta (service_role) no sale nunca del servidor.
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anon) {
      return error(
        "Faltan NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY: el navegador las " +
          "necesita para subir el PDF directo a Storage.",
        503,
      );
    }

    return json({ bucket: BUCKET_PDFS, maxChunkMb: MAX_CHUNK_MB, supabaseUrl: url, supabaseAnonKey: anon });
  } catch (e) {
    return manejarError(e);
  }
}

/**
 * Abre un trabajo de subida. Esta ruta NO recibe ni un byte del PDF: sólo crea
 * el registro. Los bytes van del navegador directo a Supabase Storage con una
 * URL firmada, y por eso admite PDFs de 250 MB o más sin que nada pesado pase
 * por una función de Vercel.
 */
export async function POST(req: Request, { params }: Contexto) {
  try {
    const { id } = await params;

    if (!(await obtenerFecha(id))) return error("La fecha no existe.", 404);

    const cuerpo = await leerJson<{
      nombreArchivo?: unknown;
      bytesTotales?: unknown;
      paginasTotales?: unknown;
    }>(req);

    const bytesTotales = Number(cuerpo.bytesTotales);
    const paginasTotales = Number(cuerpo.paginasTotales);
    if (!Number.isFinite(bytesTotales) || bytesTotales <= 0) {
      return error("Falta el tamaño del archivo.", 400);
    }
    if (!Number.isInteger(paginasTotales) || paginasTotales <= 0) {
      return error("Falta la cantidad de páginas del PDF.", 400);
    }

    const trabajo = await crearTrabajo({
      fechaId: id,
      nombreArchivo: String(cuerpo.nombreArchivo ?? "boletas.pdf").slice(0, 200),
      bytesTotales,
      paginasTotales,
    });

    return json({ trabajo });
  } catch (e) {
    return manejarError(e);
  }
}
