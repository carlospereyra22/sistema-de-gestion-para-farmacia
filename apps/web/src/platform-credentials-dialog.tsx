import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { PayableDialog, primary, secondary } from "./supplier-payables/dialog";

/** La clave no se guarda en ningún lado que se pueda volver a consultar. */
export function PlatformCredentialsDialog({
  title,
  email,
  password,
  onClose,
}: {
  title: string;
  email: string;
  password: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <PayableDialog title={title} onClose={onClose}>
      <p className="text-sm leading-6 text-slate-600">
        Esta clave se muestra <strong>una sola vez</strong>. Pasala en persona o
        por un medio seguro: al entrar va a tener que cambiarla por una propia.
      </p>
      <dl className="mt-4 space-y-2 rounded-xl bg-slate-50 p-4 text-sm">
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-slate-500">Correo</dt>
          <dd className="min-w-0 break-all text-right font-medium">{email}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-slate-500">Clave temporal</dt>
          <dd className="min-w-0 break-all text-right font-mono font-semibold">
            {password}
          </dd>
        </div>
      </dl>
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <button
          type="button"
          className={secondary}
          onClick={() => {
            void navigator.clipboard.writeText(password).then(() => {
              setCopied(true);
            });
          }}
        >
          {copied ? <Check size={16} /> : <Copy size={16} />}
          {copied ? "Copiada" : "Copiar clave"}
        </button>
        <button type="button" className={primary} onClick={onClose}>
          Listo
        </button>
      </div>
    </PayableDialog>
  );
}
