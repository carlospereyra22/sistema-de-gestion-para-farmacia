import { useState } from "react";
import { Pencil } from "lucide-react";
import { ProductFilterSelect } from "./product-filter-select";
import { updateSupplierTerms, type Party } from "./lib/api";
import {
  PayableDialog,
  field,
  primary,
  secondary,
} from "./supplier-payables/dialog";

export type SupplierTerms = {
  accountEnabled: boolean;
  accountTermDays: number | null;
};
export function SupplierTermsFields({
  value,
  onChange,
}: {
  value: SupplierTerms;
  onChange: (value: SupplierTerms) => void;
}) {
  return (
    <section
      aria-label="Condiciones de pago"
      className="mt-5 border-t border-slate-100 pt-4"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="text-xs text-slate-500">
          <p className="mb-1">Condición de pago</p>
          <ProductFilterSelect
            compact
            label="Condición de pago"
            icon={null}
            options={[
              { value: "cash", label: "Sin cuenta corriente" },
              { value: "account", label: "Cuenta corriente" },
            ]}
            value={value.accountEnabled ? "account" : "cash"}
            onChange={(selected) => {
              const accountEnabled = selected === "account";
              onChange({
                accountEnabled,
                accountTermDays: accountEnabled ? value.accountTermDays : null,
              });
            }}
          />
        </div>
        {value.accountEnabled && (
          <label className="block text-xs text-slate-500">
            Plazo de pago
            <span className="relative mt-1 block max-w-48">
              <input
                type="number"
                inputMode="numeric"
                min={0}
                max={3650}
                step={1}
                className={`${field} pr-14 tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none`}
                placeholder="Sin plazo"
                value={value.accountTermDays ?? ""}
                onChange={(e) =>
                  onChange({
                    ...value,
                    accountTermDays:
                      e.target.value === "" ? null : Number(e.target.value),
                  })
                }
              />
              <span className="pointer-events-none absolute right-3 top-3 text-xs text-slate-400">
                días
              </span>
            </span>
            <span className="mt-1.5 block text-[11px] text-slate-400">
              Días corridos. Vacío: sin vencimiento · 0: mismo día.
            </span>
          </label>
        )}
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-slate-400">
        {value.accountEnabled
          ? "Se usará al proponer la deuda de cada recepción."
          : "No se propondrá una deuda al recibir mercadería."}
      </p>
    </section>
  );
}
export function SupplierTermsButton({
  supplier,
  token,
  organizationId,
  onSaved,
}: {
  supplier: Party;
  token: string;
  organizationId: string;
  onSaved: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [value, setValue] = useState<SupplierTerms>({
    accountEnabled: supplier.accountEnabled ?? false,
    accountTermDays: supplier.accountTermDays ?? null,
  });
  return (
    <>
      <button
        type="button"
        className="flex items-center gap-2 rounded-lg border border-teal-100 px-3 py-2 text-xs text-teal-700 hover:bg-teal-50"
        onClick={() => {
          setValue({
            accountEnabled: supplier.accountEnabled ?? false,
            accountTermDays: supplier.accountTermDays ?? null,
          });
          setError("");
          setOpen(true);
        }}
      >
        <Pencil size={14} />
        {supplier.accountEnabled
          ? `Cuenta corriente · ${supplier.accountTermDays == null ? "sin plazo" : `${supplier.accountTermDays} días`}`
          : "Contado"}
      </button>
      {open && (
        <PayableDialog
          title={`Condición de pago · ${supplier.name}`}
          onClose={() => {
            if (!busy) setOpen(false);
          }}
        >
          <fieldset disabled={busy}>
            <SupplierTermsFields value={value} onChange={setValue} />
          </fieldset>
          <p className="mt-3 text-xs text-slate-500">
            Se aplica a futuras recepciones. No modifica deudas ni entregas
            anteriores.
          </p>
          {error && (
            <p role="alert" className="mt-3 text-sm text-rose-700">
              {error}
            </p>
          )}
          <footer className="mt-5 flex justify-end gap-2">
            <button
              className={secondary}
              disabled={busy}
              onClick={() => setOpen(false)}
            >
              Cancelar
            </button>
            <button
              className={primary}
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await updateSupplierTerms(
                    token,
                    organizationId,
                    supplier,
                    value,
                  );
                  await onSaved();
                  setOpen(false);
                } catch (e) {
                  setError(
                    e instanceof Error ? e.message : "No se pudo guardar.",
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "Guardando…" : "Guardar condición"}
            </button>
          </footer>
        </PayableDialog>
      )}
    </>
  );
}
