import { json, manejarError } from "@/lib/api";
import { infoAlmacen } from "@/lib/almacen";
import { supabaseAdminConfigurado, MAX_CHUNK_MB } from "@/lib/almacen/trabajos";
import { usandoClavePorDefecto, horasSesion } from "@/lib/auth";
import {
  MAX_PARTIDOS,
  demoHabilitada,
  maxPdfBytes,
  procesamientoHabilitado,
} from "@/lib/servicio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Estado del sistema: qué motor de datos hay, qué está activado y qué falta configurar. */
export async function GET() {
  try {
    const almacen = infoAlmacen();
    const avisos: string[] = [];

    if (almacen.advertencia) avisos.push(almacen.advertencia);
    if (usandoClavePorDefecto()) {
      avisos.push(
        'No hay ADMIN_PASSWORD configurada: se está usando la contraseña de desarrollo "prode-demo". Definila antes de publicar el sitio.',
      );
    }
    if (!process.env.SESSION_SECRET && process.env.NODE_ENV === "production") {
      avisos.push(
        "No hay SESSION_SECRET configurado: las sesiones se firman con una clave derivada de la contraseña. Definilo para producción.",
      );
    }
    if (!procesamientoHabilitado()) {
      avisos.push(
        "El procesamiento de PDF está desactivado (PROCESAMIENTO_HABILITADO=off). Se pueden consultar y editar fechas, pero no subir boletas nuevas.",
      );
    }

    return json({
      almacen,
      demo: demoHabilitada(),
      procesamiento: procesamientoHabilitado(),
      maxPartidos: MAX_PARTIDOS,
      maxPdfMb: Math.round((maxPdfBytes() / 1024 / 1024) * 10) / 10,
      // La subida por chunks (para PDFs grandes) necesita Supabase: sin él,
      // no hay dónde guardar los chunks ni el progreso del worker.
      subidaGrandeDisponible: supabaseAdminConfigurado(),
      maxChunkMb: MAX_CHUNK_MB,
      horasSesion: horasSesion(),
      entorno: process.env.VERCEL ? "vercel" : "local",
      avisos,
    });
  } catch (e) {
    return manejarError(e);
  }
}
