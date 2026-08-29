/**
 * Analizador de boletas.
 *
 * No asume un formato: prueba varias maneras de partir el documento en boletas
 * (por ancla textual, por página, por columnas, por bloques) y varias maneras de
 * leer los pronósticos, puntúa cada combinación y se queda con la que mejor
 * explica el documento. Una página puede tener varias boletas y una boleta
 * puede ocupar varias páginas: por eso "una boleta por página" es sólo una de
 * las estrategias, nunca un supuesto.
 *
 * Nada acá detiene el procesamiento. Lo que no se puede leer queda como
 * pronóstico vacío (ese partido no suma) y la boleta sigue compitiendo.
 */

import type { Linea, DocumentoExtraido, Token } from "./extraer";
import type { Pronostico } from "../tipos";

export function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

const PALABRAS_ESTRUCTURA = new Set([
  "prode", "fecha", "boleta", "ficha", "tarjeta", "cupon", "talon", "partido",
  "partidos", "local", "empate", "visitante", "resultado", "resultados",
  "pronostico", "pronosticos", "aciertos", "total", "puntaje", "firma",
  "planilla", "torneo", "jornada", "equipo", "equipos", "vs", "nombre",
  "participante", "jugador", "numero",
]);

const MARCAS = /^[xX✓✔✗✘●•·*+]$/;

export interface ValorLeido {
  /** Opciones marcadas: 1 normalmente, 2 si es un doble, vacío si no se leyó. */
  opciones: Pronostico[];
  evidencia: string;
  pagina: number | null;
}

export interface BoletaCruda {
  participante: string | null;
  numeroBoleta: string | null;
  paginas: number[];
  valores: ValorLeido[];
  /** Cuántos pronósticos se leyeron ANTES de ajustar a la cantidad esperada.
   *  Es la señal honesta de si la segmentación fue la correcta. */
  cantidadLeida: number;
  textoCrudo: string;
}

export interface ResultadoAnalisis {
  boletas: BoletaCruda[];
  estrategia: string;
  puntaje: number;
}

interface Segmento {
  lineas: Linea[];
  paginas: number[];
}

/* -------------------------------------------------------------------------- */
/*  Segmentación: dónde empieza y termina cada boleta                         */
/* -------------------------------------------------------------------------- */

const ANCLAS: { nombre: string; re: RegExp }[] = [
  {
    nombre: "boleta-numerada",
    re: /\b(boleta|ficha|tarjeta|cup[oó]n|tal[oó]n|ticket)\b\s*(n[°ºo]?\.?|nro\.?|num\.?|#)?\s*:?\s*\d{1,8}\b/i,
  },
  { nombre: "boleta", re: /^\s*(boleta|ficha|tarjeta|cup[oó]n|tal[oó]n|ticket)\b/i },
  {
    nombre: "participante",
    re: /^\s*(participante|nombre y apellido|apellido y nombre|nombre|jugador|socio)\s*[:.\-]/i,
  },
  { nombre: "prode", re: /^\s*prode\b/i },
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
      // Un canal vacío de al menos ~5% del ancho, y que no sea un margen.
      if (i - inicioVacio >= 3 && inicioVacio > bins * 0.12 && i < bins * 0.88) {
        cortes.push(((inicioVacio + i) / 2 / bins) * ancho);
      }
      inicioVacio = -1;
    }
  }
  return cortes;
}

/** Varias boletas lado a lado en la misma página. */
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
      const lineas = pagina.lineas.filter((l) => {
        const centro = (l.xInicio + l.xFin) / 2;
        return centro >= limites[i] && centro < limites[i + 1];
      });
      if (lineas.length > 0) segmentos.push({ lineas, paginas: [pagina.numero] });
    }
  }
  return segmentos.length > doc.paginas.length ? segmentos : [];
}

