import { useEffect, useRef, useState } from "react";
import {
  cashSettingsRequest,
  type CashSettings,
  type CashRegister,
} from "./lib/api";
import { SearchableSaleSelect } from "./searchable-sale-select";

export function CashRulesSettings({
  token,
  organizationId,
  branchId,
  registers,
  onSaved,
  onDirty,
}: {
  token: string;
  organizationId: string;
  branchId: string;
  registers: CashRegister[];
  onSaved: () => void;
  onDirty: (dirty: boolean) => void;
}) {
  const [saved, setSaved] = useState<CashSettings>();
  const [draft, setDraft] = useState<CashSettings>();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const dirty = Boolean(
    saved && draft && JSON.stringify(saved) !== JSON.stringify(draft),
  );
  useEffect(() => {
    onDirty(dirty || busy);
  }, [dirty, busy, onDirty]);
  useEffect(() => {
    let cancelled = false;
    void cashSettingsRequest(token, organizationId, branchId)
      .then((value) => {
        if (cancelled) return;
        const active = registers.filter((register) => register.active);
        const normalized = {
          ...value,
          defaultRegisterId:
            value.defaultRegisterId ??
            (active.length === 1 ? active[0]!.id : null),
        };
        setSaved(normalized);
        setDraft(normalized);
      })
      .catch((cause: unknown) => {
        if (!cancelled)
          setError(
            cause instanceof Error
              ? cause.message
              : "No se pudo cargar la configuración.",
          );
      });
    return () => {
      cancelled = true;
    };
  }, [token, organizationId, branchId]); // eslint-disable-line react-hooks/exhaustive-deps
  const toggles = [
    [
      "allowWithoutSession",
      "Permitir vender sin caja abierta",
      "Incluye cobros en efectivo, tarjeta y transferencia; quedan pendientes de caja.",
    ],
    [
      "askOpeningAmount",
      "Solicitar efectivo inicial al abrir",
      "Si se desactiva, las nuevas sesiones empiezan con fondo inicial $0.",
    ],
    [
      "requireMovementReason",
      "Exigir motivo en ingresos y egresos",
      "Pide una explicación al registrar un movimiento manual.",
    ],
    [
      "allowManualMovements",
      "Permitir movimientos manuales",
      "Disponible únicamente para usuarios con permiso de gestión de caja.",
    ],
  ] as const;
  return (
    <form
      className="mt-5 rounded-xl border border-slate-200 bg-white p-5"
      onSubmit={(event) => {
        event.preventDefault();
        if (!draft || pending.current) return;
        pending.current = true;
        setBusy(true);
        setError("");
        setNotice("");
        void cashSettingsRequest(token, organizationId, branchId, draft)
          .then((value) => {
            setSaved(value);
            setDraft(value);
            setNotice("Reglas guardadas para esta sucursal.");
            onSaved();
          })
          .catch((cause: unknown) =>
            setError(
              cause instanceof Error ? cause.message : "No se pudo guardar.",
            ),
          )
          .finally(() => {
            pending.current = false;
            setBusy(false);
          });
      }}
    >
      <h3 className="text-sm font-semibold">Reglas de esta sucursal</h3>
      {!draft && !error && (
        <p role="status" className="py-5 text-sm text-slate-500">
          Cargando reglas…
        </p>
      )}
      {draft && (
        <fieldset disabled={busy} className="mt-2 divide-y divide-slate-100">
          {toggles.map(([key, title, description]) => (
            <label
              key={key}
              className="flex items-center justify-between gap-5 py-4"
            >
              <span>
                <span className="block text-sm font-medium">{title}</span>
                <span className="mt-1 block text-xs text-slate-500">
                  {description}
                </span>
              </span>
              <span className="relative inline-flex shrink-0">
                <input
                  type="checkbox"
                  role="switch"
                  aria-label={title}
                  checked={draft[key]}
                  onChange={(event) => {
                    setDraft({ ...draft, [key]: event.target.checked });
                    setNotice("");
                  }}
                  className="peer sr-only"
                />
                <span
                  aria-hidden
                  className="h-6 w-10 rounded-full bg-slate-200 transition peer-checked:bg-teal-700 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-teal-600 peer-disabled:opacity-50"
                />
                <span
                  aria-hidden
                  className="pointer-events-none absolute left-1 top-1 h-4 w-4 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-4"
                />
              </span>
            </label>
          ))}
          <div className="flex flex-wrap items-center justify-between gap-3 py-4">
            <div>
              <p className="text-sm font-medium">Caja predeterminada</p>
              <p className="mt-1 text-xs text-slate-500">
                Se sugiere al abrir; podés elegir otra caja.
              </p>
            </div>
            <div className="w-56">
              <SearchableSaleSelect
                label="Caja predeterminada"
                value={draft.defaultRegisterId ?? ""}
                disabled={busy}
                compact
                tinted
                options={[
                  { value: "", label: "Sin preferencia" },
                  ...registers
                    .filter((register) => register.active)
                    .map((register) => ({
                      value: register.id,
                      label: register.name,
                    })),
                ]}
                onChange={(value) => {
                  setDraft({ ...draft, defaultRegisterId: value || null });
                  setNotice("");
                }}
              />
            </div>
          </div>
        </fieldset>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-rose-700">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="mt-3 text-sm text-teal-700">
          {notice}
        </p>
      )}
      <footer className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          disabled={busy || !dirty}
          onClick={() => {
            setDraft(saved);
            setError("");
          }}
          className="rounded-lg border px-3 py-2 text-sm disabled:opacity-40"
        >
          Descartar cambios
        </button>
        <button
          disabled={busy || !draft || !dirty}
          className="rounded-lg bg-teal-700 px-4 py-2 text-sm text-white disabled:opacity-40"
        >
          {busy ? "Guardando…" : "Guardar cambios"}
        </button>
      </footer>
    </form>
  );
}

