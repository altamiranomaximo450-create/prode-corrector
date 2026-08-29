/* ==========================================================================
   NÚCLEO — motor de corrección, lector de PDF y almacenamiento
   --------------------------------------------------------------------------
   Es el mismo algoritmo que la versión con servidor, portado a JavaScript
   de navegador. Los PDF nunca salen de la computadora de quien lo usa: se
   leen acá adentro y los datos quedan en el almacenamiento local del
   navegador.
   ========================================================================== */

/* ---------------------------------------------------------------- utilidades */

const PRONOSTICOS = ["1", "X", "2"];

const ETIQUETA_PRONOSTICO = { "1": "Local", X: "Empate", "2": "Visitante" };

function normalizar(texto) {
  return (texto || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function nuevoId() {
  if (globalThis.crypto && crypto.randomUUID) return crypto.randomUUID();
  return "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
}

function escaparHtml(texto) {
  return String(texto == null ? "" : texto)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fechaHora(iso) {
  try {
    return new Date(iso).toLocaleString("es-AR", {
      day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
    });
  } catch { return iso; }
}

function fechaCorta(iso) {
  try {
    return new Date(iso).toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric" });
  } catch { return iso; }
}

/* ==========================================================================
   1. MOTOR DE CORRECCIÓN
   Función pura: dada una fecha y sus boletas, produce detalle, ranking y Top 3.
   Nunca inventa un pronóstico ni un resultado.
   ========================================================================== */

function construirExplicacion(fila) {
  const acertados = fila.detalle.filter((d) => d.estado === "acierto")
    .map((d) => `#${d.partidoNumero} ${d.local} vs ${d.visitante} (${d.pronostico})`);
  const fallados = fila.detalle.filter((d) => d.estado === "error")
    .map((d) => `#${d.partidoNumero} ${d.local} vs ${d.visitante} (marcó ${d.pronostico}, salió ${d.resultado})`);
  const sinPron = fila.detalle.filter((d) => d.estado === "sin_pronostico");
  const sinRes = fila.detalle.filter((d) => d.estado === "sin_resultado");

  const partes = [`Obtuvo ${fila.aciertos} de ${fila.partidosEvaluados} aciertos posibles.`];
  if (acertados.length) partes.push(`Acertó: ${acertados.join("; ")}.`);
  if (fallados.length) partes.push(`Falló: ${fallados.join("; ")}.`);
  if (sinPron.length) partes.push(`Sin pronóstico legible en: ${sinPron.map((d) => "#" + d.partidoNumero).join(", ")}.`);
  if (sinRes.length) partes.push(`Sin resultado oficial cargado en: ${sinRes.map((d) => "#" + d.partidoNumero).join(", ")} (no computan para nadie).`);
  return partes.join(" ");
}

function corregirBoleta(fecha, boleta) {
  const porNumero = new Map(boleta.pronosticos.map((p) => [p.partidoNumero, p]));
  const detalle = [];
  let aciertos = 0, errores = 0, sinPronostico = 0, partidosEvaluados = 0;

  for (const partido of fecha.partidos) {
    const pron = porNumero.get(partido.numero) || null;
    const valor = pron ? pron.valor : null;
    const resultado = partido.resultado;
    let estado;

    if (resultado === null) {
      estado = "sin_resultado";
    } else {
      partidosEvaluados += 1;
      if (valor === null) { estado = "sin_pronostico"; sinPronostico += 1; }
      else if (valor === resultado) { estado = "acierto"; aciertos += 1; }
      else { estado = "error"; errores += 1; }
    }

    detalle.push({
      partidoNumero: partido.numero,
      local: partido.local,
      visitante: partido.visitante,
      pronostico: valor,
      resultado,
      estado,
      evidencia: pron ? pron.evidencia : "",
      origen: pron ? pron.origen : "pdf",
    });
  }

  const porcentaje = partidosEvaluados > 0 ? Math.round((aciertos / partidosEvaluados) * 1000) / 10 : 0;
  const elegible = boleta.estado !== "revision";

  const fila = {
    boletaId: boleta.id,
    participante: boleta.participante,
    numeroBoleta: boleta.numeroBoleta,
    aciertos, errores, sinPronostico, partidosEvaluados, porcentaje, detalle,
    estado: boleta.estado,
    problemas: boleta.problemas,
    elegible,
    motivoNoElegible: elegible ? null : "La boleta requiere revisión manual: no se computa en el ranking hasta resolverla.",
    paginas: boleta.paginas,
    origen: boleta.origen,
  };
  fila.explicacion = construirExplicacion(fila);
  return fila;
}

function puntajePartidoClave(fila, clave) {
  const d = fila.detalle.find((x) => x.partidoNumero === clave);
  return d && d.estado === "acierto" ? 1 : 0;
}

function numeroDeBoleta(fila) {
  const n = Number(String(fila.numeroBoleta || "").replace(/\D/g, ""));
  return Number.isFinite(n) && n > 0 ? n : Number.MAX_SAFE_INTEGER;
}

function compararFilas(fecha, a, b) {
  if (b.aciertos !== a.aciertos) return b.aciertos - a.aciertos;
  if (fecha.config.desempate === "partido_clave" && fecha.config.partidoClave) {
    const dif = puntajePartidoClave(b, fecha.config.partidoClave) - puntajePartidoClave(a, fecha.config.partidoClave);
    if (dif !== 0) return dif;
  }
  if (fecha.config.desempate === "orden_boleta") {
    const dif = numeroDeBoleta(a) - numeroDeBoleta(b);
    if (dif !== 0) return dif;
  }
  // Sin regla que los separe: alfabético sólo para que el listado sea estable.
  return normalizar(a.participante).localeCompare(normalizar(b.participante));
}

function empatanEnPosicion(fecha, a, b) {
  if (a.aciertos !== b.aciertos) return false;
  if (fecha.config.desempate === "ninguna") return true;
  if (fecha.config.desempate === "partido_clave" && fecha.config.partidoClave) {
    return puntajePartidoClave(a, fecha.config.partidoClave) === puntajePartidoClave(b, fecha.config.partidoClave);
  }
  if (fecha.config.desempate === "orden_boleta") return numeroDeBoleta(a) === numeroDeBoleta(b);
  return true;
}

function corregirFecha(fecha, boletas) {
  const filas = boletas.map((b) => corregirBoleta(fecha, b));
  const elegibles = filas.filter((f) => f.elegible);
  const enRevision = filas.filter((f) => !f.elegible);
  const ordenadas = elegibles.slice().sort((a, b) => compararFilas(fecha, a, b));

  const ranking = [];
  let posicion = 0;
  for (let i = 0; i < ordenadas.length; i++) {
    const anterior = i > 0 ? ordenadas[i - 1] : null;
    // Ranking competitivo estándar: 1, 2, 2, 4...
    if (!(anterior && empatanEnPosicion(fecha, anterior, ordenadas[i]))) posicion = i + 1;
    ranking.push(Object.assign({}, ordenadas[i], { posicion, empatado: false }));
  }
  const cuenta = new Map();
  for (const r of ranking) cuenta.set(r.posicion, (cuenta.get(r.posicion) || 0) + 1);
  for (const r of ranking) r.empatado = (cuenta.get(r.posicion) || 0) > 1;

  const top3 = [];
  for (const puesto of [1, 2, 3]) {
    const grupo = ranking.filter((r) => r.posicion === puesto);
    if (grupo.length) {
      top3.push({ puesto, aciertos: grupo[0].aciertos, participantes: grupo, empate: grupo.length > 1 });
    }
  }

  const nombres = new Set(filas.map((f) => normalizar(f.participante)).filter(Boolean));
  const puntajes = elegibles.map((f) => f.aciertos);

  const resumen = {
    boletasTotales: filas.length,
    boletasOk: filas.filter((f) => f.estado === "ok").length,
    boletasEnRevision: filas.filter((f) => f.estado === "revision").length,
    boletasResueltasManualmente: filas.filter((f) => f.estado === "resuelta_manual").length,
    participantes: nombres.size,
    partidosConResultado: fecha.partidos.filter((p) => p.resultado !== null).length,
    partidosSinResultado: fecha.partidos.filter((p) => p.resultado === null).length,
    promedioAciertos: puntajes.length ? Math.round((puntajes.reduce((a, b) => a + b, 0) / puntajes.length) * 100) / 100 : null,
    maximoAciertos: puntajes.length ? Math.max.apply(null, puntajes) : null,
    minimoAciertos: puntajes.length ? Math.min.apply(null, puntajes) : null,
  };

  const advertencias = [];
  if (resumen.partidosSinResultado > 0) {
    const faltan = fecha.partidos.filter((p) => p.resultado === null).map((p) => "#" + p.numero).join(", ");
    advertencias.push(`Faltan resultados oficiales en ${resumen.partidosSinResultado} partido(s): ${faltan}. Esos partidos no se computan para nadie.`);
  }
  if (resumen.boletasEnRevision > 0) {
    advertencias.push(`${resumen.boletasEnRevision} boleta(s) requieren revisión manual y están excluidas del ranking.`);
  }
  if (filas.length === 0) advertencias.push("Todavía no hay boletas cargadas en esta fecha.");

  return { fecha, filas, ranking, enRevision, top3, resumen, advertencias };
}

/* ==========================================================================
   2. LECTOR DE PDF — texto con coordenadas
   La posición X/Y es imprescindible: en las boletas el pronóstico suele ser
   una marca ubicada bajo la columna 1, X o 2, no una palabra.
   ========================================================================== */

let pdfjsCache = null;

async function cargarPdfjs() {
  if (pdfjsCache) return pdfjsCache;
  const fuenteLib = document.getElementById("pdfjs-lib").textContent;
  const fuenteWorker = document.getElementById("pdfjs-worker").textContent;

  const urlWorker = URL.createObjectURL(new Blob([fuenteWorker], { type: "text/javascript" }));
  const urlLib = URL.createObjectURL(new Blob([fuenteLib], { type: "text/javascript" }));

  const mod = await import(urlLib);
  mod.GlobalWorkerOptions.workerSrc = urlWorker;
  pdfjsCache = mod;
  return mod;
}

const MIN_CARACTERES_PAGINA = 12;

function agruparEnLineas(tokens, pagina) {
  if (!tokens.length) return [];
  const alturas = tokens.map((t) => t.alto).filter((a) => a > 0).sort((a, b) => a - b);
  const mediana = alturas.length ? alturas[Math.floor(alturas.length / 2)] : 10;
  const tolerancia = Math.max(1.5, mediana * 0.55);

  const ordenados = tokens.slice().sort((a, b) => (b.y - a.y) || (a.x - b.x));
  const grupos = [];
  let actual = [];
  let yRef = NaN;

  for (const token of ordenados) {
    if (actual.length === 0 || Math.abs(token.y - yRef) <= tolerancia) {
      if (actual.length === 0) yRef = token.y;
      actual.push(token);
      yRef = actual.reduce((s, t) => s + t.y, 0) / actual.length;
    } else {
      grupos.push(actual);
      actual = [token];
      yRef = token.y;
    }
  }
  if (actual.length) grupos.push(actual);

  return grupos.map((grupo) => {
    const orden = grupo.slice().sort((a, b) => a.x - b.x);
    let texto = "";
    for (let i = 0; i < orden.length; i++) {
      const t = orden[i];
      if (i > 0) {
        const prev = orden[i - 1];
        const hueco = t.x - (prev.x + prev.ancho);
        const anchoChar = prev.ancho / Math.max(1, prev.texto.length);
        if (hueco > anchoChar * 0.35) texto += " ";
      }
      texto += t.texto;
    }
    return {
      pagina,
      y: orden.reduce((s, t) => s + t.y, 0) / orden.length,
      alto: Math.max.apply(null, orden.map((t) => t.alto).concat([1])),
      tokens: orden,
      texto: texto.replace(/\s+/g, " ").trim(),
      xInicio: Math.min.apply(null, orden.map((t) => t.x)),
      xFin: Math.max.apply(null, orden.map((t) => t.x + t.ancho)),
    };
  });
}

async function extraerDocumento(datos, onProgreso) {
  const pdfjs = await cargarPdfjs();
  const doc = await pdfjs.getDocument({
    data: datos,
    isEvalSupported: false,
    disableFontFace: true,
    useSystemFonts: false,
    verbosity: 0,
  }).promise;

  const paginas = [];
  try {
    for (let n = 1; n <= doc.numPages; n++) {
      const pagina = await doc.getPage(n);
      const viewport = pagina.getViewport({ scale: 1 });
      const contenido = await pagina.getTextContent({ includeMarkedContent: false });

      const tokens = [];
      for (const item of contenido.items) {
        if (typeof item.str !== "string") continue;
        const texto = item.str.trim();
        if (texto === "") continue;
        const tr = item.transform;
        const alto = Math.abs(item.height) || Math.hypot(tr[1], tr[3]) || 10;
        tokens.push({
          pagina: n, x: tr[4], y: tr[5],
          ancho: Math.abs(item.width) || texto.length * alto * 0.5,
          alto, texto,
        });
      }

      paginas.push({
        numero: n,
        ancho: viewport.width,
        alto: viewport.height,
        tokens,
        lineas: agruparEnLineas(tokens, n),
        caracteres: tokens.reduce((s, t) => s + t.texto.length, 0),
      });

      pagina.cleanup();
      if (onProgreso) onProgreso(n, doc.numPages);
      // Se cede el hilo para que la barra de progreso se pueda pintar.
      await new Promise((r) => setTimeout(r, 0));
    }
  } finally {
    try { await doc.destroy(); } catch { /* nada */ }
  }

  const conTexto = paginas.filter((p) => p.caracteres >= MIN_CARACTERES_PAGINA).map((p) => p.numero);
  const sinTexto = paginas.filter((p) => p.caracteres < MIN_CARACTERES_PAGINA).map((p) => p.numero);

  return {
    paginas,
    totalCaracteres: paginas.reduce((s, p) => s + p.caracteres, 0),
    tieneCapaTexto: conTexto.length > 0,
    paginasConTexto: conTexto,
    paginasSinTexto: sinTexto,
  };
}

/* ==========================================================================
   3. ANALIZADOR — de texto a boletas
   No asume un formato: prueba varias formas de partir el documento y varias
   formas de leer los pronósticos, y se queda con la que mejor lo explica.
   ========================================================================== */

const PALABRAS_ESTRUCTURA = new Set([
  "prode", "fecha", "boleta", "ficha", "tarjeta", "cupon", "talon", "partido", "partidos",
  "local", "empate", "visitante", "resultado", "resultados", "pronostico", "pronosticos",
  "aciertos", "total", "puntaje", "firma", "planilla", "torneo", "jornada", "equipo",
  "equipos", "vs", "nombre", "participante", "jugador", "numero",
]);

const MARCAS = /^[xX✓✔✗✘●•·*+]$/;

const ANCLAS = [
  { nombre: "ancla-boleta-numerada", re: /\b(boleta|ficha|tarjeta|cup[oó]n|tal[oó]n|ticket)\b\s*(n[°ºo]?\.?|nro\.?|num\.?|#)?\s*:?\s*\d{1,6}\b/i },
  { nombre: "ancla-boleta", re: /^\s*(boleta|ficha|tarjeta|cup[oó]n|tal[oó]n|ticket)\b/i },
  { nombre: "ancla-participante", re: /^\s*(participante|nombre y apellido|apellido y nombre|nombre|jugador|socio)\s*[:.\-]/i },
  { nombre: "ancla-prode", re: /^\s*prode\b/i },
];

const RE_NOMBRE_ETIQUETADO = /(?:participante|nombre y apellido|apellido y nombre|nombre|jugador|socio)\s*[:.\-]\s*(.+)$/i;
const RE_NUMERO = /(?:boleta|ficha|tarjeta|cup[oó]n|tal[oó]n|ticket|n[°ºo]\.?|nro\.?|#)\s*[:.\-]?\s*(\d{1,6})\b/i;

function lineasEnOrden(doc) {
  const todas = [];
  for (const p of doc.paginas) todas.push.apply(todas, p.lineas);
  return todas;
}

function segmentarPorAncla(doc, re) {
  const todas = lineasEnOrden(doc);
  const cortes = [];
  for (let i = 0; i < todas.length; i++) if (re.test(todas[i].texto)) cortes.push(i);
  if (cortes.length < 2) return [];
  const segmentos = [];
  for (let i = 0; i < cortes.length; i++) {
    const lineas = todas.slice(cortes[i], i + 1 < cortes.length ? cortes[i + 1] : todas.length);
    if (!lineas.length) continue;
    segmentos.push({ lineas, paginas: Array.from(new Set(lineas.map((l) => l.pagina))) });
  }
  return segmentos;
}

function segmentarPorPagina(doc) {
  return doc.paginas.filter((p) => p.lineas.length > 0)
    .map((p) => ({ lineas: p.lineas, paginas: [p.numero] }));
}

function detectarCortesVerticales(tokens, ancho) {
  if (tokens.length < 20) return [];
  const bins = 60;
  const cubos = new Array(bins).fill(0);
  for (const t of tokens) {
    const desde = Math.max(0, Math.floor((t.x / ancho) * bins));
    const hasta = Math.min(bins - 1, Math.floor(((t.x + t.ancho) / ancho) * bins));
    for (let i = desde; i <= hasta; i++) cubos[i] += 1;
  }
  const cortes = [];
  let inicioVacio = -1;
  for (let i = 0; i < bins; i++) {
    if (cubos[i] === 0) { if (inicioVacio === -1) inicioVacio = i; }
    else if (inicioVacio !== -1) {
      const largo = i - inicioVacio;
      if (largo >= 3 && inicioVacio > bins * 0.12 && i < bins * 0.88) {
        cortes.push(((inicioVacio + i) / 2 / bins) * ancho);
      }
      inicioVacio = -1;
    }
  }
  return cortes;
}

function segmentarPorColumnas(doc) {
  const segmentos = [];
  for (const pagina of doc.paginas) {
    if (!pagina.lineas.length) continue;
    const cortes = detectarCortesVerticales(pagina.tokens, pagina.ancho);
    if (!cortes.length) { segmentos.push({ lineas: pagina.lineas, paginas: [pagina.numero] }); continue; }
    const limites = [0].concat(cortes, [pagina.ancho]);
    for (let i = 0; i < limites.length - 1; i++) {
      const lineas = pagina.lineas.filter((l) => {
        const centro = (l.xInicio + l.xFin) / 2;
        return centro >= limites[i] && centro < limites[i + 1];
      });
      if (lineas.length) segmentos.push({ lineas, paginas: [pagina.numero] });
    }
  }
  return segmentos.length > doc.paginas.length ? segmentos : [];
}

function segmentarPorBloques(doc) {
  const segmentos = [];
  for (const pagina of doc.paginas) {
    const lineas = pagina.lineas;
    if (lineas.length < 4) continue;
    const huecos = [];
    for (let i = 1; i < lineas.length; i++) huecos.push(Math.abs(lineas[i - 1].y - lineas[i].y));
    const ordenados = huecos.slice().sort((a, b) => a - b);
    const mediana = ordenados[Math.floor(ordenados.length / 2)] || 12;
    const umbral = mediana * 2.4;
    let actual = [lineas[0]];
    for (let i = 1; i < lineas.length; i++) {
      if (huecos[i - 1] > umbral && actual.length) {
        segmentos.push({ lineas: actual, paginas: [pagina.numero] });
        actual = [];
      }
      actual.push(lineas[i]);
    }
    if (actual.length) segmentos.push({ lineas: actual, paginas: [pagina.numero] });
  }
  return segmentos.length > doc.paginas.length ? segmentos : [];
}

function etiquetaColumna(texto) {
  const t = normalizar(texto).replace(/[^a-z0-9]/g, "");
  if (t === "1" || t === "l" || t === "local") return "1";
  if (t === "x" || t === "e" || t === "empate") return "X";
  if (t === "2" || t === "v" || t === "visitante") return "2";
  return null;
}

/**
 * Busca el renglón que hace de encabezado de columnas (1 / X / 2).
 * Si existe, el pronóstico está codificado por POSICIÓN: leer el último token
 * del renglón daría siempre la misma marca. Por eso los modos "planos" se
 * desactivan cuando aparece.
 */
function detectarEncabezadoGrilla(lineas) {
  for (let i = 0; i < lineas.length; i++) {
    const candidatos = [];
    for (const t of lineas[i].tokens) {
      const et = etiquetaColumna(t.texto);
      if (et) candidatos.push({ valor: et, x: t.x + t.ancho / 2 });
    }
    const unicos = new Map();
    for (const c of candidatos) if (!unicos.has(c.valor)) unicos.set(c.valor, c.x);
    if (unicos.size !== 3) continue;
    const orden = Array.from(unicos.entries()).sort((a, b) => a[1] - b[1]);
    if (orden[0][0] === "1" && orden[1][0] === "X" && orden[2][0] === "2") {
      return { centros: orden.map((e) => ({ valor: e[0], x: e[1] })), indice: i };
    }
  }
  return null;
}

function modoGrilla(lineas) {
  const encabezado = detectarEncabezadoGrilla(lineas);
  if (!encabezado) return null;
  const centros = encabezado.centros;
  const separacion = Math.min(centros[1].x - centros[0].x, centros[2].x - centros[1].x);
  if (separacion <= 0) return null;
  const tolerancia = separacion * 0.45;

  const valores = [];
  for (let i = encabezado.indice + 1; i < lineas.length; i++) {
    const linea = lineas[i];
    const golpes = [];
    for (const t of linea.tokens) {
      const centroToken = t.x + t.ancho / 2;
      for (const c of centros) {
        if (Math.abs(centroToken - c.x) > tolerancia) continue;
        const txt = t.texto.trim();
        if (MARCAS.test(txt)) golpes.push(c.valor);
        else if (etiquetaColumna(txt) === c.valor && txt.length <= 2) golpes.push(c.valor);
      }
    }
    if (!golpes.length) continue;
    const distintos = Array.from(new Set(golpes));
    valores.push({
      valor: distintos.length === 1 ? distintos[0] : null,
      evidencia: linea.texto,
      pagina: linea.pagina,
      confianza: distintos.length === 1 ? 0.95 : 0,
      ambiguo: distintos.length > 1,
    });
  }
  if (!valores.length) return null;
  return { modo: "grilla-columnas", valores, confianzaModo: 0.95 };
}

function modoLineaFinal(lineas) {
  const valores = [];
  for (const linea of lineas) {
    if (linea.tokens.length < 2) continue;
    const ultimo = linea.tokens[linea.tokens.length - 1].texto.trim();
    const valor = etiquetaColumna(ultimo);
    if (!valor || ultimo.length > 1) continue;
    const resto = linea.texto.slice(0, linea.texto.length - ultimo.length);
    if ((resto.match(/[a-zA-ZÁÉÍÓÚÑáéíóúñ]/g) || []).length < 4) continue;
    if (PALABRAS_ESTRUCTURA.has(normalizar(resto).replace(/[^a-z]/g, ""))) continue;
    valores.push({ valor, evidencia: linea.texto, pagina: linea.pagina, confianza: 0.9, ambiguo: false });
  }
  if (!valores.length) return null;
  return { modo: "linea-final", valores, confianzaModo: 0.9 };
}

/**
 * "3) X", "Partido 3: 2", "3 - 1".
 * El valor tiene que estar pegado al número a propósito: si se permitiera
 * texto intermedio, un renglón de grilla como "3 Talleres vs Belgrano  X" se
 * leería como "partido 3 = X", que es la marca de la columna y no el
 * pronóstico. Ese error se detectó en pruebas.
 */
function modoNumerado(lineas, esperado) {
  const mapa = new Map();
  const re = /^\s*(?:partido\s*)?(\d{1,2})\s*(?:[).:\-–]\s*|\s)\s*([1xX2])\s*$/;
  for (const linea of lineas) {
    const m = linea.texto.match(re);
    if (!m) continue;
    const numero = Number(m[1]);
    if (!Number.isFinite(numero) || numero < 1 || numero > esperado) continue;
    const valor = etiquetaColumna(m[2]);
    if (!valor) continue;
    if (mapa.has(numero)) {
      const previo = mapa.get(numero);
      if (previo.valor !== valor) {
        mapa.set(numero, Object.assign({}, previo, { valor: null, confianza: 0, ambiguo: true }));
      }
      continue;
    }
    mapa.set(numero, { valor, evidencia: linea.texto, pagina: linea.pagina, confianza: 0.92, ambiguo: false });
  }
  if (!mapa.size) return null;
  const valores = [];
  const maximo = Math.max.apply(null, Array.from(mapa.keys()));
  for (let i = 1; i <= Math.max(maximo, mapa.size); i++) {
    valores.push(mapa.get(i) || {
      valor: null, evidencia: `(no se encontró el renglón del partido ${i})`,
      pagina: null, confianza: 0, ambiguo: false,
    });
  }
  return { modo: "numerado", valores, confianzaModo: 0.92 };
}

function modoSecuencia(lineas, esperado) {
  const items = [];
  for (const linea of lineas) {
    for (const t of linea.tokens) {
      const txt = t.texto.trim();
      if (!/^[1xX2]+$/.test(txt)) continue;
      for (const ch of txt) items.push({ char: ch, linea });
    }
  }
  if (items.length !== esperado) return null;
  return {
    modo: "secuencia",
    confianzaModo: 0.7,
    valores: items.map((it) => ({
      valor: etiquetaColumna(it.char), evidencia: it.linea.texto,
      pagina: it.linea.pagina, confianza: 0.7, ambiguo: false,
    })),
  };
}

function leerPronosticos(lineas, esperado) {
  const grilla = modoGrilla(lineas);
  // La lectura por posición manda: es la única que distingue una marca de un
  // pronóstico escrito. Si cuadra con la cantidad de partidos, no se discute.
  if (grilla && grilla.valores.length === esperado) return grilla;

  const hayGrilla = detectarEncabezadoGrilla(lineas) !== null;
  const candidatos = [
    grilla,
    modoNumerado(lineas, esperado),
    hayGrilla ? null : modoLineaFinal(lineas),
    hayGrilla ? null : modoSecuencia(lineas, esperado),
  ].filter(Boolean);

  if (!candidatos.length) return null;

  const puntuar = (c) => {
    const exacto = c.valores.length === esperado ? 100 : 0;
    const distancia = -Math.abs(c.valores.length - esperado) * 5;
    const legibles = c.valores.filter((v) => v.valor !== null).length;
    return exacto + distancia + legibles + c.confianzaModo * 10;
  };
  return candidatos.sort((a, b) => puntuar(b) - puntuar(a))[0];
}

function limpiarNombre(bruto) {
  return bruto
    .replace(/\b(boleta|ficha|n[°ºo]\.?|nro\.?|#)\s*\d+\b/gi, "")
    .replace(/[|·•]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/[,;:.\-]+$/, "")
    .trim();
}

function pareceNombrePersona(texto) {
  const limpio = texto.trim();
  if (limpio.length < 4 || limpio.length > 60) return false;
  if (/\d/.test(limpio)) return false;
  if (/\bvs\.?\b|\s[-–]\s/i.test(limpio)) return false;
  const palabras = limpio.split(/\s+/);
  if (palabras.length < 2 || palabras.length > 5) return false;
  for (const p of palabras) if (PALABRAS_ESTRUCTURA.has(normalizar(p))) return false;
  return palabras.every((p) => /^[A-ZÁÉÍÓÚÑ][\wÀ-ÿ'.\-]*$/u.test(p) || p.length <= 3);
}

function detectarParticipante(lineas) {
  for (const linea of lineas) {
    const m = linea.texto.match(RE_NOMBRE_ETIQUETADO);
    if (m) {
      const nombre = limpiarNombre(m[1]);
      if (nombre.length >= 3 && /[a-zA-ZÁÉÍÓÚÑáéíóúñ]/.test(nombre)) {
        return { nombre, confianza: 0.96, evidencia: linea.texto };
      }
    }
  }
  for (const linea of lineas.slice(0, 8)) {
    const limpio = limpiarNombre(linea.texto);
    if (pareceNombrePersona(limpio)) return { nombre: limpio, confianza: 0.6, evidencia: linea.texto };
  }
  return { nombre: null, confianza: 0, evidencia: null };
}

function detectarNumero(lineas) {
  for (const linea of lineas) {
    const m = linea.texto.match(RE_NUMERO);
    if (m) return m[1];
  }
  return null;
}

function problema(codigo, severidad, mensaje, pagina, textoProblematico, partidoNumero) {
  return {
    codigo, severidad, mensaje,
    pagina: pagina === undefined ? null : pagina,
    textoProblematico: textoProblematico === undefined ? null : textoProblematico,
    partidoNumero: partidoNumero === undefined ? null : partidoNumero,
  };
}

function verificarOrdenPartidos(valores, partidos) {
  if (!partidos.length || valores.length !== partidos.length) return [];
  let comparables = 0, coincidencias = 0;
  for (let i = 0; i < valores.length; i++) {
    const evidencia = normalizar(valores[i].evidencia);
    if ((evidencia.match(/[a-z]/g) || []).length < 6) continue;
    comparables += 1;
    const local = normalizar(partidos[i].local);
    const visitante = normalizar(partidos[i].visitante);
    if ((local.length > 3 && evidencia.indexOf(local) >= 0) ||
        (visitante.length > 3 && evidencia.indexOf(visitante) >= 0)) coincidencias += 1;
  }
  if (comparables >= 3 && coincidencias / comparables < 0.5) {
    return [problema("PARTIDO_DESCONOCIDO", "aviso",
      `Los nombres de equipos leídos en la boleta coinciden con los partidos cargados en sólo ${coincidencias} de ${comparables} renglones. Verificá que el orden de los partidos sea el mismo.`,
      valores[0] ? valores[0].pagina : null,
      valores.slice(0, 3).map((v) => v.evidencia).join(" | "))];
  }
  return [];
}

function construirBoletaCruda(segmento, opciones) {
  const cantidadPartidos = opciones.cantidadPartidos;
  const lineas = segmento.lineas;
  const textoCrudo = lineas.map((l) => `[p.${l.pagina}] ${l.texto}`).join("\n");
  const problemas = [];

  const det = detectarParticipante(lineas);
  const numero = detectarNumero(lineas);
  const lectura = leerPronosticos(lineas, cantidadPartidos);

  if (!det.nombre) {
    problemas.push(problema("NOMBRE_NO_DETECTADO", "error",
      "No se pudo identificar el nombre del participante en esta boleta.",
      segmento.paginas[0] || null, lineas.slice(0, 3).map((l) => l.texto).join(" | ")));
  } else if (det.confianza < 0.8) {
    problemas.push(problema("NOMBRE_DUDOSO", "aviso",
      `El nombre "${det.nombre}" se dedujo de una línea sin etiqueta explícita. Confirmalo antes de publicar el ranking.`,
      segmento.paginas[0] || null, det.evidencia));
  }

  if (!numero) {
    problemas.push(problema("NUMERO_NO_DETECTADO", "aviso",
      "La boleta no declara un número identificatorio legible.", segmento.paginas[0] || null));
  }

  let valores = lectura ? lectura.valores : [];
  const cantidadLeida = valores.length;

  if (!lectura || !valores.length) {
    problemas.push(problema("SEGMENTO_SIN_DATOS", "error",
      "No se detectó ningún pronóstico legible en esta boleta.",
      segmento.paginas[0] || null, lineas.slice(0, 5).map((l) => l.texto).join(" | ")));
  } else if (valores.length !== cantidadPartidos) {
    problemas.push(problema("CANTIDAD_PRONOSTICOS", "error",
      `Se leyeron ${valores.length} pronósticos y la fecha tiene ${cantidadPartidos} partidos. No se puede saber a qué partido corresponde cada marca: hay que revisarla a mano.`,
      segmento.paginas[0] || null, valores.slice(0, 5).map((v) => v.evidencia).join(" | ")));
    valores = valores.slice(0, cantidadPartidos);
    while (valores.length < cantidadPartidos) {
      valores.push({ valor: null, evidencia: "(sin lectura)", pagina: null, confianza: 0, ambiguo: false });
    }
  }

  valores.forEach((v, i) => {
    if (v.ambiguo) {
      problemas.push(problema("PRONOSTICO_AMBIGUO", "error",
        `El partido ${i + 1} tiene más de una opción marcada. No se interpreta.`,
        v.pagina, v.evidencia, i + 1));
    } else if (v.valor === null && lectura) {
      problemas.push(problema("PRONOSTICO_FALTANTE", "error",
        `El partido ${i + 1} no tiene un pronóstico legible.`, v.pagina, v.evidencia, i + 1));
    }
  });

  if (lectura && valores.length === cantidadPartidos) {
    problemas.push.apply(problemas, verificarOrdenPartidos(valores, opciones.partidos));
  }

  return {
    participante: det.nombre,
    participanteConfianza: det.confianza,
    participanteEvidencia: det.evidencia,
    numeroBoleta: numero,
    paginas: segmento.paginas,
    valores, cantidadLeida, problemas, textoCrudo,
    metodo: lectura ? lectura.modo : "sin-lectura",
  };
}

function puntuarBoletas(boletas, esperado) {
  if (!boletas.length) return -1000;
  let puntaje = 0;
  for (const b of boletas) {
    const errores = b.problemas.filter((p) => p.severidad === "error").length;
    if (errores > 0) puntaje -= 10 + Math.min(errores, 4) * 2;

    if (b.cantidadLeida === esperado) puntaje += 8;
    else puntaje -= Math.min(8, Math.abs(b.cantidadLeida - esperado));

    const legibles = b.valores.filter((v) => v.valor !== null).length;
    puntaje += (legibles / Math.max(1, esperado)) * 4;

    if (b.participante) puntaje += b.participanteConfianza > 0.8 ? 3 : 1.5;
    else puntaje -= 3;
    if (b.numeroBoleta) puntaje += 1;

    // Red de seguridad: una boleta larga con un único valor repetido casi
    // siempre significa que se leyó la marca de la columna, no el pronóstico.
    const distintos = new Set(b.valores.map((v) => v.valor).filter((v) => v !== null));
    if (b.valores.length >= 6 && distintos.size === 1) puntaje -= 2.5;
  }
  return Math.round((puntaje / boletas.length) * 100) / 100;
}

function analizarDocumento(doc, opciones) {
  const estrategias = [];
  for (const ancla of ANCLAS) {
    const seg = segmentarPorAncla(doc, ancla.re);
    if (seg.length) estrategias.push({ nombre: ancla.nombre, segmentos: seg });
  }
  estrategias.push({ nombre: "una-boleta-por-pagina", segmentos: segmentarPorPagina(doc) });
  const col = segmentarPorColumnas(doc);
  if (col.length) estrategias.push({ nombre: "columnas", segmentos: col });
  const blo = segmentarPorBloques(doc);
  if (blo.length) estrategias.push({ nombre: "bloques", segmentos: blo });

  const evaluadas = [];
  for (const e of estrategias) {
    if (!e.segmentos.length) continue;
    const boletas = e.segmentos.map((s) => construirBoletaCruda(s, opciones));
    evaluadas.push({ nombre: e.nombre, boletas, puntaje: puntuarBoletas(boletas, opciones.cantidadPartidos) });
  }

  if (!evaluadas.length) {
    return { boletas: [], estrategia: "ninguna", puntaje: 0, estrategiasEvaluadas: [] };
  }

  evaluadas.sort((a, b) => b.puntaje - a.puntaje);
  const ganadora = evaluadas[0];
  return {
    boletas: ganadora.boletas,
    estrategia: ganadora.nombre,
    puntaje: ganadora.puntaje,
    estrategiasEvaluadas: evaluadas.map((e) => ({ nombre: e.nombre, boletas: e.boletas.length, puntaje: e.puntaje })),
  };
}

/* ==========================================================================
   4. ORQUESTADOR — duplicados, estados y progreso
   ========================================================================== */

function huellaPronosticos(boleta) {
  return boleta.pronosticos.map((p) => p.valor || "?").join("");
}

function detectarDuplicados(boletas) {
  const porNombre = new Map(), porNumero = new Map(), porContenido = new Map();

  for (const b of boletas) {
    const nombre = normalizar(b.participante || "");
    if (nombre) {
      if (!porNombre.has(nombre)) porNombre.set(nombre, []);
      porNombre.get(nombre).push(b);
    }
    if (b.numeroBoleta) {
      if (!porNumero.has(b.numeroBoleta)) porNumero.set(b.numeroBoleta, []);
      porNumero.get(b.numeroBoleta).push(b);
    }
    const clave = nombre + "|" + huellaPronosticos(b);
    if (!porContenido.has(clave)) porContenido.set(clave, []);
    porContenido.get(clave).push(b);
  }

  const paginasDe = (grupo) =>
    Array.from(new Set(grupo.reduce((a, b) => a.concat(b.paginas), []))).sort((a, b) => a - b).join(", ");

  porNombre.forEach((grupo, nombre) => {
    if (grupo.length < 2) return;
    for (const b of grupo) {
      b.problemas.push(problema("DUPLICADO_PARTICIPANTE", "error",
        `El participante "${b.participante}" aparece en ${grupo.length} boletas (páginas ${paginasDe(grupo)}). Confirmá cuál vale antes de publicar el ranking.`,
        b.paginas[0] || null, nombre));
    }
  });

  porNumero.forEach((grupo, numero) => {
    if (grupo.length < 2) return;
    for (const b of grupo) {
      b.problemas.push(problema("DUPLICADO_NUMERO", "aviso",
        `El número de boleta #${numero} está repetido en ${grupo.length} boletas.`,
        b.paginas[0] || null, "#" + numero));
    }
  });

  porContenido.forEach((grupo) => {
    if (grupo.length < 2) return;
    for (const b of grupo) {
      b.problemas.push(problema("DUPLICADO_BOLETA", "error",
        `Boleta idéntica (mismo participante y mismos pronósticos) repetida ${grupo.length} veces en las páginas ${paginasDe(grupo)}. Podría ser una hoja escaneada dos veces.`,
        b.paginas[0] || null, huellaPronosticos(b)));
    }
  });
}

function recalcularEstado(boleta) {
  if (boleta.estado === "resuelta_manual") return;
  boleta.estado = boleta.problemas.some((p) => p.severidad === "error") ? "revision" : "ok";
}

class ErrorProcesamiento extends Error {
  constructor(mensaje) { super(mensaje); this.name = "ErrorProcesamiento"; }
}

async function procesarPdf(datos, nombreArchivo, fecha, onProgreso) {
  const inicio = Date.now();
  const problemasGlobales = [];

  onProgreso({ etapa: "leyendo", mensaje: "Abriendo el PDF…", porcentaje: 4 });

  const doc = await extraerDocumento(datos, (pagina, total) => {
    onProgreso({
      etapa: "extrayendo", mensaje: "Extrayendo el texto del PDF…",
      porcentaje: 5 + Math.round((pagina / Math.max(1, total)) * 45),
      detalle: `Página ${pagina} de ${total}`,
    });
  });

  if (!doc.tieneCapaTexto) {
    // PDF escaneado: se corta acá a propósito. Adivinar con un OCR no
    // verificado violaría la regla de precisión.
    throw new ErrorProcesamiento(
      "El PDF no tiene capa de texto: parece un escaneo o una foto. El sistema no interpreta imágenes, porque una lectura por OCR sin verificar podría asignar pronósticos equivocados. Volvé a exportar el PDF desde el programa que genera las boletas (no escaneado), o cargá las boletas a mano.",
    );
  }

  if (doc.paginasSinTexto.length) {
    problemasGlobales.push(problema("SIN_CAPA_TEXTO", "aviso",
      `Las páginas ${doc.paginasSinTexto.join(", ")} no tienen texto legible (podrían ser imágenes o estar en blanco). No se extrajo ninguna boleta de ellas.`,
      doc.paginasSinTexto[0]));
  }

  onProgreso({
    etapa: "detectando", mensaje: "Detectando las boletas dentro del documento…", porcentaje: 55,
    detalle: `${doc.paginas.length} páginas, ${doc.totalCaracteres} caracteres`,
  });
  await new Promise((r) => setTimeout(r, 0));

  const analisis = analizarDocumento(doc, {
    cantidadPartidos: fecha.cantidadPartidos,
    partidos: fecha.partidos,
  });

  onProgreso({
    etapa: "participantes", mensaje: "Identificando participantes…", porcentaje: 68,
    detalle: `${analisis.boletas.length} boletas con la estrategia "${analisis.estrategia}"`,
  });
  await new Promise((r) => setTimeout(r, 0));

  onProgreso({ etapa: "pronosticos", mensaje: "Extrayendo pronósticos…", porcentaje: 78 });
  await new Promise((r) => setTimeout(r, 0));

  const ahora = new Date().toISOString();
  const boletas = analisis.boletas.map((c) => ({
    id: nuevoId(),
    fechaId: fecha.id,
    participante: c.participante,
    participanteConfianza: c.participanteConfianza,
    participanteEvidencia: c.participanteEvidencia,
    numeroBoleta: c.numeroBoleta,
    paginas: c.paginas,
    pronosticos: c.valores.map((v, i) => ({
      partidoNumero: i + 1, valor: v.valor, origen: "pdf",
      confianza: v.confianza, evidencia: v.evidencia, pagina: v.pagina,
    })),
    problemas: c.problemas.slice(),
    estado: "ok",
    textoCrudo: c.textoCrudo,
    origen: "pdf",
    editadaManualmente: false,
    metodoDeteccion: c.metodo,
    creadaEn: ahora,
  }));

  onProgreso({ etapa: "validando", mensaje: "Validando la información leída…", porcentaje: 87 });
  await new Promise((r) => setTimeout(r, 0));
  onProgreso({ etapa: "duplicados", mensaje: "Buscando duplicados…", porcentaje: 93 });
  await new Promise((r) => setTimeout(r, 0));

  detectarDuplicados(boletas);
  boletas.forEach(recalcularEstado);

  if (!boletas.length) {
    throw new ErrorProcesamiento(
      "No se reconoció ninguna boleta en el PDF. Revisá que el archivo sea el de boletas y que la cantidad de partidos de la fecha coincida con la de las boletas.",
    );
  }

  const diagnostico = {
    nombreArchivo,
    bytes: datos.byteLength,
    paginas: doc.paginas.length,
    paginasConTexto: doc.paginasConTexto,
    paginasSinTexto: doc.paginasSinTexto,
    caracteresExtraidos: doc.totalCaracteres,
    tieneCapaTexto: true,
    metodo: "texto",
    estrategiaSegmentacion: analisis.estrategia,
    puntajeEstrategia: analisis.puntaje,
    estrategiasEvaluadas: analisis.estrategiasEvaluadas,
    procesadoEn: ahora,
    milisegundos: Date.now() - inicio,
  };

  onProgreso({ etapa: "listo", mensaje: "Listo", porcentaje: 100, detalle: `${boletas.length} boletas procesadas` });

  return { boletas, diagnostico, problemasGlobales };
}

/**
 * Retira los problemas que la edición manual dejó sin efecto.
 * Sólo los verificablemente falsos tras el cambio. Los que requieren decisión
 * humana (duplicados) NO se tocan: siguen bloqueando hasta darlos por revisados.
 */
function depurarProblemasResueltos(boleta) {
  const valorDe = (n) => {
    const p = boleta.pronosticos.find((x) => x.partidoNumero === n);
    return p ? p.valor : null;
  };
  const completa = boleta.pronosticos.length > 0 && boleta.pronosticos.every((p) => p.valor !== null);

  boleta.problemas = boleta.problemas.filter((pr) => {
    switch (pr.codigo) {
      case "PRONOSTICO_AMBIGUO":
      case "PRONOSTICO_FALTANTE":
        return !(pr.partidoNumero !== null && valorDe(pr.partidoNumero) !== null);
      case "CANTIDAD_PRONOSTICOS":
      case "BOLETA_INCOMPLETA":
      case "SEGMENTO_SIN_DATOS":
        return !completa;
      case "NOMBRE_NO_DETECTADO":
      case "NOMBRE_DUDOSO":
        return boleta.participante === null;
      case "NUMERO_NO_DETECTADO":
        return boleta.numeroBoleta === null;
      default:
        return true;
    }
  });
}

/* ==========================================================================
   5. ALMACENAMIENTO — navegador
   Todo queda en este navegador. Ningún dato de participantes viaja a ningún
   servidor: no hay servidor.
   ========================================================================== */

const CLAVE_ALMACEN = "prode:datos:v1";

const Almacen = {
  leer() {
    try {
      const crudo = localStorage.getItem(CLAVE_ALMACEN);
      if (!crudo) return { fechas: [], boletas: {}, demoBorrada: false };
      const d = JSON.parse(crudo);
      return {
        fechas: d.fechas || [],
        boletas: d.boletas || {},
        demoBorrada: !!d.demoBorrada,
      };
    } catch {
      return { fechas: [], boletas: {}, demoBorrada: false };
    }
  },
  escribir(datos) {
    try {
      localStorage.setItem(CLAVE_ALMACEN, JSON.stringify(datos));
      return { ok: true };
    } catch (e) {
      // Cuota llena: es el único fallo realista y hay que decirlo, no callarlo.
      return {
        ok: false,
        error: "No se pudo guardar en este navegador (probablemente se llenó el espacio disponible). Exportá los resultados y borrá alguna fecha vieja desde el Historial.",
      };
    }
  },
  disponible() {
    try {
      const k = "__prode_test__";
      localStorage.setItem(k, "1");
      localStorage.removeItem(k);
      return true;
    } catch { return false; }
  },
  espacioUsado() {
    try {
      const crudo = localStorage.getItem(CLAVE_ALMACEN) || "";
      return Math.round((crudo.length / 1024) * 10) / 10;
    } catch { return 0; }
  },
};

/* ==========================================================================
   6. EXPORTACIÓN — CSV y Excel (.xlsx real, sin librerías)
   ========================================================================== */

const SEP = ";";

function celdaCsv(valor) {
  const s = valor === null || valor === undefined ? "" : String(valor);
  return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function simboloEstado(estado) {
  if (estado === "acierto") return "ACIERTO";
  if (estado === "error") return "ERROR";
  if (estado === "sin_pronostico") return "SIN PRONOSTICO";
  return "SIN RESULTADO";
}

function estadoLegible(fila) {
  if (fila.estado === "revision") return "REQUIERE REVISION MANUAL";
  if (fila.estado === "resuelta_manual") return "Revisada a mano";
  return "OK";
}

function filasOrdenadas(correccion) {
  return correccion.ranking.map((r) => ({ posicion: String(r.posicion), fila: r }))
    .concat(correccion.enRevision.map((f) => ({ posicion: "-", fila: f })));
}

function nombreArchivoExport(correccion, extension) {
  const base = correccion.fecha.nombre
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase();
  return "prode-" + (base || "fecha") + "." + extension;
}

function aCsv(correccion) {
  const fecha = correccion.fecha, resumen = correccion.resumen;
  const l = [];

  l.push(["PRODE - RESULTADOS", fecha.nombre].map(celdaCsv).join(SEP));
  if (fecha.esDemo) l.push(celdaCsv("*** DATOS DE DEMOSTRACION - NO SON REALES ***"));
  l.push(["Generado", new Date().toLocaleString("es-AR")].map(celdaCsv).join(SEP));
  l.push(["Boletas", resumen.boletasTotales, "En revision", resumen.boletasEnRevision].map(celdaCsv).join(SEP));
  l.push("");

  l.push(celdaCsv("RESULTADOS OFICIALES"));
  l.push(["Partido", "Local", "Visitante", "Resultado"].map(celdaCsv).join(SEP));
  for (const p of fecha.partidos) {
    l.push([p.numero, p.local, p.visitante, p.resultado || "SIN CARGAR"].map(celdaCsv).join(SEP));
  }
  l.push("");

  l.push(celdaCsv("RANKING"));
  l.push(["Posicion", "Participante", "Boleta", "Aciertos", "Errores", "Sin pronostico",
    "Porcentaje", "Estado", "Paginas del PDF"]
    .concat(fecha.partidos.map((p) => `P${p.numero} ${p.local} vs ${p.visitante}`))
    .map(celdaCsv).join(SEP));

  for (const item of filasOrdenadas(correccion)) {
    const f = item.fila;
    const base = [item.posicion, f.participante || "(sin nombre)", f.numeroBoleta || "",
      f.aciertos, f.errores, f.sinPronostico, f.porcentaje + "%", estadoLegible(f), f.paginas.join(" ")];
    const detalle = f.detalle.map((d) =>
      (d.pronostico || "-") + " / " + (d.resultado || "-") + " / " + simboloEstado(d.estado));
    l.push(base.concat(detalle).map(celdaCsv).join(SEP));
  }

  if (correccion.enRevision.length) {
    l.push("");
    l.push(celdaCsv("BOLETAS QUE REQUIEREN REVISION MANUAL"));
    l.push(["Boleta", "Participante", "Pagina", "Problema", "Detalle"].map(celdaCsv).join(SEP));
    for (const f of correccion.enRevision) {
      for (const p of f.problemas) {
        l.push([f.numeroBoleta || "", f.participante || "(sin nombre)", p.pagina || "", p.codigo, p.mensaje]
          .map(celdaCsv).join(SEP));
      }
    }
  }

  // BOM para que Excel detecte UTF-8.
  return "﻿" + l.join("\r\n") + "\r\n";
}

/* ---- Escritor de ZIP mínimo (sin compresión) para generar .xlsx real ---- */

const TABLA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = TABLA_CRC[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function crearZip(archivos) {
  const codificador = new TextEncoder();
  const partes = [];
  const entradas = [];
  let desplazamiento = 0;

  const u16 = (v) => [v & 0xff, (v >>> 8) & 0xff];
  const u32 = (v) => [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff];

  for (const archivo of archivos) {
    const nombre = codificador.encode(archivo.nombre);
    const datos = codificador.encode(archivo.contenido);
    const crc = crc32(datos);

    const cabecera = [].concat(
      u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0),
      u32(crc), u32(datos.length), u32(datos.length),
      u16(nombre.length), u16(0),
    );
    partes.push(new Uint8Array(cabecera), nombre, datos);
    entradas.push({ nombre, crc, tam: datos.length, desplazamiento });
    desplazamiento += cabecera.length + nombre.length + datos.length;
  }

  const inicioCentral = desplazamiento;
  let tamCentral = 0;
  for (const e of entradas) {
    const central = [].concat(
      u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0),
      u32(e.crc), u32(e.tam), u32(e.tam),
      u16(e.nombre.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(e.desplazamiento),
    );
    partes.push(new Uint8Array(central), e.nombre);
    tamCentral += central.length + e.nombre.length;
  }

  partes.push(new Uint8Array([].concat(
    u32(0x06054b50), u16(0), u16(0),
    u16(entradas.length), u16(entradas.length),
    u32(tamCentral), u32(inicioCentral), u16(0),
  )));

  let total = 0;
  for (const p of partes) total += p.length;
  const salida = new Uint8Array(total);
  let pos = 0;
  for (const p of partes) { salida.set(p, pos); pos += p.length; }
  return salida;
}

function xmlEscapar(v) {
  return String(v == null ? "" : v)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&apos;")
    // Caracteres de control que invalidarían el XML
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
}

function letraColumna(n) {
  let s = "";
  while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

/** estilo: 0 normal, 1 negrita, 2 encabezado oscuro, 3 verde, 4 rojo, 5 gris */
function celdaXml(fila, columna, valor, estilo) {
  const ref = letraColumna(columna) + fila;
  const s = estilo ? ` s="${estilo}"` : "";
  if (typeof valor === "number" && isFinite(valor)) {
    return `<c r="${ref}"${s}><v>${valor}</v></c>`;
  }
  const texto = valor == null ? "" : String(valor);
  if (texto === "") return `<c r="${ref}"${s}/>`;
  return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${xmlEscapar(texto)}</t></is></c>`;
}

function hojaXml(filas) {
  let xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>';
  filas.forEach((celdas, i) => {
    const n = i + 1;
    xml += `<row r="${n}">`;
    celdas.forEach((c, j) => {
      if (c === null || c === undefined) return;
      const valor = (c && typeof c === "object" && "v" in c) ? c.v : c;
      const estilo = (c && typeof c === "object" && "s" in c) ? c.s : 0;
      xml += celdaXml(n, j + 1, valor, estilo);
    });
    xml += "</row>";
  });
  return xml + "</sheetData></worksheet>";
}

const ESTILOS_XLSX = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
  '<fonts count="3">' +
    '<font><sz val="11"/><name val="Calibri"/></font>' +
    '<font><b/><sz val="11"/><name val="Calibri"/></font>' +
    '<font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Calibri"/></font>' +
  '</fonts>' +
  '<fills count="6">' +
    '<fill><patternFill patternType="none"/></fill>' +
    '<fill><patternFill patternType="gray125"/></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FF1E293B"/><bgColor indexed="64"/></patternFill></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FFDCFCE7"/><bgColor indexed="64"/></patternFill></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FFFEE2E2"/><bgColor indexed="64"/></patternFill></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FFF1F5F9"/><bgColor indexed="64"/></patternFill></fill>' +
  '</fills>' +
  '<borders count="1"><border/></borders>' +
  '<cellStyleXfs count="1"><xf/></cellStyleXfs>' +
  '<cellXfs count="6">' +
    '<xf xfId="0"/>' +
    '<xf xfId="0" fontId="1" applyFont="1"/>' +
    '<xf xfId="0" fontId="2" fillId="2" applyFont="1" applyFill="1"/>' +
    '<xf xfId="0" fillId="3" applyFill="1"/>' +
    '<xf xfId="0" fillId="4" applyFill="1"/>' +
    '<xf xfId="0" fillId="5" applyFill="1"/>' +
  '</cellXfs></styleSheet>';

function aXlsx(correccion) {
  const fecha = correccion.fecha;

  /* Hoja 1: ranking */
  const hoja1 = [];
  hoja1.push([{ v: "PRODE — " + fecha.nombre, s: 1 }]);
  if (fecha.esDemo) hoja1.push([{ v: "DATOS DE DEMOSTRACIÓN — no son datos reales", s: 1 }]);
  hoja1.push(["Generado el " + new Date().toLocaleString("es-AR")]);
  hoja1.push([]);

  const encabezado = ["Posición", "Participante", "Boleta", "Aciertos", "Errores",
    "Sin pronóstico", "Porcentaje", "Estado", "Páginas del PDF"]
    .concat(fecha.partidos.map((p) => `P${p.numero} ${p.local} vs ${p.visitante}`));
  hoja1.push(encabezado.map((t) => ({ v: t, s: 2 })));

  hoja1.push([null, { v: "RESULTADO OFICIAL", s: 1 }, null, null, null, null, null, null, null]
    .concat(fecha.partidos.map((p) => ({ v: p.resultado || "sin cargar", s: 1 }))));

  for (const item of filasOrdenadas(correccion)) {
    const f = item.fila;
    hoja1.push([item.posicion, f.participante || "(sin nombre)", f.numeroBoleta || "",
      f.aciertos, f.errores, f.sinPronostico, f.porcentaje + "%", estadoLegible(f), f.paginas.join(", ")]
      .concat(f.detalle.map((d) => ({
        v: d.pronostico || "—",
        s: d.estado === "acierto" ? 3 : d.estado === "error" ? 4 : 5,
      }))));
  }

  /* Hoja 2: detalle por partido */
  const hoja2 = [["Participante", "Boleta", "Partido", "Local", "Visitante", "Pronóstico",
    "Resultado oficial", "Estado", "Evidencia leída del PDF"].map((t) => ({ v: t, s: 2 }))];
  for (const f of correccion.filas) {
    for (const d of f.detalle) {
      hoja2.push([f.participante || "(sin nombre)", f.numeroBoleta || "", d.partidoNumero,
        d.local, d.visitante, d.pronostico || "—", d.resultado || "—",
        simboloEstado(d.estado), d.evidencia]);
    }
  }

  /* Hoja 3: revisión */
  const hoja3 = [["Boleta", "Participante", "Página del PDF", "Código", "Severidad",
    "Problema", "Información problemática"].map((t) => ({ v: t, s: 2 }))];
  for (const f of correccion.filas) {
    for (const p of f.problemas) {
      hoja3.push([f.numeroBoleta || "", f.participante || "(sin nombre)", p.pagina || "",
        p.codigo, p.severidad, p.mensaje, p.textoProblematico || ""]);
    }
  }

  const nombres = ["Ranking", "Detalle por partido", "Requieren revisión"];
  const archivos = [
    {
      nombre: "[Content_Types].xml",
      contenido: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
        '<Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
        '<Override PartName="/xl/worksheets/sheet3.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
        '</Types>',
    },
    {
      nombre: "_rels/.rels",
      contenido: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
        '</Relationships>',
    },
    {
      nombre: "xl/workbook.xml",
      contenido: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
        nombres.map((n, i) => `<sheet name="${xmlEscapar(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("") +
        '</sheets></workbook>',
    },
    {
      nombre: "xl/_rels/workbook.xml.rels",
      contenido: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        nombres.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("") +
        `<Relationship Id="rId${nombres.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
        '</Relationships>',
    },
    { nombre: "xl/styles.xml", contenido: ESTILOS_XLSX },
    { nombre: "xl/worksheets/sheet1.xml", contenido: hojaXml(hoja1) },
    { nombre: "xl/worksheets/sheet2.xml", contenido: hojaXml(hoja2) },
    { nombre: "xl/worksheets/sheet3.xml", contenido: hojaXml(hoja3) },
  ];

  return crearZip(archivos);
}

function descargar(nombre, contenido, tipo) {
  const blob = contenido instanceof Uint8Array
    ? new Blob([contenido], { type: tipo })
    : new Blob([contenido], { type: tipo });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function base64ABytes(b64) {
  const binario = atob(b64.replace(/\s+/g, ""));
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return bytes;
}
