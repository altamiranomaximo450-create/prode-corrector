/**
 * Genera los PDF de boletas de prueba que acompañan a la demo.
 *
 *   node scripts/generar-pdf-demo.mjs
 *
 * Produce en public/demo/:
 *   - boletas-fecha-12.pdf          14 boletas limpias, 2 por página
 *   - boletas-fecha-12-con-errores.pdf  las mismas + 6 casos problemáticos
 *
 * El formato imita una boleta real de Prode: encabezado con el número de
 * boleta, el nombre del participante, y una grilla de partidos con columnas
 * 1 / X / 2 donde la elección va marcada con una X.
 */

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  PARTIDOS_DEMO,
  BOLETAS_LIMPIAS,
  BOLETAS_PROBLEMATICAS,
} from "../src/lib/datos-demo.ts";

const raizProyecto = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export { PARTIDOS_DEMO, BOLETAS_LIMPIAS, BOLETAS_PROBLEMATICAS };

const ANCHO = 595.28; // A4 en puntos
const ALTO = 841.89;

const COL_X = { "1": 388, X: 428, "2": 468 };

function dibujarBoleta(pagina, fuentes, topeY, boleta) {
  const { normal, negrita } = fuentes;
  const izquierda = 48;
  let y = topeY;

  pagina.drawText("PRODE EL CLUB  -  FECHA 12", {
    x: izquierda,
    y,
    size: 13,
    font: negrita,
    color: rgb(0.08, 0.09, 0.12),
  });
  y -= 18;

  pagina.drawText(`BOLETA N° ${boleta.numero}`, {
    x: izquierda,
    y,
    size: 10,
    font: negrita,
    color: rgb(0.25, 0.28, 0.34),
  });

  if (boleta.nombre) {
    pagina.drawText(`Participante: ${boleta.nombre}`, {
      x: izquierda + 130,
      y,
      size: 10,
      font: normal,
      color: rgb(0.1, 0.1, 0.14),
    });
  }
  y -= 20;

  // Encabezado de columnas
  pagina.drawText("PARTIDO", { x: izquierda, y, size: 8, font: negrita, color: rgb(0.4, 0.42, 0.5) });
  for (const [etiqueta, x] of Object.entries(COL_X)) {
    pagina.drawText(etiqueta, { x, y, size: 9, font: negrita, color: rgb(0.4, 0.42, 0.5) });
  }
  y -= 6;
  pagina.drawLine({
    start: { x: izquierda, y },
    end: { x: 500, y },
    thickness: 0.7,
    color: rgb(0.8, 0.82, 0.86),
  });
  y -= 13;

  for (let i = 0; i < boleta.pron.length; i++) {
    const [local, visitante] = PARTIDOS_DEMO[i];
    pagina.drawText(`${i + 1}`, { x: izquierda, y, size: 9, font: normal, color: rgb(0.45, 0.47, 0.55) });
    pagina.drawText(`${local} vs ${visitante}`, {
      x: izquierda + 18,
      y,
      size: 9.5,
      font: normal,
      color: rgb(0.12, 0.13, 0.18),
    });
    const marcar = (valor) => {
      pagina.drawText("X", {
        x: COL_X[valor],
        y,
        size: 10,
        font: negrita,
        color: rgb(0.05, 0.05, 0.08),
      });
    };
    marcar(boleta.pron[i]);
    if (boleta.dobleEn === i + 1) {
      // segunda marca en la misma fila: un "doble" válido (ej. 1/X)
      marcar(boleta.pron[i] === "1" ? "2" : "1");
    }
    y -= 14;
  }

  y -= 4;
  pagina.drawText("Firma: ____________________", {
    x: izquierda,
    y,
    size: 8,
    font: normal,
    color: rgb(0.55, 0.57, 0.63),
  });
  return y - 10;
}

async function construirPdf(boletas) {
  const pdf = await PDFDocument.create();
  pdf.setTitle("Prode El Club - Fecha 12 - Boletas");
  pdf.setSubject("Boletas de participantes generadas para pruebas del corrector");
  const normal = await pdf.embedFont(StandardFonts.Helvetica);
  const negrita = await pdf.embedFont(StandardFonts.HelveticaBold);
  const fuentes = { normal, negrita };

  for (let i = 0; i < boletas.length; i += 2) {
    const pagina = pdf.addPage([ANCHO, ALTO]);
    dibujarBoleta(pagina, fuentes, ALTO - 60, boletas[i]);
    if (boletas[i + 1]) {
      pagina.drawLine({
        start: { x: 48, y: ALTO / 2 - 6 },
        end: { x: 548, y: ALTO / 2 - 6 },
        thickness: 0.6,
        color: rgb(0.85, 0.86, 0.9),
        dashArray: [4, 4],
      });
      dibujarBoleta(pagina, fuentes, ALTO / 2 - 30, boletas[i + 1]);
    }
  }
  return pdf.save();
}

async function main() {
  const destino = path.join(raizProyecto, "public", "demo");
  await mkdir(destino, { recursive: true });

  const limpio = await construirPdf(BOLETAS_LIMPIAS);
  await writeFile(path.join(destino, "boletas-fecha-12.pdf"), limpio);

  const conErrores = await construirPdf([...BOLETAS_LIMPIAS, ...BOLETAS_PROBLEMATICAS]);
  await writeFile(path.join(destino, "boletas-fecha-12-con-errores.pdf"), conErrores);

  console.log("PDF de demostración generados en public/demo/");
  console.log(`  boletas-fecha-12.pdf              ${BOLETAS_LIMPIAS.length} boletas`);
  console.log(
    `  boletas-fecha-12-con-errores.pdf  ${BOLETAS_LIMPIAS.length + BOLETAS_PROBLEMATICAS.length} boletas (incluye 5 casos problemáticos)`,
  );
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("generar-pdf-demo.mjs")) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
