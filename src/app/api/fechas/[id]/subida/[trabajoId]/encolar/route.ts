import { actualizarTrabajo, obtenerTrabajo } from "@/lib/almacen/trabajos";
import { error, json, manejarError } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Contexto = { params: Promise<{ id: string; trabajoId: string }> };

/**
 * Cierra la subida y deja el trabajo listo para que el worker (un proceso
 * aparte, fuera de Vercel) lo procese. Esta ruta no hace ningún trabajo
 * pesado: sólo cambia un estado en la base.
 */
export async function POST(_req: Request, { params }: Contexto) {
  try {
    const { id, trabajoId } = await params;
    const trabajo = await obtenerTrabajo(trabajoId);
    if (!trabajo || trabajo.fechaId !== id) return error("El trabajo no existe.", 404);
    if (trabajo.chunks.length === 0) {
      return error("No se subió ningún chunk todavía.", 400);
    }
    if (trabajo.estado !== "subiendo") {
      return json({ trabajo }); // ya estaba encolado o procesándose: idempotente
    }

    await actualizarTrabajo(trabajoId, {
      estado: "pendiente",
      mensaje: `En cola: ${trabajo.chunks.length} chunk(s) subido(s), esperando al worker.`,
    });

    return json({ trabajo: await obtenerTrabajo(trabajoId) });
  } catch (e) {
    return manejarError(e);
  }
}
