import { describe, expect, it } from "vitest";
import { corregirBoleta, corregirFecha } from "@/lib/correccion";
import { crearBoleta, crearFecha, problemaError } from "./ayudas";
import type { Pronostico } from "@/lib/tipos";

const RESULTADOS: Pronostico[] = ["1", "X", "2", "1", "1", "X", "1", "2", "X", "1"];

describe("motor de corrección", () => {
  it("cuenta 10 de 10 cuando el participante acierta todo", () => {
    const fecha = crearFecha(RESULTADOS);
    const fila = corregirBoleta(fecha, crearBoleta("b1", "Ana Torres", [...RESULTADOS]));

    expect(fila.aciertos).toBe(10);
    expect(fila.errores).toBe(0);
    expect(fila.porcentaje).toBe(100);
    expect(fila.detalle.every((d) => d.estado === "acierto")).toBe(true);
  });

  it("cuenta 0 de 10 cuando falla todo", () => {
    const fecha = crearFecha(RESULTADOS);
    // Se elige en cada partido una opción distinta a la oficial.
    const fallados = RESULTADOS.map((r) => (r === "1" ? "2" : "1") as Pronostico);
    const fila = corregirBoleta(fecha, crearBoleta("b2", "Ezequiel Molina", fallados));

    expect(fila.aciertos).toBe(0);
    expect(fila.errores).toBe(10);
    expect(fila.porcentaje).toBe(0);
  });

  it("no computa los partidos sin resultado oficial", () => {
    const parciales: (Pronostico | null)[] = [...RESULTADOS];
    parciales[8] = null;
    parciales[9] = null;
    const fecha = crearFecha(parciales);
    const fila = corregirBoleta(fecha, crearBoleta("b3", "Juan Perez", [...RESULTADOS]));

    expect(fila.partidosEvaluados).toBe(8);
    expect(fila.aciertos).toBe(8);
    expect(fila.porcentaje).toBe(100);
    expect(fila.detalle.filter((d) => d.estado === "sin_resultado")).toHaveLength(2);
  });

  it("marca los pronósticos ilegibles como sin_pronostico, sin adivinarlos", () => {
    const fecha = crearFecha(RESULTADOS);
    const con_hueco: (Pronostico | null)[] = [...RESULTADOS];
    con_hueco[3] = null;
    const fila = corregirBoleta(fecha, crearBoleta("b4", "Julieta Campos", con_hueco));

    expect(fila.aciertos).toBe(9);
    expect(fila.errores).toBe(0);
    expect(fila.sinPronostico).toBe(1);
    expect(fila.detalle[3].estado).toBe("sin_pronostico");
    expect(fila.detalle[3].pronostico).toBeNull();
  });

  it("trata una boleta incompleta (menos pronósticos que partidos) sin desplazar los demás", () => {
    const fecha = crearFecha(RESULTADOS);
    const incompleta = crearBoleta("b5", "Ramiro Benitez", RESULTADOS.slice(0, 9));
    const fila = corregirBoleta(fecha, incompleta);

    expect(fila.detalle).toHaveLength(10);
    expect(fila.detalle[9].estado).toBe("sin_pronostico");
    expect(fila.aciertos).toBe(9);
  });

  it("explica cada puntaje partido por partido", () => {
    const fecha = crearFecha(RESULTADOS);
    const pron: Pronostico[] = [...RESULTADOS];
    pron[1] = "2";
    const fila = corregirBoleta(fecha, crearBoleta("b6", "Martin Lopez", pron));

    expect(fila.explicacion).toContain("Obtuvo 9 de 10");
    expect(fila.explicacion).toContain("Falló:");
    expect(fila.explicacion).toContain("marcó 2, salió X");
  });
});

