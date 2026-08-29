/**
 * Puente con worker/extraer.py, que es donde se leen las páginas que pdfjs no
 * pudo: la capa de texto con PyMuPDF, las casillas marcadas mirando la imagen
 * (worker/marcas.py) y los textos con OCR (worker/ocr.py).
 *
 * Por qué existe: pdfjs lee muy bien los PDFs "normales" y es el camino afinado
 * contra el formato de las boletas, pero deja vacías las páginas que son una
 * imagen —una foto, una captura de pantalla— y algunas con fuentes rotas. Este
 * módulo se ocupa SOLO de esas páginas, y siempre devuelve el mismo formato que
 * pdfjs para que el analizador no se entere de por dónde vino cada página.
 *
 * Es opcional a propósito. Si en la máquina no hay Python o no está PyMuPDF, se
 * avisa una vez y el procesamiento sigue: esas páginas quedan vacías, pero
 * ninguna boleta legible se pierde por eso. En el runner de GitHub Actions sí
 * está instalado (ver .github/workflows/worker.yml).
 */

import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { agruparEnLineas, type PaginaExtraida, type Token } from "../src/lib/pdf/extraer";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(AQUI, "extraer.py");

/** Tope de salida del script: 64 MB. Una parte del PDF nunca genera tanto texto. */
const MAX_SALIDA = 64 * 1024 * 1024;
/** Tope de tiempo por parte del PDF. Con OCR, 200 paginas pueden tardar minutos. */
const TIEMPO_MAXIMO_MS = 60 * 60_000;

interface ItemPy {
  texto: string;
  x: number;
  y: number;
  ancho: number;
  alto: number;
}

/**
 * De dónde salió el contenido de la página:
 *   pymupdf     capa de texto que pdfjs no pudo leer
 *   ocr         imagen leída con OCR
 *   marcas      boleta gráfica: casillas detectadas en la imagen
 *   marcas+ocr  las dos cosas (lo habitual en una boleta gráfica con nombre)
 *   sin-texto   no se pudo sacar nada
 */
type OrigenPagina = "pymupdf" | "ocr" | "marcas" | "marcas+ocr" | "sin-texto" | "error";

interface PaginaPy {
  numero: number;
  ancho: number;
  alto: number;
  origen: OrigenPagina;
  items: ItemPy[];
  error?: string;
}

interface SalidaPy {
  ok: boolean;
  paginas?: PaginaPy[];
  error?: string;
  ocrDisponible?: boolean;
  grilla?: boolean;
  grillaMotivo?: string;
  aviso?: string;
}

export interface ResultadoRescate {
  /** Páginas recuperadas, en el mismo formato que devuelve pdfjs. */
  paginas: PaginaExtraida[];
  /** Cuántas se leyeron de la imagen (OCR o detección de marcas). */
  conOcr: number;
  /** Cuántas eran boletas gráficas con la grilla de casillas detectada. */
  conMarcas: number;
  /** Motivo por el que no se pudo rescatar nada, si aplica. */
  aviso: string | null;
}

const VACIO: ResultadoRescate = { paginas: [], conOcr: 0, conMarcas: 0, aviso: null };

/* -------------------------------------------------------------------------- */

let comandoPython: string[] | null | undefined;

/** Busca un Python usable una sola vez por proceso. `null` = no hay. */
function buscarPython(): string[] | null {
  if (comandoPython !== undefined) return comandoPython;

  const candidatos: string[][] = process.env.PYTHON_BIN
    ? [[process.env.PYTHON_BIN]]
    : [["python3"], ["python"], ["py", "-3"]];

  for (const cmd of candidatos) {
    const r = spawnSync(cmd[0], [...cmd.slice(1), "-c", "import pymupdf, numpy"], {
      encoding: "utf8",
      timeout: 60_000,
      windowsHide: true,
    });
    if (r.status === 0) {
      comandoPython = cmd;
      return cmd;
    }
  }
  comandoPython = null;
  return null;
}

interface SalidaProceso {
  stdout: string;
  stderr: string;
  error: string | null;
}

/**
 * Corre el script de Python SIN bloquear el bucle de Node.
 *
 * Antes se usaba `spawnSync` y traía un problema real: leer con OCR un pedazo
 * grande del PDF puede llevar varios minutos, y durante todo ese rato el worker
 * quedaba congelado, sin poder mandar su latido. Un trabajo sin latido se
 * considera abandonado, así que otro worker podía tomarlo y procesar el mismo
 * PDF dos veces.
 */
