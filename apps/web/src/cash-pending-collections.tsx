import { useEffect, useRef, useState } from "react";
import { Check, MoreHorizontal, Wallet } from "lucide-react";
import {
  apiBaseUrl,
  getCash,
  type CashRegister,
  type CashSession,
} from "./lib/api";
import { CashDialog } from "./cash-dialog";
import { SearchableSaleSelect } from "./searchable-sale-select";

type Collection = {
  id: string;
  sourceType: "SALE" | "RECEIPT";
  sourceId: string;
  collectedAt: string;
  cashMinor: string;
  cardMinor: string;
  transferMinor: string;
  destinationRegisterId: string | null;
};
const money = (value: string) =>
  (Number(value) / 100).toLocaleString("es-AR", {
    style: "currency",
    currency: "ARS",
  });

export function CashPendingCollections({
  token,
  organizationId,
  branchId,
  registers,
  canManage,
  active,
  onAssigned,
}: {
  token: string;
  organizationId: string;
  branchId: string;
  registers: CashRegister[];
  canManage: boolean;
  active: boolean;
  onAssigned: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Collection[]>([]);
  const [sessions, setSessions] = useState<CashSession[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [notice, setNotice] = useState("");
  const [message, setMessage] = useState("");
  const [selected, setSelected] = useState<{
    id: string;
    registerId: string;
    sessionId: string;
    destinationRegisterId: string | null;
  }>();
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const menu = useRef<HTMLDetailsElement>(null);
  const url = `${apiBaseUrl}/organizations/${organizationId}/branches/${branchId}/cash/pending-collections`;
  useEffect(() => {
    if (!active) {
      setOpen(false);
      if (menu.current) menu.current.open = false;
    }
  }, [active]);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setLoading(true);
    setMessage("");
    void Promise.all([
      fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      }).then(async (response) => {
        if (!response.ok)
          throw new Error("No se pudieron consultar los cobros pendientes.");
        return (await response.json()) as Collection[];
      }),
      getCash(token, organizationId, branchId),
    ])
      .then(([collections, cash]) => {
        if (!controller.signal.aborted) {
          setRows(collections);
          setSessions(cash.sessions.filter((session) => !session.closedAt));
          setLoaded(true);
          setSelected((current) => {
            if (!current) return current;
            const row = collections.find((item) => item.id === current.id);
            return row &&
              row.destinationRegisterId === current.destinationRegisterId
              ? current
              : undefined;
          });
        }
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted)
          setMessage(
            cause instanceof Error
              ? cause.message
              : "No se pudieron consultar los cobros.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [open, url, token, organizationId, branchId]);

  const assign = async (row: Collection) => {
    if (!selected || pending.current || loading || !canManage) return;
    const incorporation = Boolean(row.destinationRegisterId);
    if (incorporation ? !selected.sessionId : !selected.registerId) return;
    pending.current = true;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(
        `${url}/${row.id}/${incorporation ? "assign" : "destination"}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(
            incorporation
              ? { cashSessionId: selected.sessionId }
              : { cashRegisterId: selected.registerId },
          ),
        },
      );
      if (!response.ok) {
        const body = (await response.json()) as { message?: string | string[] };
        throw new Error(
          typeof body.message === "string"
            ? body.message
            : "No se pudo guardar. Actualizá y reintentá.",
        );
      }
      setRows((current) =>
        incorporation
          ? current.filter((item) => item.id !== row.id)
          : current.map((item) =>
              item.id === row.id
                ? { ...item, destinationRegisterId: selected.registerId }
                : item,
            ),
      );
      setSelected(undefined);
      setNotice(
        incorporation
          ? "Cobro incorporado a la sesión."
          : "Caja asignada. El cobro queda pendiente de incorporar a una sesión.",
      );
      onAssigned();
    } catch (cause) {
      setMessage(
        cause instanceof Error
          ? cause.message
          : "No se pudo confirmar. Podés reintentar sin duplicar la operación.",
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  const selectedRow = rows.find((row) => row.id === selected?.id);
  return (
    <div className="relative ml-auto">
      <details
        ref={menu}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget))
            event.currentTarget.open = false;
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape" && menu.current) menu.current.open = false;
        }}
      >
        <summary
          aria-label="Opciones de caja"
          className="flex h-8 w-8 cursor-pointer list-none items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 [&::-webkit-details-marker]:hidden"
        >
          <MoreHorizontal size={20} />
        </summary>
        <div className="absolute right-0 z-20 mt-2 w-64 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg">
          <button
            type="button"
            onClick={() => {
              setOpen(true);
              if (menu.current) menu.current.open = false;
            }}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm text-slate-700 hover:bg-teal-50 hover:text-teal-700"
          >
            <Wallet size={16} />
            Cobros pendientes de caja
          </button>
        </div>
      </details>
      {open && active && (
        <CashDialog
          title="Cobros pendientes de caja"
          wide
          busy={busy}
          onClose={() => setOpen(false)}
        >
          <div>
            <div>
              <p className="text-sm text-slate-500">
                Podés asignar una caja sin abrirla. El cobro conserva su fecha
                original y no modifica cierres anteriores.
              </p>
              <p className="mt-2 text-xs text-slate-500">
                Asignar el destino no ingresa efectivo a una sesión. Cuando esté
                abierta, podés incorporarlo con una segunda confirmación.
              </p>
              <p role="status" className="mt-2 min-h-4 text-xs text-teal-700">
                {loading && loaded ? "Actualizando cobros…" : notice}
              </p>
              {message && (
                <p
                  role="alert"
                  className="mt-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-700"
                >
                  {message}
                </p>
              )}
              {loading && !loaded ? (
                <p
                  role="status"
                  className="py-8 text-center text-sm text-slate-500"
                >
                  Consultando cobros…
                </p>
              ) : !rows.length ? (
                <p className="my-6 rounded-xl bg-teal-50 p-5 text-center text-sm text-teal-700">
                  No hay cobros pendientes de caja.
                </p>
              ) : (
                <div className="mt-5 max-h-[55dvh] overflow-auto rounded-xl border border-slate-200">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-xs text-slate-500">
                      <tr>
                        <th className="p-3">Fecha / origen</th>
                        <th className="p-3">Efectivo neto</th>
                        <th className="p-3">Tarjeta</th>
                        <th className="p-3">Transferencia</th>
                        <th className="p-3">Caja de destino</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => {
                        const available = sessions.filter(
                          (session) =>
                            session.cashRegisterId ===
                            row.destinationRegisterId,
                        );
                        return (
                          <tr
                            key={row.id}
                            className="border-t border-slate-100 align-top"
                          >
                            <td className="p-3">
                              <p className="whitespace-nowrap">
                                {new Date(row.collectedAt).toLocaleString(
                                  "es-AR",
                                )}
                              </p>
                              <p
                                className="mt-1 text-xs text-slate-500"
                                title={row.sourceId}
                              >
                                {row.sourceType === "SALE" ? "Venta" : "Recibo"}{" "}
                                · {row.sourceId.slice(0, 8)}
                              </p>
                            </td>
                            <td className="whitespace-nowrap p-3">
                              {money(row.cashMinor)}
                            </td>
                            <td className="whitespace-nowrap p-3">
                              {money(row.cardMinor)}
                            </td>
                            <td className="whitespace-nowrap p-3">
                              {money(row.transferMinor)}
                            </td>
                            <td className="w-44 min-w-40 p-2">
                              {row.destinationRegisterId && (
                                <p className="mb-2 text-sm font-medium text-teal-700">
                                  <span className="mb-1 flex items-center gap-1 text-[11px]">
                                    <Check size={13} aria-hidden />
                                    Caja asignada
                                  </span>
                                  {registers.find(
                                    (register) =>
                                      register.id === row.destinationRegisterId,
                                  )?.name ?? "Caja asignada"}
                                  <span className="mt-1 block text-xs font-normal text-slate-500">
                                    Pendiente de incorporar a una sesión
                                  </span>
                                </p>
                              )}
                              {canManage &&
                              (!row.destinationRegisterId ||
                                available.length > 0) ? (
                                <SearchableSaleSelect
                                  label={
                                    row.destinationRegisterId
                                      ? "Sesión de destino"
                                      : "Caja de destino"
                                  }
                                  placeholder={
                                    row.destinationRegisterId
                                      ? "Incorporar a sesión…"
                                      : "Asignar caja…"
                                  }
                                  compact
                                  tinted
                                  floatingOptions
                                  disabled={busy || (loading && !loaded)}
                                  value={
                                    selected?.id === row.id
                                      ? row.destinationRegisterId
                                        ? selected.sessionId
                                        : selected.registerId
                                      : ""
                                  }
                                  options={
                                    row.destinationRegisterId
                                      ? available.map((session) => ({
                                          value: session.id,
                                          label:
                                            registers.find(
                                              (register) =>
                                                register.id ===
                                                session.cashRegisterId,
                                            )?.name ?? "Caja asignada",
                                        }))
                                      : registers
                                          .filter((register) => register.active)
                                          .map((register) => ({
                                            value: register.id,
                                            label: register.name,
                                          }))
                                  }
                                  onChange={(value) => {
                                    setMessage("");
                                    setSelected({
                                      id: row.id,
                                      registerId: row.destinationRegisterId
                                        ? ""
                                        : value,
                                      sessionId: row.destinationRegisterId
                                        ? value
                                        : "",
                                      destinationRegisterId:
                                        row.destinationRegisterId,
                                    });
                                  }}
                                />
                              ) : !row.destinationRegisterId ? (
                                <span className="text-xs text-slate-500">
                                  Sin asignar
                                </span>
                              ) : null}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            {canManage && selected && selectedRow && (
              <footer className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-teal-100 bg-teal-50/50 px-4 py-3">
                <p className="text-xs text-slate-600">
                  {selectedRow.destinationRegisterId
                    ? "El efectivo se incorporará a la sesión elegida."
                    : "Se asignará el destino sin abrir una sesión."}
                  <span className="mt-1 block font-medium text-teal-800">
                    {
                      registers.find(
                        (register) =>
                          register.id ===
                          (selectedRow.destinationRegisterId ??
                            selected.registerId),
                      )?.name
                    }
                  </span>
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setSelected(undefined)}
                    className="h-9 rounded-lg px-3 text-xs text-slate-600 hover:bg-white"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    disabled={
                      busy ||
                      loading ||
                      !(selectedRow.destinationRegisterId
                        ? selected.sessionId
                        : selected.registerId)
                    }
                    onClick={() => void assign(selectedRow)}
                    className="inline-flex h-9 items-center gap-2 rounded-lg bg-teal-700 px-3 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
                  >
                    <Check size={14} />
                    {busy
                      ? "Guardando…"
                      : selectedRow.destinationRegisterId
                        ? "Confirmar ingreso"
                        : "Confirmar asignación"}
                  </button>
                </div>
              </footer>
            )}
          </div>
        </CashDialog>
      )}
    </div>
  );
}
