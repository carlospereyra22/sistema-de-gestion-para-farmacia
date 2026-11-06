import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactElement,
} from "react";
import { createPortal } from "react-dom";
import { ArrowLeftRight } from "lucide-react";
import { CashCloseForm } from "./cash-close-form";
import { CashClosureDetail } from "./cash-closure-detail";
import { CashHistory } from "./cash-history";
import { CashLatestClosure } from "./cash-latest-closure";
import { CashMetrics, CashStatusBar, CashTimeline } from "./cash-overview";
import { CashPendingCollections } from "./cash-pending-collections";
import { CashRegisterIcon } from "./cash-register-icon";
import { CashRegisterPicker } from "./cash-register-picker";
import { formatAmountTyping } from "./lib/amount-typing";
import {
  cashSettingsRequest,
  createCashMovement,
  getCashClosures,
  getCashManagement,
  getCashPendingCollections,
  getCashRecentActivity,
  openCashSession,
  type CashClosure,
  type CashManagement,
  type CashPendingCollection,
  type CashRecentActivity,
  type CashRegister,
  type CashSession,
  type CashSettings,
} from "./lib/api";
import { typedCashMinor } from "./lib/cash-count";
import {
  cashMoney,
  defaultClosureRange,
  hasAssignedCollections,
  pendingCollectionsSummary,
} from "./lib/cash-session-view";
import { lotCostInput } from "./lib/lot-cost";
import { MoneyInput } from "./money-input";
import { ClosureVisibility, RegisterManager } from "./record-maintenance";

const fallback = (cause: unknown, message: string) =>
  cause instanceof Error ? cause.message : message;

