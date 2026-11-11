import { useCallback, useState, type FormEvent, type ReactNode } from "react";
import {
  Building2,
  Calculator,
  Check,
  Layers,
  Minus,
  Plus,
  RotateCcw,
  Save,
  Store,
  Users,
} from "lucide-react";
import { formatAmountTyping } from "./lib/amount-typing";
import { lotCostInput, typedCostMinor } from "./lib/lot-cost";
import {
  getPlatformOrganizations,
  getPlatformPlans,
  updatePlatformPlan,
  type PlatformOrganization,
  type PlatformPlan,
} from "./lib/platform-api";
import {
  EJEMPLO_SUCURSALES,
  EJEMPLO_USUARIOS,
  abonoDeEjemplo,
} from "./lib/platform-plan-ejemplo";
import { usePlatformData } from "./lib/use-platform-data";
import { MoneyInput } from "./money-input";
import { PlatformMoneyConfirm } from "./platform-money-confirm";
import {
  PlatformError,
  PlatformLoading,
  PlatformPageHeader,
  PlatformPanel,
} from "./platform-ui";
import { reportCardClass } from "./report-states";
import { StatusToast } from "./status-toast";
import { ars } from "./supplier-payables/api";
import { PayableDialog, primary, secondary } from "./supplier-payables/dialog";

const typed = (minor: string) => formatAmountTyping(lotCostInput(minor));
const plural = (n: number, uno: string, varios: string) =>
  `${n} ${n === 1 ? uno : varios}`;

/** Cuántas farmacias pagan el precio de lista y cuántas uno acordado. */
function usoDelPlan(farmacias: readonly PlatformOrganization[]) {
  const pagan = farmacias.filter(
    ({ subscription }) =>
      subscription &&
      !subscription.exempt &&
      subscription.stage !== "CANCELLED",
  );
  const acordado = pagan.filter(
    ({ subscription }) => subscription!.agreedPriceMinor !== null,
  ).length;
  return { lista: pagan.length - acordado, acordado };
}

/** Tarjeta del plan con los precios vigentes (los guardados). */
function TarjetaDelPlan({
  plan,
  uso,
}: {
  plan: PlatformPlan;
  uso?: { lista: number; acordado: number };
}) {
  const incluye = [
    plural(plan.includedBranches, "sucursal incluida", "sucursales incluidas"),
    plural(plan.includedUsers, "usuario incluido", "usuarios incluidos"),
    "Todos los módulos del sistema",
  ];
  return (
    <aside className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#0a8a79] via-[#087061] to-[#0b4f49] p-6 text-white shadow-[0_18px_40px_-24px_rgb(8_80_70_/_70%)]">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -right-20 -top-24 size-64 rounded-full bg-white/10 blur-3xl"
      />
      <div className="relative">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold uppercase tracking-wide ring-1 ring-inset ring-white/20">
          <Layers size={13} aria-hidden="true" />
          Plan {plan.name}
        </span>
        <p className="mt-5 text-sm text-white/75">Abono base</p>
        <p className="mt-0.5 flex items-baseline gap-1.5">
          <span className="text-4xl font-bold tabular-nums tracking-tight">
            {ars(plan.baseMinor)}
          </span>
          <span className="text-sm text-white/70">/ mes</span>
        </p>
        <ul className="mt-5 space-y-2.5 text-sm">
          {incluye.map((item) => (
            <li key={item} className="flex items-center gap-2.5">
              <span className="grid size-5 shrink-0 place-items-center rounded-full bg-white/20">
                <Check size={12} strokeWidth={3} aria-hidden="true" />
              </span>
              {item}
            </li>
          ))}
        </ul>
        <dl className="mt-6 grid grid-cols-2 gap-3">
          {(
            [
              ["Usuario extra", plan.extraUserMinor],
              ["Sucursal extra", plan.extraBranchMinor],
            ] as const
          ).map(([etiqueta, importe]) => (
            <div
              key={etiqueta}
              className="rounded-xl bg-white/10 px-3 py-2.5 ring-1 ring-inset ring-white/15"
            >
              <dt className="text-xs text-white/70">{etiqueta}</dt>
              <dd className="mt-0.5 font-semibold tabular-nums">
                + {ars(importe)}
              </dd>
            </div>
          ))}
        </dl>
        {uso && (
          <p className="mt-5 border-t border-white/15 pt-4 text-xs leading-5 text-white/75">
            {plural(uso.lista, "farmacia paga", "farmacias pagan")} el precio de
            lista
            {uso.acordado > 0 &&
              ` y ${plural(uso.acordado, "tiene", "tienen")} un precio acordado, que no cambia`}
            .
          </p>
        )}
      </div>
    </aside>
  );
}

