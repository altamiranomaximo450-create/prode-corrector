/* ==========================================================================
   INTERFAZ — panel de administración
   ========================================================================== */

/* ---------------------------------------------------------------- iconos */

function icono(d, clase) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
    stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"${clase ? ` class="${clase}"` : ""}><path d="${d}"/></svg>`;
}

const ICO = {
  panel: "M4 5h7v6H4zM13 5h7v3h-7zM13 10h7v9h-7zM4 13h7v6H4z",
  mas: "M12 5v14M5 12h14",
  boletas: "M7 4h10a1 1 0 0 1 1 1v15l-3-2-3 2-3-2-3 2V5a1 1 0 0 1 1-1zM9 9h6M9 13h6",
  resultados: "M4 6h16M4 12h16M4 18h10M18 15l2 2 3-3",
  ranking: "M6 20V10M12 20V4M18 20v-7",
  trofeo: "M8 4h8v5a4 4 0 0 1-8 0V4zM8 5H5v2a3 3 0 0 0 3 3M16 5h3v2a3 3 0 0 1-3 3M10 17h4M9 20h6M12 13v4",
  historial: "M3 12a9 9 0 1 0 3-6.7M3 4v4h4M12 7v5l3 2",
  ajustes: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2v.2a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-3-1.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0-1.2-2.9H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.3-3l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0 1.2 2.9H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z",
  alerta: "M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z",
  ok: "M20 6 9 17l-5-5",
  equis: "M18 6 6 18M6 6l12 12",
  descargar: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3",
  subir: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12",
  buscar: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3",
  ojo: "M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  refrescar: "M3 12a9 9 0 0 1 15.5-6.2M21 12a9 9 0 0 1-15.5 6.2M21 3v6h-6M3 21v-6h6",
  basura: "M4 7h16M10 11v6M14 11v6M5 7l1 13a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1l1-13M9 7V4h6v3",
  documento: "M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5",
  lupa: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3M8 11h6",
  menu: "M4 6h16M4 12h16M4 18h16",
};

const MEDALLAS = { 1: "🥇", 2: "🥈", 3: "🥉" };

const EXPLICACION_PROBLEMA = {
  SIN_CAPA_TEXTO: "La página no tiene texto legible (probablemente sea una imagen escaneada).",
  NOMBRE_NO_DETECTADO: "No se encontró el nombre del participante.",
  NOMBRE_DUDOSO: "El nombre se dedujo sin una etiqueta clara en la boleta.",
  NUMERO_NO_DETECTADO: "La boleta no declara un número identificatorio.",
  CANTIDAD_PRONOSTICOS: "La cantidad de pronósticos leídos no coincide con los partidos.",
  PRONOSTICO_AMBIGUO: "Hay más de una opción marcada en el mismo partido.",
  PRONOSTICO_FALTANTE: "Falta el pronóstico de un partido.",
  PARTIDO_DESCONOCIDO: "Los equipos leídos no coinciden con los partidos cargados.",
  BOLETA_INCOMPLETA: "La boleta está incompleta.",
  DUPLICADO_BOLETA: "Hay otra boleta idéntica.",
  DUPLICADO_PARTICIPANTE: "El participante aparece en más de una boleta.",
  DUPLICADO_NUMERO: "El número de boleta está repetido.",
  SEGMENTO_SIN_DATOS: "No se detectó ningún pronóstico en este bloque del PDF.",
  RESULTADO_OFICIAL_FALTANTE: "Falta cargar el resultado oficial de un partido.",
};

const ETAPAS = [
  { clave: "leyendo", texto: "Analizando el PDF" },
  { clave: "extrayendo", texto: "Extrayendo el texto" },
  { clave: "detectando", texto: "Detectando boletas" },
  { clave: "participantes", texto: "Identificando participantes" },
  { clave: "pronosticos", texto: "Extrayendo pronósticos" },
  { clave: "validando", texto: "Validando la información" },
  { clave: "duplicados", texto: "Buscando duplicados" },
  { clave: "listo", texto: "Calculando el ranking" },
];

const NAVEGACION = [
  { vista: "dashboard", texto: "Dashboard", icono: ICO.panel },
  { vista: "nueva-fecha", texto: "Nueva fecha", icono: ICO.mas },
  { vista: "boletas", texto: "Boletas", icono: ICO.boletas, necesitaFecha: true },
  { vista: "resultados", texto: "Resultados", icono: ICO.resultados, necesitaFecha: true },
  { vista: "ranking", texto: "Ranking", icono: ICO.ranking, necesitaFecha: true },
  { vista: "ganadores", texto: "Ganadores", icono: ICO.trofeo, necesitaFecha: true },
  { vista: "revision", texto: "Revisión", icono: ICO.alerta, necesitaFecha: true },
  { vista: "historial", texto: "Historial", icono: ICO.historial },
  { vista: "configuracion", texto: "Configuración", icono: ICO.ajustes },
];

/* ------------------------------------------------------------------ estado */

const App = {
  datos: { fechas: [], boletas: {}, demoBorrada: false },
  fechaActivaId: null,
  vista: "dashboard",
  menuAbierto: false,
  modal: null,
  aviso: null,
  formNueva: null,
  formResultados: null,
  filtroBoletas: "todas",
  busqueda: "",
};

function fechaActiva() {
  return App.datos.fechas.find((f) => f.id === App.fechaActivaId) || null;
}

function boletasDe(fechaId) {
  return App.datos.boletas[fechaId] || [];
}

function correccionActiva() {
  const f = fechaActiva();
  if (!f) return null;
  return corregirFecha(f, boletasDe(f.id));
}

function guardar() {
  const r = Almacen.escribir(App.datos);
  if (!r.ok) App.aviso = { tipo: "error", texto: r.error };
  return r.ok;
}

function seleccionarFecha(id) {
  App.fechaActivaId = id;
  try { localStorage.setItem("prode:fecha-activa", id || ""); } catch { /* nada */ }
}

function cargarInicial() {
  App.datos = Almacen.leer();

  // Siembra de la demo: sólo si no hay nada y el usuario no la borró a mano.
  if (!App.datos.fechas.length && !App.datos.demoBorrada) {
    for (const bloque of construirDemo()) {
      App.datos.fechas.push(bloque.fecha);
      App.datos.boletas[bloque.fecha.id] = bloque.boletas;
    }
    guardar();
  }

  let guardada = null;
  try { guardada = localStorage.getItem("prode:fecha-activa"); } catch { /* nada */ }
  if (guardada && App.datos.fechas.some((f) => f.id === guardada)) {
    App.fechaActivaId = guardada;
  } else {
    const real = App.datos.fechas.find((f) => !f.esDemo);
    App.fechaActivaId = (real || App.datos.fechas[0] || {}).id || null;
  }
}

/* -------------------------------------------------------------- fragmentos */

function insigniaEstado(estado) {
  if (estado === "revision") return `<span class="insignia i-error">${icono(ICO.alerta)}Requiere revisión</span>`;
  if (estado === "resuelta_manual") return `<span class="insignia i-alerta">${icono(ICO.ok)}Revisada a mano</span>`;
  return `<span class="insignia i-ok">${icono(ICO.ok)}OK</span>`;
}

function marcaPron(valor, tono, titulo) {
  const t = tono ? " " + tono : "";
  const tt = titulo ? ` title="${escaparHtml(titulo)}"` : "";
  return `<span class="marca-pron${t}"${tt}>${valor || "—"}</span>`;
}

function tonoDetalle(estado) {
  if (estado === "acierto") return "acierto";
  if (estado === "error") return "error";
  return "vacio";
}

function metrica(titulo, valor, detalle, tono) {
  return `<div class="metrica">
    <p class="metrica-titulo">${escaparHtml(titulo)}</p>
    <p class="metrica-valor num ${tono ? "tono-" + tono : ""}">${valor}</p>
    ${detalle ? `<p class="metrica-detalle">${escaparHtml(detalle)}</p>` : ""}
  </div>`;
}

function vacio(titulo, descripcion, extra) {
  return `<div class="vacio">
    <div class="vacio-icono">${icono(ICO.documento)}</div>
    <strong>${escaparHtml(titulo)}</strong>
    ${descripcion ? `<p>${escaparHtml(descripcion)}</p>` : ""}
    ${extra || ""}
  </div>`;
}

function avisoHtml(tipo, texto) {
  const clase = { info: "a-info", alerta: "a-alerta", error: "a-error", demo: "a-demo" }[tipo] || "a-info";
  const ic = tipo === "info" ? ICO.lupa : tipo === "ok" ? ICO.ok : ICO.alerta;
  return `<div class="aviso ${clase}">${icono(ic)}<div>${texto}</div></div>`;
}

function encabezado(titulo, descripcion, acciones) {
  return `<div class="encabezado">
    <div>
      <h1>${titulo}</h1>
      ${descripcion ? `<p>${escaparHtml(descripcion)}</p>` : ""}
    </div>
    ${acciones ? `<div class="acciones">${acciones}</div>` : ""}
  </div>`;
}

function selectorResultado(indice, valor, prefijo) {
  const ops = [["1", "LOCAL"], ["X", "EMPATE"], ["2", "VISITANTE"]];
  return `<div class="opciones" role="group" aria-label="Resultado del partido ${indice + 1}">
    ${ops.map((o) => `<button type="button" class="opcion${valor === o[0] ? " activa" : ""}"
      aria-pressed="${valor === o[0]}" data-accion="${prefijo}" data-indice="${indice}" data-valor="${o[0]}">
      <span class="simbolo">${o[0]}</span><span class="palabra">${o[1]}</span></button>`).join("")}
    ${valor ? `<button type="button" class="borrar-op" data-accion="${prefijo}" data-indice="${indice}" data-valor="">borrar</button>` : ""}
  </div>`;
}

/* ------------------------------------------------------------------ vistas */

