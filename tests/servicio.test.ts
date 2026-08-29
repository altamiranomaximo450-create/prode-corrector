/**
 * Flujo de revisión manual, contra el almacén en memoria.
 *
 * Se importa todo de forma dinámica porque el almacén elige el motor la
 * primera vez que se lo pide, leyendo STORAGE_DRIVER del entorno.
 */

import { beforeAll, describe, expect, it } from "vitest";

process.env.STORAGE_DRIVER = "memory";
process.env.DEMO_MODE = "off";

type Servicio = typeof import("@/lib/servicio");
type Almacen = typeof import("@/lib/almacen");

let servicio: Servicio;
let almacenMod: Almacen;

beforeAll(async () => {
  servicio = await import("@/lib/servicio");
  almacenMod = await import("@/lib/almacen");
});

async function fechaConBoletaProblematica() {
  const fecha = await servicio.crearFecha({
    nombre: "Fecha de prueba",
    cantidadPartidos: 3,
    partidos: [
      { local: "River", visitante: "Racing", resultado: "1" },
      { local: "Boca", visitante: "Independiente", resultado: "X" },
      { local: "Talleres", visitante: "Belgrano", resultado: "2" },
    ],
  });

  const almacen = almacenMod.obtenerAlmacen();
  const boleta = {
    id: "boleta-1",
    fechaId: fecha.id,
    participante: null,
    participanteConfianza: 0,
    participanteEvidencia: null,
    numeroBoleta: "77",
    paginas: [1],
    pronosticos: [
      { partidoNumero: 1, valor: "1" as const, opciones: ["1" as const], origen: "pdf" as const, confianza: 0.9, evidencia: "r1", pagina: 1 },
      { partidoNumero: 2, valor: null, opciones: [], origen: "pdf" as const, confianza: 0, evidencia: "r2 X X", pagina: 1 },
      { partidoNumero: 3, valor: "2" as const, opciones: ["2" as const], origen: "pdf" as const, confianza: 0.9, evidencia: "r3", pagina: 1 },
    ],
    problemas: [
      {
        codigo: "NOMBRE_NO_DETECTADO" as const,
        severidad: "error" as const,
        mensaje: "sin nombre",
        pagina: 1,
        textoProblematico: null,
        partidoNumero: null,
      },
      {
        codigo: "PRONOSTICO_AMBIGUO" as const,
        severidad: "error" as const,
        mensaje: "doble marca en el partido 2",
        pagina: 1,
        textoProblematico: "r2 X X",
        partidoNumero: 2,
      },
    ],
    estado: "revision" as const,
    textoCrudo: "crudo",
    origen: "pdf" as const,
    editadaManualmente: false,
    metodoDeteccion: "grilla-columnas",
    creadaEn: new Date().toISOString(),
  };
  await almacen.guardarBoleta(boleta);
  return fecha;
}

describe("revisión manual de una boleta", () => {
  it("quita los problemas que la corrección resuelve y la devuelve al ranking", async () => {
    const fecha = await fechaConBoletaProblematica();

    const antes = await servicio.obtenerCorreccion(fecha.id);
    expect(antes!.ranking).toHaveLength(0);
    expect(antes!.enRevision).toHaveLength(1);

    const corregida = await servicio.actualizarBoleta(fecha.id, "boleta-1", {
      participante: "Ana Torres",
      pronosticos: ["1", "X", "2"],
    });

    expect(corregida.participante).toBe("Ana Torres");
    expect(corregida.problemas).toHaveLength(0);
    expect(corregida.estado).toBe("ok");
    expect(corregida.editadaManualmente).toBe(true);

    const despues = await servicio.obtenerCorreccion(fecha.id);
    expect(despues!.ranking).toHaveLength(1);
    expect(despues!.ranking[0].aciertos).toBe(3);
  });

  it("deja constancia del valor original en la evidencia del pronóstico corregido", async () => {
    const fecha = await fechaConBoletaProblematica();
    const corregida = await servicio.actualizarBoleta(fecha.id, "boleta-1", {
      pronosticos: ["1", "X", "2"],
    });

    const partido2 = corregida.pronosticos.find((p) => p.partidoNumero === 2)!;
    expect(partido2.origen).toBe("manual");
    expect(partido2.evidencia).toContain("Corregido a mano");
    expect(partido2.evidencia).toContain("r2 X X");
    // Los partidos que no se tocaron conservan su origen y evidencia del PDF.
    expect(corregida.pronosticos[0].origen).toBe("pdf");
  });

  it("NO quita los problemas que necesitan una decisión humana", async () => {
    const fecha = await fechaConBoletaProblematica();
    const almacen = almacenMod.obtenerAlmacen();
    const boleta = (await almacen.obtenerBoleta(fecha.id, "boleta-1"))!;
    boleta.problemas.push({
      codigo: "DUPLICADO_PARTICIPANTE",
      severidad: "error",
      mensaje: "aparece dos veces",
      pagina: 1,
      textoProblematico: null,
      partidoNumero: null,
    });
    await almacen.guardarBoleta(boleta);

    const corregida = await servicio.actualizarBoleta(fecha.id, "boleta-1", {
      participante: "Ana Torres",
      pronosticos: ["1", "X", "2"],
    });

    expect(corregida.problemas.map((p) => p.codigo)).toEqual(["DUPLICADO_PARTICIPANTE"]);
    expect(corregida.estado).toBe("revision");

    // El administrador la da por revisada: recién ahí entra al ranking.
    const resuelta = await servicio.actualizarBoleta(fecha.id, "boleta-1", { resolver: true });
    expect(resuelta.estado).toBe("resuelta_manual");
    const correccion = await servicio.obtenerCorreccion(fecha.id);
    expect(correccion!.ranking).toHaveLength(1);
  });

  it("registra cada cambio en la auditoría de la fecha", async () => {
    const fecha = await fechaConBoletaProblematica();
    await servicio.actualizarBoleta(fecha.id, "boleta-1", { participante: "Ana Torres" });

    const guardada = await almacenMod.obtenerAlmacen().obtenerFecha(fecha.id);
    const detalles = guardada!.auditoria.map((e) => e.detalle).join(" ");
    expect(detalles).toContain("participante");
    expect(detalles).toContain("Ana Torres");
  });

  it("rechaza pronósticos inválidos y cantidades que no coinciden", async () => {
    const fecha = await fechaConBoletaProblematica();

    await expect(
      servicio.actualizarBoleta(fecha.id, "boleta-1", { pronosticos: ["1", "Z", "2"] }),
    ).rejects.toThrow(/no es un pronóstico válido/);

    await expect(
      servicio.actualizarBoleta(fecha.id, "boleta-1", { pronosticos: ["1", "X"] }),
    ).rejects.toThrow(/3 partidos/);
  });

  it("una boleta cargada a mano sin todos los pronósticos queda en revisión", async () => {
    const fecha = await fechaConBoletaProblematica();
    const boleta = await servicio.crearBoletaManual(fecha.id, {
      participante: "Carlos Ruiz",
      pronosticos: ["1", null, "2"],
    });

    expect(boleta.estado).toBe("revision");
    expect(boleta.problemas.map((p) => p.codigo)).toContain("BOLETA_INCOMPLETA");
  });
});

