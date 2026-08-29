/**
 * Analizador de boletas.
 *
 * No asume un formato de boleta. Prueba varias estrategias de segmentación
 * (dónde empieza y termina cada boleta) y varios modos de lectura de
 * pronósticos, puntúa cada combinación y se queda con la que mejor explica el
 * documento. Todo lo que queda con dudas se marca para revisión manual: el
 * sistema nunca completa un dato por inferencia.
 */

import type { Linea, DocumentoExtraido, Token } from "./extraer";
import type { Partido, ProblemaBoleta, Pronostico } from "../tipos";

/* -------------------------------------------------------------------------- */
/*  Utilidades de texto                                                       */
/* -------------------------------------------------------------------------- */

export function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

const PALABRAS_ESTRUCTURA = new Set([
  "prode",
  "fecha",
  "boleta",
  "ficha",
  "tarjeta",
  "cupon",
  "talon",
  "partido",
  "partidos",
  "local",
  "empate",
  "visitante",
  "resultado",
  "resultados",
  "pronostico",
  "pronosticos",
  "aciertos",
  "total",
  "puntaje",
  "firma",
  "planilla",
  "torneo",
  "jornada",
  "equipo",
  "equipos",
  "vs",
  "nombre",
  "participante",
  "jugador",
  "numero",
  "fecha:",
]);

const MARCAS = /^[xX✓✔✗✘●•·*+]$/;

/* -------------------------------------------------------------------------- */
/*  Tipos                                                                     */
/* -------------------------------------------------------------------------- */

export interface ValorLeido {
  valor: Pronostico | null;
  evidencia: string;
  pagina: number | null;
  confianza: number;
  ambiguo: boolean;
}

export interface BoletaCruda {
  participante: string | null;
  participanteConfianza: number;
  participanteEvidencia: string | null;
  numeroBoleta: string | null;
  paginas: number[];
  valores: ValorLeido[];
  /** Cuántos pronósticos se leyeron ANTES de recortar/rellenar a la cantidad
   *  esperada. Es la señal honesta de si la segmentación fue correcta. */
  cantidadLeida: number;
  problemas: ProblemaBoleta[];
  textoCrudo: string;
  metodo: string;
}

export interface OpcionesAnalisis {
  cantidadPartidos: number;
  partidos: Partido[];
}

export interface ResultadoAnalisis {
  boletas: BoletaCruda[];
  estrategia: string;
  puntaje: number;
  estrategiasEvaluadas: { nombre: string; boletas: number; puntaje: number }[];
}

interface Segmento {
  lineas: Linea[];
  paginas: number[];
}

/* -------------------------------------------------------------------------- */
/*  Estrategias de segmentación                                               */
/* -------------------------------------------------------------------------- */

