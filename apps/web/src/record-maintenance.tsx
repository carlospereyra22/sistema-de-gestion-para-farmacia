import { useEffect, useRef, useState, type ReactNode } from "react";
import { Pencil, Trash2, RotateCcw, Settings2, X } from "lucide-react";
import { CashRegisterIcon } from "./cash-register-icon";
import { lotCostInput, lotCostMinor } from "./lib/lot-cost";
import { CashRulesSettings, CashClosingRules } from "./cash-rules-settings";
import {
  archiveCashClosure,
  createCashRegister,
  editCashRegister,
  editLotMetadata,
  type CashRegister,
  type StockLot,
} from "./lib/api";

type Scope = {
  token: string;
  organizationId: string;
  branchId: string;
  done: () => void;
};

function MaintenanceDialog({
  title,
  children,
  save,
  close,
  destructive = false,
}: {
  title: string;
  children: ReactNode;
  save: () => Promise<void>;
  close: () => void;
  destructive?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-label={title}
      className="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-2xl border bg-white p-6 text-left shadow-xl backdrop:bg-slate-950/35"
      onCancel={(event) => {
        event.preventDefault();
        if (!pending.current) close();
      }}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (pending.current) return;
          pending.current = true;
          setBusy(true);
          setError("");
          void save()
            .then(close)
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
        <h2 className="text-lg font-semibold">{title}</h2>
        <fieldset disabled={busy} className="mt-4 space-y-4">
          {children}
        </fieldset>
        {error && (
          <p role="alert" className="mt-4 text-sm text-rose-700">
            {error}
          </p>
        )}
        <div className="mt-5 flex justify-end gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={close}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium transition hover:bg-slate-50 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            disabled={busy}
            className={`rounded-xl px-4 py-2 text-sm font-medium text-white transition disabled:opacity-50 ${destructive ? "bg-rose-600 hover:bg-rose-700" : "bg-teal-700 hover:bg-teal-800"}`}
          >
            {busy ? "Guardando…" : "Confirmar"}
          </button>
        </div>
      </form>
    </dialog>
  );
}

function Reason({
  value,
  change,
}: {
  value: string;
  change: (value: string) => void;
}) {
  return (
    <label className="block text-sm">
      Motivo (queda en auditoría)
      <input
        required
        minLength={3}
        maxLength={300}
        value={value}
        onChange={(event) => change(event.target.value)}
        className="mt-1 w-full border px-3 py-2"
      />
    </label>
  );
}

