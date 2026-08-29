"use client";

import { useState } from "react";
import { useProde } from "@/components/estado";
import { DetalleBoleta } from "@/components/detalle-boleta";
import { Encabezado } from "@/components/shell";
import { Cargando, Iconos, Vacio } from "@/components/ui";
import type { CodigoProblema } from "@/lib/tipos";

const EXPLICACION: Record<CodigoProblema, string> = {
  SIN_CAPA_TEXTO: "La página no tiene texto legible (probablemente sea una imagen escaneada).",
  NOMBRE_NO_DETECTADO: "No se encontró el nombre del participante.",
  NOMBRE_DUDOSO: "El nombre se dedujo sin una etiqueta clara en la boleta.",
  NUMERO_NO_DETECTADO: "La boleta no declara un número identificatorio.",
  CANTIDAD_PRONOSTICOS: "La cantidad de pronósticos leídos no coincide con los partidos.",
  PRONOSTICO_AMBIGUO: "Hay más de una opción marcada en el mismo partido.",
  PRONOSTICO_FALTANTE: "Falta el pronóstico de un partido.",
  PARTIDO_DESCONOCIDO: "Los equipos leídos no coinciden con los partidos cargados.",
  BOLETA_INCOMPLETA: "La boleta está incompleta.",
  DUPLICADO_BOLETA: "Hay otra boleta idéntica.",
  DUPLICADO_PARTICIPANTE: "El participante aparece en más de una boleta.",
  DUPLICADO_NUMERO: "El número de boleta está repetido.",
  SEGMENTO_SIN_DATOS: "No se detectó ningún pronóstico en este bloque del PDF.",
  RESULTADO_OFICIAL_FALTANTE: "Falta cargar el resultado oficial de un partido.",
};

export default function PaginaRevision() {
  const { correccion, boletas, cargandoFecha } = useProde();
  const [seleccionada, setSeleccionada] = useState<string | null>(null);

  if (cargandoFecha || !correccion) return <Cargando texto="Buscando problemas…" />;

  const pendientes = correccion.enRevision;
  const conAvisos = correccion.filas.filter(
    (f) => f.elegible && f.problemas.some((p) => p.severidad === "aviso"),
  );
  const detalle = correccion.filas.find((f) => f.boletaId === seleccionada);

  return (
    <>
      <Encabezado
        titulo="⚠️ Requieren revisión"
        descripcion="Boletas que el sistema no pudo interpretar con certeza. No entran al ranking hasta que las resuelvas: es preferible frenar antes que asignar un puntaje equivocado."
      />

      {pendientes.length === 0 ? (
        <div className="tarjeta mb-6">
          <Vacio
            titulo="Ninguna boleta pendiente"
            descripcion="Todas las boletas de esta fecha se leyeron sin problemas bloqueantes."
          />
        </div>
      ) : (
        <div className="mb-6 space-y-4">
          {pendientes.map((f) => {
            const errores = f.problemas.filter((p) => p.severidad === "error");
            return (
              <div key={f.boletaId} className="tarjeta overflow-hidden border-red-200">
                <div className="tarjeta-cabecera bg-red-50/60">
                  <div>
                    <p className="font-bold text-tinta-900">
                      {f.participante ?? (
                        <span className="text-red-700 italic">Participante sin identificar</span>
                      )}
                    </p>
                    <p className="num text-xs text-tinta-500">
                      Boleta {f.numeroBoleta ? `#${f.numeroBoleta}` : "sin número"}
                      {f.paginas.length ? ` · página(s) ${f.paginas.join(", ")} del PDF` : ""}
                    </p>
                  </div>
                  <button
                    className="boton-primario boton-chico"
                    onClick={() => setSeleccionada(f.boletaId)}
                  >
                    <Iconos.ojo className="h-4 w-4" />
                    Revisar y corregir
                  </button>
                </div>

                <ul className="divide-y divide-tinta-100">
                  {errores.map((p, i) => (
                    <li key={i} className="px-5 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="insignia-error">{p.codigo}</span>
                        {p.pagina && (
                          <span className="insignia-neutra">página {p.pagina}</span>
                        )}
                        {p.partidoNumero && (
                          <span className="insignia-neutra">partido {p.partidoNumero}</span>
                        )}
                      </div>
                      <p className="mt-2 text-sm text-tinta-800">{p.mensaje}</p>
                      <p className="mt-0.5 text-xs text-tinta-500">{EXPLICACION[p.codigo]}</p>
                      {p.textoProblematico && (
                        <p className="mt-2 rounded border border-tinta-200 bg-tinta-50 px-2.5 py-1.5 font-mono text-[11px] break-all text-tinta-700">
                          {p.textoProblematico}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}

      {conAvisos.length > 0 && (
        <section>
          <div className="tarjeta overflow-hidden">
            <div className="tarjeta-cabecera">
              <h2 className="titulo-seccion">
                Avisos que no bloquean el ranking ({conAvisos.length})
              </h2>
              <span className="text-xs text-tinta-500">
                Vale la pena mirarlos, pero estas boletas sí se computan
              </span>
            </div>
            <table className="tabla">
              <thead>
                <tr>
                  <th className="w-24">Boleta</th>
                  <th className="w-56">Participante</th>
                  <th>Aviso</th>
                </tr>
              </thead>
              <tbody>
                {conAvisos.map((f) =>
                  f.problemas
                    .filter((p) => p.severidad === "aviso")
                    .map((p, i) => (
                      <tr
                        key={`${f.boletaId}-${i}`}
                        className="cursor-pointer hover:bg-amber-50/60"
                        onClick={() => setSeleccionada(f.boletaId)}
                      >
                        <td className="num text-tinta-500">
                          {f.numeroBoleta ? `#${f.numeroBoleta}` : "—"}
                        </td>
                        <td className="font-medium text-tinta-900">
                          {f.participante ?? "(sin nombre)"}
                        </td>
                        <td className="text-sm text-tinta-700">{p.mensaje}</td>
                      </tr>
                    )),
                )}
              </tbody>
            </table>
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
