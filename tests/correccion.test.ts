import { describe, expect, it } from "vitest";
import { corregirFecha } from "../src/lib/correccion";
import type { Boleta, Fecha, Pronostico } from "../src/lib/tipos";

function fecha(resultados: (Pronostico | null)[]): Fecha {
  return {
    id: "f1",
    nombre: "Fecha de prueba",
    cantidadPartidos: resultados.length,
    partidos: resultados.map((resultado, i) => ({
      numero: i + 1,
      nombre: `Partido ${i + 1}`,
      resultado,
    })),
    creadaEn: "2026-01-01T00:00:00.000Z",
    actualizadaEn: "2026-01-01T00:00:00.000Z",
  };
}

let siguienteOrden = 0;

function boleta(
  id: string,
  participante: string,
  jugadas: (Pronostico[] | Pronostico)[],
  numeroBoleta: string | null = null,
  orden = siguienteOrden++,
): Boleta {
  return {
    id,
    fechaId: "f1",
    orden,
    participante,
    numeroBoleta,
    paginas: [1],
    pronosticos: jugadas.map((j, i) => ({
      partidoNumero: i + 1,
      opciones: Array.isArray(j) ? j : [j],
      evidencia: "",
      pagina: 1,
    })),
    textoCrudo: "",
    creadaEn: "2026-01-01T00:00:00.000Z",
  };
}

describe("cálculo de aciertos", () => {
  it("cuenta un acierto cuando el pronóstico coincide con el resultado oficial", () => {
    const r = corregirFecha(fecha(["1", "X", "2"]), [boleta("b1", "Ana", ["1", "X", "2"])]);
    expect(r.ranking[0].aciertos).toBe(3);
    expect(r.ranking[0].porcentaje).toBe(100);
  });

  it("no cuenta los que no coinciden", () => {
    const r = corregirFecha(fecha(["1", "X", "2"]), [boleta("b1", "Ana", ["2", "1", "X"])]);
    expect(r.ranking[0].aciertos).toBe(0);
  });

  it("un doble acierta con cualquiera de sus dos opciones", () => {
    const f = fecha(["1", "X", "2"]);
    const r = corregirFecha(f, [
      // 1/X contra resultado 1 -> acierto; contra X -> acierto; contra 2 -> fallo
      boleta("b1", "Doble", [["1", "X"], ["1", "X"], ["1", "X"]]),
    ]);
    expect(r.ranking[0].aciertos).toBe(2);
    expect(r.ranking[0].detalle.map((d) => d.estado)).toEqual(["acierto", "acierto", "error"]);
  });

  it("un partido sin resultado oficial no computa para nadie", () => {
    const r = corregirFecha(fecha(["1", null, "2"]), [boleta("b1", "Ana", ["1", "X", "2"])]);
    expect(r.ranking[0].aciertos).toBe(2);
    expect(r.ranking[0].partidosEvaluados).toBe(2);
    expect(r.ranking[0].detalle[1].estado).toBe("sin_resultado");
  });

  it("un partido sin pronóstico leído vale 0 pero no excluye la boleta", () => {
    const r = corregirFecha(fecha(["1", "X", "2"]), [boleta("b1", "Ana", ["1", [], "2"])]);
    expect(r.ranking).toHaveLength(1);
    expect(r.ranking[0].aciertos).toBe(2);
    expect(r.ranking[0].detalle[1].estado).toBe("sin_pronostico");
  });
});

describe("ranking", () => {
  it("no deduplica participantes: tres boletas del mismo nombre son tres boletas", () => {
    const f = fecha(["1", "X", "2"]);
    const r = corregirFecha(f, [
      boleta("b1", "Juan Perez", ["1", "X", "2"], "1"),
      boleta("b2", "Juan Perez", ["1", "X", "1"], "2"),
      boleta("b3", "Juan Perez", ["1", "1", "1"], "3"),
    ]);
    expect(r.ranking).toHaveLength(3);
    expect(r.resumen.boletas).toBe(3);
    expect(r.ranking.map((x) => x.aciertos)).toEqual([3, 2, 1]);
  });

  it("los empatados comparten posición y ninguno se elimina", () => {
    const f = fecha(["1", "X", "2"]);
    const r = corregirFecha(f, [
      boleta("b1", "Ana", ["1", "X", "2"], "10"),
      boleta("b2", "Beto", ["1", "X", "2"], "11"),
      boleta("b3", "Caro", ["1", "X", "1"], "12"),
    ]);
    expect(r.ranking.map((x) => x.posicion)).toEqual([1, 1, 3]);
    expect(r.ranking[0].empatado).toBe(true);
    expect(r.ranking[2].empatado).toBe(false);
  });

  it("el orden es determinístico: dos corridas dan el mismo resultado", () => {
    const f = fecha(["1", "X", "2"]);
    const boletas = [
      boleta("b3", "Caro", ["1", "X", "2"], "30"),
      boleta("b1", "Ana", ["1", "X", "2"], "10"),
      boleta("b2", "Beto", ["1", "X", "2"], "20"),
    ];
    const a = corregirFecha(f, boletas).ranking.map((x) => x.boletaId);
    const b = corregirFecha(f, [...boletas].reverse()).ranking.map((x) => x.boletaId);
    expect(a).toEqual(b);
    expect(a).toEqual(["b1", "b2", "b3"]); // por número de boleta
  });

  it("desempata por orden en el PDF cuando todo lo demás es igual", () => {
    const f = fecha(["1"]);
    // Mismo nombre, misma página, sin número: sólo los distingue el orden en el
    // PDF. El id no sirve porque es un UUID nuevo en cada procesamiento.
    const boletas = [
      boleta("uuid-z", "Juan Perez", ["1"], null, 2),
      boleta("uuid-a", "Juan Perez", ["1"], null, 0),
      boleta("uuid-m", "Juan Perez", ["1"], null, 1),
    ];
    const orden = corregirFecha(f, boletas).ranking.map((x) => x.boletaId);
    expect(orden).toEqual(["uuid-a", "uuid-m", "uuid-z"]);
    expect(corregirFecha(f, [...boletas].reverse()).ranking.map((x) => x.boletaId)).toEqual(orden);
  });

  it("el top 10 conserva a todos los empatados en el décimo puesto", () => {
    const f = fecha(["1"]);
    // 9 con 1 acierto y 3 empatados con 0: las 3 comparten la posición 10.
    const boletas = [
      ...Array.from({ length: 9 }, (_, i) => boleta(`ok${i}`, `Gana ${i}`, ["1"], String(i + 1))),
      ...Array.from({ length: 3 }, (_, i) => boleta(`no${i}`, `Pierde ${i}`, ["2"], String(50 + i))),
    ];
    const r = corregirFecha(f, boletas);
    const top = r.ranking.filter((x) => x.posicion <= 10);
    expect(top).toHaveLength(12);
    expect(top.filter((x) => x.posicion === 10)).toHaveLength(3);
  });
});
