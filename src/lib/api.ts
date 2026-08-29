import { NextResponse } from "next/server";
import { ErrorValidacion } from "./servicio";
import { ErrorProcesamiento } from "./pdf/procesar";

export function json(datos: unknown, status = 200): NextResponse {
  return NextResponse.json(datos, {
    status,
    headers: { "Cache-Control": "no-store, private" },
  });
}

export function error(mensaje: string, status = 400): NextResponse {
  return json({ error: mensaje }, status);
}

/** Traduce cualquier excepción a una respuesta entendible, sin filtrar el stack. */
export function manejarError(e: unknown): NextResponse {
  if (e instanceof ErrorValidacion) return error(e.message, 400);
  if (e instanceof ErrorProcesamiento) return error(e.message, 422);
  console.error("[prode] error no controlado:", e);
  return error(
    e instanceof Error ? e.message : "Ocurrió un error inesperado en el servidor.",
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
