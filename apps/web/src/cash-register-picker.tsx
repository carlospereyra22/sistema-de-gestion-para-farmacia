import { CashRegisterIcon } from "./cash-register-icon";
import type { CashRegister, CashSession } from "./lib/api";
import { ProductFilterSelect } from "./product-filter-select";

type OpenSession = Pick<CashSession, "id" | "cashRegisterId">;

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
    <div className="mt-3">
      <ProductFilterSelect
        compact
        label="Caja"
        icon={<CashRegisterIcon size={15} aria-hidden />}
        disabled={disabled}
        value={value}
        options={registers.map((register) => ({
          value: register.id,
          label: `${register.name} · ${
            openSessions.some((item) => item.cashRegisterId === register.id)
              ? "Abierta"
              : "Cerrada"
          }`,
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
  return (
    <span
      role="status"
      className={`inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-xs font-semibold ${session ? "bg-emerald-50 text-emerald-700" : allowWithoutSession ? "bg-amber-50 text-amber-800" : "bg-rose-50 text-rose-700"}`}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {session
        ? `Caja abierta · ${name(session.cashRegisterId)}`
        : allowWithoutSession
          ? "Sin caja · el cobro queda pendiente"
          : "Sin caja abierta"}
    </span>
  );
}
