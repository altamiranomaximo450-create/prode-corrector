/**
 * Sesión del panel de administración.
 *
 * Cookie firmada con HMAC-SHA256 usando la Web Crypto API, para que el mismo
 * código sirva en el middleware (runtime edge) y en las rutas de API (Node).
 * No hay base de usuarios: hay una única contraseña de administrador, que es
 * lo adecuado para un panel de un solo operador.
 *
 * La cookie es httpOnly + sameSite=lax + secure en producción, así que no es
 * legible desde JavaScript ni viaja en peticiones de terceros.
 */

export const NOMBRE_COOKIE = "prode_sesion";

const CLAVE_DEV = "prode-demo";

export function claveAdmin(): string {
  const clave = process.env.ADMIN_PASSWORD?.trim();
  if (clave) return clave;
  if (process.env.NODE_ENV === "production") {
    // Sin contraseña configurada en producción, no se entra: es preferible
    // dejar el panel inaccesible antes que dejarlo abierto.
    return "";
  }
  return CLAVE_DEV;
}

export function usandoClavePorDefecto(): boolean {
  return !process.env.ADMIN_PASSWORD?.trim();
}

function secreto(): string {
  const s = process.env.SESSION_SECRET?.trim();
  if (s && s.length >= 16) return s;
  // Derivado de la contraseña: al cambiarla, las sesiones abiertas caducan.
  return `prode-sesion-derivada:${claveAdmin()}`;
}

export function horasSesion(): number {
  const n = Number(process.env.SESSION_HOURS ?? 12);
  return Number.isFinite(n) && n > 0 && n <= 720 ? n : 12;
}

/* -------------------------------------------------------------------------- */

function aBase64Url(bytes: Uint8Array): string {
  let binario = "";
  for (const b of bytes) binario += String.fromCharCode(b);
  return btoa(binario).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function deBase64Url(texto: string): Uint8Array {
  const relleno = texto.replace(/-/g, "+").replace(/_/g, "/");
  const binario = atob(relleno + "=".repeat((4 - (relleno.length % 4)) % 4));
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return bytes;
}

async function firmar(mensaje: string): Promise<string> {
  const clave = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secreto()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const firma = await crypto.subtle.sign("HMAC", clave, new TextEncoder().encode(mensaje));
  return aBase64Url(new Uint8Array(firma));
}

/** Comparación en tiempo constante: no filtra información por el tiempo de respuesta. */
export function igualSeguro(a: string, b: string): boolean {
  const ba = new TextEncoder().encode(a);
  const bb = new TextEncoder().encode(b);
  // Se compara siempre la misma cantidad de bytes para no delatar la longitud.
  const largo = Math.max(ba.length, bb.length);
  let dif = ba.length ^ bb.length;
  for (let i = 0; i < largo; i++) {
    dif |= (ba[i] ?? 0) ^ (bb[i] ?? 0);
  }
  return dif === 0;
}

export interface Sesion {
  exp: number;
}

export async function crearToken(): Promise<string> {
  const payload: Sesion = { exp: Date.now() + horasSesion() * 3600_000 };
  const cuerpo = aBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  return `${cuerpo}.${await firmar(cuerpo)}`;
}

export async function verificarToken(token: string | undefined | null): Promise<boolean> {
  if (!token) return false;
  const partes = token.split(".");
  if (partes.length !== 2) return false;
  const [cuerpo, firma] = partes;
  const esperada = await firmar(cuerpo).catch(() => null);
  if (!esperada || !igualSeguro(firma, esperada)) return false;
  try {
    const sesion = JSON.parse(new TextDecoder().decode(deBase64Url(cuerpo))) as Sesion;
    return typeof sesion.exp === "number" && sesion.exp > Date.now();
  } catch {
    return false;
  }
}

/* -------------------------------------------------------------------------- */
/*  Freno a la fuerza bruta (por instancia del servidor)                      */
/* -------------------------------------------------------------------------- */

interface Intentos {
  cantidad: number;
  hasta: number;
}

const intentos: Map<string, Intentos> =
  (globalThis as unknown as { __prodeIntentos?: Map<string, Intentos> }).__prodeIntentos ??
  new Map();
(globalThis as unknown as { __prodeIntentos?: Map<string, Intentos> }).__prodeIntentos = intentos;

const MAX_INTENTOS = 8;
const BLOQUEO_MS = 10 * 60_000;

export function bloqueado(ip: string): number {
  const registro = intentos.get(ip);
  if (!registro) return 0;
  if (registro.cantidad < MAX_INTENTOS) return 0;
  const restante = registro.hasta - Date.now();
  if (restante <= 0) {
    intentos.delete(ip);
    return 0;
  }
  return Math.ceil(restante / 1000);
}

export function registrarFallo(ip: string): void {
  const registro = intentos.get(ip) ?? { cantidad: 0, hasta: 0 };
  registro.cantidad += 1;
  registro.hasta = Date.now() + BLOQUEO_MS;
  intentos.set(ip, registro);
}

export function limpiarIntentos(ip: string): void {
  intentos.delete(ip);
}
