/**
 * Convierte un documento ya extraído en las boletas de una fecha.
 *
 * No lee ningún PDF: recibe el texto y las coordenadas ya extraídas. Así el
 * worker puede procesar el archivo por partes sin tener nunca el PDF completo
 * en memoria, y analizar una sola vez el documento combinado.
 *
 * Nada de lo que pase con una boleta detiene a las demás: lo que no se pudo
 * leer queda vacío (vale 0 en esa boleta) y el procesamiento continúa.
 */

import { randomUUID } from "node:crypto";
import { analizarDocumento } from "./analizar";
import type { DocumentoExtraido } from "./extraer";
import type { Boleta, Fecha } from "../tipos";

export class ErrorProcesamiento extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ErrorProcesamiento";
  }
}

export interface ResultadoProceso {
  boletas: Boleta[];
  estrategia: string;
  paginas: number;
}

export function analizarYConstruir(doc: DocumentoExtraido, fecha: Fecha): ResultadoProceso {
  // Sólo se corta si NO hay una sola letra en todo el documento: ahí no hay
  // nada que interpretar (un PDF escaneado sin capa de texto). Que algunas
  // páginas vengan vacías no es motivo para detener nada.
  if (!doc.tieneCapaTexto) {
    throw new ErrorProcesamiento(
      "El PDF no tiene texto: parece un escaneo o una foto. Volvé a exportarlo desde el " +
        "programa que genera las boletas, eligiendo PDF con texto en vez de imagen.",
    );
  }

  const analisis = analizarDocumento(doc, fecha.cantidadPartidos);
  const ahora = new Date().toISOString();

  const boletas: Boleta[] = analisis.boletas.map((cruda, i) => ({
    id: randomUUID(),
    fechaId: fecha.id,
    orden: i,
    // Sin nombre legible se usa una etiqueta con la página: la boleta cuenta
    // igual, y el operador puede ubicarla en el PDF para leerla a ojo.
    participante:
      cruda.participante ??
      `Sin nombre (página ${cruda.paginas[0] ?? "?"}${cruda.numeroBoleta ? `, boleta ${cruda.numeroBoleta}` : ""})`,
    numeroBoleta: cruda.numeroBoleta,
    paginas: cruda.paginas,
    pronosticos: cruda.valores.map((v, j) => ({
      partidoNumero: j + 1,
      opciones: v.opciones,
      evidencia: v.evidencia,
      pagina: v.pagina,
    })),
    textoCrudo: cruda.textoCrudo,
    creadaEn: ahora,
  }));

  if (boletas.length === 0) {
    throw new ErrorProcesamiento(
      "No se reconoció ninguna boleta en el PDF. Revisá que sea el archivo de boletas y que " +
        "la cantidad de partidos de la fecha coincida con la de las boletas.",
    );
  }

  return { boletas, estrategia: analisis.estrategia, paginas: doc.paginas.length };
}
