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
export default defineConfig({
  testDir: "./e2e",
  // Un PDF real con OCR lleva minutos: el tope es holgado a propósito.
  timeout: 15 * 60_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    actionTimeout: 30_000,
  },
  webServer: {
    command: "npm run dev",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: true,
    timeout: 180_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
