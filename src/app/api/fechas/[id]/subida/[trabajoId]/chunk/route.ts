import { agregarChunk, obtenerTrabajo } from "@/lib/trabajos";
import { error, json, leerJson, manejarError } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Contexto = { params: Promise<{ id: string; trabajoId: string }> };

/** Confirma que el navegador ya escribió una parte en Storage. */
export async function POST(req: Request, { params }: Contexto) {
  try {
    const { id, trabajoId } = await params;
    const trabajo = await obtenerTrabajo(trabajoId);
    if (!trabajo || trabajo.fechaId !== id) return error("El trabajo no existe.", 404);

    const cuerpo = await leerJson<{
      indice?: unknown;
      paginaDesde?: unknown;
      paginaHasta?: unknown;
      storagePath?: unknown;
      bytes?: unknown;
    }>(req);

    const indice = Number(cuerpo.indice);
    const paginaDesde = Number(cuerpo.paginaDesde);
    const paginaHasta = Number(cuerpo.paginaHasta);
    const bytes = Number(cuerpo.bytes);
    const storagePath = String(cuerpo.storagePath ?? "");
    if (
      !Number.isInteger(indice) ||
      !Number.isInteger(paginaDesde) ||
      !Number.isInteger(paginaHasta) ||
      !Number.isFinite(bytes) ||
      !storagePath
    ) {
      return error("Faltan datos de la parte subida.", 400);
    }

    const actualizado = await agregarChunk(trabajoId, {
      indice,
      paginaDesde,
      paginaHasta,
      storagePath,
      bytes,
      estado: "subido",
    });

    return json({ partesSubidas: actualizado.chunks.length });
  } catch (e) {
    return manejarError(e);
  }
}
