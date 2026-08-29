/**
 * Worker de procesamiento de PDFs.
 *
 * Corre APARTE de Vercel, a propósito: Vercel tiene límites de tiempo, memoria y
 * tamaño de payload que un PDF de cientos de MB no respeta. En producción vive
 * en un runner de GitHub Actions que la propia app levanta cuando el usuario
 * aprieta PROCESAR BOLETAS (ver src/lib/disparador.ts y
 * .github/workflows/worker.yml). NADIE tiene que arrancarlo a mano.
 *
 * Qué hace, en orden:
 *   1. Toma el trabajo activo más viejo que nadie esté procesando. "Tomar" es un
 *      compare-and-swap sobre el latido: si dos runners arrancan casi juntos,
 *      uno solo se queda con el trabajo.
 *   2. Descarga sus partes (cada una un PDF chico ya subido a Storage) UNA POR
 *      VEZ y le extrae el texto. Nunca tiene el PDF completo en memoria: como
 *      mucho una parte (<=45 MB).
 *   3. Las páginas que pdfjs deja vacías (escaneos, fuentes rotas) se reintentan
 *      con PyMuPDF y, si tampoco hay texto, con OCR.
 *   4. Después de cada parte guarda el progreso. Ese es el checkpoint: si el
 *      proceso se corta, al reiniciar retoma desde la parte siguiente, no desde
 *      la página 0.
 *   5. Con todas las partes extraídas, analiza una sola vez el documento
 *      completo ya combinado y guarda las boletas.
 *
 *   npm run worker        -- bucle: se queda esperando trabajos (desarrollo)
 *   npm run worker:once   -- drena los trabajos pendientes y termina (Actions)
 */

import "./env"; // DEBE ser el primer import: puebla process.env antes que nada.

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { obtenerFecha, reemplazarBoletas, supabaseConfigurado } from "../src/lib/almacen";
import {
  actualizarTrabajo,
  borrarChunksDeStorage,
  borrarPaginasAcumuladas,
  descargarChunk,
  guardarChunkExtraido,
  latir,
  leerPaginasAcumuladas,
  marcarChunkEstado,
  obtenerTrabajo,
  reclamarTrabajo,
  trabajosTomables,
  type ChunkTrabajo,
  type Trabajo,
} from "../src/lib/trabajos";
import { extraerDocumento, MIN_CARACTERES_PAGINA, type PaginaExtraida } from "../src/lib/pdf/extraer";
import { remapPaginas, combinarPaginas } from "../src/lib/pdf/combinar";
import { analizarYConstruir } from "../src/lib/pdf/procesar";
import { rescatarPaginas } from "./rescate";

const ESPERA_MS = 3_000;
/** Cuánto sigue esperando el modo "drenar" después de vaciar la cola. Cubre la
 *  carrera entre el disparo del worker y el encolado del trabajo. */
const GRACIA_MS = 25_000;
const REINTENTOS = 3;
const LATIDO_MS = 15_000;
/** Cada cuántas páginas se publica el avance dentro de una misma parte. */
const PASO_PROGRESO = 20;

const WORKER_ID = `${process.env.GITHUB_RUN_ID ? `actions-${process.env.GITHUB_RUN_ID}` : "local"}-${randomUUID().slice(0, 8)}`;

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));
const mensajeDe = (e: unknown) => (e instanceof Error ? e.message : String(e));

let apagando = false;

/**
 * Reintenta una operación de red antes de rendirse. Un corte momentáneo (DNS,
 * TLS, un blip del proveedor) no debería abortar un trabajo que lleva minutos.
 */
async function conReintentos<T>(fn: () => Promise<T>, etiqueta: string): Promise<T> {
  let ultimo: unknown;
  for (let i = 1; i <= REINTENTOS; i++) {
    try {
      return await fn();
    } catch (e) {
      ultimo = e;
      console.warn(`[worker]   ${etiqueta}: intento ${i}/${REINTENTOS} falló (${mensajeDe(e)})`);
      if (i < REINTENTOS) await dormir(1500 * i);
    }
  }
  throw ultimo;
}