describe("ranking", () => {
  it("ordena de mayor a menor y usa posiciones competitivas ante empates", () => {
    const fecha = crearFecha(RESULTADOS);
    const gana = [...RESULTADOS];
    const ocho_a: Pronostico[] = [...RESULTADOS];
    ocho_a[0] = "2";
    ocho_a[1] = "1";
    const ocho_b: Pronostico[] = [...RESULTADOS];
    ocho_b[5] = "1";
    ocho_b[6] = "2";

    const correccion = corregirFecha(fecha, [
      crearBoleta("b1", "Empatado B", ocho_b, { numeroBoleta: "311" }),
      crearBoleta("b2", "Ganador", gana, { numeroBoleta: "201" }),
      crearBoleta("b3", "Empatado A", ocho_a, { numeroBoleta: "052" }),
    ]);

    expect(correccion.ranking.map((r) => r.posicion)).toEqual([1, 2, 2]);
    expect(correccion.ranking[0].participante).toBe("Ganador");
    expect(correccion.ranking[1].empatado).toBe(true);
    expect(correccion.ranking[2].empatado).toBe(true);
  });

  it("muestra a todos los empatados en el podio sin inventar un desempate", () => {
    const fecha = crearFecha(RESULTADOS);
    const correccion = corregirFecha(fecha, [
      crearBoleta("b1", "Uno", [...RESULTADOS]),
      crearBoleta("b2", "Dos", [...RESULTADOS]),
      crearBoleta("b3", "Tres", [...RESULTADOS]),
    ]);

    expect(correccion.top3).toHaveLength(1);
    expect(correccion.top3[0].puesto).toBe(1);
    expect(correccion.top3[0].empate).toBe(true);
    expect(correccion.top3[0].participantes).toHaveLength(3);
  });

  it("aplica la regla de desempate por partido clave cuando el administrador la define", () => {
    const empatadoA: Pronostico[] = [...RESULTADOS];
    empatadoA[0] = "2"; // falla el partido 1 (el clave)
    const empatadoB: Pronostico[] = [...RESULTADOS];
    empatadoB[4] = "2"; // acierta el partido 1

    const fecha = crearFecha(RESULTADOS, {
      config: { desempate: "partido_clave", partidoClave: 1 },
    });
    const correccion = corregirFecha(fecha, [
      crearBoleta("b1", "Falla el clave", empatadoA),
      crearBoleta("b2", "Acierta el clave", empatadoB),
    ]);

    expect(correccion.ranking[0].participante).toBe("Acierta el clave");
    expect(correccion.ranking.map((r) => r.posicion)).toEqual([1, 2]);
    expect(correccion.ranking[0].empatado).toBe(false);
  });

  it("deja fuera del ranking a las boletas en revisión, pero las sigue listando", () => {
    const fecha = crearFecha(RESULTADOS);
    const correccion = corregirFecha(fecha, [
      crearBoleta("b1", "Válida", [...RESULTADOS]),
      crearBoleta("b2", "Dudosa", [...RESULTADOS], { problemas: [problemaError()] }),
    ]);

    expect(correccion.ranking).toHaveLength(1);
    expect(correccion.enRevision).toHaveLength(1);
    expect(correccion.filas).toHaveLength(2);
    expect(correccion.enRevision[0].motivoNoElegible).toContain("revisión manual");
    expect(correccion.advertencias.join(" ")).toContain("requieren revisión manual");
  });

  it("vuelve a incluir la boleta cuando se la da por revisada a mano", () => {
    const fecha = crearFecha(RESULTADOS);
    const correccion = corregirFecha(fecha, [
      crearBoleta("b1", "Resuelta", [...RESULTADOS], {
        problemas: [problemaError()],
        estado: "resuelta_manual",
      }),
    ]);

    expect(correccion.ranking).toHaveLength(1);
    expect(correccion.ranking[0].estado).toBe("resuelta_manual");
  });

  it("avisa cuando faltan resultados oficiales", () => {
    const fecha = crearFecha([...RESULTADOS.slice(0, 8), null, null]);
    const correccion = corregirFecha(fecha, [crearBoleta("b1", "Ana", [...RESULTADOS])]);

    expect(correccion.resumen.partidosSinResultado).toBe(2);
    expect(correccion.advertencias.join(" ")).toContain("#9, #10");
  });

  it("calcula promedio, máximo y mínimo sólo sobre las boletas elegibles", () => {
    const fecha = crearFecha(RESULTADOS);
    const cero = RESULTADOS.map((r) => (r === "1" ? "2" : "1") as Pronostico);
    const correccion = corregirFecha(fecha, [
      crearBoleta("b1", "Diez", [...RESULTADOS]),
      crearBoleta("b2", "Cero", cero),
      crearBoleta("b3", "Excluida", [...RESULTADOS], { problemas: [problemaError()] }),
    ]);

    expect(correccion.resumen.maximoAciertos).toBe(10);
    expect(correccion.resumen.minimoAciertos).toBe(0);
    expect(correccion.resumen.promedioAciertos).toBe(5);
    expect(correccion.resumen.participantes).toBe(3);
  });

  it("no rompe cuando no hay ninguna boleta", () => {
    const correccion = corregirFecha(crearFecha(RESULTADOS), []);
    expect(correccion.ranking).toHaveLength(0);
    expect(correccion.top3).toHaveLength(0);
    expect(correccion.resumen.promedioAciertos).toBeNull();
    expect(correccion.advertencias.join(" ")).toContain("Todavía no hay boletas");
  });
});
