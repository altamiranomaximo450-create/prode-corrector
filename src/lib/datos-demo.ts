/**
 * Datos de DEMOSTRACIÓN.
 *
 * Son ficticios y están marcados como tales en toda la interfaz (`esDemo`).
 * Existen para que el panel no se vea vacío en una presentación. En cuanto se
 * procesa un PDF real, la fecha usa los datos de ese PDF: la demo nunca se
 * mezcla con datos reales porque vive en fechas propias.
 *
 * Este archivo es además el origen de los PDF de prueba de public/demo:
 * scripts/generar-pdf-demo.mjs lo importa, así el PDF y los datos sembrados
 * cuentan siempre la misma historia.
 */

import type { Boleta, Fecha, ProblemaBoleta, Pronostico, PronosticoBoleta } from "./tipos";

export const PARTIDOS_DEMO: [string, string][] = [
  ["River Plate", "Racing Club"],
  ["Boca Juniors", "Independiente"],
  ["Talleres", "Belgrano"],
  ["San Lorenzo", "Huracan"],
  ["Estudiantes", "Gimnasia LP"],
  ["Rosario Central", "Newells"],
  ["Velez Sarsfield", "Argentinos Jrs"],
  ["Lanus", "Banfield"],
  ["Defensa y Justicia", "Tigre"],
  ["Godoy Cruz", "Instituto"],
];

export const RESULTADOS_DEMO: Pronostico[] = [
  "1", "X", "2", "1", "1", "X", "1", "2", "X", "1",
];

export interface BoletaDemo {
  numero: string;
  nombre: string | null;
  pron: string[];
  /**
   * Índice 1-based del partido con dos opciones marcadas: un "doble" (ej.
   * 1/X). Es una jugada normal y válida, no un error — se muestra como aviso,
   * no bloquea el ranking, y acierta si el resultado oficial es cualquiera de
   * las dos opciones.
   */
  dobleEn?: number;
  caso?: string;
}

export const BOLETAS_LIMPIAS: BoletaDemo[] = [
  { numero: "184", nombre: "Juan Perez", pron: ["1", "X", "2", "1", "1", "X", "1", "2", "X", "2"] },
  { numero: "052", nombre: "Martin Lopez", pron: ["1", "X", "2", "1", "2", "X", "1", "2", "1", "1"] },
  { numero: "311", nombre: "Lucas Diaz", pron: ["1", "1", "2", "1", "1", "X", "1", "1", "X", "1"] },
  { numero: "097", nombre: "Sofia Ramirez", pron: ["1", "X", "1", "1", "1", "2", "1", "2", "X", "2"] },
  { numero: "233", nombre: "Diego Fernandez", pron: ["X", "X", "2", "1", "1", "1", "2", "2", "X", "1"] },
  { numero: "108", nombre: "Carla Gimenez", pron: ["1", "2", "2", "X", "1", "X", "1", "1", "2", "1"] },
  { numero: "415", nombre: "Pablo Sosa", pron: ["2", "X", "2", "1", "X", "X", "1", "2", "1", "1"] },
  { numero: "076", nombre: "Nicolas Herrera", pron: ["1", "1", "1", "2", "1", "2", "1", "2", "X", "1"] },
  { numero: "290", nombre: "Valentina Rojas", pron: ["1", "X", "2", "2", "2", "X", "2", "2", "X", "X"] },
  { numero: "144", nombre: "Ezequiel Molina", pron: ["2", "2", "1", "X", "2", "1", "X", "1", "1", "2"] },
  { numero: "201", nombre: "Ana Torres", pron: ["1", "X", "2", "1", "1", "X", "1", "2", "X", "1"] },
  { numero: "358", nombre: "Federico Quiroga", pron: ["1", "X", "X", "1", "1", "X", "2", "2", "X", "1"] },
  { numero: "019", nombre: "Marina Acosta", pron: ["X", "1", "2", "1", "1", "2", "1", "X", "X", "1"] },
  { numero: "467", nombre: "Gonzalo Vera", pron: ["1", "X", "2", "X", "1", "X", "1", "1", "2", "1"] },
];

