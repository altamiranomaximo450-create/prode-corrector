/* ==========================================================================
   DATOS DE DEMOSTRACIÓN
   Son ficticios y están marcados como tales en toda la interfaz. Existen para
   que el panel no se vea vacío en una presentación. Cuando se procesa un PDF
   real se hace sobre una fecha nueva: las de demostración no se mezclan y ni
   siquiera aceptan que se les suba un PDF.
   Es el mismo juego de datos con el que se generaron los PDF de prueba
   incluidos en este archivo, así que ambos cuentan la misma historia.
   ========================================================================== */

const PARTIDOS_DEMO = [
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

const RESULTADOS_DEMO = ["1", "X", "2", "1", "1", "X", "1", "2", "X", "1"];

const BOLETAS_LIMPIAS = [
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

const BOLETAS_PROBLEMATICAS = [
  { numero: "512", nombre: "Ramiro Benitez", pron: ["1", "X", "2", "1", "1", "X", "1", "2", "X"] },
  { numero: "533", nombre: "Julieta Campos", pron: ["1", "X", "2", "1", "1", "X", "1", "2", "X", "1"], ambiguoEn: 4 },
  { numero: "548", nombre: null, pron: ["2", "X", "2", "1", "1", "X", "1", "2", "1", "1"] },
  { numero: "560", nombre: "Juan Perez", pron: ["1", "1", "1", "1", "1", "1", "1", "1", "1", "1"] },
  { numero: "184", nombre: "Juan Perez", pron: ["1", "X", "2", "1", "1", "X", "1", "2", "X", "2"] },
];

const PARTIDOS_FECHA_11 = [
  ["Racing Club", "Platense"],
  ["Independiente", "Sarmiento"],
  ["Belgrano", "Union"],
  ["Huracan", "Barracas Central"],
  ["Gimnasia LP", "Riestra"],
  ["Newells", "Atletico Tucuman"],
  ["Argentinos Jrs", "Central Cordoba"],
  ["Banfield", "Independiente Rivadavia"],
];

const RESULTADOS_FECHA_11 = ["1", "1", "X", "2", "1", "X", "1", "2"];

const BOLETAS_FECHA_11 = [
  { numero: "071", nombre: "Ana Torres", pron: ["1", "1", "X", "2", "1", "X", "1", "2"] },
  { numero: "112", nombre: "Juan Perez", pron: ["1", "1", "X", "2", "1", "X", "2", "2"] },
  { numero: "045", nombre: "Martin Lopez", pron: ["1", "1", "X", "1", "1", "X", "1", "1"] },
  { numero: "203", nombre: "Sofia Ramirez", pron: ["1", "2", "X", "2", "X", "X", "1", "2"] },
  { numero: "088", nombre: "Lucas Diaz", pron: ["X", "1", "1", "2", "1", "2", "1", "2"] },
  { numero: "159", nombre: "Carla Gimenez", pron: ["1", "1", "2", "2", "1", "1", "1", "X"] },
  { numero: "260", nombre: "Pablo Sosa", pron: ["2", "1", "X", "X", "1", "X", "1", "2"] },
  { numero: "037", nombre: "Marina Acosta", pron: ["1", "X", "X", "2", "1", "X", "1", "2"] },
];

const ID_FECHA_DEMO = "demo-fecha-12";
const ID_FECHA_DEMO_ANTERIOR = "demo-fecha-11";

function construirBoletaDemo(fechaId, indice, demo, cantidadPartidos, partidos) {
  const pagina = Math.floor(indice / 2) + 1;
  const pronosticos = [];

  for (let i = 0; i < cantidadPartidos; i++) {
    const crudo = demo.pron[i];
    const ambiguo = demo.ambiguoEn === i + 1;
    const par = partidos[i];
    pronosticos.push({
      partidoNumero: i + 1,
      valor: ambiguo || !crudo ? null : crudo,
      origen: "pdf",
      confianza: ambiguo || !crudo ? 0 : 0.95,
      evidencia: crudo
        ? `${i + 1} ${par[0]} vs ${par[1]}` + (ambiguo ? "  X  X" : "  " + crudo)
        : "(sin lectura)",
      pagina: crudo ? pagina : null,
    });
  }

  const problemas = [];
  if (!demo.nombre) {
    problemas.push(problema("NOMBRE_NO_DETECTADO", "error",
      "No se pudo identificar el nombre del participante en esta boleta.",
      pagina, `BOLETA N° ${demo.numero} | PARTIDO 1 X 2`));
  }
  if (demo.pron.length !== cantidadPartidos) {
    problemas.push(problema("CANTIDAD_PRONOSTICOS", "error",
      `Se leyeron ${demo.pron.length} pronósticos y la fecha tiene ${cantidadPartidos} partidos. No se puede saber a qué partido corresponde cada marca: hay que revisarla a mano.`,
      pagina));
  }
  if (demo.ambiguoEn) {
    problemas.push(problema("PRONOSTICO_AMBIGUO", "error",
      `El partido ${demo.ambiguoEn} tiene más de una opción marcada. No se interpreta.`,
      pagina, pronosticos[demo.ambiguoEn - 1] ? pronosticos[demo.ambiguoEn - 1].evidencia : null, demo.ambiguoEn));
  }
  for (const p of pronosticos) {
    if (p.valor === null && !demo.ambiguoEn) {
      problemas.push(problema("PRONOSTICO_FALTANTE", "error",
        `El partido ${p.partidoNumero} no tiene un pronóstico legible.`, pagina, null, p.partidoNumero));
    }
  }

  const lineas = [
    `[p.${pagina}] PRODE EL CLUB  -  FECHA 12`,
    `[p.${pagina}] BOLETA N° ${demo.numero}` + (demo.nombre ? `   Participante: ${demo.nombre}` : ""),
    `[p.${pagina}] PARTIDO 1 X 2`,
  ].concat(pronosticos.map((p) => `[p.${pagina}] ${p.evidencia}`));

  return {
    id: fechaId + "-b" + String(indice + 1).padStart(3, "0"),
    fechaId,
    participante: demo.nombre,
    participanteConfianza: demo.nombre ? 0.96 : 0,
    participanteEvidencia: demo.nombre ? "Participante: " + demo.nombre : null,
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

function construirFechaDemo(id, nombre, partidos, resultados, creadaEn, conDiagnostico) {
  return {
    id, nombre,
    cantidadPartidos: partidos.length,
    partidos: partidos.map((p, i) => ({
      numero: i + 1, local: p[0], visitante: p[1],
      resultado: resultados[i] === undefined ? null : resultados[i],
    })),
    estado: "corregida",
    esDemo: true,
    config: { desempate: "ninguna", partidoClave: null },
    diagnostico: conDiagnostico ? {
      nombreArchivo: "boletas-fecha-12-con-errores.pdf",
      bytes: 22924,
      paginas: 10,
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
    } : null,
    auditoria: [{
      fecha: creadaEn, accion: "demo",
      detalle: "Fecha de demostración creada automáticamente con datos ficticios.",
    }],
    creadaEn,
    actualizadaEn: creadaEn,
  };
}

function construirDemo() {
  const ahora = Date.now();
  const creada12 = new Date(ahora - 2 * 86400000).toISOString();
  const creada11 = new Date(ahora - 9 * 86400000).toISOString();

  const fecha12 = construirFechaDemo(ID_FECHA_DEMO, "Fecha 12 — Torneo del Club (DEMO)",
    PARTIDOS_DEMO, RESULTADOS_DEMO, creada12, true);
  const todas12 = BOLETAS_LIMPIAS.concat(BOLETAS_PROBLEMATICAS);
  const boletas12 = todas12.map((b, i) =>
    construirBoletaDemo(ID_FECHA_DEMO, i, b, PARTIDOS_DEMO.length, PARTIDOS_DEMO));

  // Duplicados: se marcan igual que lo haría el procesador real.
  const porNombre = new Map();
  for (const b of boletas12) {
    if (!b.participante) continue;
    const clave = normalizar(b.participante);
    if (!porNombre.has(clave)) porNombre.set(clave, []);
    porNombre.get(clave).push(b);
  }
  porNombre.forEach((grupo) => {
    if (grupo.length < 2) return;
    const paginas = Array.from(new Set(grupo.reduce((a, b) => a.concat(b.paginas), [])))
      .sort((a, b) => a - b).join(", ");
    for (const b of grupo) {
      b.problemas.push(problema("DUPLICADO_PARTICIPANTE", "error",
        `El participante "${b.participante}" aparece en ${grupo.length} boletas (páginas ${paginas}). Confirmá cuál vale antes de publicar el ranking.`,
        b.paginas[0], b.participante));
      b.estado = "revision";
    }
  });

  const fecha11 = construirFechaDemo(ID_FECHA_DEMO_ANTERIOR, "Fecha 11 — Torneo del Club (DEMO)",
    PARTIDOS_FECHA_11, RESULTADOS_FECHA_11, creada11, false);
  const boletas11 = BOLETAS_FECHA_11.map((b, i) =>
    construirBoletaDemo(ID_FECHA_DEMO_ANTERIOR, i, b, PARTIDOS_FECHA_11.length, PARTIDOS_FECHA_11));

  return [
    { fecha: fecha12, boletas: boletas12 },
    { fecha: fecha11, boletas: boletas11 },
  ];
}
