"use client";

import { useEffect } from "react";
import type { EstadoBoleta, Pronostico } from "@/lib/tipos";

/* -------------------------------------------------------------------------- */
/*  Iconos (SVG en línea: sin dependencias externas)                          */
/* -------------------------------------------------------------------------- */

type PropsIcono = { className?: string };

function base(d: string) {
  const Componente = ({ className = "h-5 w-5" }: PropsIcono) => (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
  Componente.displayName = "Icono";
  return Componente;
}

export const Iconos = {
  panel: base("M4 5h7v6H4zM13 5h7v3h-7zM13 10h7v9h-7zM4 13h7v6H4z"),
  mas: base("M12 5v14M5 12h14"),
  boletas: base("M7 4h10a1 1 0 0 1 1 1v15l-3-2-3 2-3-2-3 2V5a1 1 0 0 1 1-1zM9 9h6M9 13h6"),
  resultados: base("M4 6h16M4 12h16M4 18h10M18 15l2 2 3-3"),
  ranking: base("M6 20V10M12 20V4M18 20v-7"),
  trofeo: base(
    "M8 4h8v5a4 4 0 0 1-8 0V4zM8 5H5v2a3 3 0 0 0 3 3M16 5h3v2a3 3 0 0 1-3 3M10 17h4M9 20h6M12 13v4",
  ),
  historial: base("M3 12a9 9 0 1 0 3-6.7M3 4v4h4M12 7v5l3 2"),
  ajustes: base(
    "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2v.2a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-3-1.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0-1.2-2.9H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.3-3l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0 1.2 2.9H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z",
  ),
  alerta: base("M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"),
  ok: base("M20 6 9 17l-5-5"),
  equis: base("M18 6 6 18M6 6l12 12"),
  descargar: base("M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"),
  subir: base("M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"),
  salir: base("M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"),
  buscar: base("M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3"),
  ojo: base("M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"),
  refrescar: base("M3 12a9 9 0 0 1 15.5-6.2M21 12a9 9 0 0 1-15.5 6.2M21 3v6h-6M3 21v-6h6"),
  basura: base("M4 7h16M10 11v6M14 11v6M5 7l1 13a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1l1-13M9 7V4h6v3"),
  documento: base("M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5"),
  lupa: base("M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3M8 11h6"),
};

/* -------------------------------------------------------------------------- */
/*  Piezas reutilizables                                                      */
/* -------------------------------------------------------------------------- */

export function MarcaPronostico({
  valor,
  tono = "neutro",
  titulo,
}: {
  valor: Pronostico | null;
  tono?: "neutro" | "acierto" | "error" | "vacio";
  titulo?: string;
}) {
  const estilos = {
    neutro: "bg-tinta-100 text-tinta-800 border-tinta-200",
    acierto: "bg-emerald-100 text-emerald-800 border-emerald-300",
    error: "bg-red-100 text-red-800 border-red-300",
    vacio: "bg-tinta-50 text-tinta-400 border-dashed border-tinta-300",
  }[tono];
  return (
    <span
      title={titulo}
      className={`num inline-flex h-7 w-7 items-center justify-center rounded-md border text-sm font-bold ${estilos}`}
    >
      {valor ?? "—"}
    </span>
  );
}

export function InsigniaEstado({ estado }: { estado: EstadoBoleta }) {
  if (estado === "revision") {
    return (
      <span className="insignia-error">
        <Iconos.alerta className="h-3.5 w-3.5" />
        Requiere revisión
      </span>
    );
  }
  if (estado === "resuelta_manual") {
    return (
      <span className="insignia-alerta">
        <Iconos.ok className="h-3.5 w-3.5" />
        Revisada a mano
      </span>
    );
  }
  return (
    <span className="insignia-ok">
      <Iconos.ok className="h-3.5 w-3.5" />
      OK
    </span>
  );
}

export function Cargando({ texto = "Cargando…" }: { texto?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-sm text-tinta-500">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-tinta-300 border-t-acento-600" />
      {texto}
    </div>
  );
}

export function Vacio({
  titulo,
  descripcion,
  children,
}: {
  titulo: string;
  descripcion?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-tinta-100 text-tinta-400">
        <Iconos.documento className="h-6 w-6" />
      </div>
      <p className="text-base font-semibold text-tinta-800">{titulo}</p>
      {descripcion && (
        <p className="max-w-md text-sm leading-relaxed text-tinta-500">{descripcion}</p>
      )}
      {children}
    </div>
  );
}

export function Modal({
  abierto,
  onCerrar,
  titulo,
  descripcion,
  ancho = "max-w-3xl",
  children,
}: {
  abierto: boolean;
  onCerrar: () => void;
  titulo: string;
  descripcion?: string;
  ancho?: string;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!abierto) return;
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCerrar();
    };
    document.addEventListener("keydown", alTeclear);
    const previo = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", alTeclear);
      document.body.style.overflow = previo;
    };
  }, [abierto, onCerrar]);

  if (!abierto) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-tinta-950/50 p-4 sm:p-8">
      <div
        className="absolute inset-0"
        onClick={onCerrar}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        className={`tarjeta relative z-10 w-full ${ancho} my-auto`}
      >
        <div className="tarjeta-cabecera">
          <div>
            <h2 className="text-base font-bold text-tinta-900">{titulo}</h2>
            {descripcion && <p className="mt-0.5 text-sm text-tinta-500">{descripcion}</p>}
          </div>
          <button className="boton-sutil boton-chico" onClick={onCerrar} aria-label="Cerrar">
            <Iconos.equis className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

export function Metrica({
  titulo,
  valor,
  detalle,
  tono = "neutro",
  icono,
}: {
  titulo: string;
  valor: React.ReactNode;
  detalle?: string;
  tono?: "neutro" | "ok" | "alerta" | "error";
  icono?: React.ReactNode;
}) {
  const color = {
    neutro: "text-tinta-900",
    ok: "text-emerald-700",
    alerta: "text-amber-700",
    error: "text-red-700",
  }[tono];
  return (
    <div className="tarjeta p-5">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-semibold tracking-wide text-tinta-500 uppercase">{titulo}</p>
        {icono && <span className="text-tinta-300">{icono}</span>}
      </div>
      <p className={`num mt-2 text-3xl font-bold ${color}`}>{valor}</p>
      {detalle && <p className="mt-1 text-xs text-tinta-500">{detalle}</p>}
    </div>
  );
}

export const MEDALLAS: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };

export function formatearFechaHora(iso: string): string {
  try {
    return new Date(iso).toLocaleString("es-AR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function formatearFechaCorta(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("es-AR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}
