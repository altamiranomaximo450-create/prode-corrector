/**
 * Motor de corrección.
 *
 * Función pura: dadas una fecha (con sus partidos y resultados oficiales) y sus
 * boletas, produce el detalle partido a partido, el ranking y el Top 5.
 *
 * Principios:
 *  - Nunca inventa un pronóstico ni un resultado. Lo que falta, falta.
 *  - Todo puntaje es reconstruible: cada acierto lleva su evidencia textual.
 *  - Una boleta marcada para revisión NO entra al ranking hasta que un humano
 *    la resuelva; aparece igualmente listada para que nadie quede invisible.
 */

import type {
  Boleta,
  DetallePartido,
  Fecha,
  FilaCorreccion,
  FilaRanking,
  GrupoPuesto,
  ResultadoCorreccion,
  ResumenFecha,
} from "./tipos";

export function normalizarNombre(nombre: string | null): string {
  if (!nombre) return "";
  return nombre
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function etiquetaOpciones(d: { pronostico: string | null; opciones: string[] }): string {
  return d.opciones.length ? d.opciones.join("/") : (d.pronostico ?? "—");
}

function construirExplicacion(fila: Omit<FilaCorreccion, "explicacion">): string {
  const acertados = fila.detalle
    .filter((d) => d.estado === "acierto")
    .map((d) => `#${d.partidoNumero} ${d.local} vs ${d.visitante} (${etiquetaOpciones(d)})`);
  const fallados = fila.detalle
    .filter((d) => d.estado === "error")
    .map(
      (d) =>
        `#${d.partidoNumero} ${d.local} vs ${d.visitante} (marcó ${etiquetaOpciones(d)}, salió ${d.resultado})`,
    );
  const sinPronostico = fila.detalle.filter((d) => d.estado === "sin_pronostico");
  const sinResultado = fila.detalle.filter((d) => d.estado === "sin_resultado");

  const partes: string[] = [];
  partes.push(`Obtuvo ${fila.aciertos} de ${fila.partidosEvaluados} aciertos posibles.`);
  if (acertados.length) partes.push(`Acertó: ${acertados.join("; ")}.`);
  if (fallados.length) partes.push(`Falló: ${fallados.join("; ")}.`);
  if (sinPronostico.length) {
    partes.push(
      `Sin pronóstico legible en: ${sinPronostico
        .map((d) => `#${d.partidoNumero}`)
        .join(", ")}.`,
    );
  }
  if (sinResultado.length) {
    partes.push(
      `Sin resultado oficial cargado en: ${sinResultado
        .map((d) => `#${d.partidoNumero}`)
        .join(", ")} (no computan para nadie).`,
    );
  }
  return partes.join(" ");
}

export function corregirBoleta(fecha: Fecha, boleta: Boleta): FilaCorreccion {
  const porNumero = new Map(boleta.pronosticos.map((p) => [p.partidoNumero, p]));
  const detalle: DetallePartido[] = [];

  let aciertos = 0;
  let errores = 0;
  let sinPronostico = 0;
  let partidosEvaluados = 0;

  for (const partido of fecha.partidos) {
    const pron = porNumero.get(partido.numero) ?? null;
    const valor = pron?.valor ?? null;
    // Compatibilidad: si por algún motivo no viene `opciones` (datos viejos),
    // se reconstruye a partir de `valor`.
    const opciones = pron?.opciones ?? (valor ? [valor] : []);
    const resultado = partido.resultado;

    let estado: DetallePartido["estado"];
    if (resultado === null) {
      estado = "sin_resultado";
    } else {
      partidosEvaluados += 1;
      if (opciones.length === 0) {
        estado = "sin_pronostico";
        sinPronostico += 1;
      } else if (opciones.includes(resultado)) {
        // Doble o simple: acierta si el resultado oficial está entre las
        // opciones marcadas.
        estado = "acierto";
        aciertos += 1;
      } else {
        estado = "error";
        errores += 1;
      }
    }

    detalle.push({
      partidoNumero: partido.numero,
      local: partido.local,
      visitante: partido.visitante,
      pronostico: valor,
      opciones,
      resultado,
      estado,
      evidencia: pron?.evidencia ?? "",
      origen: pron?.origen ?? "pdf",
    });
  }

  const porcentaje =
    partidosEvaluados > 0 ? Math.round((aciertos / partidosEvaluados) * 1000) / 10 : 0;

  const elegible = boleta.estado !== "revision";
  const motivoNoElegible = elegible
    ? null
    : "La boleta requiere revisión manual: no se computa en el ranking hasta resolverla.";

  const base = {
    boletaId: boleta.id,
    participante: boleta.participante,
    numeroBoleta: boleta.numeroBoleta,
    aciertos,
    errores,
    sinPronostico,
    partidosEvaluados,
    porcentaje,
    detalle,
    estado: boleta.estado,
    problemas: boleta.problemas,
    elegible,
    motivoNoElegible,
    paginas: boleta.paginas,
    origen: boleta.origen,
  };

  return { ...base, explicacion: construirExplicacion(base) };
}

function puntajePartidoClave(fila: FilaCorreccion, clave: number): number {
  const d = fila.detalle.find((x) => x.partidoNumero === clave);
  return d && d.estado === "acierto" ? 1 : 0;
}

function numeroDeBoleta(fila: FilaCorreccion): number {
  const n = Number((fila.numeroBoleta ?? "").replace(/\D/g, ""));
  return Number.isFinite(n) && n > 0 ? n : Number.MAX_SAFE_INTEGER;
}

/** Ordena aplicando la regla de desempate configurada; si no hay, deja el empate visible. */
function comparar(fecha: Fecha, a: FilaCorreccion, b: FilaCorreccion): number {
  if (b.aciertos !== a.aciertos) return b.aciertos - a.aciertos;

  if (fecha.config.desempate === "partido_clave" && fecha.config.partidoClave) {
    const dif =
      puntajePartidoClave(b, fecha.config.partidoClave) -
      puntajePartidoClave(a, fecha.config.partidoClave);
    if (dif !== 0) return dif;
  }

  if (fecha.config.desempate === "orden_boleta") {
    const dif = numeroDeBoleta(a) - numeroDeBoleta(b);
    if (dif !== 0) return dif;
  }

  // Sin regla que los separe: orden alfabético SOLO para que el listado sea
  // estable y reproducible. No desempata: ambos conservan la misma posición.
  return normalizarNombre(a.participante).localeCompare(normalizarNombre(b.participante));
}

/** Dos filas comparten posición si la regla de desempate configurada no las separa. */
function empatanEnPosicion(fecha: Fecha, a: FilaCorreccion, b: FilaCorreccion): boolean {
  if (a.aciertos !== b.aciertos) return false;
  if (fecha.config.desempate === "ninguna") return true;
  if (fecha.config.desempate === "partido_clave" && fecha.config.partidoClave) {
    return (
      puntajePartidoClave(a, fecha.config.partidoClave) ===
      puntajePartidoClave(b, fecha.config.partidoClave)
    );
  }
  if (fecha.config.desempate === "orden_boleta") {
    return numeroDeBoleta(a) === numeroDeBoleta(b);
  }
  return true;
}

export function corregirFecha(fecha: Fecha, boletas: Boleta[]): ResultadoCorreccion {
  const filas = boletas.map((b) => corregirBoleta(fecha, b));

  const elegibles = filas.filter((f) => f.elegible);
  const enRevision = filas.filter((f) => !f.elegible);

  const ordenadas = [...elegibles].sort((a, b) => comparar(fecha, a, b));

  const ranking: FilaRanking[] = [];
  let posicion = 0;
  for (let i = 0; i < ordenadas.length; i++) {
    const fila = ordenadas[i];
    const anterior = i > 0 ? ordenadas[i - 1] : null;
    // Ranking competitivo estándar: 1, 2, 2, 4...
    if (!(anterior && empatanEnPosicion(fecha, anterior, fila))) {
      posicion = i + 1;
    }
    ranking.push({ ...fila, posicion, empatado: false });
  }

  const cuentaPorPosicion = new Map<number, number>();
  for (const r of ranking) {
    cuentaPorPosicion.set(r.posicion, (cuentaPorPosicion.get(r.posicion) ?? 0) + 1);
  }
  for (const r of ranking) r.empatado = (cuentaPorPosicion.get(r.posicion) ?? 0) > 1;

  const top5: GrupoPuesto[] = [];
  for (const puesto of [1, 2, 3, 4, 5] as const) {
    const grupo = ranking.filter((r) => r.posicion === puesto);
    if (grupo.length > 0) {
      top5.push({
        puesto,
        aciertos: grupo[0].aciertos,
        participantes: grupo,
        empate: grupo.length > 1,
      });
    }
  }

  const nombres = new Set(filas.map((f) => normalizarNombre(f.participante)).filter(Boolean));
  const aciertosElegibles = elegibles.map((f) => f.aciertos);

  const resumen: ResumenFecha = {
    boletasTotales: filas.length,
    boletasOk: filas.filter((f) => f.estado === "ok").length,
    boletasEnRevision: filas.filter((f) => f.estado === "revision").length,
    boletasResueltasManualmente: filas.filter((f) => f.estado === "resuelta_manual").length,
    participantes: nombres.size,
    partidosConResultado: fecha.partidos.filter((p) => p.resultado !== null).length,
    partidosSinResultado: fecha.partidos.filter((p) => p.resultado === null).length,
    promedioAciertos: aciertosElegibles.length
      ? Math.round(
          (aciertosElegibles.reduce((a, b) => a + b, 0) / aciertosElegibles.length) * 100,
        ) / 100
      : null,
    maximoAciertos: aciertosElegibles.length ? Math.max(...aciertosElegibles) : null,
    minimoAciertos: aciertosElegibles.length ? Math.min(...aciertosElegibles) : null,
  };

  const advertencias: string[] = [];
  if (resumen.partidosSinResultado > 0) {
    const faltan = fecha.partidos
      .filter((p) => p.resultado === null)
      .map((p) => `#${p.numero}`)
      .join(", ");
    advertencias.push(
      `Faltan resultados oficiales en ${resumen.partidosSinResultado} partido(s): ${faltan}. Esos partidos no se computan para nadie.`,
    );
  }
  if (resumen.boletasEnRevision > 0) {
    advertencias.push(
      `${resumen.boletasEnRevision} boleta(s) requieren revisión manual y están excluidas del ranking.`,
    );
  }
  if (filas.length === 0) {
    advertencias.push("Todavía no hay boletas cargadas en esta fecha.");
  }

  return { fecha, filas, ranking, enRevision, top5, resumen, advertencias };
}