/** Varias boletas apiladas en la misma página, separadas por espacio en blanco. */
function segmentarPorBloques(doc: DocumentoExtraido): Segmento[] {
  const segmentos: Segmento[] = [];
  for (const pagina of doc.paginas) {
    const lineas = pagina.lineas;
    if (lineas.length < 4) continue;
    const huecos: number[] = [];
    for (let i = 1; i < lineas.length; i++) huecos.push(Math.abs(lineas[i - 1].y - lineas[i].y));
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
/*  Lectura de pronósticos                                                    */
/* -------------------------------------------------------------------------- */

interface LecturaModo {
  modo: string;
  valores: ValorLeido[];
  confianza: number;
}

function etiquetaColumna(texto: string): Pronostico | null {
  const t = normalizar(texto).replace(/[^a-z0-9]/g, "");
  if (t === "1" || t === "l" || t === "local") return "1";
  if (t === "x" || t === "e" || t === "empate") return "X";
  if (t === "2" || t === "v" || t === "visitante") return "2";
  return null;
}

/**
 * Interpreta un texto suelto como pronóstico simple o doble.
 * Acepta las formas equivalentes que aparecen en las boletas: "1", "1/X",
 * "X/1", "1 X", "1-X", "1X".
 */
export function interpretarPronostico(texto: string): Pronostico[] {
  const piezas = texto
    .trim()
    .split(/[\s/,\-–|]+/)
    .flatMap((p) => (/^[1xX2lLeEvV]{2}$/.test(p) ? p.split("") : [p]))
    .filter(Boolean);
  const opciones: Pronostico[] = [];
  for (const p of piezas) {
    const v = etiquetaColumna(p);
    if (v && !opciones.includes(v)) opciones.push(v);
  }
  // Tres marcas no es un doble: no hay forma de saber qué quiso decir, así que
  // ese partido queda sin pronóstico (vale 0) sin frenar nada.
  return opciones.length > 2 ? [] : opciones;
}

interface EncabezadoGrilla {
  centros: { valor: Pronostico; x: number }[];
  indice: number;
}

/**
 * Busca el renglón que hace de encabezado de columnas (1 / X / 2, o
 * Local / Empate / Visitante). Si existe, el pronóstico está codificado por
 * POSICIÓN: leer el último token del renglón daría siempre la misma marca, así
 * que los modos "planos" se desactivan.
 */
function detectarEncabezadoGrilla(lineas: Linea[]): EncabezadoGrilla | null {
  for (let i = 0; i < lineas.length; i++) {
    const unicos = new Map<Pronostico, number>();
    for (const t of lineas[i].tokens) {
      const et = etiquetaColumna(t.texto);
      if (et && !unicos.has(et)) unicos.set(et, t.x + t.ancho / 2);
    }
    if (unicos.size !== 3) continue;
    const orden = [...unicos.entries()].sort((a, b) => a[1] - b[1]);
    // El encabezado tiene que leerse 1, X, 2 de izquierda a derecha.
    if (orden[0][0] === "1" && orden[1][0] === "X" && orden[2][0] === "2") {
      return { centros: orden.map(([valor, x]) => ({ valor, x })), indice: i };
    }
  }
  return null;
}

/** Grilla: columnas 1 / X / 2 con una marca bajo la elegida. */
function modoGrilla(lineas: Linea[]): LecturaModo | null {
  const encabezado = detectarEncabezadoGrilla(lineas);
  if (!encabezado) return null;
  const { centros, indice } = encabezado;

  const separacion = Math.min(centros[1].x - centros[0].x, centros[2].x - centros[1].x);
  if (separacion <= 0) return null;
  const tolerancia = separacion * 0.45;

  const valores: ValorLeido[] = [];
  for (let i = indice + 1; i < lineas.length; i++) {
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
      // Dos marcas es un doble válido. Tres es ilegible: queda vacío.
      opciones: distintos.length <= 2 ? distintos : [],
      evidencia: linea.texto,
      pagina: linea.pagina,
    });
  }

  return valores.length ? { modo: "grilla", valores, confianza: 0.95 } : null;
}

/** Cada renglón de partido termina con su pronóstico: "River vs Racing   1/X". */
function modoLineaFinal(lineas: Linea[]): LecturaModo | null {
  const valores: ValorLeido[] = [];
  for (const linea of lineas) {
    if (linea.tokens.length < 2) continue;
    const m = linea.texto.match(/([1xX2](?:\s*[/\-–]?\s*[1xX2])?)\s*$/);
    if (!m) continue;
    const opciones = interpretarPronostico(m[1]);
    if (opciones.length === 0) continue;
    const resto = linea.texto.slice(0, linea.texto.length - m[0].length);
    // Tiene que haber nombre de partido antes de la marca, no números sueltos.
    if ((resto.match(/[a-zA-ZÁÉÍÓÚÑáéíóúñ]/g) || []).length < 4) continue;
    if (PALABRAS_ESTRUCTURA.has(normalizar(resto).replace(/[^a-z]/g, ""))) continue;
    valores.push({ opciones, evidencia: linea.texto, pagina: linea.pagina });
  }
  return valores.length ? { modo: "linea-final", valores, confianza: 0.9 } : null;
}

/**
 * Numerado: "3) X", "Partido 3: 2", "3 - 1/X".
 *
 * El valor tiene que estar pegado al número del partido. Se prohíbe texto
 * intermedio a propósito: si se permitiera, un renglón de grilla como
 * "3 Talleres vs Belgrano  X" se leería como "partido 3 = X", que es la marca
 * de la columna y no el pronóstico.
 */