function vistaDashboard() {
  const correccion = correccionActiva();
  if (!App.datos.fechas.length) {
    return encabezado("Dashboard") + `<div class="tarjeta">` +
      vacio("Todavía no hay ninguna fecha cargada",
        "Creá una fecha, cargá los partidos y subí el PDF con las boletas para empezar.",
        `<button class="boton primario" data-ir="nueva-fecha">${icono(ICO.mas)}Crear la primera fecha</button>`) +
      `</div>`;
  }
  if (!correccion) return `<div class="cargando">Elegí una fecha en el menú lateral.</div>`;

  const f = correccion.fecha, r = correccion.resumen;
  const procesadas = r.boletasOk + r.boletasResueltasManualmente;

  let html = encabezado(escaparHtml(f.nombre),
    `${f.cantidadPartidos} partidos · creada el ${fechaHora(f.creadaEn)} · última actualización ${fechaHora(f.actualizadaEn)}`,
    `<button class="boton secundario" data-ir="resultados">${icono(ICO.resultados)}Resultados oficiales</button>
     <button class="boton primario" data-ir="ranking">${icono(ICO.ranking)}Ver ranking</button>`);

  html += `<div class="bloque-avisos">`;
  if (f.esDemo) {
    html += avisoHtml("demo", "<strong>Datos de demostración.</strong> Los participantes y pronósticos de esta fecha son ficticios y sirven para mostrar cómo se ve el sistema con información cargada. Cuando proceses un PDF real, hacelo sobre una fecha nueva: las de demostración no se mezclan con las reales, y podés borrarlas desde Configuración.");
  }
  for (const a of correccion.advertencias) html += avisoHtml("alerta", escaparHtml(a));
  html += `</div>`;

  html += `<div class="rejilla c4">
    ${metrica("Boletas recibidas", r.boletasTotales, `${r.participantes} participantes distintos`)}
    ${metrica("Procesadas sin problemas", procesadas, r.boletasResueltasManualmente > 0 ? `${r.boletasResueltasManualmente} resueltas a mano` : "Listas para el ranking", "ok")}
    ${metrica("Requieren revisión", r.boletasEnRevision, r.boletasEnRevision > 0 ? "No entran al ranking hasta resolverse" : "Ninguna boleta pendiente", r.boletasEnRevision > 0 ? "error" : "ok")}
    ${metrica("Resultados oficiales", `${r.partidosConResultado}/${f.cantidadPartidos}`, r.partidosSinResultado > 0 ? `Faltan ${r.partidosSinResultado} partidos` : "Todos cargados", r.partidosSinResultado > 0 ? "alerta" : "ok")}
  </div>`;

  html += `<div class="rejilla c3" style="margin-top:16px">
    ${metrica("Máximo de aciertos", r.maximoAciertos === null ? "—" : r.maximoAciertos, `sobre ${r.partidosConResultado} partidos con resultado`, "ok")}
    ${metrica("Promedio de aciertos", r.promedioAciertos === null ? "—" : r.promedioAciertos, "entre las boletas que entran al ranking")}
    ${metrica("Mínimo de aciertos", r.minimoAciertos === null ? "—" : r.minimoAciertos, "entre las boletas que entran al ranking")}
  </div>`;

  html += `<div class="tarjeta" style="margin-top:24px">
    <div class="tarjeta-cabecera"><h2>🏆 Top 3</h2>
      <button class="boton sutil chico" data-ir="ganadores">Ver ganadores</button></div>`;
  if (!correccion.top3.length) {
    html += vacio("Todavía no hay podio", "Hacen falta boletas válidas y al menos un resultado oficial cargado.");
  } else {
    html += `<ul class="lista-limpia">` + correccion.top3.map((g) => `<li><div class="item-top">
      <span class="medalla">${MEDALLAS[g.puesto]}</span>
      <div class="datos">
        <strong>${g.participantes.map((p) => escaparHtml(p.participante || "(sin nombre)")).join(" · ")}</strong>
        <span>${g.participantes.map((p) => p.numeroBoleta ? "#" + escaparHtml(p.numeroBoleta) : "sin número").join(" · ")}
        ${g.empate ? `<strong style="color:var(--ambar-700)"> · empate en el puesto ${g.puesto}</strong>` : ""}</span>
      </div>
      <span class="puntos num">${g.aciertos}<small>/${r.partidosConResultado}</small></span>
    </div></li>`).join("") + `</ul>`;
  }
  html += `</div>`;

  if (f.diagnostico) {
    const d = f.diagnostico;
    html += `<div class="tarjeta" style="margin-top:24px">
      <div class="tarjeta-cabecera"><h2>Procesamiento del PDF</h2>
        <span class="insignia i-neutra">${escaparHtml(d.nombreArchivo)}</span></div>
      <div class="tarjeta-cuerpo"><dl class="datos c4">
        <div><dt>Páginas</dt><dd class="num">${d.paginas}</dd></div>
        <div><dt>Páginas sin texto</dt><dd class="num">${d.paginasSinTexto.length}</dd></div>
        <div><dt>Estrategia de lectura</dt><dd>${escaparHtml(d.estrategiaSegmentacion)}</dd></div>
        <div><dt>Tiempo</dt><dd class="num">${d.milisegundos} ms</dd></div>
      </dl></div></div>`;
  }
  return html;
}

function vistaNuevaFecha() {
  if (!App.formNueva) {
    App.formNueva = {
      nombre: "",
      cantidad: 10,
      partidos: Array.from({ length: 10 }, () => ({ local: "", visitante: "", resultado: null })),
      archivo: null,
      procesando: false,
      progreso: null,
      etapasHechas: [],
      error: null,
    };
  }
  const s = App.formNueva;

  let html = encabezado("Nueva fecha",
    "Cargá los partidos de la fecha y, si ya lo tenés, el PDF con las boletas. Los resultados oficiales se pueden cargar ahora o después.");

  html += `<div class="tarjeta">
    <div class="tarjeta-cabecera"><h2>1 · Datos de la fecha</h2></div>
    <div class="tarjeta-cuerpo"><div class="rejilla c3">
      <div style="grid-column:span 2">
        <label class="etiqueta" for="nf-nombre">Nombre o número de la fecha</label>
        <input id="nf-nombre" class="campo" data-campo="nombre" value="${escaparHtml(s.nombre)}"
          placeholder="Ej.: Fecha 13 — Torneo Apertura"${s.procesando ? " disabled" : ""}>
      </div>
      <div>
        <label class="etiqueta" for="nf-cantidad">Cantidad de partidos</label>
        <input id="nf-cantidad" class="campo num" type="number" min="1" max="30" data-campo="cantidad"
          value="${s.cantidad}"${s.procesando ? " disabled" : ""}>
        <p class="ayuda">Tiene que coincidir con la cantidad de partidos de las boletas.</p>
      </div>
    </div></div>
  </div>`;

  html += `<div class="tarjeta">
    <div class="tarjeta-cabecera"><h2>2 · Partidos y resultados oficiales</h2>
      <span class="insignia i-neutra">1 = LOCAL · X = EMPATE · 2 = VISITANTE</span></div>
    <div id="nf-partidos">${filasNuevaFecha()}</div>
    <p style="padding:12px 20px;border-top:1px solid var(--tinta-200);font-size:12px;color:var(--tinta-500)">
      Los resultados son opcionales acá: podés cargarlos más tarde desde la sección Resultados.
      Los partidos sin resultado no se computan para nadie.</p>
  </div>`;

  html += `<div class="tarjeta">
    <div class="tarjeta-cabecera"><h2>3 · PDF con las boletas</h2></div>
    <div class="tarjeta-cuerpo">${zonaArchivo(s.archivo, s.procesando)}</div>
  </div>`;

  if (s.error) html += `<div class="bloque">${avisoHtml("error", escaparHtml(s.error))}</div>`;
  if (s.procesando) html += panelProgreso(s.progreso, s.etapasHechas);

  html += `<div class="fila-botones" style="margin-top:20px">
    <button class="boton primario" data-accion="crear-fecha"${s.procesando ? " disabled" : ""}>
      ${s.procesando ? (s.archivo ? "Procesando…" : "Creando…") : (s.archivo ? "Procesar boletas" : "Crear fecha")}
    </button>
    <p style="font-size:12px;color:var(--tinta-500)">${s.archivo
      ? "Se crea la fecha y se procesa el PDF en un solo paso."
      : "Podés crear la fecha ahora y subir el PDF después."}</p>
  </div>`;
  return html;
}

function filasNuevaFecha() {
  const s = App.formNueva;
  return s.partidos.map((p, i) => `<div class="fila-partido">
    <span class="indice">${i + 1}</span>
    <input class="campo" data-partido="local" data-indice="${i}" value="${escaparHtml(p.local)}"
      placeholder="Local del partido ${i + 1}" aria-label="Equipo local del partido ${i + 1}"${s.procesando ? " disabled" : ""}>
    <input class="campo" data-partido="visitante" data-indice="${i}" value="${escaparHtml(p.visitante)}"
      placeholder="Visitante del partido ${i + 1}" aria-label="Equipo visitante del partido ${i + 1}"${s.procesando ? " disabled" : ""}>
    ${selectorResultado(i, p.resultado, "res-nueva")}
  </div>`).join("");
}

function zonaArchivo(archivo, deshabilitado) {
  return `<div class="zona-archivo${archivo ? " con-archivo" : ""}" id="zona-archivo">
    ${icono(ICO.subir)}
    <p class="nombre">${archivo ? escaparHtml(archivo.name) : "Arrastrá el PDF acá o elegilo desde tu computadora"}</p>
    <p class="peso">${archivo ? (archivo.size / 1024 / 1024).toFixed(2) + " MB" : "Sólo PDF"}</p>
    <input type="file" accept="application/pdf,.pdf" class="oculto" id="entrada-archivo">
    <div class="botones">
      <button type="button" class="boton secundario" data-accion="elegir-archivo"${deshabilitado ? " disabled" : ""}>Elegir archivo</button>
      ${archivo ? `<button type="button" class="boton sutil" data-accion="quitar-archivo"${deshabilitado ? " disabled" : ""}>Quitar</button>` : ""}
    </div>
  </div>
  <p class="ayuda">El PDF tiene que tener texto (el que exporta el programa de boletas). Si es un escaneo
  o una foto, el sistema lo detecta y avisa en lugar de adivinar: esas boletas se pueden cargar a mano.</p>`;
}

function panelProgreso(progreso, hechas) {
  const pct = progreso && progreso.porcentaje ? progreso.porcentaje : 0;
  return `<div class="tarjeta" style="margin-top:20px">
    <div class="tarjeta-cabecera"><h2>Procesando boletas…</h2>
      <span class="num" style="font-weight:700;color:var(--acento-700)">${pct}%</span></div>
    <div class="tarjeta-cuerpo">
      <div class="barra" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100">
        <div style="width:${pct}%"></div></div>
      ${progreso && progreso.detalle ? `<p class="ayuda">${escaparHtml(progreso.detalle)}</p>` : ""}
      <div class="etapas">${ETAPAS.map((e) => {
        const actual = progreso && progreso.etapa === e.clave;
        const hecha = hechas.indexOf(e.clave) >= 0 && !actual;
        const cls = actual ? "actual" : hecha ? "hecha" : "";
        return `<div class="etapa ${cls}">${hecha ? icono(ICO.ok) : `<span class="punto"></span>`}${e.texto}</div>`;
      }).join("")}</div>
    </div></div>`;
}

