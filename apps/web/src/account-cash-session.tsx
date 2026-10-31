import { AlertCircle } from "lucide-react";

export function AccountCashSession({
  sessions,
  value,
  onChange,
  allowWithoutSession = true,
}: {
  sessions: { id: string; openedAt: string }[];
  value: string;
  onChange: (id: string) => void;
  allowWithoutSession?: boolean;
}) {
  if (sessions.length === 1) return null;
  if (!sessions.length)
    return (
      <div
        role="alert"
        className="flex items-start gap-2 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2.5 text-xs leading-5 text-amber-800"
      >
        <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
        <p>
          {allowWithoutSession
            ? "No hay una caja abierta en esta sucursal. El cobro quedará pendiente de asignación a una caja."
            : "Esta sucursal requiere una caja abierta para registrar cobros."}
        </p>
      </div>
    );
  return (
    <label className="block text-xs text-slate-600">
      Caja para este cobro
      <select
        required
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
      >
        <option value="">Seleccionar caja</option>
        {sessions.map((session) => (
          <option key={session.id} value={session.id}>
            Caja · {new Date(session.openedAt).toLocaleString("es-AR")}
          </option>
        ))}
      </select>
    </label>
  );
}
