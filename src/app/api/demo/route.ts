import { error, json, leerJson, manejarError } from "@/lib/api";
import { borrarDatosDemo, demoHabilitada, restaurarDatosDemo } from "@/lib/servicio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Permite quitar o volver a poner las fechas de demostración desde el panel. */
export async function POST(req: Request) {
  try {
    const { accion } = await leerJson<{ accion?: string }>(req);

    if (accion === "borrar") {
      const borradas = await borrarDatosDemo();
      return json({ ok: true, borradas });
    }

    if (accion === "restaurar") {
      if (!demoHabilitada()) {
        return error(
          "Los datos de demostración están desactivados (DEMO_MODE=off).",
          400,
        );
      }
      await restaurarDatosDemo();
      return json({ ok: true });
    }

    return error('Acción desconocida. Usá "borrar" o "restaurar".', 400);
  } catch (e) {
    return manejarError(e);
  }
}
