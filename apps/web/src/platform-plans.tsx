import { useCallback, useState, type FormEvent } from "react";
import { Calculator, Layers, Save } from "lucide-react";
import { formatAmountTyping } from "./lib/amount-typing";
import { lotCostInput, typedCostMinor } from "./lib/lot-cost";
import {
  getPlatformPlans,
  updatePlatformPlan,
  type PlatformPlan,
} from "./lib/platform-api";
import { usePlatformData } from "./lib/use-platform-data";
import { abonoDeEjemplo } from "./lib/platform-plan-ejemplo";
import { MoneyInput } from "./money-input";
import { PlatformMoneyConfirm } from "./platform-money-confirm";
import {
  PlatformError,
  PlatformLoading,
  PlatformPageHeader,
  PlatformPanel,
} from "./platform-ui";
import { StatusToast } from "./status-toast";
import { ars } from "./supplier-payables/api";
import { PayableDialog, primary } from "./supplier-payables/dialog";

const typed = (minor: string) => formatAmountTyping(lotCostInput(minor));

function PlanForm({
  token,
  plan,
  onSaved,
}: {
  token: string;
  plan: PlatformPlan;
  onSaved: () => void;
}) {
  const [base, setBase] = useState(typed(plan.baseMinor));
  const [extraUser, setExtraUser] = useState(typed(plan.extraUserMinor));
  const [extraBranch, setExtraBranch] = useState(typed(plan.extraBranchMinor));
  const [prices, setPrices] = useState<{
    baseMinor: string;
    extraUserMinor: string;
    extraBranchMinor: string;
  }>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const review = (event: FormEvent) => {
    event.preventDefault();
    setError("");
    try {
      setPrices({
        baseMinor: typedCostMinor(base),
        extraUserMinor: typedCostMinor(extraUser),
        extraBranchMinor: typedCostMinor(extraBranch),
      });
    } catch {
      setError("Revisá los importes.");
    }
  };
  const save = async () => {
    if (!prices) return;
    setBusy(true);
    try {
      await updatePlatformPlan(token, plan.id, prices);
      setPrices(undefined);
      onSaved();
    } catch (cause) {
      setPrices(undefined);
      setError(
        cause instanceof Error ? cause.message : "No se pudo guardar el plan.",
      );
    } finally {
      setBusy(false);
    }
  };
  const ejemplo = abonoDeEjemplo(plan, { base, extraUser, extraBranch });
  return (
    <form onSubmit={review}>
      <PlatformPanel
        icon={<Layers size={16} />}
        title={plan.name}
        description={`Incluye ${plan.includedBranches} ${plan.includedBranches === 1 ? "sucursal" : "sucursales"} y ${plan.includedUsers} ${plan.includedUsers === 1 ? "usuario" : "usuarios"}. Vale salvo que la farmacia tenga un precio acordado.`}
        className="max-w-5xl"
        bodyClassName="grid gap-6 p-5 lg:grid-cols-[minmax(0,1fr)_320px]"
      >
        <div className="min-w-0 [&>label:first-child]:mt-0">
          <MoneyInput label="Abono base" value={base} onChange={setBase} />
          <MoneyInput
            label="Por cada usuario adicional"
            value={extraUser}
            onChange={setExtraUser}
          />
          <MoneyInput
            label="Por cada sucursal adicional"
            value={extraBranch}
            onChange={setExtraBranch}
          />
          {error && (
            <div className="mt-4">
              <PlatformError>{error}</PlatformError>
            </div>
          )}
          <div className="mt-5 flex justify-end">
            <button className={primary}>
              <Save size={16} aria-hidden="true" />
              Guardar precios
            </button>
          </div>
        </div>
        <aside className="rounded-xl border border-[#d8ece5] bg-[#f4fbf8] p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-[#0b6b5f]">
            <Calculator size={16} aria-hidden="true" />
            Así queda un abono
          </p>
          <p className="mt-1 text-xs leading-5 text-slate-600">
            Una farmacia con {ejemplo.sucursales} sucursales y{" "}
            {ejemplo.usuarios} usuarios.
          </p>
          {ejemplo.filas ? (
            <>
              <dl className="mt-3 space-y-1.5 text-sm">
                {ejemplo.filas.map(([concepto, importe]) => (
                  <div
                    key={concepto}
                    className="flex items-baseline justify-between gap-3"
                  >
                    <dt className="text-slate-600">{concepto}</dt>
                    <dd className="font-medium tabular-nums text-slate-800">
                      {ars(importe)}
                    </dd>
                  </div>
                ))}
              </dl>
              <p className="mt-3 flex items-baseline justify-between gap-3 border-t border-[#d8ece5] pt-3">
                <span className="text-sm font-semibold text-slate-700">
                  Por mes
                </span>
                <span className="text-xl font-bold tabular-nums tracking-tight text-[#087f70]">
                  {ars(ejemplo.totalMinor)}
                </span>
              </p>
            </>
          ) : (
            <p className="mt-3 text-sm text-amber-700">
              Completá los importes para ver el ejemplo.
            </p>
          )}
        </aside>
      </PlatformPanel>
      {prices && (
        <PayableDialog
          title="Guardar precios"
          confirmationLabel="Confirmar precios"
          onClose={() => {
            if (!busy) setPrices(undefined);
          }}
          confirmation={
            <PlatformMoneyConfirm
              question="¿Guardás estos precios?"
              rows={[
                ["Abono base", ars(prices.baseMinor)],
                ["Usuario adicional", ars(prices.extraUserMinor)],
                ["Sucursal adicional", ars(prices.extraBranchMinor)],
              ]}
              busy={busy}
              onBack={() => setPrices(undefined)}
              onConfirm={() => void save()}
            />
          }
        >
          {null}
        </PayableDialog>
      )}
    </form>
  );
}

export function PlatformPlans({
  token,
  onVerificationExpired,
}: {
  token: string;
  onVerificationExpired: () => void;
}) {
  const load = useCallback(() => getPlatformPlans(token), [token]);
  const { data, error, reload } = usePlatformData(load, onVerificationExpired);
  const [notice, setNotice] = useState("");
  return (
    <div className="space-y-5">
      <PlatformPageHeader
        icon={<Layers size={22} />}
        title="Planes"
        description="Precios de lista del abono. Los precios nuevos se aplican desde el próximo período de cada farmacia."
      />
      {error ? (
        <PlatformError>{error}</PlatformError>
      ) : data ? (
        data.map((plan) => (
          <PlanForm
            key={`${plan.id}:${plan.baseMinor}:${plan.extraUserMinor}:${plan.extraBranchMinor}`}
            token={token}
            plan={plan}
            onSaved={() => {
              setNotice("Precios actualizados.");
              reload();
            }}
          />
        ))
      ) : (
        <PlatformLoading>Cargando planes…</PlatformLoading>
      )}
      {notice && <StatusToast message={notice} onClose={() => setNotice("")} />}
    </div>
  );
}
