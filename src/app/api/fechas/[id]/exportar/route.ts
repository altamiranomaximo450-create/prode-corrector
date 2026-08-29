import { error, manejarError } from "@/lib/api";
import { aCsv, aXlsx, nombreArchivo } from "@/lib/exportar";
import { obtenerCorreccion } from "@/lib/servicio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Contexto = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Contexto) {
  try {
    const { id } = await params;
    const formato = (new URL(req.url).searchParams.get("formato") ?? "csv").toLowerCase();

    const correccion = await obtenerCorreccion(id);
    if (!correccion) return error("La fecha no existe.", 404);

    if (formato === "csv") {
      return new Response(aCsv(correccion), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${nombreArchivo(correccion, "csv")}"`,
          "Cache-Control": "no-store, private",
        },
      });
    }

    if (formato === "xlsx" || formato === "excel") {
      const buffer = await aXlsx(correccion);
      return new Response(new Uint8Array(buffer), {
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="${nombreArchivo(correccion, "xlsx")}"`,
          "Cache-Control": "no-store, private",
        },
      });
    }

    return error('Formato no soportado. Usá "csv" o "xlsx".', 400);
  } catch (e) {
    return manejarError(e);
  }
}
