import { obtenerAlmacen } from "@/lib/almacen";
import { json, leerJson, manejarError } from "@/lib/api";
import { crearBoletaManual, type EntradaBoleta } from "@/lib/servicio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Contexto = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Contexto) {
  try {
    const { id } = await params;
    return json({ boletas: await obtenerAlmacen().listarBoletas(id) });
  } catch (e) {
    return manejarError(e);
  }
}

export async function POST(req: Request, { params }: Contexto) {
  try {
    const { id } = await params;
    const cuerpo = await leerJson<EntradaBoleta>(req);
    return json({ boleta: await crearBoletaManual(id, cuerpo) }, 201);
  } catch (e) {
    return manejarError(e);
  }
}