function modoNumerado(lineas: Linea[], esperado: number): LecturaModo | null {
  const mapa = new Map<number, ValorLeido>();
  const re = /^\s*(?:partido\s*)?(\d{1,2})\s*(?:[).:\-–]\s*|\s)\s*([1xX2](?:\s*[/\-–]?\s*[1xX2])?)\s*$/;
  for (const linea of lineas) {
    const m = linea.texto.match(re);
    if (!m) continue;
    const numero = Number(m[1]);
    if (!Number.isInteger(numero) || numero < 1 || numero > esperado) continue;
    const opciones = interpretarPronostico(m[2]);
    if (opciones.length === 0) continue;
    if (mapa.has(numero)) continue;
    mapa.set(numero, { opciones, evidencia: linea.texto, pagina: linea.pagina });
  }
  if (mapa.size === 0) return null;

  const maximo = Math.max(...mapa.keys());
  const valores: ValorLeido[] = [];
  for (let i = 1; i <= Math.max(maximo, mapa.size); i++) {
    valores.push(
      mapa.get(i) ?? { opciones: [], evidencia: "(sin lectura)", pagina: null },
    );
  }
  return { modo: "numerado", valores, confianza: 0.92 };
}

/** Una tira suelta: "1 X 2 1 1 X ...". Sólo si la cantidad calza exacto. */
function modoSecuencia(lineas: Linea[], esperado: number): LecturaModo | null {
  const items: { char: string; linea: Linea }[] = [];
  for (const linea of lineas) {
    for (const t of linea.tokens) {
      const txt = t.texto.trim();
      if (!/^[1xX2]+$/.test(txt)) continue;
      for (const ch of txt) items.push({ char: ch, linea: linea });
    }
  }
  if (items.length !== esperado) return null;
  return {
    modo: "secuencia",
    valores: items.map((it) => ({
      opciones: interpretarPronostico(it.char),
      evidencia: it.linea.texto,
      pagina: it.linea.pagina,
    })),
    confianza: 0.7,
  };
}

function leerPronosticos(lineas: Linea[], esperado: number): LecturaModo | null {
  const grilla = modoGrilla(lineas);
  // La lectura por posición manda: es la única que distingue una marca de un
  // pronóstico escrito. Si la cantidad calza, no se discute.
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

  const puntuar = (c: LecturaModo) =>
    (c.valores.length === esperado ? 100 : 0) -
    Math.abs(c.valores.length - esperado) * 5 +
    c.valores.filter((v) => v.opciones.length > 0).length +
    c.confianza * 10;

  return candidatos.sort((a, b) => puntuar(b) - puntuar(a))[0];
}

/* -------------------------------------------------------------------------- */
/*  Participante y número de boleta                                           */
/* -------------------------------------------------------------------------- */

const RE_NOMBRE =
  /(?:participante|nombre y apellido|apellido y nombre|nombre|jugador|socio)\s*[:.\-]\s*(.+)$/i;

