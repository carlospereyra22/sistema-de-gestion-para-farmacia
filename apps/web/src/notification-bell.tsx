import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  Bell,
  CheckCheck,
  Package,
  CalendarClock,
  RefreshCw,
  X,
} from "lucide-react";
import {
  getCatalogProducts,
  getStock,
  type CatalogProduct,
  type StockLot,
} from "./lib/api";
import {
  getAccountDueDates,
  type AccountDueRow,
} from "./lib/account-due-dates";
import { accountAlerts, stockAlerts } from "./lib/workspace-alerts";
import type { WorkspaceView } from "./lib/workspace-location";
import { alertVersion, readSeenAlerts } from "./lib/seen-alerts";
import { LOW_STOCK_UNITS } from "./lib/stock-level";
import {
  addAlertHistory,
  readAlertHistory,
  recentAlertHistory,
} from "./lib/alert-history";
import type { WorkspaceAlert } from "./lib/workspace-alerts";

export function NotificationBell({
  token,
  organizationId,
  branchId,
  branchName,
  userKey,
  onNavigate,
}: {
  token: string;
  organizationId: string;
  branchId: string;
  branchName: string;
  userKey: string;
  onNavigate: (view: WorkspaceView) => void;
}) {
  const [open, setOpen] = useState(false);
  const storageKey = `seen-alerts:${encodeURIComponent(userKey)}:${organizationId}:${branchId}`;
  const [seen, setSeen] = useState<string[]>(() => readSeenAlerts(storageKey));
  const historyKey = `${storageKey}:history`;
  const [history, setHistory] = useState(() => readAlertHistory(historyKey));
  const [view, setView] = useState<"new" | "history">("new");
  useEffect(() => {
    const timer = window.setInterval(
      () => setHistory((current) => recentAlertHistory(current)),
      60000,
    );
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(historyKey, JSON.stringify(history));
    } catch {
      /* History remains available in memory if storage is unavailable. */
    }
  }, [historyKey, history]);
  const [openedVersions, setOpenedVersions] = useState<string[]>([]);
  const [minimum, setMinimum] = useState(LOW_STOCK_UNITS);
  const [rows, setRows] = useState<AccountDueRow[]>([]);
  const [stock, setStock] = useState<{
    products: CatalogProduct[];
    lots: StockLot[];
  }>();
  const [errors, setErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [updated, setUpdated] = useState<Date>();
  const [filter, setFilter] = useState<"all" | "accounts" | "stock">("all");
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const mounted = useRef(false);
  const pending = useRef(false);
  const panelId = useId();
  const refresh = useCallback(async () => {
    if (pending.current) return;
    pending.current = true;
    setLoading(true);
    try {
      const [due, inventory] = await Promise.allSettled([
        getAccountDueDates(token, organizationId, branchId),
        Promise.all([
          getCatalogProducts(token, organizationId, branchId),
          getStock(token, organizationId, branchId),
        ]),
      ]);
      if (!mounted.current) return;
      const failed: string[] = [];
      if (due.status === "fulfilled") setRows(due.value.rows);
      else {
        setRows([]);
        failed.push(
          "No se pudieron consultar las cuentas corrientes. Revisá la conexión y tus permisos.",
        );
      }
      if (inventory.status === "fulfilled")
        setStock({ products: inventory.value[0], lots: inventory.value[1] });
      else {
        setStock(undefined);
        failed.push(
          "No se pudo consultar el inventario. Revisá la conexión y tus permisos.",
        );
      }
      setErrors(failed);
      setUpdated(new Date());
    } finally {
      pending.current = false;
      if (mounted.current) setLoading(false);
    }
  }, [token, organizationId, branchId]);
  useEffect(() => {
    mounted.current = true;
    void refresh();
    const update = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const timer = window.setInterval(update, 60000);
    window.addEventListener("focus", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      mounted.current = false;
      clearInterval(timer);
      window.removeEventListener("focus", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, [refresh]);
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !container.current?.contains(event.target)
      )
        setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);
  const alerts = [
    ...accountAlerts(rows),
    ...(stock ? stockAlerts(stock.products, stock.lots, minimum) : []),
  ];
  const unread = alerts.filter((alert) => !seen.includes(alertVersion(alert)));
  const unreadSnapshot = JSON.stringify(unread);
  useEffect(() => {
    if (!open || view !== "new") return;
    const entries = JSON.parse(unreadSnapshot) as WorkspaceAlert[];
    const versions = entries.map(alertVersion);
    if (!versions.length) return;
    setHistory((current) => addAlertHistory(current, entries));
    setOpenedVersions((current) => [...new Set([...current, ...versions])]);
    setSeen((current) => [...new Set([...current, ...versions])]);
  }, [open, view, unreadSnapshot]);
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(seen));
    } catch {
      /* Keep read state in memory when browser storage is unavailable. */
    }
  }, [seen, storageKey]);
  const visible = alerts.filter(
    (alert) =>
      (openedVersions.includes(alertVersion(alert)) ||
        !seen.includes(alertVersion(alert))) &&
      (filter === "all" || alert.category === filter),
  );
  const historyVisible = recentAlertHistory(history).filter(
    (alert) => filter === "all" || alert.category === filter,
  );
  const displayed = view === "history" ? historyVisible : visible;
  return (
    <div
      ref={container}
      className="relative shrink-0"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          setOpen(false);
          trigger.current?.focus();
        }
      }}
    >
      <button
        ref={trigger}
        type="button"
        aria-label={`Notificaciones: ${unread.length} sin leer${errors.length ? ", consulta incompleta" : ""}`}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => {
          if (!open) {
            setOpenedVersions([]);
            setFilter("all");
            setView("new");
            setHistory((current) => recentAlertHistory(current));
          }
          setOpen(!open);
          if (!open) void refresh();
        }}
        className="relative flex size-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition-colors hover:border-teal-300 hover:bg-teal-50 hover:text-teal-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
      >
        <Bell size={20} />
        {unread.length > 0 && (
          <span className="absolute -right-1 -top-1 flex min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-semibold leading-4 text-white">
            {unread.length > 99 ? "99+" : unread.length}
          </span>
        )}
      </button>
      {open && (
        <section
          id={panelId}
          aria-label="Notificaciones de la sucursal"
          className="fixed left-3 right-3 top-[78px] z-[70] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-3 sm:w-[380px]"
        >
          <header className="flex items-center justify-between gap-2 border-b border-slate-100 p-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-800">
                Notificaciones
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                {branchName} ·{" "}
                {view === "history" ? "últimos 7 días" : "avisos nuevos"}
              </p>
            </div>
            <div className="flex gap-1">
              <button
                type="button"
                aria-label="Actualizar notificaciones"
                disabled={loading}
                onClick={() => void refresh()}
                className="rounded-lg p-2 text-teal-700 hover:bg-teal-50 disabled:opacity-40"
              >
                <RefreshCw
                  size={16}
                  className={loading ? "animate-spin" : ""}
                />
              </button>
              <button
                type="button"
                aria-label="Cerrar notificaciones"
                onClick={() => {
                  setOpen(false);
                  trigger.current?.focus();
                }}
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-50"
              >
                <X size={16} />
              </button>
            </div>
          </header>
          <div
            role="group"
            aria-label="Vista de notificaciones"
            className="mx-4 mt-3 grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1 text-xs"
          >
            {(
              [
                { id: "new", label: "Nuevas" },
                { id: "history", label: "Historial" },
              ] as const
            ).map((item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={view === item.id}
                onClick={() => setView(item.id)}
                className={`rounded-md px-3 py-2 font-medium ${view === item.id ? "bg-white text-teal-800 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="flex gap-1.5 px-4 py-3 text-xs">
            {(
              [
                { id: "all", label: "Todas" },
                { id: "accounts", label: "Cuentas" },
                { id: "stock", label: "Inventario" },
              ] as const
            ).map((item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={filter === item.id}
                onClick={() => setFilter(item.id)}
                className={`rounded-lg px-3 py-1.5 ${filter === item.id ? "bg-teal-50 font-medium text-teal-700" : "text-slate-500 hover:bg-slate-50"}`}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div
            className="max-h-[min(55dvh,420px)] overflow-y-auto px-2 pb-2"
            aria-busy={loading}
          >
            {errors.map((error) => (
              <p
                key={error}
                role="status"
                className="mx-2 mb-2 rounded-lg bg-amber-50 p-3 text-xs leading-5 text-amber-800"
              >
                {error}
              </p>
            ))}
            {!displayed.length && (
              <div className="px-4 py-7 text-center text-xs text-slate-500">
                <CheckCheck size={25} className="mx-auto mb-2 text-teal-600" />
                {view === "history"
                  ? "No hay notificaciones vistas en los últimos 7 días para este filtro."
                  : loading
                    ? "Consultando alertas…"
                    : errors.length
                      ? "No hay avisos en los datos disponibles."
                      : "Estás al día. No hay notificaciones nuevas."}
              </div>
            )}
            {displayed.map((alert) => {
              const Icon =
                alert.category === "accounts" ? CalendarClock : Package;
              return (
                <button
                  key={alertVersion(alert)}
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    onNavigate(
                      alert.category === "accounts"
                        ? "Cuentas corrientes"
                        : "Inventario",
                    );
                  }}
                  className="flex w-full items-start gap-3 rounded-xl p-3 text-left hover:bg-slate-50"
                >
                  <span
                    className={`mt-0.5 rounded-lg p-2 ${alert.urgent ? "bg-rose-50 text-rose-600" : "bg-amber-50 text-amber-600"}`}
                  >
                    <Icon size={17} />
                  </span>
                  <span className="min-w-0">
                    <strong className="block text-xs font-semibold text-slate-700">
                      {alert.title}
                    </strong>
                    <span className="mt-1 block text-[11px] leading-5 text-slate-500">
                      {alert.detail}
                    </span>
                    {"seenAt" in alert && typeof alert.seenAt === "number" && (
                      <span className="mt-1 block text-[10px] text-slate-400">
                        Vista el{" "}
                        {new Date(alert.seenAt).toLocaleString("es-AR", {
                          day: "2-digit",
                          month: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}{" "}
                        · Puede haber cambiado
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
          <footer className="space-y-2 border-t border-slate-100 bg-slate-50/60 px-4 py-3">
            {view === "history" && (
              <p className="text-[11px] text-slate-500">
                Últimas 6 notificaciones vistas. Se eliminan del historial a los
                7 días. Guardadas en este navegador.
              </p>
            )}
            <label className="flex items-center justify-between gap-2 text-[11px] text-slate-500">
              Avisar stock con hasta
              <input
                aria-label="Mínimo de aviso de stock"
                type="number"
                min="0"
                max="100000"
                step="1"
                value={minimum}
                onChange={(event) => {
                  const value = Number(event.target.value);
                  if (Number.isInteger(value) && value >= 0 && value <= 100000)
                    setMinimum(value);
                }}
                className="h-7 w-16 rounded-md border border-slate-200 bg-white px-2 text-right"
              />
              unidades
            </label>
            <p className="text-[10px] text-slate-400">
              {updated
                ? `Consultado ${updated.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })} · `
                : ""}
              Actualización cada minuto. Mínimo para esta sesión.
            </p>
          </footer>
        </section>
      )}
    </div>
  );
}
