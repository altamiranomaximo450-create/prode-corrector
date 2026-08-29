import { obtenerAlmacen } from "@/lib/almacen";
import { error, json, leerJson, manejarError } from "@/lib/api";
import {
  actualizarFecha,
  borrarFecha,
  obtenerCorreccion,
  sembrarDemoSiHaceFalta,
  type EntradaFecha,
} from "@/lib/servicio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Contexto = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Contexto) {
  try {
    await sembrarDemoSiHaceFalta();
    const { id } = await params;
    const correccion = await obtenerCorreccion(id);
    if (!correccion) return error("La fecha no existe.", 404);
    const boletas = await obtenerAlmacen().listarBoletas(id);
    return json({ correccion, boletas });
  } catch (e) {
    return manejarError(e);
  }
}

export async function PATCH(req: Request, { params }: Contexto) {
  try {
    const { id } = await params;
    const cuerpo = await leerJson<EntradaFecha>(req);
    const fecha = await actualizarFecha(id, cuerpo);
    const correccion = await obtenerCorreccion(id);
    return json({ fecha, correccion });
  } catch (e) {
    return manejarError(e);
  }
}

export async function DELETE(_req: Request, { params }: Contexto) {
  try {
    const { id } = await params;
    await borrarFecha(id);
    return json({ ok: true });
  } catch (e) {
    return manejarError(e);
  }
}
