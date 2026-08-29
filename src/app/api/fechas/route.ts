import { json, manejarError, leerJson } from "@/lib/api";
import {
  crearFecha,
  listarFechasConResumen,
  sembrarDemoSiHaceFalta,
  type EntradaFecha,
} from "@/lib/servicio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await sembrarDemoSiHaceFalta();
    return json({ fechas: await listarFechasConResumen() });
  } catch (e) {
    return manejarError(e);
  }
}

export async function POST(req: Request) {
  try {
    const cuerpo = await leerJson<EntradaFecha>(req);
    const fecha = await crearFecha(cuerpo);
    return json({ fecha }, 201);
  } catch (e) {
    return manejarError(e);
  }
}
