"use client";

import { useState } from "react";
import { useProde } from "@/components/estado";
import { DetalleBoleta } from "@/components/detalle-boleta";
import { Encabezado } from "@/components/shell";
import { Cargando, Iconos, InsigniaEstado, MEDALLAS, Vacio } from "@/components/ui";

export default function PaginaRanking() {
  const { correccion, boletas, cargandoFecha, fechaActivaId } = useProde();
  const [seleccionada, setSeleccionada] = useState<string | null>(null);

  if (cargandoFecha || !correccion) return <Cargando texto="Calculando el ranking…" />;

  const { ranking, enRevision, resumen, fecha, advertencias } = correccion;
  const detalle = correccion.filas.find((f) => f.boletaId === seleccionada);

  return (
    <>
      <Encabezado
        titulo="Ranking"
        descripcion={`${ranking.length} boletas ordenadas por aciertos sobre ${resumen.partidosConResultado} partidos con resultado oficial.`}
        acciones={
          <>
            <a
              className="boton-secundario"
              href={`/api/fechas/${fechaActivaId}/exportar?formato=csv`}
            >
              <Iconos.descargar className="h-4 w-4" />
              CSV
            </a>
            <a
              className="boton-primario"
              href={`/api/fechas/${fechaActivaId}/exportar?formato=xlsx`}
            >
              <Iconos.descargar className="h-4 w-4" />
              Excel
            </a>
          </>
        }
      />

      {fecha.esDemo && (
        <div className="aviso-demo mb-5">
          <Iconos.alerta className="h-5 w-5 shrink-0" />
          <p>
            <strong>Datos de demostración.</strong> Este ranking se calculó sobre boletas
            ficticias.
          </p>
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

      <div className="tarjeta overflow-hidden">
        {ranking.length === 0 ? (
          <Vacio
            titulo="Todavía no hay ranking"
            descripcion="Hacen falta boletas válidas y al menos un resultado oficial cargado."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="tabla min-w-[700px]">
              <thead>
                <tr>
                  <th className="w-24">Posición</th>
                  <th>Participante</th>
                  <th className="w-24">Boleta</th>
                  <th className="w-28 text-center">Aciertos</th>
                  <th className="w-24 text-center">Errores</th>
                  <th className="w-28 text-center">Porcentaje</th>
                  <th className="w-40">Estado</th>
                </tr>
              </thead>
              <tbody>
                {ranking.map((r) => (
                  <tr
                    key={r.boletaId}
                    className={`cursor-pointer transition-colors hover:bg-acento-50/60 ${
                      r.posicion <= 3 ? "bg-amber-50/40" : ""
                    }`}
                    onClick={() => setSeleccionada(r.boletaId)}
                  >
                    <td>
                      <span className="flex items-center gap-2">
                        <span className="text-lg">{MEDALLAS[r.posicion] ?? ""}</span>
                        <span className="num font-bold text-tinta-900">{r.posicion}</span>
                        {r.empatado && (
                          <span
                            className="text-[10px] font-bold tracking-wide text-amber-700 uppercase"
                            title="Comparte posición con otro participante"
                          >
                            empate
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="font-medium text-tinta-900">
                      {r.participante ?? (
                        <span className="text-red-600 italic">sin nombre</span>
                      )}
                    </td>
                    <td className="num text-tinta-500">
                      {r.numeroBoleta ? `#${r.numeroBoleta}` : "—"}
                    </td>
                    <td className="num text-center text-base font-bold text-emerald-700">
                      {r.aciertos}
                      <span className="text-xs font-medium text-tinta-400">
                        /{r.partidosEvaluados}
                      </span>
                    </td>
                    <td className="num text-center text-tinta-700">{r.errores}</td>
                    <td className="num text-center font-semibold text-tinta-900">
                      {r.porcentaje}%
                    </td>
                    <td>
                      <InsigniaEstado estado={r.estado} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {enRevision.length > 0 && (
        <section className="mt-6">
          <div className="tarjeta overflow-hidden">
            <div className="tarjeta-cabecera">
              <h2 className="titulo-seccion">
                ⚠️ Fuera del ranking hasta resolverse ({enRevision.length})
              </h2>
              <span className="text-xs text-tinta-500">
                No se les asigna posición porque su lectura no es confiable
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="tabla min-w-[640px]">
                <thead>
                  <tr>
                    <th className="w-24">Boleta</th>
                    <th>Participante</th>
                    <th className="w-28 text-center">Aciertos</th>
                    <th>Problema</th>
                  </tr>
                </thead>
                <tbody>
                  {enRevision.map((f) => (
                    <tr
                      key={f.boletaId}
                      className="cursor-pointer transition-colors hover:bg-red-50/60"
                      onClick={() => setSeleccionada(f.boletaId)}
                    >
                      <td className="num text-tinta-500">
                        {f.numeroBoleta ? `#${f.numeroBoleta}` : "—"}
                      </td>
                      <td className="font-medium text-tinta-900">
                        {f.participante ?? (
                          <span className="text-red-600 italic">sin nombre</span>
                        )}
                      </td>
                      <td className="num text-center text-tinta-500">{f.aciertos}</td>
                      <td className="text-sm text-tinta-600">
                        {f.problemas
                          .filter((p) => p.severidad === "error")
                          .map((p) => p.mensaje)
                          .join(" ")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {detalle && (
        <DetalleBoleta
          fila={detalle}
          boleta={boletas.find((b) => b.id === seleccionada)}
          onCerrar={() => setSeleccionada(null)}
        />
      )}
    </>
  );
}
