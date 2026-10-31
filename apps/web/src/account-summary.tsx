import { Wallet, ShieldCheck, Users } from "lucide-react";

export function AccountSummary({
  debtMinor,
  enabled,
  owing,
}: {
  debtMinor: number;
  enabled: number;
  owing: number;
}) {
  const metrics = [
    {
      label: "Total por cobrar",
      value: (debtMinor / 100).toLocaleString("es-AR", {
        style: "currency",
        currency: "ARS",
      }),
      icon: Wallet,
      color: "#315da8",
    },
    {
      label: "Cuentas habilitadas",
      value: String(enabled),
      icon: ShieldCheck,
      color: "#2d8a3f",
    },
    {
      label: "Clientes con deuda",
      value: String(owing),
      icon: Users,
      color: "#7c3aed",
    },
  ];
  return (
    <dl
      aria-label="Resumen de cuentas corrientes"
      className="grid h-full min-w-0 grid-cols-2 gap-2 md:grid-cols-3"
    >
      {metrics.map(({ label, value, icon: Icon, color }, index) => (
        <div
          key={label}
          className={`relative min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm ${index === 0 ? "col-span-2 md:col-span-1" : ""}`}
          style={{ borderTopWidth: 4, borderTopColor: color }}
        >
          <span
            className="absolute right-3 top-2 hidden h-6 w-6 items-center justify-center rounded-lg bg-slate-50 sm:flex"
            style={{ color }}
          >
            <Icon size={13} aria-hidden="true" />
          </span>
          <dt className="text-[10px] font-medium uppercase tracking-wide text-slate-500 sm:pr-8">
            {label}
          </dt>
          <dd
            className="mt-0.5 break-words text-lg font-semibold tracking-tight tabular-nums sm:pr-8"
            style={{ color }}
          >
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
