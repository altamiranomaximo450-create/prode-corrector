import { crearUrlSubidaFirmada, obtenerTrabajo, BUCKET_PDFS } from "@/lib/almacen/trabajos";
import { error, json, leerJson, manejarError } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Contexto = { params: Promise<{ id: string; trabajoId: string }> };

/**
 * Firma una URL de subida para UN chunk. El PDF nunca llega a esta función:
 * sólo se emite un permiso puntual (token) para que el navegador escriba
 * directo en Supabase Storage.
 */
export async function POST(req: Request, { params }: Contexto) {
  try {
    const { id, trabajoId } = await params;
    const trabajo = await obtenerTrabajo(trabajoId);
    if (!trabajo || trabajo.fechaId !== id) return error("El trabajo no existe.", 404);
    if (trabajo.estado !== "subiendo") {
      return error("Este trabajo ya no admite más chunks (la subida ya se cerró).", 409);
    }

    const cuerpo = await leerJson<{ indice?: unknown }>(req);
    const indice = Number(cuerpo.indice);
    if (!Number.isInteger(indice) || indice < 0) {
      return error("Falta el índice del chunk.", 400);
    }

    const path = `${id}/${trabajoId}/chunk-${String(indice).padStart(5, "0")}.pdf`;
    const { token } = await crearUrlSubidaFirmada(path);

    return json({ bucket: BUCKET_PDFS, path, token });
  } catch (e) {
    return manejarError(e);
  }
}
