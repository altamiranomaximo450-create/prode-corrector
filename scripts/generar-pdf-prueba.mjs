/**
 * Genera un PDF de boletas de prueba para verificar el corrector de punta a
 * punta:  node scripts/generar-pdf-prueba.mjs
 *
 * Produce muestras/boletas-prueba.pdf, que a propósito NO es un caso fácil.
 * Incluye lo que el enunciado exige soportar:
 *   - varias boletas en la misma página,
 *   - una boleta partida entre dos páginas,
 *   - dobles ("1/X": dos marcas en el mismo partido),
 *   - el mismo nombre en tres boletas distintas (no se deduplica: valen las 3),
 *   - una boleta sin nombre legible,
 *   - una boleta con un partido sin ninguna marca.
 *
 * Junto al PDF escribe boletas-prueba.json con lo que DEBERÍA leerse, para
 * poder comparar el resultado del sistema contra la verdad conocida.
 */

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SALIDA = path.join(RAIZ, "muestras");

const ANCHO = 595.28; // A4 en puntos
const ALTO = 841.89;
const COL_X = { "1": 388, X: 428, "2": 468 };
const ALTO_BOLETA = 250;

export const PARTIDOS = [
  "River Plate vs Racing Club",
  "Boca Juniors vs Independiente",
  "Talleres vs Belgrano",
  "San Lorenzo vs Huracan",
  "Estudiantes vs Gimnasia LP",
  "Rosario Central vs Newells",
  "Velez Sarsfield vs Argentinos Jrs",
  "Lanus vs Banfield",
  "Defensa y Justicia vs Tigre",
  "Godoy Cruz vs Instituto",
];

/** Resultados oficiales con los que se corrige. */
export const RESULTADOS = ["1", "X", "2", "1", "1", "X", "1", "2", "X", "1"];

/**
 * Las boletas. Cada pronóstico es "1", "X", "2" o un doble ("1/X"), y "" es un
 * partido sin marcar. `nombre: null` es una boleta sin nombre legible.
 */
export const BOLETAS = [
  { numero: "201", nombre: "Ana Torres",       jugadas: ["1", "X", "2", "1", "1", "X", "1", "2", "X", "1"] },
  { numero: "184", nombre: "Juan Perez",       jugadas: ["1", "X", "2", "1", "1", "X", "1", "2", "X", "2"] },
  { numero: "185", nombre: "Juan Perez",       jugadas: ["2", "X", "2", "1", "1", "X", "1", "2", "X", "1"] },
  { numero: "186", nombre: "Juan Perez",       jugadas: ["1", "1", "1", "1", "1", "1", "1", "1", "1", "1"] },
  { numero: "052", nombre: "Martin Lopez",     jugadas: ["1/X", "X", "2", "1", "2", "X", "1", "2", "1", "1"] },
  { numero: "311", nombre: "Lucas Diaz",       jugadas: ["1", "X/2", "2", "1", "1", "X", "1", "1", "X", "1"] },
  { numero: "097", nombre: "Sofia Ramirez",    jugadas: ["1", "X", "1", "1", "1", "2", "1", "2", "X", "2"] },
  { numero: "233", nombre: "Diego Fernandez",  jugadas: ["X", "X", "2", "1", "1", "1", "2", "2", "X", "1"] },
  { numero: "108", nombre: "Carla Gimenez",    jugadas: ["1", "2", "2", "X", "1", "X", "1", "1", "2", "1"] },
  { numero: "415", nombre: null,               jugadas: ["2", "X", "2", "1", "X", "X", "1", "2", "1", "1"] },
  // Dos partidos sin marcar: uno EN EL MEDIO y otro al final. El del medio es
  // el caso que importa: si el lector se saltea ese renglón en vez de dejarlo
  // vacío, todos los pronósticos siguientes se corren un partido.
  { numero: "076", nombre: "Nicolas Herrera",  jugadas: ["1", "1", "", "2", "1", "2", "1", "2", "X", ""] },
  { numero: "290", nombre: "Valentina Rojas",  jugadas: ["1", "X", "2", "2", "2", "X", "2", "2", "X", "X"] },
  { numero: "144", nombre: "Ezequiel Molina",  jugadas: ["2", "2", "1", "X", "2", "1", "X", "1", "1", "2"] },
  { numero: "358", nombre: "Federico Quiroga", jugadas: ["1", "X", "X", "1", "1", "X", "2", "2", "X", "1"] },
  { numero: "019", nombre: "Marina Acosta",    jugadas: ["X", "1", "2", "1", "1", "2", "1", "X", "X", "1"] },
  { numero: "467", nombre: "Gonzalo Vera",     jugadas: ["1", "X", "2", "X", "1", "X", "1", "1", "2", "1"] },
];