describe("datos de demostración", () => {
  it("una vez borrados no vuelven a crearse solos", async () => {
    process.env.DEMO_MODE = "on";
    const almacen = almacenMod.obtenerAlmacen();

    // Punto de partida limpio
    for (const f of await almacen.listarFechas()) await almacen.borrarFecha(f.id);
    await almacen.escribirBandera("demo_borrada", "");

    await servicio.sembrarDemoSiHaceFalta();
    expect((await almacen.listarFechas()).filter((f) => f.esDemo).length).toBe(2);

    const borradas = await servicio.borrarDatosDemo();
    expect(borradas).toBe(2);
    expect(await almacen.listarFechas()).toHaveLength(0);

    // Este es el caso que fallaba: la siguiente carga del panel las revivía.
    await servicio.sembrarDemoSiHaceFalta();
    expect(await almacen.listarFechas()).toHaveLength(0);

    // Restaurarlas a mano sí las vuelve a traer.
    await servicio.restaurarDatosDemo();
    expect((await almacen.listarFechas()).filter((f) => f.esDemo).length).toBe(2);

    for (const f of await almacen.listarFechas()) await almacen.borrarFecha(f.id);
    await almacen.escribirBandera("demo_borrada", "1");
    process.env.DEMO_MODE = "off";
  });
});

describe("validación al crear una fecha", () => {
  it("exige nombre, cantidad coherente y equipos completos", async () => {
    await expect(servicio.crearFecha({ nombre: "  ", cantidadPartidos: 2 })).rejects.toThrow(
      /nombre/,
    );
    await expect(
      servicio.crearFecha({ nombre: "F1", cantidadPartidos: 0, partidos: [] }),
    ).rejects.toThrow(/cantidad de partidos/);
    await expect(
      servicio.crearFecha({
        nombre: "F1",
        cantidadPartidos: 2,
        partidos: [{ local: "A", visitante: "B", resultado: null }],
      }),
    ).rejects.toThrow(/se enviaron 1/);
  });

  it("acepta L / E / V como sinónimos de 1 / X / 2", async () => {
    const fecha = await servicio.crearFecha({
      nombre: "Sinónimos",
      cantidadPartidos: 3,
      partidos: [
        { local: "A", visitante: "B", resultado: "L" },
        { local: "C", visitante: "D", resultado: "e" },
        { local: "E", visitante: "F", resultado: "V" },
      ],
    });
    expect(fecha.partidos.map((p) => p.resultado)).toEqual(["1", "X", "2"]);
  });

  it("no deja configurar un desempate por un partido que no existe", async () => {
    await expect(
      servicio.crearFecha({
        nombre: "Mala config",
        cantidadPartidos: 2,
        partidos: [
          { local: "A", visitante: "B", resultado: null },
          { local: "C", visitante: "D", resultado: null },
        ],
        config: { desempate: "partido_clave", partidoClave: 9 },
      }),
    ).rejects.toThrow(/entre 1 y 2/);
  });
});