export const BOLETAS_PROBLEMATICAS: BoletaDemo[] = [
  {
    numero: "512",
    nombre: "Ramiro Benitez",
    pron: ["1", "X", "2", "1", "1", "X", "1", "2", "X"],
    caso: "incompleta",
  },
  {
    numero: "533",
    nombre: "Julieta Campos",
    pron: ["1", "X", "2", "1", "1", "X", "1", "2", "X", "1"],
    dobleEn: 4,
    caso: "doble",
  },
  {
    numero: "548",
    nombre: null,
    pron: ["2", "X", "2", "1", "1", "X", "1", "2", "1", "1"],
    caso: "sinNombre",
  },
  {
    numero: "560",
    nombre: "Juan Perez",
    pron: ["1", "1", "1", "1", "1", "1", "1", "1", "1", "1"],
    caso: "duplicadoNombre",
  },
  {
    numero: "184",
    nombre: "Juan Perez",
    pron: ["1", "X", "2", "1", "1", "X", "1", "2", "X", "2"],
    caso: "duplicadoIdentico",
  },
];

/* -------------------------------------------------------------------------- */
/*  Fecha anterior, para que el Historial tenga contenido                     */
/* -------------------------------------------------------------------------- */

const PARTIDOS_FECHA_11: [string, string][] = [
  ["Racing Club", "Platense"],
  ["Independiente", "Sarmiento"],
  ["Belgrano", "Union"],
  ["Huracan", "Barracas Central"],
  ["Gimnasia LP", "Riestra"],
  ["Newells", "Atletico Tucuman"],
  ["Argentinos Jrs", "Central Cordoba"],
  ["Banfield", "Independiente Rivadavia"],
];

const RESULTADOS_FECHA_11: Pronostico[] = ["1", "1", "X", "2", "1", "X", "1", "2"];

const BOLETAS_FECHA_11: BoletaDemo[] = [
  { numero: "071", nombre: "Ana Torres", pron: ["1", "1", "X", "2", "1", "X", "1", "2"] },
  { numero: "112", nombre: "Juan Perez", pron: ["1", "1", "X", "2", "1", "X", "2", "2"] },
  { numero: "045", nombre: "Martin Lopez", pron: ["1", "1", "X", "1", "1", "X", "1", "1"] },
  { numero: "203", nombre: "Sofia Ramirez", pron: ["1", "2", "X", "2", "X", "X", "1", "2"] },
  { numero: "088", nombre: "Lucas Diaz", pron: ["X", "1", "1", "2", "1", "2", "1", "2"] },
  { numero: "159", nombre: "Carla Gimenez", pron: ["1", "1", "2", "2", "1", "1", "1", "X"] },
  { numero: "260", nombre: "Pablo Sosa", pron: ["2", "1", "X", "X", "1", "X", "1", "2"] },
  { numero: "037", nombre: "Marina Acosta", pron: ["1", "X", "X", "2", "1", "X", "1", "2"] },
];

/* -------------------------------------------------------------------------- */
/*  Construcción                                                              */
/* -------------------------------------------------------------------------- */

function problema(
  codigo: ProblemaBoleta["codigo"],
  severidad: ProblemaBoleta["severidad"],
  mensaje: string,
  pagina: number,
  textoProblematico: string | null = null,
  partidoNumero: number | null = null,
): ProblemaBoleta {
  return { codigo, severidad, mensaje, pagina, textoProblematico, partidoNumero };
}

