import { mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Boleta, Fecha } from "../tipos";
import type { Almacen } from "./tipos";

/**
 * Motor de archivos JSON. Es el que se usa en desarrollo local: una carpeta
 * .data con un archivo por fecha (la fecha y sus boletas juntas). Sin servidor
 * de base de datos, sin configuración, y se puede abrir con cualquier editor
 * para auditar qué guardó el sistema.
 *
 * No sirve en Vercel: allí el sistema de archivos es de sólo lectura.
 */

const DIRECTORIO = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(process.cwd(), ".data");

interface Registro {
  fecha: Fecha;
  boletas: Boleta[];
}

async function asegurarDirectorio(): Promise<void> {
  await mkdir(DIRECTORIO, { recursive: true });
}

const RUTA_BANDERAS = path.join(DIRECTORIO, "_banderas.json");

async function leerBanderas(): Promise<Record<string, string>> {
  try {
    return JSON.parse(await readFile(RUTA_BANDERAS, "utf8")) as Record<string, string>;
  } catch {
    return {};
  }
}

function rutaDe(id: string): string {
  // El id siempre lo genera el servidor (uuid), pero se sanea igual para que
  // ningún identificador pueda escaparse de la carpeta de datos.
  const seguro = id.replace(/[^a-zA-Z0-9_-]/g, "");
  if (!seguro) throw new Error("Identificador de fecha inválido");
  return path.join(DIRECTORIO, `${seguro}.json`);
}

async function leer(id: string): Promise<Registro | null> {
  try {
    const crudo = await readFile(rutaDe(id), "utf8");
    return JSON.parse(crudo) as Registro;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw e;
  }
}

/** Escritura atómica: se escribe un temporal y se renombra. */
async function escribir(registro: Registro): Promise<void> {
  await asegurarDirectorio();
  const destino = rutaDe(registro.fecha.id);
  const temporal = `${destino}.${process.pid}.tmp`;
  await writeFile(temporal, JSON.stringify(registro, null, 2), "utf8");
  await rename(temporal, destino);
}

export const almacenArchivo: Almacen = {
  nombre: "archivos JSON (.data)",
  persistente: true,
  descripcion:
    "Guarda cada fecha en un archivo JSON dentro de la carpeta .data del proyecto. Ideal en tu computadora; no funciona en Vercel porque allí el disco es de sólo lectura.",

  async listarFechas() {
    await asegurarDirectorio();
    // Los archivos que empiezan con "_" son internos (banderas), no fechas.
    const archivos = (await readdir(DIRECTORIO)).filter(
      (f) => f.endsWith(".json") && !f.startsWith("_"),
    );
    const fechas: Fecha[] = [];
    for (const archivo of archivos) {
      try {
        const crudo = await readFile(path.join(DIRECTORIO, archivo), "utf8");
        const registro = JSON.parse(crudo) as Registro;
        if (registro?.fecha?.id) fechas.push(registro.fecha);
      } catch {
        // Un archivo corrupto no debe tumbar el listado completo.
      }
    }
    return fechas.sort((a, b) => b.creadaEn.localeCompare(a.creadaEn));
  },

  async obtenerFecha(id) {
    return (await leer(id))?.fecha ?? null;
  },

  async guardarFecha(fecha) {
    const previo = await leer(fecha.id);
    await escribir({ fecha, boletas: previo?.boletas ?? [] });
  },

  async borrarFecha(id) {
    await rm(rutaDe(id), { force: true });
  },

  async listarBoletas(fechaId) {
    return (await leer(fechaId))?.boletas ?? [];
  },

  async obtenerBoleta(fechaId, boletaId) {
    const r = await leer(fechaId);
    return r?.boletas.find((b) => b.id === boletaId) ?? null;
  },

  async reemplazarBoletas(fechaId, boletas) {
    const r = await leer(fechaId);
    if (!r) throw new Error(`La fecha ${fechaId} no existe`);
    await escribir({ fecha: r.fecha, boletas });
  },

  async guardarBoleta(boleta) {
    const r = await leer(boleta.fechaId);
    if (!r) throw new Error(`La fecha ${boleta.fechaId} no existe`);
    const i = r.boletas.findIndex((x) => x.id === boleta.id);
    if (i >= 0) r.boletas[i] = boleta;
    else r.boletas.push(boleta);
    await escribir(r);
  },

  async borrarBoleta(fechaId, boletaId) {
    const r = await leer(fechaId);
    if (!r) return;
    r.boletas = r.boletas.filter((b) => b.id !== boletaId);
    await escribir(r);
  },

  async leerBandera(clave) {
    return (await leerBanderas())[clave] ?? null;
  },

  async escribirBandera(clave, valor) {
    await asegurarDirectorio();
    const banderas = await leerBanderas();
    banderas[clave] = valor;
    const temporal = `${RUTA_BANDERAS}.${process.pid}.tmp`;
    await writeFile(temporal, JSON.stringify(banderas, null, 2), "utf8");
    await rename(temporal, RUTA_BANDERAS);
  },
};
