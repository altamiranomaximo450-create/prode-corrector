/**
 * Arranque automático del worker.
 *
 * Este archivo es la respuesta a "el trabajo queda en cola esperando al
 * worker". Antes, `encolar` sólo marcaba el trabajo como pendiente y ahí moría:
 * nada arrancaba el proceso que lee el PDF, así que había que ejecutar
 * `npm run worker` a mano. Ahora la app dispara al worker ella misma.
 *
 * Hay dos maneras de disparar, y se elige sola según el entorno:
 *
 *   github  Producción. Se manda un `repository_dispatch` a GitHub, que
 *           arranca .github/workflows/worker.yml en un runner de GitHub
 *           Actions (4 vCPU, 16 GB de RAM, hasta 6 horas). El PDF pesado se
 *           procesa ahí, NO en Vercel. Es gratis dentro de la cuota de Actions.
 *
 *   local   Desarrollo. Se lanza `npm run worker:once` como proceso hijo
 *           independiente del servidor de Next. Así, en local, con `npm run dev`
 *           alcanza: tampoco hay que arrancar nada a mano.
 *
 * Si no hay ninguna de las dos (desplegado en Vercel y sin las variables de
 * GitHub), NO se finge que arrancó: el trabajo queda con un mensaje que dice
 * exactamente qué falta configurar, y la pantalla lo muestra.
 */

export type ModoDisparo = "github" | "local" | "sin-configurar";

/** Nombre del evento que escucha .github/workflows/worker.yml. */
export const EVENTO_DISPATCH = "prode-procesar";

export interface ResultadoDisparo {
  modo: ModoDisparo;
  ok: boolean;
  detalle: string;
}

function repoConfigurado(): string | null {
  const repo = (process.env.GITHUB_WORKER_REPO ?? "").trim();
  return /^[\w.-]+\/[\w.-]+$/.test(repo) ? repo : null;
}

function tokenConfigurado(): string | null {
  const token = (process.env.GITHUB_WORKER_TOKEN ?? "").trim();
  return token.length > 0 ? token : null;
}

/**
 * Cómo se va a arrancar el worker en este entorno.
 *
 * En Vercel nunca se usa el modo local: una función serverless muere apenas
 * responde y se llevaría puesto al proceso hijo a los pocos segundos.
 */
export function modoDisparo(): ModoDisparo {
  if (repoConfigurado() && tokenConfigurado()) return "github";
  if (!process.env.VERCEL) return "local";
  return "sin-configurar";
}

const FALTA_CONFIG =
  "El arranque automático no está configurado: faltan las variables GITHUB_WORKER_REPO y " +
  "GITHUB_WORKER_TOKEN en Vercel. Sin ellas nadie levanta el worker que lee el PDF (ver README).";

/* -------------------------------------------------------------------------- */
/*  GitHub Actions                                                            */
/* -------------------------------------------------------------------------- */

async function dispararGithub(trabajoId: string, motivo: string): Promise<ResultadoDisparo> {
  const repo = repoConfigurado()!;
  const token = tokenConfigurado()!;

  const controlador = new AbortController();
  const corte = setTimeout(() => controlador.abort(), 10_000);
  try {
    const res = await fetch(`https://api.github.com/repos/${repo}/dispatches`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
        "User-Agent": "prode-corrector",
      },
      body: JSON.stringify({
        event_type: EVENTO_DISPATCH,
        client_payload: { trabajoId, motivo },
      }),
      signal: controlador.signal,
    });

    // 204 No Content es el "listo" de esta API: no devuelve cuerpo.
    if (res.status === 204) {
      return { modo: "github", ok: true, detalle: "Worker pedido a GitHub Actions." };
    }

    const cuerpo = (await res.text()).slice(0, 300);
    if (res.status === 401 || res.status === 403) {
      return {
        modo: "github",
        ok: false,
        detalle:
          `GitHub rechazó el token (${res.status}). Revisá que GITHUB_WORKER_TOKEN siga vigente y ` +
          `tenga permiso de escritura de contenido sobre ${repo}.`,
      };
    }
    if (res.status === 404) {
      return {
        modo: "github",
        ok: false,
        detalle:
          `GitHub no encuentra ${repo} (404). Suele ser el token sin acceso a ese repositorio, ` +
          "o el nombre mal escrito en GITHUB_WORKER_REPO.",
      };
    }
    return { modo: "github", ok: false, detalle: `GitHub respondió ${res.status}: ${cuerpo}` };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { modo: "github", ok: false, detalle: `No se pudo hablar con GitHub: ${msg}` };
  } finally {
    clearTimeout(corte);
  }
}

/* -------------------------------------------------------------------------- */
/*  Proceso hijo (desarrollo)                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Un solo hijo por vez. El servidor de desarrollo de Next es un único proceso,
 * así que esta marca alcanza para que dos pestañas no levanten dos workers.
 * El worker igual sabe defenderse solo: reclama el trabajo en la base y el que
 * llega segundo no lo toma.
 */
let hijoVivoHasta = 0;

async function dispararLocal(): Promise<ResultadoDisparo> {
  const ahora = Date.now();
  if (ahora < hijoVivoHasta) {
    return { modo: "local", ok: true, detalle: "Ya hay un worker local corriendo." };
  }
  try {
    const { spawn } = await import("node:child_process");
    // shell: true para que ande igual en Windows (npm.cmd) y en Linux/macOS.
    const hijo = spawn("npm run worker:once", {
      cwd: process.cwd(),
      shell: true,
      detached: true,
      stdio: "ignore",
      env: process.env,
    });
    hijo.unref();
    // Ventana corta: si el worker termina antes, el siguiente disparo lo
    // vuelve a levantar; el vigía del endpoint de progreso se encarga.
    hijoVivoHasta = ahora + 20_000;
    return { modo: "local", ok: true, detalle: "Worker local arrancado." };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { modo: "local", ok: false, detalle: `No se pudo arrancar el worker local: ${msg}` };
  }
}

/* -------------------------------------------------------------------------- */

/** Pide que arranque un worker. No espera a que procese: sólo lo levanta. */
export async function dispararWorker(
  trabajoId: string,
  motivo: string,
): Promise<ResultadoDisparo> {
  switch (modoDisparo()) {
    case "github":
      return dispararGithub(trabajoId, motivo);
    case "local":
      return dispararLocal();
    default:
      return { modo: "sin-configurar", ok: false, detalle: FALTA_CONFIG };
  }
}
