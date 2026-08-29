import { actualizarTrabajo, obtenerTrabajo } from "@/lib/trabajos";
import { error, json, manejarError } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Contexto = { params: Promise<{ id: string; trabajoId: string }> };

/**
 * Cierra la subida y deja el trabajo listo para el worker. No hace nada pesado:
 * sólo cambia un estado en la base.
 */
export async function POST(_req: Request, { params }: Contexto) {
  try {
    const { id, trabajoId } = await params;
    const trabajo = await obtenerTrabajo(trabajoId);
    if (!trabajo || trabajo.fechaId !== id) return error("El trabajo no existe.", 404);
    if (trabajo.chunks.length === 0) return error("Todavía no se subió ninguna parte.", 400);

    // Idempotente: si ya estaba encolado o procesándose, no se toca.
    if (trabajo.estado === "subiendo") {
      await actualizarTrabajo(trabajoId, {
        estado: "pendiente",
        mensaje: "En cola, esperando al worker...",
      });
    }

    return json({ trabajo: await obtenerTrabajo(trabajoId) });
  } catch (e) {
    return manejarError(e);
  }
}
