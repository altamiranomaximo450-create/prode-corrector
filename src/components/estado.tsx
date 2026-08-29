"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Boleta, Fecha, ResultadoCorreccion } from "@/lib/tipos";
import type { ResumenListado } from "@/lib/servicio";

export interface InfoSistema {
  almacen: {
    driver: string;
    nombre: string;
    persistente: boolean;
    descripcion: string;
    advertencia: string | null;
  };
  demo: boolean;
  procesamiento: boolean;
  maxPartidos: number;
  maxPdfMb: number;
  subidaGrandeDisponible: boolean;
  maxChunkMb: number;
  horasSesion: number;
  entorno: string;
  avisos: string[];
}

interface Estado {
  sistema: InfoSistema | null;
  fechas: ResumenListado[];
  fechaActivaId: string | null;
  correccion: ResultadoCorreccion | null;
  boletas: Boleta[];
  cargandoLista: boolean;
  cargandoFecha: boolean;
  error: string | null;
  seleccionar: (id: string | null) => void;
  refrescarTodo: () => Promise<void>;
  refrescarFechaActiva: () => Promise<void>;
  guardarFecha: (id: string, cambios: Record<string, unknown>) => Promise<Fecha>;
  editarBoleta: (boletaId: string, cambios: Record<string, unknown>) => Promise<void>;
  eliminarBoleta: (boletaId: string) => Promise<void>;
  agregarBoleta: (datos: Record<string, unknown>) => Promise<void>;
  eliminarFecha: (id: string) => Promise<void>;
  accionDemo: (accion: "borrar" | "restaurar") => Promise<void>;
}

const Contexto = createContext<Estado | null>(null);

const CLAVE_LOCAL = "prode:fecha-activa";

export async function pedir<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const texto = await res.text();
  const datos = texto ? JSON.parse(texto) : {};
  if (!res.ok) {
    throw new Error(datos.error ?? `La petición falló (${res.status}).`);
  }
  return datos as T;
}

