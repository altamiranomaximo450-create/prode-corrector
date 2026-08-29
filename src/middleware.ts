import { NextResponse, type NextRequest } from "next/server";
import { NOMBRE_COOKIE, verificarToken } from "./lib/auth";

/**
 * Puerta de entrada. Todo lo que no sea el login está protegido: las páginas
 * del panel y también las rutas de API, para que nadie pueda leer boletas
 * llamando directamente a /api aunque conozca la URL.
 */

const PUBLICAS = ["/ingresar", "/api/auth/login"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLICAS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }

  const autorizado = await verificarToken(req.cookies.get(NOMBRE_COOKIE)?.value);
  if (autorizado) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      { error: "No autorizado. Iniciá sesión en el panel." },
      { status: 401 },
    );
  }

  const destino = new URL("/ingresar", req.url);
  if (pathname !== "/") destino.searchParams.set("volver", pathname);
  return NextResponse.redirect(destino);
}

export const config = {
  // Se excluyen los estáticos de Next y el favicon. Los PDF de demostración de
  // /demo quedan protegidos a propósito: son datos de participantes.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|iconos/).*)"],
};
