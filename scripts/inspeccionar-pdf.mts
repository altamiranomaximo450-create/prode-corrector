/**
 * Muestra el texto que el sistema realmente extrae de un PDF, línea por línea.
 * Sirve para entender por qué el analizador lee (o no lee) un dato.
 *
 *   npx tsx scripts/inspeccionar-pdf.mts muestras/boletas-prueba.pdf
 */
import { readFileSync } from "node:fs";
import { extraerDocumento } from "../src/lib/pdf/extraer";

const ruta = process.argv[2] ?? "muestras/boletas-prueba.pdf";
const doc = await extraerDocumento(new Uint8Array(readFileSync(ruta)));

console.log(`${doc.paginas.length} páginas, ${doc.totalCaracteres} caracteres`);
for (const pagina of doc.paginas.slice(0, 2)) {
  console.log(`\n--- página ${pagina.numero} ---`);
  for (const linea of pagina.lineas) console.log(JSON.stringify(linea.texto));
}
