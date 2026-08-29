"use client";

import { useRouter } from "next/navigation";
import { useProde } from "@/components/estado";
import { Encabezado } from "@/components/shell";
import { Cargando, Iconos, MEDALLAS, Vacio, formatearFechaCorta } from "@/components/ui";

export default function PaginaHistorial() {
  const router = useRouter();
  const { fechas, cargandoLista, seleccionar, eliminarFecha, fechaActivaId } = useProde();

  if (cargandoLista) return <Cargando texto="Cargando el historial…" />;

  async function abrir(id: string) {
    seleccionar(id);
    router.push("/ranking");
  }

  async function borrar(id: string, nombre: string) {
    if (
      !window.confirm(
        `¿Eliminar "${nombre}" con todas sus boletas? Esta acción no se puede deshacer.`,
      )
    ) {
      return;
    }
    await eliminarFecha(id);
  }

  return (
    <>
      <Encabezado
        titulo="Historial de fechas"
        descripcion="Todas las fechas cargadas, con su podio. Abrí cualquiera para consultar su ranking completo."
      />

      {fechas.length === 0 ? (
        <div className="tarjeta">
          <Vacio titulo="Todavía no hay fechas" descripcion="Creá la primera desde Nueva fecha." />
        </div>
      ) : (
        <div className="space-y-4">
          {fechas.map(({ fecha, boletas, participantes, enRevision, mejorPuntaje, podio }) => (
            <article
              key={fecha.id}
              className={`tarjeta overflow-hidden ${
                fecha.id === fechaActivaId ? "ring-2 ring-acento-300" : ""
              }`}
            >
              <div className="tarjeta-cabecera">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-bold text-tinta-900">{fecha.nombre}</h2>
                    {fecha.esDemo && <span className="insignia-demo">DEMO</span>}
                    <span
                      className={
                        fecha.estado === "corregida"
                          ? "insignia-ok"
                          : fecha.estado === "procesada"
                            ? "insignia-alerta"
                            : "insignia-neutra"
                      }
                    >
                      {fecha.estado === "corregida"
                        ? "Corregida"
                        : fecha.estado === "procesada"
                          ? "Faltan resultados"
                          : "Borrador"}
                    </span>
                    {enRevision > 0 && (
                      <span className="insignia-error">{enRevision} a revisar</span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-tinta-500">
                    {formatearFechaCorta(fecha.creadaEn)} · {fecha.cantidadPartidos} partidos ·{" "}
                    {boletas} boletas · {participantes} participantes
                    {mejorPuntaje !== null && ` · mejor puntaje ${mejorPuntaje}`}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button className="boton-secundario boton-chico" onClick={() => abrir(fecha.id)}>
                    <Iconos.ranking className="h-4 w-4" />
                    Ver ranking
                  </button>
                  <button
                    className="boton-peligro boton-chico"
                    onClick={() => borrar(fecha.id, fecha.nombre)}
                    title="Eliminar la fecha y todas sus boletas"
                  >
                    <Iconos.basura className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {podio.length === 0 ? (
                <p className="px-5 py-4 text-sm text-tinta-500">
                  Sin podio todavía: faltan boletas válidas o resultados oficiales.
                </p>
              ) : (
                <div className="grid gap-3 px-5 py-4 sm:grid-cols-3">
                  {podio.map((p) => (
                    <div
                      key={p.puesto}
                      className="flex items-center gap-3 rounded-lg border border-tinta-200 bg-tinta-50 px-3 py-2.5"
                    >
                      <span className="text-xl">{MEDALLAS[p.puesto]}</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-tinta-900">
                          {p.nombres.join(" · ")}
                        </p>
                        <p className="num text-xs text-tinta-500">{p.aciertos} aciertos</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </>
  );
}
