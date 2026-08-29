/**
 * Capa de servicio: la lógica de negocio que usan las rutas de API.
 * Ninguna ruta habla directamente con el almacén ni con el motor de PDF.
 */

import { randomUUID } from "node:crypto";
import { obtenerAlmacen } from "./almacen";
import { corregirFecha } from "./correccion";
import { construirDemo } from "./datos-demo";
import { recalcularEstado } from "./pdf/procesar";
import type {
  Boleta,
  ConfigFecha,
  Fecha,
  Partido,
  Pronostico,
  PronosticoBoleta,
  ResultadoCorreccion,
} from "./tipos";

export class ErrorValidacion extends Error {
  constructor(
    message: string,
    readonly campo?: string,
  ) {
    super(message);
    this.name = "ErrorValidacion";
  }
}

export const MAX_PARTIDOS = 30;
const MIN_PARTIDOS = 1;

export function demoHabilitada(): boolean {
  return (process.env.DEMO_MODE ?? "on").toLowerCase() !== "off";
}

export function procesamientoHabilitado(): boolean {
  return (process.env.PROCESAMIENTO_HABILITADO ?? "on").toLowerCase() !== "off";
}

/**
 * Tamaño máximo de PDF admitido.
 *
 * En Vercel el cuerpo de una petición a una función serverless no puede pasar
 * de ~4,5 MB, así que el límite real lo pone la plataforma, no la aplicación.
 * En local no hay ese techo.
 */
export function maxPdfBytes(): number {
  const configurado = Number(process.env.MAX_PDF_MB);
  if (Number.isFinite(configurado) && configurado > 0) {
    return Math.round(configurado * 1024 * 1024);
  }
  return process.env.VERCEL ? Math.round(4.3 * 1024 * 1024) : 25 * 1024 * 1024;
}

function esPronostico(v: unknown): v is Pronostico {
  return v === "1" || v === "X" || v === "2";
}

function normalizarPronostico(v: unknown): Pronostico | null {
  if (v === null || v === undefined || v === "") return null;
  const s = String(v).trim().toUpperCase();
  if (s === "1" || s === "L") return "1";
  if (s === "X" || s === "E") return "X";
  if (s === "2" || s === "V") return "2";
  throw new ErrorValidacion(`"${v}" no es un pronóstico válido. Sólo se acepta 1, X o 2.`);
}

/**
 * Igual que `normalizarPronostico`, pero admite un "doble" (dos opciones
 * marcadas, ej. "1/X"): una jugada normal en el Prode, no un error. Acepta un
 * string ("1", "1/X", "1X") o un array (["1","X"]).
 */
function normalizarOpciones(v: unknown): Pronostico[] {
  if (v === null || v === undefined || v === "") return [];
  const piezas: unknown[] = Array.isArray(v)
    ? v
    : String(v)
        .split(/[/,\s]+/)
        .flatMap((s) => (s.length > 1 && !/^(1|X|2|L|E|V)$/i.test(s) ? s.split("") : [s]))
        .filter(Boolean);
  const opciones = [...new Set(piezas.map((p) => normalizarPronostico(p)).filter((p): p is Pronostico => p !== null))];
  if (opciones.length > 2) {
    throw new ErrorValidacion("Un pronóstico admite como máximo dos opciones (un doble).");
  }
  return opciones;
}

function texto(v: unknown, campo: string, maximo = 120): string {
  if (typeof v !== "string") throw new ErrorValidacion(`Falta ${campo}.`, campo);
  const limpio = v.trim().replace(/\s+/g, " ");
  if (!limpio) throw new ErrorValidacion(`${campo} no puede estar vacío.`, campo);
  if (limpio.length > maximo)
    throw new ErrorValidacion(`${campo} es demasiado largo (máximo ${maximo}).`, campo);
  return limpio;
}

/* -------------------------------------------------------------------------- */
/*  Demo                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Bandera persistente: recuerda que el administrador borró la demo.
 *
 * Tiene que vivir en el almacén y no en memoria: si fuera una variable del
 * proceso, al reiniciar el servidor (o en cada instancia serverless de Vercel)
 * las fechas de demostración volverían a aparecer solas después de borrarlas.
 */
const BANDERA_DEMO_BORRADA = "demo_borrada";

