/**
 * Prueba que un procesamiento cortado a la mitad RETOMA desde donde iba.
 *
 *   npx tsx scripts/probar-checkpoint.mts
 *
 * Qué hace, de verdad y contra Supabase:
 *   1. Parte el PDF de prueba en 3 pedazos y los sube a Storage, igual que el
 *      navegador.
 *   2. Arranca el worker y lo MATA de golpe (kill -9, sin avisar) apenas
 *      termina el primer pedazo. Es el peor caso: el runner se cae.
 *   3. Vuelve a arrancarlo y comprueba que:
 *        · los pedazos ya confirmados NO se vuelven a procesar (se mira qué
 *          partes toca el segundo worker, según sus propios logs),
 *        · el trabajo termina completo igual.
 *
 * Sale con código 1 si algo no se cumple.
 */

import "../worker/env";

import { readFileSync } from "node:fs";
import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { PDFDocument } from "pdf-lib";

import { BUCKET_PDFS, guardarFecha, listarBoletas, supabase, supabaseConfigurado } from "../src/lib/almacen";
import { obtenerTrabajo, actualizarTrabajo, crearTrabajo, agregarChunk } from "../src/lib/trabajos";
import type { Fecha } from "../src/lib/tipos";

const RUTA = "muestras/boletas-prueba.pdf";
const PARTES = 3;
const LATIDO_FRIO_MS = "8000";
/** Páginas mínimas del PDF de prueba, para que cada parte lleve trabajo real. */
const PAGINAS_MINIMAS = 900;

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

function fallar(mensaje: string): never {
  console.error(`\nFALLA: ${mensaje}`);
  process.exit(1);
}

if (!supabaseConfigurado()) {
  fallar("faltan SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY (ver .env.local).");
}

/* -------------------------------------------------------------------------- */

console.log("1. Preparando la fecha y el PDF partido en 3...");

const ahora = new Date().toISOString();
const fecha: Fecha = {
  id: randomUUID(),
  nombre: `Checkpoint ${new Date().toLocaleTimeString("es-AR")}`,
  cantidadPartidos: 10,
  partidos: Array.from({ length: 10 }, (_, i) => ({
    numero: i + 1,
    nombre: `Partido ${i + 1}`,
    resultado: (["1", "X", "2"] as const)[i % 3],
  })),
  creadaEn: ahora,
  actualizadaEn: ahora,
};
await guardarFecha(fecha);

const base = await PDFDocument.load(new Uint8Array(readFileSync(RUTA)), { ignoreEncryption: true });

// El PDF de prueba es chico y cada parte se leería en menos de un segundo: no
// habría forma de cortarlo a la mitad. Se repite hasta que cada parte lleve
// trabajo suficiente como para poder matar el proceso mientras trabaja.
const origen = await PDFDocument.create();
while (origen.getPageCount() < PAGINAS_MINIMAS) {
  const copiadas = await origen.copyPages(base, base.getPageIndices());
  for (const p of copiadas) origen.addPage(p);
}
const totalPaginas = origen.getPageCount();
if (totalPaginas < PARTES) fallar(`el PDF de prueba tiene ${totalPaginas} páginas: hacen falta ${PARTES}.`);
console.log(`   PDF de ${totalPaginas} páginas (el de prueba repetido).`);

const trabajo = await crearTrabajo({
  fechaId: fecha.id,
  nombreArchivo: "checkpoint.pdf",
  bytesTotales: 0,
  paginasTotales: totalPaginas,
});

const porParte = Math.ceil(totalPaginas / PARTES);
for (let i = 0; i < PARTES; i++) {
  const desde = i * porParte;
  const hasta = Math.min(desde + porParte, totalPaginas);
  if (desde >= hasta) break;
  const nuevo = await PDFDocument.create();
  const copiadas = await nuevo.copyPages(
    origen,
    Array.from({ length: hasta - desde }, (_, k) => desde + k),
  );
  for (const p of copiadas) nuevo.addPage(p);
  const bytes = await nuevo.save();
  const storagePath = `${fecha.id}/${trabajo.id}/parte-${String(i).padStart(5, "0")}.pdf`;
  const { error } = await supabase()
    .storage.from(BUCKET_PDFS)
    .upload(storagePath, bytes, { contentType: "application/pdf", upsert: true });
  if (error) fallar(`no se pudo subir la parte ${i}: ${error.message}`);
  await agregarChunk(trabajo.id, {
    indice: i,
    paginaDesde: desde + 1,
    paginaHasta: hasta,
    storagePath,
    bytes: bytes.byteLength,
    estado: "subido",
  });
}
await actualizarTrabajo(trabajo.id, { estado: "pendiente", mensaje: "En cola." });
console.log(`   trabajo ${trabajo.id} con ${PARTES} partes, ${totalPaginas} páginas.`);

/* -------------------------------------------------------------------------- */

