import { useEffect, useState } from "react";
import type { ReactElement } from "react";
import { CheckCircle2, Database, RefreshCw, TriangleAlert } from "lucide-react";

import type { HealthResponse } from "@gestion/contracts";

import { getHealth } from "@/lib/api";

type ViewState =
  | { kind: "loading" }
  | { kind: "success"; response: Extract<HealthResponse, { status: "ok" }> }
  | { kind: "error"; message: string };

export function HealthPage(): ReactElement {
  const [state, setState] = useState<ViewState>({ kind: "loading" });

  const checkHealth = async (): Promise<void> => {
    setState({ kind: "loading" });

    try {
      const response = await getHealth();
      if (response.status === "ok") {
        setState({ kind: "success", response });
        return;
      }

      setState({ kind: "error", message: response.message });
    } catch {
      setState({ kind: "error", message: "No se pudo comunicar con la API." });
    }
  };

  useEffect(() => {
    void checkHealth();
  }, []);

  const isConnected = state.kind === "success";
  const databaseLabel = isConnected
    ? "Base de datos: conectada"
    : "Base de datos: pendiente";

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl items-center px-6 py-12">
      <section className="w-full border border-slate-200 bg-white p-8 shadow-sm sm:p-12">
        <p className="mb-3 text-sm font-semibold tracking-wide text-teal-700">
          ENTORNO DE DESARROLLO
        </p>
        <h1 className="text-3xl font-semibold text-slate-950">
          Sistema de Gestion
        </h1>
        <p className="mt-3 max-w-xl text-slate-600">
          Verificacion de la comunicacion entre la aplicacion web, la API y la
          base de datos.
        </p>

        <div className="mt-10 grid gap-3">
          <StatusLine
            label="API"
            connected={
              state.kind !== "error" ||
              state.message !== "No se pudo comunicar con la API."
            }
          />
          <StatusLine label={databaseLabel} connected={isConnected} database />
        </div>

        {state.kind === "error" ? (
          <div className="mt-6 flex gap-3 border border-amber-200 bg-amber-50 p-4 text-amber-950">
            <TriangleAlert
              className="mt-0.5 size-5 shrink-0"
              aria-hidden="true"
            />
            <p>{state.message}</p>
          </div>
        ) : null}

        <button
          type="button"
          onClick={() => void checkHealth()}
          disabled={state.kind === "loading"}
          className="mt-8 inline-flex h-10 items-center gap-2 border border-slate-900 bg-slate-900 px-4 text-sm font-medium text-white transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshCw
            className={
              state.kind === "loading" ? "size-4 animate-spin" : "size-4"
            }
            aria-hidden="true"
          />
          Actualizar estado
        </button>
      </section>
    </main>
  );
}

function StatusLine({
  label,
  connected,
  database = false,
}: {
  label: string;
  connected: boolean;
  database?: boolean;
}): ReactElement {
  const Icon = database ? Database : CheckCircle2;

  return (
    <div className="flex items-center gap-3 border border-slate-200 px-4 py-3">
      <Icon
        className={
          connected ? "size-5 text-emerald-600" : "size-5 text-amber-600"
        }
        aria-hidden="true"
      />
      <span className="text-sm font-medium text-slate-800">
        {connected ? `${label}: conectada` : label}
      </span>
    </div>
  );
}
