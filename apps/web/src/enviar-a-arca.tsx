import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Send, UserRound, X } from "lucide-react";
import type {
  SaleFiscalCapabilities,
  SaleFiscalOptions,
} from "@gestion/contracts";
import { ConsumerFiscalFields } from "./consumer-fiscal-fields";
import { ProductFilterSelect } from "./product-filter-select";
import { invoiceInternalSale, type Sale } from "./lib/api";
import { motivoParaNoEnviarAArca } from "./lib/enviar-a-arca";
import { defaultSaleFiscalOptions } from "./lib/sale-fiscal-options";

const pesos = (minor: string) =>
  (Number(minor) / 100).toLocaleString("es-AR", {
    style: "currency",
    currency: "ARS",
  });
const fechaYHora = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleString("es-AR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      })
    : "—";

/**
 * Botón "Enviar a ARCA" del detalle de una venta hecha con comprobante interno
 * (SISTEMA-65): emite su factura C a mano, con confirmación, hasta 30 días
 * después. Nunca se hace solo.
 */
export function EnviarAArca({
  token,
  organizationId,
  branchId,
  sale,
  capabilities,
  customerName,
  onSent,
}: {
  token: string;
  organizationId: string;
  branchId: string;
  sale: Sale;
  capabilities: SaleFiscalCapabilities | null | undefined;
  customerName?: string;
  onSent: () => void;
}) {
  const [abierto, setAbierto] = useState(false);
  if (sale.status !== "COMPLETED" || sale.documentType !== "INTERNAL")
    return null;
  const motivo = motivoParaNoEnviarAArca(sale, capabilities, Date.now());
  return (
    <div>
      <button
        type="button"
        disabled={Boolean(motivo)}
        title={motivo ?? "Emitir la factura C de esta venta"}
        onClick={() => setAbierto(true)}
        className="flex min-h-10 w-full items-center justify-center gap-2 rounded-lg border border-teal-200 bg-white px-3 py-2 text-sm font-medium text-teal-700 hover:bg-teal-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Send size={16} aria-hidden="true" />
        Enviar a ARCA
      </button>
      {motivo && <p className="mt-1 text-xs text-slate-500">{motivo}</p>}
      {abierto && capabilities && (
        <ConfirmarEnvio
          token={token}
          organizationId={organizationId}
          branchId={branchId}
          sale={sale}
          environment={capabilities.environment}
          customerName={customerName}
          onClose={() => setAbierto(false)}
          onSent={() => {
            setAbierto(false);
            onSent();
          }}
        />
      )}
    </div>
  );
}

function ConfirmarEnvio({
  token,
  organizationId,
  branchId,
  sale,
  environment,
  customerName,
  onClose,
  onSent,
}: {
  token: string;
  organizationId: string;
  branchId: string;
  sale: Sale;
  environment: SaleFiscalCapabilities["environment"];
  customerName?: string;
  onClose: () => void;
  onSent: () => void;
}) {
  const id = useId();
  // <dialog> modal propio: queda delante del detalle de la venta.
  const dialog = useRef<HTMLDialogElement>(null);
  const pending = useRef(false);
  const [opciones, setOpciones] = useState<SaleFiscalOptions>(
    defaultSaleFiscalOptions,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
    return () => {
      if (element?.open) element.close();
    };
  }, []);
  const enviar = async () => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      await invoiceInternalSale(token, organizationId, branchId, sale.id, {
        fiscalEnvironment: environment,
        fiscalOptions:
          opciones.recipient === "CUSTOMER"
            ? { recipient: "CUSTOMER", voucherType: opciones.voucherType }
            : {
                ...opciones,
                consumerName: opciones.consumerName?.trim() || undefined,
                consumerDocument: opciones.consumerDocument || undefined,
              },
      });
      onSent();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "No se pudo enviar a ARCA.",
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  return createPortal(
    <dialog
      ref={dialog}
      aria-labelledby={`${id}-titulo`}
      onCancel={(event) => {
        event.preventDefault();
        if (!pending.current) onClose();
      }}
      className="m-auto max-h-[90dvh] w-[min(480px,calc(100%-2rem))] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 text-slate-800 shadow-xl backdrop:bg-slate-950/35"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 id={`${id}-titulo`} className="text-base font-semibold">
          Enviar a ARCA
        </h2>
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          aria-label="Cerrar"
          className="rounded-lg p-2 hover:bg-slate-100 disabled:opacity-50"
        >
          <X size={18} />
        </button>
      </div>
      <dl className="mt-4 space-y-2 rounded-xl bg-slate-50 p-4 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-slate-500">Venta</dt>
          <dd>{fechaYHora(sale.completedAt)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-slate-500">Total</dt>
          <dd className="font-semibold">{pesos(sale.totalMinor)}</dd>
        </div>
      </dl>
      <p className="mt-3 text-xs leading-relaxed text-slate-600">
        Se emite la factura C con la fecha de hoy. La venta conserva su fecha y
        queda marcada como facturada después. Si el cobro todavía no entró a una
        caja, la factura espera a que lo incorpores.
      </p>
      {environment === "HOMOLOGATION" && (
        <p className="mt-2 text-xs font-medium text-amber-700">
          Homologación · Sin validez fiscal
        </p>
      )}
      <div className="mt-4">
        <ProductFilterSelect
          compact
          label="Receptor"
          value={opciones.recipient}
          icon={<UserRound size={16} aria-hidden="true" />}
          options={[
            { value: "FINAL_CONSUMER", label: "Consumidor final" },
            ...(customerName
              ? [
                  {
                    value: "CUSTOMER",
                    label: `Datos fiscales del cliente · ${customerName}`,
                  },
                ]
              : []),
          ]}
          onChange={(value) =>
            setOpciones({
              ...opciones,
              recipient: value as SaleFiscalOptions["recipient"],
            })
          }
        />
      </div>
      {opciones.recipient === "FINAL_CONSUMER" && (
        <ConsumerFiscalFields value={opciones} onChange={setOpciones} />
      )}
      {error && (
        <p
          role="alert"
          className="mt-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-700"
        >
          {error}
        </p>
      )}
      <footer className="mt-5 flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          className="rounded-lg border px-4 py-2 text-sm disabled:opacity-50"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={() => void enviar()}
          disabled={busy}
          className="rounded-lg bg-teal-700 px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          {busy ? "Enviando…" : "Sí, enviar a ARCA"}
        </button>
      </footer>
    </dialog>,
    document.body,
  );
}
