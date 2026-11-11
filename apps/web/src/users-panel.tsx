import {
  useCallback,
  useState,
  type FormEvent,
  type ReactElement,
} from "react";
import {
  Check,
  KeyRound,
  MonitorSmartphone,
  Pencil,
  Plus,
  Save,
  ShieldCheck,
  Store,
} from "lucide-react";
import {
  cerrarSesionDeUsuario,
  createUser,
  listarSesionesDeUsuario,
  updateUser,
  type UserCreateOptions,
  type UserListItem,
} from "./lib/api";
import { bloqueoDeDueno } from "./lib/usuarios-dueno";
import { SesionesAbiertasDialog } from "./sesiones-abiertas-dialog";
import { StatusToast } from "./status-toast";
import { field, primary, secondary } from "./supplier-payables/dialog";
import { useFitToViewport } from "./use-fit-to-viewport";
import { UserPasswordDialog } from "./user-password-dialog";

const minPasswordLength = 12;

function userInitials(item: UserListItem): string {
  const source = item.displayName?.trim() || item.user.email;
  const words = source
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2);
  return words.map((word) => word[0]!.toUpperCase()).join("") || "?";
}

function Chip({
  icon,
  children,
}: {
  icon: ReactElement;
  children: string;
}): ReactElement {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700">
      {icon}
      {children}
    </span>
  );
}

