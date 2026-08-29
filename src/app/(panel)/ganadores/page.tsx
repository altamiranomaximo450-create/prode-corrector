"use client";

import { useState } from "react";
import { useProde } from "@/components/estado";
import { DetalleBoleta } from "@/components/detalle-boleta";
import { Encabezado } from "@/components/shell";
import { Cargando, Iconos, MEDALLAS, Vacio } from "@/components/ui";

const TITULOS: Record<number, string> = {
  1: "PRIMER PUESTO",
  2: "SEGUNDO PUESTO",
  3: "TERCER PUESTO",
  4: "CUARTO PUESTO",
  5: "QUINTO PUESTO",
};

const ESTILOS: Record<number, string> = {
  1: "from-amber-100 to-amber-50 border-amber-300",
  2: "from-tinta-100 to-tinta-50 border-tinta-300",
  3: "from-orange-100 to-orange-50 border-orange-300",
  4: "from-sky-100 to-sky-50 border-sky-300",
  5: "from-violet-100 to-violet-50 border-violet-300",
};

export default function PaginaGanadores() {
  const { correccion, boletas, cargandoFecha } = useProde();
  const [seleccionada, setSeleccionada] = useState<string | null>(null);

  if (cargandoFecha || !correccion) return <Cargando texto="Buscando a los ganadores…" />;

  const { top5, resumen, fecha } = correccion;
  const detalle = correccion.filas.find((f) => f.boletaId === seleccionada);

  return (
    <>
      <Encabezado
        titulo="🏆 Ganadores"
        descripcion={`Podio de ${fecha.nombre}, sobre ${resumen.partidosConResultado} partidos con resultado oficial cargado.`}
      />

      {fecha.esDemo && (
        <div className="aviso-demo mb-5">
          <Iconos.alerta className="h-5 w-5 shrink-0" />
          <p>
            <strong>Datos de demostración.</strong> Este podio surge de boletas ficticias.
          </p>
        </div>
      )}

      {resumen.boletasEnRevision > 0 && (
        <div className="aviso-alerta mb-5">
          <Iconos.alerta className="h-5 w-5 shrink-0" />
          <p>
            Hay <strong>{resumen.boletasEnRevision}</strong> boleta(s) sin resolver que no se
            computaron. El podio puede cambiar cuando las revises.
          </p>
        </div>
      )}

      {top5.length === 0 ? (
        <div className="tarjeta">
          <Vacio
            titulo="Todavía no hay podio"
            descripcion="Hacen falta boletas válidas y al menos un resultado oficial cargado."
          />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {top5.map((grupo) => (
            <div
              key={grupo.puesto}
              className={`rounded-xl border bg-gradient-to-b p-6 text-center ${ESTILOS[grupo.puesto]}`}
            >
              <div className="text-5xl">{MEDALLAS[grupo.puesto]}</div>
              <p className="mt-3 text-xs font-bold tracking-widest text-tinta-600">
                {TITULOS[grupo.puesto]}
              </p>

              <div className="mt-4 space-y-2">
                {grupo.participantes.map((p) => (
                  <button
                    key={p.boletaId}
                    onClick={() => setSeleccionada(p.boletaId)}
                    className="block w-full rounded-lg bg-white/70 px-3 py-2 text-center transition-colors hover:bg-white"
                  >
                    <p className="font-bold text-tinta-900">
                      {p.participante ?? "(sin nombre)"}
                    </p>
                    <p className="num text-xs text-tinta-500">
                      {p.numeroBoleta ? `Boleta #${p.numeroBoleta}` : "sin número"}
                    </p>
                  </button>
                ))}
              </div>

              <p className="num mt-4 text-3xl font-bold text-tinta-900">
                {grupo.aciertos}
                <span className="text-base font-medium text-tinta-400">
                  /{resumen.partidosConResultado}
                </span>
              </p>
              <p className="text-xs font-semibold tracking-wide text-tinta-500 uppercase">
                aciertos
              </p>

              {grupo.empate && (
                <p className="mt-3 rounded-md bg-white/70 px-2 py-1.5 text-xs font-semibold text-amber-800">
                  Empate de {grupo.participantes.length} participantes en este puesto.
                  {fecha.config.desempate === "ninguna"
                    ? " No hay regla de desempate definida."
                    : " La regla de desempate configurada no los separa."}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {top5.some((g) => g.empate) && (
        <div className="aviso-info mt-5">
          <Iconos.lupa className="h-5 w-5 shrink-0" />
          <p>
            El sistema no inventa criterios de desempate. Si el reglamento del Prode tiene uno,
            configuralo en <strong>Resultados → Regla de desempate</strong> y el podio se
            recalcula.
          </p>
        </div>
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
