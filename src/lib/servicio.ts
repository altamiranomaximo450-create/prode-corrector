/**
 * Lógica de negocio. Las rutas de API no hablan con la base directamente.
 */

import { randomUUID } from "node:crypto";
import { guardarFecha, listarBoletas, obtenerFecha } from "./almacen";
import { corregirFecha } from "./correccion";
import type { Fecha, Partido, Pronostico, ResultadoCorreccion } from "./tipos";

export class ErrorValidacion extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ErrorValidacion";
  }
}

export const MAX_PARTIDOS = 30;

function normalizarResultado(v: unknown): Pronostico | null {
  if (v === null || v === undefined || v === "") return null;
  const s = String(v).trim().toUpperCase();
  if (s === "1" || s === "L") return "1";
  if (s === "X" || s === "E") return "X";
  if (s === "2" || s === "V") return "2";
  throw new ErrorValidacion(`"${v}" no es un resultado válido. Sólo se acepta 1, X o 2.`);
}

export interface EntradaFecha {
  nombre?: unknown;
  cantidadPartidos?: unknown;
  partidos?: unknown;
}

export async function crearFecha(entrada: EntradaFecha): Promise<Fecha> {
  const nombre = String(entrada.nombre ?? "").trim().replace(/\s+/g, " ");
  if (!nombre) throw new ErrorValidacion("Poné un nombre o número para la fecha.");
  if (nombre.length > 120) throw new ErrorValidacion("El nombre de la fecha es demasiado largo.");

  const cantidad = Number(entrada.cantidadPartidos);
  if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > MAX_PARTIDOS) {
    throw new ErrorValidacion(
      `La cantidad de partidos tiene que ser un número entero entre 1 y ${MAX_PARTIDOS}.`,
    );
  }

  if (!Array.isArray(entrada.partidos) || entrada.partidos.length !== cantidad) {
    throw new ErrorValidacion(
      `Se declararon ${cantidad} partidos pero se enviaron ${
        Array.isArray(entrada.partidos) ? entrada.partidos.length : 0
      }.`,
    );
  }

  const partidos: Partido[] = entrada.partidos.map((p, i) => {
    const item = (p ?? {}) as { nombre?: unknown; resultado?: unknown };
    return {
      numero: i + 1,
      // El nombre del partido es opcional: sirve para leer el ranking, no para
      // calcular. Lo que decide el puntaje es el resultado oficial.
      nombre: String(item.nombre ?? "").trim().replace(/\s+/g, " ").slice(0, 80),
      resultado: normalizarResultado(item.resultado),
    };
  });

  const ahora = new Date().toISOString();
  const fecha: Fecha = {
    id: randomUUID(),
    nombre,
    cantidadPartidos: cantidad,
    partidos,
    creadaEn: ahora,
    actualizadaEn: ahora,
  };

  await guardarFecha(fecha);

  // Se relee de la base antes de devolver el id al navegador. Si la escritura
  // no quedó confirmada, el error sale acá y no más tarde como una fecha
  // fantasma que el worker no encuentra.
  const confirmada = await obtenerFecha(fecha.id);
  if (!confirmada) {
    throw new Error("La fecha no quedó guardada en la base de datos. Revisá la conexión con Supabase.");
  }
  return confirmada;
}

/** Ranking y detalle de una fecha. `null` si la fecha no existe. */
export async function obtenerCorreccion(id: string): Promise<ResultadoCorreccion | null> {
  const fecha = await obtenerFecha(id);
  if (!fecha) return null;
  return corregirFecha(fecha, await listarBoletas(id));
}
