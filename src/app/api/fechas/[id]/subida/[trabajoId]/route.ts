import { obtenerTrabajo } from "@/lib/almacen/trabajos";
import { error, json, manejarError } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Contexto = { params: Promise<{ id: string; trabajoId: string }> };

/** Progreso del trabajo, para que el panel lo consulte (polling) mientras el worker procesa. */
export async function GET(_req: Request, { params }: Contexto) {
  try {
    const { id, trabajoId } = await params;
    const trabajo = await obtenerTrabajo(trabajoId);
    if (!trabajo || trabajo.fechaId !== id) return error("El trabajo no existe.", 404);
    return json({ trabajo });
  } catch (e) {
    return manejarError(e);
  }
}