function vistaBoletas() {
  const correccion = correccionActiva();
  if (!correccion) return `<div class="cargando">Elegí una fecha.</div>`;
  const r = correccion.resumen;

  const texto = App.busqueda.trim().toLowerCase();
  const filas = correccion.filas.filter((f) => {
    if (App.filtroBoletas === "ok" && f.estado === "revision") return false;
    if (App.filtroBoletas === "revision" && f.estado !== "revision") return false;
    if (!texto) return true;
    return (f.participante || "").toLowerCase().indexOf(texto) >= 0 ||
           (f.numeroBoleta || "").toLowerCase().indexOf(texto) >= 0;
  });

  let html = encabezado("Boletas",
    `${r.boletasTotales} boletas en ${correccion.fecha.nombre}. Hacé clic en cualquiera para ver el detalle partido por partido y el texto original del PDF.`,
    `<button class="boton secundario" data-accion="abrir-manual">${icono(ICO.mas)}Cargar a mano</button>
     <button class="boton primario" data-accion="abrir-subida">${icono(ICO.subir)}Subir PDF</button>`);

  html += `<div class="tarjeta"><div class="barra-herramientas">
    <div class="buscador">${icono(ICO.buscar)}
      <input class="campo" id="busqueda" placeholder="Buscar por participante o número de boleta" value="${escaparHtml(App.busqueda)}"></div>
    <div class="filtros">
      <button class="${App.filtroBoletas === "todas" ? "activo" : ""}" data-filtro="todas">Todas (${r.boletasTotales})</button>
      <button class="${App.filtroBoletas === "ok" ? "activo" : ""}" data-filtro="ok">Sin problemas (${r.boletasOk + r.boletasResueltasManualmente})</button>
      <button class="${App.filtroBoletas === "revision" ? "activo" : ""}" data-filtro="revision">A revisar (${r.boletasEnRevision})</button>
    </div>
  </div></div>`;

  html += `<div class="tarjeta" style="margin-top:20px;overflow:hidden">`;
  if (!filas.length) {
    html += vacio("No hay boletas para mostrar", r.boletasTotales === 0
      ? "Subí el PDF con las boletas de esta fecha o cargalas a mano."
      : "Probá cambiando el filtro o el texto de búsqueda.");
  } else {
    html += `<div class="tabla-scroll"><table><thead><tr>
      <th>Boleta</th><th>Participante</th><th class="centro">Aciertos</th>
      <th class="centro">%</th><th>Pronósticos</th><th>Estado</th></tr></thead><tbody>` +
      filas.map((f) => `<tr class="clicable" data-boleta="${f.boletaId}">
        <td class="num" style="font-weight:600;color:var(--tinta-500)">${f.numeroBoleta ? "#" + escaparHtml(f.numeroBoleta) : "—"}</td>
        <td><strong>${f.participante ? escaparHtml(f.participante) : `<span class="sin-nombre">sin nombre detectado</span>`}</strong>
          <div style="font-size:12px;color:var(--tinta-400)">${f.paginas.length ? "página(s) " + f.paginas.join(", ") : "carga manual"}</div></td>
        <td class="centro num" style="font-weight:700">${f.aciertos}<small style="color:var(--tinta-400)">/${f.partidosEvaluados}</small></td>
        <td class="centro num">${f.porcentaje}%</td>
        <td><div class="tira-pron">${f.detalle.map((d) =>
          marcaPron(d.pronostico, tonoDetalle(d.estado), `${d.local} vs ${d.visitante}`)).join("")}</div></td>
        <td>${insigniaEstado(f.estado)}</td></tr>`).join("") +
      `</tbody></table></div>`;
  }
  html += `</div>`;
  return html;
}

function vistaResultados() {
  const f = fechaActiva();
  if (!f) return `<div class="cargando">Elegí una fecha.</div>`;
  if (!App.formResultados || App.formResultados.fechaId !== f.id) {
    App.formResultados = {
      fechaId: f.id,
      partidos: f.partidos.map((p) => ({ local: p.local, visitante: p.visitante, resultado: p.resultado })),
      desempate: f.config.desempate,
      partidoClave: f.config.partidoClave,
      guardado: false,
    };
  }
  const s = App.formResultados;
  const cargados = s.partidos.filter((p) => p.resultado !== null).length;
  const hayCambios = s.desempate !== f.config.desempate || s.partidoClave !== f.config.partidoClave ||
    s.partidos.some((p, i) => p.resultado !== f.partidos[i].resultado ||
      p.local !== f.partidos[i].local || p.visitante !== f.partidos[i].visitante);

  let html = encabezado("Resultados oficiales",
    "Cargá cómo terminó cada partido. La corrección se recalcula sola: no hace falta volver a procesar el PDF.",
    `<button class="boton primario" data-accion="guardar-resultados"${hayCambios ? "" : " disabled"}>Guardar y corregir</button>`);

  html += `<div class="fila-botones" style="margin-bottom:20px">
    <span class="insignia ${cargados === s.partidos.length ? "i-ok" : "i-alerta"}">${cargados} de ${s.partidos.length} resultados cargados</span>
    ${s.guardado && !hayCambios ? `<span class="insignia i-ok">${icono(ICO.ok)}Guardado. El ranking ya está actualizado.</span>` : ""}
    ${hayCambios ? `<span class="insignia i-alerta">Hay cambios sin guardar</span>` : ""}
  </div>`;

  html += `<div class="tarjeta">
    <div class="tarjeta-cabecera"><h2>Partidos de ${escaparHtml(f.nombre)}</h2>
      <span class="insignia i-neutra">1 = LOCAL · X = EMPATE · 2 = VISITANTE</span></div>
    <div>${s.partidos.map((p, i) => `<div class="fila-partido">
      <span class="indice">${i + 1}</span>
      <input class="campo" data-resultado="local" data-indice="${i}" value="${escaparHtml(p.local)}" aria-label="Equipo local del partido ${i + 1}">
      <input class="campo" data-resultado="visitante" data-indice="${i}" value="${escaparHtml(p.visitante)}" aria-label="Equipo visitante del partido ${i + 1}">
      ${selectorResultado(i, p.resultado, "res-oficial")}
    </div>`).join("")}</div>
  </div>`;

  const reglas = [
    ["ninguna", "Sin desempate — los empatados comparten posición (recomendado)"],
    ["partido_clave", "Gana quien acertó un partido determinado"],
    ["orden_boleta", "Gana el número de boleta más bajo (orden de entrega)"],
  ];
  html += `<div class="tarjeta" style="margin-top:20px">
    <div class="tarjeta-cabecera"><h2>Regla de desempate</h2></div>
    <div class="tarjeta-cuerpo pila">
      <p style="font-size:14px;color:var(--tinta-600)">Por defecto el sistema <strong>no desempata</strong>:
      si dos participantes tienen la misma cantidad de aciertos, comparten la posición y aparecen los dos.
      Podés definir una regla acá si el reglamento del Prode tiene una.</p>
      ${reglas.map((r) => `<label class="opcion-radio">
        <input type="radio" name="desempate" data-desempate="${r[0]}"${s.desempate === r[0] ? " checked" : ""}>
        <span style="font-size:14px">${r[1]}</span></label>`).join("")}
      ${s.desempate === "partido_clave" ? `<div style="max-width:420px">
        <label class="etiqueta" for="clave">Partido que decide</label>
        <select id="clave" class="campo" data-accion="partido-clave">
          ${s.partidos.map((p, i) => `<option value="${i + 1}"${s.partidoClave === i + 1 ? " selected" : ""}>${i + 1} · ${escaparHtml(p.local)} vs ${escaparHtml(p.visitante)}</option>`).join("")}
        </select></div>` : ""}
    </div>
  </div>`;
  return html;
}

function vistaRanking() {
  const correccion = correccionActiva();
  if (!correccion) return `<div class="cargando">Elegí una fecha.</div>`;
  const { ranking, enRevision, resumen, fecha } = correccion;

  let html = encabezado("Ranking",
    `${ranking.length} boletas ordenadas por aciertos sobre ${resumen.partidosConResultado} partidos con resultado oficial.`,
    `<button class="boton secundario" data-accion="exportar-csv">${icono(ICO.descargar)}CSV</button>
     <button class="boton primario" data-accion="exportar-xlsx">${icono(ICO.descargar)}Excel</button>`);

  html += `<div class="bloque-avisos">`;
  if (fecha.esDemo) html += avisoHtml("demo", "<strong>Datos de demostración.</strong> Este ranking se calculó sobre boletas ficticias.");
  for (const a of correccion.advertencias) html += avisoHtml("alerta", escaparHtml(a));
  html += `</div>`;

  html += `<div class="tarjeta" style="overflow:hidden">`;
  if (!ranking.length) {
    html += vacio("Todavía no hay ranking", "Hacen falta boletas válidas y al menos un resultado oficial cargado.");
  } else {
    html += `<div class="tabla-scroll"><table><thead><tr>
      <th>Posición</th><th>Participante</th><th>Boleta</th><th class="centro">Aciertos</th>
      <th class="centro">Errores</th><th class="centro">Porcentaje</th><th>Estado</th></tr></thead><tbody>` +
      ranking.map((r) => `<tr class="clicable${r.posicion <= 3 ? " podio" : ""}" data-boleta="${r.boletaId}">
        <td><span style="display:flex;align-items:center;gap:8px">
          <span style="font-size:18px">${MEDALLAS[r.posicion] || ""}</span>
          <span class="num" style="font-weight:700">${r.posicion}</span>
          ${r.empatado ? `<span style="font-size:10px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--ambar-700)" title="Comparte posición con otro participante">empate</span>` : ""}
        </span></td>
        <td><strong>${r.participante ? escaparHtml(r.participante) : `<span class="sin-nombre">sin nombre</span>`}</strong></td>
        <td class="num" style="color:var(--tinta-500)">${r.numeroBoleta ? "#" + escaparHtml(r.numeroBoleta) : "—"}</td>
        <td class="centro num" style="font-weight:700;color:var(--verde-700);font-size:16px">${r.aciertos}<small style="color:var(--tinta-400)">/${r.partidosEvaluados}</small></td>
        <td class="centro num">${r.errores}</td>
        <td class="centro num" style="font-weight:600">${r.porcentaje}%</td>
        <td>${insigniaEstado(r.estado)}</td></tr>`).join("") +
      `</tbody></table></div>`;
  }
  html += `</div>`;

  if (enRevision.length) {
    html += `<div class="tarjeta" style="margin-top:24px;overflow:hidden">
      <div class="tarjeta-cabecera"><h2>⚠️ Fuera del ranking hasta resolverse (${enRevision.length})</h2>
        <span style="font-size:12px;color:var(--tinta-500)">No se les asigna posición porque su lectura no es confiable</span></div>
      <div class="tabla-scroll"><table><thead><tr>
        <th>Boleta</th><th>Participante</th><th class="centro">Aciertos</th><th>Problema</th></tr></thead><tbody>` +
      enRevision.map((f) => `<tr class="clicable" data-boleta="${f.boletaId}">
        <td class="num" style="color:var(--tinta-500)">${f.numeroBoleta ? "#" + escaparHtml(f.numeroBoleta) : "—"}</td>
        <td><strong>${f.participante ? escaparHtml(f.participante) : `<span class="sin-nombre">sin nombre</span>`}</strong></td>
        <td class="centro num" style="color:var(--tinta-500)">${f.aciertos}</td>
        <td style="font-size:13px;color:var(--tinta-600)">${escaparHtml(f.problemas.filter((p) => p.severidad === "error").map((p) => p.mensaje).join(" "))}</td>
      </tr>`).join("") + `</tbody></table></div></div>`;
  }
  return html;
}