export async function sembrarDemoSiHaceFalta(): Promise<void> {
  if (!demoHabilitada()) return;
  const almacen = obtenerAlmacen();

  // Si ya hay fechas cargadas no hay nada que sembrar, y es el caso habitual:
  // así se evita consultar la bandera en cada petición.
  const existentes = await almacen.listarFechas();
  if (existentes.length > 0) return;

  if (await almacen.leerBandera(BANDERA_DEMO_BORRADA)) return;

  for (const { fecha, boletas } of construirDemo()) {
    await almacen.guardarFecha(fecha);
    await almacen.reemplazarBoletas(fecha.id, boletas);
  }
}

export async function borrarDatosDemo(): Promise<number> {
  const almacen = obtenerAlmacen();
  const fechas = await almacen.listarFechas();
  let borradas = 0;
  for (const f of fechas) {
    if (f.esDemo) {
      await almacen.borrarFecha(f.id);
      borradas += 1;
    }
  }
  await almacen.escribirBandera(BANDERA_DEMO_BORRADA, "1");
  return borradas;
}

export async function restaurarDatosDemo(): Promise<void> {
  const almacen = obtenerAlmacen();
  for (const { fecha, boletas } of construirDemo()) {
    await almacen.borrarFecha(fecha.id);
    await almacen.guardarFecha(fecha);
    await almacen.reemplazarBoletas(fecha.id, boletas);
  }
  await almacen.escribirBandera(BANDERA_DEMO_BORRADA, "");
}

/* -------------------------------------------------------------------------- */
/*  Fechas                                                                    */
/* -------------------------------------------------------------------------- */

export interface EntradaPartido {
  local?: unknown;
  visitante?: unknown;
  resultado?: unknown;
}

export interface EntradaFecha {
  nombre?: unknown;
  cantidadPartidos?: unknown;
  partidos?: unknown;
  config?: unknown;
}

function validarPartidos(entrada: unknown, cantidad: number): Partido[] {
  if (!Array.isArray(entrada)) {
    throw new ErrorValidacion("Faltan los partidos de la fecha.", "partidos");
  }
  if (entrada.length !== cantidad) {
    throw new ErrorValidacion(
      `Se declararon ${cantidad} partidos pero se enviaron ${entrada.length}.`,
      "partidos",
    );
  }
  return entrada.map((p, i) => {
    const item = p as EntradaPartido;
    return {
      numero: i + 1,
      local: texto(item.local, `el equipo local del partido ${i + 1}`, 60),
      visitante: texto(item.visitante, `el equipo visitante del partido ${i + 1}`, 60),
      resultado: normalizarPronostico(item.resultado),
    };
  });
}

function validarConfig(entrada: unknown, cantidadPartidos: number): ConfigFecha {
  const c = (entrada ?? {}) as Partial<ConfigFecha>;
  const desempate = c.desempate ?? "ninguna";
  if (!["ninguna", "partido_clave", "orden_boleta"].includes(desempate)) {
    throw new ErrorValidacion("Regla de desempate desconocida.", "config.desempate");
  }
  let partidoClave: number | null = null;
  if (desempate === "partido_clave") {
    const n = Number(c.partidoClave);
    if (!Number.isInteger(n) || n < 1 || n > cantidadPartidos) {
      throw new ErrorValidacion(
        `Para desempatar por partido clave hay que elegir un partido entre 1 y ${cantidadPartidos}.`,
        "config.partidoClave",
      );
    }
    partidoClave = n;
  }
  return { desempate, partidoClave };
}

export async function crearFecha(entrada: EntradaFecha): Promise<Fecha> {
  const nombre = texto(entrada.nombre, "el nombre de la fecha", 120);
  const cantidad = Number(entrada.cantidadPartidos);
  if (!Number.isInteger(cantidad) || cantidad < MIN_PARTIDOS || cantidad > MAX_PARTIDOS) {
    throw new ErrorValidacion(
      `La cantidad de partidos debe ser un número entero entre ${MIN_PARTIDOS} y ${MAX_PARTIDOS}.`,
      "cantidadPartidos",
    );
  }
  const partidos = validarPartidos(entrada.partidos, cantidad);
  const config = validarConfig(entrada.config, cantidad);
  const ahora = new Date().toISOString();

  const fecha: Fecha = {
    id: randomUUID(),
    nombre,
    cantidadPartidos: cantidad,
    partidos,
    estado: "borrador",
    esDemo: false,
    config,
    diagnostico: null,
    auditoria: [{ fecha: ahora, accion: "crear", detalle: `Fecha creada con ${cantidad} partidos.` }],
    creadaEn: ahora,
    actualizadaEn: ahora,
  };

  await obtenerAlmacen().guardarFecha(fecha);
  return fecha;
}