function ejecutar(python: string[], argumentos: string[]): Promise<SalidaProceso> {
  return new Promise((resolver) => {
    const hijo = spawn(python[0], [...python.slice(1), ...argumentos], {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let excedido = false;

    // Tope de tiempo: el OCR es lento, pero no infinito.
    const corte = setTimeout(() => {
      excedido = true;
      hijo.kill("SIGKILL");
    }, TIEMPO_MAXIMO_MS);

    hijo.stdout.on("data", (d: Buffer) => {
      if (stdout.length < MAX_SALIDA) stdout += d.toString();
    });
    hijo.stderr.on("data", (d: Buffer) => {
      if (stderr.length < 64 * 1024) stderr += d.toString();
    });
    hijo.on("error", (e) => {
      clearTimeout(corte);
      resolver({ stdout, stderr, error: e.message });
    });
    hijo.on("close", () => {
      clearTimeout(corte);
      resolver({
        stdout,
        stderr,
        error: excedido ? `se pasó de ${TIEMPO_MAXIMO_MS / 60_000} minutos` : null,
      });
    });
  });
}

let avisoDado = false;

/**
 * Reintenta leer las páginas indicadas del PDF que está en `rutaPdf`.
 *
 * @param rutaPdf   archivo de la parte del PDF, ya en disco
 * @param numeros   páginas a rescatar, numeradas DENTRO de esa parte (1..n)
 * @param offset    cuánto sumarle a cada número para llegar a la página global
 */
export async function rescatarPaginas(
  rutaPdf: string,
  numeros: number[],
  offset: number,
  rutaGrilla?: string,
): Promise<ResultadoRescate> {
  if (numeros.length === 0) return VACIO;

  const python = buscarPython();
  if (!python) {
    const aviso =
      "No hay Python con PyMuPDF en esta máquina: las boletas que son una imagen quedan sin " +
      "leer. Se instala con `pip install pymupdf numpy rapidocr-onnxruntime` (en GitHub " +
      "Actions ya viene instalado).";
    if (!avisoDado) {
      avisoDado = true;
      console.warn(`[worker] ${aviso}`);
    }
    return { ...VACIO, aviso };
  }

  const r = await ejecutar(python, [
    SCRIPT,
    rutaPdf,
    numeros.join(","),
    ...(rutaGrilla ? ["--grilla", rutaGrilla] : []),
  ]);

  if (r.error || r.stdout.trim() === "") {
    const aviso = `La lectura de la imagen falló: ${r.error ?? r.stderr ?? "sin salida"}`;
    console.warn(`[worker] ${aviso}`);
    return { ...VACIO, aviso };
  }

  let salida: SalidaPy;
  try {
    salida = JSON.parse(r.stdout.trim().split("\n").pop() ?? "{}") as SalidaPy;
  } catch {
    return { ...VACIO, aviso: "La lectura de la imagen devolvió una salida ilegible." };
  }

  if (!salida.ok) {
    const aviso = salida.error ?? "El rescate con PyMuPDF no pudo leer el archivo.";
    console.warn(`[worker] ${aviso}`);
    return { ...VACIO, aviso };
  }

  let conOcr = 0;
  let conMarcas = 0;
  const paginas: PaginaExtraida[] = [];

  for (const p of salida.paginas ?? []) {
    if (p.origen === "error" || p.items.length === 0) continue;
    if (p.origen.includes("ocr")) conOcr += 1;
    if (p.origen.includes("marcas")) conMarcas += 1;

    const numeroGlobal = p.numero + offset;
    const tokens: Token[] = p.items.map((i) => ({
      pagina: numeroGlobal,
      x: i.x,
      y: i.y,
      ancho: i.ancho,
      alto: i.alto,
      texto: i.texto,
    }));

    paginas.push({
      numero: numeroGlobal,
      ancho: p.ancho,
      alto: p.alto,
      tokens,
      lineas: agruparEnLineas(tokens, numeroGlobal),
      caracteres: tokens.reduce((s, t) => s + t.texto.length, 0),
    });
  }

  const avisos: string[] = [];
  if (salida.ocrDisponible === false && salida.aviso) avisos.push(salida.aviso);
  if (salida.grilla === false && salida.grillaMotivo) {
    avisos.push(`No se reconocio la grilla de casillas: ${salida.grillaMotivo}.`);
  }

  return { paginas, conOcr, conMarcas, aviso: avisos.join(" ") || null };
}
