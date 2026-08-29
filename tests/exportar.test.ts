import { describe, expect, it } from "vitest";
import { aCsv, aXlsx, nombreArchivo } from "@/lib/exportar";
import { corregirFecha } from "@/lib/correccion";
import { crearBoleta, crearFecha, problemaError } from "./ayudas";
import type { Pronostico } from "@/lib/tipos";

const RESULTADOS: Pronostico[] = ["1", "X", "2", "1", "1", "X", "1", "2", "X", "1"];

function correccionDePrueba() {
  const fecha = crearFecha(RESULTADOS, { nombre: "Fecha 12 — Torneo del Club" });
  const fallado: Pronostico[] = [...RESULTADOS];
  fallado[0] = "2";
  return corregirFecha(fecha, [
    crearBoleta("b1", "Ana Torres", [...RESULTADOS], { numeroBoleta: "201" }),
    crearBoleta("b2", "Juan Pérez", fallado, { numeroBoleta: "184" }),
    crearBoleta("b3", "Dudosa", [...RESULTADOS], {
      numeroBoleta: "512",
      problemas: [problemaError("faltan pronósticos")],
    }),
  ]);
}

describe("exportación", () => {
  it("el CSV incluye resultados oficiales, ranking y boletas a revisar", () => {
    const csv = aCsv(correccionDePrueba());

    expect(csv.startsWith("﻿")).toBe(true); // BOM para Excel
    expect(csv).toContain("RESULTADOS OFICIALES");
    expect(csv).toContain("RANKING");
    expect(csv).toContain("Ana Torres");
    expect(csv).toContain("BOLETAS QUE REQUIEREN REVISION MANUAL");
    expect(csv).toContain("REQUIERE REVISION MANUAL");
    expect(csv).toContain("ACIERTO");
  });

  it("usa punto y coma como separador, una columna por partido", () => {
    const csv = aCsv(correccionDePrueba());
    const lineaRanking = csv.split("\r\n").find((l) => l.includes("Ana Torres"))!;

    // 9 columnas fijas + 10 partidos
    expect(lineaRanking.split(";")).toHaveLength(19);
  });

  it("entrecomilla las celdas que contienen el separador o comillas", () => {
    const fecha = crearFecha(RESULTADOS, { nombre: "Fecha rara" });
    fecha.partidos[0].local = 'Club "A"; el mejor';
    const correccion = corregirFecha(fecha, [
      crearBoleta("b1", "Ana; Torres", [...RESULTADOS], { numeroBoleta: "201" }),
    ]);
    const csv = aCsv(correccion);

    expect(csv).toContain('"Club ""A""; el mejor"');
    expect(csv).toContain('"Ana; Torres"');
    // El nombre entrecomillado no debe romper el conteo de columnas.
    const linea = csv.split("\r\n").find((l) => l.includes("Ana; Torres"))!;
    expect(linea.match(/;/g)!.length).toBeGreaterThan(18);
  });

  it("una boleta en revisión aparece sin posición numérica", () => {
    const csv = aCsv(correccionDePrueba());
    const linea = csv.split("\r\n").find((l) => l.includes("Dudosa"))!;
    expect(linea.startsWith("-;")).toBe(true);
  });

  it("genera un archivo XLSX válido con las tres hojas", async () => {
    const buffer = await aXlsx(correccionDePrueba());

    // Firma de un ZIP (los .xlsx son ZIP): "PK".
    expect(buffer.subarray(0, 2).toString()).toBe("PK");
    expect(buffer.length).toBeGreaterThan(4000);

    const ExcelJS = (await import("exceljs")).default;
    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load(buffer as unknown as ArrayBuffer);
    expect(libro.worksheets.map((h) => h.name)).toEqual([
      "Ranking",
      "Detalle por partido",
      "Requieren revisión",
    ]);
  });

  it("arma un nombre de archivo seguro a partir del nombre de la fecha", () => {
    const nombre = nombreArchivo(correccionDePrueba(), "csv");
    expect(nombre).toBe("prode-fecha-12-torneo-del-club.csv");
  });
});