export function ProveedorProde({ children }: { children: React.ReactNode }) {
  const [sistema, setSistema] = useState<InfoSistema | null>(null);
  const [fechas, setFechas] = useState<ResumenListado[]>([]);
  const [fechaActivaId, setFechaActivaId] = useState<string | null>(null);
  const [correccion, setCorreccion] = useState<ResultadoCorreccion | null>(null);
  const [boletas, setBoletas] = useState<Boleta[]>([]);
  const [cargandoLista, setCargandoLista] = useState(true);
  const [cargandoFecha, setCargandoFecha] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Referencia sincrónica a la fecha activa.
   *
   * El estado de React se actualiza recién en el siguiente render, así que si
   * se llama a `seleccionar(id)` e inmediatamente a `refrescarTodo()`, la
   * función refrescante todavía vería el id anterior y cargaría la fecha
   * equivocada. La ref se actualiza en el acto y evita esa carrera.
   */
  const idActivoRef = useRef<string | null>(null);

  const seleccionar = useCallback((id: string | null) => {
    idActivoRef.current = id;
    setFechaActivaId(id);
    try {
      if (id) window.localStorage.setItem(CLAVE_LOCAL, id);
      else window.localStorage.removeItem(CLAVE_LOCAL);
    } catch {
      // Modo privado o almacenamiento bloqueado: no es crítico.
    }
  }, []);

  const cargarLista = useCallback(async () => {
    setCargandoLista(true);
    try {
      const [info, lista] = await Promise.all([
        pedir<InfoSistema>("/api/sistema"),
        pedir<{ fechas: ResumenListado[] }>("/api/fechas"),
      ]);
      setSistema(info);
      setFechas(lista.fechas);
      setError(null);

      const elegida = (() => {
        const actual = idActivoRef.current;
        if (actual && lista.fechas.some((f) => f.fecha.id === actual)) return actual;
        let guardada: string | null = null;
        try {
          guardada = window.localStorage.getItem(CLAVE_LOCAL);
        } catch {
          guardada = null;
        }
        if (guardada && lista.fechas.some((f) => f.fecha.id === guardada)) return guardada;
        // Se prefiere una fecha real antes que una de demostración.
        const real = lista.fechas.find((f) => !f.fecha.esDemo);
        return (real ?? lista.fechas[0])?.fecha.id ?? null;
      })();
      idActivoRef.current = elegida;
      setFechaActivaId(elegida);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar el panel.");
    } finally {
      setCargandoLista(false);
    }
  }, []);

  const cargarFecha = useCallback(async (id: string | null) => {
    if (!id) {
      setCorreccion(null);
      setBoletas([]);
      return;
    }
    setCargandoFecha(true);
    try {
      const datos = await pedir<{ correccion: ResultadoCorreccion; boletas: Boleta[] }>(
        `/api/fechas/${id}`,
      );
      // Si mientras tanto se cambió de fecha, esta respuesta ya no sirve:
      // pisarla mostraría los datos de la fecha anterior.
      if (idActivoRef.current !== id) return;
      setCorreccion(datos.correccion);
      setBoletas(datos.boletas);
      setError(null);
    } catch (e) {
      if (idActivoRef.current !== id) return;
      setCorreccion(null);
      setBoletas([]);
      setError(e instanceof Error ? e.message : "No se pudo cargar la fecha.");
    } finally {
      setCargandoFecha(false);
    }
  }, []);

  useEffect(() => {
    void cargarLista();
  }, [cargarLista]);

  useEffect(() => {
    void cargarFecha(fechaActivaId);
  }, [fechaActivaId, cargarFecha]);

  const refrescarFechaActiva = useCallback(async () => {
    await cargarFecha(idActivoRef.current);
  }, [cargarFecha]);

  const refrescarTodo = useCallback(async () => {
    await cargarLista();
    await cargarFecha(idActivoRef.current);
  }, [cargarLista, cargarFecha]);

  const guardarFecha = useCallback(
    async (id: string, cambios: Record<string, unknown>) => {
      const datos = await pedir<{ fecha: Fecha; correccion: ResultadoCorreccion }>(
        `/api/fechas/${id}`,
        { method: "PATCH", body: JSON.stringify(cambios) },
      );
      setCorreccion(datos.correccion);
      setFechas((prev) =>
        prev.map((f) => (f.fecha.id === id ? { ...f, fecha: datos.fecha } : f)),
      );
      void cargarLista();
      return datos.fecha;
    },
    [cargarLista],
  );

  const editarBoleta = useCallback(
    async (boletaId: string, cambios: Record<string, unknown>) => {
      const id = idActivoRef.current;
      if (!id) return;
      await pedir(`/api/fechas/${id}/boletas/${boletaId}`, {
        method: "PATCH",
        body: JSON.stringify(cambios),
      });
      await cargarFecha(id);
      void cargarLista();
    },
    [cargarFecha, cargarLista],
  );

  const eliminarBoleta = useCallback(
    async (boletaId: string) => {
      const id = idActivoRef.current;
      if (!id) return;
      await pedir(`/api/fechas/${id}/boletas/${boletaId}`, { method: "DELETE" });
      await cargarFecha(id);
      void cargarLista();
    },
    [cargarFecha, cargarLista],
  );

  const agregarBoleta = useCallback(
    async (datos: Record<string, unknown>) => {
      const id = idActivoRef.current;
      if (!id) return;
      await pedir(`/api/fechas/${id}/boletas`, {
        method: "POST",
        body: JSON.stringify(datos),
      });
      await cargarFecha(id);
      void cargarLista();
    },
    [cargarFecha, cargarLista],
  );

  const eliminarFecha = useCallback(
    async (id: string) => {
      await pedir(`/api/fechas/${id}`, { method: "DELETE" });
      if (id === idActivoRef.current) seleccionar(null);
      await cargarLista();
    },
    [seleccionar, cargarLista],
  );

  const accionDemo = useCallback(
    async (accion: "borrar" | "restaurar") => {
      await pedir("/api/demo", { method: "POST", body: JSON.stringify({ accion }) });
      seleccionar(null);
      await cargarLista();
    },
    [seleccionar, cargarLista],
  );

  const valor = useMemo<Estado>(
    () => ({
      sistema,
      fechas,
      fechaActivaId,
      correccion,
      boletas,
      cargandoLista,
      cargandoFecha,
      error,
      seleccionar,
      refrescarTodo,
      refrescarFechaActiva,
      guardarFecha,
      editarBoleta,
      eliminarBoleta,
      agregarBoleta,
      eliminarFecha,
      accionDemo,
    }),
    [
      sistema,
      fechas,
      fechaActivaId,
      correccion,
      boletas,
      cargandoLista,
      cargandoFecha,
      error,
      seleccionar,
      refrescarTodo,
      refrescarFechaActiva,
      guardarFecha,
      editarBoleta,
      eliminarBoleta,
      agregarBoleta,
      eliminarFecha,
      accionDemo,
    ],
  );

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useProde(): Estado {
  const ctx = useContext(Contexto);
  if (!ctx) throw new Error("useProde debe usarse dentro de <ProveedorProde>");
  return ctx;
}
