import { actualizarTrabajo, obtenerTrabajo, registrarDisparo } from "@/lib/trabajos";
import { dispararWorker } from "@/lib/disparador";
import { error, json, manejarError } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Contexto = { params: Promise<{ id: string; trabajoId: string }> };

/**
 * Cierra la subida y ARRANCA el worker.
 *
 * Acá estaba el agujero que dejaba todo en "En cola, esperando al worker...":
 * antes esta ruta sólo cambiaba un estado en la base y ahí terminaba, así que
 * el procesamiento no empezaba nunca hasta que alguien corriera `npm run worker`
 * a mano. Ahora, además de encolar, pide que se levante un worker de verdad.
 *
 * Sigue sin hacer nada pesado: disparar es una llamada HTTP de milisegundos. El
 * PDF lo procesa el worker, fuera de Vercel.
 */
export async function POST(_req: Request, { params }: Contexto) {
  try {
    const { id, trabajoId } = await params;
    const trabajo = await obtenerTrabajo(trabajoId);
    if (!trabajo || trabajo.fechaId !== id) return error("El trabajo no existe.", 404);
    if (trabajo.chunks.length === 0) return error("Todavía no se subió ninguna parte.", 400);

    // Idempotente: si ya estaba encolado o procesándose, no se pisa el estado.
    if (trabajo.estado === "subiendo") {
      await actualizarTrabajo(trabajoId, {
        estado: "pendiente",
        mensaje: "Encolado. Pidiendo el worker...",
      });
    }

    const disparo = await dispararWorker(trabajoId, "encolar");
    await registrarDisparo(trabajoId, disparo, trabajo.disparos);

    return json({ trabajo: await obtenerTrabajo(trabajoId), disparo });
  } catch (e) {
    return manejarError(e);
  }
}