function dibujarBoleta(pagina, fuentes, topeY, boleta) {
  const { normal, negrita } = fuentes;
  const izq = 48;
  let y = topeY;

  pagina.drawText("PRODE EL CLUB  -  FECHA 13", {
    x: izq, y, size: 13, font: negrita, color: rgb(0.08, 0.09, 0.12),
  });
  y -= 18;

  pagina.drawText(`BOLETA N ${boleta.numero}`, {
    x: izq, y, size: 10, font: negrita, color: rgb(0.25, 0.28, 0.34),
  });
  if (boleta.nombre) {
    pagina.drawText(`Participante: ${boleta.nombre}`, {
      x: izq + 130, y, size: 10, font: normal, color: rgb(0.1, 0.1, 0.14),
    });
  }
  y -= 20;

  pagina.drawText("PARTIDO", { x: izq, y, size: 8, font: negrita, color: rgb(0.4, 0.42, 0.5) });
  for (const [etiqueta, x] of Object.entries(COL_X)) {
    pagina.drawText(etiqueta, { x, y, size: 9, font: negrita, color: rgb(0.4, 0.42, 0.5) });
  }
  y -= 6;
  pagina.drawLine({
    start: { x: izq, y }, end: { x: 500, y }, thickness: 0.7, color: rgb(0.8, 0.82, 0.86),
  });
  y -= 13;

  for (let i = 0; i < PARTIDOS.length; i++) {
    pagina.drawText(`${i + 1}. ${PARTIDOS[i]}`, {
      x: izq, y, size: 9, font: normal, color: rgb(0.12, 0.13, 0.18),
    });
    for (const opcion of String(boleta.jugadas[i] ?? "").split("/").filter(Boolean)) {
      const x = COL_X[opcion];
      if (x !== undefined) {
        pagina.drawText("X", { x, y, size: 10, font: negrita, color: rgb(0.05, 0.05, 0.1) });
      }
    }
    y -= 14;
  }
  return y;
}

/**
 * Repite el juego de boletas hasta llegar a `cantidad`, renumerándolas. Sirve
 * para generar un PDF grande con el que probar el procesamiento por partes y el
 * reanudado desde checkpoint:  node scripts/generar-pdf-prueba.mjs 300
 */
function expandir(cantidad) {
  if (!cantidad || cantidad <= BOLETAS.length) return BOLETAS;
  return Array.from({ length: cantidad }, (_, i) => ({
    ...BOLETAS[i % BOLETAS.length],
    numero: String(1000 + i),
  }));
}

async function main() {
  const cantidad = Number(process.argv[2]);
  const boletas = expandir(cantidad);
  const pdf = await PDFDocument.create();
  const fuentes = {
    normal: await pdf.embedFont(StandardFonts.Helvetica),
    negrita: await pdf.embedFont(StandardFonts.HelveticaBold),
  };

  let pagina = pdf.addPage([ANCHO, ALTO]);
  let y = ALTO - 60;

  for (const boleta of boletas) {
    // Si no entra entera, se corta acá y sigue en la página siguiente: así el
    // PDF contiene el caso "una boleta ocupa dos páginas".
    if (y - ALTO_BOLETA < 40) {
      pagina = pdf.addPage([ANCHO, ALTO]);
      y = ALTO - 60;
    }
    y = dibujarBoleta(pagina, fuentes, y, boleta) - 34;
  }

  await mkdir(SALIDA, { recursive: true });
  await writeFile(path.join(SALIDA, "boletas-prueba.pdf"), await pdf.save());
  await writeFile(
    path.join(SALIDA, "boletas-prueba.json"),
    JSON.stringify({ partidos: PARTIDOS, resultados: RESULTADOS, boletas }, null, 2),
  );

  console.log(`${boletas.length} boletas en ${pdf.getPageCount()} páginas -> muestras/boletas-prueba.pdf`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
