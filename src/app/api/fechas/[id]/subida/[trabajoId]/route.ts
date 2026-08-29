import {
  actualizarTrabajo,
  latidoFrio,
  obtenerTrabajo,
  registrarDisparo,
  ESTADOS_ACTIVOS,
  type Trabajo,
} from "@/lib/trabajos";
import { dispararWorker, modoDisparo } from "@/lib/disparador";
import { error, json, manejarError } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Contexto = { params: Promise<{ id: string; trabajoId: string }> };

/** Espera mínima entre dos pedidos de worker para el mismo trabajo. */
const ESPERA_REDISPARO_MS = 60_000;
/** Después de tantos intentos sin que nadie tome el trabajo, se admite el fallo. */
const MAX_DISPAROS = 6;

/**
 * ¿Hay que volver a pedir un worker?
 *
 * Sí cuando el trabajo tiene cosas por hacer, nadie lo está tocando (latido
 * frío) y hace rato del último pedido. Cubre el caso de un disparo perdido: si
 * GitHub no llegó a arrancar el runner, o el runner murió, el trabajo no queda
 * colgado para siempre.
 */
function necesitaDisparo(trabajo: Trabajo, ahora: number): boolean {
  if (!ESTADOS_ACTIVOS.includes(trabajo.estado)) return false;
  if (!latidoFrio(trabajo, ahora)) return false;
  if (trabajo.disparos >= MAX_DISPAROS) return false;
  const ultimo = trabajo.disparadoEn ? Date.parse(trabajo.disparadoEn) : 0;
  return !Number.isFinite(ultimo) || ahora - ultimo > ESPERA_REDISPARO_MS;
}

/** Se agotaron los intentos y sigue sin arrancar nadie. */
function seRindio(trabajo: Trabajo, ahora: number): boolean {
  if (!ESTADOS_ACTIVOS.includes(trabajo.estado)) return false;
  if (trabajo.disparos < MAX_DISPAROS) return false;
  if (!latidoFrio(trabajo, ahora)) return false;
  const ultimo = trabajo.disparadoEn ? Date.parse(trabajo.disparadoEn) : 0;
  return ahora - ultimo > ESPERA_REDISPARO_MS;
}

/**
 * Progreso del procesamiento. La pantalla lo consulta cada 2 segundos.
 *
 * Además de informar, hace de VIGÍA: si el trabajo debería estar avanzando y
 * nadie lo está tocando, vuelve a pedir un worker. Es la red que evita el "0% —
 * esperando al worker" eterno cuando un disparo se pierde.
 */
export async function GET(_req: Request, { params }: Contexto) {
  try {
    const { id, trabajoId } = await params;
    let trabajo = await obtenerTrabajo(trabajoId);
    if (!trabajo || trabajo.fechaId !== id) return error("El trabajo no existe.", 404);

    const ahora = Date.now();

    if (necesitaDisparo(trabajo, ahora)) {
      const disparo = await dispararWorker(trabajoId, "vigia");
      await registrarDisparo(trabajoId, disparo, trabajo.disparos);
      trabajo = (await obtenerTrabajo(trabajoId)) ?? trabajo;
    } else if (seRindio(trabajo, ahora)) {
      // No se esconde el problema: el trabajo pasa a error con el motivo real,
      // que es lo que se ve en pantalla.
      const detalle =
        trabajo.disparoDetalle ??
        "El worker no respondió a ninguno de los intentos de arranque.";
      await actualizarTrabajo(trabajoId, {
        estado: "error",
        error: detalle,
        mensaje: "No se pudo arrancar el worker que procesa el PDF.",
      });
      trabajo = (await obtenerTrabajo(trabajoId)) ?? trabajo;
    }

    return json({ trabajo, modoDisparo: modoDisparo() });
  } catch (e) {
    return manejarError(e);
  }
}