// Admite las formas que aparecen en las boletas reales: "Boleta 201",
// "BOLETA N 201", "Boleta N° 201", "Ficha Nro. 201", "Boleta: 201", "#201".
const RE_NUMERO =
  /(?:boleta|ficha|tarjeta|cup[oó]n|tal[oó]n|ticket)\s*(?:n[°ºo]?\.?|nro\.?|num\.?|#)?\s*[:.\-]?\s*(\d{1,8})\b/i;

/** Respaldo para cuando el número va solo, sin la palabra "boleta" delante. */
const RE_NUMERO_SUELTO = /(?:n[°º]\.?|nro\.?|#)\s*[:.\-]?\s*(\d{1,8})\b/i;

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
  if (palabras.some((p) => PALABRAS_ESTRUCTURA.has(normalizar(p)))) return false;
  return palabras.every((p) => /^[A-ZÁÉÍÓÚÑ][\p{L}'.\-]*$/u.test(p) || p.length <= 3);
}

/**
 * Nombre del participante. Primero una etiqueta explícita ("Participante: ..."),
 * y si no hay, la primera línea del encabezado que parezca un nombre de persona.
 * Nunca se deduplica ni se corrige: dos boletas con el mismo nombre son dos
 * boletas distintas y las dos cuentan.
 */
function detectarParticipante(lineas: Linea[]): string | null {
  for (const linea of lineas) {
    const m = linea.texto.match(RE_NOMBRE);
    if (m) {
      const nombre = limpiarNombre(m[1]);
      if (nombre.length >= 3 && /[a-zA-ZÁÉÍÓÚÑáéíóúñ]/.test(nombre)) return nombre;
    }
  }
  for (const linea of lineas.slice(0, 8)) {
    const limpio = limpiarNombre(linea.texto);
    if (pareceNombrePersona(limpio)) return limpio;
  }
  return null;
}

function detectarNumero(lineas: Linea[]): string | null {
  for (const linea of lineas) {
    const m = linea.texto.match(RE_NUMERO);
    if (m) return m[1];
  }
  for (const linea of lineas) {
    const m = linea.texto.match(RE_NUMERO_SUELTO);
    if (m) return m[1];
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/*  Construcción y elección de estrategia                                     */
/* -------------------------------------------------------------------------- */

function construirBoleta(segmento: Segmento, cantidadPartidos: number): BoletaCruda {
  const { lineas } = segmento;
  const lectura = leerPronosticos(lineas, cantidadPartidos);

  let valores: ValorLeido[] = lectura?.valores ?? [];
  const cantidadLeida = valores.length;

  // Se ajusta a la cantidad de partidos de la fecha. Si se leyeron de más se
  // recortan, si faltan se completan vacíos: esos partidos valen 0 para esta
  // boleta, pero la boleta entra al ranking igual.
  valores = valores.slice(0, cantidadPartidos);
  while (valores.length < cantidadPartidos) {
    valores.push({ opciones: [], evidencia: "(sin lectura)", pagina: null });
  }

  return {
    participante: detectarParticipante(lineas),
    numeroBoleta: detectarNumero(lineas),
    paginas: segmento.paginas,
    valores,
    cantidadLeida,
    textoCrudo: lineas.map((l) => `[p.${l.pagina}] ${l.texto}`).join("\n"),
  };
}

/**
 * Puntúa una segmentación completa. La señal más fuerte es cuántas boletas
 * leyeron exactamente la cantidad de partidos de la fecha: una estrategia que
 * parte el documento por el lugar equivocado lee de más o de menos.
 */
function puntuar(boletas: BoletaCruda[], esperado: number): number {
  if (boletas.length === 0) return -1000;
  let puntaje = 0;
  for (const b of boletas) {
    if (b.cantidadLeida === esperado) puntaje += 10;
    else puntaje -= Math.min(10, Math.abs(b.cantidadLeida - esperado));

    puntaje += (b.valores.filter((v) => v.opciones.length > 0).length / esperado) * 4;
    puntaje += b.participante ? 3 : -3;
    if (b.numeroBoleta) puntaje += 1;

    // Red de seguridad: una boleta larga con un único valor repetido casi
    // siempre significa que se leyó la marca de la columna y no el pronóstico.
    // Alguien puede jugar todo "1", por eso la penalización es leve.
    const distintos = new Set(b.valores.filter((v) => v.opciones.length === 1).map((v) => v.opciones[0]));
    if (b.valores.length >= 6 && distintos.size === 1) puntaje -= 2.5;
  }
  return Math.round((puntaje / boletas.length) * 100) / 100;
}

export function analizarDocumento(
  doc: DocumentoExtraido,
  cantidadPartidos: number,
): ResultadoAnalisis {
  const estrategias: { nombre: string; segmentos: Segmento[] }[] = [];

  for (const ancla of ANCLAS) {
    const segmentos = segmentarPorAncla(doc, ancla.re);
    if (segmentos.length > 0) estrategias.push({ nombre: `ancla-${ancla.nombre}`, segmentos });
  }
  estrategias.push({ nombre: "una-por-pagina", segmentos: segmentarPorPagina(doc) });
  const columnas = segmentarPorColumnas(doc);
  if (columnas.length) estrategias.push({ nombre: "columnas", segmentos: columnas });
  const bloques = segmentarPorBloques(doc);
  if (bloques.length) estrategias.push({ nombre: "bloques", segmentos: bloques });

  const evaluadas = estrategias
    .filter((e) => e.segmentos.length > 0)
    .map((e) => {
      const boletas = e.segmentos.map((s) => construirBoleta(s, cantidadPartidos));
      return { nombre: e.nombre, boletas, puntaje: puntuar(boletas, cantidadPartidos) };
    });

  if (evaluadas.length === 0) return { boletas: [], estrategia: "ninguna", puntaje: 0 };

  evaluadas.sort((a, b) => b.puntaje - a.puntaje);
  const ganadora = evaluadas[0];
  return { boletas: ganadora.boletas, estrategia: ganadora.nombre, puntaje: ganadora.puntaje };
}
