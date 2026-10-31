import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Building2,
  MoreHorizontal,
  Pencil,
  ReceiptText,
  Users,
  X,
} from "lucide-react";
import { OrganizationTicketSettings } from "./organization-ticket-settings";
import { FiscalSettingsPanel } from "./fiscal-settings";
import { UserTicketNameDialog } from "./user-ticket-names";
import {
  changeBranchStatus,
  createBranch,
  getBranches,
  getUsers,
  updateBranch,
  type BranchInput,
  type BranchListItem,
  type UserListItem,
} from "./lib/api";
import type { OrganizationTab } from "./lib/workspace-location";

const card = "rounded-xl border border-slate-200 bg-white p-5 shadow-sm";
const secondary =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-teal-700 hover:bg-teal-50 disabled:opacity-50";
const primary =
  "inline-flex items-center justify-center gap-2 rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-50";
const emptyBranch = {
  name: "",
  code: "",
  address: "",
  city: "",
  province: "",
  phone: "",
};
const fields = [
  ["name", "Nombre", 120],
  ["code", "Código", 32],
  ["address", "Dirección", 160],
  ["city", "Ciudad", 100],
  ["province", "Provincia", 100],
  ["phone", "Teléfono", 40],
] as const;
const errorText = (cause: unknown) =>
  cause instanceof Error ? cause.message : "No se pudo completar la operación.";

