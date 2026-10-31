import { Phone, IdCard, UsersRound } from "lucide-react";
import { WhatsAppIcon } from "./whatsapp-icon";
import type { CustomerAccount } from "./lib/api";
import { whatsappLink } from "./lib/whatsapp-link";

export function AccountCustomerContact({
  account,
}: {
  account?: CustomerAccount;
}) {
  const phone = account?.billingPhone;
  const document = account?.billingTaxId || account?.document || "Sin informar";
  const link = whatsappLink(phone);
  const enabled = account?.active && account.creditEnabled;
  return (
    <section
      aria-label="Datos del cliente"
      className="account-contact-card flex min-w-0 flex-col justify-center gap-1.5 rounded-xl border border-teal-200 bg-gradient-to-br from-white to-teal-50/60 px-3 py-2 shadow-sm"
    >
      <div className="flex items-center gap-3">
        <h3 className="flex shrink-0 items-center gap-1.5 text-[11px] font-semibold text-slate-800">
          <UsersRound size={14} className="text-teal-700" />
          Datos del cliente
        </h3>
        <span
          className={`inline-flex min-w-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-medium ${enabled ? "bg-teal-100/70 text-teal-700" : "bg-slate-100 text-slate-500"}`}
        >
          <span className="size-1 shrink-0 rounded-full bg-current" />
          <span className="truncate">
            {account
              ? enabled
                ? "Crédito habilitado"
                : "Crédito deshabilitado"
              : "Sin cliente seleccionado"}
          </span>
        </span>
      </div>
      <div className="grid min-w-0 grid-cols-3 items-center gap-2">
        <div
          className="flex min-w-0 items-center gap-2"
          title={`CUIT / DNI: ${document}`}
        >
          <IdCard size={16} className="shrink-0 text-teal-700" />
          <div className="min-w-0">
            <span className="block text-[9px] text-slate-500">CUIT / DNI</span>
            <span className="block truncate text-[11px] font-medium leading-4 text-slate-700">
              {document}
            </span>
          </div>
        </div>
        <div
          className="flex min-w-0 items-center gap-2 border-l border-teal-100 pl-2"
          title={`Teléfono: ${phone || "Sin informar"}`}
        >
          <Phone size={16} className="shrink-0 text-teal-700" />
          <div className="min-w-0">
            <span className="block text-[9px] text-slate-500">Teléfono</span>
            <span className="block truncate text-[11px] font-medium leading-4 text-slate-700">
              {phone || "Sin informar"}
            </span>
          </div>
        </div>
        {link ? (
          <a
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Abrir WhatsApp de ${account?.name}`}
            title={`WhatsApp: ${phone}`}
            className="flex min-w-0 items-center gap-2 border-l border-teal-100 pl-2 text-teal-700 hover:text-teal-900 focus-visible:outline-2 focus-visible:outline-teal-600"
          >
            <span className="shrink-0">
              <WhatsAppIcon size={17} />
            </span>
            <span className="min-w-0">
              <span className="block text-[9px] text-slate-500">WhatsApp</span>
              <span className="block truncate text-[11px] font-medium leading-4">
                {phone}
              </span>
            </span>
          </a>
        ) : (
          <span
            aria-label="WhatsApp no disponible: falta un teléfono con código de país"
            title="Para abrir WhatsApp, cargá el teléfono con código de país (por ejemplo, +54 9…)."
            className="flex min-w-0 items-center gap-2 border-l border-teal-100 pl-2 text-slate-400"
          >
            <span className="shrink-0">
              <WhatsAppIcon size={17} />
            </span>
            <span className="min-w-0">
              <span className="block text-[9px] text-slate-500">WhatsApp</span>
              <span className="block truncate text-[11px] font-medium leading-4 text-slate-700">
                {phone || "Sin informar"}
              </span>
            </span>
          </span>
        )}
      </div>
    </section>
  );
}
