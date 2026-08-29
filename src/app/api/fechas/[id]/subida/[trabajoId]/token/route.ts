import { BUCKET_PDFS } from "@/lib/almacen";
import { crearUrlSubidaFirmada, obtenerTrabajo } from "@/lib/trabajos";
import { error, json, leerJson, manejarError } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Contexto = { params: Promise<{ id: string; trabajoId: string }> };

/** Firma el permiso de subida de UNA parte. El PDF no llega nunca a esta función. */
export async function POST(req: Request, { params }: Contexto) {
  try {
    const { id, trabajoId } = await params;
    const trabajo = await obtenerTrabajo(trabajoId);
    if (!trabajo || trabajo.fechaId !== id) return error("El trabajo no existe.", 404);

    const cuerpo = await leerJson<{ indice?: unknown }>(req);
    const indice = Number(cuerpo.indice);
    if (!Number.isInteger(indice) || indice < 0) return error("Falta el índice de la parte.", 400);

    const path = `${id}/${trabajoId}/parte-${String(indice).padStart(5, "0")}.pdf`;
    const { token } = await crearUrlSubidaFirmada(path);

    return json({ bucket: BUCKET_PDFS, path, token });
  } catch (e) {
    return manejarError(e);
  }
}
