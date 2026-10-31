import { useEffect, useRef, useState } from "react";
import { Ellipsis, FileMinus2, History, X } from "lucide-react";
import { saleInvoice, type FiscalTrial } from "./lib/api";
import { SaleCreditNotes } from "./sale-credit-notes";

export function SaleCreditMenu({
  eligible,
  onSelect,
}: {
  eligible: boolean;
  onSelect: (mode: "create" | "list") => void;
}) {
  const menu = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const dismiss = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        menu.current &&
        !menu.current.contains(event.target)
      )
        menu.current.open = false;
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, []);
  if (!eligible) return null;
  function select(mode: "create" | "list") {
    if (menu.current) menu.current.open = false;
    onSelect(mode);
  }
  return (
    <details
      ref={menu}
      className="relative shrink-0"
      onKeyDown={(event) => {
        if (event.key === "Escape" && menu.current?.open) {
          event.preventDefault();
          event.stopPropagation();
          menu.current.open = false;
          menu.current.querySelector("summary")?.focus();
        }
      }}
    >
      <summary
        aria-label="Más acciones de la factura"
        title="Más acciones de la factura"
        className="flex size-10 cursor-pointer list-none items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-teal-700 [&::-webkit-details-marker]:hidden"
      >
        <Ellipsis size={20} aria-hidden="true" />
      </summary>
      <div className="absolute right-0 top-full z-10 mt-2 w-60 max-w-[calc(100vw-4rem)] rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg">
        <button
          type="button"
          onClick={() => select("create")}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm text-slate-700 hover:bg-teal-50 focus-visible:outline-2 focus-visible:outline-teal-700"
        >
          <FileMinus2 size={17} aria-hidden="true" />
          Emitir nota de crédito
        </button>
        <button
          type="button"
          onClick={() => select("list")}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm text-slate-700 hover:bg-teal-50 focus-visible:outline-2 focus-visible:outline-teal-700"
        >
          <History size={17} aria-hidden="true" />
          Ver notas de crédito
        </button>
      </div>
    </details>
  );
}

export function SaleCreditActions({
  token,
  organizationId,
  branchId,
  saleId,
}: {
  token: string;
  organizationId: string;
  branchId: string;
  saleId: string;
}) {
  const [invoice, setInvoice] = useState<FiscalTrial>();
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [mode, setMode] = useState<"create" | "list">();
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    let active = true;
    void saleInvoice(token, organizationId, branchId, saleId)
      .then((result) => {
        if (active) {
          setInvoice(result);
          setError(false);
        }
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, [token, organizationId, branchId, saleId, attempt]);
  useEffect(() => {
    const element = dialog.current;
    if (mode) element?.showModal();
    return () => element?.close();
  }, [mode]);
  const eligible =
    invoice?.environment === "PRODUCTION" && invoice.status === "AUTHORIZED";
  return (
    <>
      {error ? (
        <button
          type="button"
          onClick={() => {
            setError(false);
            setAttempt(attempt + 1);
          }}
          className="text-xs text-slate-500 underline"
        >
          Reintentar consulta de notas
        </button>
      ) : (
        <SaleCreditMenu eligible={eligible} onSelect={setMode} />
      )}
      <dialog
        ref={dialog}
        onCancel={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setMode(undefined);
        }}
        aria-labelledby="credit-actions-title"
        className="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-xl backdrop:bg-slate-950/40"
      >
        <header className="flex items-center justify-between gap-3">
          <h2 id="credit-actions-title" className="text-lg font-semibold">
            {mode === "create" ? "Emitir nota de crédito" : "Notas de crédito"}
          </h2>
          <button
            type="button"
            autoFocus
            aria-label="Cerrar notas de crédito"
            onClick={() => setMode(undefined)}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </header>
        <p className="mt-1 text-xs text-slate-500">
          Venta · {saleId.slice(0, 8).toUpperCase()}
        </p>
        {mode && eligible && (
          <SaleCreditNotes
            key={mode}
            token={token}
            organizationId={organizationId}
            branchId={branchId}
            saleId={saleId}
            initialMode={mode}
          />
        )}
      </dialog>
    </>
  );
}