function arrancarWorker(): ChildProcess {
  return spawn(process.execPath, ["--import", "tsx", "worker/index.ts", "--once"], {
    cwd: process.cwd(),
    env: { ...process.env, PRODE_LATIDO_FRIO_MS: LATIDO_FRIO_MS },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function extraidas(): Promise<number> {
  const t = await obtenerTrabajo(trabajo.id);
  return t ? t.chunks.filter((c) => c.estado === "extraido").length : 0;
}

/**
 * Partes ya confirmadas como extraídas: eso es el checkpoint.
 *
 * Una parte que alcanzó a escribir sus páginas pero no llegó a confirmarse
 * queda a medias a propósito, y rehacerla al reintentar es lo correcto.
 */
async function partesConfirmadas(): Promise<Set<number>> {
  const t = await obtenerTrabajo(trabajo.id);
  return new Set(
    (t?.chunks ?? []).filter((c) => c.estado === "extraido").map((c) => c.indice),
  );
}

/** Qué partes dice el worker que procesó, según sus propios logs. */
function partesProcesadas(salida: string): Set<number> {
  const partes = new Set<number>();
  for (const linea of salida.split("\n")) {
    const m = linea.match(/\[worker\] parte (\d+) \(páginas/);
    if (m) partes.add(Number(m[1]));
  }
  return partes;
}

console.log("\n2. Arrancando el worker y cortándolo a la mitad...");
const primero = arrancarWorker();
let salidaPrimero = "";
primero.stdout?.on("data", (d) => (salidaPrimero += d.toString()));
primero.stderr?.on("data", (d) => (salidaPrimero += d.toString()));

let hechas = 0;
const limite = Date.now() + 180_000;
while (Date.now() < limite) {
  hechas = await extraidas();
  if (hechas >= 1 && hechas < PARTES) break;
  if (hechas >= PARTES) break;
  await dormir(400);
}
if (hechas < 1) fallar(`el worker no llegó a extraer ninguna parte.\n${salidaPrimero}`);
if (hechas >= PARTES) {
  fallar(
    "el worker terminó las 3 partes antes de poder cortarlo: probá con un PDF más grande " +
      "(npm run pdf:prueba 400).",
  );
}

const confirmadasAntes = await partesConfirmadas();
console.log(`   ${hechas} de ${PARTES} partes listas. Matando el proceso de golpe (SIGKILL).`);
primero.kill("SIGKILL");
await dormir(500);

const trabajoCortado = await obtenerTrabajo(trabajo.id);
if (!trabajoCortado) fallar("el trabajo desapareció.");
if (trabajoCortado.estado === "completado") fallar("el trabajo terminó igual: no se cortó nada.");
console.log(`   estado tras el corte: "${trabajoCortado.estado}", ${trabajoCortado.paginasExtraidas} páginas.`);

console.log(`\n3. Esperando a que el latido se enfríe (${LATIDO_FRIO_MS} ms) y reintentando...`);
await dormir(Number(LATIDO_FRIO_MS) + 1500);

const segundo = arrancarWorker();
let salidaSegundo = "";
segundo.stdout?.on("data", (d) => (salidaSegundo += d.toString()));
segundo.stderr?.on("data", (d) => (salidaSegundo += d.toString()));
await new Promise<void>((resolver) => segundo.on("exit", () => resolver()));

const final = await obtenerTrabajo(trabajo.id);
const procesadasPorElSegundo = partesProcesadas(salidaSegundo);

console.log("\n--- Resultado -------------------------------------------------");
console.log(`estado final: ${final?.estado}  ·  boletas: ${final?.boletasDetectadas}`);

let errores = 0;

if (!salidaSegundo.includes("retomando desde el checkpoint")) {
  console.error("FALLA: el segundo worker no dijo que retomaba desde el checkpoint.");
  console.error(salidaSegundo.split("\n").slice(0, 20).join("\n"));
  errores += 1;
} else {
  console.log("OK  el segundo worker retomó desde el checkpoint.");
}

let rehechas = 0;
for (const indice of confirmadasAntes) {
  if (procesadasPorElSegundo.has(indice)) {
    console.error(`FALLA: la parte ${indice} ya estaba confirmada y se volvió a procesar.`);
    rehechas += 1;
  }
}
errores += rehechas;
if (rehechas === 0) {
  console.log(
    `OK  las ${confirmadasAntes.size} parte(s) confirmadas antes del corte no se rehicieron ` +
      `(el segundo worker procesó [${[...procesadasPorElSegundo].join(", ")}]).`,
  );
}

if (final?.estado !== "completado") {
  console.error(`FALLA: el trabajo quedó en "${final?.estado}" (${final?.error ?? "sin error"}).`);
  errores += 1;
} else {
  const boletas = await listarBoletas(fecha.id);
  if (boletas.length === 0) {
    console.error("FALLA: terminó sin guardar ninguna boleta.");
    errores += 1;
  } else {
    console.log(`OK  terminó completo, con ${boletas.length} boletas guardadas.`);
  }
}

// Limpieza: la fecha de prueba no tiene por qué quedar en la base.
await supabase().from("prode_fechas").delete().eq("id", fecha.id);

if (errores > 0) {
  console.error(`\n${errores} problema(s).`);
  process.exit(1);
}
console.log("\nLa reanudación desde checkpoint funciona.");
