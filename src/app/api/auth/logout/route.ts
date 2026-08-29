import { cookies } from "next/headers";
import { json } from "@/lib/api";
import { NOMBRE_COOKIE } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST() {
  const almacen = await cookies();
  almacen.set(NOMBRE_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return json({ ok: true });
}
