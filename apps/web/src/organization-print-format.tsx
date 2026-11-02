import { useEffect, useRef, useState } from "react";
import { FileText, Printer, Receipt } from "lucide-react";
import {
  getBranchPrintFormats,
  getDocumentTemplate,
  saveBranchPrintFormat,
  saveDocumentTemplate,
  type BranchPrintFormat,
  type PrintFormat,
} from "./lib/document-template-api";

const LABELS: Record<PrintFormat, string> = {
  TICKET: "Ticket térmico",
  A4: "Hoja A4",
};

const OPTIONS = [
  {
    value: "TICKET",
    Icon: Receipt,
    title: "Ticket térmico",
    detail: "Rollo de 80 mm, impresora térmica.",
  },
  {
    value: "A4",
    Icon: FileText,
    title: "Hoja A4",
    detail: "Impresora común o PDF, con la plantilla A4.",
  },
] as const;

// Preferencia general de la organización: se guarda al elegir, sin botón.
export function OrganizationPrintFormat({
  token,
  organizationId,
}: {
  token: string;
  organizationId: string;
}) {
  const [format, setFormat] = useState<PrintFormat>();
  const [branches, setBranches] = useState<BranchPrintFormat[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  useEffect(() => {
    let active = true;
    void Promise.all([
      getDocumentTemplate(token, organizationId),
      getBranchPrintFormats(token, organizationId),
    ])
      .then(([template, list]) => {
        if (!active) return;
        setFormat(template.defaultFormat);
        setBranches(list);
      })
      .catch((cause: unknown) => {
        if (active)
          setMessage(
            cause instanceof Error ? cause.message : "No se pudo cargar.",
          );
      });
    return () => {
      active = false;
    };
  }, [token, organizationId]);
  const choose = async (value: PrintFormat) => {
    if (pending.current || value === format) return;
    pending.current = true;
    setBusy(true);
    setMessage("");
    const previous = format;
    setFormat(value);
    try {
      const saved = await saveDocumentTemplate(token, organizationId, {
        defaultFormat: value,
      });
      setFormat(saved.defaultFormat);
      setMessage("Preferencia guardada.");
    } catch (cause) {
      setFormat(previous);
      setMessage(
        cause instanceof Error ? cause.message : "No se pudo guardar.",
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  const chooseForBranch = async (
    branchId: string,
    value: PrintFormat | null,
  ) => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setMessage("");
    const previous = branches;
    setBranches((current) =>
      current.map((branch) =>
        branch.id === branchId ? { ...branch, printFormat: value } : branch,
      ),
    );
    try {
      await saveBranchPrintFormat(token, organizationId, branchId, value);
      setMessage("Preferencia de la sucursal guardada.");
    } catch (cause) {
      setBranches(previous);
      setMessage(
        cause instanceof Error ? cause.message : "No se pudo guardar.",
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  return (
    <section className="mb-5 rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
      <header className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-teal-50 text-teal-700">
          <Printer size={21} />
        </span>
        <div>
          <h2 className="font-semibold text-slate-800">
            Formato de impresión predeterminado
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Al confirmar una venta se ofrece primero este formato; el otro sigue
            disponible. Vale para todas las sucursales, salvo las que elijan uno
            propio abajo.
          </p>
        </div>
      </header>
      <div
        role="radiogroup"
        aria-label="Formato de impresión predeterminado"
        className="mt-4 grid gap-3 sm:grid-cols-2"
      >
        {OPTIONS.map(({ value, Icon, title, detail }) => {
          const selected = format === value;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={busy || !format}
              onClick={() => void choose(value)}
              className={`flex items-start gap-3 rounded-xl border p-3 text-left transition-colors disabled:cursor-wait ${selected ? "border-teal-600 bg-teal-50 ring-1 ring-teal-600" : "border-slate-200 bg-white hover:border-teal-200"}`}
            >
              <span
                className={`grid size-9 shrink-0 place-items-center rounded-lg ${selected ? "bg-teal-100 text-teal-700" : "bg-slate-100 text-slate-500"}`}
              >
                <Icon size={18} />
              </span>
              <span>
                <span className="block text-sm font-semibold text-slate-800">
                  {title}
                </span>
                <span className="block text-xs text-slate-500">{detail}</span>
              </span>
            </button>
          );
        })}
      </div>
      {branches.length > 0 && (
        <div className="mt-5 border-t border-slate-100 pt-4">
          <h3 className="text-xs font-semibold tracking-wide text-teal-800">
            Por sucursal
          </h3>
          <p className="mt-1 text-xs text-slate-500">
            Cada sucursal puede usar el formato de la organización o uno propio,
            según la impresora que tenga.
          </p>
          <ul className="mt-3 divide-y divide-slate-100 rounded-xl border border-slate-200">
            {branches.map((branch) => (
              <li
                key={branch.id}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5"
              >
                <span className="min-w-0 text-sm font-medium text-slate-700">
                  {branch.name}
                  {!branch.active && (
                    <span className="ml-2 text-xs font-normal text-slate-400">
                      Inactiva
                    </span>
                  )}
                </span>
                <select
                  aria-label={`Formato de impresión de ${branch.name}`}
                  disabled={busy || !format}
                  value={branch.printFormat ?? ""}
                  onChange={(event) =>
                    void chooseForBranch(
                      branch.id,
                      (event.target.value || null) as PrintFormat | null,
                    )
                  }
                  className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700"
                >
                  <option value="">
                    Igual que la organización
                    {format ? ` (${LABELS[format]})` : ""}
                  </option>
                  <option value="TICKET">{LABELS.TICKET}</option>
                  <option value="A4">{LABELS.A4}</option>
                </select>
              </li>
            ))}
          </ul>
        </div>
      )}
      {message && (
        <p role="status" className="mt-3 text-sm text-teal-800">
          {message}
        </p>
      )}
    </section>
  );
}