export function LotMetadataEditor({
  lot,
  compact = false,
  ...scope
}: Scope & { lot: StockLot; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [number, setNumber] = useState(lot.number);
  const [cost, setCost] = useState(lotCostInput(lot.unitCostMinor));
  const [expiry, setExpiry] = useState(lot.expiresAt?.slice(0, 10) ?? "");
  const [reason, setReason] = useState("");
  const [snapshot, setSnapshot] = useState(lot);
  return (
    <>
      <button
        type="button"
        title="Editar lote, vencimiento y costo"
        aria-label={
          compact
            ? `Editar lote ${lot.number} de ${lot.productName}`
            : undefined
        }
        className={
          compact
            ? "inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-teal-50 hover:text-teal-700 focus-visible:outline-2 focus-visible:outline-teal-600"
            : "mt-2 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 shadow-sm transition hover:border-teal-300 hover:bg-teal-50 hover:text-teal-800 focus-visible:outline-2 focus-visible:outline-teal-600"
        }
        onClick={() => {
          setSnapshot(lot);
          setNumber(lot.number);
          setCost(lotCostInput(lot.unitCostMinor));
          setExpiry(lot.expiresAt?.slice(0, 10) ?? "");
          setReason("");
          setOpen(true);
        }}
      >
        <Pencil size={compact ? 15 : 13} aria-hidden="true" />
        {!compact && " Editar"}
      </button>
      {open && (
        <MaintenanceDialog
          title="Corregir datos del lote"
          close={() => setOpen(false)}
          save={async () => {
            await editLotMetadata(
              scope.token,
              scope.organizationId,
              scope.branchId,
              snapshot,
              number.trim(),
              expiry || null,
              reason.trim(),
              lotCostMinor(cost),
            );
            scope.done();
          }}
        >
          <p className="text-sm">
            {lot.productName}. Los cambios se aplican solo a este lote. No
            modifican cantidades, precios de venta, compras ni deudas
            registradas.
          </p>
          <label className="block text-sm">
            Número de lote
            <input
              required
              maxLength={100}
              value={number}
              onChange={(event) => setNumber(event.target.value)}
              className="mt-1 w-full border px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            Vencimiento (vacío: sin fecha)
            <input
              type="date"
              value={expiry}
              onChange={(event) => setExpiry(event.target.value)}
              className="mt-1 w-full border px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            Costo unitario del lote (ARS)
            <input
              required
              inputMode="decimal"
              value={cost}
              onChange={(event) => setCost(event.target.value)}
              className="mt-1 w-full border px-3 py-2"
            />
            <span className="mt-1 block text-xs text-slate-500">
              Por unidad de stock. El costo anterior queda en auditoría.
            </span>
          </label>
          <Reason value={reason} change={setReason} />
        </MaintenanceDialog>
      )}
    </>
  );
}

export function RegisterManager({
  registers,
  branchName,
  ...scope
}: Scope & { registers: CashRegister[]; branchName?: string }) {
  const [selected, setSelected] = useState<CashRegister>();
  const [name, setName] = useState("");
  const [responsibleName, setResponsibleName] = useState("");
  const [newResponsibleName, setNewResponsibleName] = useState("");
  const [active, setActive] = useState(true);
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCode, setNewCode] = useState("");
  const [tab, setTab] = useState<"registers" | "rules" | "closing">(
    "registers",
  );
  const [rulesDirty, setRulesDirty] = useState(false);
  const [rulesVisit, setRulesVisit] = useState(0);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [created, setCreated] = useState("");
  const pendingCreate = useRef(false);
  const [mode, setMode] = useState<"edit" | "archive" | "restore">("edit");
  const panelRef = useRef<HTMLDialogElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const panel = panelRef.current;
    if (open) panel?.showModal();
    return () => panel?.close();
  }, [open]);
  const choose = (register: CashRegister, action: typeof mode) => {
    setSelected(register);
    setName(register.name);
    setResponsibleName(register.responsibleName ?? "");
    setActive(
      action === "archive"
        ? false
        : action === "restore"
          ? true
          : register.active,
    );
    setMode(action);
  };
  return (
    <>
      <button
        type="button"
        onClick={() => {
          setRulesVisit((value) => value + 1);
          setOpen(true);
        }}
        title="Configurar cajas"
        className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 shadow-sm transition hover:bg-slate-50 hover:text-teal-800"
      >
        <Settings2 size={15} aria-hidden="true" /> Configurar cajas
      </button>
      <dialog
        ref={panelRef}
        aria-label="Configurar cajas"
        onCancel={(event) => {
          if (pendingCreate.current || rulesDirty) event.preventDefault();
          else setOpen(false);
        }}
        className="m-auto h-[min(720px,85dvh)] max-h-[85dvh] w-[calc(100%-2rem)] max-w-5xl overflow-hidden rounded-2xl border border-slate-200 bg-[#f8fbfc] p-4 shadow-xl backdrop:bg-slate-950/35 open:flex open:flex-col sm:p-6"
      >
        <header className="flex shrink-0 items-center justify-between gap-4">
          <h2 className="flex items-center gap-2 font-semibold">
            <CashRegisterIcon size={19} className="text-teal-700" /> Configurar
            cajas
          </h2>
          <button
            type="button"
            aria-label="Cerrar configuración de cajas"
            disabled={creating || rulesDirty}
            onClick={() => setOpen(false)}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
          >
            <X size={18} />
          </button>
        </header>
        <p className="mt-1 text-sm text-slate-500">
          Podés renombrar, eliminar del listado o restaurar una caja. Se
          conservan sus cierres y movimientos.
        </p>
        <nav
          aria-label="Configuración de caja"
          className="mt-5 flex shrink-0 flex-wrap gap-1 border-b border-slate-200 pb-2"
        >
          {(
            [
              ["registers", "Cajas"],
              ["rules", "Reglas operativas"],
              ["closing", "Cierres y arqueos"],
            ] as const
          ).map(([value, label]) => (
            <button
              type="button"
              key={value}
              aria-pressed={tab === value}
              disabled={creating || (rulesDirty && value !== "rules")}
              onClick={() => {
                setTab(value);
                if (contentRef.current) contentRef.current.scrollTop = 0;
              }}
              className={`rounded-lg px-4 py-2 text-sm disabled:opacity-40 ${tab === value ? "bg-teal-50 font-semibold text-teal-700" : "text-slate-500 hover:bg-slate-50"}`}
            >
              {label}
            </button>
          ))}
        </nav>
        <div
          ref={contentRef}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-gutter:stable]"
        >
          {rulesDirty && (
            <p className="mt-2 text-xs text-amber-700">
              Guardá o descartá los cambios antes de salir de Reglas operativas.
            </p>
          )}
          {open && (
            <div hidden={tab !== "rules"}>
              <CashRulesSettings
                key={rulesVisit}
                token={scope.token}
                organizationId={scope.organizationId}
                branchId={scope.branchId}
                registers={registers}
                onSaved={scope.done}
                onDirty={setRulesDirty}
              />
            </div>
          )}
          {tab === "closing" && <CashClosingRules />}
          <div
            className={
              tab === "registers"
                ? "mt-5 grid items-start gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(260px,1fr)]"
                : "hidden"
            }
          >
            <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-4">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-sm font-semibold">Cajas configuradas</h3>
                <input
                  aria-label="Buscar cajas"
                  placeholder="Buscar cajas…"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className="h-9 min-w-0 max-w-full border px-3 text-xs"
                />
              </div>
              <div className="max-h-[50dvh] space-y-2 overflow-y-auto">
                {registers
                  .filter((register) =>
                    register.name
                      .toLocaleLowerCase("es-AR")
                      .includes(query.trim().toLocaleLowerCase("es-AR")),
                  )
                  .map((register) => (
                    <div
                      key={register.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/60 p-3"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-teal-50 text-teal-700">
                          <CashRegisterIcon size={18} />
                        </span>
                        <div>
                          <p className="break-words text-sm font-semibold">
                            {register.name}
                          </p>
                          {register.responsibleName && (
                            <p className="mt-1 text-xs text-slate-600">
                              Responsable: {register.responsibleName}
                            </p>
                          )}
                          <p className="mt-1 text-xs text-slate-500">
                            {register.code ?? "Sin código"} ·{" "}
                            {branchName ?? "Sucursal actual"}
                          </p>
                          <p
                            className={`mt-1 text-xs ${register.active ? "text-teal-700" : "text-slate-400"}`}
                          >
                            {register.active
                              ? "● Habilitada"
                              : "○ Deshabilitada"}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => choose(register, "edit")}
                          className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-medium text-slate-600 transition hover:bg-white hover:text-teal-700"
                        >
                          <Pencil size={14} aria-hidden="true" /> Editar
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            choose(
                              register,
                              register.active ? "archive" : "restore",
                            )
                          }
                          className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-medium transition ${register.active ? "text-rose-600 hover:bg-rose-50" : "text-teal-700 hover:bg-teal-50"}`}
                        >
                          {register.active ? (
                            <Trash2 size={14} aria-hidden="true" />
                          ) : (
                            <RotateCcw size={14} aria-hidden="true" />
                          )}
                          {register.active ? "Eliminar" : "Restaurar"}
                        </button>
                      </div>
                    </div>
                  ))}
                {!registers.length && (
                  <p className="py-8 text-center text-sm text-slate-500">
                    Todavía no hay cajas. Creá la primera para esta sucursal.
                  </p>
                )}
                {registers.length > 0 &&
                  !registers.some((register) =>
                    register.name
                      .toLocaleLowerCase("es-AR")
                      .includes(query.trim().toLocaleLowerCase("es-AR")),
                  ) && (
                    <p className="py-8 text-center text-sm text-slate-500">
                      No hay cajas para esta búsqueda.
                    </p>
                  )}
              </div>
            </div>
            <div className="space-y-4">
              <form
                className="rounded-xl border border-slate-200 bg-white p-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (pendingCreate.current) return;
                  if (newName.trim().length < 2) {
                    setCreateError(
                      "Ingresá un nombre de al menos 2 caracteres.",
                    );
                    return;
                  }
                  pendingCreate.current = true;
                  setCreating(true);
                  setCreateError("");
                  setCreated("");
                  void createCashRegister(
                    scope.token,
                    scope.organizationId,
                    scope.branchId,
                    newName.trim(),
                    newCode.trim() || undefined,
                    newResponsibleName.trim() || null,
                  )
                    .then(() => {
                      setNewName("");
                      setNewCode("");
                      setNewResponsibleName("");
                      setCreated(
                        "Caja creada. Ya podés abrir una sesión desde Caja.",
                      );
                      scope.done();
                    })
                    .catch((cause: unknown) =>
                      setCreateError(
                        cause instanceof Error
                          ? cause.message
                          : "No se pudo crear la caja.",
                      ),
                    )
                    .finally(() => {
                      pendingCreate.current = false;
                      setCreating(false);
                    });
                }}
              >
                <h3 className="text-sm font-semibold">Nueva caja</h3>
                <p className="mt-1 text-xs text-slate-500">
                  Se creará en la sucursal que estás usando.
                </p>
                <label className="mt-4 block text-xs font-medium text-slate-600">
                  Nombre
                  <input
                    required
                    minLength={2}
                    maxLength={100}
                    disabled={creating}
                    value={newName}
                    onChange={(event) => setNewName(event.target.value)}
                    placeholder="Ej. Caja mostrador 2"
                    className="mt-1 h-10 w-full border px-3 text-sm"
                  />
                </label>
                <label className="mt-3 block text-xs font-medium text-slate-600">
                  Código (opcional)
                  <input
                    value={newCode}
                    disabled={creating}
                    maxLength={30}
                    pattern="[A-Za-z0-9_-]{2,30}"
                    onChange={(event) =>
                      setNewCode(event.target.value.toUpperCase())
                    }
                    placeholder="Ej. CJ-002 · automático si se deja vacío"
                    className="mt-1 h-10 w-full border px-3 text-sm"
                  />
                </label>
                <label className="mt-3 block text-xs font-medium text-slate-600">
                  Responsable de caja (opcional)
                  <input
                    minLength={2}
                    maxLength={100}
                    disabled={creating}
                    value={newResponsibleName}
                    onChange={(event) =>
                      setNewResponsibleName(event.target.value)
                    }
                    placeholder="Nombre y apellido"
                    className="mt-1 h-10 w-full border px-3 text-sm"
                  />
                </label>
                <p className="mt-1 text-xs text-slate-500">
                  Se conserva en los próximos cierres. El usuario que realiza el
                  cierre se registra por separado.
                </p>
                {createError && (
                  <p role="alert" className="mt-3 text-sm text-rose-600">
                    {createError}
                  </p>
                )}
                {created && (
                  <p role="status" className="mt-3 text-sm text-teal-700">
                    {created}
                  </p>
                )}
                <button
                  disabled={creating}
                  className="mt-4 min-h-10 w-full bg-teal-700 px-3 text-sm text-white disabled:opacity-50"
                >
                  {creating ? "Creando…" : "+ Crear caja"}
                </button>
              </form>
            </div>
          </div>
        </div>
      </dialog>
      {selected && (
        <MaintenanceDialog
          title={`${mode === "edit" ? "Editar" : mode === "archive" ? "Eliminar" : "Restaurar"} caja: ${selected.name}`}
          destructive={mode === "archive"}
          close={() => setSelected(undefined)}
          save={async () => {
            await editCashRegister(
              scope.token,
              scope.organizationId,
              scope.branchId,
              selected,
              name.trim(),
              active,
              mode === "edit" ? responsibleName.trim() || null : undefined,
            );
            scope.done();
          }}
        >
          {mode === "edit" && (
            <>
              <label className="block text-sm">
                Nombre
                <input
                  required
                  minLength={2}
                  maxLength={100}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className="mt-1 w-full border px-3 py-2"
                />
              </label>
              <label className="block text-sm">
                Responsable de caja (opcional)
                <input
                  minLength={2}
                  maxLength={100}
                  value={responsibleName}
                  onChange={(event) => setResponsibleName(event.target.value)}
                  placeholder="Nombre y apellido"
                  className="mt-1 w-full border px-3 py-2"
                />
              </label>
              <p className="text-xs text-slate-500">
                Este cambio se aplica a próximos cierres, no a los anteriores.
              </p>
            </>
          )}
          <p className="text-sm">
            Una caja con sesión abierta no se puede eliminar. Esto no borra
            ningún movimiento histórico.
          </p>
        </MaintenanceDialog>
      )}
    </>
  );
}

export function ClosureVisibility({
  id,
  label,
  archived,
  ...scope
}: Scope & { id: string; label: string; archived: boolean }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  return (
    <>
      <button
        type="button"
        title={
          archived
            ? "Restaurar cierre"
            : "Quitar del listado conservando su historial"
        }
        className={`inline-flex h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border px-3 text-xs font-medium shadow-sm transition focus-visible:outline-2 focus-visible:outline-offset-2 ${archived ? "border-teal-200 bg-teal-50/60 text-teal-700 hover:bg-teal-100 focus-visible:outline-teal-600" : "border-rose-100 bg-rose-50/60 text-rose-600 hover:border-rose-200 hover:bg-rose-100 focus-visible:outline-rose-500"}`}
        onClick={() => {
          setReason("");
          setOpen(true);
        }}
      >
        {archived ? (
          <RotateCcw size={14} aria-hidden="true" />
        ) : (
          <Trash2 size={14} aria-hidden="true" />
        )}
        {archived ? "Restaurar" : "Eliminar"}
      </button>
      {open && (
        <MaintenanceDialog
          title={archived ? "Restaurar cierre" : "Eliminar cierre del listado"}
          destructive={!archived}
          close={() => setOpen(false)}
          save={async () => {
            await archiveCashClosure(
              scope.token,
              scope.organizationId,
              scope.branchId,
              id,
              !archived,
              reason.trim(),
            );
            scope.done();
          }}
        >
          <p className="text-sm">{label}</p>
          <p className="text-sm">
            El cierre se conserva y puede restaurarse. No cambia ventas, cobros,
            saldos ni informes contables.
          </p>
          <Reason value={reason} change={setReason} />
        </MaintenanceDialog>
      )}
    </>
  );
}
