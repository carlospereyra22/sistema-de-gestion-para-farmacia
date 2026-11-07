import { useRef, useState, type FormEvent } from "react";
import {
  createPlatformOrganization,
  type PlatformOrganizationCreated,
} from "./lib/platform-api";
import {
  PayableDialog,
  field,
  primary,
  secondary,
} from "./supplier-payables/dialog";

/** Alta de una farmacia con su dueño: la API crea todo o nada. */
export function PlatformOrganizationDialog({
  token,
  onCreated,
  onClose,
}: {
  token: string;
  onCreated: (created: PlatformOrganizationCreated) => void;
  onClose: () => void;
}) {
  const pending = useRef(false);
  const [organizationName, setOrganizationName] = useState("");
  const [branchName, setBranchName] = useState("Casa Central");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [trialDays, setTrialDays] = useState("14");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      onCreated(
        await createPlatformOrganization(token, {
          organizationName,
          branchName,
          ownerEmail,
          trialDays: Number(trialDays),
          contactName,
          contactPhone,
        }),
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No se pudo crear la farmacia.",
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  return (
    <PayableDialog
      title="Nueva farmacia"
      onClose={() => {
        if (!pending.current) onClose();
      }}
    >
      <form onSubmit={(event) => void save(event)}>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm sm:col-span-2">
            Nombre de la farmacia
            <input
              required
              minLength={2}
              maxLength={200}
              value={organizationName}
              disabled={busy}
              onChange={(event) => setOrganizationName(event.target.value)}
              className={`${field} mt-1`}
            />
          </label>
          <label className="block text-sm">
            Sucursal principal
            <input
              required
              minLength={2}
              maxLength={200}
              value={branchName}
              disabled={busy}
              onChange={(event) => setBranchName(event.target.value)}
              className={`${field} mt-1`}
            />
          </label>
          <label className="block text-sm">
            Días de prueba
            <input
              required
              type="number"
              min={0}
              max={90}
              value={trialDays}
              disabled={busy}
              onChange={(event) => setTrialDays(event.target.value)}
              className={`${field} mt-1`}
            />
          </label>
          <label className="block text-sm sm:col-span-2">
            Correo del dueño
            <input
              required
              type="email"
              maxLength={200}
              value={ownerEmail}
              disabled={busy}
              onChange={(event) => setOwnerEmail(event.target.value)}
              className={`${field} mt-1`}
            />
          </label>
          <label className="block text-sm">
            Contacto
            <input
              maxLength={120}
              value={contactName}
              disabled={busy}
              onChange={(event) => setContactName(event.target.value)}
              className={`${field} mt-1`}
            />
          </label>
          <label className="block text-sm">
            Teléfono
            <input
              maxLength={60}
              value={contactPhone}
              disabled={busy}
              onChange={(event) => setContactPhone(event.target.value)}
              className={`${field} mt-1`}
            />
          </label>
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
            {busy ? "Creando…" : "Crear farmacia"}
          </button>
        </div>
      </form>
    </PayableDialog>
  );
}
