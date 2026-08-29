/**
 * Compara lo que el sistema lee del PDF de prueba contra la verdad conocida.
 *
 *   npm run pdf:prueba          (genera muestras/boletas-prueba.pdf y su .json)
 *   npx tsx scripts/verificar-prueba.mts
 *
 * El PDF de prueba es difícil a propósito: nombres repetidos, una boleta sin
 * nombre, dobles, un partido sin marcar y boletas partidas entre dos páginas.
 * Este script dice, boleta por boleta y partido por partido, dónde no coincide.
 * Sale con código 1 si hay una sola diferencia, así sirve como prueba de verdad.
 */

import { readFileSync } from "node:fs";
import { extraerDocumento } from "../src/lib/pdf/extraer";
import { analizarDocumento } from "../src/lib/pdf/analizar";

interface Verdad {
  partidos: string[];
  resultados: string[];
  boletas: { numero: string; nombre: string | null; jugadas: string[] }[];
}

const verdad = JSON.parse(readFileSync("muestras/boletas-prueba.json", "utf8")) as Verdad;
const doc = await extraerDocumento(new Uint8Array(readFileSync("muestras/boletas-prueba.pdf")));
const analisis = analizarDocumento(doc, verdad.partidos.length);

console.log(`estrategia: ${analisis.estrategia}`);
console.log(`boletas: ${analisis.boletas.length} (esperadas ${verdad.boletas.length})\n`);

const normalizar = (jugada: string) =>
  jugada
    .split("/")
    .map((p) => p.trim().toUpperCase())
    .filter(Boolean)
    .sort()
    .join("/");

let errores = 0;

if (analisis.boletas.length !== verdad.boletas.length) {
  console.log(`DIFERENCIA: cantidad de boletas`);
  errores += 1;
}

for (let i = 0; i < verdad.boletas.length; i++) {
  const esperada = verdad.boletas[i];
  const leida = analisis.boletas[i];
  if (!leida) {
    console.log(`boleta ${esperada.numero}: no se leyó`);
    errores += 1;
    continue;
  }
  const problemas: string[] = [];
  if (esperada.nombre && leida.participante !== esperada.nombre) {
    problemas.push(`nombre "${leida.participante}" != "${esperada.nombre}"`);
  }
  if (leida.numeroBoleta !== esperada.numero) {
    problemas.push(`número "${leida.numeroBoleta}" != "${esperada.numero}"`);
  }
  for (let j = 0; j < esperada.jugadas.length; j++) {
    const esp = normalizar(esperada.jugadas[j]);
    const obt = normalizar((leida.valores[j]?.opciones ?? []).join("/"));
    if (esp !== obt) problemas.push(`partido ${j + 1}: "${obt}" != "${esp}"`);
  }
  if (problemas.length) {
    errores += problemas.length;
    console.log(`boleta ${esperada.numero} (${esperada.nombre ?? "sin nombre"}):`);
    for (const p of problemas) console.log(`   ${p}`);
  }
}

if (errores === 0) {
  console.log("Todo coincide con la verdad conocida.");
} else {
  console.log(`\n${errores} diferencia(s).`);
  process.exit(1);
}
