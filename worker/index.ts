/**
 * Worker de procesamiento de PDFs.
 *
 * Corre APARTE de Vercel, a propósito: Vercel tiene límites de tiempo, memoria y
 * tamaño de payload que un PDF de cientos de MB no respeta. Este proceso puede
 * vivir en tu computadora o en cualquier host con Node (ver README).
 *
 * Qué hace, en orden:
 *   1. Busca el trabajo pendiente más viejo.
 *   2. Descarga sus partes (cada una un PDF chico ya subido a Storage) UNA POR
 *      VEZ y le extrae el texto. Nunca tiene el PDF completo en memoria: como
 *      mucho una parte (<=45 MB).
 *   3. Después de cada parte guarda el progreso. Ese es el checkpoint: si el
 *      proceso se corta, al reiniciar retoma desde la parte siguiente.
 *   4. Con todas las partes extraídas, analiza una sola vez el documento
 *      completo ya combinado y guarda las boletas.
 *
 *   npm run worker        -- corre para siempre
 *   npm run worker:once   -- procesa un trabajo pendiente y termina
 */

import "./env"; // DEBE ser el primer import: puebla process.env antes que nada.

import { obtenerFecha, reemplazarBoletas, supabaseConfigurado } from "../src/lib/almacen";
import {
  actualizarTrabajo,
  borrarChunksDeStorage,
  borrarPaginasAcumuladas,
  descargarChunk,
  guardarChunkExtraido,
  leerPaginasAcumuladas,
  marcarChunkEstado,
  obtenerTrabajo,
  siguienteTrabajoPendiente,
  type Trabajo,
} from "../src/lib/trabajos";
import { extraerDocumento } from "../src/lib/pdf/extraer";
import { remapPaginas, combinarPaginas } from "../src/lib/pdf/combinar";
import { analizarYConstruir } from "../src/lib/pdf/procesar";

const ESPERA_MS = 3_000;
const REINTENTOS = 3;

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

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

const mensajeDe = (e: unknown) => (e instanceof Error ? e.message : String(e));

async function extraerPartesPendientes(trabajo: Trabajo): Promise<void> {
  // Se reintentan tanto las "subido" (nunca procesadas) como las "error": una
  // parte que falló antes no queda trabada para siempre.
  const pendientes = trabajo.chunks
    .filter((c) => c.estado !== "extraido")
    .sort((a, b) => a.indice - b.indice);

  for (let i = 0; i < pendientes.length; i++) {
    const parte = pendientes[i];
    console.log(
      `[worker] parte ${parte.indice} (páginas ${parte.paginaDesde}-${parte.paginaHasta})`,
    );
    try {
      await conReintentos(async () => {
        const bytes = await descargarChunk(parte.storagePath);
        const doc = await extraerDocumento(bytes);
        const paginas = remapPaginas(doc.paginas, parte.paginaDesde - 1);
        await guardarChunkExtraido(
          trabajo.id,
          parte,
          paginas,
          `Procesando página ${parte.paginaHasta} de ${trabajo.paginasTotales}`,
        );
      }, `parte ${parte.indice}`);
    } catch (e) {
      // Una parte ilegible no puede tumbar el trabajo entero: se marca, se
      // avisa y se sigue con las demás. Las boletas de esas páginas se pierden,
      // pero todas las otras se procesan igual.
      console.warn(`[worker]   parte ${parte.indice} descartada: ${mensajeDe(e)}`);
      await marcarChunkEstado(trabajo.id, parte.indice, "error", mensajeDe(e));
    }
  }
}

async function procesarTrabajo(inicial: Trabajo): Promise<void> {
  const trabajoId = inicial.id;
  try {
    await actualizarTrabajo(trabajoId, {
      estado: "extrayendo",
      mensaje: "Extrayendo el texto del PDF...",
    });

    // Se relee siempre de la base: si el worker se reinició, acá se entera de
    // qué partes ya estaban extraídas antes del corte.
    const trabajo = await obtenerTrabajo(trabajoId);
    if (!trabajo) throw new Error("El trabajo ya no está en la base.");

    await extraerPartesPendientes(trabajo);

    const actualizado = await obtenerTrabajo(trabajoId);
    if (!actualizado) throw new Error("El trabajo ya no está en la base.");

    const extraidas = actualizado.chunks.filter((c) => c.estado === "extraido");
    if (extraidas.length === 0) {
      throw new Error("No se pudo leer ninguna parte del PDF.");
    }

    await actualizarTrabajo(trabajoId, {
      estado: "analizando",
      mensaje: "Detectando boletas en el documento completo...",
    });

    const fecha = await conReintentos(() => obtenerFecha(actualizado.fechaId), "leer la fecha");
    if (!fecha) throw new Error("La fecha de esta carga ya no está en la base de datos.");

    const doc = combinarPaginas(await leerPaginasAcumuladas(trabajoId));
    const resultado = analizarYConstruir(doc, fecha);

    await conReintentos(
      () => reemplazarBoletas(fecha.id, resultado.boletas),
      "guardar las boletas",
    );

    await conReintentos(
      () =>
        actualizarTrabajo(trabajoId, {
          estado: "completado",
          boletas_detectadas: resultado.boletas.length,
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
    console.error(`[worker] trabajo ${trabajoId} falló: ${mensajeDe(e)}`);
    await actualizarTrabajo(trabajoId, {
      estado: "error",
      error: mensajeDe(e),
      mensaje: "El procesamiento se detuvo.",
    }).catch(() => undefined);
  }
}

async function main() {
  const unaVez = process.argv.includes("--once");

  if (!supabaseConfigurado()) {
    console.error(
      "[worker] Faltan SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY. El worker no puede arrancar " +
        "sin Supabase: es donde están las partes del PDF y el progreso. Ver README.",
    );
    process.exit(1);
  }

  console.log(`[worker] arrancando (${unaVez ? "una pasada" : "en bucle"})...`);
  for (;;) {
    const trabajo = await siguienteTrabajoPendiente();
    if (!trabajo) {
      if (unaVez) {
        console.log("[worker] no hay trabajos pendientes.");
        return;
      }
      await dormir(ESPERA_MS);
      continue;
    }
    await procesarTrabajo(trabajo);
    if (unaVez) return;
  }
}

main().catch((e) => {
  console.error("[worker] error fatal:", e);
  process.exit(1);
});
