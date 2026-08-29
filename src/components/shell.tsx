"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { useProde } from "./estado";
import { Iconos } from "./ui";

interface ItemNav {
  href: string;
  texto: string;
  icono: (p: { className?: string }) => React.ReactElement;
  necesitaFecha?: boolean;
}

const NAVEGACION: ItemNav[] = [
  { href: "/", texto: "Dashboard", icono: Iconos.panel },
  { href: "/nueva-fecha", texto: "Nueva fecha", icono: Iconos.mas },
  { href: "/boletas", texto: "Boletas", icono: Iconos.boletas, necesitaFecha: true },
  { href: "/resultados", texto: "Resultados", icono: Iconos.resultados, necesitaFecha: true },
  { href: "/ranking", texto: "Ranking", icono: Iconos.ranking, necesitaFecha: true },
  { href: "/ganadores", texto: "Ganadores", icono: Iconos.trofeo, necesitaFecha: true },
  { href: "/revision", texto: "Revisión", icono: Iconos.alerta, necesitaFecha: true },
  { href: "/historial", texto: "Historial", icono: Iconos.historial },
  { href: "/configuracion", texto: "Configuración", icono: Iconos.ajustes },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const ruta = usePathname();
  const router = useRouter();
  const { fechas, fechaActivaId, seleccionar, correccion, sistema } = useProde();
  const [menuAbierto, setMenuAbierto] = useState(false);

  const enRevision = correccion?.resumen.boletasEnRevision ?? 0;
  const fechaActiva = fechas.find((f) => f.fecha.id === fechaActivaId);

  async function salir() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/ingresar");
    router.refresh();
  }

  const enlaces = (
    <nav className="flex flex-col gap-0.5">
      {NAVEGACION.map((item) => {
        const activo = ruta === item.href;
        const deshabilitado = item.necesitaFecha && !fechaActivaId;
        const Icono = item.icono;
        const contenido = (
          <>
            <Icono className="h-[18px] w-[18px] shrink-0" />
            <span className="flex-1">{item.texto}</span>
            {item.href === "/revision" && enRevision > 0 && (
              <span className="num rounded-full bg-red-500 px-2 py-0.5 text-[11px] font-bold text-white">
                {enRevision}
              </span>
            )}
          </>
        );
        const clases = `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
          activo
            ? "bg-white/12 text-white"
            : deshabilitado
              ? "cursor-not-allowed text-tinta-500"
              : "text-tinta-300 hover:bg-white/8 hover:text-white"
        }`;

        if (deshabilitado) {
          return (
            <span key={item.href} className={clases} title="Elegí una fecha primero">
              {contenido}
            </span>
          );
        }
        return (
          <Link
            key={item.href}
            href={item.href}
            className={clases}
            onClick={() => setMenuAbierto(false)}
          >
            {contenido}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-dvh lg:flex">
      {/* Barra lateral */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-72 flex-col bg-tinta-950 px-4 py-5 transition-transform lg:static lg:translate-x-0 ${
          menuAbierto ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="mb-6 flex items-center gap-3 px-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-acento-600 text-sm font-bold text-white">
            P
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-white">Corrector de Prode</p>
            <p className="text-[11px] text-tinta-400">Panel de administración</p>
          </div>
        </div>

        <div className="mb-5 px-2">
          <label className="mb-1.5 block text-[11px] font-semibold tracking-wide text-tinta-400 uppercase">
            Fecha activa
          </label>
          <select
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-acento-400 focus:outline-none"
            value={fechaActivaId ?? ""}
            onChange={(e) => seleccionar(e.target.value || null)}
          >
            {fechas.length === 0 && <option value="">— sin fechas —</option>}
            {fechas.map((f) => (
              <option key={f.fecha.id} value={f.fecha.id} className="text-tinta-900">
                {f.fecha.nombre}
              </option>
            ))}
          </select>
          {fechaActiva?.fecha.esDemo && (
            <p className="mt-2 rounded-md bg-violet-500/20 px-2 py-1 text-[11px] font-semibold text-violet-200">
              Datos de demostración
            </p>
          )}
        </div>

        {enlaces}

        <div className="mt-auto border-t border-white/10 pt-4">
          {sistema && !sistema.almacen.persistente && (
            <p className="mb-3 rounded-md bg-amber-500/15 px-2.5 py-2 text-[11px] leading-snug text-amber-200">
              Almacenamiento temporal: los datos se pierden al reiniciar el servidor.
            </p>
          )}
          <button
            onClick={salir}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-tinta-300 transition-colors hover:bg-white/8 hover:text-white"
          >
            <Iconos.salir className="h-[18px] w-[18px]" />
            Cerrar sesión
          </button>
        </div>
      </aside>

      {menuAbierto && (
        <div
          className="fixed inset-0 z-30 bg-tinta-950/50 lg:hidden"
          onClick={() => setMenuAbierto(false)}
          aria-hidden="true"
        />
      )}

      {/* Contenido */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-tinta-200 bg-white/90 px-4 py-3 backdrop-blur lg:hidden">
          <button
            className="boton-secundario boton-chico"
            onClick={() => setMenuAbierto((v) => !v)}
            aria-label="Abrir menú"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" stroke="currentColor" strokeWidth="2">
              <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
            </svg>
            Menú
          </button>
          <p className="truncate text-sm font-semibold text-tinta-800">
            {fechaActiva?.fecha.nombre ?? "Corrector de Prode"}
          </p>
        </header>

        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}

export function Encabezado({
  titulo,
  descripcion,
  acciones,
}: {
  titulo: string;
  descripcion?: string;
  acciones?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight text-tinta-900">{titulo}</h1>
        {descripcion && (
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-tinta-500">{descripcion}</p>
        )}
      </div>
      {acciones && <div className="flex flex-wrap items-center gap-2">{acciones}</div>}
    </div>
  );
}
