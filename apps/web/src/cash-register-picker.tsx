import { CashRegisterIcon } from "./cash-register-icon";
import type { CashRegister, CashSession } from "./lib/api";
import { ProductFilterSelect } from "./product-filter-select";

type OpenSession = Pick<CashSession, "id" | "cashRegisterId" | "openedBy">;

const cashRegisterOptionLabel = (name: string, session?: OpenSession) =>
  !session
    ? `${name} · Cerrada`
    : `${name} · Abierta${session.openedBy ? ` por ${session.openedBy}` : ""}`;

export function CashRegisterPicker({
  registers,
  openSessions,
  value,
  onChange,
  disabled = false,
}: {
  registers: CashRegister[];
  openSessions: OpenSession[];
  value: string;
  onChange: (registerId: string) => void;
  disabled?: boolean;
}) {
  return (
    <div>
      <ProductFilterSelect
        compact
        label="Caja"
        icon={<CashRegisterIcon size={15} aria-hidden />}
        disabled={disabled}
        value={value}
        options={registers.map((register) => ({
          value: register.id,
          label: cashRegisterOptionLabel(
            register.name,
            openSessions.find((item) => item.cashRegisterId === register.id),
          ),
        }))}
        onChange={onChange}
      />
    </div>
  );
}

/** Caja donde se va a cobrar, visible siempre que se está vendiendo. */
export function SaleCashStatus({
  registers,
  openSessions,
  session,
  allowWithoutSession,
  onChange,
}: {
  registers: CashRegister[];
  openSessions: OpenSession[];
  session?: OpenSession;
  allowWithoutSession: boolean;
  onChange: (registerId: string) => void;
}) {
  const name = (registerId: string) =>
    registers.find((register) => register.id === registerId)?.name ?? "Caja";
  if (openSessions.length > 1)
    return (
      <div className="w-40 min-w-0 md:w-56">
        <ProductFilterSelect
          compact
          label="Caja para cobrar"
          icon={<CashRegisterIcon size={15} aria-hidden />}
          value={session?.cashRegisterId ?? ""}
          options={[
            ...(session
              ? []
              : [{ value: "", label: "Elegí en qué caja cobrar" }]),
            ...openSessions.map((item) => ({
              value: item.cashRegisterId,
              label: name(item.cashRegisterId),
            })),
          ]}
          onChange={(registerId) => {
            if (registerId) onChange(registerId);
          }}
        />
      </div>
    );
  // Una sola caja: tarjeta como la de la cuenta y la sucursal del
  // encabezado (SISTEMA-110), con el estado como un punto sobre el ícono.
  const tono = session
    ? "abierta"
    : allowWithoutSession
      ? "pendiente"
      : "sin-caja";
  const estilos = {
    abierta: {
      icono: "bg-marca-970 text-marca-535",
      punto: "bg-emerald-500",
      estado: "Abierta",
    },
    pendiente: {
      icono: "bg-amber-50 text-amber-700",
      punto: "bg-amber-500",
      estado: "El cobro queda pendiente",
    },
    "sin-caja": {
      icono: "bg-rose-50 text-rose-600",
      punto: "bg-rose-500",
      estado: "No se puede cobrar",
    },
  }[tono];
  return (
    <div
      role="status"
      aria-label={
        session
          ? `Caja abierta · ${name(session.cashRegisterId)}`
          : allowWithoutSession
            ? "Sin caja · el cobro queda pendiente"
            : "Sin caja abierta"
      }
      className="flex h-11 items-center gap-2.5 rounded-xl border border-slate-200 bg-white pl-1.5 pr-3.5 shadow-sm"
    >
      <span
        className={`relative grid size-8 shrink-0 place-items-center rounded-lg ${estilos.icono}`}
      >
        <CashRegisterIcon size={17} aria-hidden />
        <span
          aria-hidden
          className={`absolute -right-0.5 -top-0.5 size-2.5 rounded-full border-2 border-white ${estilos.punto}`}
        />
      </span>
      <span className="min-w-0 leading-tight">
        <span className="block text-[11px] font-medium text-slate-500">
          {session ? "Cobrás en" : "Caja para cobrar"}
        </span>
        <span className="flex items-baseline gap-1.5 whitespace-nowrap">
          <span className="max-w-40 truncate text-sm font-semibold text-slate-800">
            {session ? name(session.cashRegisterId) : "Sin caja abierta"}
          </span>
          <span
            className={`text-[11px] font-medium ${session ? "text-emerald-700" : allowWithoutSession ? "text-amber-700" : "text-rose-600"}`}
          >
            {estilos.estado}
          </span>
        </span>
      </span>
    </div>
  );
}
