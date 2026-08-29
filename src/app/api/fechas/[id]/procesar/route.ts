import { obtenerAlmacen } from "@/lib/almacen";
import { error, manejarError } from "@/lib/api";
import { procesarPdf, type EventoProgreso } from "@/lib/pdf/procesar";
import { maxPdfBytes, procesamientoHabilitado } from "@/lib/servicio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Un PDF grande puede tardar; en Vercel el máximo del plan gratuito es 60 s. */
export const maxDuration = 60;

type Contexto = { params: Promise<{ id: string }> };

const CABECERA_PDF = [0x25, 0x50, 0x44, 0x46]; // "%PDF"

/**
 * Procesa el PDF y devuelve el progreso como Server-Sent Events.
 *
 * Es progreso REAL: cada evento se emite cuando la etapa efectivamente ocurrió
 * (por ejemplo, una vez leída cada página), no con un temporizador decorativo.
 */
export async function POST(req: Request, { params }: Contexto) {
  try {
    const { id } = await params;

    if (!procesamientoHabilitado()) {
      return error(
        "El procesamiento de PDF está desactivado en este entorno (PROCESAMIENTO_HABILITADO=off).",
        503,
      );
    }

    const almacen = obtenerAlmacen();
    const fecha = await almacen.obtenerFecha(id);
    if (!fecha) return error("La fecha no existe.", 404);
    if (fecha.esDemo) {
      return error(
        "Esta es una fecha de demostración y no admite carga de PDF. Creá una fecha nueva para procesar boletas reales.",
        400,
      );
    }

    const formulario = await req.formData();
    const archivo = formulario.get("archivo");
    if (!(archivo instanceof File)) {
      return error("No se recibió ningún archivo.", 400);
    }

    const limite = maxPdfBytes();
    if (archivo.size > limite) {
      return error(
        `El PDF pesa ${(archivo.size / 1024 / 1024).toFixed(1)} MB y el máximo admitido acá es ${(limite / 1024 / 1024).toFixed(1)} MB.`,
        413,
      );
    }
    if (archivo.size === 0) return error("El archivo está vacío.", 400);

    const datos = new Uint8Array(await archivo.arrayBuffer());
    const esPdf = CABECERA_PDF.every((b, i) => datos[i] === b);
    if (!esPdf) {
      return error("El archivo no es un PDF (no empieza con la firma %PDF).", 415);
    }

    const codificador = new TextEncoder();

    const flujo = new ReadableStream({
      async start(controlador) {
        const enviar = (evento: EventoProgreso | { etapa: "error"; mensaje: string } | Record<string, unknown>) => {
          controlador.enqueue(codificador.encode(`data: ${JSON.stringify(evento)}\n\n`));
        };

        try {
          const resultado = await procesarPdf(datos, archivo.name, fecha, enviar);

          await almacen.reemplazarBoletas(id, resultado.boletas);

          fecha.diagnostico = resultado.diagnostico;
          fecha.estado = fecha.partidos.every((p) => p.resultado !== null)
            ? "corregida"
            : "procesada";
          fecha.actualizadaEn = new Date().toISOString();
          fecha.auditoria.push({
            fecha: fecha.actualizadaEn,
            accion: "procesar-pdf",
            detalle: `Archivo "${archivo.name}" (${resultado.diagnostico.paginas} páginas): ${resultado.boletas.length} boletas con la estrategia "${resultado.diagnostico.estrategiaSegmentacion}".`,
          });
          await almacen.guardarFecha(fecha);

          enviar({
            etapa: "resultado",
            boletas: resultado.boletas.length,
            enRevision: resultado.boletas.filter((b) => b.estado === "revision").length,
            diagnostico: resultado.diagnostico,
            problemasGlobales: resultado.problemasGlobales,
          });
        } catch (e) {
          const mensaje =
            e instanceof Error
              ? e.message
              : "Error desconocido al procesar el PDF.";
          if (!(e instanceof Error) || e.name !== "ErrorProcesamiento") {
            console.error("[prode] fallo procesando PDF:", e);
          }
          enviar({ etapa: "error", mensaje });
        } finally {
          controlador.close();
        }
      },
    });

    return new Response(flujo, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-store, no-transform",
        Connection: "keep-alive",
        // Evita que un proxy intermedio acumule la respuesta y anule el progreso.
        "X-Accel-Buffering": "no",
      },
    });
  } catch (e) {
    return manejarError(e);
  }
}
