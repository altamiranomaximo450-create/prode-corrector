"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function Formulario() {
  const router = useRouter();
  const parametros = useSearchParams();
  const volver = parametros.get("volver") ?? "/";

  const [clave, setClave] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clave }),
      });
      const datos = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(datos.error ?? "No se pudo iniciar sesión.");
        setEnviando(false);
        return;
      }
      // replace + refresh para que el middleware vuelva a evaluar la cookie.
      router.replace(volver.startsWith("/") ? volver : "/");
      router.refresh();
    } catch {
      setError("No se pudo conectar con el servidor.");
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={enviar} className="tarjeta w-full max-w-sm p-7">
      <div className="mb-6">
        <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-acento-600 text-lg font-bold text-white">
          P
        </div>
        <h1 className="text-xl font-bold text-tinta-900">Corrector de Prode</h1>
        <p className="mt-1 text-sm text-tinta-500">
          Panel privado. Ingresá la contraseña de administrador.
        </p>
      </div>

      <label className="etiqueta" htmlFor="clave">
        Contraseña
      </label>
      <input
        id="clave"
        type="password"
        className="campo"
        value={clave}
        autoFocus
        autoComplete="current-password"
        onChange={(e) => setClave(e.target.value)}
        placeholder="••••••••"
      />

      {error && (
        <p className="mt-4 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}

      <button type="submit" className="boton-primario mt-5 w-full" disabled={enviando || !clave}>
        {enviando ? "Verificando…" : "Ingresar"}
      </button>
    </form>
  );
}

export default function PaginaIngresar() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-tinta-100 px-4 py-10">
      <Suspense fallback={<div className="text-sm text-tinta-500">Cargando…</div>}>
        <Formulario />
      </Suspense>
    </main>
  );
}
