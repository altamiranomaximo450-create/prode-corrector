/**
 * Combina los `DocumentoExtraido` de varios chunks (cada uno un PDF chico,
 * subido y extraído por separado) en un único documento con numeración de
 * página GLOBAL, como si se hubiera extraído el PDF completo de una sola vez.
 *
 * Esto es lo que le permite al worker de PDFs grandes procesar el archivo por
 * partes (nunca lo tiene entero en memoria) sin que la segmentación de
 * boletas se entere de que el documento vino en pedazos: `analizarDocumento`
 * corre una sola vez, al final, sobre el documento ya combinado.
 */

import type { DocumentoExtraido, PaginaExtraida } from "./extraer";

const MIN_CARACTERES_PAGINA = 12;

/** Corre la numeración de página de un chunk para que encaje en el documento completo. */
export function remapPaginas(paginas: PaginaExtraida[], offset: number): PaginaExtraida[] {
  return paginas.map((p) => ({
    ...p,
    numero: p.numero + offset,
    tokens: p.tokens.map((t) => ({ ...t, pagina: t.pagina + offset })),
    lineas: p.lineas.map((l) => ({
      ...l,
      pagina: l.pagina + offset,
      tokens: l.tokens.map((t) => ({ ...t, pagina: t.pagina + offset })),
    })),
  }));
}

/** Junta las páginas (ya remapeadas) de todos los chunks y recalcula los totales del documento. */
export function combinarPaginas(todas: PaginaExtraida[]): DocumentoExtraido {
  const paginas = [...todas].sort((a, b) => a.numero - b.numero);
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
