/**
 * Orquestador del procesamiento de un PDF de boletas.
 *
 * extraer texto -> analizar boletas -> validar -> detectar duplicados.
 *
 * Emite progreso real (no simulado) para que la interfaz muestre en qué etapa
 * está y no una barra decorativa.
 */

import { randomUUID } from "node:crypto";
import { extraerDocumento } from "./extraer";
import { analizarDocumento, normalizar, type BoletaCruda } from "./analizar";
import type {
  Boleta,
  DiagnosticoPdf,
  Fecha,
  ProblemaBoleta,
  PronosticoBoleta,
} from "../tipos";

export type EtapaProceso =
  | "leyendo"
  | "extrayendo"
  | "detectando"
  | "participantes"
  | "pronosticos"
  | "validando"
  | "duplicados"
  | "listo"
  | "error";

export interface EventoProgreso {
  etapa: EtapaProceso;
  mensaje: string;
  porcentaje: number;
  detalle?: string;
}

export interface ResultadoProceso {
  boletas: Boleta[];
  diagnostico: DiagnosticoPdf;
  /** Problemas que afectan al documento entero, no a una boleta concreta. */
  problemasGlobales: ProblemaBoleta[];
}

export class ErrorProcesamiento extends Error {
  constructor(
    message: string,
    readonly diagnostico?: Partial<DiagnosticoPdf>,
  ) {
    super(message);
    this.name = "ErrorProcesamiento";
  }
}

function huellaPronosticos(boleta: Boleta): string {
  return boleta.pronosticos.map((p) => p.valor ?? "?").join("");
}

/**
 * Marca duplicados. Nunca elimina nada: una boleta repetida puede ser legítima
 * (alguien que juega dos veces) o un error de escaneo. Decide una persona.
 */
export function detectarDuplicados(boletas: Boleta[]): void {
  const porNombre = new Map<string, Boleta[]>();
  const porNumero = new Map<string, Boleta[]>();
  const porContenido = new Map<string, Boleta[]>();

  for (const b of boletas) {
    const nombre = normalizar(b.participante ?? "");
    if (nombre) {
      if (!porNombre.has(nombre)) porNombre.set(nombre, []);
      porNombre.get(nombre)!.push(b);
    }
    if (b.numeroBoleta) {
      if (!porNumero.has(b.numeroBoleta)) porNumero.set(b.numeroBoleta, []);
      porNumero.get(b.numeroBoleta)!.push(b);
    }
    const clave = `${nombre}|${huellaPronosticos(b)}`;
    if (!porContenido.has(clave)) porContenido.set(clave, []);
    porContenido.get(clave)!.push(b);
  }

  for (const [nombre, grupo] of porNombre) {
    if (grupo.length < 2) continue;
    const paginas = [...new Set(grupo.flatMap((b) => b.paginas))].sort((a, b) => a - b).join(", ");
    for (const b of grupo) {
      b.problemas.push({
        codigo: "DUPLICADO_PARTICIPANTE",
        severidad: "error",
        mensaje: `El participante "${b.participante}" aparece en ${grupo.length} boletas (páginas ${paginas}). Confirmá cuál vale antes de publicar el ranking.`,
        pagina: b.paginas[0] ?? null,
        textoProblematico: nombre,
        partidoNumero: null,
      });
    }
  }

  for (const [numero, grupo] of porNumero) {
    if (grupo.length < 2) continue;
    for (const b of grupo) {
      b.problemas.push({
        codigo: "DUPLICADO_NUMERO",
        severidad: "aviso",
        mensaje: `El número de boleta #${numero} está repetido en ${grupo.length} boletas.`,
        pagina: b.paginas[0] ?? null,
        textoProblematico: `#${numero}`,
        partidoNumero: null,
      });
    }
  }

  for (const [, grupo] of porContenido) {
    if (grupo.length < 2) continue;
    const paginas = [...new Set(grupo.flatMap((b) => b.paginas))].sort((a, b) => a - b).join(", ");
    for (const b of grupo) {
      b.problemas.push({
        codigo: "DUPLICADO_BOLETA",
        severidad: "error",
        mensaje: `Boleta idéntica (mismo participante y mismos pronósticos) repetida ${grupo.length} veces en las páginas ${paginas}. Podría ser una hoja escaneada dos veces.`,
        pagina: b.paginas[0] ?? null,
        textoProblematico: huellaPronosticos(b),
        partidoNumero: null,
      });
    }
  }
}

/** Una boleta con algún problema de severidad "error" no entra al ranking. */
export function recalcularEstado(boleta: Boleta): void {
  if (boleta.estado === "resuelta_manual") return;
  const hayError = boleta.problemas.some((p) => p.severidad === "error");
  boleta.estado = hayError ? "revision" : "ok";
}

