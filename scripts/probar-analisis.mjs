/**
 * Banco de pruebas del lector de PDF.
 *
 *   node scripts/probar-analisis.mjs [ruta.pdf] [cantidadPartidos]
 *
 * Corre la extracción y el análisis sobre un PDF real e imprime, boleta por
 * boleta, qué leyó y qué problemas detectó. Es la herramienta para verificar
 * el sistema contra un PDF nuevo antes de confiar en él.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extraerDocumento } from "../src/lib/pdf/extraer.ts";
import { analizarDocumento } from "../src/lib/pdf/analizar.ts";
import { PARTIDOS_DEMO } from "./generar-pdf-demo.mjs";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const ruta =
  process.argv[2] ?? path.join(raiz, "public", "demo", "boletas-fecha-12-con-errores.pdf");
const cantidadPartidos = Number(process.argv[3] ?? 10);

const partidos = PARTIDOS_DEMO.slice(0, cantidadPartidos).map(([local, visitante], i) => ({
  numero: i + 1,
  local,
  visitante,
  resultado: null,
}));

const datos = new Uint8Array(await readFile(ruta));
const inicio = Date.now();
const doc = await extraerDocumento(datos, (p, t) => {
  if (p === t) process.stdout.write(`  paginas leidas: ${t}\n`);
});

console.log("=".repeat(78));
console.log("ARCHIVO:", path.basename(ruta));
console.log("paginas:", doc.paginas.length);
console.log("caracteres:", doc.totalCaracteres);
console.log("capa de texto:", doc.tieneCapaTexto ? "SI" : "NO (requiere OCR)");
console.log("paginas sin texto:", doc.paginasSinTexto.join(", ") || "ninguna");

const analisis = analizarDocumento(doc, { cantidadPartidos, partidos });

console.log("-".repeat(78));
console.log("estrategias evaluadas:");
for (const e of analisis.estrategiasEvaluadas) {
  const marca = e.nombre === analisis.estrategia ? " <== elegida" : "";
  console.log(`  ${e.nombre.padEnd(26)} boletas=${String(e.boletas).padStart(3)}  puntaje=${String(e.puntaje).padStart(7)}${marca}`);
}
console.log("-".repeat(78));
console.log(`boletas detectadas: ${analisis.boletas.length}`);
console.log(`tiempo: ${Date.now() - inicio} ms`);
console.log("=".repeat(78));

let ok = 0;
for (const b of analisis.boletas) {
  const errores = b.problemas.filter((p) => p.severidad === "error");
  const avisos = b.problemas.filter((p) => p.severidad === "aviso");
  if (errores.length === 0) ok += 1;
  const pron = b.valores.map((v) => v.valor ?? "?").join(" ");
  console.log(
    `${errores.length ? "!!" : "ok"}  #${(b.numeroBoleta ?? "---").padStart(3)}  ${(b.participante ?? "(sin nombre)").padEnd(20)}  [${pron}]  modo=${b.metodo} p.${b.paginas.join(",")}`,
  );
  for (const p of errores) console.log(`      ERROR  ${p.codigo}: ${p.mensaje}`);
  for (const p of avisos) console.log(`      aviso  ${p.codigo}: ${p.mensaje}`);
}
console.log("-".repeat(78));
console.log(`sin errores: ${ok} / ${analisis.boletas.length}`);