function vistaGanadores() {
  const correccion = correccionActiva();
  if (!correccion) return `<div class="cargando">Elegí una fecha.</div>`;
  const { top3, resumen, fecha } = correccion;
  const titulos = { 1: "PRIMER PUESTO", 2: "SEGUNDO PUESTO", 3: "TERCER PUESTO" };

  let html = encabezado("🏆 Ganadores",
    `Podio de ${fecha.nombre}, sobre ${resumen.partidosConResultado} partidos con resultado oficial cargado.`);

  html += `<div class="bloque-avisos">`;
  if (fecha.esDemo) html += avisoHtml("demo", "<strong>Datos de demostración.</strong> Este podio surge de boletas ficticias.");
  if (resumen.boletasEnRevision > 0) {
    html += avisoHtml("alerta", `Hay <strong>${resumen.boletasEnRevision}</strong> boleta(s) sin resolver que no se computaron. El podio puede cambiar cuando las revises.`);
  }
  html += `</div>`;

  if (!top3.length) {
    html += `<div class="tarjeta">${vacio("Todavía no hay podio", "Hacen falta boletas válidas y al menos un resultado oficial cargado.")}</div>`;
    return html;
  }

  html += `<div class="podio">` + top3.map((g) => `<div class="puesto puesto-${g.puesto}">
    <div class="medalla">${MEDALLAS[g.puesto]}</div>
    <p class="titulo">${titulos[g.puesto]}</p>
    ${g.participantes.map((p) => `<button class="ganador" data-boleta="${p.boletaId}">
      <strong>${escaparHtml(p.participante || "(sin nombre)")}</strong>
      <span class="num">${p.numeroBoleta ? "Boleta #" + escaparHtml(p.numeroBoleta) : "sin número"}</span>
    </button>`).join("")}
    <p class="puntaje num">${g.aciertos}<small>/${resumen.partidosConResultado}</small></p>
    <p class="sub">aciertos</p>
    ${g.empate ? `<p class="nota-empate">Empate de ${g.participantes.length} participantes en este puesto.
      ${fecha.config.desempate === "ninguna" ? "No hay regla de desempate definida." : "La regla de desempate configurada no los separa."}</p>` : ""}
  </div>`).join("") + `</div>`;

  if (top3.some((g) => g.empate)) {
    html += `<div style="margin-top:20px">` + avisoHtml("info",
      "El sistema no inventa criterios de desempate. Si el reglamento del Prode tiene uno, configuralo en <strong>Resultados → Regla de desempate</strong> y el podio se recalcula.") + `</div>`;
  }
  return html;
}

function vistaRevision() {
  const correccion = correccionActiva();
  if (!correccion) return `<div class="cargando">Elegí una fecha.</div>`;
  const pendientes = correccion.enRevision;
  const conAvisos = correccion.filas.filter((f) => f.elegible && f.problemas.some((p) => p.severidad === "aviso"));

  let html = encabezado("⚠️ Requieren revisión",
    "Boletas que el sistema no pudo interpretar con certeza. No entran al ranking hasta que las resuelvas: es preferible frenar antes que asignar un puntaje equivocado.");

  if (!pendientes.length) {
    html += `<div class="tarjeta">${vacio("Ninguna boleta pendiente", "Todas las boletas de esta fecha se leyeron sin problemas bloqueantes.")}</div>`;
  } else {
    html += pendientes.map((f) => {
      const errores = f.problemas.filter((p) => p.severidad === "error");
      return `<div class="tarjeta" style="border-color:var(--rojo-300);margin-bottom:16px;overflow:hidden">
        <div class="tarjeta-cabecera" style="background:var(--rojo-50)">
          <div>
            <strong>${f.participante ? escaparHtml(f.participante) : `<span class="sin-nombre">Participante sin identificar</span>`}</strong>
            <div class="num" style="font-size:12px;color:var(--tinta-500)">Boleta ${f.numeroBoleta ? "#" + escaparHtml(f.numeroBoleta) : "sin número"}${f.paginas.length ? " · página(s) " + f.paginas.join(", ") + " del PDF" : ""}</div>
          </div>
          <button class="boton primario chico" data-boleta="${f.boletaId}">${icono(ICO.ojo)}Revisar y corregir</button>
        </div>
        <ul class="lista-limpia">${errores.map((p) => `<li>
          <div class="fila-botones">
            <span class="insignia i-error">${escaparHtml(p.codigo)}</span>
            ${p.pagina ? `<span class="insignia i-neutra">página ${p.pagina}</span>` : ""}
            ${p.partidoNumero ? `<span class="insignia i-neutra">partido ${p.partidoNumero}</span>` : ""}
          </div>
          <p style="margin-top:8px;font-size:14px">${escaparHtml(p.mensaje)}</p>
          <p style="margin-top:2px;font-size:12px;color:var(--tinta-500)">${escaparHtml(EXPLICACION_PROBLEMA[p.codigo] || "")}</p>
          ${p.textoProblematico ? `<p class="fragmento">${escaparHtml(p.textoProblematico)}</p>` : ""}
        </li>`).join("")}</ul>
      </div>`;
    }).join("");
  }

  if (conAvisos.length) {
    html += `<div class="tarjeta" style="margin-top:24px;overflow:hidden">
      <div class="tarjeta-cabecera"><h2>Avisos que no bloquean el ranking (${conAvisos.length})</h2>
        <span style="font-size:12px;color:var(--tinta-500)">Vale la pena mirarlos, pero estas boletas sí se computan</span></div>
      <div class="tabla-scroll"><table><thead><tr><th>Boleta</th><th>Participante</th><th>Aviso</th></tr></thead><tbody>` +
      conAvisos.map((f) => f.problemas.filter((p) => p.severidad === "aviso").map((p) => `
        <tr class="clicable" data-boleta="${f.boletaId}">
          <td class="num" style="color:var(--tinta-500)">${f.numeroBoleta ? "#" + escaparHtml(f.numeroBoleta) : "—"}</td>
          <td><strong>${escaparHtml(f.participante || "(sin nombre)")}</strong></td>
          <td style="font-size:13px;color:var(--tinta-700)">${escaparHtml(p.mensaje)}</td>
        </tr>`).join("")).join("") + `</tbody></table></div></div>`;
  }
  return html;
}

function vistaHistorial() {
  let html = encabezado("Historial de fechas",
    "Todas las fechas cargadas, con su podio. Abrí cualquiera para consultar su ranking completo.");

  if (!App.datos.fechas.length) {
    return html + `<div class="tarjeta">${vacio("Todavía no hay fechas", "Creá la primera desde Nueva fecha.")}</div>`;
  }

  html += App.datos.fechas.map((f) => {
    const c = corregirFecha(f, boletasDe(f.id));
    const estado = f.estado === "corregida" ? ["i-ok", "Corregida"]
      : f.estado === "procesada" ? ["i-alerta", "Faltan resultados"] : ["i-neutra", "Borrador"];
    return `<div class="tarjeta" style="margin-bottom:16px;overflow:hidden${f.id === App.fechaActivaId ? ";box-shadow:0 0 0 2px var(--acento-200)" : ""}">
      <div class="tarjeta-cabecera">
        <div>
          <div class="fila-botones">
            <h2 style="font-size:16px">${escaparHtml(f.nombre)}</h2>
            ${f.esDemo ? `<span class="insignia i-demo">DEMO</span>` : ""}
            <span class="insignia ${estado[0]}">${estado[1]}</span>
            ${c.resumen.boletasEnRevision ? `<span class="insignia i-error">${c.resumen.boletasEnRevision} a revisar</span>` : ""}
          </div>
          <p style="margin-top:4px;font-size:12px;color:var(--tinta-500)">
            ${fechaCorta(f.creadaEn)} · ${f.cantidadPartidos} partidos · ${boletasDe(f.id).length} boletas ·
            ${c.resumen.participantes} participantes${c.resumen.maximoAciertos !== null ? " · mejor puntaje " + c.resumen.maximoAciertos : ""}</p>
        </div>
        <div class="fila-botones">
          <button class="boton secundario chico" data-abrir-fecha="${f.id}">${icono(ICO.ranking)}Ver ranking</button>
          <button class="boton peligro chico" data-borrar-fecha="${f.id}" title="Eliminar la fecha y todas sus boletas">${icono(ICO.basura)}</button>
        </div>
      </div>
      ${c.top3.length ? `<div class="rejilla c3" style="padding:16px 20px">${c.top3.map((g) => `
        <div style="display:flex;align-items:center;gap:12px;padding:10px 12px;border:1px solid var(--tinta-200);border-radius:8px;background:var(--tinta-50)">
          <span style="font-size:20px">${MEDALLAS[g.puesto]}</span>
          <div style="min-width:0">
            <div style="font-size:14px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${g.participantes.map((p) => escaparHtml(p.participante || "(sin nombre)")).join(" · ")}</div>
            <div class="num" style="font-size:12px;color:var(--tinta-500)">${g.aciertos} aciertos</div>
          </div></div>`).join("")}</div>`
        : `<p style="padding:16px 20px;font-size:14px;color:var(--tinta-500)">Sin podio todavía: faltan boletas válidas o resultados oficiales.</p>`}
    </div>`;
  }).join("");
  return html;
}