export async function actualizarFecha(id: string, entrada: EntradaFecha): Promise<Fecha> {
  const almacen = obtenerAlmacen();
  const fecha = await almacen.obtenerFecha(id);
  if (!fecha) throw new ErrorValidacion("La fecha no existe.");

  const cambios: string[] = [];

  if (entrada.nombre !== undefined) {
    const nombre = texto(entrada.nombre, "el nombre de la fecha", 120);
    if (nombre !== fecha.nombre) cambios.push(`nombre: "${fecha.nombre}" -> "${nombre}"`);
    fecha.nombre = nombre;
  }

  if (entrada.partidos !== undefined) {
    const partidos = validarPartidos(entrada.partidos, fecha.cantidadPartidos);
    for (const nuevo of partidos) {
      const previo = fecha.partidos.find((p) => p.numero === nuevo.numero);
      if (previo && previo.resultado !== nuevo.resultado) {
        cambios.push(
          `resultado del partido ${nuevo.numero}: ${previo.resultado ?? "(vacío)"} -> ${nuevo.resultado ?? "(vacío)"}`,
        );
      }
    }
    fecha.partidos = partidos;
  }

  if (entrada.config !== undefined) {
    const config = validarConfig(entrada.config, fecha.cantidadPartidos);
    if (config.desempate !== fecha.config.desempate) {
      cambios.push(`desempate: ${fecha.config.desempate} -> ${config.desempate}`);
    }
    fecha.config = config;
  }

  const todosCargados = fecha.partidos.every((p) => p.resultado !== null);
  const hayBoletas = (await almacen.listarBoletas(id)).length > 0;
  fecha.estado = hayBoletas ? (todosCargados ? "corregida" : "procesada") : "borrador";

  fecha.actualizadaEn = new Date().toISOString();
  if (cambios.length) {
    fecha.auditoria.push({
      fecha: fecha.actualizadaEn,
      accion: "editar",
      detalle: cambios.join(" | "),
    });
  }

  await almacen.guardarFecha(fecha);
  return fecha;
}

export async function borrarFecha(id: string): Promise<void> {
  await obtenerAlmacen().borrarFecha(id);
}

export async function obtenerCorreccion(id: string): Promise<ResultadoCorreccion | null> {
  const almacen = obtenerAlmacen();
  const fecha = await almacen.obtenerFecha(id);
  if (!fecha) return null;
  const boletas = await almacen.listarBoletas(id);
  return corregirFecha(fecha, boletas);
}

export interface ResumenListado {
  fecha: Fecha;
  boletas: number;
  participantes: number;
  enRevision: number;
  mejorPuntaje: number | null;
  podio: { puesto: number; nombres: string[]; aciertos: number }[];
}

export async function listarFechasConResumen(): Promise<ResumenListado[]> {
  const almacen = obtenerAlmacen();
  const fechas = await almacen.listarFechas();
  const salida: ResumenListado[] = [];
  for (const fecha of fechas) {
    const boletas = await almacen.listarBoletas(fecha.id);
    const correccion = corregirFecha(fecha, boletas);
    salida.push({
      fecha,
      boletas: boletas.length,
      participantes: correccion.resumen.participantes,
      enRevision: correccion.resumen.boletasEnRevision,
      mejorPuntaje: correccion.resumen.maximoAciertos,
      podio: correccion.top5.map((g) => ({
        puesto: g.puesto,
        nombres: g.participantes.map((p) => p.participante ?? "(sin nombre)"),
        aciertos: g.aciertos,
      })),
    });
  }
  return salida;
}

/* -------------------------------------------------------------------------- */
/*  Boletas                                                                   */
/* -------------------------------------------------------------------------- */

export interface EntradaBoleta {
  participante?: unknown;
  numeroBoleta?: unknown;
  pronosticos?: unknown;
  resolver?: unknown;
}

/**
 * Retira los problemas que la edición manual dejó sin efecto.
 *
 * Sólo se descartan los que son verificablemente falsos después del cambio:
 * si el administrador escribió el pronóstico del partido 4, ya no tiene
 * sentido decir que ese partido está ilegible. Los problemas que requieren
 * una decisión humana (duplicados, orden de partidos) NO se tocan: siguen
 * bloqueando hasta que alguien los dé por revisados a conciencia.
 */
