import {
  Truck,
  X,
  Pencil,
  FileText,
  UserRound,
  MapPin,
  CalendarDays,
  Phone,
  Mail,
} from "lucide-react";
import type { Party } from "./lib/api";
import { secondary } from "./supplier-payables/dialog";

export function SupplierDetail({
  supplier,
  onClose,
  onEdit,
}: {
  supplier: Party;
  onClose: () => void;
  onEdit: () => void;
}) {
  const fields = [
    { icon: FileText, label: "CUIT / Documento", value: supplier.taxId },
    {
      icon: UserRound,
      label: "Persona de contacto",
      value: supplier.contactName,
    },
    { icon: MapPin, label: "Dirección", value: supplier.address },
    {
      icon: CalendarDays,
      label: "Plazo habitual",
      value: supplier.accountEnabled
        ? supplier.accountTermDays == null
          ? "Sin plazo definido"
          : supplier.accountTermDays === 0
            ? "Al recibir"
            : `${supplier.accountTermDays} días`
        : "No aplica · Sin cuenta corriente",
    },
  ];
  return (
    <aside
      id="supplier-detail"
      aria-label={`Detalle de ${supplier.name}`}
      className="order-first flex min-w-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm xl:order-none"
    >
      <header className="flex items-start gap-3 border-b border-slate-100 bg-slate-50/60 p-5">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-teal-50 text-teal-700">
          <Truck size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="mb-1 text-sm font-medium text-slate-500">
            Ficha del proveedor
          </p>
          <h2 className="break-words text-lg font-semibold text-slate-800">
            {supplier.name}
          </h2>
          <span
            className={`mt-2 inline-flex rounded-md px-2.5 py-1 text-sm font-medium ${supplier.accountEnabled ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}
          >
            {supplier.accountEnabled
              ? "Con cuenta corriente"
              : "Sin cuenta corriente"}
          </span>
        </div>
        <button
          aria-label="Cerrar detalle del proveedor"
          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
          onClick={onClose}
        >
          <X size={17} />
        </button>
      </header>
      <dl className="space-y-5 p-5">
        {fields.map(({ icon: Icon, label, value }) => (
          <div key={label} className="flex gap-2.5">
            <Icon size={17} className="mt-0.5 shrink-0 text-slate-400" />
            <div className="min-w-0">
              <dt className="text-sm font-medium text-slate-500">{label}</dt>
              <dd
                className={`mt-0.5 break-words text-base leading-relaxed ${value ? "text-slate-800" : "text-slate-400"}`}
              >
                {value || "Sin especificar"}
              </dd>
            </div>
          </div>
        ))}
      </dl>
      <div className="mx-5 space-y-3 border-t border-slate-100 py-5 text-sm text-slate-500">
        <h3 className="text-base font-medium text-slate-700">Contacto</h3>
        <p className="flex items-start gap-2 break-all">
          <Phone size={16} className="shrink-0" />
          {supplier.phone || "Sin teléfono"}
        </p>
        <p className="flex items-start gap-2 break-all">
          <Mail size={16} className="shrink-0" />
          {supplier.email || "Sin email"}
        </p>
        <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-3">
          <h3 className="mb-1.5 text-sm font-medium text-slate-600">
            Observaciones
          </h3>
          <p className="whitespace-pre-wrap break-words leading-relaxed">
            {supplier.notes || "Sin observaciones"}
          </p>
        </div>
      </div>
      <footer className="mt-auto border-t border-slate-100 p-4">
        <button className={`${secondary} w-full`} onClick={onEdit}>
          <Pencil size={16} />
          Editar proveedor
        </button>
      </footer>
    </aside>
  );
}
