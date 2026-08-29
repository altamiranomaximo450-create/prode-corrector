"use client";

import Link from "next/link";
import { useProde } from "@/components/estado";
import { Encabezado } from "@/components/shell";
import {
  Cargando,
  Iconos,
  MEDALLAS,
  Metrica,
  Vacio,
  formatearFechaHora,
} from "@/components/ui";

export default function PaginaDashboard() {
  const { correccion, cargandoLista, cargandoFecha, fechas, sistema, error } = useProde();

  if (cargandoLista) return <Cargando texto="Cargando el panel…" />;

  if (error) {
    return (
      <div className="aviso-error">
        <Iconos.alerta className="h-5 w-5 shrink-0" />
        <p>{error}</p>
      </div>
    );
  }

  if (fechas.length === 0) {
    return (
      <>
        <Encabezado titulo="Dashboard" />
        <div className="tarjeta">
          <Vacio
            titulo="Todavía no hay ninguna fecha cargada"
            descripcion="Creá una fecha, cargá los partidos y subí el PDF con las boletas para empezar."
          >
            <Link href="/nueva-fecha" className="boton-primario mt-2">
              <Iconos.mas className="h-4 w-4" />
              Crear la primera fecha
            </Link>
          </Vacio>
        </div>
      </>
    );
  }

  if (cargandoFecha || !correccion) return <Cargando texto="Cargando la fecha…" />;

  const { fecha, resumen, top3, advertencias } = correccion;
  const procesadas = resumen.boletasOk + resumen.boletasResueltasManualmente;

  return (
    <>
      <Encabezado
        titulo={fecha.nombre}
        descripcion={`${fecha.cantidadPartidos} partidos · creada el ${formatearFechaHora(fecha.creadaEn)} · última actualización ${formatearFechaHora(fecha.actualizadaEn)}`}
        acciones={
          <>
            <Link href="/resultados" className="boton-secundario">
              <Iconos.resultados className="h-4 w-4" />
              Resultados oficiales
            </Link>
            <Link href="/ranking" className="boton-primario">
              <Iconos.ranking className="h-4 w-4" />
              Ver ranking
            </Link>
          </>
        }
      />

      {fecha.esDemo && (
        <div className="aviso-demo mb-5">
          <Iconos.alerta className="h-5 w-5 shrink-0" />
          <p>
            <strong>Datos de demostración.</strong> Los participantes y pronósticos de esta
            fecha son ficticios y sirven para mostrar cómo se ve el sistema con información
            cargada. Cuando proceses un PDF real, hacelo sobre una fecha nueva: las fechas de
            demostración no se mezclan con las reales, y podés borrarlas desde Configuración.
          </p>
        </div>
      )}

      {(sistema?.avisos.length ?? 0) > 0 && (
        <div className="mb-5 space-y-2">
          {sistema!.avisos.map((a, i) => (
            <div key={i} className="aviso-alerta">
              <Iconos.alerta className="h-5 w-5 shrink-0" />
              <p>{a}</p>
            </div>
          ))}
        </div>
      )}

      {advertencias.length > 0 && (
        <div className="mb-5 space-y-2">
          {advertencias.map((a, i) => (
            <div key={i} className="aviso-alerta">
              <Iconos.alerta className="h-5 w-5 shrink-0" />
              <p>{a}</p>
            </div>
          ))}
        </div>
      )}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metrica
          titulo="Boletas recibidas"
          valor={resumen.boletasTotales}
          detalle={`${resumen.participantes} participantes distintos`}
          icono={<Iconos.boletas className="h-5 w-5" />}
        />
        <Metrica
          titulo="Procesadas sin problemas"
          valor={procesadas}
          detalle={
            resumen.boletasResueltasManualmente > 0
              ? `${resumen.boletasResueltasManualmente} resueltas a mano`
              : "Listas para el ranking"
          }
          tono="ok"
          icono={<Iconos.ok className="h-5 w-5" />}
        />
        <Metrica
          titulo="Requieren revisión"
          valor={resumen.boletasEnRevision}
          detalle={
            resumen.boletasEnRevision > 0
              ? "No entran al ranking hasta resolverse"
              : "Ninguna boleta pendiente"
          }
          tono={resumen.boletasEnRevision > 0 ? "error" : "ok"}
          icono={<Iconos.alerta className="h-5 w-5" />}
        />
        <Metrica
          titulo="Resultados oficiales"
          valor={`${resumen.partidosConResultado}/${fecha.cantidadPartidos}`}
          detalle={
            resumen.partidosSinResultado > 0
              ? `Faltan ${resumen.partidosSinResultado} partidos`
              : "Todos cargados"
          }
          tono={resumen.partidosSinResultado > 0 ? "alerta" : "ok"}
          icono={<Iconos.resultados className="h-5 w-5" />}
        />
      </section>

      <section className="mt-4 grid gap-4 sm:grid-cols-3">
        <Metrica
          titulo="Máximo de aciertos"
          valor={resumen.maximoAciertos ?? "—"}
          detalle={`sobre ${resumen.partidosConResultado} partidos con resultado`}
          tono="ok"
        />
        <Metrica
          titulo="Promedio de aciertos"
          valor={resumen.promedioAciertos ?? "—"}
          detalle="entre las boletas que entran al ranking"
        />
        <Metrica
          titulo="Mínimo de aciertos"
          valor={resumen.minimoAciertos ?? "—"}
          detalle="entre las boletas que entran al ranking"
        />
      </section>

      <section className="mt-6">
        <div className="tarjeta">
          <div className="tarjeta-cabecera">
            <h2 className="titulo-seccion">🏆 Top 3</h2>
            <Link href="/ganadores" className="boton-sutil boton-chico">
              Ver ganadores
            </Link>
          </div>
          {top3.length === 0 ? (
            <Vacio
              titulo="Todavía no hay podio"
              descripcion="Hacen falta boletas válidas y al menos un resultado oficial cargado."
            />
          ) : (
            <ul className="divide-y divide-tinta-100">
              {top3.map((grupo) => (
                <li key={grupo.puesto} className="flex flex-wrap items-center gap-4 px-5 py-4">
                  <span className="text-2xl">{MEDALLAS[grupo.puesto]}</span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-tinta-900">
                      {grupo.participantes
                        .map((p) => p.participante ?? "(sin nombre)")
                        .join(" · ")}
                    </p>
                    <p className="text-xs text-tinta-500">
                      {grupo.participantes
                        .map((p) => (p.numeroBoleta ? `#${p.numeroBoleta}` : "sin número"))
                        .join(" · ")}
                      {grupo.empate && (
                        <span className="ml-2 font-semibold text-amber-700">
                          empate en el puesto {grupo.puesto}
                        </span>
                      )}
                    </p>
                  </div>
                  <p className="num text-lg font-bold text-tinta-900">
                    {grupo.aciertos}
                    <span className="text-sm font-medium text-tinta-400">
                      /{resumen.partidosConResultado}
                    </span>
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {fecha.diagnostico && (
        <section className="mt-6">
          <div className="tarjeta">
            <div className="tarjeta-cabecera">
              <h2 className="titulo-seccion">Procesamiento del PDF</h2>
              <span className="insignia-neutra">{fecha.diagnostico.nombreArchivo}</span>
            </div>
            <dl className="grid gap-x-6 gap-y-3 px-5 py-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <dt className="text-xs text-tinta-500">Páginas</dt>
                <dd className="num font-semibold">{fecha.diagnostico.paginas}</dd>
              </div>
              <div>
                <dt className="text-xs text-tinta-500">Páginas sin texto</dt>
                <dd className="num font-semibold">
                  {fecha.diagnostico.paginasSinTexto.length || "0"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-tinta-500">Estrategia de lectura</dt>
                <dd className="font-semibold">{fecha.diagnostico.estrategiaSegmentacion}</dd>
              </div>
              <div>
                <dt className="text-xs text-tinta-500">Tiempo</dt>
                <dd className="num font-semibold">{fecha.diagnostico.milisegundos} ms</dd>
              </div>
            </dl>
          </div>
        </section>
      )}
    </>
  );
}