/* -------------------------------------------------------------------------- */
/*  Extracción de una parte                                                   */
/* -------------------------------------------------------------------------- */

/** Páginas del documento extraído que quedaron sin texto útil. */
function paginasVacias(paginas: PaginaExtraida[]): number[] {
  return paginas.filter((p) => p.caracteres < MIN_CARACTERES_PAGINA).map((p) => p.numero);
}

interface ResultadoParte {
  paginas: PaginaExtraida[];
  rescatadas: number;
}

/**
 * Lee UNA parte del PDF. La parte se escribe primero a un archivo temporal
 * porque pdfjs se queda con el buffer que recibe (lo puede dejar inutilizable),
 * y el rescate con PyMuPDF necesita el mismo PDF después.
 */
async function extraerParte(
  trabajo: Trabajo,
  parte: ChunkTrabajo,
  paginasPrevias: number,
  rutaGrilla: string,
): Promise<ResultadoParte> {
  const carpeta = await mkdtemp(path.join(tmpdir(), "prode-"));
  const rutaPdf = path.join(carpeta, `parte-${parte.indice}.pdf`);
  try {
    const bytes = await descargarChunk(parte.storagePath);
    await writeFile(rutaPdf, bytes);

    let ultimoAviso = 0;
    const doc = await extraerDocumento(bytes, (paginaActual, totalPaginas) => {
      const ahora = Date.now();
      if (paginaActual % PASO_PROGRESO !== 0 && paginaActual !== totalPaginas) return;
      if (ahora - ultimoAviso < 2_000 && paginaActual !== totalPaginas) return;
      ultimoAviso = ahora;
      const global = paginasPrevias + paginaActual;
      // Progreso en vivo DENTRO de la parte. No es un checkpoint (eso lo hace
      // guardarChunkExtraido al final): es sólo para que la pantalla se mueva.
      void latir(trabajo.id, {
        paginas_extraidas: global,
        mensaje: `Leyendo el PDF: página ${global} de ${trabajo.paginasTotales}`,
      }).catch(() => undefined);
    });

    let paginas = remapPaginas(doc.paginas, parte.paginaDesde - 1);

    // Segundo escalón: PyMuPDF y, si hace falta, OCR, sólo para lo que quedó vacío.
    const vacias = paginasVacias(doc.paginas);
    let rescatadas = 0;
    if (vacias.length > 0) {
      console.log(
        `[worker]   ${vacias.length} página(s) sin capa de texto: leyendo la imagen`,
      );
      await latir(trabajo.id, {
        mensaje: `Leyendo ${vacias.length} boleta(s) escaneada(s) de la imagen...`,
      }).catch(() => undefined);

      const rescate = await rescatarPaginas(rutaPdf, vacias, parte.paginaDesde - 1, rutaGrilla);
      if (rescate.aviso) console.warn(`[worker]   ${rescate.aviso}`);
      if (rescate.paginas.length > 0) {
        const porNumero = new Map(paginas.map((p) => [p.numero, p]));
        for (const recuperada of rescate.paginas) {
          const previa = porNumero.get(recuperada.numero);
          if (!previa || recuperada.caracteres > previa.caracteres) {
            porNumero.set(recuperada.numero, recuperada);
          }
        }
        paginas = [...porNumero.values()].sort((a, b) => a.numero - b.numero);
        rescatadas = rescate.paginas.length;
        console.log(
          `[worker]   rescatadas ${rescatadas} página(s): ${rescate.conMarcas} con grilla de ` +
            `casillas, ${rescate.conOcr} con OCR`,
        );
      }
    }

    return { paginas, rescatadas };
  } finally {
    await rm(carpeta, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function extraerPartesPendientes(trabajo: Trabajo): Promise<void> {
  // Se reintentan tanto las "subido" (nunca procesadas) como las "error": una
  // parte que falló antes no queda trabada para siempre.
  const pendientes = trabajo.chunks
    .filter((c) => c.estado !== "extraido")
    .sort((a, b) => a.indice - b.indice);

  const yaExtraidas = trabajo.chunks
    .filter((c) => c.estado === "extraido")
    .reduce((s, c) => s + (c.paginaHasta - c.paginaDesde + 1), 0);

  if (pendientes.length < trabajo.chunks.length) {
    console.log(
      `[worker] retomando desde el checkpoint: ${trabajo.chunks.length - pendientes.length} de ` +
        `${trabajo.chunks.length} parte(s) ya estaban listas (${yaExtraidas} páginas).`,
    );
  }

  let acumuladas = yaExtraidas;

  // La grilla de casillas de una boleta gráfica se deduce mirando muchas
  // boletas a la vez. Se guarda acá para que una parte con pocas páginas pueda
  // reusar la que aprendieron las anteriores: es la misma plantilla.
  const rutaGrilla = path.join(tmpdir(), `prode-grilla-${trabajo.id}.json`);

  for (const parte of pendientes) {
    if (apagando) throw new Error("El worker se está apagando.");
    console.log(
      `[worker] parte ${parte.indice} (páginas ${parte.paginaDesde}-${parte.paginaHasta})`,
    );
    try {
      const { paginas, rescatadas } = await conReintentos(
        () => extraerParte(trabajo, parte, acumuladas, rutaGrilla),
        `parte ${parte.indice}`,
      );
      await guardarChunkExtraido(trabajo.id, parte, paginas, {
        mensaje: `Leyendo el PDF: página ${parte.paginaHasta} de ${trabajo.paginasTotales}`,
        paginasRescatadas: rescatadas,
      });
      acumuladas += parte.paginaHasta - parte.paginaDesde + 1;
    } catch (e) {
      if (apagando) throw e;
      // Una parte ilegible no puede tumbar el trabajo entero: se marca, se
      // avisa y se sigue con las demás. Las boletas de esas páginas se pierden,
      // pero todas las otras se procesan igual.
      console.warn(`[worker]   parte ${parte.indice} descartada: ${mensajeDe(e)}`);
      await marcarChunkEstado(trabajo.id, parte.indice, "error", mensajeDe(e));
      acumuladas += parte.paginaHasta - parte.paginaDesde + 1;
    }
  }
}

/* -------------------------------------------------------------------------- */
/*  Un trabajo completo                                                       */
/* -------------------------------------------------------------------------- */

async function procesarTrabajo(inicial: Trabajo): Promise<void> {
  const trabajoId = inicial.id;

  // Latido de fondo: mientras este intervalo corra, nadie más toma el trabajo.
  const pulso = setInterval(() => {
    void latir(trabajoId).catch(() => undefined);
  }, LATIDO_MS);

  try {
    // Se relee de la base: si el worker se reinició, acá se entera de qué
    // partes ya estaban extraídas antes del corte.
    const trabajo = await obtenerTrabajo(trabajoId);
    if (!trabajo) throw new Error("El trabajo ya no está en la base.");

    await extraerPartesPendientes(trabajo);

    const actualizado = await obtenerTrabajo(trabajoId);
    if (!actualizado) throw new Error("El trabajo ya no está en la base.");

    const extraidas = actualizado.chunks.filter((c) => c.estado === "extraido");
    if (extraidas.length === 0) {
      throw new Error("No se pudo leer ninguna parte del PDF.");
    }

    await latir(trabajoId, {
      estado: "analizando",
      mensaje: "Detectando boletas en el documento completo...",
    });

    const fecha = await conReintentos(() => obtenerFecha(actualizado.fechaId), "leer la fecha");
    if (!fecha) throw new Error("La fecha de esta carga ya no está en la base de datos.");

    const doc = combinarPaginas(await leerPaginasAcumuladas(trabajoId));
    const resultado = analizarYConstruir(doc, fecha);

    await latir(trabajoId, {
      estado: "guardando",
      boletas_detectadas: resultado.boletas.length,
      mensaje: `${resultado.boletas.length} boletas detectadas. Guardando...`,
    });

    await conReintentos(
      () =>
        reemplazarBoletas(fecha.id, resultado.boletas, (guardadas) => {
          void latir(trabajoId, {
            boletas_guardadas: guardadas,
            mensaje: `Guardando boletas: ${guardadas} de ${resultado.boletas.length}`,
          }).catch(() => undefined);
        }),
      "guardar las boletas",
    );

    await conReintentos(
      () =>
        actualizarTrabajo(trabajoId, {
          estado: "completado",
          boletas_detectadas: resultado.boletas.length,
          boletas_guardadas: resultado.boletas.length,
          mensaje: `Listo: ${resultado.boletas.length} boletas procesadas.`,
        }),
      "marcar completado",
    );
    console.log(
      `[worker] trabajo ${trabajoId} completado: ${resultado.boletas.length} boletas ` +
        `(estrategia "${resultado.estrategia}").`,
    );

    // Limpieza best-effort: el progreso por parte y los PDFs subidos ya no
    // hacen falta. Si falla no pasa nada: el resultado ya quedó guardado.
    try {
      await borrarPaginasAcumuladas(trabajoId);
      await borrarChunksDeStorage(actualizado.chunks.map((c) => c.storagePath));
    } catch (e) {
      console.warn(`[worker] no se pudo limpiar ${trabajoId}: ${mensajeDe(e)}`);
    }
  } catch (e) {
    if (apagando) {
      // Corte controlado: el trabajo NO es un error. Se suelta con el latido en
      // blanco para que el próximo worker lo retome desde el último checkpoint.
      console.warn(`[worker] soltando ${trabajoId} por apagado: se retomará desde el checkpoint.`);
      await actualizarTrabajo(trabajoId, {
        latido_en: null,
        worker: null,
        mensaje: "Reanudando desde el último checkpoint...",
      }).catch(() => undefined);
      return;
    }
    console.error(`[worker] trabajo ${trabajoId} falló: ${mensajeDe(e)}`);
    await actualizarTrabajo(trabajoId, {
      estado: "error",
      error: mensajeDe(e),
      mensaje: "El procesamiento se detuvo.",
    }).catch(() => undefined);
  } finally {
    clearInterval(pulso);
  }
}

/** Toma y procesa un trabajo. `false` si no había ninguno disponible. */
async function procesarSiguiente(): Promise<boolean> {
  const candidatos = await trabajosTomables();
  for (const candidato of candidatos) {
    if (apagando) return false;
    if (!(await reclamarTrabajo(candidato, WORKER_ID))) {
      console.log(`[worker] ${candidato.id} ya lo tomó otro worker.`);
      continue;
    }
    console.log(`[worker] tomando ${candidato.id} (${candidato.nombreArchivo}).`);
    await procesarTrabajo(candidato);
    return true;
  }
  return false;
}

async function main() {
  // --once: drena la cola y termina (es el modo de GitHub Actions).
  // sin flag: bucle infinito (desarrollo).
  const drenar = process.argv.includes("--once") || process.argv.includes("--drenar");

  if (!supabaseConfigurado()) {
    console.error(
      "[worker] Faltan SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY. El worker no puede arrancar " +
        "sin Supabase: es donde están las partes del PDF y el progreso. Ver README.",
    );
    process.exit(1);
  }

  for (const senal of ["SIGINT", "SIGTERM"] as const) {
    process.on(senal, () => {
      if (apagando) process.exit(1);
      apagando = true;
      console.log(`[worker] ${senal} recibido: soltando el trabajo en curso...`);
    });
  }

  console.log(`[worker] ${WORKER_ID} arrancando (${drenar ? "drenar la cola" : "bucle"})...`);

  let vacioDesde = Date.now();
  while (!apagando) {
    const hubo = await procesarSiguiente();
    if (hubo) {
      vacioDesde = Date.now();
      continue;
    }
    if (drenar) {
      if (Date.now() - vacioDesde > GRACIA_MS) {
        console.log("[worker] no quedan trabajos pendientes.");
        return;
      }
    }
    await dormir(ESPERA_MS);
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("[worker] error fatal:", e);
    process.exit(1);
  });
