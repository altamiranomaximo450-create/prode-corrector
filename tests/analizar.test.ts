import { describe, expect, it } from "vitest";
import { interpretarPronostico } from "../src/lib/pdf/analizar";

describe("interpretación de pronósticos", () => {
  it("lee los simples", () => {
    expect(interpretarPronostico("1")).toEqual(["1"]);
    expect(interpretarPronostico("X")).toEqual(["X"]);
    expect(interpretarPronostico("2")).toEqual(["2"]);
    expect(interpretarPronostico("x")).toEqual(["X"]);
  });

  it("acepta las formas equivalentes de un doble", () => {
    for (const forma of ["1/X", "X/1", "1 X", "1-X", "1X"]) {
      expect(new Set(interpretarPronostico(forma))).toEqual(new Set(["1", "X"]));
    }
  });

  it("acepta las etiquetas por palabra", () => {
    expect(interpretarPronostico("LOCAL")).toEqual(["1"]);
    expect(interpretarPronostico("empate")).toEqual(["X"]);
    expect(interpretarPronostico("V")).toEqual(["2"]);
  });

  it("tres marcas no es un doble: queda sin pronóstico en vez de inventar uno", () => {
    expect(interpretarPronostico("1/X/2")).toEqual([]);
  });

  it("lo ilegible queda vacío y no rompe", () => {
    expect(interpretarPronostico("")).toEqual([]);
    expect(interpretarPronostico("???")).toEqual([]);
  });
});