export function CashWorkspace({
  active,
  branchName,
  toolbarTarget,
  token,
  organizationId,
  branchId,
  registers,
  openSessions,
  registerId,
  onRegisterChange,
  session,
  done,
  error,
}: {
  active: boolean;
  branchName?: string;
  toolbarTarget: HTMLDivElement | null;
  token: string;
  organizationId: string;
  branchId: string;
  registers: CashRegister[];
  openSessions: CashSession[];
  registerId: string;
  onRegisterChange: (registerId: string) => void;
  session?: CashSession;
  done: () => void;
  error: (value: string) => void;
}): ReactElement {
  const [tab, setTab] = useState<"session" | "history">("session");
  const [opening, setOpening] = useState("");
  const [cashBusy, setCashBusy] = useState(false);
  const cashPending = useRef(false);
  const movementRequest = useRef<{ signature: string; id: string } | null>(
    null,
  );
  const [movementType, setMovementType] = useState<"IN" | "OUT">("IN");
  const [movementAmount, setMovementAmount] = useState("");
  const [movementReason, setMovementReason] = useState("");
  const [closures, setClosures] = useState<CashClosure[]>([]);
  const [lastClosure, setLastClosure] = useState<CashClosure | null>(null);
  const [closureDetailId, setClosureDetailId] = useState<string>();
  const [management, setManagement] = useState<CashManagement>();
  const [rules, setRules] = useState<CashSettings>();
  const [archived, setArchived] = useState(false);
  const [range, setRange] = useState(() => defaultClosureRange(new Date()));
  const [historyRegisterId, setHistoryRegisterId] = useState("");
  const [pendingRows, setPendingRows] = useState<CashPendingCollection[]>();
  const [pendingOpen, setPendingOpen] = useState(false);
  const [recent, setRecent] = useState<{
    registerId: string;
    activity?: CashRecentActivity;
    failed?: boolean;
  }>();
  const closureRequest = useRef(0);
  const rangeInvalid = Boolean(range.from && range.to && range.from > range.to);
  useEffect(() => {
    if (active) done();
    else setPendingOpen(false);
  }, [active]); // eslint-disable-line react-hooks/exhaustive-deps
  const loadClosures = async () => {
    if (rangeInvalid) return;
    const request = ++closureRequest.current;
    const rows = await getCashClosures(
      token,
      organizationId,
      branchId,
      range.from || undefined,
      range.to || undefined,
      archived,
    );
    if (request === closureRequest.current) setClosures(rows);
  };
  const loadPending = useCallback(() => {
    void getCashPendingCollections(token, organizationId, branchId)
      .then(setPendingRows)
      .catch(() => setPendingRows(undefined));
  }, [token, organizationId, branchId]);
  useEffect(() => {
    if (active) loadPending();
  }, [active, loadPending, openSessions]);
  const sessionId = session?.id;
  useEffect(() => {
    if (!active || sessionId || !registerId) return;
    let cancelled = false;
    setRecent((current) =>
      current?.registerId === registerId ? current : { registerId },
    );
    void getCashRecentActivity(token, organizationId, branchId, registerId)
      .then((activity) => {
        if (!cancelled) setRecent({ registerId, activity });
      })
      .catch(() => {
        if (!cancelled) setRecent({ registerId, failed: true });
      });
    return () => {
      cancelled = true;
    };
  }, [
    active,
    sessionId,
    registerId,
    token,
    organizationId,
    branchId,
    closures,
  ]);
  useEffect(() => {
    let cancelled = false;
    if (!active) return;
    void Promise.all([
      getCashManagement(token, organizationId, branchId),
      cashSettingsRequest(token, organizationId, branchId),
    ])
      .then(([value, settings]) => {
        if (!cancelled) {
          setManagement(value);
          setRules(settings);
        }
      })
      .catch((cause: unknown) => {
        if (!cancelled)
          error(fallback(cause, "No se pudo cargar la gestión de cajas."));
      });
    return () => {
      cancelled = true;
    };
  }, [token, organizationId, branchId, registers, active]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!active) return;
    void loadClosures().catch((cause: unknown) =>
      error(fallback(cause, "No se pudieron cargar los cierres.")),
    );
  }, [branchId, organizationId, token, archived, active, range]); // eslint-disable-line react-hooks/exhaustive-deps
  const open = async (event: FormEvent) => {
    event.preventDefault();
    if (cashPending.current) return;
    const openingMinor =
      rules?.askOpeningAmount === false ? 0 : typedCashMinor(opening);
    if (!registerId) {
      error("Seleccioná una caja para abrir la sesión.");
      return;
    }
    if (openingMinor === null) {
      error("Ingresá un fondo inicial válido.");
      return;
    }
    cashPending.current = true;
    setCashBusy(true);
    try {
      await openCashSession(
        token,
        organizationId,
        branchId,
        registerId,
        openingMinor,
      );
      setOpening("");
      onRegisterChange(registerId);
      done();
      // La caja ya abrió: si falla esta consulta, sólo no se ofrece el diálogo.
      const rows = await getCashPendingCollections(
        token,
        organizationId,
        branchId,
      ).catch(() => pendingRows ?? []);
      if (hasAssignedCollections(rows, registerId)) setPendingOpen(true);
    } catch (cause) {
      error(fallback(cause, "No se pudo abrir la caja."));
    } finally {
      cashPending.current = false;
      setCashBusy(false);
    }
  };
  // Lo escrito para una caja no debe registrarse por error en otra.
  const chooseRegister = (id: string) => {
    setOpening("");
    setMovementAmount("");
    setMovementReason("");
    onRegisterChange(id);
  };
  const register = registers.find((item) => item.id === registerId);
  const movement = async (event: FormEvent) => {
    event.preventDefault();
    if (!session || cashPending.current) return;
    const amountMinor = typedCashMinor(movementAmount);
    if (!amountMinor) {
      error("Ingresá un importe mayor a cero.");
      return;
    }
    if (
      rules?.requireMovementReason !== false &&
      movementReason.trim().length < 3
    ) {
      error("Indicá un motivo de al menos 3 caracteres.");
      return;
    }
    const signature = JSON.stringify([
      session.id,
      movementType,
      movementAmount,
      movementReason.trim(),
    ]);
    if (movementRequest.current?.signature !== signature)
      movementRequest.current = { signature, id: crypto.randomUUID() };
    cashPending.current = true;
    setCashBusy(true);
    try {
      await createCashMovement(token, organizationId, branchId, session.id, {
        clientOperationId: movementRequest.current.id,
        type: movementType,
        amountMinor,
        reason: movementReason,
      });
      movementRequest.current = null;
      setMovementType("IN");
      setMovementAmount("");
      setMovementReason("");
      done();
    } catch (cause) {
      error(fallback(cause, "No se pudo registrar el movimiento de caja."));
    } finally {
      cashPending.current = false;
      setCashBusy(false);
    }
  };
  const lastCounted =
    lastClosure?.cashRegisterId === registerId
      ? lastClosure.closingAmountMinor
      : null;
  const noPermission = management && !management.canManage && (
    <p className="mt-3 text-xs text-slate-500">
      No tenés permiso para abrir ni cerrar cajas.
    </p>
  );
  return (
    <div className={active ? "cash-workspace" : "hidden"}>
      {active &&
        management?.canManage &&
        toolbarTarget &&
        createPortal(
          <RegisterManager
            branchName={branchName}
            token={token}
            organizationId={organizationId}
            branchId={branchId}
            registers={management.registers}
            done={done}
          />,
          toolbarTarget,
        )}
      <CashStatusBar
        session={session}
        registerName={register?.name}
        responsibleName={register?.responsibleName}
        pending={pendingRows && pendingCollectionsSummary(pendingRows)}
        onPending={() => setPendingOpen(true)}
        registerPicker={
          registers.length > 1 ? (
            <CashRegisterPicker
              registers={registers}
              openSessions={openSessions}
              value={registerId}
              onChange={chooseRegister}
              disabled={cashBusy}
            />
          ) : undefined
        }
      />
      <nav aria-label="Secciones de caja" className="cash-tabs">
        {(
          [
            ["session", "Sesión"],
            ["history", "Historial"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={tab === value}
            onClick={() => setTab(value)}
          >
            {label}
          </button>
        ))}
      </nav>
      {tab === "history" ? (
        <CashHistory
          closures={closures}
          registers={management?.registers ?? registers}
          from={range.from}
          to={range.to}
          registerId={historyRegisterId}
          archived={archived}
          canArchive={Boolean(management?.canArchive)}
          rangeInvalid={rangeInvalid}
          onFrom={(from) => setRange((value) => ({ ...value, from }))}
          onTo={(to) => setRange((value) => ({ ...value, to }))}
          onRegister={setHistoryRegisterId}
          onArchived={(value) => {
            setClosures([]);
            setArchived(value);
          }}
          onView={setClosureDetailId}
          actions={(closure) =>
            management?.canArchive && (
              <ClosureVisibility
                key={`${closure.id}-${archived}`}
                token={token}
                organizationId={organizationId}
                branchId={branchId}
                id={closure.id}
                label={`${closure.cashRegisterName} · ${new Date(closure.closedAt!).toLocaleString("es-AR")}`}
                archived={archived}
                done={() => {
                  void loadClosures().catch((cause: unknown) =>
                    error(
                      fallback(cause, "No se pudieron actualizar los cierres."),
                    ),
                  );
                }}
              />
            )
          }
        />
      ) : (
        <div className={`cash-session ${session ? "" : "is-closed"}`}>
          {session ? (
            <CashMetrics session={session} />
          ) : active && registerId ? (
            <CashLatestClosure
              key={`${organizationId}:${branchId}:${registerId}`}
              token={token}
              organizationId={organizationId}
              branchId={branchId}
              registerId={registerId}
              refreshKey={closures}
              onView={setClosureDetailId}
              onLoaded={setLastClosure}
            />
          ) : (
            <div className="cash-metrics" />
          )}
          <CashTimeline
            key={session?.id ?? "closed"}
            session={session}
            recent={
              recent?.registerId === registerId
                ? recent
                : registerId
                  ? {}
                  : undefined
            }
          />
          {session &&
          management?.canManage &&
          rules?.allowManualMovements !== false ? (
            <form
              onSubmit={(event) => void movement(event)}
              className="cash-card cash-manual"
            >
              <div className="cash-card-heading">
                <span className="cash-icon bg-slate-50 text-slate-500">
                  <ArrowLeftRight size={20} />
                </span>
                <h2>Movimiento manual</h2>
              </div>
              <div
                className="cash-movement-toggle"
                role="group"
                aria-label="Tipo de movimiento"
              >
                <button
                  type="button"
                  aria-pressed={movementType === "IN"}
                  onClick={() => setMovementType("IN")}
                >
                  ↑ Ingreso
                </button>
                <button
                  type="button"
                  aria-pressed={movementType === "OUT"}
                  onClick={() => setMovementType("OUT")}
                >
                  ↓ Egreso
                </button>
              </div>
              <MoneyInput
                label="Importe"
                value={movementAmount}
                onChange={setMovementAmount}
              />
              <label className="mt-4 block text-sm">
                Motivo
                <input
                  required={rules?.requireMovementReason !== false}
                  maxLength={300}
                  value={movementReason}
                  onChange={(event) => setMovementReason(event.target.value)}
                  className="mt-1 h-10 w-full border px-3"
                />
              </label>
              <button
                disabled={cashBusy}
                className="mt-5 w-full bg-teal-700 py-2 text-sm text-white disabled:opacity-50"
              >
                {cashBusy
                  ? "Guardando…"
                  : movementType === "IN"
                    ? "Registrar ingreso"
                    : "Registrar egreso"}
              </button>
            </form>
          ) : session ? (
            <section className="cash-card cash-manual">
              <div className="cash-card-heading">
                <span className="cash-icon">
                  <ArrowLeftRight size={20} />
                </span>
                <h2>Movimiento manual</h2>
              </div>
              <p className="py-8 text-sm text-slate-500">
                {rules?.allowManualMovements === false
                  ? "Los movimientos manuales están deshabilitados en esta sucursal."
                  : "No tenés permiso para registrar movimientos de caja."}
              </p>
            </section>
          ) : null}
          <section className="cash-card cash-close">
            <div className="cash-card-heading">
              <span className="cash-icon bg-amber-50 text-amber-600">
                <CashRegisterIcon size={20} />
              </span>
              <h2>{session ? "Cerrar caja" : "Abrir caja"}</h2>
            </div>
            {session ? (
              <CashCloseForm
                key={session.id}
                session={session}
                token={token}
                organizationId={organizationId}
                branchId={branchId}
                disabled={!management?.canManage || cashBusy}
                pendingCollections={
                  pendingRows?.filter(
                    (row) => row.destinationRegisterId === registerId,
                  ).length
                }
                onRejected={done}
                onClosed={() => {
                  onRegisterChange(registerId);
                  done();
                  void loadClosures().catch(() =>
                    error(
                      "El cierre se guardó, pero no se pudo actualizar el historial.",
                    ),
                  );
                }}
              />
            ) : (
              <form onSubmit={(event) => void open(event)}>
                {rules?.askOpeningAmount !== false && (
                  <>
                    <MoneyInput
                      label="Fondo inicial"
                      value={opening}
                      onChange={setOpening}
                    />
                    {lastCounted && lastCounted !== "0" && (
                      <button
                        type="button"
                        onClick={() =>
                          setOpening(
                            formatAmountTyping(lotCostInput(lastCounted)),
                          )
                        }
                        className="mt-2 text-xs text-teal-700 underline-offset-2 hover:underline"
                      >
                        Usar último contado ({cashMoney(lastCounted)})
                      </button>
                    )}
                  </>
                )}
                <button
                  disabled={cashBusy || !management?.canManage}
                  className="mt-5 w-full bg-teal-700 py-2 text-sm text-white disabled:opacity-50"
                >
                  {register ? `Abrir ${register.name}` : "Abrir caja"}
                </button>
              </form>
            )}
            {noPermission}
          </section>
        </div>
      )}
      <CashPendingCollections
        token={token}
        organizationId={organizationId}
        branchId={branchId}
        registers={registers}
        canManage={Boolean(management?.canManage)}
        registerId={registerId}
        open={pendingOpen && active}
        onClose={() => setPendingOpen(false)}
        onAssigned={() => {
          loadPending();
          done();
        }}
      />
      {active && closureDetailId && (
        <CashClosureDetail
          key={closureDetailId}
          token={token}
          organizationId={organizationId}
          branchId={branchId}
          id={closureDetailId}
          onClose={() => setClosureDetailId(undefined)}
        />
      )}
    </div>
  );
}