const ANCLAS: { nombre: string; re: RegExp }[] = [
  {
    nombre: "ancla-boleta-numerada",
    re: /\b(boleta|ficha|tarjeta|cup[oó]n|tal[oó]n|ticket)\b\s*(n[°ºo]?\.?|nro\.?|num\.?|#)?\s*:?\s*\d{1,6}\b/i,
  },
  {
    nombre: "ancla-boleta",
    re: /^\s*(boleta|ficha|tarjeta|cup[oó]n|tal[oó]n|ticket)\b/i,
  },
  {
    nombre: "ancla-participante",
    re: /^\s*(participante|nombre y apellido|apellido y nombre|nombre|jugador|socio)\s*[:.\-]/i,
  },
  { nombre: "ancla-prode", re: /^\s*prode\b/i },
];

function lineasEnOrden(doc: DocumentoExtraido): Linea[] {
  const todas: Linea[] = [];
  for (const pagina of doc.paginas) todas.push(...pagina.lineas);
  return todas;
}

function segmentarPorAncla(doc: DocumentoExtraido, re: RegExp): Segmento[] {
  const todas = lineasEnOrden(doc);
  const cortes: number[] = [];
  for (let i = 0; i < todas.length; i++) {
    if (re.test(todas[i].texto)) cortes.push(i);
  }
  if (cortes.length < 2) return [];
  const segmentos: Segmento[] = [];
  for (let i = 0; i < cortes.length; i++) {
    const desde = cortes[i];
    const hasta = i + 1 < cortes.length ? cortes[i + 1] : todas.length;
    const lineas = todas.slice(desde, hasta);
    if (lineas.length === 0) continue;
    segmentos.push({ lineas, paginas: [...new Set(lineas.map((l) => l.pagina))] });
  }
  return segmentos;
}

function segmentarPorPagina(doc: DocumentoExtraido): Segmento[] {
  return doc.paginas
    .filter((p) => p.lineas.length > 0)
    .map((p) => ({ lineas: p.lineas, paginas: [p.numero] }));
}

/** Detecta columnas verticales (varias boletas lado a lado en la misma página). */
function segmentarPorColumnas(doc: DocumentoExtraido): Segmento[] {
  const segmentos: Segmento[] = [];
  for (const pagina of doc.paginas) {
    if (pagina.lineas.length === 0) continue;
    const cortes = detectarCortesVerticales(pagina.tokens, pagina.ancho);
    if (cortes.length === 0) {
      segmentos.push({ lineas: pagina.lineas, paginas: [pagina.numero] });
      continue;
    }
    const limites = [0, ...cortes, pagina.ancho];
    for (let i = 0; i < limites.length - 1; i++) {
      const desde = limites[i];
      const hasta = limites[i + 1];
      const lineas: Linea[] = [];
      for (const linea of pagina.lineas) {
        const centro = (linea.xInicio + linea.xFin) / 2;
        if (centro >= desde && centro < hasta) lineas.push(linea);
      }
      if (lineas.length > 0) segmentos.push({ lineas, paginas: [pagina.numero] });
    }
  }
  return segmentos.length > doc.paginas.length ? segmentos : [];
}

function detectarCortesVerticales(tokens: Token[], ancho: number): number[] {
  if (tokens.length < 20) return [];
  const bins = 60;
  const cubos = new Array(bins).fill(0);
  for (const t of tokens) {
    const desde = Math.max(0, Math.floor((t.x / ancho) * bins));
    const hasta = Math.min(bins - 1, Math.floor(((t.x + t.ancho) / ancho) * bins));
    for (let i = desde; i <= hasta; i++) cubos[i] += 1;
  }
  const cortes: number[] = [];
  let inicioVacio = -1;
  for (let i = 0; i < bins; i++) {
    if (cubos[i] === 0) {
      if (inicioVacio === -1) inicioVacio = i;
    } else if (inicioVacio !== -1) {
      const largo = i - inicioVacio;
      // Un canal vacío de al menos ~5% del ancho, y no en los márgenes.
      if (largo >= 3 && inicioVacio > bins * 0.12 && i < bins * 0.88) {
        cortes.push(((inicioVacio + i) / 2 / bins) * ancho);
      }
      inicioVacio = -1;
    }
  }
  return cortes;
}

/** Separa por bandas horizontales de espacio en blanco dentro de cada página. */
function segmentarPorBloques(doc: DocumentoExtraido): Segmento[] {
  const segmentos: Segmento[] = [];
  for (const pagina of doc.paginas) {
    const lineas = pagina.lineas;
    if (lineas.length < 4) continue;
    const huecos: number[] = [];
    for (let i = 1; i < lineas.length; i++) {
      huecos.push(Math.abs(lineas[i - 1].y - lineas[i].y));
    }
    const ordenados = [...huecos].sort((a, b) => a - b);
    const mediana = ordenados[Math.floor(ordenados.length / 2)] || 12;
    const umbral = mediana * 2.4;
    let actual: Linea[] = [lineas[0]];
    for (let i = 1; i < lineas.length; i++) {
      if (huecos[i - 1] > umbral && actual.length > 0) {
        segmentos.push({ lineas: actual, paginas: [pagina.numero] });
        actual = [];
      }
      actual.push(lineas[i]);
    }
    if (actual.length) segmentos.push({ lineas: actual, paginas: [pagina.numero] });
  }
  return segmentos.length > doc.paginas.length ? segmentos : [];
}

/* -------------------------------------------------------------------------- */
/*  Modos de lectura de pronósticos                                           */
/* -------------------------------------------------------------------------- */

interface LecturaModo {
  modo: string;
  valores: ValorLeido[];
  confianzaModo: number;
}

function etiquetaColumna(texto: string): Pronostico | null {
  const t = normalizar(texto).replace(/[^a-z0-9]/g, "");
  if (t === "1" || t === "l" || t === "local") return "1";
  if (t === "x" || t === "e" || t === "empate") return "X";
  if (t === "2" || t === "v" || t === "visitante") return "2";
  return null;
}

interface EncabezadoGrilla {
  centros: { valor: Pronostico; x: number }[];
  indice: number;
}

/**
 * Busca el renglón que hace de encabezado de columnas (1 / X / 2, o
 * Local / Empate / Visitante). Su presencia es determinante: si existe, el
 * pronóstico está codificado por POSICIÓN y leer el último token del renglón
 * daría siempre la misma marca. Por eso los modos "planos" se desactivan.
 */
function detectarEncabezadoGrilla(lineas: Linea[]): EncabezadoGrilla | null {
  for (let i = 0; i < lineas.length; i++) {
    const candidatos: { valor: Pronostico; x: number }[] = [];
    for (const t of lineas[i].tokens) {
      const et = etiquetaColumna(t.texto);
      if (et) candidatos.push({ valor: et, x: t.x + t.ancho / 2 });
    }
    const unicos = new Map<Pronostico, number>();
    for (const c of candidatos) if (!unicos.has(c.valor)) unicos.set(c.valor, c.x);
    if (unicos.size !== 3) continue;
    const orden = [...unicos.entries()].sort((a, b) => a[1] - b[1]);
    // El encabezado debe leerse 1, X, 2 de izquierda a derecha.
    if (orden[0][0] === "1" && orden[1][0] === "X" && orden[2][0] === "2") {
      return { centros: orden.map(([valor, x]) => ({ valor, x })), indice: i };
    }
  }
  return null;
}

/** Modo grilla: columnas 1 / X / 2 y una marca bajo la elegida. */
function modoGrilla(lineas: Linea[]): LecturaModo | null {
  const encabezado = detectarEncabezadoGrilla(lineas);
  if (!encabezado) return null;
  const centros = encabezado.centros;
  const indiceEncabezado = encabezado.indice;

  const separacion = Math.min(
    centros[1].x - centros[0].x,
    centros[2].x - centros[1].x,
  );
  if (separacion <= 0) return null;
  const tolerancia = separacion * 0.45;

  const valores: ValorLeido[] = [];
  for (let i = indiceEncabezado + 1; i < lineas.length; i++) {
    const linea = lineas[i];
    const golpes: Pronostico[] = [];
    for (const t of linea.tokens) {
      const centroToken = t.x + t.ancho / 2;
      for (const c of centros) {
        if (Math.abs(centroToken - c.x) > tolerancia) continue;
        const txt = t.texto.trim();
        if (MARCAS.test(txt)) golpes.push(c.valor);
        else if (etiquetaColumna(txt) === c.valor && txt.length <= 2) golpes.push(c.valor);
      }
    }
    if (golpes.length === 0) continue;
    const distintos = [...new Set(golpes)];
    valores.push({
      valor: distintos.length === 1 ? distintos[0] : null,
      evidencia: linea.texto,
      pagina: linea.pagina,
      confianza: distintos.length === 1 ? 0.95 : 0,
      ambiguo: distintos.length > 1,
    });
  }

  if (valores.length === 0) return null;
  return { modo: "grilla-columnas", valores, confianzaModo: 0.95 };
}

/** Modo línea: cada renglón de partido termina con 1, X o 2. */
function modoLineaFinal(lineas: Linea[]): LecturaModo | null {
  const valores: ValorLeido[] = [];
  for (const linea of lineas) {
    if (linea.tokens.length < 2) continue;
    const ultimo = linea.tokens[linea.tokens.length - 1].texto.trim();
    const valor = etiquetaColumna(ultimo);
    if (!valor || ultimo.length > 1) continue;
    const resto = linea.texto.slice(0, linea.texto.length - ultimo.length);
    // Debe haber texto de partido antes de la marca, no sólo números sueltos.
    if ((resto.match(/[a-zA-ZÁÉÍÓÚÑáéíóúñ]/g) || []).length < 4) continue;
    if (PALABRAS_ESTRUCTURA.has(normalizar(resto).replace(/[^a-z]/g, ""))) continue;
    valores.push({
      valor,
      evidencia: linea.texto,
      pagina: linea.pagina,
      confianza: 0.9,
      ambiguo: false,
    });
  }
  if (valores.length === 0) return null;
  return { modo: "linea-final", valores, confianzaModo: 0.9 };
}

/**
 * Modo numerado: "3) X", "Partido 3: 2", "3 - 1".
 *
 * El valor tiene que estar pegado al número del partido. Se prohíbe texto
 * intermedio a propósito: si se permitiera, un renglón de grilla como
 * "3 Talleres vs Belgrano  X" se leería como "partido 3 = X", que es la marca
 * de la columna y no el pronóstico. Ese error fue detectado en pruebas.
 */
function modoNumerado(lineas: Linea[], esperado: number): LecturaModo | null {
  const mapa = new Map<number, ValorLeido>();
  const re = /^\s*(?:partido\s*)?(\d{1,2})\s*(?:[).:\-–]\s*|\s)\s*([1xX2])\s*$/;
  for (const linea of lineas) {
    const m = linea.texto.match(re);
    if (!m) continue;
    const numero = Number(m[1]);
    if (!Number.isFinite(numero) || numero < 1 || numero > esperado) continue;
    const valor = etiquetaColumna(m[2]);
    if (!valor) continue;
    if (mapa.has(numero)) {
      const previo = mapa.get(numero)!;
      if (previo.valor !== valor) {
        mapa.set(numero, { ...previo, valor: null, confianza: 0, ambiguo: true });
      }
      continue;
    }
    mapa.set(numero, {
      valor,
      evidencia: linea.texto,
      pagina: linea.pagina,
      confianza: 0.92,
      ambiguo: false,
    });
  }
  if (mapa.size === 0) return null;
  const valores: ValorLeido[] = [];
  const maximo = Math.max(...mapa.keys());
  for (let i = 1; i <= Math.max(maximo, mapa.size); i++) {
    const v = mapa.get(i);
    valores.push(
      v ?? {
        valor: null,
        evidencia: `(no se encontró el renglón del partido ${i})`,
        pagina: null,
        confianza: 0,
        ambiguo: false,
      },
    );
  }
  return { modo: "numerado", valores, confianzaModo: 0.92 };
}

