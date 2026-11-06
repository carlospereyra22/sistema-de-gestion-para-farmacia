import { Phone, IdCard } from "lucide-react";
import { WhatsAppIcon } from "./whatsapp-icon";
import type { CustomerAccount } from "./lib/api";
import { whatsappLink } from "./lib/whatsapp-link";

export function AccountCustomerContact({
  account,
}: {
  account: CustomerAccount;
}) {
  const phone = account.billingPhone;
  const document = account.billingTaxId || account.document || "Sin informar";
  const link = whatsappLink(phone);
  return (
    <ul
      aria-label="Datos del cliente"
      className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600"
    >
      <li className="flex min-w-0 items-center gap-1.5">
        <IdCard
          size={14}
          aria-hidden="true"
          className="shrink-0 text-teal-700"
        />
        <span className="text-slate-500">CUIT / DNI</span>
        <span className="min-w-0 break-words font-medium">{document}</span>
      </li>
      <li className="flex min-w-0 items-center gap-1.5">
        <Phone
          size={14}
          aria-hidden="true"
          className="shrink-0 text-teal-700"
        />
        <span className="text-slate-500">Teléfono</span>
        <span className="min-w-0 break-words font-medium">
          {phone || "Sin informar"}
        </span>
      </li>
      <li className="flex min-w-0 items-center">
        {link ? (
          <a
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Abrir WhatsApp de ${account.name}`}
            title={`WhatsApp: ${phone}`}
            className="inline-flex items-center gap-1.5 font-medium text-teal-700 hover:text-teal-900 focus-visible:outline-2 focus-visible:outline-teal-600"
          >
            <WhatsAppIcon size={14} />
            WhatsApp
          </a>
        ) : (
          <span
            aria-label="WhatsApp no disponible: falta un teléfono con código de país"
            title="Para abrir WhatsApp, cargá el teléfono con código de país (por ejemplo, +54 9…)."
            className="inline-flex items-center gap-1.5 text-slate-400"
          >
            <WhatsAppIcon size={14} />
            WhatsApp
          </span>
        )}
      </li>
    </ul>
  );
}
