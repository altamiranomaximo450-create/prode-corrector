import { json, leerJson, manejarError } from "@/lib/api";
import { actualizarBoleta, borrarBoleta, type EntradaBoleta } from "@/lib/servicio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Contexto = { params: Promise<{ id: string; boletaId: string }> };

export async function PATCH(req: Request, { params }: Contexto) {
  try {
    const { id, boletaId } = await params;
    const cuerpo = await leerJson<EntradaBoleta>(req);
    return json({ boleta: await actualizarBoleta(id, boletaId, cuerpo) });
  } catch (e) {
    return manejarError(e);
  }
}

export async function DELETE(_req: Request, { params }: Contexto) {
  try {
    const { id, boletaId } = await params;
    await borrarBoleta(id, boletaId);
    return json({ ok: true });
  } catch (e) {
    return manejarError(e);
  }
}