/** Modo secuencia: una tira "1 X 2 1 1 X ..." o "1X21 1X". Sólo si calza exacto. */
function modoSecuencia(lineas: Linea[], esperado: number): LecturaModo | null {
  const items: { char: string; linea: Linea }[] = [];
  for (const linea of lineas) {
    for (const t of linea.tokens) {
      const txt = t.texto.trim();
      if (!/^[1xX2]+$/.test(txt)) continue;
      for (const ch of txt) items.push({ char: ch, linea });
    }
  }
  if (items.length !== esperado) return null;
  const valores: ValorLeido[] = items.map((it) => ({
    valor: etiquetaColumna(it.char)!,
    evidencia: it.linea.texto,
    pagina: it.linea.pagina,
    confianza: 0.7,
    ambiguo: false,
  }));
  return { modo: "secuencia", valores, confianzaModo: 0.7 };
}

function leerPronosticos(lineas: Linea[], esperado: number): LecturaModo | null {
  const grilla = modoGrilla(lineas);

  // La lectura por posición manda: es la única que distingue una marca de un
  // pronóstico escrito. Si cuadra con la cantidad de partidos, no se discute.
  if (grilla && grilla.valores.length === esperado) return grilla;

  const hayGrilla = detectarEncabezadoGrilla(lineas) !== null;

  const candidatos = [
    grilla,
    modoNumerado(lineas, esperado),
    // Sólo tienen sentido si la boleta NO es una grilla de columnas.
    hayGrilla ? null : modoLineaFinal(lineas),
    hayGrilla ? null : modoSecuencia(lineas, esperado),
  ].filter((c): c is LecturaModo => c !== null);

  if (candidatos.length === 0) return null;

  const puntuar = (c: LecturaModo) => {
    const exacto = c.valores.length === esperado ? 100 : 0;
    const distancia = -Math.abs(c.valores.length - esperado) * 5;
    const legibles = c.valores.filter((v) => v.valor !== null).length;
    return exacto + distancia + legibles + c.confianzaModo * 10;
  };

  return candidatos.sort((a, b) => puntuar(b) - puntuar(a))[0];
}

