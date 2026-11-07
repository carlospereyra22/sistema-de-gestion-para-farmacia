import { useCallback, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, KeyRound, Plus, ShieldCheck, UserPlus } from "lucide-react";
import {
  DataTable,
  DataTableCell,
  DataTableEmpty,
  DataTableRow,
  StatusLabel,
} from "./data-table";
import { formatAmountTyping } from "./lib/amount-typing";
import { lotCostInput, typedCostMinor } from "./lib/lot-cost";
import {
  addPlatformBranch,
  addPlatformUser,
  getPlatformOrganization,
  resetPlatformUserPassword,
  updatePlatformSubscription,
  type PlatformOrganizationDetail as Detail,
  type PlatformTemporaryAccess,
} from "./lib/platform-api";
import {
  coveredUntilLabel,
  quotaFull,
  stageLabel,
  stageTone,
  usageLabel,
} from "./lib/platform-subscription";
import { usePlatformData } from "./lib/use-platform-data";
import { MoneyInput } from "./money-input";
import { OperationConfirmDialog } from "./operation-confirm-dialog";
import { PlatformBillingSection } from "./platform-billing";
import { PlatformCredentialsDialog } from "./platform-credentials-dialog";
import { PlatformMoneyConfirm } from "./platform-money-confirm";
import { ProductFilterSelect } from "./product-filter-select";
import { StatusToast } from "./status-toast";
import { ars } from "./supplier-payables/api";
import {
  PayableDialog,
  field,
  primary,
  secondary,
} from "./supplier-payables/dialog";