function vistaConfiguracion() {
  const hayDemo = App.datos.fechas.some((f) => f.esDemo);
  const f = fechaActiva();

  let html = encabezado("Configuración", "Estado del sistema, datos de demostración y PDF de prueba.");

  html += `<div class="bloque-avisos">` + avisoHtml("info",
    "<strong>Esta es la versión de demostración que funciona sin servidor.</strong> Los PDF se leen dentro de tu navegador y ningún dato de participantes sale de esta computadora: no hay servidor al que enviarlos. Como contrapartida, la información vive sólo en este navegador — si lo abrís en otra máquina, vas a empezar de cero.") + `</div>`;

  html += `<div class="rejilla c2">`;

  html += `<div class="tarjeta">
    <div class="tarjeta-cabecera"><h2>Almacenamiento</h2>
      <span class="insignia ${Almacen.disponible() ? "i-ok" : "i-error"}">${Almacen.disponible() ? "Disponible" : "Bloqueado"}</span></div>
    <div class="tarjeta-cuerpo"><dl class="datos">
      <div><dt>Dónde se guarda</dt><dd class="normal">En el almacenamiento local de este navegador. No hay base de datos ni servidor.</dd></div>
      <div><dt>Espacio usado</dt><dd class="num">${Almacen.espacioUsado()} KB</dd></div>
      <div><dt>Ojo</dt><dd class="normal">Si borrás los datos de navegación o usás otra computadora, las fechas no van a estar. Exportá a Excel lo que quieras conservar.</dd></div>
    </dl></div></div>`;

  html += `<div class="tarjeta">
    <div class="tarjeta-cabecera"><h2>Datos de demostración</h2>
      <span class="insignia ${hayDemo ? "i-demo" : "i-neutra"}">${hayDemo ? "Presentes" : "No hay"}</span></div>
    <div class="tarjeta-cuerpo pila">
      <p style="font-size:14px;color:var(--tinta-700)">Las fechas de demostración usan participantes y pronósticos ficticios,
      y están marcadas como <strong>DEMO</strong> en todo el panel. No se mezclan con las reales.</p>
      <div class="fila-botones">
        <button class="boton peligro" data-accion="borrar-demo"${hayDemo ? "" : " disabled"}>${icono(ICO.basura)}Borrar datos de demostración</button>
        <button class="boton secundario" data-accion="restaurar-demo">${icono(ICO.refrescar)}Restaurar demo</button>
      </div>
    </div></div>`;

  html += `<div class="tarjeta">
    <div class="tarjeta-cabecera"><h2>PDF de prueba</h2></div>
    <div class="tarjeta-cuerpo pila">
      <p style="font-size:14px;color:var(--tinta-700)">Dos PDF con el mismo formato que las boletas reales, para probar el
      procesamiento de punta a punta. Creá una fecha nueva de 10 partidos y subilos.</p>
      <div class="pila">
        <button class="boton secundario" style="justify-content:flex-start;width:100%" data-accion="bajar-pdf" data-cual="limpio">
          ${icono(ICO.documento)}boletas-fecha-12.pdf — 14 boletas correctas</button>
        <button class="boton secundario" style="justify-content:flex-start;width:100%" data-accion="bajar-pdf" data-cual="errores">
          ${icono(ICO.documento)}boletas-fecha-12-con-errores.pdf — 19 boletas, 5 con problemas</button>
      </div>
      <p class="ayuda">El segundo incluye una boleta incompleta, una con doble marca, una sin nombre,
      un participante repetido y una boleta duplicada.</p>
    </div></div>`;

  html += `<div class="tarjeta">
    <div class="tarjeta-cabecera"><h2>Cómo probar todo</h2></div>
    <div class="tarjeta-cuerpo">
      <ol style="padding-left:20px;font-size:14px;line-height:1.9;color:var(--tinta-700)">
        <li>Bajá el PDF de prueba de acá al lado.</li>
        <li>Andá a <strong>Nueva fecha</strong> y poné 10 partidos.</li>
        <li>Cargá los equipos: River-Racing, Boca-Independiente, Talleres-Belgrano, San Lorenzo-Huracán,
            Estudiantes-Gimnasia LP, Rosario Central-Newells, Vélez-Argentinos, Lanús-Banfield,
            Defensa y Justicia-Tigre, Godoy Cruz-Instituto.</li>
        <li>Resultados oficiales: <strong class="num">1 X 2 1 1 X 1 2 X 1</strong></li>
        <li>Subí el PDF y apretá <strong>Procesar boletas</strong>.</li>
      </ol>
      <p class="ayuda">Hay un botón que carga esa fecha de ejemplo con un clic, para no tipear nada:</p>
      <button class="boton primario" data-accion="fecha-ejemplo" style="margin-top:8px">Preparar la fecha de prueba automáticamente</button>
    </div></div>`;

  html += `</div>`;

  if (f && f.auditoria && f.auditoria.length) {
    html += `<div class="tarjeta" style="margin-top:20px">
      <div class="tarjeta-cabecera"><h2>Auditoría de ${escaparHtml(f.nombre)}</h2>
        <span style="font-size:12px;color:var(--tinta-500)">Todo cambio queda registrado con fecha y detalle</span></div>
      <ul class="lista-limpia">${f.auditoria.slice().reverse().map((e) => `<li>
        <div class="fila-botones" style="font-size:13px">
          <span class="num" style="min-width:150px;font-size:12px;color:var(--tinta-500)">${fechaHora(e.fecha)}</span>
          <span class="insignia i-neutra">${escaparHtml(e.accion)}</span>
          <span style="flex:1;min-width:0;color:var(--tinta-700)">${escaparHtml(e.detalle)}</span>
        </div></li>`).join("")}</ul></div>`;
  }
  return html;
}

/* ------------------------------------------------------------------ modales */

function modalDetalle(estado) {
  const correccion = correccionActiva();
  if (!correccion) return "";
  const fila = correccion.filas.find((f) => f.boletaId === estado.boletaId);
  if (!fila) return "";
  const boleta = boletasDe(correccion.fecha.id).find((b) => b.id === estado.boletaId);
  const errores = fila.problemas.filter((p) => p.severidad === "error");
  const avisos = fila.problemas.filter((p) => p.severidad === "aviso");

  let cuerpo = `<div class="cajas-resumen">
    <div class="caja caja-verde"><p class="k">Aciertos</p><p class="v">${fila.aciertos}</p></div>
    <div class="caja caja-roja"><p class="k">Errores</p><p class="v">${fila.errores}</p></div>
    <div class="caja caja-gris"><p class="k">Porcentaje</p><p class="v">${fila.porcentaje}%</p></div>
    <div class="caja caja-gris"><p class="k">Estado</p><div style="margin-top:6px">${insigniaEstado(fila.estado)}</div></div>
  </div>`;

  cuerpo += avisoHtml("info", escaparHtml(fila.explicacion));

  for (const p of errores) {
    cuerpo += `<div class="aviso a-error">${icono(ICO.alerta)}<div>
      <strong>${escaparHtml(p.mensaje)}</strong>
      <p style="margin-top:4px;font-size:12px;opacity:.8">Código ${escaparHtml(p.codigo)}${p.pagina ? " · página " + p.pagina + " del PDF" : ""}</p>
      ${p.textoProblematico ? `<p class="fragmento">${escaparHtml(p.textoProblematico)}</p>` : ""}
    </div></div>`;
  }
  for (const p of avisos) {
    cuerpo += `<div class="aviso a-alerta">${icono(ICO.alerta)}<div>${escaparHtml(p.mensaje)}
      <p style="margin-top:4px;font-size:12px;opacity:.8">Código ${escaparHtml(p.codigo)}</p></div></div>`;
  }

  if (estado.editando) {
    cuerpo += `<div class="rejilla c2" style="border:1px solid var(--acento-200);background:var(--acento-50);border-radius:8px;padding:16px">
      <div><label class="etiqueta" for="det-part">Participante</label>
        <input id="det-part" class="campo" data-detalle="participante" value="${escaparHtml(estado.participante)}" placeholder="Nombre y apellido"></div>
      <div><label class="etiqueta" for="det-num">Número de boleta</label>
        <input id="det-num" class="campo" data-detalle="numero" value="${escaparHtml(estado.numero)}" placeholder="Ej.: 184"></div>
    </div>`;
  }

  const etiquetas = { acierto: "Acierto", error: "Error", sin_pronostico: "Sin pronóstico legible", sin_resultado: "Sin resultado oficial" };
  cuerpo += `<div class="tabla-scroll" style="border:1px solid var(--tinta-200);border-radius:8px">
    <table style="min-width:620px"><thead><tr>
      <th style="width:44px">#</th><th>Partido</th><th class="centro" style="width:120px">Pronóstico</th>
      <th class="centro" style="width:96px">Resultado</th><th style="width:190px">Estado</th></tr></thead><tbody>` +
    fila.detalle.map((d, i) => `<tr${d.estado === "acierto" ? ` style="background:rgba(209,250,229,.35)"` : ""}>
      <td class="num" style="color:var(--tinta-500)">${d.partidoNumero}</td>
      <td><strong>${escaparHtml(d.local)} <span style="color:var(--tinta-400);font-weight:400">vs</span> ${escaparHtml(d.visitante)}</strong>
        ${d.evidencia ? `<div class="evidencia" title="${escaparHtml(d.evidencia)}">${d.origen === "manual" ? "✎ " : ""}${escaparHtml(d.evidencia)}</div>` : ""}</td>
      <td class="centro">${estado.editando
        ? `<select class="campo" style="padding:6px;text-align:center" data-pron="${i}">
            ${["1", "X", "2", ""].map((o) => `<option value="${o}"${(estado.valores[i] || "") === o ? " selected" : ""}>${o === "" ? "— sin dato —" : o}</option>`).join("")}
          </select>`
        : marcaPron(d.pronostico, tonoDetalle(d.estado))}</td>
      <td class="centro">${marcaPron(d.resultado)}</td>
      <td><span class="insignia ${d.estado === "acierto" ? "i-ok" : d.estado === "error" ? "i-error" : "i-neutra"}">
        ${d.estado === "acierto" ? "✅" : d.estado === "error" ? "❌" : "—"} ${etiquetas[d.estado]}</span></td>
    </tr>`).join("") + `</tbody></table></div>`;

  if (boleta) {
    cuerpo += `<div>
      <button class="boton sutil chico" data-accion="ver-crudo">${icono(ICO.ojo)}${estado.verCrudo ? "Ocultar" : "Ver"} el texto tal como salió del PDF</button>
      ${estado.verCrudo ? `<pre class="crudo">${escaparHtml(boleta.textoCrudo)}</pre>` : ""}
      <p class="ayuda">Detectada con la estrategia <strong>${escaparHtml(boleta.metodoDeteccion)}</strong> ·
        ${boleta.origen === "pdf" ? "leída del PDF" : boleta.origen === "manual" ? "cargada a mano" : "dato de demostración"}${boleta.editadaManualmente ? " · editada a mano" : ""} ·
        ${fechaHora(boleta.creadaEn)}</p>
    </div>`;
  }

  if (estado.error) cuerpo += avisoHtml("error", escaparHtml(estado.error));

  cuerpo += `<div class="separador entre" style="flex-wrap:wrap">
    <div class="fila-botones">
      ${estado.editando
        ? `<button class="boton primario" data-accion="guardar-boleta">Guardar cambios</button>
           <button class="boton secundario" data-accion="cancelar-edicion">Cancelar</button>`
        : `<button class="boton secundario" data-accion="editar-boleta">Corregir a mano</button>`}
      ${fila.estado === "revision"
        ? `<button class="boton primario" data-accion="resolver-boleta" title="La boleta pasa a contar en el ranking. Los problemas quedan registrados.">${icono(ICO.ok)}Dar por revisada</button>` : ""}
      ${fila.estado === "resuelta_manual"
        ? `<button class="boton secundario" data-accion="reabrir-boleta">Reabrir revisión</button>` : ""}
    </div>
    <button class="boton peligro chico" data-accion="eliminar-boleta">${icono(ICO.basura)}Eliminar boleta</button>
  </div>`;

  return marcoModal(
    escaparHtml(fila.participante || "Boleta sin nombre"),
    `Boleta ${fila.numeroBoleta ? "#" + escaparHtml(fila.numeroBoleta) : "sin número"} · ${fila.paginas.length ? "página(s) " + fila.paginas.join(", ") + " del PDF" : "carga manual"}`,
    cuerpo);
}

