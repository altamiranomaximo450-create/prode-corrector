import { describe, expect, it } from "vitest";
import { agruparEnLineas, type PaginaExtraida, type Token } from "../src/lib/pdf/extraer";
import { combinarPaginas } from "../src/lib/pdf/combinar";
import { analizarDocumento } from "../src/lib/pdf/analizar";

/**
 * Boletas que son una IMAGEN.
 *
 * worker/extraer.py, cuando una página no tiene texto, mira la imagen, encuentra
 * las casillas marcadas y las TRANSCRIBE como si la boleta estuviera escrita:
 * un encabezado "1 X 2" arriba y una marca en la casilla elegida. Estas pruebas
 * arman esa transcripción tal cual y verifican que el analizador de siempre la
 * lea bien, con sus dobles y sus nombres repetidos.
 *
 * Es la costura entre el detector de imágenes (Python) y el analizador
 * (TypeScript): si alguien cambia el formato de una de las dos partes sin la
 * otra, esto falla.
 */

const COLUMNAS = [281.5, 320.7, 357.4]; // como salen del detector, en puntos
const PRIMERA_FILA = 155.3;
const PASO = 41.9;
const ALTO_PAGINA = 841.89;
const MARCA = "●";

type Jugada = ("1" | "X" | "2")[];

/** Arma una página como la que transcribe worker/extraer.py. */
function paginaGrafica(numero: number, nombre: string | null, jugadas: Jugada[]): PaginaExtraida {
  const tokens: Token[] = [];
  const poner = (texto: string, x: number, yArriba: number, ancho: number, alto: number) => {
    tokens.push({
      pagina: numero,
      texto,
      x: x - ancho / 2,
      y: ALTO_PAGINA - yArriba - alto / 2,
      ancho,
      alto,
    });
  };

  const espacio = Math.min(PASO, PRIMERA_FILA);
  if (nombre) {
    const texto = `Participante: ${nombre}`;
    poner(texto, COLUMNAS[1], PRIMERA_FILA - espacio * 0.9, texto.length * 4.5, 9);
  }
  ["1", "X", "2"].forEach((etiqueta, j) => {
    poner(etiqueta, COLUMNAS[j], PRIMERA_FILA - espacio * 0.45, 6, 8);
  });
  jugadas.forEach((opciones, fila) => {
    for (const opcion of opciones) {
      const columna = { "1": 0, X: 1, "2": 2 }[opcion];
      poner(MARCA, COLUMNAS[columna], PRIMERA_FILA + fila * PASO, 8, 8);
    }
  });

  const lineas = agruparEnLineas(tokens, numero);
  return {
    numero,
    ancho: 595.28,
    alto: ALTO_PAGINA,
    tokens,
    lineas,
    caracteres: tokens.reduce((s, t) => s + t.texto.length, 0),
  };
}

const SIMPLE: Jugada[] = [["1"], ["X"], ["2"], ["1"], ["1"], ["X"]];

describe("boletas gráficas (casillas detectadas en la imagen)", () => {
  it("lee el pronóstico de cada partido por la columna marcada", () => {
    const doc = combinarPaginas([
      paginaGrafica(1, "Ana Torres", SIMPLE),
      paginaGrafica(2, "Beto Diaz", SIMPLE),
      paginaGrafica(3, "Caro Luna", SIMPLE),
    ]);
    const analisis = analizarDocumento(doc, 6);

    expect(analisis.boletas).toHaveLength(3);
    expect(analisis.boletas[0].participante).toBe("Ana Torres");
    expect(analisis.boletas[0].valores.map((v) => v.opciones)).toEqual([
      ["1"], ["X"], ["2"], ["1"], ["1"], ["X"],
    ]);
  });

  it("dos casillas marcadas en la misma fila son un doble", () => {
    const conDoble: Jugada[] = [["1", "X"], ["X"], ["2"], ["1"], ["1"], ["2", "1"]];
    const doc = combinarPaginas([
      paginaGrafica(1, "Ana Torres", conDoble),
      paginaGrafica(2, "Beto Diaz", SIMPLE),
      paginaGrafica(3, "Caro Luna", SIMPLE),
    ]);
    const analisis = analizarDocumento(doc, 6);
    const ana = analisis.boletas.find((b) => b.participante === "Ana Torres");

    expect(new Set(ana!.valores[0].opciones)).toEqual(new Set(["1", "X"]));
    expect(new Set(ana!.valores[5].opciones)).toEqual(new Set(["1", "2"]));
  });

  it("una fila sin marcar queda sin pronóstico, sin correr a las demás", () => {
    const conHueco: Jugada[] = [["1"], [], ["2"], ["1"], ["1"], ["X"]];
    const doc = combinarPaginas([
      paginaGrafica(1, "Ana Torres", conHueco),
      paginaGrafica(2, "Beto Diaz", SIMPLE),
      paginaGrafica(3, "Caro Luna", SIMPLE),
    ]);
    const ana = analizarDocumento(doc, 6).boletas.find((b) => b.participante === "Ana Torres")!;

    expect(ana.valores[1].opciones).toEqual([]);
    // Lo importante: el partido 3 sigue siendo el partido 3.
    expect(ana.valores[2].opciones).toEqual(["2"]);
    expect(ana.valores[5].opciones).toEqual(["X"]);
  });

  it("no deduplica: el mismo nombre en tres boletas son tres boletas", () => {
    const doc = combinarPaginas([
      paginaGrafica(1, "Juan Perez", SIMPLE),
      paginaGrafica(2, "Juan Perez", [["2"], ["X"], ["2"], ["1"], ["1"], ["X"]]),
      paginaGrafica(3, "Juan Perez", [["X"], ["X"], ["2"], ["1"], ["1"], ["X"]]),
    ]);
    const analisis = analizarDocumento(doc, 6);

    expect(analisis.boletas.filter((b) => b.participante === "Juan Perez")).toHaveLength(3);
  });

  it("una boleta sin nombre legible entra igual al ranking", () => {
    const doc = combinarPaginas([
      paginaGrafica(1, null, SIMPLE),
      paginaGrafica(2, "Beto Diaz", SIMPLE),
      paginaGrafica(3, "Caro Luna", SIMPLE),
    ]);
    const analisis = analizarDocumento(doc, 6);
    const sinNombre = analisis.boletas.find((b) => b.paginas.includes(1))!;

    expect(sinNombre.participante).toBeNull();
    expect(sinNombre.valores.filter((v) => v.opciones.length > 0)).toHaveLength(6);
  });
});