/* -------------------------------------------------------------------------- */
/*  Participante y número de boleta                                           */
/* -------------------------------------------------------------------------- */

const RE_NOMBRE_ETIQUETADO =
  /(?:participante|nombre y apellido|apellido y nombre|nombre|jugador|socio)\s*[:.\-]\s*(.+)$/i;

const RE_NUMERO =
  /(?:boleta|ficha|tarjeta|cup[oó]n|tal[oó]n|ticket|n[°ºo]\.?|nro\.?|#)\s*[:.\-]?\s*(\d{1,6})\b/i;

function limpiarNombre(bruto: string): string {
  return bruto
    .replace(/\b(boleta|ficha|n[°ºo]\.?|nro\.?|#)\s*\d+\b/gi, "")
    .replace(/[|·•]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/[,;:.\-]+$/, "")
    .trim();
}

function pareceNombrePersona(texto: string): boolean {
  const limpio = texto.trim();
  if (limpio.length < 4 || limpio.length > 60) return false;
  if (/\d/.test(limpio)) return false;
  if (/\bvs\.?\b|\s[-–]\s/i.test(limpio)) return false;
  const palabras = limpio.split(/\s+/);
  if (palabras.length < 2 || palabras.length > 5) return false;
  for (const p of palabras) {
    if (PALABRAS_ESTRUCTURA.has(normalizar(p))) return false;
  }
  return palabras.every((p) => /^[A-ZÁÉÍÓÚÑ][\p{L}'.\-]*$/u.test(p) || p.length <= 3);
}

function detectarParticipante(lineas: Linea[]): {
  nombre: string | null;
  confianza: number;
  evidencia: string | null;
} {
  for (const linea of lineas) {
    const m = linea.texto.match(RE_NOMBRE_ETIQUETADO);
    if (m) {
      const nombre = limpiarNombre(m[1]);
      if (nombre.length >= 3 && /[a-zA-ZÁÉÍÓÚÑáéíóúñ]/.test(nombre)) {
        return { nombre, confianza: 0.96, evidencia: linea.texto };
      }
    }
  }
  for (const linea of lineas.slice(0, 8)) {
    const limpio = limpiarNombre(linea.texto);
    if (pareceNombrePersona(limpio)) {
      return { nombre: limpio, confianza: 0.6, evidencia: linea.texto };
    }
  }
  return { nombre: null, confianza: 0, evidencia: null };
}

function detectarNumero(lineas: Linea[]): { numero: string | null; evidencia: string | null } {
  for (const linea of lineas) {
    const m = linea.texto.match(RE_NUMERO);
    if (m) return { numero: m[1], evidencia: linea.texto };
  }
  return { numero: null, evidencia: null };
}

/* -------------------------------------------------------------------------- */
/*  Construcción de una boleta a partir de un segmento                        */
/* -------------------------------------------------------------------------- */

function problema(
  codigo: ProblemaBoleta["codigo"],
  severidad: ProblemaBoleta["severidad"],
  mensaje: string,
  pagina: number | null = null,
  textoProblematico: string | null = null,
  partidoNumero: number | null = null,
): ProblemaBoleta {
  return { codigo, severidad, mensaje, pagina, textoProblematico, partidoNumero };
}

function verificarOrdenPartidos(
  valores: ValorLeido[],
  partidos: Partido[],
): ProblemaBoleta[] {
  if (partidos.length === 0 || valores.length !== partidos.length) return [];
  let comparables = 0;
  let coincidencias = 0;
  for (let i = 0; i < valores.length; i++) {
    const evidencia = normalizar(valores[i].evidencia);
    if ((evidencia.match(/[a-z]/g) || []).length < 6) continue;
    comparables += 1;
    const local = normalizar(partidos[i].local);
    const visitante = normalizar(partidos[i].visitante);
    const hit =
      (local.length > 3 && evidencia.includes(local)) ||
      (visitante.length > 3 && evidencia.includes(visitante));
    if (hit) coincidencias += 1;
  }
  if (comparables >= 3 && coincidencias / comparables < 0.5) {
    return [
      problema(
        "PARTIDO_DESCONOCIDO",
        "aviso",
        `Los nombres de equipos leídos en la boleta coinciden con los partidos cargados en sólo ${coincidencias} de ${comparables} renglones. Verificá que el orden de los partidos sea el mismo.`,
        valores[0]?.pagina ?? null,
        valores.slice(0, 3).map((v) => v.evidencia).join(" | "),
      ),
    ];
  }
  return [];
}

function construirBoleta(segmento: Segmento, opciones: OpcionesAnalisis): BoletaCruda {
  const { cantidadPartidos, partidos } = opciones;
  const lineas = segmento.lineas;
  const textoCrudo = lineas.map((l) => `[p.${l.pagina}] ${l.texto}`).join("\n");
  const problemas: ProblemaBoleta[] = [];

  const { nombre, confianza, evidencia } = detectarParticipante(lineas);
  const { numero } = detectarNumero(lineas);
  const lectura = leerPronosticos(lineas, cantidadPartidos);

  if (!nombre) {
    problemas.push(
      problema(
        "NOMBRE_NO_DETECTADO",
        "error",
        "No se pudo identificar el nombre del participante en esta boleta.",
        segmento.paginas[0] ?? null,
        lineas.slice(0, 3).map((l) => l.texto).join(" | "),
      ),
    );
  } else if (confianza < 0.8) {
    problemas.push(
      problema(
        "NOMBRE_DUDOSO",
        "aviso",
        `El nombre "${nombre}" se dedujo de una línea sin etiqueta explícita. Confirmalo antes de publicar el ranking.`,
        segmento.paginas[0] ?? null,
        evidencia,
      ),
    );
  }

  if (!numero) {
    problemas.push(
      problema(
        "NUMERO_NO_DETECTADO",
        "aviso",
        "La boleta no declara un número identificatorio legible.",
        segmento.paginas[0] ?? null,
        null,
      ),
    );
  }

  let valores: ValorLeido[] = lectura?.valores ?? [];
  const cantidadLeida = valores.length;

  if (!lectura || valores.length === 0) {
    problemas.push(
      problema(
        "SEGMENTO_SIN_DATOS",
        "error",
        "No se detectó ningún pronóstico legible en esta boleta.",
        segmento.paginas[0] ?? null,
        lineas.slice(0, 5).map((l) => l.texto).join(" | "),
      ),
    );
  } else if (valores.length !== cantidadPartidos) {
    problemas.push(
      problema(
        "CANTIDAD_PRONOSTICOS",
        "error",
        `Se leyeron ${valores.length} pronósticos y la fecha tiene ${cantidadPartidos} partidos. No se puede saber a qué partido corresponde cada marca: hay que revisarla a mano.`,
        segmento.paginas[0] ?? null,
        valores.map((v) => v.evidencia).slice(0, 5).join(" | "),
      ),
    );
    // Se conservan las lecturas para que el revisor las vea, pero sin asignarlas.
    valores = valores.slice(0, cantidadPartidos);
    while (valores.length < cantidadPartidos) {
      valores.push({
        valor: null,
        evidencia: "(sin lectura)",
        pagina: null,
        confianza: 0,
        ambiguo: false,
      });
    }
  }

  valores.forEach((v, i) => {
    if (v.ambiguo) {
      problemas.push(
        problema(
          "PRONOSTICO_AMBIGUO",
          "error",
          `El partido ${i + 1} tiene más de una opción marcada. No se interpreta.`,
          v.pagina,
          v.evidencia,
          i + 1,
        ),
      );
    } else if (v.valor === null && lectura) {
      problemas.push(
        problema(
          "PRONOSTICO_FALTANTE",
          "error",
          `El partido ${i + 1} no tiene un pronóstico legible.`,
          v.pagina,
          v.evidencia,
          i + 1,
        ),
      );
    }
  });

  if (lectura && valores.length === cantidadPartidos) {
    problemas.push(...verificarOrdenPartidos(valores, partidos));
  }

  return {
    participante: nombre,
    participanteConfianza: confianza,
    participanteEvidencia: evidencia,
    numeroBoleta: numero,
    paginas: segmento.paginas,
    valores,
    cantidadLeida,
    problemas,
    textoCrudo,
    metodo: lectura?.modo ?? "sin-lectura",
  };
}

/* -------------------------------------------------------------------------- */
/*  Puntuación de estrategias y análisis principal                            */
/* -------------------------------------------------------------------------- */

/**
 * Puntúa una segmentación completa. La señal más fuerte es la cantidad de
 * boletas que quedan limpias: una estrategia que produce muchas boletas con
 * error está partiendo el documento por el lugar equivocado.
 */
function puntuarBoletas(boletas: BoletaCruda[], esperado: number): number {
  if (boletas.length === 0) return -1000;
  let puntaje = 0;
  for (const b of boletas) {
    const errores = b.problemas.filter((p) => p.severidad === "error").length;
    if (errores > 0) puntaje -= 10 + Math.min(errores, 4) * 2;

    // Se mide la cantidad REALMENTE leída, no la ya recortada a `esperado`.
    if (b.cantidadLeida === esperado) puntaje += 8;
    else puntaje -= Math.min(8, Math.abs(b.cantidadLeida - esperado));

    const legibles = b.valores.filter((v) => v.valor !== null).length;
    puntaje += (legibles / Math.max(1, esperado)) * 4;

    if (b.participante) puntaje += b.participanteConfianza > 0.8 ? 3 : 1.5;
    else puntaje -= 3;
    if (b.numeroBoleta) puntaje += 1;

    // Red de seguridad: una boleta larga con un único valor repetido casi
    // siempre significa que se leyó la marca de la columna, no el pronóstico.
    // Es posible que alguien juegue todo "1", por eso la penalización es leve.
    const distintos = new Set(b.valores.map((v) => v.valor).filter((v) => v !== null));
    if (b.valores.length >= 6 && distintos.size === 1) puntaje -= 2.5;
  }
  return Math.round((puntaje / boletas.length) * 100) / 100;
}

export function analizarDocumento(
  doc: DocumentoExtraido,
  opciones: OpcionesAnalisis,
): ResultadoAnalisis {
  const estrategias: { nombre: string; segmentos: Segmento[] }[] = [];

  for (const ancla of ANCLAS) {
    const segmentos = segmentarPorAncla(doc, ancla.re);
    if (segmentos.length > 0) estrategias.push({ nombre: ancla.nombre, segmentos });
  }
  estrategias.push({ nombre: "una-boleta-por-pagina", segmentos: segmentarPorPagina(doc) });

  const columnas = segmentarPorColumnas(doc);
  if (columnas.length) estrategias.push({ nombre: "columnas", segmentos: columnas });

  const bloques = segmentarPorBloques(doc);
  if (bloques.length) estrategias.push({ nombre: "bloques", segmentos: bloques });

  const evaluadas: {
    nombre: string;
    boletas: BoletaCruda[];
    puntaje: number;
  }[] = [];

  for (const estrategia of estrategias) {
    if (estrategia.segmentos.length === 0) continue;
    const boletas = estrategia.segmentos.map((s) => construirBoleta(s, opciones));
    evaluadas.push({
      nombre: estrategia.nombre,
      boletas,
      puntaje: puntuarBoletas(boletas, opciones.cantidadPartidos),
    });
  }

  if (evaluadas.length === 0) {
    return {
      boletas: [],
      estrategia: "ninguna",
      puntaje: 0,
      estrategiasEvaluadas: [],
    };
  }

  evaluadas.sort((a, b) => b.puntaje - a.puntaje);
  const ganadora = evaluadas[0];

  return {
    boletas: ganadora.boletas,
    estrategia: ganadora.nombre,
    puntaje: ganadora.puntaje,
    estrategiasEvaluadas: evaluadas.map((e) => ({
      nombre: e.nombre,
      boletas: e.boletas.length,
      puntaje: e.puntaje,
    })),
  };
}
