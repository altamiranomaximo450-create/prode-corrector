/**
 * Motor de corrección. Función pura y 100% determinística.
 *
 * Reglas:
 *  - Los resultados oficiales que cargó el usuario son la única fuente de verdad.
 *  - Un pronóstico acierta si CONTIENE el resultado oficial. Eso hace que un
 *    doble ("1/X") acierte tanto con "1" como con "X", y falle con "2".
 *  - Un partido sin resultado oficial no computa para nadie (ni suma ni resta).
 *  - Ninguna boleta queda excluida: si algo no se leyó, ese partido vale 0 y la
 *    boleta sigue compitiendo con el resto.
 *  - Los empates conservan a todos los participantes: comparten posición.
 */

import type {
  Boleta,
  DetallePartido,
  Fecha,
  FilaRanking,
  ResultadoCorreccion,
  ResumenFecha,
} from "./tipos";

interface FilaCalculada extends Omit<FilaRanking, "posicion" | "empatado"> {
  /** Primera página donde aparece la boleta. Sólo se usa para desempatar de forma estable. */
  primeraPagina: number;
  /** Posición dentro del PDF. Último criterio de desempate, y el que garantiza reproducibilidad. */
  orden: number;
}

function corregirBoleta(fecha: Fecha, boleta: Boleta): FilaCalculada {
  const porNumero = new Map(boleta.pronosticos.map((p) => [p.partidoNumero, p]));
  const detalle: DetallePartido[] = [];

  let aciertos = 0;
  let partidosEvaluados = 0;

  for (const partido of fecha.partidos) {
    const pron = porNumero.get(partido.numero);
    const opciones = pron?.opciones ?? [];
    const resultado = partido.resultado;

    let estado: DetallePartido["estado"];
    if (resultado === null) {
      estado = "sin_resultado";
    } else {
      partidosEvaluados += 1;
      if (opciones.length === 0) {
        estado = "sin_pronostico";
      } else if (opciones.includes(resultado)) {
        estado = "acierto";
        aciertos += 1;
      } else {
        estado = "error";
      }
    }

    detalle.push({
      partidoNumero: partido.numero,
      nombre: partido.nombre,
      opciones,
      resultado,
      estado,
      evidencia: pron?.evidencia ?? "",
    });
  }

  return {
    boletaId: boleta.id,
    participante: boleta.participante,
    numeroBoleta: boleta.numeroBoleta,
    paginas: boleta.paginas,
    aciertos,
    partidosEvaluados,
    porcentaje:
      partidosEvaluados > 0 ? Math.round((aciertos / partidosEvaluados) * 1000) / 10 : 0,
    detalle,
    primeraPagina: boleta.paginas[0] ?? Number.MAX_SAFE_INTEGER,
    orden: boleta.orden,
  };
}

/** Número de boleta como entero, para ordenar. Sin número va al final. */
function numeroDeBoleta(fila: FilaCalculada): number {
  const n = Number((fila.numeroBoleta ?? "").replace(/\D/g, ""));
  return Number.isFinite(n) && n > 0 ? n : Number.MAX_SAFE_INTEGER;
}

/**
 * Orden determinístico. Primero los aciertos; a igualdad de aciertos se aplican
 * criterios estables para que el mismo PDF produzca SIEMPRE el mismo listado.
 *
 * El último criterio es el orden de aparición en el PDF, no el id: el id es un
 * UUID nuevo en cada procesamiento y usarlo hacía que dos corridas del mismo
 * archivo ordenaran distinto a los empatados.
 *
 * Estos criterios sólo fijan el orden de impresión: los empatados conservan la
 * misma posición en el ranking y ninguno se elimina.
 */
function comparar(a: FilaCalculada, b: FilaCalculada): number {
  if (b.aciertos !== a.aciertos) return b.aciertos - a.aciertos;
  const porNumero = numeroDeBoleta(a) - numeroDeBoleta(b);
  if (porNumero !== 0) return porNumero;
  if (a.primeraPagina !== b.primeraPagina) return a.primeraPagina - b.primeraPagina;
  const porNombre = a.participante.localeCompare(b.participante, "es");
  if (porNombre !== 0) return porNombre;
  return a.orden - b.orden;
}

export function corregirFecha(fecha: Fecha, boletas: Boleta[]): ResultadoCorreccion {
  const filas = boletas.map((b) => corregirBoleta(fecha, b)).sort(comparar);

  // Ranking competitivo estándar: 1, 2, 2, 4... Empatar no elimina a nadie.
  const ranking: FilaRanking[] = [];
  let posicion = 0;
  for (let i = 0; i < filas.length; i++) {
    const { primeraPagina: _p, orden: _o, ...fila } = filas[i];
    if (i === 0 || filas[i - 1].aciertos !== filas[i].aciertos) posicion = i + 1;
    ranking.push({ ...fila, posicion, empatado: false });
  }
  const cuenta = new Map<number, number>();
  for (const r of ranking) cuenta.set(r.posicion, (cuenta.get(r.posicion) ?? 0) + 1);
  for (const r of ranking) r.empatado = (cuenta.get(r.posicion) ?? 0) > 1;

  const resumen: ResumenFecha = {
    boletas: filas.length,
    partidosConResultado: fecha.partidos.filter((p) => p.resultado !== null).length,
    partidosSinResultado: fecha.partidos.filter((p) => p.resultado === null).length,
    maximoAciertos: filas.length ? Math.max(...filas.map((f) => f.aciertos)) : null,
  };

  return { fecha, ranking, resumen };
}

/** Las primeras 10 posiciones. Si hay empate en la 10ª, entran todos los empatados. */
export function top10(ranking: FilaRanking[]): FilaRanking[] {
  return ranking.filter((r) => r.posicion <= 10);
}