function construirBoleta(
  fechaId: string,
  indice: number,
  demo: BoletaDemo,
  cantidadPartidos: number,
  evidenciaPartidos: [string, string][],
): Boleta {
  const pagina = Math.floor(indice / 2) + 1;
  const pronosticos: PronosticoBoleta[] = [];

  for (let i = 0; i < cantidadPartidos; i++) {
    const crudo = demo.pron[i];
    const doble = demo.dobleEn === i + 1;
    const [local, visitante] = evidenciaPartidos[i];
    const otraOpcion = crudo === "1" ? "2" : "1";
    const opciones: Pronostico[] = doble
      ? [crudo as Pronostico, otraOpcion as Pronostico]
      : crudo
        ? [crudo as Pronostico]
        : [];
    pronosticos.push({
      partidoNumero: i + 1,
      valor: opciones.length === 1 ? opciones[0] : null,
      opciones,
      origen: "pdf",
      confianza: opciones.length === 1 ? 0.95 : opciones.length === 2 ? 0.85 : 0,
      evidencia: crudo
        ? `${i + 1} ${local} vs ${visitante}${doble ? `  ${crudo}  ${otraOpcion}` : `  ${crudo}`}`
        : "(sin lectura)",
      pagina: crudo ? pagina : null,
    });
  }

  const problemas: ProblemaBoleta[] = [];
  if (!demo.nombre) {
    problemas.push(
      problema(
        "NOMBRE_NO_DETECTADO",
        "error",
        "No se pudo identificar el nombre del participante en esta boleta.",
        pagina,
        `BOLETA N° ${demo.numero} | PARTIDO 1 X 2`,
      ),
    );
  }
  if (demo.pron.length !== cantidadPartidos) {
    problemas.push(
      problema(
        "CANTIDAD_PRONOSTICOS",
        "error",
        `Se leyeron ${demo.pron.length} pronósticos y la fecha tiene ${cantidadPartidos} partidos. No se puede saber a qué partido corresponde cada marca: hay que revisarla a mano.`,
        pagina,
        null,
      ),
    );
  }
  if (demo.dobleEn) {
    const opciones = pronosticos[demo.dobleEn - 1]?.opciones ?? [];
    problemas.push(
      problema(
        "PRONOSTICO_DOBLE",
        "aviso",
        `El partido ${demo.dobleEn} tiene un doble marcado: ${opciones.join("/")}.`,
        pagina,
        pronosticos[demo.dobleEn - 1]?.evidencia ?? null,
        demo.dobleEn,
      ),
    );
  }
  for (const p of pronosticos) {
    if (p.opciones.length === 0) {
      problemas.push(
        problema(
          "PRONOSTICO_FALTANTE",
          "error",
          `El partido ${p.partidoNumero} no tiene un pronóstico legible.`,
          pagina,
          null,
          p.partidoNumero,
        ),
      );
    }
  }

  const lineas = [
    `[p.${pagina}] PRODE EL CLUB  -  FECHA 12`,
    `[p.${pagina}] BOLETA N° ${demo.numero}${demo.nombre ? `   Participante: ${demo.nombre}` : ""}`,
    `[p.${pagina}] PARTIDO 1 X 2`,
    ...pronosticos.map((p) => `[p.${pagina}] ${p.evidencia}`),
  ];

  return {
    id: `${fechaId}-b${String(indice + 1).padStart(3, "0")}`,
    fechaId,
    participante: demo.nombre,
    participanteConfianza: demo.nombre ? 0.96 : 0,
    participanteEvidencia: demo.nombre ? `Participante: ${demo.nombre}` : null,
    numeroBoleta: demo.numero,
    paginas: [pagina],
    pronosticos,
    problemas,
    estado: problemas.some((p) => p.severidad === "error") ? "revision" : "ok",
    textoCrudo: lineas.join("\n"),
    origen: "demo",
    editadaManualmente: false,
    metodoDeteccion: "grilla-columnas",
    creadaEn: new Date(Date.now() - (100 - indice) * 1000).toISOString(),
  };
}

export const ID_FECHA_DEMO = "demo-fecha-12";
export const ID_FECHA_DEMO_ANTERIOR = "demo-fecha-11";

