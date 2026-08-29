"use client";

import type { Pronostico } from "@/lib/tipos";

const OPCIONES: { valor: Pronostico; simbolo: string; texto: string }[] = [
  { valor: "1", simbolo: "1", texto: "LOCAL" },
  { valor: "X", simbolo: "X", texto: "EMPATE" },
  { valor: "2", simbolo: "2", texto: "VISITANTE" },
];

/**
 * Selector de resultado oficial.
 *
 * Muestra el símbolo y la palabra completa a la vez (1 = LOCAL, X = EMPATE,
 * 2 = VISITANTE) porque el error de carga más caro es confundir 1 con 2, y
 * ese error se propaga a todas las boletas de la fecha.
 */
export function SelectorResultado({
  valor,
  onCambio,
  nombreGrupo,
  compacto = false,
}: {
  valor: Pronostico | null;
  onCambio: (v: Pronostico | null) => void;
  nombreGrupo: string;
  compacto?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={nombreGrupo}>
      {OPCIONES.map((o) => {
        const activo = valor === o.valor;
        return (
          <button
            key={o.valor}
            type="button"
            aria-pressed={activo}
            onClick={() => onCambio(activo ? null : o.valor)}
            className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-bold transition-colors ${
              activo
                ? "border-acento-600 bg-acento-600 text-white"
                : "border-tinta-300 bg-white text-tinta-600 hover:border-acento-400 hover:text-acento-700"
            }`}
          >
            <span className="num text-sm">{o.simbolo}</span>
            {!compacto && <span className="tracking-wide">{o.texto}</span>}
          </button>
        );
      })}
      {valor !== null && (
        <button
          type="button"
          onClick={() => onCambio(null)}
          className="rounded-lg px-2 py-1.5 text-xs font-medium text-tinta-400 hover:text-red-600"
          title="Quitar el resultado cargado"
        >
          borrar
        </button>
      )}
    </div>
  );
}
