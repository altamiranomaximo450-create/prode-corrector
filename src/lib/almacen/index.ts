import { almacenArchivo } from "./archivo";
import { almacenMemoria } from "./memoria";
import { almacenSupabase, supabaseConfigurado } from "./supabase";
import type { Almacen } from "./tipos";

export type { Almacen } from "./tipos";

export interface InfoAlmacen {
  driver: string;
  nombre: string;
  persistente: boolean;
  descripcion: string;
  advertencia: string | null;
}

let cache: Almacen | null = null;

function elegir(): Almacen {
  const pedido = (process.env.STORAGE_DRIVER ?? "").toLowerCase().trim();

  if (pedido === "supabase") {
    if (!supabaseConfigurado()) {
      throw new Error(
        "STORAGE_DRIVER=supabase pero faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.",
      );
    }
    return almacenSupabase;
  }
  if (pedido === "memory" || pedido === "memoria") return almacenMemoria;
  if (pedido === "file" || pedido === "archivo") return almacenArchivo;

  // Sin driver explícito: se elige el mejor disponible para el entorno.
  if (supabaseConfigurado()) return almacenSupabase;
  // En Vercel el disco es de sólo lectura, así que archivos no es opción.
  if (process.env.VERCEL) return almacenMemoria;
  return almacenArchivo;
}

export function obtenerAlmacen(): Almacen {
  if (!cache) cache = elegir();
  return cache;
}

export function infoAlmacen(): InfoAlmacen {
  const almacen = obtenerAlmacen();
  let advertencia: string | null = null;
  if (!almacen.persistente) {
    advertencia =
      "Estás usando almacenamiento en memoria: todo lo que cargues se pierde cuando el servidor se reinicia. Para producción, configurá Supabase.";
  } else if (almacen === almacenArchivo && process.env.VERCEL) {
    advertencia =
      "El almacenamiento por archivos no funciona en Vercel (disco de sólo lectura). Configurá Supabase.";
  }
  return {
    driver: almacen === almacenSupabase ? "supabase" : almacen === almacenArchivo ? "file" : "memory",
    nombre: almacen.nombre,
    persistente: almacen.persistente,
    descripcion: almacen.descripcion,
    advertencia,
  };
}
