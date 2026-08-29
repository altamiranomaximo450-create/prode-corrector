"use client";

import { useMemo, useState } from "react";
import { useProde } from "@/components/estado";
import { DetalleBoleta } from "@/components/detalle-boleta";
import { SubirPdf } from "@/components/procesar-pdf";
import { Encabezado } from "@/components/shell";
import {
  Cargando,
  Iconos,
  InsigniaEstado,
  MarcaPronostico,
  Modal,
  Vacio,
} from "@/components/ui";
import type { Pronostico } from "@/lib/tipos";

type Filtro = "todas" | "ok" | "revision";

export default function PaginaBoletas() {
  const { correccion, boletas, cargandoFecha, fechaActivaId, agregarBoleta } = useProde();
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [busqueda, setBusqueda] = useState("");
  const [seleccionada, setSeleccionada] = useState<string | null>(null);
  const [panelSubida, setPanelSubida] = useState(false);
  const [panelManual, setPanelManual] = useState(false);

  const filas = useMemo(() => {
    if (!correccion) return [];
    const texto = busqueda.trim().toLowerCase();
    return correccion.filas.filter((f) => {
      if (filtro === "ok" && f.estado === "revision") return false;
      if (filtro === "revision" && f.estado !== "revision") return false;
      if (!texto) return true;
      return (
        (f.participante ?? "").toLowerCase().includes(texto) ||
        (f.numeroBoleta ?? "").toLowerCase().includes(texto)
      );
    });
  }, [correccion, filtro, busqueda]);

  if (cargandoFecha || !correccion) return <Cargando texto="Cargando las boletas…" />;

  const detalle = correccion.filas.find((f) => f.boletaId === seleccionada);
  const boletaCruda = boletas.find((b) => b.id === seleccionada);

  return (
    <>
      <Encabezado
        titulo="Boletas"
        descripcion={`${correccion.resumen.boletasTotales} boletas en ${correccion.fecha.nombre}. Hacé clic en cualquiera para ver el detalle partido por partido y el texto original del PDF.`}
        acciones={
          <>
            <button className="boton-secundario" onClick={() => setPanelManual(true)}>
              <Iconos.mas className="h-4 w-4" />
              Cargar a mano
            </button>
            <button className="boton-primario" onClick={() => setPanelSubida(true)}>
              <Iconos.subir className="h-4 w-4" />
              Subir PDF
            </button>
          </>
        }
      />

      <div className="tarjeta mb-5">
        <div className="flex flex-wrap items-center gap-3 p-4">
          <div className="relative min-w-56 flex-1">
            <Iconos.buscar className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-tinta-400" />
            <input
              className="campo pl-9"
              placeholder="Buscar por participante o número de boleta"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
            />
          </div>
          <div className="flex gap-1 rounded-lg border border-tinta-300 bg-white p-1">
            {(
              [
                ["todas", `Todas (${correccion.resumen.boletasTotales})`],
                ["ok", `Sin problemas (${correccion.resumen.boletasOk + correccion.resumen.boletasResueltasManualmente})`],
                ["revision", `A revisar (${correccion.resumen.boletasEnRevision})`],
              ] as [Filtro, string][]
            ).map(([clave, texto]) => (
              <button
                key={clave}
                onClick={() => setFiltro(clave)}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                  filtro === clave
                    ? "bg-acento-600 text-white"
                    : "text-tinta-600 hover:bg-tinta-100"
                }`}
              >
                {texto}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="tarjeta overflow-hidden">
        {filas.length === 0 ? (
          <Vacio
            titulo="No hay boletas para mostrar"
            descripcion={
              correccion.resumen.boletasTotales === 0
                ? "Subí el PDF con las boletas de esta fecha o cargalas a mano."
                : "Probá cambiando el filtro o el texto de búsqueda."
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="tabla min-w-[760px]">
              <thead>
                <tr>
                  <th className="w-20">Boleta</th>
                  <th>Participante</th>
                  <th className="w-28 text-center">Aciertos</th>
                  <th className="w-24 text-center">%</th>
                  <th>Pronósticos</th>
                  <th className="w-44">Estado</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => (
                  <tr
                    key={f.boletaId}
                    className="cursor-pointer transition-colors hover:bg-acento-50/60"
                    onClick={() => setSeleccionada(f.boletaId)}
                  >
                    <td className="num font-semibold text-tinta-500">
                      {f.numeroBoleta ? `#${f.numeroBoleta}` : "—"}
                    </td>
                    <td>
                      <p className="font-medium text-tinta-900">
                        {f.participante ?? (
                          <span className="text-red-600 italic">sin nombre detectado</span>
                        )}
                      </p>
                      <p className="text-xs text-tinta-400">
                        {f.paginas.length
                          ? `página(s) ${f.paginas.join(", ")}`
                          : "carga manual"}
                      </p>
                    </td>
                    <td className="num text-center font-bold text-tinta-900">
                      {f.aciertos}
                      <span className="text-xs font-medium text-tinta-400">
                        /{f.partidosEvaluados}
                      </span>
                    </td>
                    <td className="num text-center text-tinta-700">{f.porcentaje}%</td>
                    <td>
                      <div className="flex flex-wrap gap-1">
                        {f.detalle.map((d) => (
                          <MarcaPronostico
                            key={d.partidoNumero}
                            valor={d.pronostico}
                            titulo={`${d.local} vs ${d.visitante}`}
                            tono={
                              d.estado === "acierto"
                                ? "acierto"
                                : d.estado === "error"
                                  ? "error"
                                  : "vacio"
                            }
                          />
                        ))}
                      </div>
                    </td>
                    <td>
                      <InsigniaEstado estado={f.estado} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {detalle && (
        <DetalleBoleta
          fila={detalle}
          boleta={boletaCruda}
          onCerrar={() => setSeleccionada(null)}
        />
      )}

      <Modal
        abierto={panelSubida}
        onCerrar={() => setPanelSubida(false)}
        titulo="Subir el PDF con las boletas"
        descripcion="El sistema lee el PDF, detecta cada boleta y valida la información antes de calcular nada."
      >
        <div className="p-5">
          {fechaActivaId && (
            <SubirPdf fechaId={fechaActivaId} esDemo={correccion.fecha.esDemo} />
          )}
        </div>
      </Modal>

      <FormularioManual
        abierto={panelManual}
        onCerrar={() => setPanelManual(false)}
        cantidadPartidos={correccion.fecha.cantidadPartidos}
        partidos={correccion.fecha.partidos}
        onGuardar={agregarBoleta}
      />
    </>
  );
}

function FormularioManual({
  abierto,
  onCerrar,
  cantidadPartidos,
  partidos,
  onGuardar,
}: {
  abierto: boolean;
  onCerrar: () => void;
  cantidadPartidos: number;
  partidos: { numero: number; local: string; visitante: string }[];
  onGuardar: (datos: Record<string, unknown>) => Promise<void>;
}) {
  const [participante, setParticipante] = useState("");
  const [numero, setNumero] = useState("");
  const [valores, setValores] = useState<(Pronostico | "")[]>(
    Array.from({ length: cantidadPartidos }, () => ""),
  );
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar() {
    setGuardando(true);
    setError(null);
    try {
      await onGuardar({
        participante: participante.trim(),
        numeroBoleta: numero.trim() || null,
        pronosticos: valores.map((v) => (v === "" ? null : v)),
      });
      setParticipante("");
      setNumero("");
      setValores(Array.from({ length: cantidadPartidos }, () => ""));
      onCerrar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar la boleta.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Modal
      abierto={abierto}
      onCerrar={onCerrar}
      titulo="Cargar una boleta a mano"
      descripcion="Para boletas que el PDF no pudo leer, o que llegaron en papel."
    >
      <div className="space-y-4 p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="etiqueta" htmlFor="man-part">
              Participante
            </label>
            <input
              id="man-part"
              className="campo"
              value={participante}
              onChange={(e) => setParticipante(e.target.value)}
              placeholder="Nombre y apellido"
            />
          </div>
          <div>
            <label className="etiqueta" htmlFor="man-num">
              Número de boleta (opcional)
            </label>
            <input
              id="man-num"
              className="campo"
              value={numero}
              onChange={(e) => setNumero(e.target.value)}
              placeholder="Ej.: 184"
            />
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border border-tinta-200">
          <table className="tabla">
            <thead>
              <tr>
                <th className="w-10">#</th>
                <th>Partido</th>
                <th className="w-52">Pronóstico</th>
              </tr>
            </thead>
            <tbody>
              {partidos.map((p, i) => (
                <tr key={p.numero}>
                  <td className="num text-tinta-500">{p.numero}</td>
                  <td className="text-tinta-900">
                    {p.local} <span className="text-tinta-400">vs</span> {p.visitante}
                  </td>
                  <td>
                    <div className="flex gap-1.5">
                      {(["1", "X", "2"] as Pronostico[]).map((op) => (
                        <button
                          key={op}
                          type="button"
                          onClick={() =>
                            setValores((prev) =>
                              prev.map((v, j) => (j === i ? (v === op ? "" : op) : v)),
                            )
                          }
                          className={`num h-8 w-9 rounded-md border text-sm font-bold transition-colors ${
                            valores[i] === op
                              ? "border-acento-600 bg-acento-600 text-white"
                              : "border-tinta-300 bg-white text-tinta-600 hover:border-acento-400"
                          }`}
                        >
                          {op}
                        </button>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {error && <div className="aviso-error">{error}</div>}

        <div className="flex gap-2">
          <button
            className="boton-primario"
            onClick={guardar}
            disabled={guardando || !participante.trim()}
          >
            {guardando ? "Guardando…" : "Guardar boleta"}
          </button>
          <button className="boton-secundario" onClick={onCerrar} disabled={guardando}>
            Cancelar
          </button>
        </div>
        <p className="ayuda">
          Si dejás algún partido sin marcar, la boleta queda marcada para revisión: el sistema
          no completa pronósticos por su cuenta.
        </p>
      </div>
    </Modal>
  );
}
