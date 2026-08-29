import { describe, expect, it } from "vitest";
import { detectarDuplicados, recalcularEstado } from "@/lib/pdf/procesar";
import { crearBoleta } from "./ayudas";
import type { Pronostico } from "@/lib/tipos";

const P: Pronostico[] = ["1", "X", "2", "1", "1", "X", "1", "2", "X", "1"];

function codigos(boleta: { problemas: { codigo: string }[] }): string[] {
  return boleta.problemas.map((p) => p.codigo);
}

describe("detección de duplicados", () => {
  it("marca la boleta idéntica (mismo nombre y mismos pronósticos)", () => {
    const a = crearBoleta("b1", "Juan Perez", [...P], { numeroBoleta: "184" });
    const b = crearBoleta("b2", "Juan Perez", [...P], { numeroBoleta: "184" });
    const boletas = [a, b];

    detectarDuplicados(boletas);
    boletas.forEach(recalcularEstado);

    expect(codigos(a)).toContain("DUPLICADO_BOLETA");
    expect(codigos(b)).toContain("DUPLICADO_BOLETA");
    expect(a.estado).toBe("revision");
  });

  it("marca al participante repetido aunque los pronósticos difieran", () => {
    const otros: Pronostico[] = P.map(() => "1");
    const a = crearBoleta("b1", "Juan Perez", [...P], { numeroBoleta: "184" });
    const b = crearBoleta("b2", "Juan Pérez", otros, { numeroBoleta: "560" });
    const boletas = [a, b];

    detectarDuplicados(boletas);
    boletas.forEach(recalcularEstado);

    // La comparación ignora acentos y mayúsculas.
    expect(codigos(a)).toContain("DUPLICADO_PARTICIPANTE");
    expect(codigos(b)).toContain("DUPLICADO_PARTICIPANTE");
    expect(codigos(a)).not.toContain("DUPLICADO_BOLETA");
    expect(b.estado).toBe("revision");
  });

  it("el número repetido es sólo un aviso: no bloquea el ranking", () => {
    const otros: Pronostico[] = P.map(() => "X");
    const a = crearBoleta("b1", "Ana Torres", [...P], { numeroBoleta: "77" });
    const b = crearBoleta("b2", "Pablo Sosa", otros, { numeroBoleta: "77" });
    const boletas = [a, b];

    detectarDuplicados(boletas);
    boletas.forEach(recalcularEstado);

    expect(codigos(a)).toContain("DUPLICADO_NUMERO");
    expect(a.problemas.find((p) => p.codigo === "DUPLICADO_NUMERO")?.severidad).toBe("aviso");
    expect(a.estado).toBe("ok");
    expect(b.estado).toBe("ok");
  });

  it("no marca nada cuando no hay repeticiones", () => {
    const a = crearBoleta("b1", "Ana Torres", [...P], { numeroBoleta: "1" });
    const b = crearBoleta("b2", "Pablo Sosa", P.map(() => "2") as Pronostico[], {
      numeroBoleta: "2",
    });
    const boletas = [a, b];

    detectarDuplicados(boletas);
    boletas.forEach(recalcularEstado);

    expect(a.problemas).toHaveLength(0);
    expect(b.problemas).toHaveLength(0);
    expect(a.estado).toBe("ok");
  });

  it("una boleta ya resuelta a mano no vuelve a revisión", () => {
    const a = crearBoleta("b1", "Juan Perez", [...P], { estado: "resuelta_manual" });
    const b = crearBoleta("b2", "Juan Perez", [...P]);
    const boletas = [a, b];

    detectarDuplicados(boletas);
    boletas.forEach(recalcularEstado);

    expect(a.estado).toBe("resuelta_manual");
    expect(b.estado).toBe("revision");
  });
});
