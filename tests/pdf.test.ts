/**
 * Prueba de punta a punta del lector de PDF: se procesa el PDF real de
 * public/demo y se verifica que cada boleta se leyó exactamente igual a los
 * datos con los que se generó ese PDF.
 *
 * Es la prueba que más importa: si el lector se equivoca, acá se ve.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { procesarPdf } from "@/lib/pdf/procesar";
import { corregirFecha } from "@/lib/correccion";
import {
  BOLETAS_LIMPIAS,
  BOLETAS_PROBLEMATICAS,
  PARTIDOS_DEMO,
  RESULTADOS_DEMO,
} from "@/lib/datos-demo";
import { crearFecha } from "./ayudas";

const RAIZ = process.cwd();

function fechaDemo() {
  const fecha = crearFecha(RESULTADOS_DEMO);
  fecha.partidos = PARTIDOS_DEMO.map(([local, visitante], i) => ({
    numero: i + 1,
    local,
    visitante,
    resultado: RESULTADOS_DEMO[i],
  }));
  return fecha;
}

async function procesar(nombre: string) {
  const datos = new Uint8Array(await readFile(path.join(RAIZ, "public", "demo", nombre)));
  return procesarPdf(datos, nombre, fechaDemo(), () => {});
}

describe("procesamiento del PDF de boletas", () => {
  it("lee las 14 boletas limpias sin marcar ningún problema", async () => {
    const { boletas, diagnostico } = await procesar("boletas-fecha-12.pdf");

    expect(boletas).toHaveLength(BOLETAS_LIMPIAS.length);
    expect(diagnostico.tieneCapaTexto).toBe(true);
    expect(diagnostico.metodo).toBe("texto");
    expect(boletas.every((b) => b.estado === "ok")).toBe(true);
  }, 30_000);

  it("extrae el nombre, el número y los 10 pronósticos exactos de cada boleta", async () => {
    const { boletas } = await procesar("boletas-fecha-12.pdf");

    for (const esperada of BOLETAS_LIMPIAS) {
      const leida = boletas.find((b) => b.numeroBoleta === esperada.numero);
      expect(leida, `no se encontró la boleta #${esperada.numero}`).toBeDefined();
      expect(leida!.participante).toBe(esperada.nombre);
      expect(leida!.pronosticos.map((p) => p.valor)).toEqual(esperada.pron);
    }
  }, 30_000);

  it("guarda la evidencia textual de cada pronóstico para poder auditarlo", async () => {
    const { boletas } = await procesar("boletas-fecha-12.pdf");
    const ana = boletas.find((b) => b.participante === "Ana Torres")!;

    expect(ana.pronosticos[0].evidencia).toContain("River Plate");
    expect(ana.pronosticos[0].pagina).toBeGreaterThan(0);
    expect(ana.textoCrudo).toContain("BOLETA");
  }, 30_000);

  it("emite el progreso real de cada etapa", async () => {
    const datos = new Uint8Array(
      await readFile(path.join(RAIZ, "public", "demo", "boletas-fecha-12.pdf")),
    );
    const etapas: string[] = [];
    await procesarPdf(datos, "demo.pdf", fechaDemo(), (e) => etapas.push(e.etapa));

    expect(etapas[0]).toBe("leyendo");
    expect(etapas).toContain("extrayendo");
    expect(etapas).toContain("duplicados");
    expect(etapas.at(-1)).toBe("listo");
  }, 30_000);
});

describe("detección de problemas en el PDF con casos difíciles", () => {
  it("encuentra las 19 boletas y marca exactamente las problemáticas", async () => {
    const { boletas } = await procesar("boletas-fecha-12-con-errores.pdf");

    expect(boletas).toHaveLength(BOLETAS_LIMPIAS.length + BOLETAS_PROBLEMATICAS.length);

    const codigosDe = (numero: string) =>
      boletas
        .filter((b) => b.numeroBoleta === numero)
        .flatMap((b) => b.problemas.map((p) => p.codigo));

    // Boleta con 9 renglones en vez de 10.
    expect(codigosDe("512")).toContain("CANTIDAD_PRONOSTICOS");
    // Boleta con dos opciones marcadas en el partido 4.
    expect(codigosDe("533")).toContain("PRONOSTICO_AMBIGUO");
    // Boleta sin nombre de participante.
    expect(codigosDe("548")).toContain("NOMBRE_NO_DETECTADO");
    // "Juan Perez" aparece en tres boletas.
    expect(codigosDe("560")).toContain("DUPLICADO_PARTICIPANTE");
    // La boleta 184 está repetida idéntica.
    expect(codigosDe("184")).toContain("DUPLICADO_BOLETA");
  }, 30_000);

  it("no interpreta el pronóstico ambiguo: lo deja en null", async () => {
    const { boletas } = await procesar("boletas-fecha-12-con-errores.pdf");
    const julieta = boletas.find((b) => b.participante === "Julieta Campos")!;

    expect(julieta.pronosticos[3].valor).toBeNull();
    expect(julieta.estado).toBe("revision");
  }, 30_000);

  it("las boletas problemáticas quedan fuera del ranking hasta resolverse", async () => {
    const fecha = fechaDemo();
    const { boletas } = await procesar("boletas-fecha-12-con-errores.pdf");
    const correccion = corregirFecha(fecha, boletas);

    expect(correccion.enRevision.length).toBeGreaterThanOrEqual(5);
    expect(correccion.ranking.every((r) => r.elegible)).toBe(true);
    // Ana Torres acertó los 10: tiene que encabezar el ranking.
    expect(correccion.ranking[0].participante).toBe("Ana Torres");
    expect(correccion.ranking[0].aciertos).toBe(10);
  }, 30_000);

  it("rechaza un archivo que no es un PDF con capa de texto", async () => {
    const falso = new Uint8Array(Buffer.from("%PDF-1.4\n(no es un pdf de verdad)"));
    await expect(procesarPdf(falso, "roto.pdf", fechaDemo(), () => {})).rejects.toThrow();
  }, 30_000);
});
