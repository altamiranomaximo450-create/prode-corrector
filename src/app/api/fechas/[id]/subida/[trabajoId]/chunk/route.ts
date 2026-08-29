import { agregarChunk, obtenerTrabajo } from "@/lib/almacen/trabajos";
import { error, json, leerJson, manejarError } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Contexto = { params: Promise<{ id: string; trabajoId: string }> };

/** Confirma que un chunk ya se subió a Storage (el navegador ya lo escribió con el token firmado). */
export async function POST(req: Request, { params }: Contexto) {
  try {
    const { id, trabajoId } = await params;
    const trabajo = await obtenerTrabajo(trabajoId);
    if (!trabajo || trabajo.fechaId !== id) return error("El trabajo no existe.", 404);
    if (trabajo.estado !== "subiendo") {
      return error("Este trabajo ya no admite más chunks.", 409);
    }

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
      return error("Faltan datos del chunk.", 400);
    }

    const actualizado = await agregarChunk(trabajoId, {
      indice,
      paginaDesde,
      paginaHasta,
      storagePath,
      bytes,
      estado: "subido",
    });

    return json({ chunksSubidos: actualizado.chunks.length });
  } catch (e) {
    return manejarError(e);
  }
}
