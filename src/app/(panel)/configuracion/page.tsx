"use client";

import { useState } from "react";
import { useProde } from "@/components/estado";
import { Encabezado } from "@/components/shell";
import { Cargando, Iconos, formatearFechaHora } from "@/components/ui";

export default function PaginaConfiguracion() {
  const { sistema, correccion, cargandoLista, accionDemo, fechas } = useProde();
  const [trabajando, setTrabajando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (cargandoLista || !sistema) return <Cargando texto="Cargando la configuración…" />;

  const hayDemo = fechas.some((f) => f.fecha.esDemo);

  async function ejecutar(accion: "borrar" | "restaurar") {
    if (
      accion === "borrar" &&
      !window.confirm("¿Eliminar todas las fechas de demostración? Las fechas reales no se tocan.")
    ) {
      return;
    }
    setTrabajando(true);
    setMensaje(null);
    setError(null);
    try {
      await accionDemo(accion);
      setMensaje(
        accion === "borrar"
          ? "Se eliminaron las fechas de demostración."
          : "Se restauraron las fechas de demostración.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo completar la acción.");
    } finally {
      setTrabajando(false);
    }
  }

  return (
    <>
      <Encabezado
        titulo="Configuración"
        descripcion="Estado del sistema, almacenamiento y datos de demostración."
      />

      {sistema.avisos.length > 0 && (
        <div className="mb-5 space-y-2">
          {sistema.avisos.map((a, i) => (
            <div key={i} className="aviso-alerta">
              <Iconos.alerta className="h-5 w-5 shrink-0" />
              <p>{a}</p>
            </div>
          ))}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="tarjeta">
          <div className="tarjeta-cabecera">
            <h2 className="titulo-seccion">Almacenamiento</h2>
            <span className={sistema.almacen.persistente ? "insignia-ok" : "insignia-alerta"}>
              {sistema.almacen.persistente ? "Persistente" : "Temporal"}
            </span>
          </div>
          <dl className="space-y-3 p-5 text-sm">
            <div>
              <dt className="text-xs font-semibold tracking-wide text-tinta-500 uppercase">
                Motor en uso
              </dt>
              <dd className="font-semibold text-tinta-900">{sistema.almacen.nombre}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold tracking-wide text-tinta-500 uppercase">
                Qué significa
              </dt>
              <dd className="leading-relaxed text-tinta-700">{sistema.almacen.descripcion}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold tracking-wide text-tinta-500 uppercase">
                Entorno
              </dt>
              <dd className="text-tinta-700">
                {sistema.entorno === "vercel" ? "Vercel (producción)" : "Local"}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold tracking-wide text-tinta-500 uppercase">
                Cómo cambiarlo
              </dt>
              <dd className="leading-relaxed text-tinta-700">
                Con la variable de entorno <code className="rounded bg-tinta-100 px-1">STORAGE_DRIVER</code>{" "}
                (<code className="rounded bg-tinta-100 px-1">file</code>,{" "}
                <code className="rounded bg-tinta-100 px-1">memory</code> o{" "}
                <code className="rounded bg-tinta-100 px-1">supabase</code>). Para Supabase hay que
                cargar además <code className="rounded bg-tinta-100 px-1">SUPABASE_URL</code> y{" "}
                <code className="rounded bg-tinta-100 px-1">SUPABASE_SERVICE_ROLE_KEY</code>.
              </dd>
            </div>
          </dl>
        </section>

        <section className="tarjeta">
          <div className="tarjeta-cabecera">
            <h2 className="titulo-seccion">Procesamiento y límites</h2>
          </div>
          <dl className="space-y-3 p-5 text-sm">
            <div className="flex items-center justify-between gap-4">
              <dt className="text-tinta-600">Lectura de PDF</dt>
              <dd>
                <span className={sistema.procesamiento ? "insignia-ok" : "insignia-error"}>
                  {sistema.procesamiento ? "Activada" : "Desactivada"}
                </span>
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-tinta-600">Tamaño máximo de PDF</dt>
              <dd className="num font-semibold text-tinta-900">{sistema.maxPdfMb} MB</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-tinta-600">Máximo de partidos por fecha</dt>
              <dd className="num font-semibold text-tinta-900">{sistema.maxPartidos}</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-tinta-600">Duración de la sesión</dt>
              <dd className="num font-semibold text-tinta-900">{sistema.horasSesion} h</dd>
            </div>
            <p className="border-t border-tinta-100 pt-3 text-xs leading-relaxed text-tinta-500">
              Para retirar la demo sin dar de baja el sitio, poné{" "}
              <code className="rounded bg-tinta-100 px-1">PROCESAMIENTO_HABILITADO=off</code>: el
              panel sigue consultable pero deja de aceptar PDF nuevos.
            </p>
          </dl>
        </section>

        <section className="tarjeta">
          <div className="tarjeta-cabecera">
            <h2 className="titulo-seccion">Datos de demostración</h2>
            {hayDemo ? (
              <span className="insignia-demo">Presentes</span>
            ) : (
              <span className="insignia-neutra">No hay</span>
            )}
          </div>
          <div className="space-y-4 p-5">
            <p className="text-sm leading-relaxed text-tinta-700">
              Las fechas de demostración usan participantes y pronósticos ficticios, y están
              marcadas como <strong>DEMO</strong> en todo el panel. No se mezclan con las fechas
              reales: cuando procesás un PDF real, lo hacés sobre una fecha propia.
            </p>
            {mensaje && <div className="aviso-info">{mensaje}</div>}
            {error && <div className="aviso-error">{error}</div>}
            <div className="flex flex-wrap gap-2">
              <button
                className="boton-peligro"
                onClick={() => ejecutar("borrar")}
                disabled={trabajando || !hayDemo}
              >
                <Iconos.basura className="h-4 w-4" />
                Borrar datos de demostración
              </button>
              <button
                className="boton-secundario"
                onClick={() => ejecutar("restaurar")}
                disabled={trabajando || !sistema.demo}
              >
                <Iconos.refrescar className="h-4 w-4" />
                Restaurar demo
              </button>
            </div>
            <p className="ayuda">
              Para que no se vuelvan a crear nunca, poné{" "}
              <code className="rounded bg-tinta-100 px-1">DEMO_MODE=off</code> en el entorno.
            </p>
          </div>
        </section>

        <section className="tarjeta">
          <div className="tarjeta-cabecera">
            <h2 className="titulo-seccion">PDF de prueba</h2>
          </div>
          <div className="space-y-3 p-5 text-sm">
            <p className="leading-relaxed text-tinta-700">
              Dos PDF generados con el mismo formato que las boletas reales, para probar el
              procesamiento de punta a punta. Creá una fecha nueva de 10 partidos y subilos.
            </p>
            <div className="flex flex-col gap-2">
              <a className="boton-secundario justify-start" href="/demo/boletas-fecha-12.pdf" download>
                <Iconos.documento className="h-4 w-4" />
                boletas-fecha-12.pdf — 14 boletas correctas
              </a>
              <a
                className="boton-secundario justify-start"
                href="/demo/boletas-fecha-12-con-errores.pdf"
                download
              >
                <Iconos.documento className="h-4 w-4" />
                boletas-fecha-12-con-errores.pdf — 19 boletas, 5 con problemas
              </a>
            </div>
            <p className="ayuda">
              El segundo incluye una boleta incompleta, una con doble marca, una sin nombre, un
              participante repetido y una boleta duplicada.
            </p>
          </div>
        </section>
      </div>

      {correccion && correccion.fecha.auditoria.length > 0 && (
        <section className="tarjeta mt-5">
          <div className="tarjeta-cabecera">
            <h2 className="titulo-seccion">
              Auditoría de {correccion.fecha.nombre}
            </h2>
            <span className="text-xs text-tinta-500">
              Todo cambio queda registrado con fecha y detalle
            </span>
          </div>
          <ul className="divide-y divide-tinta-100">
            {[...correccion.fecha.auditoria].reverse().map((e, i) => (
              <li key={i} className="flex flex-wrap gap-3 px-5 py-3 text-sm">
                <span className="num w-40 shrink-0 text-xs text-tinta-500">
                  {formatearFechaHora(e.fecha)}
                </span>
                <span className="insignia-neutra">{e.accion}</span>
                <span className="min-w-0 flex-1 text-tinta-700">{e.detalle}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
