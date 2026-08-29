/**
 * Procesa un PDF de boletas ENTERO, sin base de datos y sin servidor, y muestra
 * el ranking. Es la forma rápida de ver qué lee el sistema de un archivo real.
 *
 *   npx tsx scripts/probar-pdf.mts muestras/mananero.pdf scripts/fecha-mananero.json
 *
 * El segundo archivo es la fecha: nombre, cantidad de partidos y resultados
 * oficiales. Mirá scripts/fecha-mananero.json como ejemplo.
 *
 * Hace exactamente lo mismo que el worker (pdfjs, y para las páginas que son
 * imagen el rescate con PyMuPDF/marcas/OCR), así que sirve para probar un PDF
 * nuevo antes de subirlo.
 */

import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { extraerDocumento, MIN_CARACTERES_PAGINA } from "../src/lib/pdf/extraer";
import { combinarPaginas } from "../src/lib/pdf/combinar";
import { analizarYConstruir } from "../src/lib/pdf/procesar";
import { corregirFecha } from "../src/lib/correccion";
import { rescatarPaginas } from "../worker/rescate";
import type { Fecha, Partido, Pronostico } from "../src/lib/tipos";

const rutaPdf = process.argv[2] ?? "muestras/mananero.pdf";
const rutaFecha = process.argv[3] ?? "scripts/fecha-mananero.json";

interface FechaJson {
  nombre: string;
  partidos: { nombre: string; resultado: Pronostico | null }[];
}

const datos = JSON.parse(readFileSync(rutaFecha, "utf8")) as FechaJson;
const ahora = new Date().toISOString();
const partidos: Partido[] = datos.partidos.map((p, i) => ({
  numero: i + 1,
  nombre: p.nombre,
  resultado: p.resultado,
}));
const fecha: Fecha = {
  id: randomUUID(),
  nombre: datos.nombre,
  cantidadPartidos: partidos.length,
  partidos,
  creadaEn: ahora,
  actualizadaEn: ahora,
};

const bytes = new Uint8Array(readFileSync(rutaPdf));
const carpeta = mkdtempSync(path.join(tmpdir(), "prode-prueba-"));
const copia = path.join(carpeta, "entrada.pdf");
writeFileSync(copia, bytes);

console.log(`Leyendo ${rutaPdf} (${(bytes.length / 1024 / 1024).toFixed(1)} MB)...`);
const doc = await extraerDocumento(bytes);
console.log(`  ${doc.paginas.length} páginas, ${doc.totalCaracteres} caracteres con pdfjs`);

let paginas = doc.paginas;
const vacias = doc.paginas.filter((p) => p.caracteres < MIN_CARACTERES_PAGINA).map((p) => p.numero);
if (vacias.length > 0) {
  console.log(`  ${vacias.length} página(s) sin texto: leyendo la imagen...`);
  const rescate = await rescatarPaginas(copia, vacias, 0, path.join(carpeta, "grilla.json"));
  if (rescate.aviso) console.log(`  aviso: ${rescate.aviso}`);
  console.log(`  ${rescate.conMarcas} con grilla de casillas, ${rescate.conOcr} con OCR`);
  const porNumero = new Map(paginas.map((p) => [p.numero, p]));
  for (const p of rescate.paginas) porNumero.set(p.numero, p);
  paginas = [...porNumero.values()].sort((a, b) => a.numero - b.numero);
}
rmSync(carpeta, { recursive: true, force: true });

const resultado = analizarYConstruir(combinarPaginas(paginas), fecha);
console.log(`  estrategia de segmentación: ${resultado.estrategia}`);
console.log(`  boletas detectadas: ${resultado.boletas.length}\n`);

const correccion = corregirFecha(fecha, resultado.boletas);
console.log(
  `${correccion.fecha.nombre} · ${correccion.resumen.boletas} boletas · ` +
    `${correccion.resumen.partidosConResultado} partidos con resultado\n`,
);
console.log("TOP 10");
for (const fila of correccion.ranking.filter((r) => r.posicion <= 10)) {
  console.log(
    `  ${String(fila.posicion).padStart(2)}. ${fila.participante.padEnd(30)} ` +
      `${fila.aciertos}/${fila.partidosEvaluados}  (${fila.porcentaje}%)  ` +
      `página ${fila.paginas.join(", ")}${fila.empatado ? "  [empatado]" : ""}`,
  );
}

const primero = correccion.ranking[0];
if (primero) {
  console.log(`\nDETALLE de ${primero.participante} (página ${primero.paginas.join(", ")})`);
  for (const d of primero.detalle) {
    const icono =
      d.estado === "acierto" ? "OK " : d.estado === "error" ? "MAL" : d.estado === "sin_pronostico" ? "-- " : "   ";
    console.log(
      `  ${String(d.partidoNumero).padStart(2)}. ${(d.nombre || "").padEnd(30)} ` +
        `pronóstico ${(d.opciones.join("/") || "—").padEnd(4)} resultado ${(d.resultado ?? "—").padEnd(2)} ${icono}`,
    );
  }
}