function modalSubida(estado) {
  const f = fechaActiva();
  let cuerpo = "";
  if (f && f.esDemo) {
    cuerpo += avisoHtml("demo", "Esta es una fecha de demostración y no admite cargar un PDF. Creá una fecha nueva para procesar boletas reales.");
  }
  cuerpo += zonaArchivo(estado.archivo, estado.procesando);
  if (estado.error) cuerpo += avisoHtml("error", escaparHtml(estado.error));
  if (estado.resumen) {
    cuerpo += avisoHtml("info", `Se procesaron <strong>${estado.resumen.boletas}</strong> boletas. ${
      estado.resumen.enRevision ? estado.resumen.enRevision + " requieren revisión manual." : "Ninguna requiere revisión."}`);
  }
  if (estado.procesando) cuerpo += panelProgreso(estado.progreso, estado.etapasHechas);
  cuerpo += `<button class="boton primario" data-accion="procesar-subida"${(!estado.archivo || estado.procesando || (f && f.esDemo)) ? " disabled" : ""}>
    ${estado.procesando ? "Procesando…" : "Procesar boletas"}</button>`;

  return marcoModal("Subir el PDF con las boletas",
    "El sistema lee el PDF, detecta cada boleta y valida la información antes de calcular nada.", cuerpo);
}

function modalManual(estado) {
  const f = fechaActiva();
  if (!f) return "";
  let cuerpo = `<div class="rejilla c2">
    <div><label class="etiqueta" for="man-part">Participante</label>
      <input id="man-part" class="campo" data-manual="participante" value="${escaparHtml(estado.participante)}" placeholder="Nombre y apellido"></div>
    <div><label class="etiqueta" for="man-num">Número de boleta (opcional)</label>
      <input id="man-num" class="campo" data-manual="numero" value="${escaparHtml(estado.numero)}" placeholder="Ej.: 184"></div>
  </div>`;

  cuerpo += `<div style="border:1px solid var(--tinta-200);border-radius:8px;overflow:hidden">
    <table><thead><tr><th style="width:44px">#</th><th>Partido</th><th style="width:200px">Pronóstico</th></tr></thead><tbody>` +
    f.partidos.map((p, i) => `<tr>
      <td class="num" style="color:var(--tinta-500)">${p.numero}</td>
      <td>${escaparHtml(p.local)} <span style="color:var(--tinta-400)">vs</span> ${escaparHtml(p.visitante)}</td>
      <td><div class="opciones">${["1", "X", "2"].map((op) => `<button type="button" class="opcion${estado.valores[i] === op ? " activa" : ""}"
        data-accion="pron-manual" data-indice="${i}" data-valor="${op}"><span class="simbolo">${op}</span></button>`).join("")}</div></td>
    </tr>`).join("") + `</tbody></table></div>`;

  if (estado.error) cuerpo += avisoHtml("error", escaparHtml(estado.error));

  cuerpo += `<div class="fila-botones">
    <button class="boton primario" data-accion="guardar-manual"${estado.participante.trim() ? "" : " disabled"}>Guardar boleta</button>
    <button class="boton secundario" data-accion="cerrar-modal">Cancelar</button>
  </div>
  <p class="ayuda">Si dejás algún partido sin marcar, la boleta queda marcada para revisión:
  el sistema no completa pronósticos por su cuenta.</p>`;

  return marcoModal("Cargar una boleta a mano",
    "Para boletas que el PDF no pudo leer, o que llegaron en papel.", cuerpo);
}

function marcoModal(titulo, descripcion, cuerpo) {
  return `<div class="modal-fondo" data-fondo="1"><div class="modal" role="dialog" aria-modal="true">
    <div class="modal-cabecera">
      <div><h2>${titulo}</h2>${descripcion ? `<p>${descripcion}</p>` : ""}</div>
      <button class="boton sutil chico" data-accion="cerrar-modal" aria-label="Cerrar">${icono(ICO.equis)}</button>
    </div>
    <div class="modal-cuerpo">${cuerpo}</div>
  </div></div>`;
}

/* ------------------------------------------------------------------ render */

const VISTAS = {
  dashboard: vistaDashboard,
  "nueva-fecha": vistaNuevaFecha,
  boletas: vistaBoletas,
  resultados: vistaResultados,
  ranking: vistaRanking,
  ganadores: vistaGanadores,
  revision: vistaRevision,
  historial: vistaHistorial,
  configuracion: vistaConfiguracion,
};

function render() {
  const correccion = correccionActiva();
  const f = fechaActiva();
  const enRevision = correccion ? correccion.resumen.boletasEnRevision : 0;

  document.getElementById("lateral").innerHTML = `
    <div class="marca">
      <div class="marca-logo">P</div>
      <div style="min-width:0">
        <p class="marca-titulo">Corrector de Prode</p>
        <p class="marca-sub">Panel de administración</p>
      </div>
    </div>
    <div class="selector-fecha">
      <label for="sel-fecha">Fecha activa</label>
      <select id="sel-fecha">
        ${App.datos.fechas.length ? "" : `<option value="">— sin fechas —</option>`}
        ${App.datos.fechas.map((x) => `<option value="${x.id}"${x.id === App.fechaActivaId ? " selected" : ""}>${escaparHtml(x.nombre)}</option>`).join("")}
      </select>
      ${f && f.esDemo ? `<p class="aviso-demo-lateral">Datos de demostración</p>` : ""}
    </div>
    <nav class="menu">${NAVEGACION.map((n) => {
      const inhabilitado = n.necesitaFecha && !App.fechaActivaId;
      return `<a class="${App.vista === n.vista ? "activo" : ""}${inhabilitado ? " inhabilitado" : ""}"
        ${inhabilitado ? 'title="Elegí una fecha primero"' : `data-ir="${n.vista}"`}>
        ${icono(n.icono)}<span>${n.texto}</span>
        ${n.vista === "revision" && enRevision > 0 ? `<span class="contador num">${enRevision}</span>` : ""}</a>`;
    }).join("")}</nav>
    <div class="pie-lateral">
      <p class="nota-lateral">Los datos viven en este navegador. Exportá a Excel lo que quieras conservar.</p>
    </div>`;

  document.getElementById("titulo-movil").textContent = f ? f.nombre : "Corrector de Prode";
  document.getElementById("lateral").classList.toggle("abierta", App.menuAbierto);
  document.getElementById("velo").classList.toggle("oculto", !App.menuAbierto);

  const vista = VISTAS[App.vista] || vistaDashboard;
  let html = "";
  if (App.aviso) {
    html += `<div class="bloque-avisos">${avisoHtml(App.aviso.tipo, escaparHtml(App.aviso.texto))}</div>`;
  }
  document.getElementById("vista").innerHTML = html + vista();

  const capa = document.getElementById("modales");
  if (!App.modal) capa.innerHTML = "";
  else if (App.modal.tipo === "detalle") capa.innerHTML = modalDetalle(App.modal);
  else if (App.modal.tipo === "subida") capa.innerHTML = modalSubida(App.modal);
  else if (App.modal.tipo === "manual") capa.innerHTML = modalManual(App.modal);
}

function irA(vista) {
  App.vista = vista;
  App.menuAbierto = false;
  App.aviso = null;
  window.scrollTo(0, 0);
  render();
}

/* ------------------------------------------------------------------ acciones */

function abrirDetalle(boletaId) {
  const correccion = correccionActiva();
  const fila = correccion ? correccion.filas.find((f) => f.boletaId === boletaId) : null;
  if (!fila) return;
  App.modal = {
    tipo: "detalle",
    boletaId,
    editando: false,
    verCrudo: false,
    error: null,
    participante: fila.participante || "",
    numero: fila.numeroBoleta || "",
    valores: correccion.fecha.partidos.map((p) => {
      const d = fila.detalle.find((x) => x.partidoNumero === p.numero);
      return d && d.pronostico ? d.pronostico : "";
    }),
  };
  render();
}

function registrarAuditoria(fecha, accion, detalle) {
  fecha.auditoria.push({ fecha: new Date().toISOString(), accion, detalle });
  fecha.actualizadaEn = new Date().toISOString();
}

function guardarEdicionBoleta() {
  const estado = App.modal;
  const f = fechaActiva();
  const lista = boletasDe(f.id);
  const boleta = lista.find((b) => b.id === estado.boletaId);
  if (!boleta) return;

  const cambios = [];
  const nombre = estado.participante.trim() || null;
  if (nombre !== boleta.participante) {
    cambios.push(`participante: "${boleta.participante || "(vacío)"}" -> "${nombre || "(vacío)"}"`);
    boleta.participante = nombre;
    boleta.participanteConfianza = nombre ? 1 : 0;
  }
  const numero = estado.numero.trim() || null;
  if (numero !== boleta.numeroBoleta) {
    cambios.push(`número: ${boleta.numeroBoleta || "(vacío)"} -> ${numero || "(vacío)"}`);
    boleta.numeroBoleta = numero;
  }

  boleta.pronosticos = f.partidos.map((p, i) => {
    const anterior = boleta.pronosticos.find((x) => x.partidoNumero === p.numero);
    const valor = estado.valores[i] || null;
    const cambio = (anterior ? anterior.valor : null) !== valor;
    if (cambio) cambios.push(`partido ${i + 1}: ${(anterior && anterior.valor) || "(vacío)"} -> ${valor || "(vacío)"}`);
    return {
      partidoNumero: p.numero,
      valor,
      origen: cambio ? "manual" : (anterior ? anterior.origen : "manual"),
      confianza: cambio ? 1 : (anterior ? anterior.confianza : 0),
      evidencia: cambio
        ? "Corregido a mano por el administrador. Lectura original del PDF: " + ((anterior && anterior.evidencia) || "(sin lectura)")
        : (anterior ? anterior.evidencia : ""),
      pagina: anterior ? anterior.pagina : null,
    };
  });

  if (!cambios.length) { App.modal.editando = false; render(); return; }

  boleta.editadaManualmente = true;
  depurarProblemasResueltos(boleta);
  if (boleta.estado !== "resuelta_manual") recalcularEstado(boleta);

  registrarAuditoria(f, "editar-boleta",
    `Boleta ${boleta.numeroBoleta || boleta.id.slice(0, 8)} (${boleta.participante || "sin nombre"}): ${cambios.join(" | ")}`);
  guardar();
  App.modal.editando = false;
  render();
}

