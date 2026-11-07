import { useCallback, useState, type FormEvent } from "react";
import { formatAmountTyping } from "./lib/amount-typing";
import { lotCostInput, typedCostMinor } from "./lib/lot-cost";
import {
  getPlatformPlans,
  updatePlatformPlan,
  type PlatformPlan,
} from "./lib/platform-api";
import { usePlatformData } from "./lib/use-platform-data";
import { MoneyInput } from "./money-input";
import { PlatformMoneyConfirm } from "./platform-money-confirm";
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
  return (
    <form
      onSubmit={review}
      className="max-w-xl rounded-xl border border-slate-200 bg-white p-5"
    >
      <h2 className="font-semibold">{plan.name}</h2>
      <p className="mt-1 text-sm text-slate-500">
        Incluye {plan.includedBranches} sucursal y {plan.includedUsers} usuario.
        El abono se calcula con esta fórmula, salvo que la farmacia tenga un
        precio acordado.
      </p>
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
        <p role="alert" className="mt-4 text-sm text-red-700">
          {error}
        </p>
      )}
      <div className="mt-5 flex justify-end">
        <button className={primary}>Guardar precios</button>
      </div>
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
    <>
      <h1 className="text-2xl font-semibold">Planes</h1>
      <p className="mt-1 text-sm text-slate-500">
        Los precios nuevos se aplican desde el próximo período de cada farmacia.
      </p>
      <div className="mt-4 space-y-4">
        {error ? (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
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
          <p role="status" className="text-sm text-slate-500">
            Cargando planes…
          </p>
        )}
      </div>
      {notice && <StatusToast message={notice} onClose={() => setNotice("")} />}
    </>
  );
}