function depurarProblemasResueltos(boleta: Boleta): void {
  const opcionesDe = (numero: number) =>
    boleta.pronosticos.find((p) => p.partidoNumero === numero)?.opciones ?? [];
  const todosLegibles = boleta.pronosticos.every((p) => p.opciones.length >= 1);
  const cantidadCompleta = boleta.pronosticos.length > 0 && todosLegibles;

  boleta.problemas = boleta.problemas.filter((problema) => {
    switch (problema.codigo) {
      case "PRONOSTICO_AMBIGUO":
      case "PRONOSTICO_FALTANTE":
        // Resuelto si ese partido ya tiene alguna opción marcada (1 o 2).
        return !(problema.partidoNumero !== null && opcionesDe(problema.partidoNumero).length >= 1);
      case "PRONOSTICO_DOBLE":
        // El aviso de doble ya no aplica si ese partido dejó de tener dos opciones.
        return !(problema.partidoNumero !== null && opcionesDe(problema.partidoNumero).length !== 2);
      case "CANTIDAD_PRONOSTICOS":
      case "BOLETA_INCOMPLETA":
      case "SEGMENTO_SIN_DATOS":
        return !cantidadCompleta;
      case "NOMBRE_NO_DETECTADO":
      case "NOMBRE_DUDOSO":
        return boleta.participante === null;
      case "NUMERO_NO_DETECTADO":
        return boleta.numeroBoleta === null;
      default:
        return true;
    }
  });
}

/**
 * Edición manual de una boleta. Cada cambio queda registrado como origen
 * "manual" para que en el detalle se vea qué puso el sistema y qué corrigió
 * una persona.
 */
export async function actualizarBoleta(
  fechaId: string,
  boletaId: string,
  entrada: EntradaBoleta,
): Promise<Boleta> {
  const almacen = obtenerAlmacen();
  const fecha = await almacen.obtenerFecha(fechaId);
  if (!fecha) throw new ErrorValidacion("La fecha no existe.");
  const boleta = await almacen.obtenerBoleta(fechaId, boletaId);
  if (!boleta) throw new ErrorValidacion("La boleta no existe.");

  const cambios: string[] = [];

  if (entrada.participante !== undefined) {
    const nombre = entrada.participante === null || entrada.participante === ""
      ? null
      : texto(entrada.participante, "el nombre del participante", 80);
    if (nombre !== boleta.participante) {
      cambios.push(`participante: "${boleta.participante ?? "(vacío)"}" -> "${nombre ?? "(vacío)"}"`);
      boleta.participante = nombre;
      boleta.participanteConfianza = nombre ? 1 : 0;
    }
  }

  if (entrada.numeroBoleta !== undefined) {
    const numero =
      entrada.numeroBoleta === null || entrada.numeroBoleta === ""
        ? null
        : texto(entrada.numeroBoleta, "el número de boleta", 20);
    if (numero !== boleta.numeroBoleta) {
      cambios.push(`número: ${boleta.numeroBoleta ?? "(vacío)"} -> ${numero ?? "(vacío)"}`);
      boleta.numeroBoleta = numero;
    }
  }

  if (entrada.pronosticos !== undefined) {
    if (!Array.isArray(entrada.pronosticos)) {
      throw new ErrorValidacion("Los pronósticos deben venir como lista.", "pronosticos");
    }
    if (entrada.pronosticos.length !== fecha.cantidadPartidos) {
      throw new ErrorValidacion(
        `La fecha tiene ${fecha.cantidadPartidos} partidos y se enviaron ${entrada.pronosticos.length} pronósticos.`,
        "pronosticos",
      );
    }
    const nuevos: PronosticoBoleta[] = entrada.pronosticos.map((v, i) => {
      const anterior = boleta.pronosticos.find((p) => p.partidoNumero === i + 1);
      const opciones = normalizarOpciones(v);
      const valor = opciones.length === 1 ? opciones[0] : null;
      const anterioresOpciones = anterior?.opciones ?? (anterior?.valor ? [anterior.valor] : []);
      const cambio =
        anterioresOpciones.length !== opciones.length ||
        anterioresOpciones.some((o) => !opciones.includes(o));
      if (cambio) {
        const etiqueta = (o: Pronostico[]) => (o.length ? o.join("/") : "(vacío)");
        cambios.push(
          `partido ${i + 1}: ${etiqueta(anterioresOpciones)} -> ${etiqueta(opciones)}`,
        );
      }
      return {
        partidoNumero: i + 1,
        valor,
        opciones,
        origen: cambio ? "manual" : (anterior?.origen ?? "manual"),
        confianza: cambio ? 1 : (anterior?.confianza ?? 0),
        evidencia: cambio
          ? `Corregido a mano por el administrador. Lectura original del PDF: ${anterior?.evidencia || "(sin lectura)"}`
          : (anterior?.evidencia ?? ""),
        pagina: anterior?.pagina ?? null,
      };
    });
    boleta.pronosticos = nuevos;
  }

  if (entrada.resolver === true) {
    // Se da por revisada: los problemas quedan archivados como parte del
    // historial de la boleta, pero dejan de bloquear el ranking.
    boleta.estado = "resuelta_manual";
    cambios.push("marcada como revisada");
  } else if (entrada.resolver === false) {
    boleta.estado = "ok";
    recalcularEstado(boleta);
    cambios.push("reabierta para revisión");
  }

  if (cambios.length === 0) return boleta;

  boleta.editadaManualmente = true;
  depurarProblemasResueltos(boleta);
  if (boleta.estado !== "resuelta_manual") recalcularEstado(boleta);

  await almacen.guardarBoleta(boleta);

  fecha.auditoria.push({
    fecha: new Date().toISOString(),
    accion: "editar-boleta",
    detalle: `Boleta ${boleta.numeroBoleta ?? boleta.id.slice(0, 8)} (${boleta.participante ?? "sin nombre"}): ${cambios.join(" | ")}`,
  });
  fecha.actualizadaEn = new Date().toISOString();
  await almacen.guardarFecha(fecha);

  return boleta;
}

