/**
 * Modelo de dominio del corrector de Prode.
 *
 * Regla del sistema: una boleta que se leyó mal nunca detiene al resto ni queda
 * fuera del ranking. Se interpreta lo mejor posible y se sigue. Lo único que se
 * respeta a rajatabla es el cálculo: los resultados oficiales que carga el
 * usuario son la única fuente de verdad y el conteo es 100% determinístico.
 */

export type Pronostico = "1" | "X" | "2";

export interface Partido {
  numero: number;
  /** Nombre del partido tal como lo escribió el usuario. Puede venir vacío. */
  nombre: string;
  /** Resultado oficial. `null` = todavía no cargado: ese partido no computa para nadie. */
  resultado: Pronostico | null;
}

export interface PronosticoBoleta {
  partidoNumero: number;
  /**
   * Opciones marcadas para este partido. Una sola normalmente; dos si es un
   * "doble" (ej. "1/X"), que es una jugada válida y acierta si el resultado
   * oficial es cualquiera de las dos. Vacío = no se pudo leer nada.
   */
  opciones: Pronostico[];
  /** Texto del PDF del que salió la lectura. Permite auditar cualquier acierto. */
  evidencia: string;
  pagina: number | null;
}

export interface Boleta {
  id: string;
  fechaId: string;
  /**
   * Posición de la boleta dentro del PDF (0 es la primera). Es el último
   * criterio de desempate del ranking: a diferencia del id, que es un UUID
   * nuevo en cada procesamiento, el orden de aparición es siempre el mismo para
   * el mismo PDF, y eso hace que el ranking sea reproducible.
   */
  orden: number;
  /** Nombre leído del PDF. Nunca se deduplica: dos boletas del mismo nombre son dos boletas. */
  participante: string;
  /** Número impreso en la boleta, si se pudo leer. */
  numeroBoleta: string | null;
  /** Páginas del PDF que ocupa esta boleta (una boleta puede abarcar varias). */
  paginas: number[];
  pronosticos: PronosticoBoleta[];
  /** Texto crudo del PDF. Base de la auditoría. */
  textoCrudo: string;
  creadaEn: string;
}

export interface Fecha {
  id: string;
  nombre: string;
  cantidadPartidos: number;
  partidos: Partido[];
  creadaEn: string;
  actualizadaEn: string;
}

/* -------------------------------------------------------------------------- */
/*  Corrección (siempre derivada, nunca almacenada)                           */
/* -------------------------------------------------------------------------- */

export type EstadoDetalle = "acierto" | "error" | "sin_pronostico" | "sin_resultado";

export interface DetallePartido {
  partidoNumero: number;
  nombre: string;
  opciones: Pronostico[];
  resultado: Pronostico | null;
  estado: EstadoDetalle;
  evidencia: string;
}

export interface FilaRanking {
  posicion: number;
  /** true si comparte posición con otra boleta. Ninguna se elimina por empatar. */
  empatado: boolean;
  boletaId: string;
  participante: string;
  numeroBoleta: string | null;
  paginas: number[];
  aciertos: number;
  /** Partidos con resultado oficial cargado. Denominador de los aciertos. */
  partidosEvaluados: number;
  porcentaje: number;
  detalle: DetallePartido[];
}

export interface ResumenFecha {
  boletas: number;
  partidosConResultado: number;
  partidosSinResultado: number;
  maximoAciertos: number | null;
}

export interface ResultadoCorreccion {
  fecha: Fecha;
  /** Ranking completo, ordenado. La pantalla muestra el TOP 10. */
  ranking: FilaRanking[];
  resumen: ResumenFecha;
}
