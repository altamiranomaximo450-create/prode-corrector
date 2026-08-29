/**
 * Carga variables de entorno desde .env.local / .env en la raíz del proyecto,
 * ANTES de que se evalúe cualquier otro módulo del worker.
 *
 * Importante: este archivo se importa como el PRIMER `import` en
 * worker/index.ts, y no importa nada más. Los módulos de ES (incluso
 * compilados por tsx) evalúan cada import en el orden en que aparece en el
 * archivo que los pide, así que esto garantiza que `process.env` ya está
 * poblado cuando se evalúan los módulos que leen SUPABASE_URL /
 * SUPABASE_SERVICE_ROLE_KEY al cargarse (ej. src/lib/almacen/supabase.ts).
 *
 * Sin dependencias nuevas: alcanza con un parser mínimo de líneas "CLAVE=valor".
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

function cargarEnv(archivo: string) {
  const ruta = path.join(process.cwd(), archivo);
  if (!existsSync(ruta)) return;
  for (const linea of readFileSync(ruta, "utf8").split("\n")) {
    const limpia = linea.trim();
    if (!limpia || limpia.startsWith("#")) continue;
    const igual = limpia.indexOf("=");
    if (igual === -1) continue;
    const clave = limpia.slice(0, igual).trim();
    let valor = limpia.slice(igual + 1).trim();
    if (
      (valor.startsWith('"') && valor.endsWith('"')) ||
      (valor.startsWith("'") && valor.endsWith("'"))
    ) {
      valor = valor.slice(1, -1);
    }
    if (process.env[clave] === undefined) process.env[clave] = valor;
  }
}

cargarEnv(".env");
cargarEnv(".env.local");
