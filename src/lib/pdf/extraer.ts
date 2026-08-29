/**
 * Extracción de la capa de texto de un PDF, conservando coordenadas.
 *
 * Se usa pdfjs-dist (build legacy, pensado para Node). La posición X/Y de cada
 * fragmento es imprescindible: en las boletas de Prode el pronóstico muchas
 * veces no es una palabra sino una marca ("X") ubicada bajo la columna 1, X o 2.
 * Sin coordenadas ese dato es irrecuperable.
 *
 * Este módulo NO interpreta nada. Sólo devuelve lo que el PDF dice y dónde.
 */

export interface Token {
  pagina: number;
  x: number;
  y: number;
  ancho: number;
  alto: number;
  texto: string;
}

export interface Linea {
  pagina: number;
  y: number;
  alto: number;
  tokens: Token[];
  texto: string;
  xInicio: number;
  xFin: number;
}

export interface PaginaExtraida {
  numero: number;
  ancho: number;
  alto: number;
  tokens: Token[];
  lineas: Linea[];
  caracteres: number;
}

export interface DocumentoExtraido {
  paginas: PaginaExtraida[];
  totalCaracteres: number;
  tieneCapaTexto: boolean;
  paginasConTexto: number[];
  paginasSinTexto: number[];
}

/** Umbral por debajo del cual consideramos que una página no tiene capa de texto útil. */
export const MIN_CARACTERES_PAGINA = 12;

type ProgresoFn = (paginaActual: number, totalPaginas: number) => void;

/* eslint-disable @typescript-eslint/no-explicit-any */

let pdfjsCache: any = null;

async function cargarPdfjs(): Promise<any> {
  if (pdfjsCache) return pdfjsCache;

  // En Node, pdfjs desactiva el Worker y busca el "worker falso" en
  // globalThis.pdfjsWorker. Cargarlo así (import estático por especificador, no
  // por ruta de archivo) es lo único que funciona igual en local y en el
  // bundle serverless de Vercel: no hay que resolver ninguna URL en runtime.
  const worker: any = await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
  (globalThis as any).pdfjsWorker = worker;

  // El build "legacy" evita APIs de navegador que no existen en Node.
  const mod: any = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjsCache = mod;
  return mod;
}

export function agruparEnLineas(tokens: Token[], pagina: number): Linea[] {
  if (tokens.length === 0) return [];

  const alturas = tokens.map((t) => t.alto).filter((a) => a > 0).sort((a, b) => a - b);
  const alturaMediana = alturas.length ? alturas[Math.floor(alturas.length / 2)] : 10;
  const tolerancia = Math.max(1.5, alturaMediana * 0.55);

  const ordenados = [...tokens].sort((a, b) => (b.y - a.y) || (a.x - b.x));

  const grupos: Token[][] = [];
  let actual: Token[] = [];
  let yRef = Number.NaN;

  for (const token of ordenados) {
    if (actual.length === 0 || Math.abs(token.y - yRef) <= tolerancia) {
      if (actual.length === 0) yRef = token.y;
      actual.push(token);
      // el ancla es el promedio, así una línea "escalonada" no se parte
      yRef = actual.reduce((s, t) => s + t.y, 0) / actual.length;
    } else {
      grupos.push(actual);
      actual = [token];
      yRef = token.y;
    }
  }
  if (actual.length) grupos.push(actual);

  return grupos.map((grupo) => {
    const orden = [...grupo].sort((a, b) => a.x - b.x);
    // Se inserta un espacio cuando el hueco horizontal supera el ancho de un carácter.
    let texto = "";
    for (let i = 0; i < orden.length; i++) {
      const t = orden[i];
      if (i > 0) {
        const prev = orden[i - 1];
        const hueco = t.x - (prev.x + prev.ancho);
        const anchoChar = prev.ancho / Math.max(1, prev.texto.length);
        if (hueco > anchoChar * 0.35) texto += " ";
      }
      texto += t.texto;
    }
    return {
      pagina,
      y: orden.reduce((s, t) => s + t.y, 0) / orden.length,
      alto: Math.max(...orden.map((t) => t.alto), 1),
      tokens: orden,
      texto: texto.replace(/\s+/g, " ").trim(),
      xInicio: Math.min(...orden.map((t) => t.x)),
      xFin: Math.max(...orden.map((t) => t.x + t.ancho)),
    };
  });
}

export async function extraerDocumento(
  datos: Uint8Array,
  onProgreso?: ProgresoFn,
): Promise<DocumentoExtraido> {
  const pdfjs = await cargarPdfjs();

  const tarea = pdfjs.getDocument({
    data: datos,
    useWorkerFetch: false,
    isEvalSupported: false,
    disableFontFace: true,
    useSystemFonts: false,
    // Evita que pdfjs intente descargar recursos externos.
    verbosity: 0,
  });

  const doc = await tarea.promise;
  const paginas: PaginaExtraida[] = [];

  try {
    for (let n = 1; n <= doc.numPages; n++) {
      try {
        const pagina = await doc.getPage(n);
        const viewport = pagina.getViewport({ scale: 1 });
        const contenido = await pagina.getTextContent({
          includeMarkedContent: false,
          disableNormalization: false,
        });

        const tokens: Token[] = [];
        for (const item of contenido.items as any[]) {
          if (typeof item.str !== "string") continue;
          const texto = item.str.trim();
          if (texto === "") continue;
          const tr = item.transform as number[];
          const alto = Math.abs(item.height) || Math.hypot(tr[1], tr[3]) || 10;
          tokens.push({
            pagina: n,
            x: tr[4],
            y: tr[5],
            ancho: Math.abs(item.width) || texto.length * alto * 0.5,
            alto,
            texto,
          });
        }

        const lineas = agruparEnLineas(tokens, n);
        paginas.push({
          numero: n,
          ancho: viewport.width,
          alto: viewport.height,
          tokens,
          lineas,
          caracteres: tokens.reduce((s, t) => s + t.texto.length, 0),
        });

        pagina.cleanup();
      } catch {
        // Una página rota (fuente corrupta, objeto ilegible) no puede tumbar el
        // documento entero: se registra vacía y se sigue con las siguientes.
        paginas.push({ numero: n, ancho: 0, alto: 0, tokens: [], lineas: [], caracteres: 0 });
      }
      onProgreso?.(n, doc.numPages);
    }
  } finally {
    await doc.destroy().catch(() => undefined);
  }

  const paginasConTexto = paginas
    .filter((p) => p.caracteres >= MIN_CARACTERES_PAGINA)
    .map((p) => p.numero);
  const paginasSinTexto = paginas
    .filter((p) => p.caracteres < MIN_CARACTERES_PAGINA)
    .map((p) => p.numero);

  return {
    paginas,
    totalCaracteres: paginas.reduce((s, p) => s + p.caracteres, 0),
    tieneCapaTexto: paginasConTexto.length > 0,
    paginasConTexto,
    paginasSinTexto,
  };
}