async function ejecutarProcesamiento(fecha, archivo, alActualizar) {
  const datos = new Uint8Array(await archivo.arrayBuffer());
  const firma = [0x25, 0x50, 0x44, 0x46];
  if (!firma.every((b, i) => datos[i] === b)) {
    throw new Error("El archivo no es un PDF (no empieza con la firma %PDF).");
  }
  const resultado = await procesarPdf(datos, archivo.name, fecha, alActualizar);

  App.datos.boletas[fecha.id] = resultado.boletas;
  fecha.diagnostico = resultado.diagnostico;
  fecha.estado = fecha.partidos.every((p) => p.resultado !== null) ? "corregida" : "procesada";
  registrarAuditoria(fecha, "procesar-pdf",
    `Archivo "${archivo.name}" (${resultado.diagnostico.paginas} páginas): ${resultado.boletas.length} boletas con la estrategia "${resultado.diagnostico.estrategiaSegmentacion}".`);
  guardar();
  return resultado;
}

function fechaDeEjemplo() {
  const ahora = new Date().toISOString();
  const fecha = {
    id: nuevoId(),
    nombre: "Fecha 13 — Prueba con PDF real",
    cantidadPartidos: PARTIDOS_DEMO.length,
    partidos: PARTIDOS_DEMO.map((p, i) => ({
      numero: i + 1, local: p[0], visitante: p[1], resultado: RESULTADOS_DEMO[i],
    })),
    estado: "borrador",
    esDemo: false,
    config: { desempate: "ninguna", partidoClave: null },
    diagnostico: null,
    auditoria: [{ fecha: ahora, accion: "crear", detalle: "Fecha de prueba creada desde Configuración, lista para subirle el PDF." }],
    creadaEn: ahora,
    actualizadaEn: ahora,
  };
  App.datos.fechas.unshift(fecha);
  App.datos.boletas[fecha.id] = [];
  guardar();
  seleccionarFecha(fecha.id);
  App.modal = { tipo: "subida", archivo: null, procesando: false, progreso: null, etapasHechas: [], error: null, resumen: null };
  irA("boletas");
}

/* ------------------------------------------------------------------ eventos */