export async function crearBoletaManual(
  fechaId: string,
  entrada: EntradaBoleta,
): Promise<Boleta> {
  const almacen = obtenerAlmacen();
  const fecha = await almacen.obtenerFecha(fechaId);
  if (!fecha) throw new ErrorValidacion("La fecha no existe.");

  const participante = texto(entrada.participante, "el nombre del participante", 80);
  const numeroBoleta =
    entrada.numeroBoleta === undefined || entrada.numeroBoleta === null || entrada.numeroBoleta === ""
      ? null
      : texto(entrada.numeroBoleta, "el número de boleta", 20);

  if (!Array.isArray(entrada.pronosticos) || entrada.pronosticos.length !== fecha.cantidadPartidos) {
    throw new ErrorValidacion(
      `Hay que cargar exactamente ${fecha.cantidadPartidos} pronósticos.`,
      "pronosticos",
    );
  }

  const pronosticos: PronosticoBoleta[] = entrada.pronosticos.map((v, i) => {
    const opciones = normalizarOpciones(v);
    return {
      partidoNumero: i + 1,
      valor: opciones.length === 1 ? opciones[0] : null,
      opciones,
      origen: "manual",
      confianza: 1,
      evidencia: "Cargado a mano por el administrador.",
      pagina: null,
    };
  });

  const ahora = new Date().toISOString();
  const boleta: Boleta = {
    id: randomUUID(),
    fechaId,
    participante,
    participanteConfianza: 1,
    participanteEvidencia: "Cargado a mano por el administrador.",
    numeroBoleta,
    paginas: [],
    pronosticos,
    problemas: pronosticos.some((p) => p.opciones.length === 0)
      ? [
          {
            codigo: "BOLETA_INCOMPLETA",
            severidad: "error",
            mensaje: "La boleta tiene partidos sin pronóstico cargado.",
            pagina: null,
            textoProblematico: null,
            partidoNumero: null,
          },
        ]
      : [],
    estado: "ok",
    textoCrudo: "Boleta cargada manualmente (sin origen en PDF).",
    origen: "manual",
    editadaManualmente: true,
    metodoDeteccion: "carga-manual",
    creadaEn: ahora,
  };
  recalcularEstado(boleta);

  await almacen.guardarBoleta(boleta);
  fecha.auditoria.push({
    fecha: ahora,
    accion: "alta-boleta",
    detalle: `Boleta cargada a mano para ${participante}.`,
  });
  fecha.actualizadaEn = ahora;
  await almacen.guardarFecha(fecha);
  return boleta;
}

export async function borrarBoleta(fechaId: string, boletaId: string): Promise<void> {
  const almacen = obtenerAlmacen();
  const boleta = await almacen.obtenerBoleta(fechaId, boletaId);
  await almacen.borrarBoleta(fechaId, boletaId);
  const fecha = await almacen.obtenerFecha(fechaId);
  if (fecha && boleta) {
    fecha.auditoria.push({
      fecha: new Date().toISOString(),
      accion: "baja-boleta",
      detalle: `Se eliminó la boleta ${boleta.numeroBoleta ?? boleta.id.slice(0, 8)} de ${boleta.participante ?? "sin nombre"}.`,
    });
    fecha.actualizadaEn = new Date().toISOString();
    await obtenerAlmacen().guardarFecha(fecha);
  }
}

export { esPronostico };
