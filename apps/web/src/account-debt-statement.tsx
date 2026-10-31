import { useEffect, useMemo, useRef, useState } from "react";
import { Printer, RefreshCw, X } from "lucide-react";
import {
  getAccountDueDates,
  type AccountDueDates,
} from "./lib/account-due-dates";
import { debtStatementHtml, statementRows } from "./lib/account-debt-statement";
import { customerIdentityDetail } from "./lib/customer-identity";
import type { CustomerAccount } from "./lib/api";
import { statementPeriod } from "./lib/statement-period";
import {
  accountStatementHtml,
  getAccountStatement,
  type AccountStatementCustomer,
} from "./lib/account-statement";

export function AccountDebtStatement({
  token,
  organizationId,
  branchId,
  organizationName,
  branchName,
  accounts,
  selectedId,
  onClose,
}: {
  token: string;
  organizationId: string;
  branchId: string;
  organizationName: string;
  branchName: string;
  accounts: CustomerAccount[];
  selectedId: string;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const requestToken = useRef(token);
  // Renewed credentials apply to the next request, not to the report snapshot.
  useEffect(() => {
    requestToken.current = token;
  }, [token]);
  const [customerId, setCustomerId] = useState(selectedId);
  const [mode, setMode] = useState("all");
  const [statement, setStatement] = useState<AccountStatementCustomer[]>();
  const [range, setRange] = useState(false);
  const [preset, setPreset] = useState("all");
  const [loadedMode, setLoadedMode] = useState("");
  const cache = useRef(
    new Map<
      string,
      {
        value: AccountDueDates | AccountStatementCustomer[];
        generatedAt: string;
      }
    >(),
  );
  const [frameLoaded, setFrameLoaded] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [data, setData] = useState<{
    value: AccountDueDates;
    generatedAt: string;
  }>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const [readyHtml, setReadyHtml] = useState("");
  const [printing, setPrinting] = useState(false);
  useEffect(() => {
    const node = dialog.current;
    node?.showModal();
    return () => node?.close();
  }, []);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    const key = `${organizationId}:${branchId}:${revision}:${mode}`;
    const apply = (
      value: AccountDueDates | AccountStatementCustomer[],
      generatedAt: string,
    ) => {
      if (Array.isArray(value)) {
        setStatement(value);
        setData({ value: { today: "", rows: [] }, generatedAt });
      } else setData({ value, generatedAt });
      setLoadedMode(mode);
    };
    const cached = cache.current.get(key);
    if (cached) {
      apply(cached.value, cached.generatedAt);
      setLoading(false);
      return;
    }
    const request =
      mode === "debt"
        ? getAccountDueDates(requestToken.current, organizationId, branchId)
        : getAccountStatement(requestToken.current, organizationId, branchId);
    void request
      .then((value) => {
        if (active) {
          const generatedAt = new Date().toISOString();
          cache.current.set(key, { value, generatedAt });
          apply(value, generatedAt);
        }
      })
      .catch((cause: unknown) => {
        if (active)
          setError(
            cause instanceof Error
              ? cause.message
              : "No se pudo preparar el resumen.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [organizationId, branchId, revision, mode]);
  const invalidRange =
    range && ((!from && !to) || (Boolean(from && to) && from > to));
  const html = useMemo(() => {
    if (!data || invalidRange || loadedMode !== mode) return "";
    const filter = { customerId, from: range ? from : "", to: range ? to : "" };
    if (mode === "all")
      return statement
        ? accountStatementHtml({
            customers: statement,
            filter,
            organization: organizationName,
            branch: branchName,
            generatedAt: data.generatedAt,
          })
        : "";
    const selected = statementRows(data.value.rows, filter);
    const customer = accounts.find((account) => account.id === customerId);
    return debtStatementHtml({
      ...selected,
      filter,
      organization: organizationName,
      branch: branchName,
      customerLabel: customerId
        ? (customer?.name ?? "Cliente seleccionado")
        : "Todos los clientes con ventas pendientes",
      generatedAt: data.generatedAt,
      identities: Object.fromEntries(
        accounts.map((account) => [
          account.id,
          customerIdentityDetail(account),
        ]),
      ),
    });
  }, [
    data,
    loadedMode,
    mode,
    statement,
    invalidRange,
    customerId,
    range,
    from,
    to,
    accounts,
    organizationName,
    branchName,
  ]);
  useEffect(() => {
    const document = frame.current?.contentDocument;
    if (!frameLoaded || !document || !html) return;
    const parsed = new DOMParser().parseFromString(html, "text/html");
    const scroll = document.documentElement.scrollTop;
    document.head.replaceChildren(
      ...Array.from(parsed.head.childNodes).map((node) =>
        document.importNode(node, true),
      ),
    );
    document.body.replaceChildren(
      ...Array.from(parsed.body.childNodes).map((node) =>
        document.importNode(node, true),
      ),
    );
    document.documentElement.scrollTop = scroll;
    setReadyHtml(html);
  }, [html, frameLoaded]);
  const print = async () => {
    const document = frame.current?.contentDocument;
    const target = frame.current?.contentWindow;
    if (
      !document ||
      !target ||
      !html ||
      readyHtml !== html ||
      printing ||
      loading ||
      error
    )
      return;
    setPrinting(true);
    setError("");
    try {
      if (document.fonts) await document.fonts.ready;
      target.focus();
      target.print();
    } catch {
      setError("No se pudo abrir la impresión. Volvé a intentar.");
    } finally {
      setPrinting(false);
    }
  };
  const field =
    "mt-1 h-10 w-full min-w-0 rounded-lg border border-slate-200 bg-white px-3 text-sm";
  return (
    <dialog
      ref={dialog}
      aria-labelledby="debt-statement-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!printing) onClose();
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-5xl rounded-2xl border border-slate-200 bg-white p-0 shadow-xl backdrop:bg-slate-950/35"
    >
      <div className="flex h-[88dvh] max-h-[92dvh] flex-col">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-100 p-5">
          <div>
            <h2
              id="debt-statement-title"
              className="flex items-center gap-2 text-base font-semibold"
            >
              <Printer size={19} className="text-teal-700" />
              Resumen de cuenta
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              {branchName} · Hoja A4 / PDF
            </p>
          </div>
          <button
            type="button"
            aria-label="Cerrar resumen de cuenta"
            onClick={onClose}
            disabled={printing}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-50"
          >
            <X size={20} />
          </button>
        </header>
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          <div className="space-y-3 border-b border-slate-100 p-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="text-xs font-medium text-slate-600">
                Contenido
                <select
                  value={mode}
                  onChange={(event) => setMode(event.target.value)}
                  className={field}
                >
                  <option value="all">Ventas y cobros</option>
                  <option value="debt">Solo deuda pendiente</option>
                </select>
              </label>
              <label className="text-xs font-medium text-slate-600">
                Cliente
                <select
                  value={customerId}
                  onChange={(event) => setCustomerId(event.target.value)}
                  className={field}
                >
                  <option value="">Todos los clientes</option>
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name} ·{" "}
                      {customerIdentityDetail(account) ||
                        `Ficha ${account.id.slice(0, 8)}`}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-medium text-slate-600">
                {mode === "debt" ? "Fechas de venta" : "Fechas de movimientos"}
                <select
                  value={preset}
                  onChange={(event) => {
                    const value = event.target.value;
                    setPreset(value);
                    setRange(value !== "all");
                    if (value !== "range") {
                      const period = statementPeriod(value);
                      setFrom(period.from);
                      setTo(period.to);
                    }
                  }}
                  className={field}
                >
                  <option value="all">Todas las fechas</option>
                  <option value="month">Este mes</option>
                  <option value="previous">Mes anterior</option>
                  <option value="30">Últimos 30 días</option>
                  <option value="range">Personalizar período…</option>
                </select>
              </label>
            </div>
            {preset === "range" && (
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-xs text-slate-600">
                  Desde
                  <input
                    type="date"
                    value={from}
                    max={to || "9999-12-31"}
                    onChange={(event) => setFrom(event.target.value)}
                    className={field}
                  />
                </label>
                <label className="text-xs text-slate-600">
                  Hasta
                  <input
                    type="date"
                    value={to}
                    min={from || undefined}
                    max="9999-12-31"
                    onChange={(event) => setTo(event.target.value)}
                    className={field}
                  />
                </label>
              </div>
            )}
            <p className="text-[11px] leading-5 text-slate-500">
              {mode === "debt"
                ? "Incluye lo pendiente hoy de las ventas de esta sucursal. El período filtra la fecha de venta, no reconstruye saldos históricos."
                : "Detalle de ventas y cobros de esta sucursal. Los saldos conservan todas las actualizaciones de la cuenta. Fechas en horario de Argentina."}
            </p>
            {invalidRange && (
              <p role="alert" className="text-xs text-amber-700">
                Elegí al menos una fecha y verificá que Desde no sea posterior a
                Hasta.
              </p>
            )}
            {error && (
              <p role="alert" className="text-xs text-rose-700">
                {error}
              </p>
            )}
          </div>
          <div className="relative min-h-64 flex-1 bg-slate-50">
            {(loading || !html) && (
              <div
                role="status"
                className="absolute inset-x-0 top-0 z-10 bg-slate-100/95 px-4 py-2 text-center text-xs text-slate-600"
              >
                {invalidRange
                  ? "Elegí el período para actualizar la vista previa."
                  : error
                    ? "No se pudo actualizar la vista previa."
                    : "Preparando resumen…"}
              </div>
            )}
            <iframe
              ref={frame}
              title="Vista previa del resumen de cuenta A4"
              sandbox="allow-same-origin allow-modals"
              srcDoc={
                '<!doctype html><html lang="es"><head><meta charset="utf-8"></head><body></body></html>'
              }
              onLoad={() => setFrameLoaded(true)}
              className="absolute inset-0 h-full w-full border-0 bg-white"
            />
          </div>
        </div>
        <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-slate-100 p-4">
          <p className="max-w-sm text-[11px] text-slate-500">
            Para descargarlo, elegí «Guardar como PDF» en la ventana de
            impresión. En «Más ajustes», desactivá «Encabezados y pies de
            página» para quitar la dirección web.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={loading || printing}
              onClick={() => setRevision((value) => value + 1)}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs text-teal-700 disabled:opacity-40"
            >
              <RefreshCw size={15} />
              Actualizar
            </button>
            <button
              type="button"
              disabled={
                loading ||
                printing ||
                Boolean(error) ||
                !html ||
                readyHtml !== html
              }
              onClick={() => void print()}
              className="inline-flex items-center gap-2 rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
            >
              <Printer size={16} />
              Imprimir / PDF
            </button>
          </div>
        </footer>
      </div>
    </dialog>
  );
}