function alHacerClic(evento) {
  const objetivo = evento.target;

  const irBoton = objetivo.closest("[data-ir]");
  if (irBoton) { irA(irBoton.getAttribute("data-ir")); return; }

  const filtro = objetivo.closest("[data-filtro]");
  if (filtro) { App.filtroBoletas = filtro.getAttribute("data-filtro"); render(); return; }

  const abrirFecha = objetivo.closest("[data-abrir-fecha]");
  if (abrirFecha) { seleccionarFecha(abrirFecha.getAttribute("data-abrir-fecha")); irA("ranking"); return; }

  const borrarFecha = objetivo.closest("[data-borrar-fecha]");
  if (borrarFecha) {
    const id = borrarFecha.getAttribute("data-borrar-fecha");
    const f = App.datos.fechas.find((x) => x.id === id);
    if (!f || !confirm(`¿Eliminar "${f.nombre}" con todas sus boletas? Esta acción no se puede deshacer.`)) return;
    App.datos.fechas = App.datos.fechas.filter((x) => x.id !== id);
    delete App.datos.boletas[id];
    if (App.fechaActivaId === id) {
      const real = App.datos.fechas.find((x) => !x.esDemo);
      seleccionarFecha((real || App.datos.fechas[0] || {}).id || null);
    }
    guardar();
    render();
    return;
  }

  const verBoleta = objetivo.closest("[data-boleta]");
  if (verBoleta) { abrirDetalle(verBoleta.getAttribute("data-boleta")); return; }

  const fondo = objetivo.closest("[data-fondo]");
  if (fondo && objetivo === fondo) { App.modal = null; render(); return; }

  const accionEl = objetivo.closest("[data-accion]");
  if (!accionEl) return;
  const accion = accionEl.getAttribute("data-accion");

  /* --- selectores de resultado --- */
  if (accion === "res-nueva") {
    const i = Number(accionEl.getAttribute("data-indice"));
    const v = accionEl.getAttribute("data-valor") || null;
    App.formNueva.partidos[i].resultado = App.formNueva.partidos[i].resultado === v ? null : v;
    document.getElementById("nf-partidos").innerHTML = filasNuevaFecha();
    return;
  }
  if (accion === "res-oficial") {
    const i = Number(accionEl.getAttribute("data-indice"));
    const v = accionEl.getAttribute("data-valor") || null;
    App.formResultados.partidos[i].resultado = App.formResultados.partidos[i].resultado === v ? null : v;
    App.formResultados.guardado = false;
    render();
    return;
  }
  if (accion === "pron-manual") {
    const i = Number(accionEl.getAttribute("data-indice"));
    const v = accionEl.getAttribute("data-valor");
    App.modal.valores[i] = App.modal.valores[i] === v ? "" : v;
    render();
    return;
  }

  switch (accion) {
    case "cerrar-modal": App.modal = null; render(); break;

    case "elegir-archivo": document.getElementById("entrada-archivo").click(); break;
    case "quitar-archivo":
      if (App.modal && App.modal.tipo === "subida") App.modal.archivo = null;
      else if (App.formNueva) App.formNueva.archivo = null;
      render();
      break;

    case "crear-fecha": crearFechaDesdeFormulario(); break;
    case "guardar-resultados": guardarResultados(); break;
    case "partido-clave": break;

    case "abrir-subida":
      App.modal = { tipo: "subida", archivo: null, procesando: false, progreso: null, etapasHechas: [], error: null, resumen: null };
      render();
      break;
    case "procesar-subida": procesarDesdeModal(); break;

    case "abrir-manual": {
      const f = fechaActiva();
      App.modal = { tipo: "manual", participante: "", numero: "", valores: f.partidos.map(() => ""), error: null };
      render();
      break;
    }
    case "guardar-manual": guardarBoletaManual(); break;

    case "editar-boleta": App.modal.editando = true; render(); break;
    case "cancelar-edicion": abrirDetalle(App.modal.boletaId); break;
    case "guardar-boleta": guardarEdicionBoleta(); break;
    case "ver-crudo": App.modal.verCrudo = !App.modal.verCrudo; render(); break;

    case "resolver-boleta":
    case "reabrir-boleta": {
      const f = fechaActiva();
      const boleta = boletasDe(f.id).find((b) => b.id === App.modal.boletaId);
      if (!boleta) break;
      if (accion === "resolver-boleta") {
        boleta.estado = "resuelta_manual";
        registrarAuditoria(f, "editar-boleta", `Boleta ${boleta.numeroBoleta || boleta.id.slice(0, 8)}: marcada como revisada`);
      } else {
        boleta.estado = "ok";
        recalcularEstado(boleta);
        registrarAuditoria(f, "editar-boleta", `Boleta ${boleta.numeroBoleta || boleta.id.slice(0, 8)}: reabierta para revisión`);
      }
      boleta.editadaManualmente = true;
      guardar();
      render();
      break;
    }

    case "eliminar-boleta": {
      const f = fechaActiva();
      const boleta = boletasDe(f.id).find((b) => b.id === App.modal.boletaId);
      if (!boleta) break;
      if (!confirm(`¿Eliminar definitivamente la boleta de ${boleta.participante || "(sin nombre)"}? Esta acción no se puede deshacer.`)) break;
      App.datos.boletas[f.id] = boletasDe(f.id).filter((b) => b.id !== boleta.id);
      registrarAuditoria(f, "baja-boleta", `Se eliminó la boleta ${boleta.numeroBoleta || boleta.id.slice(0, 8)} de ${boleta.participante || "sin nombre"}.`);
      guardar();
      App.modal = null;
      render();
      break;
    }

    case "exportar-csv": {
      const c = correccionActiva();
      descargar(nombreArchivoExport(c, "csv"), aCsv(c), "text/csv;charset=utf-8");
      break;
    }
    case "exportar-xlsx": {
      const c = correccionActiva();
      descargar(nombreArchivoExport(c, "xlsx"), aXlsx(c),
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      break;
    }

    case "borrar-demo": {
      if (!confirm("¿Eliminar todas las fechas de demostración? Las fechas reales no se tocan.")) break;
      const ids = App.datos.fechas.filter((f) => f.esDemo).map((f) => f.id);
      App.datos.fechas = App.datos.fechas.filter((f) => !f.esDemo);
      for (const id of ids) delete App.datos.boletas[id];
      App.datos.demoBorrada = true;
      if (ids.indexOf(App.fechaActivaId) >= 0) seleccionarFecha((App.datos.fechas[0] || {}).id || null);
      guardar();
      App.aviso = { tipo: "info", texto: "Se eliminaron las fechas de demostración." };
      render();
      break;
    }
    case "restaurar-demo": {
      App.datos.fechas = App.datos.fechas.filter((f) => !f.esDemo);
      for (const bloque of construirDemo()) {
        App.datos.fechas.push(bloque.fecha);
        App.datos.boletas[bloque.fecha.id] = bloque.boletas;
      }
      App.datos.demoBorrada = false;
      guardar();
      App.aviso = { tipo: "info", texto: "Se restauraron las fechas de demostración." };
      render();
      break;
    }

    case "bajar-pdf": {
      const cual = accionEl.getAttribute("data-cual");
      const id = cual === "limpio" ? "pdf-demo-limpio" : "pdf-demo-errores";
      const nombre = cual === "limpio" ? "boletas-fecha-12.pdf" : "boletas-fecha-12-con-errores.pdf";
      descargar(nombre, base64ABytes(document.getElementById(id).textContent), "application/pdf");
      break;
    }

    case "fecha-ejemplo": fechaDeEjemplo(); break;
  }
}

function alEscribir(evento) {
  const el = evento.target;

  if (el.id === "sel-fecha") { seleccionarFecha(el.value || null); App.formResultados = null; render(); return; }
  if (el.id === "busqueda") {
    App.busqueda = el.value;
    // Sólo se redibuja la tabla para no perder el foco del buscador.
    const correccion = correccionActiva();
    if (!correccion) return;
    const contenedor = document.getElementById("vista");
    const previo = el.selectionStart;
    contenedor.innerHTML = vistaBoletas();
    const nuevo = document.getElementById("busqueda");
    if (nuevo) { nuevo.focus(); nuevo.setSelectionRange(previo, previo); }
    return;
  }
  if (el.id === "entrada-archivo") {
    const archivo = el.files && el.files[0] ? el.files[0] : null;
    if (App.modal && App.modal.tipo === "subida") App.modal.archivo = archivo;
    else if (App.formNueva) App.formNueva.archivo = archivo;
    render();
    return;
  }

  const campo = el.getAttribute("data-campo");
  if (campo === "nombre") { App.formNueva.nombre = el.value; return; }
  if (campo === "cantidad") {
    const n = Math.max(1, Math.min(30, Number(el.value) || 1));
    App.formNueva.cantidad = n;
    const p = App.formNueva.partidos;
    if (n < p.length) App.formNueva.partidos = p.slice(0, n);
    else while (App.formNueva.partidos.length < n) App.formNueva.partidos.push({ local: "", visitante: "", resultado: null });
    document.getElementById("nf-partidos").innerHTML = filasNuevaFecha();
    return;
  }

  const partido = el.getAttribute("data-partido");
  if (partido) { App.formNueva.partidos[Number(el.getAttribute("data-indice"))][partido] = el.value; return; }

  const resultado = el.getAttribute("data-resultado");
  if (resultado) {
    App.formResultados.partidos[Number(el.getAttribute("data-indice"))][resultado] = el.value;
    App.formResultados.guardado = false;
    return;
  }

  const detalle = el.getAttribute("data-detalle");
  if (detalle === "participante") { App.modal.participante = el.value; return; }
  if (detalle === "numero") { App.modal.numero = el.value; return; }

  const pron = el.getAttribute("data-pron");
  if (pron !== null) { App.modal.valores[Number(pron)] = el.value; return; }

  const manual = el.getAttribute("data-manual");
  if (manual === "participante") {
    App.modal.participante = el.value;
    const boton = document.querySelector('[data-accion="guardar-manual"]');
    if (boton) boton.disabled = !el.value.trim();
    return;
  }
  if (manual === "numero") { App.modal.numero = el.value; return; }
}

function alCambiar(evento) {
  const el = evento.target;
  const desempate = el.getAttribute("data-desempate");
  if (desempate) {
    App.formResultados.desempate = desempate;
    if (desempate !== "partido_clave") App.formResultados.partidoClave = null;
    else if (!App.formResultados.partidoClave) App.formResultados.partidoClave = 1;
    App.formResultados.guardado = false;
    render();
    return;
  }
  if (el.id === "clave") { App.formResultados.partidoClave = Number(el.value); App.formResultados.guardado = false; return; }
}

/* --------------------------------------------------------- acciones largas */

async function crearFechaDesdeFormulario() {
  const s = App.formNueva;
  s.error = null;

  if (!s.nombre.trim()) { s.error = "Poné un nombre o número para la fecha."; render(); return; }
  for (let i = 0; i < s.partidos.length; i++) {
    if (!s.partidos[i].local.trim() || !s.partidos[i].visitante.trim()) {
      s.error = `Faltan los equipos del partido ${i + 1}.`; render(); return;
    }
  }

  const ahora = new Date().toISOString();
  const fecha = {
    id: nuevoId(),
    nombre: s.nombre.trim(),
    cantidadPartidos: s.partidos.length,
    partidos: s.partidos.map((p, i) => ({
      numero: i + 1, local: p.local.trim(), visitante: p.visitante.trim(), resultado: p.resultado,
    })),
    estado: "borrador",
    esDemo: false,
    config: { desempate: "ninguna", partidoClave: null },
    diagnostico: null,
    auditoria: [{ fecha: ahora, accion: "crear", detalle: `Fecha creada con ${s.partidos.length} partidos.` }],
    creadaEn: ahora,
    actualizadaEn: ahora,
  };

  App.datos.fechas.unshift(fecha);
  App.datos.boletas[fecha.id] = [];
  guardar();
  seleccionarFecha(fecha.id);

  if (!s.archivo) { App.formNueva = null; App.formResultados = null; irA("resultados"); return; }

  s.procesando = true;
  s.etapasHechas = [];
  s.progreso = null;
  render();

  try {
    await ejecutarProcesamiento(fecha, s.archivo, (evento) => {
      s.progreso = evento;
      if (s.etapasHechas.indexOf(evento.etapa) < 0) s.etapasHechas.push(evento.etapa);
      const panel = document.querySelector(".barra > div");
      if (panel) {
        // Redibujo puntual para que el navegador pueda pintar el avance.
        document.getElementById("vista").innerHTML = vistaNuevaFecha();
      }
    });
    App.formNueva = null;
    App.formResultados = null;
    irA("boletas");
  } catch (e) {
    s.procesando = false;
    s.error = e && e.message ? e.message : "No se pudo procesar el PDF.";
    render();
  }
}

async function procesarDesdeModal() {
  const estado = App.modal;
  const f = fechaActiva();
  if (!estado.archivo || !f) return;
  if (boletasDe(f.id).length &&
      !confirm("Al procesar el PDF se reemplazan TODAS las boletas de esta fecha, incluidas las correcciones manuales. ¿Continuar?")) {
    return;
  }

  estado.procesando = true;
  estado.error = null;
  estado.resumen = null;
  estado.etapasHechas = [];
  estado.progreso = null;
  render();

  try {
    const resultado = await ejecutarProcesamiento(f, estado.archivo, (evento) => {
      estado.progreso = evento;
      if (estado.etapasHechas.indexOf(evento.etapa) < 0) estado.etapasHechas.push(evento.etapa);
      document.getElementById("modales").innerHTML = modalSubida(estado);
    });
    estado.procesando = false;
    estado.archivo = null;
    estado.resumen = {
      boletas: resultado.boletas.length,
      enRevision: resultado.boletas.filter((b) => b.estado === "revision").length,
    };
    render();
  } catch (e) {
    estado.procesando = false;
    estado.error = e && e.message ? e.message : "No se pudo procesar el PDF.";
    render();
  }
}

function guardarResultados() {
  const s = App.formResultados;
  const f = fechaActiva();
  const cambios = [];

  s.partidos.forEach((p, i) => {
    const previo = f.partidos[i];
    if (previo.resultado !== p.resultado) {
      cambios.push(`resultado del partido ${i + 1}: ${previo.resultado || "(vacío)"} -> ${p.resultado || "(vacío)"}`);
    }
    previo.local = p.local.trim() || previo.local;
    previo.visitante = p.visitante.trim() || previo.visitante;
    previo.resultado = p.resultado;
  });
  if (s.desempate !== f.config.desempate) cambios.push(`desempate: ${f.config.desempate} -> ${s.desempate}`);
  f.config = { desempate: s.desempate, partidoClave: s.partidoClave };

  const hayBoletas = boletasDe(f.id).length > 0;
  const todos = f.partidos.every((p) => p.resultado !== null);
  f.estado = hayBoletas ? (todos ? "corregida" : "procesada") : "borrador";

  if (cambios.length) registrarAuditoria(f, "editar", cambios.join(" | "));
  else f.actualizadaEn = new Date().toISOString();

  guardar();
  s.guardado = true;
  App.formResultados = null;
  render();
}

function guardarBoletaManual() {
  const estado = App.modal;
  const f = fechaActiva();
  const nombre = estado.participante.trim();
  if (!nombre) { estado.error = "Poné el nombre del participante."; render(); return; }

  const ahora = new Date().toISOString();
  const pronosticos = f.partidos.map((p, i) => ({
    partidoNumero: p.numero,
    valor: estado.valores[i] || null,
    origen: "manual",
    confianza: 1,
    evidencia: "Cargado a mano por el administrador.",
    pagina: null,
  }));

  const boleta = {
    id: nuevoId(),
    fechaId: f.id,
    participante: nombre,
    participanteConfianza: 1,
    participanteEvidencia: "Cargado a mano por el administrador.",
    numeroBoleta: estado.numero.trim() || null,
    paginas: [],
    pronosticos,
    problemas: pronosticos.some((p) => p.valor === null)
      ? [problema("BOLETA_INCOMPLETA", "error", "La boleta tiene partidos sin pronóstico cargado.")]
      : [],
    estado: "ok",
    textoCrudo: "Boleta cargada manualmente (sin origen en PDF).",
    origen: "manual",
    editadaManualmente: true,
    metodoDeteccion: "carga-manual",
    creadaEn: ahora,
  };
  recalcularEstado(boleta);

  if (!App.datos.boletas[f.id]) App.datos.boletas[f.id] = [];
  App.datos.boletas[f.id].push(boleta);
  registrarAuditoria(f, "alta-boleta", `Boleta cargada a mano para ${nombre}.`);
  guardar();
  App.modal = null;
  render();
}

/* ------------------------------------------------------------------ arranque */

function iniciar() {
  if (!Almacen.disponible()) {
    document.getElementById("vista").innerHTML = avisoHtml("error",
      "Este navegador tiene bloqueado el almacenamiento local, así que la aplicación no puede guardar nada. Probá fuera del modo incógnito o habilitá las cookies para este sitio.");
    return;
  }

  cargarInicial();
  render();

  document.addEventListener("click", alHacerClic);
  document.addEventListener("input", alEscribir);
  document.addEventListener("change", alCambiar);

  document.getElementById("boton-menu").addEventListener("click", () => {
    App.menuAbierto = !App.menuAbierto;
    render();
  });
  document.getElementById("velo").addEventListener("click", () => {
    App.menuAbierto = false;
    render();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && App.modal) { App.modal = null; render(); }
  });

  // Arrastrar y soltar el PDF sobre la zona de carga
  document.addEventListener("dragover", (e) => {
    if (e.target.closest("#zona-archivo")) e.preventDefault();
  });
  document.addEventListener("drop", (e) => {
    const zona = e.target.closest("#zona-archivo");
    if (!zona) return;
    e.preventDefault();
    const archivo = e.dataTransfer.files && e.dataTransfer.files[0];
    if (!archivo) return;
    if (App.modal && App.modal.tipo === "subida") App.modal.archivo = archivo;
    else if (App.formNueva) App.formNueva.archivo = archivo;
    render();
  });
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar);
else iniciar();