export function CashClosingRules() {
  const rules = [
    [
      "Efectivo contado",
      "Ingresá el efectivo real al cerrar. Es obligatorio y puede ser $0.",
    ],
    [
      "Diferencia automática",
      "Contado menos esperado: negativo es faltante; positivo es sobrante.",
    ],
    [
      "Motivo de diferencia",
      "Si hay faltante o sobrante, explicá el motivo para poder cerrar.",
    ],
    [
      "Confirmación final",
      "Revisá los importes y confirmá antes de registrar el cierre.",
    ],
  ];
  return (
    <section
      aria-label="Cómo se cierra la caja"
      className="mt-5 overflow-hidden rounded-xl border border-slate-200 bg-white"
    >
      <header className="border-b border-slate-100 px-4 py-3 sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Cómo se cierra la caja</h3>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">
            Reglas fijas
          </span>
        </div>
        <p className="mt-1.5 text-xs text-slate-500">
          Se aplican siempre. No requieren selección ni guardado.
        </p>
      </header>
      <dl className="divide-y divide-slate-100 px-4 sm:px-5">
        {rules.map(([title, description]) => (
          <div
            key={title}
            className="grid gap-1 py-3 sm:grid-cols-[11rem_1fr] sm:gap-4"
          >
            <dt className="text-sm font-medium text-slate-700">{title}</dt>
            <dd className="text-sm text-slate-500">{description}</dd>
          </div>
        ))}
      </dl>
      <footer className="border-t border-slate-100 bg-slate-50/70 px-4 py-3 text-xs leading-relaxed text-slate-500 sm:px-5">
        <p>
          El cierre se realiza en Caja y se consulta en Historial de cierres →
          Ver cierre. Conserva fecha, responsable e importes, sin generar
          movimientos por la diferencia.
        </p>
        <details className="mt-2">
          <summary className="w-fit cursor-pointer rounded text-teal-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600">
            ¿Qué hace Eliminar en el historial?
          </summary>
          <p className="mt-2">
            Quita el cierre del listado de forma recuperable, con permiso de
            administrador y auditoría. No borra sus movimientos.
          </p>
        </details>
      </footer>
    </section>
  );
}
