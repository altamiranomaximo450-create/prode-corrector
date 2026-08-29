/**
 * pdfjs-dist no publica tipos para el bundle del worker. Sólo se usa para
 * registrarlo en globalThis, así que declararlo suelto es suficiente.
 */
declare module "pdfjs-dist/legacy/build/pdf.worker.mjs";
