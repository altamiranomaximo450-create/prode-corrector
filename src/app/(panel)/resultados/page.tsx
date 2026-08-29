"use client";

import { useEffect, useState } from "react";
import { useProde } from "@/components/estado";
import { SelectorResultado } from "@/components/selector-resultado";
import { Encabezado } from "@/components/shell";
import { Cargando, Iconos } from "@/components/ui";
import type { Partido, Pronostico, ReglaDesempate } from "@/lib/tipos";

export default function PaginaResultados() {
  const { correccion, cargandoFecha, fechaActivaId, guardarFecha } = useProde();

  const [partidos, setPartidos] = useState<Partido[]>([]);
  const [desempate, setDesempate] = useState<ReglaDesempate>("ninguna");
  const [partidoClave, setPartidoClave] = useState<number | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guardado, setGuardado] = useState(false);

  useEffect(() => {
    if (!correccion) return;
    setPartidos(correccion.fecha.partidos.map((p) => ({ ...p })));
    setDesempate(correccion.fecha.config.desempate);
    setPartidoClave(correccion.fecha.config.partidoClave);
    setGuardado(false);
  }, [correccion?.fecha.id, correccion?.fecha.actualizadaEn]); // eslint-disable-line react-hooks/exhaustive-deps

  if (cargandoFecha || !correccion) return <Cargando texto="Cargando los resultados…" />;

  const cargados = partidos.filter((p) => p.resultado !== null).length;
  const original = correccion.fecha.partidos;
  const hayCambios =
    desempate !== correccion.fecha.config.desempate ||
    partidoClave !== correccion.fecha.config.partidoClave ||
    partidos.some(
      (p, i) =>
        p.resultado !== original[i]?.resultado ||
        p.local !== original[i]?.local ||
        p.visitante !== original[i]?.visitante,
    );

  function actualizar(indice: number, cambios: Partial<Partido>) {
    setPartidos((prev) => prev.map((p, i) => (i === indice ? { ...p, ...cambios } : p)));
    setGuardado(false);
  }

  async function guardar() {
    if (!fechaActivaId) return;
    setGuardando(true);
    setError(null);
    try {
      await guardarFecha(fechaActivaId, {
        partidos: partidos.map((p) => ({
          local: p.local,
          visitante: p.visitante,
          resultado: p.resultado,
        })),
        config: { desempate, partidoClave },
      });
      setGuardado(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron guardar los resultados.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <>
      <Encabezado
        titulo="Resultados oficiales"
        descripcion="Cargá cómo terminó cada partido. La corrección se recalcula sola: no hace falta volver a procesar el PDF."
        acciones={
          <button className="boton-primario" onClick={guardar} disabled={guardando || !hayCambios}>
            {guardando ? "Guardando…" : "Guardar y corregir"}
          </button>
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <span className={cargados === partidos.length ? "insignia-ok" : "insignia-alerta"}>
          {cargados} de {partidos.length} resultados cargados
        </span>
        {guardado && !hayCambios && (
          <span className="insignia-ok">
            <Iconos.ok className="h-3.5 w-3.5" />
            Guardado. El ranking ya está actualizado.
          </span>
        )}
        {hayCambios && (
          <span className="insignia-alerta">Hay cambios sin guardar</span>
        )}
      </div>

      {error && (
        <div className="aviso-error mb-5">
          <Iconos.alerta className="h-5 w-5 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      <section className="tarjeta">
        <div className="tarjeta-cabecera">
          <h2 className="titulo-seccion">Partidos de {correccion.fecha.nombre}</h2>
          <span className="insignia-neutra">1 = LOCAL · X = EMPATE · 2 = VISITANTE</span>
        </div>
        <div className="divide-y divide-tinta-100">
          {partidos.map((p, i) => (
            <div key={p.numero} className="grid gap-3 px-5 py-4 lg:grid-cols-[2.5rem_1fr_auto]">
              <span className="num self-center text-sm font-semibold text-tinta-400">
                {p.numero}
              </span>
              <div className="grid gap-2 sm:grid-cols-2">
                <input
                  className="campo"
                  value={p.local}
                  onChange={(e) => actualizar(i, { local: e.target.value })}
                  aria-label={`Equipo local del partido ${p.numero}`}
                />
                <input
                  className="campo"
                  value={p.visitante}
                  onChange={(e) => actualizar(i, { visitante: e.target.value })}
                  aria-label={`Equipo visitante del partido ${p.numero}`}
                />
              </div>
              <div className="self-center">
                <SelectorResultado
                  valor={p.resultado}
                  onCambio={(v) => actualizar(i, { resultado: v })}
                  nombreGrupo={`Resultado del partido ${p.numero}`}
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="tarjeta mt-5">
        <div className="tarjeta-cabecera">
          <h2 className="titulo-seccion">Regla de desempate</h2>
        </div>
        <div className="space-y-3 p-5">
          <p className="text-sm leading-relaxed text-tinta-600">
            Por defecto el sistema <strong>no desempata</strong>: si dos participantes tienen la
            misma cantidad de aciertos, comparten la posición y aparecen los dos. Podés definir
            una regla acá si el reglamento del Prode tiene una.
          </p>
          <div className="space-y-2">
            {(
              [
                ["ninguna", "Sin desempate — los empatados comparten posición (recomendado)"],
                ["partido_clave", "Gana quien acertó un partido determinado"],
                ["orden_boleta", "Gana el número de boleta más bajo (orden de entrega)"],
              ] as [ReglaDesempate, string][]
            ).map(([valor, texto]) => (
              <label
                key={valor}
                className="flex cursor-pointer items-start gap-3 rounded-lg border border-tinta-200 p-3 hover:bg-tinta-50"
              >
                <input
                  type="radio"
                  name="desempate"
                  className="mt-0.5"
                  checked={desempate === valor}
                  onChange={() => {
                    setDesempate(valor);
                    if (valor !== "partido_clave") setPartidoClave(null);
                    else if (partidoClave === null) setPartidoClave(1);
                    setGuardado(false);
                  }}
                />
                <span className="text-sm text-tinta-800">{texto}</span>
              </label>
            ))}
          </div>

          {desempate === "partido_clave" && (
            <div className="max-w-sm">
              <label className="etiqueta" htmlFor="clave">
                Partido que decide
              </label>
              <select
                id="clave"
                className="campo"
                value={partidoClave ?? 1}
                onChange={(e) => {
                  setPartidoClave(Number(e.target.value));
                  setGuardado(false);
                }}
              >
                {partidos.map((p) => (
                  <option key={p.numero} value={p.numero}>
                    {p.numero} · {p.local} vs {p.visitante}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
