import { useState, type FormEvent, type ReactElement } from "react";
import {
  Check,
  Crown,
  Lock,
  Pencil,
  Plus,
  Save,
  ShieldCheck,
  UserRound,
  UsersRound,
} from "lucide-react";
import { createRole, updateRole, type RoleListItem } from "./lib/api";
import {
  countRolePermissions,
  suggestedRoleCode,
  roleModuleTitles,
  rolePermissionCodes,
  toggleRolePermission,
} from "./lib/role-permissions";
import { RolePermissionPicker } from "./role-permission-picker";
import { StatusToast } from "./status-toast";
import { useFitToViewport } from "./use-fit-to-viewport";
import { field, primary, secondary } from "./supplier-payables/dialog";

/** Cantidad de módulos que se muestran como chip antes del "+N más". */
const visibleModules = 3;

const codePattern = /^[A-Z][A-Z0-9_]{1,31}$/;

function roleCodes(role: RoleListItem): string[] {
  return role.permissions.map(({ permission }) => permission.code);
}

function RoleIcon({ code }: { code: string }): ReactElement {
  const Icon =
    code === "OWNER" ? Crown : code === "ADMIN" ? ShieldCheck : UserRound;
  return <Icon size={22} aria-hidden="true" />;
}

function usersLabel(count: number): string {
  return count === 1 ? "1 usuario" : `${count} usuarios`;
}

export function RoleCard({
  role,
  selected,
  onSelect,
}: {
  role: RoleListItem;
  selected: boolean;
  onSelect: () => void;
}): ReactElement {
  const modules = roleModuleTitles(roleCodes(role));
  const hidden = modules.length - visibleModules;
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={`${role.code === "OWNER" ? "Ver" : "Editar"} rol ${role.name}`}
      className={`group flex w-full cursor-pointer gap-4 rounded-xl border p-4 text-left transition-colors ${selected ? "border-teal-600 bg-teal-50/40 ring-1 ring-teal-600" : "border-slate-200 bg-white hover:border-teal-400 hover:shadow-sm"}`}
    >
      <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
        <RoleIcon code={role.code} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-base font-semibold text-slate-900">
            {role.name}
          </span>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">
            {role.code}
          </span>
          <span className="ml-auto flex items-center gap-1.5 text-sm text-slate-600">
            <UsersRound size={15} aria-hidden="true" />
            {usersLabel(role.userCount ?? 0)}
          </span>
        </span>
        <span className="mt-1 block text-sm leading-5 text-slate-600">
          {role.description ||
            (role.code === "OWNER"
              ? "Dueño de la farmacia: conserva siempre todos los permisos."
              : "Sin descripción.")}
        </span>
        <span className="mt-3 flex flex-wrap gap-1.5">
          {modules.length === 0 ? (
            <span className="text-sm text-slate-500">
              Sin permisos asignados.
            </span>
          ) : (
            modules.slice(0, visibleModules).map((title) => (
              <span
                key={title}
                className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700"
              >
                <Check size={13} className="text-teal-700" aria-hidden />
                {title}
              </span>
            ))
          )}
          {hidden > 0 && (
            <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-teal-700">
              + {hidden} más
            </span>
          )}
          <span
            className={`ml-auto inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-sm font-medium ${selected ? "bg-teal-700 text-white" : "text-teal-700 group-hover:bg-teal-50"}`}
          >
            {role.code === "OWNER" ? (
              <Lock size={14} aria-hidden="true" />
            ) : (
              <Pencil size={14} aria-hidden="true" />
            )}
            {selected
              ? role.code === "OWNER"
                ? "Viendo"
                : "Editando"
              : role.code === "OWNER"
                ? "Ver rol"
                : "Editar rol"}
          </span>
        </span>
      </span>
    </button>
  );
}

