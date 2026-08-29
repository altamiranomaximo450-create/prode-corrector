import { NextResponse } from "next/server";
import { ErrorValidacion } from "./servicio";
import { ErrorProcesamiento } from "./pdf/procesar";

/** Respuesta JSON con cabeceras que impiden que un proxy cachee datos privados. */
export function json(datos: unknown, status = 200): NextResponse {
  return NextResponse.json(datos, {
    status,
    headers: { "Cache-Control": "no-store, private" },
  });
}

export function error(mensaje: string, status = 400, extra?: Record<string, unknown>) {
  return json({ error: mensaje, ...extra }, status);
}

/**
 * Traduce cualquier excepción a una respuesta entendible.
 * Los errores inesperados se registran en el servidor pero no se devuelven al
 * cliente con su stack: podrían filtrar rutas o configuración.
 */
export function manejarError(e: unknown): NextResponse {
  if (e instanceof ErrorValidacion) {
    return error(e.message, 400, e.campo ? { campo: e.campo } : undefined);
  }
  if (e instanceof ErrorProcesamiento) {
    return error(e.message, 422, { diagnostico: e.diagnostico ?? null });
  }
  console.error("[prode] error no controlado:", e);
  return error(
    "Ocurrió un error inesperado en el servidor. Revisá los registros para el detalle.",
    500,
  );
}

export async function leerJson<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new ErrorValidacion("El cuerpo de la petición no es JSON válido.");
  }
}