function construirFecha(
  id: string,
  nombre: string,
  partidos: [string, string][],
  resultados: Pronostico[],
  creadaEn: string,
): Fecha {
  return {
    id,
    nombre,
    cantidadPartidos: partidos.length,
    partidos: partidos.map(([local, visitante], i) => ({
      numero: i + 1,
      local,
      visitante,
      resultado: resultados[i] ?? null,
    })),
    estado: "corregida",
    esDemo: true,
    config: { desempate: "ninguna", partidoClave: null },
    diagnostico: {
      nombreArchivo: "boletas-fecha-12-con-errores.pdf",
      bytes: 22924,
      paginas: Math.ceil((BOLETAS_LIMPIAS.length + BOLETAS_PROBLEMATICAS.length) / 2),
      paginasConTexto: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      paginasSinTexto: [],
      caracteresExtraidos: 6990,
      tieneCapaTexto: true,
      metodo: "texto",
      estrategiaSegmentacion: "ancla-boleta-numerada",
      puntajeEstrategia: 13.04,
      estrategiasEvaluadas: [
        { nombre: "ancla-boleta-numerada", boletas: 19, puntaje: 13.04 },
        { nombre: "una-boleta-por-pagina", boletas: 10, puntaje: -9.44 },
      ],
      procesadoEn: creadaEn,
      milisegundos: 199,
    },
    auditoria: [
      {
        fecha: creadaEn,
        accion: "demo",
        detalle: "Fecha de demostración creada automáticamente con datos ficticios.",
      },
    ],
    creadaEn,
    actualizadaEn: creadaEn,
  };
}

export function construirDemo(): { fecha: Fecha; boletas: Boleta[] }[] {
  const ahora = Date.now();
  const creada12 = new Date(ahora - 2 * 86400_000).toISOString();
  const creada11 = new Date(ahora - 9 * 86400_000).toISOString();

  const fecha12 = construirFecha(
    ID_FECHA_DEMO,
    "Fecha 12 — Torneo del Club (DEMO)",
    PARTIDOS_DEMO,
    RESULTADOS_DEMO,
    creada12,
  );
  const todas12 = [...BOLETAS_LIMPIAS, ...BOLETAS_PROBLEMATICAS];
  const boletas12 = todas12.map((b, i) =>
    construirBoleta(ID_FECHA_DEMO, i, b, PARTIDOS_DEMO.length, PARTIDOS_DEMO),
  );

  // Duplicados: se marcan igual que lo haría el procesador real.
  const porNombre = new Map<string, Boleta[]>();
  for (const b of boletas12) {
    if (!b.participante) continue;
    const clave = b.participante.toLowerCase();
    if (!porNombre.has(clave)) porNombre.set(clave, []);
    porNombre.get(clave)!.push(b);
  }
  for (const [, grupo] of porNombre) {
    if (grupo.length < 2) continue;
    const paginas = [...new Set(grupo.flatMap((b) => b.paginas))].sort((a, b) => a - b).join(", ");
    for (const b of grupo) {
      b.problemas.push(
        problema(
          "DUPLICADO_PARTICIPANTE",
          "error",
          `El participante "${b.participante}" aparece en ${grupo.length} boletas (páginas ${paginas}). Confirmá cuál vale antes de publicar el ranking.`,
          b.paginas[0],
          b.participante,
        ),
      );
      b.estado = "revision";
    }
  }

  const fecha11 = construirFecha(
    ID_FECHA_DEMO_ANTERIOR,
    "Fecha 11 — Torneo del Club (DEMO)",
    PARTIDOS_FECHA_11,
    RESULTADOS_FECHA_11,
    creada11,
  );
  fecha11.diagnostico = null;
  const boletas11 = BOLETAS_FECHA_11.map((b, i) =>
    construirBoleta(ID_FECHA_DEMO_ANTERIOR, i, b, PARTIDOS_FECHA_11.length, PARTIDOS_FECHA_11),
  );

  return [
    { fecha: fecha12, boletas: boletas12 },
    { fecha: fecha11, boletas: boletas11 },
  ];
}
