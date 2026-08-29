import { error, json, manejarError } from "@/lib/api";
import { obtenerCorreccion } from "@/lib/servicio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Contexto = { params: Promise<{ id: string }> };

/** Ranking completo y detalle partido por partido de una fecha. */
export async function GET(_req: Request, { params }: Contexto) {
  try {
    const { id } = await params;
    const correccion = await obtenerCorreccion(id);
    if (!correccion) return error("La fecha no existe.", 404);
    return json({ correccion });
  } catch (e) {
    return manejarError(e);
  }
}
