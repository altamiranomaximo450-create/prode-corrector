/**
 * Worker de procesamiento de PDFs grandes.
 *
 * Corre APARTE de Vercel (a propósito: Vercel tiene límites de tiempo,
 * memoria y tamaño de payload que un PDF de cientos de MB no respeta). Este
 * proceso puede vivir en tu computadora, en un servidor propio, o en
 * cualquier host que corra Node -- ver el README, sección "PDFs grandes".
 *
 * Qué hace, en el orden real:
 *   1. Busca en `prode_trabajos` el trabajo más viejo pendiente de procesar.
 *   2. Descarga sus chunks (cada uno un PDF chico, subido antes directo a
 *      Supabase Storage) UNO A LA VEZ y extrae el texto de cada uno con
 *      pdfjs-dist. Nunca tiene el PDF completo en memoria: como mucho, un
 *      chunk (<=47 MB) por vez.
 *   3. Después de cada chunk, guarda el progreso en la base (qué chunk quedó
 *      extraído, y las páginas ya extraídas). Ese es el checkpoint real: si
 *      este proceso se corta acá, al reiniciar retoma desde el próximo chunk
 *      sin volver a procesar los anteriores.
 *   4. Cuando ya se extrajeron todos los chunks, corre el mismo motor de
 *      análisis que usa la carga chica (`analizarYConstruir`) una única vez
 *      sobre el documento completo ya combinado, y guarda las boletas.
 *
 * Uso:
 *   npm run worker         -- corre para siempre, reintentando cada 5s
 *   npm run worker:once    -- procesa un solo trabajo pendiente y termina
 */

import "./env"; // DEBE ser el primer import: pobla process.env antes que todo lo demás.

import { almacenSupabase } from "../src/lib/almacen/supabase";
import {
  guardarChunkExtraido,
  marcarChunkEstado,
  actualizarTrabajo,
  obtenerTrabajo,
  siguienteTrabajoPendiente,
  descargarChunk,
  leerPaginasAcumuladas,
  borrarPaginasAcumuladas,
  supabaseAdminConfigurado,
  type Trabajo,
} from "../src/lib/almacen/trabajos";
import { extraerDocumento } from "../src/lib/pdf/extraer";
import { remapPaginas, combinarPaginas } from "../src/lib/pdf/combinar";
import { analizarYConstruir } from "../src/lib/pdf/procesar";

const ESPERA_MS = 5_000;
const REINTENTOS_POR_CHUNK = 3;