function AddUserDialog({
  token,
  organization,
  onAdded,
  onClose,
}: {
  token: string;
  organization: Detail;
  onAdded: (access: PlatformTemporaryAccess) => void;
  onClose: () => void;
}) {
  const pending = useRef(false);
  const roles = organization.roles.filter(({ code }) => code !== "OWNER");
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [roleCode, setRoleCode] = useState(
    roles.find(({ code }) => code === "EMPLEADO")?.code ?? roles[0]?.code ?? "",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      onAdded(
        await addPlatformUser(token, organization.id, {
          email,
          displayName,
          roleCode,
        }),
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "No se pudo crear el usuario.",
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  return (
    <PayableDialog
      title={`Nuevo usuario en ${organization.name}`}
      onClose={() => {
        if (!pending.current) onClose();
      }}
    >
      <form onSubmit={(event) => void save(event)}>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm sm:col-span-2">
            Correo
            <input
              required
              type="email"
              maxLength={200}
              value={email}
              disabled={busy}
              onChange={(event) => setEmail(event.target.value)}
              className={`${field} mt-1`}
            />
          </label>
          <label className="block text-sm">
            Nombre
            <input
              maxLength={120}
              value={displayName}
              disabled={busy}
              onChange={(event) => setDisplayName(event.target.value)}
              className={`${field} mt-1`}
            />
          </label>
          <div className="text-sm">
            <p className="mb-1">Rol</p>
            <ProductFilterSelect
              compact
              label="Rol"
              value={roleCode}
              options={roles.map(({ code, name }) => ({
                value: code,
                label: name,
              }))}
              icon={<ShieldCheck size={16} />}
              onChange={setRoleCode}
            />
          </div>
        </div>
        {error && (
          <p role="alert" className="mt-4 text-sm text-red-700">
            {error}
          </p>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            disabled={busy}
            className={secondary}
            onClick={onClose}
          >
            Cancelar
          </button>
          <button disabled={busy} className={primary}>
            {busy ? "Creando…" : "Crear usuario"}
          </button>
        </div>
      </form>
    </PayableDialog>
  );
}

function AddBranchDialog({
  token,
  organization,
  onAdded,
  onClose,
}: {
  token: string;
  organization: Detail;
  onAdded: () => void;
  onClose: () => void;
}) {
  const pending = useRef(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      await addPlatformBranch(token, organization.id, { name });
      onAdded();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No se pudo crear la sucursal.",
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  return (
    <PayableDialog
      title={`Nueva sucursal en ${organization.name}`}
      onClose={() => {
        if (!pending.current) onClose();
      }}
    >
      <form onSubmit={(event) => void save(event)}>
        <label className="block text-sm">
          Nombre
          <input
            required
            minLength={2}
            maxLength={120}
            value={name}
            disabled={busy}
            onChange={(event) => setName(event.target.value)}
            className={`${field} mt-1`}
          />
        </label>
        <p className="mt-3 text-sm text-slate-500">
          Se asigna a los dueños de la farmacia. Los demás usuarios se suman
          desde Administración.
        </p>
        {error && (
          <p role="alert" className="mt-4 text-sm text-red-700">
            {error}
          </p>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            disabled={busy}
            className={secondary}
            onClick={onClose}
          >
            Cancelar
          </button>
          <button disabled={busy} className={primary}>
            {busy ? "Creando…" : "Crear sucursal"}
          </button>
        </div>
      </form>
    </PayableDialog>
  );
}

function SubscriptionForm({
  token,
  organization,
  onSaved,
}: {
  token: string;
  organization: Detail;
  onSaved: () => void;
}) {
  const subscription = organization.subscription!;
  const [extraUsers, setExtraUsers] = useState(String(subscription.extraUsers));
  const [extraBranches, setExtraBranches] = useState(
    String(subscription.extraBranches),
  );
  const [agreed, setAgreed] = useState(
    subscription.agreedPriceMinor === null
      ? ""
      : formatAmountTyping(lotCostInput(subscription.agreedPriceMinor)),
  );
  const [contactName, setContactName] = useState(
    subscription.contactName ?? "",
  );
  const [contactPhone, setContactPhone] = useState(
    subscription.contactPhone ?? "",
  );
  const [contactEmail, setContactEmail] = useState(
    subscription.contactEmail ?? "",
  );
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const agreedMinor = () => (agreed.trim() ? typedCostMinor(agreed) : null);
  const review = (event: FormEvent) => {
    event.preventDefault();
    setError("");
    try {
      agreedMinor();
      setConfirming(true);
    } catch {
      setError("Revisá el precio acordado.");
    }
  };
  const save = async () => {
    setBusy(true);
    try {
      await updatePlatformSubscription(token, organization.id, {
        extraUsers: Number(extraUsers),
        extraBranches: Number(extraBranches),
        agreedPriceMinor: agreedMinor(),
        contactName,
        contactPhone,
        contactEmail,
      });
      setConfirming(false);
      onSaved();
    } catch (cause) {
      setConfirming(false);
      setError(
        cause instanceof Error ? cause.message : "No se pudo guardar el plan.",
      );
    } finally {
      setBusy(false);
    }
  };
  const agreedValue = agreedMinor;
  return (
    <form
      onSubmit={review}
      className="rounded-xl border border-slate-200 bg-white p-5"
    >
      <h2 className="font-semibold">Plan contratado</h2>
      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        <label className="block text-sm">
          Usuarios adicionales
          <input
            required
            type="number"
            min={0}
            max={1000}
            value={extraUsers}
            onChange={(event) => setExtraUsers(event.target.value)}
            className={`${field} mt-1`}
          />
        </label>
        <label className="block text-sm">
          Sucursales adicionales
          <input
            required
            type="number"
            min={0}
            max={1000}
            value={extraBranches}
            onChange={(event) => setExtraBranches(event.target.value)}
            className={`${field} mt-1`}
          />
        </label>
      </div>
      <MoneyInput
        label="Precio acordado"
        value={agreed}
        required={false}
        onChange={setAgreed}
      />
      <p className="mt-1 text-xs text-slate-500">
        Si lo dejás vacío, se usa la fórmula del plan.
      </p>
      <h2 className="mt-5 font-semibold">Contacto</h2>
      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        <label className="block text-sm">
          Nombre
          <input
            maxLength={120}
            value={contactName}
            onChange={(event) => setContactName(event.target.value)}
            className={`${field} mt-1`}
          />
        </label>
        <label className="block text-sm">
          Teléfono
          <input
            maxLength={60}
            value={contactPhone}
            onChange={(event) => setContactPhone(event.target.value)}
            className={`${field} mt-1`}
          />
        </label>
        <label className="block text-sm sm:col-span-2">
          Correo
          <input
            type="email"
            maxLength={200}
            value={contactEmail}
            onChange={(event) => setContactEmail(event.target.value)}
            className={`${field} mt-1`}
          />
        </label>
      </div>
      {error && (
        <p role="alert" className="mt-4 text-sm text-red-700">
          {error}
        </p>
      )}
      <div className="mt-5 flex justify-end">
        <button className={primary}>Guardar cambios</button>
      </div>
      {confirming && (
        <PayableDialog
          title="Guardar cambios"
          confirmationLabel="Confirmar cambios"
          onClose={() => {
            if (!busy) setConfirming(false);
          }}
          confirmation={
            <PlatformMoneyConfirm
              question="¿Guardás este plan?"
              rows={[
                ["Farmacia", organization.name],
                ["Usuarios adicionales", extraUsers],
                ["Sucursales adicionales", extraBranches],
                [
                  "Precio",
                  agreedValue() === null
                    ? "Según la fórmula del plan"
                    : `${ars(agreedValue()!)} acordado`,
                ],
              ]}
              busy={busy}
              onBack={() => setConfirming(false)}
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

export function PlatformOrganizationDetail({
  token,
  organizationId,
  backLabel = "Volver a Farmacias",
  onVerificationExpired,
  onBack,
}: {
  token: string;
  organizationId: string;
  backLabel?: string;
  onVerificationExpired: () => void;
  onBack: () => void;
}) {
  const load = useCallback(
    () => getPlatformOrganization(token, organizationId),
    [token, organizationId],
  );
  const { data, error, reload } = usePlatformData(load, onVerificationExpired);
  const [adding, setAdding] = useState(false);
  const [addingBranch, setAddingBranch] = useState(false);
  const [resetting, setResetting] = useState<Detail["users"][number]>();
  const [access, setAccess] = useState<PlatformTemporaryAccess>();
  const [notice, setNotice] = useState("");

  const back = (
    <button type="button" className={secondary} onClick={onBack}>
      <ArrowLeft size={16} />
      {backLabel}
    </button>
  );
  if (error)
    return (
      <>
        {back}
        <p role="alert" className="mt-4 text-sm text-red-700">
          {error}
        </p>
      </>
    );
  if (!data)
    return (
      <>
        {back}
        <p role="status" className="mt-4 text-sm text-slate-500">
          Cargando farmacia…
        </p>
      </>
    );
  const subscription = data.subscription;
  const activeUsers = data.users.filter(({ active }) => active).length;
  const activeBranches = data.branches.filter(({ active }) => active).length;
  const usersFull =
    !!subscription &&
    quotaFull(activeUsers, subscription.quota.users, subscription.exempt);
  const branchesFull =
    !!subscription &&
    quotaFull(activeBranches, subscription.quota.branches, subscription.exempt);
  return (
    <>
      {back}
      <div className="mt-4 flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-2xl font-semibold">{data.name}</h1>
        {subscription && (
          <StatusLabel large tone={stageTone(subscription.stage)}>
            {stageLabel(subscription.stage)}
            {subscription.daysOverdue > 0 &&
              ` · ${subscription.daysOverdue} días de atraso`}
          </StatusLabel>
        )}
      </div>
      {subscription && (
        <dl className="mt-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
          {[
            ["Abono mensual", ars(subscription.feeMinor)],
            ["Cubierta hasta", coveredUntilLabel(subscription)],
            [
              "Usuarios",
              usageLabel(
                activeUsers,
                subscription.quota.users,
                subscription.exempt,
                " de ",
              ),
            ],
            [
              "Sucursales",
              usageLabel(
                activeBranches,
                subscription.quota.branches,
                subscription.exempt,
                " de ",
              ),
            ],
          ].map(([label, value]) => (
            <div
              key={label}
              className="rounded-xl border border-slate-200 bg-white px-4 py-3"
            >
              <dt className="text-sm text-slate-500">{label}</dt>
              <dd className="mt-0.5 text-xl font-semibold">{value}</dd>
            </div>
          ))}
        </dl>
      )}
      {subscription && !subscription.exempt && (
        <PlatformBillingSection
          token={token}
          organization={{ ...data, subscription }}
          onChanged={(message) => {
            setNotice(message);
            reload();
          }}
        />
      )}
      <div className="mt-4 grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <section className="min-w-0">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="font-semibold">Usuarios</h2>
            <button
              type="button"
              disabled={usersFull}
              className={secondary}
              onClick={() => setAdding(true)}
            >
              <UserPlus size={16} />
              Nuevo usuario
            </button>
          </div>
          {usersFull && (
            <p className="mb-3 text-sm text-amber-700">
              Cupo completo: sumá usuarios adicionales en el plan contratado.
            </p>
          )}
          <DataTable
            label="Usuarios de la farmacia"
            minWidthClass="min-w-160"
            columns={[
              { label: "Correo" },
              { label: "Rol" },
              { label: "Estado" },
              { label: "", align: "right" },
            ]}
          >
            {data.users.length === 0 ? (
              <DataTableEmpty colSpan={4}>
                Esta farmacia no tiene usuarios.
              </DataTableEmpty>
            ) : (
              data.users.map((user) => (
                <DataTableRow key={user.id}>
                  <DataTableCell className="font-medium text-slate-900">
                    {user.email}
                    {user.displayName && (
                      <span className="block text-xs font-normal text-slate-500">
                        {user.displayName}
                      </span>
                    )}
                  </DataTableCell>
                  <DataTableCell>
                    {user.roles.map(({ name }) => name).join(", ") || "Sin rol"}
                  </DataTableCell>
                  <DataTableCell>
                    <StatusLabel tone={user.active ? "ok" : "muted"}>
                      {!user.active
                        ? "Inactivo"
                        : user.mustChangePassword
                          ? "Debe cambiar la clave"
                          : "Activo"}
                    </StatusLabel>
                  </DataTableCell>
                  <DataTableCell align="right">
                    <button
                      type="button"
                      aria-label={`Resetear la clave de ${user.email}`}
                      title="Resetear clave"
                      className="rounded-lg p-2 text-slate-500 hover:bg-teal-50 hover:text-teal-800"
                      onClick={() => setResetting(user)}
                    >
                      <KeyRound size={16} />
                    </button>
                  </DataTableCell>
                </DataTableRow>
              ))
            )}
          </DataTable>
          <div className="mb-3 mt-5 flex items-center justify-between gap-3">
            <h2 className="font-semibold">Sucursales</h2>
            <button
              type="button"
              disabled={branchesFull}
              className={secondary}
              onClick={() => setAddingBranch(true)}
            >
              <Plus size={16} />
              Nueva sucursal
            </button>
          </div>
          {branchesFull && (
            <p className="mb-3 text-sm text-amber-700">
              Cupo completo: sumá sucursales adicionales en el plan contratado.
            </p>
          )}
          <DataTable
            label="Sucursales de la farmacia"
            columns={[{ label: "Nombre" }, { label: "Estado" }]}
          >
            {data.branches.map((branch) => (
              <DataTableRow key={branch.id}>
                <DataTableCell>{branch.name}</DataTableCell>
                <DataTableCell>
                  <StatusLabel tone={branch.active ? "ok" : "muted"}>
                    {branch.active ? "Activa" : "Inactiva"}
                  </StatusLabel>
                </DataTableCell>
              </DataTableRow>
            ))}
          </DataTable>
        </section>
        {subscription && (
          <SubscriptionForm
            key={subscription.feeMinor + subscription.contactName}
            token={token}
            organization={data}
            onSaved={() => {
              setNotice("Plan actualizado.");
              reload();
            }}
          />
        )}
      </div>
      {addingBranch && (
        <AddBranchDialog
          token={token}
          organization={data}
          onClose={() => setAddingBranch(false)}
          onAdded={() => {
            setAddingBranch(false);
            setNotice("Sucursal creada.");
            reload();
          }}
        />
      )}
      {adding && (
        <AddUserDialog
          token={token}
          organization={data}
          onClose={() => setAdding(false)}
          onAdded={(result) => {
            setAdding(false);
            setAccess(result);
            reload();
          }}
        />
      )}
      {resetting && (
        <OperationConfirmDialog
          title="Resetear clave"
          description={`Se va a generar una clave temporal para ${resetting.email} y se cerrarán sus sesiones. Al entrar tendrá que cambiarla.`}
          onClose={() => setResetting(undefined)}
          onConfirm={async () => {
            const result = await resetPlatformUserPassword(
              token,
              data.id,
              resetting.id,
            );
            setResetting(undefined);
            setAccess(result);
            reload();
          }}
        />
      )}
      {access && (
        <PlatformCredentialsDialog
          title="Clave temporal"
          email={access.email}
          password={access.temporaryPassword}
          onClose={() => setAccess(undefined)}
        />
      )}
      {notice && <StatusToast message={notice} onClose={() => setNotice("")} />}
    </>
  );
}
