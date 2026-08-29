import type { Boleta, Fecha } from "../tipos";
import type { Almacen } from "./tipos";

interface Registro {
  fecha: Fecha;
  boletas: Boleta[];
}

/**
 * Motor en memoria. Sirve para probar la demo en un entorno sin disco de
 * escritura ni base de datos (por ejemplo Vercel sin Supabase configurado).
 * Los datos viven mientras viva el proceso.
 *
 * Se cuelga de globalThis para sobrevivir a los recargados en caliente de
 * Next.js en desarrollo.
 */
const bolsa: Map<string, Registro> =
  (globalThis as unknown as { __prodeMemoria?: Map<string, Registro> }).__prodeMemoria ??
  new Map<string, Registro>();
(globalThis as unknown as { __prodeMemoria?: Map<string, Registro> }).__prodeMemoria = bolsa;

const banderas: Map<string, string> =
  (globalThis as unknown as { __prodeBanderas?: Map<string, string> }).__prodeBanderas ??
  new Map<string, string>();
(globalThis as unknown as { __prodeBanderas?: Map<string, string> }).__prodeBanderas = banderas;

const clonar = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

export const almacenMemoria: Almacen = {
  nombre: "memoria",
  persistente: false,
  descripcion:
    "Los datos viven sólo mientras el servidor esté encendido. Al reiniciar se pierden. Útil para la demo, no para producción.",

  async listarFechas() {
    return [...bolsa.values()]
      .map((r) => clonar(r.fecha))
      .sort((a, b) => b.creadaEn.localeCompare(a.creadaEn));
  },

  async obtenerFecha(id) {
    const r = bolsa.get(id);
    return r ? clonar(r.fecha) : null;
  },

  async guardarFecha(fecha) {
    const previo = bolsa.get(fecha.id);
    bolsa.set(fecha.id, { fecha: clonar(fecha), boletas: previo?.boletas ?? [] });
  },

  async borrarFecha(id) {
    bolsa.delete(id);
  },

  async listarBoletas(fechaId) {
    return clonar(bolsa.get(fechaId)?.boletas ?? []);
  },

  async obtenerBoleta(fechaId, boletaId) {
    const b = bolsa.get(fechaId)?.boletas.find((x) => x.id === boletaId);
    return b ? clonar(b) : null;
  },

  async reemplazarBoletas(fechaId, boletas) {
    const r = bolsa.get(fechaId);
    if (!r) throw new Error(`La fecha ${fechaId} no existe`);
    r.boletas = clonar(boletas);
  },

  async guardarBoleta(boleta) {
    const r = bolsa.get(boleta.fechaId);
    if (!r) throw new Error(`La fecha ${boleta.fechaId} no existe`);
    const i = r.boletas.findIndex((x) => x.id === boleta.id);
    if (i >= 0) r.boletas[i] = clonar(boleta);
    else r.boletas.push(clonar(boleta));
  },

  async borrarBoleta(fechaId, boletaId) {
    const r = bolsa.get(fechaId);
    if (!r) return;
    r.boletas = r.boletas.filter((b) => b.id !== boletaId);
  },

  async leerBandera(clave) {
    return banderas.get(clave) ?? null;
  },

  async escribirBandera(clave, valor) {
    banderas.set(clave, valor);
  },
};
