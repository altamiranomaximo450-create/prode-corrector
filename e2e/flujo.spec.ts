import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import type { ResultadoCorreccion } from "../src/lib/tipos";

/**
 * El recorrido completo, en un navegador de verdad y con el PDF real del
 * cliente: entrar, cargar la fecha, subir el PDF, apretar PROCESAR BOLETAS y
 * esperar el TOP 10.
 *
 * Lo que de verdad se está probando es que NADIE arranca el worker a mano. La
 * prueba no ejecuta `npm run worker` en ningún momento: si el procesamiento no
 * empieza solo, la pantalla se queda en 0% y la prueba falla.
 */

const RUTA_PDF = path.join(process.cwd(), "muestras", "mananero.pdf");
const FECHA = JSON.parse(
  readFileSync(path.join(process.cwd(), "scripts", "fecha-mananero.json"), "utf8"),
) as { nombre: string; partidos: { nombre: string; resultado: "1" | "X" | "2" | null }[] };

const TEXTO_OPCION = { "1": "1 LOCAL", X: "X EMPATE", "2": "2 VISITANTE" } as const;

async function cargarFecha(page: Page) {
  await page.goto("/");

  // Sin login ni contraseña: la primera pantalla es directamente el formulario.
  await expect(page.getByRole("heading", { name: "Nueva fecha" })).toBeVisible();
  await expect(page.getByLabel(/contraseñ|password/i)).toHaveCount(0);

  await page.getByLabel("Nombre o número de fecha").fill(`E2E ${FECHA.nombre}`);
  const cantidad = page.getByLabel("Cantidad de partidos");
  await cantidad.fill(String(FECHA.partidos.length));
  await cantidad.blur();

  for (let i = 0; i < FECHA.partidos.length; i++) {
    const partido = FECHA.partidos[i];
    await page.getByLabel(`Partido ${i + 1}`, { exact: true }).fill(partido.nombre);
    if (partido.resultado) {
      await page
        .getByRole("group", { name: `Resultado del partido ${i + 1}`, exact: true })
        .getByRole("button", { name: TEXTO_OPCION[partido.resultado], exact: true })
        .click();
    }
  }
}

test.describe("corrector de prode", () => {
  test.skip(!existsSync(RUTA_PDF), `falta ${RUTA_PDF} (copiá ahí el PDF de boletas)`);

  test("de la pantalla vacía al TOP 10 sin arrancar el worker a mano", async ({ page, request }) => {
    let fechaId: string | null = null;
    page.on("response", async (res) => {
      if (fechaId || !res.url().endsWith("/api/fechas") || res.request().method() !== "POST") return;
      try {
        fechaId = ((await res.json()) as { fecha?: { id: string } }).fecha?.id ?? null;
      } catch {
        /* respuesta no JSON: se ignora */
      }
    });

    await cargarFecha(page);

    await page.setInputFiles('input[type="file"]', RUTA_PDF);
    await expect(page.getByText("mananero.pdf")).toBeVisible();

    await page.getByRole("button", { name: "PROCESAR BOLETAS" }).click();

    // --- El procesamiento tiene que arrancar SOLO --------------------------
    const progreso = page.locator(".progreso");
    await expect(progreso).toBeVisible();

    // Nunca puede aparecer el mensaje de la versión vieja.
    await expect(page.getByText(/esperando al worker/i)).toHaveCount(0);

    // Dentro de este rato el worker ya tiene que estar leyendo páginas de
    // verdad. Es LA prueba de que arrancó solo: nadie lo ejecutó.
    await expect(progreso).toContainText(/Página [1-9]\d* \/ \d+/, { timeout: 4 * 60_000 });

    const porcentaje = await page.locator(".porcentaje").innerText();
    expect(porcentaje).not.toBe("0%");

    // --- Ranking ------------------------------------------------------------
    await expect(page.getByRole("heading", { name: /TOP 10/ })).toBeVisible({
      timeout: 10 * 60_000,
    });

    const puestos = page.locator(".puesto");
    expect(await puestos.count()).toBeGreaterThanOrEqual(10);

    const primero = puestos.first();
    await expect(primero).toContainText(/\d+\/\d+/);
    await expect(primero).toContainText(/página \d+/);

    // --- Detalle ------------------------------------------------------------
    await primero.getByRole("button").click();
    const detalle = primero.locator(".detalle");
    await expect(detalle).toBeVisible();
    await expect(detalle.locator("tr")).toHaveCount(FECHA.partidos.length);
    await expect(detalle).toContainText("Pronóstico:");
    await expect(detalle).toContainText("Resultado:");
    await expect(detalle).toContainText("✅");

    // --- Lo que la pantalla no muestra, contra la API ------------------------
    expect(fechaId, "no se capturó el id de la fecha").not.toBeNull();
    const res = await request.get(`/api/fechas/${fechaId}`);
    expect(res.ok()).toBeTruthy();
    const { correccion } = (await res.json()) as { correccion: ResultadoCorreccion };

    // Una boleta por página del PDF.
    expect(correccion.ranking.length).toBe(41);
    expect(correccion.resumen.boletas).toBe(41);

    // Nombres repetidos: son participaciones distintas, no se deduplican.
    const porNombre = new Map<string, number>();
    for (const fila of correccion.ranking) {
      porNombre.set(fila.participante, (porNombre.get(fila.participante) ?? 0) + 1);
    }
    const repetidos = [...porNombre.entries()].filter(([, n]) => n > 1);
    expect(repetidos.length, "el PDF de prueba tiene nombres repetidos").toBeGreaterThan(0);

    // Dobles: existen y aciertan si el resultado es cualquiera de las dos.
    const dobles = correccion.ranking.flatMap((f) =>
      f.detalle.filter((d) => d.opciones.length === 2),
    );
    expect(dobles.length, "el PDF de prueba tiene dobles").toBeGreaterThan(0);
    for (const d of dobles) {
      if (d.resultado === null) continue;
      const deberia = d.opciones.includes(d.resultado) ? "acierto" : "error";
      expect(d.estado, `doble ${d.opciones.join("/")} contra ${d.resultado}`).toBe(deberia);
    }

    // El puntaje es exactamente la cuenta de aciertos del detalle: nada de IA.
    for (const fila of correccion.ranking) {
      expect(fila.detalle).toHaveLength(FECHA.partidos.length);
      expect(fila.aciertos).toBe(fila.detalle.filter((d) => d.estado === "acierto").length);
      expect(fila.partidosEvaluados).toBe(
        fila.detalle.filter((d) => d.resultado !== null).length,
      );
      expect(fila.paginas.length).toBeGreaterThan(0);
    }

    // El ranking va de mayor a menor y los empatados comparten posición.
    for (let i = 1; i < correccion.ranking.length; i++) {
      expect(correccion.ranking[i].aciertos).toBeLessThanOrEqual(
        correccion.ranking[i - 1].aciertos,
      );
    }
    const empatados = correccion.ranking.filter((f) => f.empatado);
    for (const fila of empatados) {
      const mismos = correccion.ranking.filter((o) => o.posicion === fila.posicion);
      expect(mismos.length).toBeGreaterThan(1);
    }
  });
});