export function OrganizationWorkspace({
  token,
  organizationId,
  tab,
  onTabChange,
  onBranchesChange,
  onNameChange,
  onLogoSaved,
  onUsers,
}: {
  token: string;
  organizationId: string;
  tab: OrganizationTab;
  onTabChange: (tab: OrganizationTab) => void;
  onBranchesChange: (branches: BranchListItem[]) => void;
  onNameChange: (name: string) => void;
  onLogoSaved?: () => void;
  onUsers: () => void;
}) {
  return (
    <div className="mt-2 min-w-0">
      <p className="text-sm text-slate-500">
        Administrá los datos de tu organización, sus sucursales y comprobantes.
      </p>
      <nav
        aria-label="Secciones de organización"
        className="mt-5 mb-6 flex w-fit max-w-full gap-1 overflow-x-auto rounded-xl bg-slate-200/50 p-1.5"
      >
        {(
          [
            ["general", "Datos generales"],
            ["fiscal", "Facturación"],
            ["branches", "Sucursales"],
            ["tickets", "Tickets y comprobantes"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-current={tab === id ? "page" : undefined}
            onClick={() => onTabChange(id)}
            className={`inline-flex shrink-0 items-center gap-2 rounded-lg px-4 py-2.5 text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 ${tab === id ? "bg-white font-semibold text-teal-700 shadow-sm" : "text-slate-500 hover:bg-white/60 hover:text-teal-700"}`}
          >
            {id === "tickets" ? (
              <ReceiptText size={16} />
            ) : (
              <Building2 size={16} />
            )}
            {label}
          </button>
        ))}
      </nav>
      {/* Keep the shared editor mounted: switching tabs cannot discard a logo or unsaved data. */}
      <div hidden={tab === "branches" || tab === "fiscal"}>
        <OrganizationTicketSettings
          token={token}
          organizationId={organizationId}
          variant={tab === "general" ? "general" : "tickets"}
          onSaved={(data) => {
            onNameChange(data.name);
            onLogoSaved?.();
          }}
        />
      </div>
      <div hidden={tab !== "fiscal"}>
        <FiscalSettingsPanel token={token} organizationId={organizationId} />
      </div>
      {tab === "general" && (
        <div className="mt-5 grid gap-5 md:grid-cols-2">
          <section className={`${card} flex items-start gap-4 bg-teal-50/40`}>
            <Building2 className="size-11 shrink-0 rounded-xl bg-teal-100 p-2.5 text-teal-700" />
            <div>
              <h2 className="font-semibold">Sucursales</h2>
              <p className="mt-1 mb-4 text-sm text-slate-500">
                Direcciones, contacto y administración de tus locales.
              </p>
              <button
                className={secondary}
                onClick={() => onTabChange("branches")}
              >
                Ir a sucursales <ArrowRight size={15} />
              </button>
            </div>
          </section>
          <section className={`${card} flex items-start gap-4 bg-sky-50/40`}>
            <ReceiptText className="size-11 shrink-0 rounded-xl bg-sky-100 p-2.5 text-sky-700" />
            <div>
              <h2 className="font-semibold">Tickets y comprobantes</h2>
              <p className="mt-1 mb-4 text-sm text-slate-500">
                Encabezado, logo y nombre de quien atiende.
              </p>
              <button
                className={secondary}
                onClick={() => onTabChange("tickets")}
              >
                Configurar tickets <ArrowRight size={15} />
              </button>
            </div>
          </section>
        </div>
      )}
      <div hidden={tab !== "branches"}>
        <OrganizationBranches
          token={token}
          organizationId={organizationId}
          onChange={onBranchesChange}
        />
      </div>
      {tab === "tickets" && (
        <TicketAttendants
          token={token}
          organizationId={organizationId}
          onUsers={onUsers}
        />
      )}
    </div>
  );
}

function OrganizationBranches({
  token,
  organizationId,
  onChange,
}: {
  token: string;
  organizationId: string;
  onChange: (branches: BranchListItem[]) => void;
}) {
  const [branches, setBranches] = useState<BranchListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<BranchInput>(emptyBranch);
  const [editing, setEditing] = useState<string>();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmation, setConfirmation] = useState<{
    branch: BranchListItem;
    action: "activate" | "deactivate" | "delete";
  }>();
  const pending = useRef(false);
  const callback = useRef(onChange);
  callback.current = onChange;
  const nameInput = useRef<HTMLInputElement>(null);
  const load = useCallback(async () => {
    const result = await getBranches(token, organizationId);
    setBranches(result);
    callback.current(result);
  }, [token, organizationId]);
  useEffect(() => {
    let current = true;
    void getBranches(token, organizationId)
      .then((result) => {
        if (current) {
          setBranches(result);
          callback.current(result);
        }
      })
      .catch((cause: unknown) => {
        if (current) setMessage(errorText(cause));
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [token, organizationId]);
  const reset = () => {
    setEditing(undefined);
    setData(emptyBranch);
  };
  const save = async () => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setMessage("");
    try {
      if (editing) await updateBranch(token, organizationId, editing, data);
      else await createBranch(token, organizationId, data);
      reset();
      await load();
      setMessage("Sucursal guardada.");
    } catch (cause) {
      setMessage(errorText(cause));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  const changeStatus = async () => {
    if (!confirmation || pending.current) return;
    pending.current = true;
    setBusy(true);
    setMessage("");
    try {
      await changeBranchStatus(
        token,
        organizationId,
        confirmation.branch.id,
        confirmation.action,
      );
      if (editing === confirmation.branch.id) reset();
      setConfirmation(undefined);
      await load();
      setMessage("Sucursal actualizada.");
    } catch (cause) {
      setMessage(errorText(cause));
      setConfirmation(undefined);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  return (
    <>
      {message && (
        <p
          role="status"
          className="mb-4 rounded-lg border border-teal-100 bg-teal-50 px-4 py-3 text-sm text-teal-900"
        >
          {message}
        </p>
      )}
      <div className="workspace-split grid items-start gap-5">
        <section className={`${card} min-w-0`}>
          <h2 className="font-semibold">Sucursales</h2>
          <p className="mt-1 mb-5 text-sm text-slate-500">
            Locales de tu organización.
          </p>
          {loading ? (
            <p className="py-6 text-sm text-slate-500">Cargando sucursales…</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs text-slate-500">
                  <tr>
                    {[
                      "Nombre / Código",
                      "Dirección",
                      "Ciudad / Provincia",
                      "Teléfono",
                      "Estado",
                      "Acciones",
                    ].map((label) => (
                      <th className="px-3 py-3 font-medium" key={label}>
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {branches.map((branch) => (
                    <tr
                      key={branch.id}
                      className={`border-t border-slate-100 ${editing === branch.id ? "bg-teal-50/60" : "hover:bg-slate-50/50"}`}
                    >
                      <td className="px-3 py-4">
                        <span className="block font-medium">{branch.name}</span>
                        <span className="mt-1 block text-xs text-slate-500">
                          {branch.code}
                        </span>
                      </td>
                      <td className="px-3 py-4">{branch.address || "—"}</td>
                      <td className="px-3 py-4">
                        {branch.city || "—"}
                        <span className="block text-xs text-slate-500">
                          {branch.province}
                        </span>
                      </td>
                      <td className="px-3 py-4 whitespace-nowrap">
                        {branch.phone || "—"}
                      </td>
                      <td className="px-3 py-4">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs ${branch.active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}
                        >
                          <span className="size-1.5 rounded-full bg-current" />
                          {branch.active ? "Activa" : "Inactiva"}
                        </span>
                      </td>
                      <td className="px-3 py-4">
                        <div className="flex items-center gap-2">
                          <button
                            disabled={busy}
                            className={secondary}
                            aria-label={`Editar ${branch.name}`}
                            onClick={() => {
                              setEditing(branch.id);
                              setData({
                                name: branch.name,
                                code: branch.code,
                                address: branch.address ?? "",
                                city: branch.city ?? "",
                                province: branch.province ?? "",
                                phone: branch.phone ?? "",
                              });
                              setMessage("");
                              nameInput.current?.focus();
                            }}
                          >
                            <Pencil size={14} />
                            Editar
                          </button>
                          <BranchActions
                            branch={branch}
                            disabled={busy}
                            onAction={(action) =>
                              setConfirmation({ branch, action })
                            }
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!branches.length && (
                    <tr>
                      <td
                        colSpan={6}
                        className="p-6 text-center text-slate-500"
                      >
                        No hay sucursales para mostrar.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-4 text-xs text-slate-500">
            {branches.length}{" "}
            {branches.length === 1 ? "sucursal" : "sucursales"}
          </p>
        </section>
        <form
          className={card}
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">
              {editing ? "Editar sucursal" : "Nueva sucursal"}
            </h2>
            {editing && (
              <button
                type="button"
                disabled={busy}
                className="text-slate-500"
                aria-label="Cancelar edición"
                onClick={reset}
              >
                <X size={18} />
              </button>
            )}
          </div>
          {fields.map(([key, label, max]) => (
            <label key={key} className="mt-4 block text-sm">
              {label}
              <input
                ref={key === "name" ? nameInput : undefined}
                required={key === "name" || key === "code"}
                minLength={key === "name" || key === "code" ? 2 : undefined}
                pattern={key === "code" ? "[A-Za-z0-9-]{2,32}" : undefined}
                maxLength={max}
                disabled={busy}
                value={data[key] ?? ""}
                onChange={(event) =>
                  setData({
                    ...data,
                    [key]:
                      key === "code"
                        ? event.target.value.toUpperCase()
                        : event.target.value,
                  })
                }
                className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-100"
              />
            </label>
          ))}
          <button
            disabled={busy || loading}
            className={`${primary} mt-5 w-full`}
          >
            {busy
              ? "Guardando…"
              : editing
                ? "Guardar cambios"
                : "Crear sucursal"}
          </button>
          {editing && (
            <button
              type="button"
              disabled={busy}
              onClick={reset}
              className={`${secondary} mt-2 w-full`}
            >
              Cancelar
            </button>
          )}
        </form>
      </div>
      {confirmation && (
        <BranchConfirmation
          name={confirmation.branch.name}
          action={confirmation.action}
          busy={busy}
          onConfirm={() => void changeStatus()}
          onClose={() => {
            if (!pending.current) setConfirmation(undefined);
          }}
        />
      )}
    </>
  );
}

function BranchActions({
  branch,
  disabled,
  onAction,
}: {
  branch: BranchListItem;
  disabled: boolean;
  onAction: (action: "activate" | "deactivate" | "delete") => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        ref.current?.querySelector("button")?.focus();
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  // Popover is fixed so a short/scrollable table cannot clip its actions.
  const [position, setPosition] = useState({ top: 0, left: 0 });
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);
  return (
    <div
      ref={ref}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <button
        type="button"
        disabled={disabled}
        aria-label={`Más acciones de ${branch.name}`}
        aria-expanded={open}
        className={secondary}
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          setPosition({
            top: Math.min(rect.bottom + 5, window.innerHeight - 110),
            left: Math.max(8, rect.right - 180),
          });
          setOpen(!open);
        }}
      >
        <MoreHorizontal size={16} />
      </button>
      {open && (
        <div
          className="fixed z-30 w-[180px] rounded-xl border border-slate-200 bg-white p-1 shadow-lg"
          style={position}
        >
          <button
            className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50"
            onClick={() => {
              setOpen(false);
              onAction(branch.active ? "deactivate" : "activate");
            }}
          >
            {branch.active ? "Desactivar" : "Reactivar"}
          </button>
          <button
            className="w-full rounded-lg px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"
            onClick={() => {
              setOpen(false);
              onAction("delete");
            }}
          >
            Eliminar
          </button>
        </div>
      )}
    </div>
  );
}

function BranchConfirmation({
  name,
  action,
  busy,
  onConfirm,
  onClose,
}: {
  name: string;
  action: "activate" | "deactivate" | "delete";
  busy: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  const label =
    action === "delete"
      ? "Eliminar"
      : action === "activate"
        ? "Reactivar"
        : "Desactivar";
  return (
    <dialog
      ref={ref}
      aria-labelledby="branch-confirm-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl border border-slate-200 p-6 shadow-xl backdrop:bg-slate-900/30"
    >
      <h2 id="branch-confirm-title" className="text-lg font-semibold">
        {label} sucursal
      </h2>
      <p className="mt-3 text-sm text-slate-600">{name}</p>
      <p className="mt-2 text-sm text-slate-500">
        {action === "delete"
          ? "Se quitará del listado únicamente si no tiene registros vinculados. No se borra historial comercial."
          : action === "deactivate"
            ? "Dejará de estar disponible para operar. Podés reactivarla más adelante; su historial se conserva."
            : "Volverá a estar disponible para los usuarios que tienen acceso."}
      </p>
      <div className="mt-6 flex justify-end gap-2">
        <button
          autoFocus
          disabled={busy}
          className={secondary}
          onClick={onClose}
        >
          Cancelar
        </button>
        <button disabled={busy} className={primary} onClick={onConfirm}>
          {busy ? "Guardando…" : label}
        </button>
      </div>
    </dialog>
  );
}

function TicketAttendants({
  token,
  organizationId,
  onUsers,
}: {
  token: string;
  organizationId: string;
  onUsers: () => void;
}) {
  const [users, setUsers] = useState<UserListItem[]>([]);
  const [editing, setEditing] = useState<UserListItem>();
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let active = true;
    void getUsers(token, organizationId)
      .then((result) => {
        if (active) {
          setUsers(result);
          setError("");
        }
      })
      .catch((cause: unknown) => {
        if (active) setError(errorText(cause));
      });
    return () => {
      active = false;
    };
  }, [token, organizationId, version]);
  return (
    <section className={`${card} mt-5`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">Nombre de quien atiende</h2>
          <p className="mt-1 text-sm text-slate-500">
            El ticket usa el nombre guardado para cada usuario, no su email.
          </p>
        </div>
        <button className={secondary} onClick={onUsers}>
          <Users size={16} />
          Administrar usuarios
        </button>
      </div>
      {error && (
        <p role="status" className="mt-3 text-sm text-slate-500">
          {error}
        </p>
      )}
      <div className="mt-4 divide-y divide-slate-100">
        {users
          .filter((item) => item.active && item.user.active)
          .map((item) => (
            <div
              key={item.user.id}
              className="flex items-center justify-between gap-4 py-3"
            >
              <div>
                <p className="text-sm font-medium">
                  {item.displayName || "Sin nombre"}
                </p>
                <p className="text-xs text-slate-500">{item.user.email}</p>
              </div>
              <button className={secondary} onClick={() => setEditing(item)}>
                <Pencil size={14} />
                Editar
              </button>
            </div>
          ))}
      </div>
      {editing && (
        <UserTicketNameDialog
          token={token}
          organizationId={organizationId}
          user={editing}
          onClose={() => setEditing(undefined)}
          onDone={() => setVersion((current) => current + 1)}
        />
      )}
    </section>
  );
}
