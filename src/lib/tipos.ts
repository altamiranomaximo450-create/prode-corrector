/**
 * Modelo de dominio del corrector de Prode.
 *
 * Regla de oro del sistema: nada se infiere. Si un dato no se pudo leer con
 * certeza queda en `null` y se registra un problema explicando por que.
 */

export type Pronostico = "1" | "X" | "2";

export const PRONOSTICOS: Pronostico[] = ["1", "X", "2"];

export const ETIQUETA_PRONOSTICO: Record<Pronostico, string> = {
  "1": "Local",
  X: "Empate",
  "2": "Visitante",
};

export interface Partido {
  numero: number;
  local: string;
  visitante: string;
  /** Resultado oficial. `null` = todavia no cargado. */
  resultado: Pronostico | null;
}

export type SeveridadProblema = "error" | "aviso";

export type CodigoProblema =
  | "SIN_CAPA_TEXTO"
  | "NOMBRE_NO_DETECTADO"
  | "NOMBRE_DUDOSO"
  | "NUMERO_NO_DETECTADO"
  | "CANTIDAD_PRONOSTICOS"
  | "PRONOSTICO_AMBIGUO"
  | "PRONOSTICO_FALTANTE"
  | "PARTIDO_DESCONOCIDO"
  | "BOLETA_INCOMPLETA"
  | "DUPLICADO_BOLETA"
  | "DUPLICADO_PARTICIPANTE"
  | "DUPLICADO_NUMERO"
  | "SEGMENTO_SIN_DATOS"
  | "RESULTADO_OFICIAL_FALTANTE";

export interface ProblemaBoleta {
  codigo: CodigoProblema;
  severidad: SeveridadProblema;
  mensaje: string;
  /** Pagina del PDF donde se detecto (1-based). */
  pagina: number | null;
  /** Fragmento textual exacto que provoco el problema. */
  textoProblematico: string | null;
  partidoNumero: number | null;
}

export interface PronosticoBoleta {
  partidoNumero: number;
  /** `null` = no se pudo leer. Nunca se completa por inferencia. */
  valor: Pronostico | null;
  origen: "pdf" | "manual";
  /** 0..1 */
  confianza: number;
  /** Texto crudo del PDF del que se dedujo el valor. Base de la auditoria. */
  evidencia: string;
  pagina: number | null;
}

export type EstadoBoleta = "ok" | "revision" | "resuelta_manual";

export interface Boleta {
  id: string;
  fechaId: string;
  participante: string | null;
  participanteConfianza: number;
  participanteEvidencia: string | null;
  numeroBoleta: string | null;
  paginas: number[];
  pronosticos: PronosticoBoleta[];
  problemas: ProblemaBoleta[];
  estado: EstadoBoleta;
  /** Texto tal cual salio del PDF. Permite auditar cualquier lectura. */
  textoCrudo: string;
  origen: "pdf" | "manual" | "demo";
  editadaManualmente: boolean;
  /** Estrategia del analizador que produjo esta boleta. */
  metodoDeteccion: string;
  creadaEn: string;
}

export type EstadoFecha = "borrador" | "procesada" | "corregida";

export type ReglaDesempate = "ninguna" | "partido_clave" | "orden_boleta";

export interface ConfigFecha {
  desempate: ReglaDesempate;
  /** Numero de partido usado si `desempate === "partido_clave"`. */
  partidoClave: number | null;
}

export interface DiagnosticoPdf {
  nombreArchivo: string;
  bytes: number;
  paginas: number;
  paginasConTexto: number[];
  paginasSinTexto: number[];
  caracteresExtraidos: number;
  tieneCapaTexto: boolean;
  metodo: "texto" | "sin-texto";
  estrategiaSegmentacion: string;
  puntajeEstrategia: number;
  estrategiasEvaluadas: { nombre: string; boletas: number; puntaje: number }[];
  procesadoEn: string;
  milisegundos: number;
}

export interface EventoAuditoria {
  fecha: string;
  accion: string;
  detalle: string;
}

export interface Fecha {
  id: string;
  nombre: string;
  cantidadPartidos: number;
  partidos: Partido[];
  estado: EstadoFecha;
  esDemo: boolean;
  config: ConfigFecha;
  diagnostico: DiagnosticoPdf | null;
  auditoria: EventoAuditoria[];
  creadaEn: string;
  actualizadaEn: string;
}

/* -------------------------------------------------------------------------- */
/*  Resultados de la correccion (siempre derivados, nunca almacenados)         */
/* -------------------------------------------------------------------------- */

export type EstadoDetalle =
  | "acierto"
  | "error"
  | "sin_pronostico"
  | "sin_resultado";

export interface DetallePartido {
  partidoNumero: number;
  local: string;
  visitante: string;
  pronostico: Pronostico | null;
  resultado: Pronostico | null;
  estado: EstadoDetalle;
  evidencia: string;
  origen: "pdf" | "manual";
}

export interface FilaCorreccion {
  boletaId: string;
  participante: string | null;
  numeroBoleta: string | null;
  aciertos: number;
  errores: number;
  sinPronostico: number;
  /** Partidos con resultado oficial cargado. Denominador del porcentaje. */
  partidosEvaluados: number;
  porcentaje: number;
  detalle: DetallePartido[];
  estado: EstadoBoleta;
  problemas: ProblemaBoleta[];
  /** Entra en el ranking? Las boletas en revision quedan fuera hasta resolverse. */
  elegible: boolean;
  motivoNoElegible: string | null;
  /** Frase auditable: "Obtuvo X aciertos porque acerto los partidos ...". */
  explicacion: string;
  paginas: number[];
  origen: "pdf" | "manual" | "demo";
}

export interface FilaRanking extends FilaCorreccion {
  posicion: number;
  empatado: boolean;
}

export interface GrupoPuesto {
  puesto: 1 | 2 | 3;
  aciertos: number;
  participantes: FilaRanking[];
  empate: boolean;
}

export interface ResumenFecha {
  boletasTotales: number;
  boletasOk: number;
  boletasEnRevision: number;
  boletasResueltasManualmente: number;
  participantes: number;
  partidosConResultado: number;
  partidosSinResultado: number;
  promedioAciertos: number | null;
  maximoAciertos: number | null;
  minimoAciertos: number | null;
}

export interface ResultadoCorreccion {
  fecha: Fecha;
  filas: FilaCorreccion[];
  ranking: FilaRanking[];
  enRevision: FilaCorreccion[];
  top3: GrupoPuesto[];
  resumen: ResumenFecha;
  /** Advertencias globales (p. ej. faltan resultados oficiales). */
  advertencias: string[];
}