function aBoleta(cruda: BoletaCruda, fecha: Fecha): Boleta {
  const pronosticos: PronosticoBoleta[] = cruda.valores.map((v, i) => ({
    partidoNumero: i + 1,
    valor: v.valor,
    origen: "pdf",
    confianza: v.confianza,
    evidencia: v.evidencia,
    pagina: v.pagina,
  }));

  const boleta: Boleta = {
    id: randomUUID(),
    fechaId: fecha.id,
    participante: cruda.participante,
    participanteConfianza: cruda.participanteConfianza,
    participanteEvidencia: cruda.participanteEvidencia,
    numeroBoleta: cruda.numeroBoleta,
    paginas: cruda.paginas,
    pronosticos,
    problemas: [...cruda.problemas],
    estado: "ok",
    textoCrudo: cruda.textoCrudo,
    origen: "pdf",
    editadaManualmente: false,
    metodoDeteccion: cruda.metodo,
    creadaEn: new Date().toISOString(),
  };
  return boleta;
}

export async function procesarPdf(
  datos: Uint8Array,
  nombreArchivo: string,
  fecha: Fecha,
  onProgreso: (evento: EventoProgreso) => void,
): Promise<ResultadoProceso> {
  const inicio = Date.now();
  const problemasGlobales: ProblemaBoleta[] = [];

  onProgreso({ etapa: "leyendo", mensaje: "Abriendo el PDF...", porcentaje: 4 });

  const doc = await extraerDocumento(datos, (pagina, total) => {
    onProgreso({
      etapa: "extrayendo",
      mensaje: "Extrayendo el texto del PDF...",
      porcentaje: 5 + Math.round((pagina / Math.max(1, total)) * 45),
      detalle: `Página ${pagina} de ${total}`,
    });
  });

  const diagnosticoBase = {
    nombreArchivo,
    bytes: datos.byteLength,
    paginas: doc.paginas.length,
    paginasConTexto: doc.paginasConTexto,
    paginasSinTexto: doc.paginasSinTexto,
    caracteresExtraidos: doc.totalCaracteres,
    tieneCapaTexto: doc.tieneCapaTexto,
    procesadoEn: new Date().toISOString(),
  };

  if (!doc.tieneCapaTexto) {
    // PDF escaneado: no hay texto que leer. Se corta acá a propósito.
    // Adivinar con un OCR no verificado violaría la regla de precisión.
    throw new ErrorProcesamiento(
      "El PDF no tiene capa de texto: parece un escaneo o una foto. El sistema no interpreta imágenes, porque una lectura por OCR sin verificar podría asignar pronósticos equivocados. Volvé a exportar el PDF desde el programa que genera las boletas (no escaneado), o cargá las boletas a mano.",
      { ...diagnosticoBase, metodo: "sin-texto" },
    );
  }

  if (doc.paginasSinTexto.length > 0) {
    problemasGlobales.push({
      codigo: "SIN_CAPA_TEXTO",
      severidad: "aviso",
      mensaje: `Las páginas ${doc.paginasSinTexto.join(", ")} no tienen texto legible (podrían ser imágenes o estar en blanco). No se extrajo ninguna boleta de ellas.`,
      pagina: doc.paginasSinTexto[0],
      textoProblematico: null,
      partidoNumero: null,
    });
  }

  onProgreso({
    etapa: "detectando",
    mensaje: "Detectando las boletas dentro del documento...",
    porcentaje: 55,
    detalle: `${doc.paginas.length} páginas, ${doc.totalCaracteres} caracteres`,
  });

  const analisis = analizarDocumento(doc, {
    cantidadPartidos: fecha.cantidadPartidos,
    partidos: fecha.partidos,
  });

  onProgreso({
    etapa: "participantes",
    mensaje: "Identificando participantes...",
    porcentaje: 68,
    detalle: `${analisis.boletas.length} boletas con la estrategia "${analisis.estrategia}"`,
  });

  onProgreso({
    etapa: "pronosticos",
    mensaje: "Extrayendo pronósticos...",
    porcentaje: 78,
  });

  const boletas = analisis.boletas.map((c) => aBoleta(c, fecha));

  onProgreso({
    etapa: "validando",
    mensaje: "Validando la información leída...",
    porcentaje: 87,
  });

  onProgreso({
    etapa: "duplicados",
    mensaje: "Buscando duplicados...",
    porcentaje: 93,
  });

  detectarDuplicados(boletas);
  for (const b of boletas) recalcularEstado(b);

  if (boletas.length === 0) {
    throw new ErrorProcesamiento(
      "No se reconoció ninguna boleta en el PDF. Revisá que el archivo sea el de boletas y que la cantidad de partidos de la fecha coincida con la de las boletas.",
      { ...diagnosticoBase, metodo: "texto" },
    );
  }

  const diagnostico: DiagnosticoPdf = {
    ...diagnosticoBase,
    metodo: "texto",
    estrategiaSegmentacion: analisis.estrategia,
    puntajeEstrategia: analisis.puntaje,
    estrategiasEvaluadas: analisis.estrategiasEvaluadas,
    milisegundos: Date.now() - inicio,
  };

  onProgreso({
    etapa: "listo",
    mensaje: "Listo",
    porcentaje: 100,
    detalle: `${boletas.length} boletas procesadas`,
  });

  return { boletas, diagnostico, problemasGlobales };
}
