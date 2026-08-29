/**
 * Exportación de resultados a CSV y Excel.
 *
 * El CSV usa punto y coma y lleva BOM UTF-8: así Excel en español lo abre en
 * columnas y con los acentos bien, sin pasar por el asistente de importación.
 */

import type { FilaCorreccion, ResultadoCorreccion } from "./tipos";

const SEP = ";";

function celda(valor: unknown): string {
  const s = valor === null || valor === undefined ? "" : String(valor);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function simbolo(estado: FilaCorreccion["detalle"][number]["estado"]): string {
  switch (estado) {
    case "acierto":
      return "ACIERTO";
    case "error":
      return "ERROR";
    case "sin_pronostico":
      return "SIN PRONOSTICO";
    default:
      return "SIN RESULTADO";
  }
}

function etiquetaOpciones(d: { pronostico: string | null; opciones: string[] }): string {
  return d.opciones.length ? d.opciones.join("/") : (d.pronostico ?? "-");
}

function estadoLegible(fila: FilaCorreccion): string {
  if (fila.estado === "revision") return "REQUIERE REVISION MANUAL";
  if (fila.estado === "resuelta_manual") return "Revisada a mano";
  return "OK";
}

function filasOrdenadas(correccion: ResultadoCorreccion) {
  return [
    ...correccion.ranking.map((r) => ({ posicion: String(r.posicion), fila: r as FilaCorreccion })),
    ...correccion.enRevision.map((f) => ({ posicion: "-", fila: f })),
  ];
}

export function nombreArchivo(correccion: ResultadoCorreccion, extension: string): string {
  const base = correccion.fecha.nombre
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  return `prode-${base || "fecha"}.${extension}`;
}

export function aCsv(correccion: ResultadoCorreccion): string {
  const { fecha, resumen } = correccion;
  const lineas: string[] = [];

  lineas.push(["PRODE - RESULTADOS", fecha.nombre].map(celda).join(SEP));
  if (fecha.esDemo) lineas.push(celda("*** DATOS DE DEMOSTRACION - NO SON REALES ***"));
  lineas.push(["Generado", new Date().toLocaleString("es-AR")].map(celda).join(SEP));
  lineas.push(
    ["Boletas", resumen.boletasTotales, "En revision", resumen.boletasEnRevision]
      .map(celda)
      .join(SEP),
  );
  lineas.push("");

  lineas.push(celda("RESULTADOS OFICIALES"));
  lineas.push(["Partido", "Local", "Visitante", "Resultado"].map(celda).join(SEP));
  for (const p of fecha.partidos) {
    lineas.push(
      [p.numero, p.local, p.visitante, p.resultado ?? "SIN CARGAR"].map(celda).join(SEP),
    );
  }
  lineas.push("");

  lineas.push(celda("RANKING"));
  const encabezado = [
    "Posicion",
    "Participante",
    "Boleta",
    "Aciertos",
    "Errores",
    "Sin pronostico",
    "Porcentaje",
    "Estado",
    "Paginas del PDF",
    ...fecha.partidos.map((p) => `P${p.numero} ${p.local} vs ${p.visitante}`),
  ];
  lineas.push(encabezado.map(celda).join(SEP));

  for (const { posicion, fila } of filasOrdenadas(correccion)) {
    const base = [
      posicion,
      fila.participante ?? "(sin nombre)",
      fila.numeroBoleta ?? "",
      fila.aciertos,
      fila.errores,
      fila.sinPronostico,
      `${fila.porcentaje}%`,
      estadoLegible(fila),
      fila.paginas.join(" "),
    ];
    const detalle = fila.detalle.map(
      (d) => `${etiquetaOpciones(d)} / ${d.resultado ?? "-"} / ${simbolo(d.estado)}`,
    );
    lineas.push([...base, ...detalle].map(celda).join(SEP));
  }

  if (correccion.enRevision.length > 0) {
    lineas.push("");
    lineas.push(celda("BOLETAS QUE REQUIEREN REVISION MANUAL"));
    lineas.push(["Boleta", "Participante", "Pagina", "Problema", "Detalle"].map(celda).join(SEP));
    for (const fila of correccion.enRevision) {
      for (const p of fila.problemas) {
        lineas.push(
          [
            fila.numeroBoleta ?? "",
            fila.participante ?? "(sin nombre)",
            p.pagina ?? "",
            p.codigo,
            p.mensaje,
          ]
            .map(celda)
            .join(SEP),
        );
      }
    }
  }

  // BOM para que Excel detecte UTF-8.
  return `﻿${lineas.join("\r\n")}\r\n`;
}

export async function aXlsx(correccion: ResultadoCorreccion): Promise<Buffer> {
  const ExcelJS = (await import("exceljs")).default;
  const { fecha } = correccion;
  const libro = new ExcelJS.Workbook();
  libro.creator = "Prode Corrector";
  libro.created = new Date();

  /* --- Hoja 1: ranking ---------------------------------------------------- */
  const hoja = libro.addWorksheet("Ranking");
  hoja.addRow([`PRODE — ${fecha.nombre}`]);
  hoja.getRow(1).font = { bold: true, size: 14 };
  if (fecha.esDemo) {
    hoja.addRow(["DATOS DE DEMOSTRACIÓN — no son datos reales"]);
    hoja.getRow(2).font = { bold: true, color: { argb: "FFB45309" } };
  }
  hoja.addRow([`Generado el ${new Date().toLocaleString("es-AR")}`]);
  hoja.addRow([]);

  const encabezado = [
    "Posición",
    "Participante",
    "Boleta",
    "Aciertos",
    "Errores",
    "Sin pronóstico",
    "Porcentaje",
    "Estado",
    "Páginas del PDF",
    ...fecha.partidos.map((p) => `P${p.numero} ${p.local} vs ${p.visitante}`),
  ];
  const filaEncabezado = hoja.addRow(encabezado);
  filaEncabezado.font = { bold: true };
  filaEncabezado.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF1E293B" },
  };
  filaEncabezado.font = { bold: true, color: { argb: "FFFFFFFF" } };

  const filaResultados = hoja.addRow([
    "",
    "RESULTADO OFICIAL",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    ...fecha.partidos.map((p) => p.resultado ?? "sin cargar"),
  ]);
  filaResultados.font = { bold: true };

  for (const { posicion, fila } of filasOrdenadas(correccion)) {
    const r = hoja.addRow([
      posicion,
      fila.participante ?? "(sin nombre)",
      fila.numeroBoleta ?? "",
      fila.aciertos,
      fila.errores,
      fila.sinPronostico,
      fila.porcentaje / 100,
      estadoLegible(fila),
      fila.paginas.join(", "),
      ...fila.detalle.map((d) => etiquetaOpciones(d)),
    ]);
    r.getCell(7).numFmt = "0.0%";
    fila.detalle.forEach((d, i) => {
      const celdaDetalle = r.getCell(10 + i);
      const color =
        d.estado === "acierto"
          ? "FFDCFCE7"
          : d.estado === "error"
            ? "FFFEE2E2"
            : "FFF1F5F9";
      celdaDetalle.fill = { type: "pattern", pattern: "solid", fgColor: { argb: color } };
      celdaDetalle.alignment = { horizontal: "center" };
    });
    if (!fila.elegible) {
      r.getCell(8).font = { color: { argb: "FFB91C1C" }, bold: true };
    }
  }

  hoja.columns.forEach((col, i) => {
    col.width = i === 1 ? 26 : i < 9 ? 14 : 18;
  });
  hoja.views = [{ state: "frozen", ySplit: 5, xSplit: 2 }];

  /* --- Hoja 2: detalle partido por partido -------------------------------- */
  const detalle = libro.addWorksheet("Detalle por partido");
  const encDetalle = detalle.addRow([
    "Participante",
    "Boleta",
    "Partido",
    "Local",
    "Visitante",
    "Pronóstico",
    "Resultado oficial",
    "Estado",
    "Evidencia leída del PDF",
  ]);
  encDetalle.font = { bold: true, color: { argb: "FFFFFFFF" } };
  encDetalle.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E293B" } };
  for (const fila of correccion.filas) {
    for (const d of fila.detalle) {
      detalle.addRow([
        fila.participante ?? "(sin nombre)",
        fila.numeroBoleta ?? "",
        d.partidoNumero,
        d.local,
        d.visitante,
        etiquetaOpciones(d),
        d.resultado ?? "—",
        simbolo(d.estado),
        d.evidencia,
      ]);
    }
  }
  detalle.columns.forEach((col, i) => {
    col.width = i === 8 ? 60 : i === 0 ? 24 : 16;
  });

  /* --- Hoja 3: revisión manual -------------------------------------------- */
  const revision = libro.addWorksheet("Requieren revisión");
  const encRevision = revision.addRow([
    "Boleta",
    "Participante",
    "Página del PDF",
    "Código",
    "Severidad",
    "Problema",
    "Información problemática",
  ]);
  encRevision.font = { bold: true, color: { argb: "FFFFFFFF" } };
  encRevision.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF991B1B" } };
  for (const fila of correccion.filas) {
    for (const p of fila.problemas) {
      revision.addRow([
        fila.numeroBoleta ?? "",
        fila.participante ?? "(sin nombre)",
        p.pagina ?? "",
        p.codigo,
        p.severidad,
        p.mensaje,
        p.textoProblematico ?? "",
      ]);
    }
  }
  revision.columns.forEach((col, i) => {
    col.width = i === 5 ? 70 : i === 6 ? 40 : 18;
  });

  const buffer = await libro.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
