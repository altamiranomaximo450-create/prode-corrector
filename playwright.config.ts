import { defineConfig } from "@playwright/test";

/**
 * Prueba de punta a punta en un navegador de verdad.
 *
 * Levanta la aplicación con `npm run dev` y hace lo mismo que haría una persona:
 * carga la fecha, sube el PDF y espera el ranking. No arranca ningún worker: si
 * el procesamiento no empieza solo, la prueba falla, que es exactamente lo que
 * tiene que verificar.
 *
 *   npm run e2e
 */
/**
 * Contra el sitio ya desplegado en vez de localhost:
 *
 *   PRODE_URL=https://prode-corrector.vercel.app npm run e2e
 *
 * Ahí no se levanta ningún servidor local: se prueba la producción de verdad,
 * incluido que el worker arranque en GitHub Actions.
 */
const desplegado = process.env.PRODE_URL;
const LOCAL = "http://127.0.0.1:3000";

export default defineConfig({
  testDir: "./e2e",
  // Un PDF real con OCR lleva minutos, y en producción hay que sumarle el rato
  // que tarda GitHub en levantar el runner: el tope es holgado a propósito.
  timeout: 20 * 60_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: desplegado ?? LOCAL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    actionTimeout: 30_000,
  },
  ...(desplegado
    ? {}
    : {
        webServer: {
          command: "npm run dev",
          url: LOCAL,
          reuseExistingServer: true,
          timeout: 180_000,
          stdout: "pipe" as const,
          stderr: "pipe" as const,
        },
      }),
});
