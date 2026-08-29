import { cookies } from "next/headers";
import { error, json, leerJson } from "@/lib/api";
import {
  NOMBRE_COOKIE,
  bloqueado,
  claveAdmin,
  crearToken,
  horasSesion,
  igualSeguro,
  limpiarIntentos,
  registrarFallo,
} from "@/lib/auth";

export const runtime = "nodejs";

function ipDe(req: Request): string {
  const cabecera = req.headers.get("x-forwarded-for") ?? "";
  return cabecera.split(",")[0].trim() || "desconocida";
}

export async function POST(req: Request) {
  const ip = ipDe(req);

  const segundos = bloqueado(ip);
  if (segundos > 0) {
    return error(
      `Demasiados intentos fallidos. Probá de nuevo en ${Math.ceil(segundos / 60)} minuto(s).`,
      429,
    );
  }

  const { clave } = await leerJson<{ clave?: string }>(req);
  const esperada = claveAdmin();

  if (!esperada) {
    return error(
      "El panel no tiene contraseña configurada. Definí ADMIN_PASSWORD en el entorno antes de usarlo.",
      503,
    );
  }

  if (typeof clave !== "string" || !igualSeguro(clave, esperada)) {
    registrarFallo(ip);
    // Mensaje deliberadamente genérico: no confirma ni niega nada más.
    return error("Contraseña incorrecta.", 401);
  }

  limpiarIntentos(ip);

  const almacen = await cookies();
  almacen.set(NOMBRE_COOKIE, await crearToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: horasSesion() * 3600,
  });

  return json({ ok: true });
}