export function RolesPanel({
  token,
  organizationId,
  roles,
  onDone,
  onError,
}: {
  token: string;
  organizationId: string;
  roles: RoleListItem[];
  onDone: () => void;
  onError: (value: string) => void;
}): ReactElement {
  const [editingId, setEditingId] = useState<string>();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [codeTouched, setCodeTouched] = useState(false);
  const [description, setDescription] = useState("");
  const [permissionCodes, setPermissionCodes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const editing = roles.find(({ id }) => id === editingId);
  const { panelRef, panelHeight } = useFitToViewport<HTMLFormElement>();
  const locked = editing?.code === "OWNER";
  const startNew = () => {
    setEditingId(undefined);
    setName("");
    setCode("");
    setCodeTouched(false);
    setDescription("");
    setPermissionCodes([]);
  };
  const select = (role: RoleListItem) => {
    setEditingId(role.id);
    setName(role.name);
    setCode(role.code);
    setDescription(role.description ?? "");
    setPermissionCodes(roleCodes(role));
  };
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || locked) return;
    const trimmed = name.trim();
    if (trimmed.length < 2)
      return onError("El nombre del rol necesita al menos 2 letras.");
    if (!editing && !codePattern.test(code))
      return onError(
        "El código va en mayúsculas, empieza con una letra y puede llevar números y guiones bajos.",
      );
    if (!editing && permissionCodes.length === 0)
      return onError("Elegí al menos un permiso para el rol.");
    setBusy(true);
    try {
      if (editing) {
        await updateRole(token, organizationId, editing.id, {
          name: trimmed,
          description: description.trim(),
          permissionCodes,
        });
        setNotice(`Guardaste los cambios del rol ${trimmed}.`);
      } else {
        await createRole(token, organizationId, {
          name: trimmed,
          code,
          description: description.trim() || undefined,
          permissionCodes,
        });
        setNotice(`Creaste el rol ${trimmed}.`);
        startNew();
      }
      onDone();
    } catch (cause) {
      onError(
        cause instanceof Error ? cause.message : "No se pudo guardar el rol.",
      );
    } finally {
      setBusy(false);
    }
  };
  const selected = countRolePermissions(permissionCodes);
  return (
    <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(380px,0.85fr)]">
      {notice ? (
        <StatusToast
          key={notice}
          message={notice}
          onClose={() => setNotice("")}
        />
      ) : null}
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              Roles del sistema
            </h2>
            <p className="mt-0.5 text-sm text-slate-500">
              Gestioná los roles, sus permisos y usuarios asignados.
            </p>
          </div>
          {editing && (
            <button type="button" onClick={startNew} className={primary}>
              <Plus size={16} aria-hidden="true" />
              Nuevo rol
            </button>
          )}
        </div>
        <div className="mt-5 space-y-3">
          {roles.map((role) => (
            <RoleCard
              key={role.id}
              role={role}
              selected={role.id === editingId}
              onSelect={() => select(role)}
            />
          ))}
          {roles.length === 0 && (
            <p className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
              Todavía no hay roles cargados.
            </p>
          )}
        </div>
      </section>
      <form
        ref={panelRef}
        style={panelHeight ? { height: panelHeight } : undefined}
        onSubmit={(event) => void save(event)}
        aria-label="Configuración del rol"
        className="side-config-panel rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-slate-900">
              {editing ? "Configuración del rol" : "Nuevo rol"}
            </h2>
            {editing && (
              <span className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-teal-50 px-3 py-1 text-xs font-medium text-teal-800">
                {locked ? (
                  <Lock size={13} aria-hidden="true" />
                ) : (
                  <Pencil size={13} aria-hidden="true" />
                )}
                {locked ? "Solo lectura" : "Editando"}: {editing.name}
              </span>
            )}
          </div>
        </div>
        {locked && (
          <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
            El rol de dueño siempre conserva todos los permisos: se puede ver,
            pero no editar.
          </p>
        )}
        <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem]">
          <div>
            <p className="mb-1 text-sm font-medium text-slate-700">
              Nombre <span className="text-red-600">*</span>
            </p>
            <input
              aria-label="Nombre del rol"
              className={field}
              value={name}
              disabled={locked}
              maxLength={60}
              onChange={(event) => {
                setName(event.target.value);
                if (!editing && !codeTouched)
                  setCode(suggestedRoleCode(event.target.value));
              }}
            />
          </div>
          <div>
            <p className="mb-1 text-sm font-medium text-slate-700">
              Código <span className="text-red-600">*</span>
            </p>
            <input
              aria-label="Código del rol"
              className={`${field} uppercase`}
              value={code}
              disabled={Boolean(editing)}
              title={
                editing
                  ? "El código no cambia una vez creado el rol."
                  : undefined
              }
              maxLength={32}
              onChange={(event) => {
                setCodeTouched(true);
                setCode(
                  event.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "_"),
                );
              }}
            />
          </div>
        </div>
        <div className="mt-3">
          <p className="mb-1 text-sm font-medium text-slate-700">Descripción</p>
          <input
            aria-label="Descripción del rol"
            maxLength={300}
            disabled={locked}
            value={description}
            placeholder="Para quién es este rol y qué hace."
            onChange={(event) => setDescription(event.target.value)}
            className={field}
          />
        </div>
        <div className="mt-4 mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-base font-semibold text-slate-900">
            Permisos del rol
          </h3>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-50 px-3 py-1 text-xs font-medium text-teal-800">
            <Check size={13} aria-hidden="true" />
            {selected} de {rolePermissionCodes.length} permisos
          </span>
        </div>
        {/* En escritorio la lista de módulos tiene scroll propio dentro del panel fijo. */}
        <div
          role="group"
          aria-label="Permisos del rol"
          className="side-config-scroll"
        >
          <RolePermissionPicker
            value={permissionCodes}
            disabled={locked}
            onChange={(permission, enabled) =>
              setPermissionCodes((current) =>
                toggleRolePermission(current, permission, enabled),
              )
            }
          />
        </div>
        {!locked && (
          <div className="mt-3 flex shrink-0 justify-end gap-3 border-t border-slate-100 pt-3">
            <button type="button" onClick={startNew} className={secondary}>
              Cancelar
            </button>
            <button type="submit" disabled={busy} className={primary}>
              <Save size={16} aria-hidden="true" />
              {busy ? "Guardando…" : editing ? "Guardar rol" : "Crear rol"}
            </button>
          </div>
        )}
      </form>
    </div>
  );
}
