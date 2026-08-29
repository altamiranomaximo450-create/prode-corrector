import { json, leerJson, manejarError } from "@/lib/api";
import { crearFecha, type EntradaFecha } from "@/lib/servicio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const fecha = await crearFecha(await leerJson<EntradaFecha>(req));
    return json({ fecha }, 201);
  } catch (e) {
    return manejarError(e);
  }
}