export function UserCard({
  item,
  selected,
  onSelect,
}: {
  item: UserListItem;
  selected: boolean;
  onSelect: () => void;
}): ReactElement {
  const title = item.displayName || item.user.email;
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={`Editar usuario ${item.user.email}`}
      className={`group flex w-full cursor-pointer gap-4 rounded-xl border p-4 text-left transition-colors ${selected ? "border-teal-600 bg-teal-50/40 ring-1 ring-teal-600" : "border-slate-200 bg-white hover:border-teal-400 hover:shadow-sm"} ${item.active ? "" : "opacity-70"}`}
    >
      <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-teal-50 text-sm font-semibold text-teal-800">
        {userInitials(item)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="min-w-0 text-base font-semibold break-words text-slate-900">
            {title}
          </span>
          {item.isCurrentUser && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
              Vos
            </span>
          )}
          <span
            className={`ml-auto rounded-full px-2.5 py-0.5 text-xs font-medium ${item.active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}
          >
            {item.active ? "Activo" : "Inactivo"}
          </span>
        </span>
        {item.displayName && (
          <span className="mt-0.5 block text-sm break-words text-slate-500">
            {item.user.email}
          </span>
        )}
        <span className="mt-3 flex flex-wrap items-center gap-1.5">
          {item.roles.map(({ role }) => (
            <Chip
              key={role.id}
              icon={
                <ShieldCheck
                  size={13}
                  className="text-teal-700"
                  aria-hidden="true"
                />
              }
            >
              {role.name ?? role.code}
            </Chip>
          ))}
          {item.branches.map(({ branch }) => (
            <Chip
              key={branch.id}
              icon={
                <Store size={13} className="text-teal-700" aria-hidden="true" />
              }
            >
              {branch.name}
            </Chip>
          ))}
          <span
            className={`ml-auto inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-sm font-medium ${selected ? "bg-teal-700 text-white" : "text-teal-700 group-hover:bg-teal-50"}`}
          >
            <Pencil size={14} aria-hidden="true" />
            {selected ? "Editando" : "Editar usuario"}
          </span>
        </span>
      </span>
    </button>
  );
}

function CheckOption({
  checked,
  disabled,
  onChange,
  title,
  detail,
}: {
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
  title: string;
  detail?: string;
}): ReactElement {
  return (
    <label
      className={`flex items-start gap-2.5 rounded-lg border px-3 py-2 ${checked ? "border-teal-600 bg-teal-50/40" : "border-slate-200 bg-white"} ${disabled ? "cursor-default" : "cursor-pointer hover:border-teal-400"}`}
    >
      <input
        type="checkbox"
        className="mt-0.5 size-4 accent-teal-700"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="min-w-0 text-sm text-slate-700">
        <span className="block font-medium">{title}</span>
        {detail && (
          <span className="block text-xs text-slate-500">{detail}</span>
        )}
      </span>
    </label>
  );
}

function toggle(current: readonly string[], id: string, enabled: boolean) {
  return enabled
    ? [...new Set([...current, id])]
    : current.filter((value) => value !== id);
}

export function UsersPanel({
  token,
  organizationId,
  users,
  options,
  onDone,
  onError,
}: {
  token: string;
  organizationId: string;
  users: UserListItem[];
  options?: UserCreateOptions;
  onDone: () => void;
  onError: (value: string) => void;
}): ReactElement {
  const [editingId, setEditingId] = useState<string>();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [roleIds, setRoleIds] = useState<string[]>([]);
  const [branchIds, setBranchIds] = useState<string[]>([]);
  const [active, setActive] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [passwordUser, setPasswordUser] = useState<UserListItem>();
  const [sesionesDe, setSesionesDe] = useState<UserListItem>();
  const sesionesId = sesionesDe?.user.id;
  const cargarSesiones = useCallback(
    () => listarSesionesDeUsuario(token, organizationId, sesionesId ?? ""),
    [token, organizationId, sesionesId],
  );
  const { panelRef, panelHeight } = useFitToViewport<HTMLFormElement>();
  const editing = users.find(({ user }) => user.id === editingId);
  // Los accesos propios los cambia otro administrador; el nombre sí se edita.
  const ownAccess = Boolean(editing?.isCurrentUser);
  // Sólo un dueño cambia los accesos de otro dueño o da el rol de dueño.
  const { accesoBloqueado, rolDuenoBloqueado } = bloqueoDeDueno(users, editing);
  const accessLocked = ownAccess || accesoBloqueado;
  const roles = options?.roles ?? [];
  const branches = options?.branches ?? [];
  const startNew = () => {
    setEditingId(undefined);
    setDisplayName("");
    setEmail("");
    setPassword("");
    setRoleIds([]);
    setBranchIds([]);
    setActive(true);
  };
  const select = (item: UserListItem) => {
    const activeBranches = new Set(branches.map(({ id }) => id));
    setEditingId(item.user.id);
    setDisplayName(item.displayName ?? "");
    setEmail(item.user.email);
    setPassword("");
    setRoleIds(item.roles.map(({ role }) => role.id));
    // Solo se pueden asignar sucursales activas.
    setBranchIds(
      item.branches
        .map(({ branch }) => branch.id)
        .filter((id) => activeBranches.has(id)),
    );
    setActive(item.active);
  };
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    if (!editing && password.length < minPasswordLength)
      return onError(
        `La contraseña necesita al menos ${minPasswordLength} caracteres.`,
      );
    if (roleIds.length === 0) return onError("Elegí al menos un rol.");
    if (branchIds.length === 0) return onError("Elegí al menos una sucursal.");
    setBusy(true);
    try {
      if (editing) {
        await updateUser(token, organizationId, editing.user.id, {
          active,
          roleIds,
          branchIds,
          displayName: displayName.trim(),
        });
        setNotice(
          `Guardaste los cambios de ${displayName.trim() || editing.user.email}.`,
        );
      } else {
        await createUser(token, organizationId, {
          email,
          password,
          displayName: displayName.trim() || undefined,
          roleIds,
          branchIds,
        });
        setNotice(`Creaste el usuario ${email}.`);
        startNew();
      }
      onDone();
    } catch (cause) {
      onError(
        cause instanceof Error
          ? cause.message
          : "No se pudo guardar el usuario.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(380px,0.85fr)]">
      {notice ? (
        <StatusToast
          key={notice}
          message={notice}
          onClose={() => setNotice("")}
        />
      ) : null}
      {sesionesDe && (
        <SesionesAbiertasDialog
          key={`${organizationId}:${sesionesDe.user.id}`}
          titulo="Sesiones abiertas"
          subtitulo={`Dónde tiene la sesión iniciada ${sesionesDe.displayName || sesionesDe.user.email}. Cerrarlas le corta el acceso en esas PC.`}
          textoCerrarTodas="Cerrar todas"
          cargar={cargarSesiones}
          cerrarUna={(id) =>
            cerrarSesionDeUsuario(token, organizationId, sesionesDe.user.id, id)
          }
          cerrarTodas={() =>
            cerrarSesionDeUsuario(token, organizationId, sesionesDe.user.id)
          }
          onClose={() => setSesionesDe(undefined)}
        />
      )}
      {passwordUser && (
        <UserPasswordDialog
          key={`${organizationId}:${passwordUser.user.id}`}
          token={token}
          organizationId={organizationId}
          user={passwordUser}
          onDone={(value) => {
            setNotice(value);
            onDone();
          }}
          onClose={() => setPasswordUser(undefined)}
        />
      )}
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              Usuarios de la farmacia
            </h2>
            <p className="mt-0.5 text-sm text-slate-500">
              Elegí un usuario para cambiar su nombre, roles, sucursales o
              estado.
            </p>
          </div>
          {editing && (
            <button type="button" onClick={startNew} className={primary}>
              <Plus size={16} aria-hidden="true" />
              Nuevo usuario
            </button>
          )}
        </div>
        <div className="mt-5 space-y-3">
          {users.map((item) => (
            <UserCard
              key={item.user.id}
              item={item}
              selected={item.user.id === editingId}
              onSelect={() => select(item)}
            />
          ))}
          {users.length === 0 && (
            <p className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
              Todavía no hay usuarios cargados.
            </p>
          )}
        </div>
      </section>
      <form
        ref={panelRef}
        style={panelHeight ? { height: panelHeight } : undefined}
        onSubmit={(event) => void save(event)}
        aria-label="Datos del usuario"
        className="side-config-panel rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
      >
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-slate-900">
            {editing ? "Editar usuario" : "Nuevo usuario"}
          </h2>
          {editing && (
            <span className="mt-1 inline-flex max-w-full items-center gap-1.5 rounded-full bg-teal-50 px-3 py-1 text-xs font-medium break-all text-teal-800">
              <Pencil size={13} aria-hidden="true" />
              Editando: {editing.displayName || editing.user.email}
            </span>
          )}
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <p className="mb-1 text-sm font-medium text-slate-700">Nombre</p>
            <input
              aria-label="Nombre del usuario"
              className={field}
              value={displayName}
              maxLength={120}
              placeholder="Como aparece en los tickets"
              onChange={(event) => setDisplayName(event.target.value)}
            />
          </div>
          <div>
            <p className="mb-1 text-sm font-medium text-slate-700">
              Email <span className="text-red-600">*</span>
            </p>
            <input
              aria-label="Email del usuario"
              type="email"
              required
              className={field}
              value={email}
              disabled={Boolean(editing)}
              title={editing ? "El email de ingreso no se cambia." : undefined}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
        </div>
        {!editing && (
          <div className="mt-3">
            <p className="mb-1 text-sm font-medium text-slate-700">
              Contraseña <span className="text-red-600">*</span>
            </p>
            <input
              aria-label="Contraseña del usuario"
              type="password"
              autoComplete="new-password"
              className={field}
              value={password}
              placeholder={`Al menos ${minPasswordLength} caracteres`}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>
        )}
        {editing && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2">
            <label
              className={`flex items-center gap-2.5 text-sm font-medium text-slate-700 ${accessLocked ? "" : "cursor-pointer"}`}
            >
              <input
                type="checkbox"
                role="switch"
                className="size-4 accent-teal-700"
                checked={active}
                disabled={accessLocked}
                onChange={(event) => setActive(event.target.checked)}
              />
              {active ? "Usuario activo" : "Usuario desactivado"}
            </label>
            {!accessLocked && (
              <button
                type="button"
                onClick={() => setPasswordUser(editing)}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-teal-700 hover:text-teal-900"
              >
                <KeyRound size={15} aria-hidden="true" />
                Restablecer contraseña
              </button>
            )}
            {!ownAccess && (
              <button
                type="button"
                onClick={() => setSesionesDe(editing)}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-teal-700 hover:text-teal-900"
              >
                <MonitorSmartphone size={15} aria-hidden="true" />
                Sesiones abiertas
              </button>
            )}
          </div>
        )}
        {ownAccess && (
          <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Es tu usuario: podés cambiar tu nombre, pero tus roles y sucursales
            los cambia otro administrador.
          </p>
        )}
        {!ownAccess && accesoBloqueado && (
          <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Es un dueño de la farmacia: podés cambiarle el nombre, pero sus
            roles, sucursales, estado y contraseña los cambia otro dueño.
          </p>
        )}
        <div className="side-config-scroll mt-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="text-base font-semibold text-slate-900">Roles</h3>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-50 px-3 py-1 text-xs font-medium text-teal-800">
              <Check size={13} aria-hidden="true" />
              {roleIds.length} de {roles.length}
            </span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {roles.map((role) => (
              <CheckOption
                key={role.id}
                title={role.name}
                detail={role.code}
                checked={roleIds.includes(role.id)}
                disabled={
                  accessLocked || (rolDuenoBloqueado && role.code === "OWNER")
                }
                onChange={(enabled) =>
                  setRoleIds((current) => toggle(current, role.id, enabled))
                }
              />
            ))}
          </div>
          <div className="mt-4 mb-2 flex items-center justify-between gap-2">
            <h3 className="text-base font-semibold text-slate-900">
              Sucursales
            </h3>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-50 px-3 py-1 text-xs font-medium text-teal-800">
              <Check size={13} aria-hidden="true" />
              {branchIds.length} de {branches.length}
            </span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {branches.map((branch) => (
              <CheckOption
                key={branch.id}
                title={branch.name}
                detail={branch.code}
                checked={branchIds.includes(branch.id)}
                disabled={accessLocked}
                onChange={(enabled) =>
                  setBranchIds((current) => toggle(current, branch.id, enabled))
                }
              />
            ))}
          </div>
        </div>
        <div className="mt-3 flex shrink-0 justify-end gap-3 border-t border-slate-100 pt-3">
          <button type="button" onClick={startNew} className={secondary}>
            Cancelar
          </button>
          <button type="submit" disabled={busy} className={primary}>
            <Save size={16} aria-hidden="true" />
            {busy
              ? "Guardando…"
              : editing
                ? "Guardar usuario"
                : "Crear usuario"}
          </button>
        </div>
      </form>
    </div>
  );
}