/** Una fila de precio: qué es, para qué sirve y el importe. */
function FilaDePrecio({
  icon,
  titulo,
  ayuda,
  value,
  onChange,
  cambiado,
}: {
  icon: ReactNode;
  titulo: string;
  ayuda: string;
  value: string;
  onChange: (value: string) => void;
  cambiado: boolean;
}) {
  return (
    <div className="grid items-center gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_220px]">
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#e8faf5] text-[#087f70]"
        >
          {icon}
        </span>
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            {titulo}
            {cambiado && (
              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 ring-1 ring-inset ring-amber-200">
                Cambiado
              </span>
            )}
          </p>
          <p className="mt-0.5 text-xs leading-5 text-slate-500">{ayuda}</p>
        </div>
      </div>
      <MoneyInput
        label=""
        ariaLabel={titulo}
        labelClassName="block [&>span]:mt-0"
        value={value}
        onChange={onChange}
      />
    </div>
  );
}

function Contador({
  etiqueta,
  valor,
  minimo,
  onChange,
}: {
  etiqueta: string;
  valor: number;
  minimo: number;
  onChange: (valor: number) => void;
}) {
  const botonClase =
    "grid size-8 place-items-center rounded-lg text-slate-600 transition-colors hover:bg-white hover:text-[#087f70] disabled:opacity-40 disabled:hover:bg-transparent";
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-[#e2ebf0] bg-white px-3 py-2">
      <span className="text-sm font-medium text-slate-700">{etiqueta}</span>
      <span className="flex items-center gap-1 rounded-lg bg-slate-50 p-0.5">
        <button
          type="button"
          aria-label={`Menos ${etiqueta.toLowerCase()}`}
          disabled={valor <= minimo}
          onClick={() => onChange(valor - 1)}
          className={botonClase}
        >
          <Minus size={15} aria-hidden="true" />
        </button>
        <output className="w-8 text-center text-sm font-bold tabular-nums text-slate-900">
          {valor}
        </output>
        <button
          type="button"
          aria-label={`Más ${etiqueta.toLowerCase()}`}
          disabled={valor >= 99}
          onClick={() => onChange(valor + 1)}
          className={botonClase}
        >
          <Plus size={15} aria-hidden="true" />
        </button>
      </span>
    </div>
  );
}