function dormir(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Reintenta una operación de red un par de veces antes de darse por vencido.
 * Una caída de conexión momentánea (DNS, TLS, un blip del proveedor) no debería
 * abortar todo un trabajo que puede llevar minutos: sólo se rinde si el error
 * persiste.
 */
async function conReintentos<T>(fn: () => Promise<T>, intentos: number, etiqueta: string): Promise<T> {
  let ultimoError: unknown;
  for (let i = 1; i <= intentos; i++) {
    try {
      return await fn();
    } catch (e) {
      ultimoError = e;
      const mensaje = e instanceof Error ? e.message : String(e);
      console.warn(`[worker]   ${etiqueta}: intento ${i}/${intentos} falló (${mensaje})`);
      if (i < intentos) await dormir(1500 * i);
    }
  }
  throw ultimoError;
}

async function extraerChunksPendientes(trabajo: Trabajo): Promise<void> {
  // Se reintentan tanto los "subido" (nunca procesados) como los "error"
  // (fallaron antes): un chunk en error no queda trabado para siempre.
  const pendientes = trabajo.chunks
    .filter((c) => c.estado === "subido" || c.estado === "error")
    .sort((a, b) => a.indice - b.indice);

  for (let i = 0; i < pendientes.length; i++) {
    const chunk = pendientes[i];
    console.log(
      `[worker] trabajo ${trabajo.id}: extrayendo chunk ${chunk.indice} (páginas ${chunk.paginaDesde}-${chunk.paginaHasta})`,
    );
    try {
      await conReintentos(
        async () => {
          const bytes = await descargarChunk(chunk.storagePath);
          const doc = await extraerDocumento(bytes);
          const offset = chunk.paginaDesde - 1;
          const paginasGlobales = remapPaginas(doc.paginas, offset);
          await guardarChunkExtraido(
            trabajo.id,
            chunk,
            paginasGlobales,
            `Procesando página ${chunk.paginaHasta} de ${trabajo.paginasTotales} (${pendientes.length - i - 1} chunk(s) restantes).`,
          );
          console.log(`[worker]   chunk ${chunk.indice} extraído (páginas ${chunk.paginaDesde}-${chunk.paginaHasta})`);
        },
        REINTENTOS_POR_CHUNK,
        `chunk ${chunk.indice}`,
      );
    } catch (e) {
      const mensaje = e instanceof Error ? e.message : String(e);
      await marcarChunkEstado(trabajo.id, chunk.indice, "error", mensaje);
      throw new Error(`Falló al extraer el chunk ${chunk.indice} tras ${REINTENTOS_POR_CHUNK} intentos: ${mensaje}`);
    }
  }
}

async function procesarTrabajo(trabajoInicial: Trabajo): Promise<void> {
  const trabajoId = trabajoInicial.id;
  try {
    if (trabajoInicial.estado === "pendiente") {
      await actualizarTrabajo(trabajoId, {
        estado: "extrayendo",
        mensaje: "Empezando a extraer el texto del PDF...",
      });
    }

    // Se relee siempre desde la base: si el worker se reinició, acá es donde
    // se entera de qué chunks ya estaban extraídos antes del corte.
    const trabajo = await obtenerTrabajo(trabajoId);
    if (!trabajo) throw new Error("El trabajo desapareció.");

    await extraerChunksPendientes(trabajo);

    const actualizado = await obtenerTrabajo(trabajoId);
    if (!actualizado) throw new Error("El trabajo desapareció.");
    const faltan = actualizado.chunks.filter((c) => c.estado !== "extraido");
    if (faltan.length > 0) {
      throw new Error(`${faltan.length} chunk(s) no se pudieron extraer.`);
    }

    await actualizarTrabajo(trabajoId, {
      estado: "analizando",
      mensaje: "Detectando boletas en el documento completo...",
    });

    const fecha = await conReintentos(
      () => almacenSupabase.obtenerFecha(actualizado.fechaId),
      REINTENTOS_POR_CHUNK,
      "leer la fecha",
    );
    if (!fecha) throw new Error("La fecha de esta carga ya no existe.");

    const paginas = await leerPaginasAcumuladas(trabajoId);
    const doc = combinarPaginas(paginas);

    const resultado = await analizarYConstruir(
      doc,
      actualizado.nombreArchivo,
      actualizado.bytesTotales,
      fecha,
      (evento) => console.log(`[worker]   ${evento.etapa}: ${evento.mensaje ?? ""}`),
    );

    await conReintentos(
      () => almacenSupabase.reemplazarBoletas(fecha.id, resultado.boletas),
      REINTENTOS_POR_CHUNK,
      "guardar boletas",
    );
    fecha.diagnostico = resultado.diagnostico;
    fecha.estado = fecha.partidos.every((p) => p.resultado !== null) ? "corregida" : "procesada";
    fecha.actualizadaEn = new Date().toISOString();
    fecha.auditoria.push({
      fecha: fecha.actualizadaEn,
      accion: "procesar-pdf-grande",
      detalle: `Archivo "${actualizado.nombreArchivo}" (${resultado.diagnostico.paginas} páginas, ${actualizado.chunks.length} chunks): ${resultado.boletas.length} boletas con la estrategia "${resultado.diagnostico.estrategiaSegmentacion}".`,
    });
    await conReintentos(() => almacenSupabase.guardarFecha(fecha), REINTENTOS_POR_CHUNK, "guardar la fecha");

    // Las boletas ya están guardadas (paso anterior): esto sólo actualiza el
    // estado que ve el panel. Si el proceso se cae justo acá, al reintentar
    // vuelve a analizar y guardar lo mismo -- no se pierde ni se duplica nada.
    await conReintentos(
      () =>
        actualizarTrabajo(trabajoId, {
          estado: "completado",
          boletas_detectadas: resultado.boletas.length,
          mensaje: `Listo: ${resultado.boletas.length} boletas procesadas.`,
        }),
      REINTENTOS_POR_CHUNK,
      "marcar completado",
    );
    console.log(`[worker] trabajo ${trabajoId} completado: ${resultado.boletas.length} boletas.`);

    // Limpieza best-effort: las filas de progreso por chunk ya no hacen
    // falta. Si esto falla no pasa nada grave (quedan huérfanas, sin afectar
    // el resultado ya guardado), así que no debe hacer fallar el trabajo.
    try {
      await borrarPaginasAcumuladas(trabajoId);
    } catch (e) {
      console.warn(`[worker] no se pudo limpiar el progreso de ${trabajoId}:`, e);
    }
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : String(e);
    console.error(`[worker] trabajo ${trabajoId} falló:`, mensaje);
    await actualizarTrabajo(trabajoId, { estado: "error", error: mensaje, mensaje: "Se detuvo por un error." });
  }
}

async function main() {
  const unaVez = process.argv.includes("--once");

  if (!supabaseAdminConfigurado()) {
    console.error(
      "[worker] Falta SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY. El worker no puede arrancar sin Supabase " +
        "(es lo que guarda los chunks y el progreso). Configurá el .env del worker -- ver README.",
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
