import type { Boleta, Fecha } from "../tipos";
import type { Almacen } from "./tipos";

/**
 * Motor Supabase (Postgres administrado), usado vía su API REST.
 *
 * Por qué Supabase y no otra cosa:
 *  - Vercel no tiene disco donde escribir; hace falta una base externa.
 *  - Tiene un plan gratuito suficiente para este volumen (decenas de fechas).
 *  - Se habla por HTTP: no hay que instalar drivers nativos ni mantener un pool
 *    de conexiones, que es justo lo que peor funciona en serverless.
 *
 * La clave service_role vive SÓLO en el servidor (nunca NEXT_PUBLIC_) y las
 * tablas quedan con RLS activo sin políticas públicas: nadie llega a los datos
 * sin pasar por el panel autenticado. Ver supabase/schema.sql.
 */

const URL_BASE = process.env.SUPABASE_URL?.replace(/\/$/, "") ?? "";
const CLAVE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

const TABLA_FECHAS = "prode_fechas";
const TABLA_BOLETAS = "prode_boletas";
const TABLA_CONFIG = "prode_config";

export function supabaseConfigurado(): boolean {
  return Boolean(URL_BASE && CLAVE);
}

async function pedir<T>(
  ruta: string,
  init: RequestInit & { prefer?: string } = {},
): Promise<T> {
  if (!supabaseConfigurado()) {
    throw new Error(
      "Supabase no está configurado: faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.",
    );
  }
  const { prefer, ...resto } = init;
  const res = await fetch(`${URL_BASE}/rest/v1/${ruta}`, {
    ...resto,
    cache: "no-store",
    headers: {
      apikey: CLAVE,
      Authorization: `Bearer ${CLAVE}`,
      "Content-Type": "application/json",
      ...(prefer ? { Prefer: prefer } : {}),
      ...(resto.headers ?? {}),
    },
  });
  if (!res.ok) {
    const cuerpo = await res.text().catch(() => "");
    throw new Error(`Supabase respondió ${res.status}: ${cuerpo.slice(0, 400)}`);
  }
  if (res.status === 204) return undefined as T;
  const texto = await res.text();
  return (texto ? JSON.parse(texto) : undefined) as T;
}

interface FilaFecha {
  id: string;
  datos: Fecha;
}
interface FilaBoleta {
  id: string;
  fecha_id: string;
  datos: Boleta;
}

export const almacenSupabase: Almacen = {
  nombre: "Supabase (Postgres)",
  persistente: true,
  descripcion:
    "Base de datos Postgres administrada. Es la opción recomendada en producción: los datos sobreviven a los despliegues y quedan protegidos por RLS.",

  async listarFechas() {
    const filas = await pedir<FilaFecha[]>(
      `${TABLA_FECHAS}?select=id,datos&order=creada_en.desc`,
    );
    return filas.map((f) => f.datos);
  },

  async obtenerFecha(id) {
    const filas = await pedir<FilaFecha[]>(
      `${TABLA_FECHAS}?select=id,datos&id=eq.${encodeURIComponent(id)}&limit=1`,
    );
    return filas[0]?.datos ?? null;
  },

  async guardarFecha(fecha) {
    await pedir(`${TABLA_FECHAS}?on_conflict=id`, {
      method: "POST",
      prefer: "resolution=merge-duplicates,return=minimal",
      body: JSON.stringify([
        {
          id: fecha.id,
          datos: fecha,
          creada_en: fecha.creadaEn,
          actualizada_en: fecha.actualizadaEn,
        },
      ]),
    });
  },

  async borrarFecha(id) {
    await pedir(`${TABLA_BOLETAS}?fecha_id=eq.${encodeURIComponent(id)}`, {
      method: "DELETE",
      prefer: "return=minimal",
    });
    await pedir(`${TABLA_FECHAS}?id=eq.${encodeURIComponent(id)}`, {
      method: "DELETE",
      prefer: "return=minimal",
    });
  },

  async listarBoletas(fechaId) {
    const filas = await pedir<FilaBoleta[]>(
      `${TABLA_BOLETAS}?select=id,fecha_id,datos&fecha_id=eq.${encodeURIComponent(fechaId)}&order=creada_en.asc`,
    );
    return filas.map((f) => f.datos);
  },

  async obtenerBoleta(fechaId, boletaId) {
    const filas = await pedir<FilaBoleta[]>(
      `${TABLA_BOLETAS}?select=id,fecha_id,datos&fecha_id=eq.${encodeURIComponent(fechaId)}&id=eq.${encodeURIComponent(boletaId)}&limit=1`,
    );
    return filas[0]?.datos ?? null;
  },

  async reemplazarBoletas(fechaId, boletas) {
    await pedir(`${TABLA_BOLETAS}?fecha_id=eq.${encodeURIComponent(fechaId)}`, {
      method: "DELETE",
      prefer: "return=minimal",
    });
    if (boletas.length === 0) return;
    // Se insertan en tandas: una fecha grande puede traer cientos de boletas.
    const tanda = 200;
    for (let i = 0; i < boletas.length; i += tanda) {
      await pedir(TABLA_BOLETAS, {
        method: "POST",
        prefer: "return=minimal",
        body: JSON.stringify(
          boletas.slice(i, i + tanda).map((b) => ({
            id: b.id,
            fecha_id: b.fechaId,
            datos: b,
            creada_en: b.creadaEn,
          })),
        ),
      });
    }
  },

  async guardarBoleta(boleta) {
    await pedir(`${TABLA_BOLETAS}?on_conflict=id`, {
      method: "POST",
      prefer: "resolution=merge-duplicates,return=minimal",
      body: JSON.stringify([
        {
          id: boleta.id,
          fecha_id: boleta.fechaId,
          datos: boleta,
          creada_en: boleta.creadaEn,
        },
      ]),
    });
  },

  async borrarBoleta(fechaId, boletaId) {
    await pedir(
      `${TABLA_BOLETAS}?fecha_id=eq.${encodeURIComponent(fechaId)}&id=eq.${encodeURIComponent(boletaId)}`,
      { method: "DELETE", prefer: "return=minimal" },
    );
  },

  async leerBandera(clave) {
    const filas = await pedir<{ clave: string; valor: string }[]>(
      `${TABLA_CONFIG}?select=clave,valor&clave=eq.${encodeURIComponent(clave)}&limit=1`,
    );
    return filas[0]?.valor ?? null;
  },

  async escribirBandera(clave, valor) {
    await pedir(`${TABLA_CONFIG}?on_conflict=clave`, {
      method: "POST",
      prefer: "resolution=merge-duplicates,return=minimal",
      body: JSON.stringify([{ clave, valor }]),
    });
  },
};
