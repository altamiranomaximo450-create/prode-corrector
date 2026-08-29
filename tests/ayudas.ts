import type { Boleta, Fecha, Pronostico, ProblemaBoleta } from "@/lib/tipos";

export function crearFecha(
  resultados: (Pronostico | null)[],
  opciones: Partial<Fecha> = {},
): Fecha {
  return {
    id: "fecha-test",
    nombre: "Fecha de prueba",
    cantidadPartidos: resultados.length,
    partidos: resultados.map((r, i) => ({
      numero: i + 1,
      local: `Local ${i + 1}`,
      visitante: `Visitante ${i + 1}`,
      resultado: r,
    })),
    estado: "corregida",
    esDemo: false,
    config: { desempate: "ninguna", partidoClave: null },
    diagnostico: null,
    auditoria: [],
    creadaEn: "2026-01-01T00:00:00.000Z",
    actualizadaEn: "2026-01-01T00:00:00.000Z",
    ...opciones,
  };
}

export function crearBoleta(
  id: string,
  participante: string | null,
  pronosticos: (Pronostico | null)[],
  opciones: Partial<Boleta> = {},
): Boleta {
  const problemas: ProblemaBoleta[] = opciones.problemas ?? [];
  return {
    id,
    fechaId: "fecha-test",
    participante,
    participanteConfianza: participante ? 0.96 : 0,
    participanteEvidencia: participante ? `Participante: ${participante}` : null,
    numeroBoleta: opciones.numeroBoleta ?? (id.replace(/\D/g, "") || null),
    paginas: [1],
    pronosticos: pronosticos.map((v, i) => ({
      partidoNumero: i + 1,
      valor: v,
      origen: "pdf" as const,
      confianza: v ? 0.95 : 0,
      evidencia: `renglon ${i + 1}`,
      pagina: 1,
    })),
    problemas,
    estado: problemas.some((p) => p.severidad === "error") ? "revision" : "ok",
    textoCrudo: "texto de prueba",
    origen: "pdf",
    editadaManualmente: false,
    metodoDeteccion: "grilla-columnas",
    creadaEn: "2026-01-01T00:00:00.000Z",
    ...opciones,
  };
}

export function problemaError(mensaje = "problema de prueba"): ProblemaBoleta {
  return {
    codigo: "CANTIDAD_PRONOSTICOS",
    severidad: "error",
    mensaje,
    pagina: 1,
    textoProblematico: null,
    partidoNumero: null,
  };
}