function PlanForm({
  token,
  plan,
  uso,
  onSaved,
}: {
  token: string;
  plan: PlatformPlan;
  uso?: { lista: number; acordado: number };
  onSaved: () => void;
}) {
  const inicial = {
    base: typed(plan.baseMinor),
    extraUser: typed(plan.extraUserMinor),
    extraBranch: typed(plan.extraBranchMinor),
  };
  const [base, setBase] = useState(inicial.base);
  const [extraUser, setExtraUser] = useState(inicial.extraUser);
  const [extraBranch, setExtraBranch] = useState(inicial.extraBranch);
  const [sucursales, setSucursales] = useState(
    Math.max(EJEMPLO_SUCURSALES, plan.includedBranches),
  );
  const [usuarios, setUsuarios] = useState(
    Math.max(EJEMPLO_USUARIOS, plan.includedUsers),
  );
  const [prices, setPrices] = useState<{
    baseMinor: string;
    extraUserMinor: string;
    extraBranchMinor: string;
  }>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const cambios = {
    base: base !== inicial.base,
    extraUser: extraUser !== inicial.extraUser,
    extraBranch: extraBranch !== inicial.extraBranch,
  };
  const hayCambios = cambios.base || cambios.extraUser || cambios.extraBranch;
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
  const descartar = () => {
    setBase(inicial.base);
    setExtraUser(inicial.extraUser);
    setExtraBranch(inicial.extraBranch);
    setError("");
  };
  const abono = abonoDeEjemplo(
    plan,
    { base, extraUser, extraBranch },
    { sucursales, usuarios },
  );
  const vigente = abonoDeEjemplo(plan, inicial, { sucursales, usuarios });
  const diferencia =
    abono.filas && vigente.filas
      ? BigInt(abono.totalMinor) - BigInt(vigente.totalMinor)
      : 0n;
  return (
    <div className="grid items-start gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
      <TarjetaDelPlan plan={plan} uso={uso} />
      <form onSubmit={review} className="min-w-0 space-y-5">
        <PlatformPanel
          icon={<Layers size={16} />}
          title="Precios de lista"
          description="Lo que paga una farmacia sin precio acordado."
          bodyClassName="divide-y divide-[#edf2f6] px-5"
        >
          <FilaDePrecio
            icon={<Building2 size={18} />}
            titulo="Abono base"
            ayuda={`Por mes. Incluye ${plural(plan.includedBranches, "sucursal", "sucursales")} y ${plural(plan.includedUsers, "usuario", "usuarios")}.`}
            value={base}
            onChange={setBase}
            cambiado={cambios.base}
          />
          <FilaDePrecio
            icon={<Users size={18} />}
            titulo="Usuario adicional"
            ayuda="Por cada usuario activo por encima de los incluidos."
            value={extraUser}
            onChange={setExtraUser}
            cambiado={cambios.extraUser}
          />
          <FilaDePrecio
            icon={<Store size={18} />}
            titulo="Sucursal adicional"
            ayuda="Por cada sucursal activa por encima de las incluidas."
            value={extraBranch}
            onChange={setExtraBranch}
            cambiado={cambios.extraBranch}
          />
        </PlatformPanel>
        <PlatformPanel
          icon={<Calculator size={16} />}
          title="Calculadora de abono"
          description="Elegí una farmacia y mirá cuánto pagaría con los precios de arriba."
          bodyClassName="grid gap-5 p-5 lg:grid-cols-[minmax(0,260px)_minmax(0,1fr)]"
        >
          <div className="space-y-2.5">
            <Contador
              etiqueta="Sucursales"
              valor={abono.sucursales}
              minimo={plan.includedBranches}
              onChange={setSucursales}
            />
            <Contador
              etiqueta="Usuarios"
              valor={abono.usuarios}
              minimo={plan.includedUsers}
              onChange={setUsuarios}
            />
          </div>
          <div className="rounded-xl border border-[#d8ece5] bg-[#f4fbf8] p-4">
            {abono.filas ? (
              <>
                <dl className="space-y-1.5 text-sm">
                  {abono.filas.map(([concepto, importe]) => (
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
                <p className="mt-3 flex items-end justify-between gap-3 border-t border-[#d8ece5] pt-3">
                  <span>
                    <span className="block text-sm font-semibold text-slate-700">
                      Por mes
                    </span>
                    {diferencia !== 0n && (
                      <span
                        className={`block text-xs font-medium ${diferencia > 0n ? "text-amber-700" : "text-emerald-700"}`}
                      >
                        {diferencia > 0n ? "+" : "−"}{" "}
                        {ars(
                          (diferencia > 0n
                            ? diferencia
                            : -diferencia
                          ).toString(),
                        )}{" "}
                        vs. hoy
                      </span>
                    )}
                  </span>
                  <span className="text-2xl font-bold tabular-nums tracking-tight text-[#087f70]">
                    {ars(abono.totalMinor)}
                  </span>
                </p>
              </>
            ) : (
              <p className="text-sm text-amber-700">
                Completá los importes para calcular el abono.
              </p>
            )}
          </div>
        </PlatformPanel>
        {error && <PlatformError>{error}</PlatformError>}
        <div
          className={`${reportCardClass} flex flex-wrap items-center justify-between gap-3 px-4 py-3`}
        >
          <p className="text-sm text-slate-600">
            {hayCambios ? (
              <span className="inline-flex items-center gap-2 font-medium text-amber-700">
                <span
                  aria-hidden="true"
                  className="size-2 rounded-full bg-amber-500"
                />
                Hay cambios sin guardar
              </span>
            ) : (
              "Los precios nuevos se aplican desde el próximo período de cada farmacia."
            )}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              className={secondary}
              disabled={!hayCambios}
              onClick={descartar}
            >
              <RotateCcw size={16} aria-hidden="true" />
              Descartar
            </button>
            <button className={primary} disabled={!hayCambios}>
              <Save size={16} aria-hidden="true" />
              Guardar precios
            </button>
          </div>
        </div>
      </form>
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
    </div>
  );
}

export function PlatformPlans({
  token,
  onVerificationExpired,
}: {
  token: string;
  onVerificationExpired: () => void;
}) {
  const load = useCallback(
    () =>
      Promise.all([getPlatformPlans(token), getPlatformOrganizations(token)]),
    [token],
  );
  const { data, error, reload } = usePlatformData(load, onVerificationExpired);
  const [notice, setNotice] = useState("");
  const planes = data?.[0];
  // Con un solo plan, todas las farmacias que pagan están en él.
  const uso = data && data[0].length === 1 ? usoDelPlan(data[1]) : undefined;
  return (
    <div className="space-y-5">
      <PlatformPageHeader
        icon={<Layers size={22} />}
        title="Planes"
        description="Precios de lista del abono. Los cambios se aplican desde el próximo período de cada farmacia."
      />
      {error ? (
        <PlatformError>{error}</PlatformError>
      ) : planes ? (
        planes.map((plan) => (
          <PlanForm
            key={`${plan.id}:${plan.baseMinor}:${plan.extraUserMinor}:${plan.extraBranchMinor}`}
            token={token}
            plan={plan}
            uso={uso}
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
