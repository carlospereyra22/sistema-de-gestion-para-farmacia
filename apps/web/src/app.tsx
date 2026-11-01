import { useEffect, useState } from "react";
import { ProductImageSession } from "./product-image-session";
import { SessionStartup } from "./session-startup";
import type { FormEvent, ReactElement } from "react";
import {
  Building2,
  LogOut,
  Package,
  Settings,
  ShieldCheck,
  Users,
} from "lucide-react";

import {
  createUser,
  createBranch,
  createRole,
  createCatalogProduct,
  getCatalogProducts,
  updateUser,
  getBranches,
  getCurrentUser,
  getUserCreateOptions,
  getUsers,
  getRoles,
  login,
  logout,
  refreshSession,
  SessionExpiredError,
  type UserCreateOptions,
  type UserListItem,
  type BranchListItem,
  type RoleListItem,
  type CatalogProduct,
} from "./lib/api";
import { WorkspaceShell } from "./workspace-shell";
import { LoginScreen } from "./login-screen";

const permissionGroups = [
  {
    title: "Usuarios",
    permissions: [
      { code: "USER_READ", label: "Ver usuarios" },
      { code: "USER_MANAGE", label: "Gestionar usuarios" },
    ],
  },
  {
    title: "Roles",
    permissions: [
      { code: "ROLE_READ", label: "Ver roles" },
      { code: "ROLE_MANAGE", label: "Gestionar roles" },
    ],
  },
  {
    title: "Organizacion",
    permissions: [
      { code: "ORGANIZATION_READ", label: "Ver sucursales" },
      { code: "ORGANIZATION_MANAGE", label: "Gestionar sucursales" },
    ],
  },
] as const;

const rolePermissionOptions: { code: string; label: string }[] =
  permissionGroups.flatMap((group) =>
    group.permissions.map((permission) => ({ ...permission })),
  );

export function App(): ReactElement {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string>();
  const [user, setUser] = useState<string>();
  const [accountName, setAccountName] = useState<string>();
  const [organizationName, setOrganizationName] = useState<string>();
  const [accessToken, setAccessToken] = useState<string>();
  const [organizationId, setOrganizationId] = useState<string>();
  const [users, setUsers] = useState<UserListItem[]>([]);
  const [createOptions, setCreateOptions] = useState<UserCreateOptions>();
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [selectedBranchIds, setSelectedBranchIds] = useState<string[]>([]);
  const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [view, setView] = useState<
    "users" | "roles" | "organization" | "catalog"
  >("users");
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [productName, setProductName] = useState("");
  const [productPrice, setProductPrice] = useState("");
  const [productQuery, setProductQuery] = useState("");
  const [roles, setRoles] = useState<RoleListItem[]>([]);
  const [branches, setBranches] = useState<BranchListItem[]>([]);
  const [branchName, setBranchName] = useState("");
  const [branchCode, setBranchCode] = useState("");
  const [roleName, setRoleName] = useState("");
  const [roleCode, setRoleCode] = useState("");
  const [rolePermissionCodes, setRolePermissionCodes] = useState<string[]>([]);
  const [restoringSession, setRestoringSession] = useState(true);
  const [sessionRestoreFailed, setSessionRestoreFailed] = useState(false);
  const [showLegacyWorkspace, setShowLegacyWorkspace] = useState(false);

  const startSession = async (token: string): Promise<void> => {
    const profile = await getCurrentUser(token);
    setUser(profile.email);
    const membership = profile.organizations[0];
    setAccountName(membership?.displayName || undefined);
    setOrganizationName(
      membership?.organization?.ticketHeader?.name ||
        membership?.organization?.name,
    );
    setAccessToken(token);
    setOrganizationId(profile.organizations[0]?.organizationId);
  };
  const loadCatalog = async (): Promise<void> => {
    if (accessToken && organizationId)
      setProducts(await getCatalogProducts(accessToken, organizationId));
  };
  const submitProduct = async (
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();
    if (!accessToken || !organizationId) return;
    setMessage(undefined);
    try {
      await createCatalogProduct(accessToken, organizationId, {
        name: productName,
        priceMinor: Math.round(Number(productPrice) * 100),
      });
      await loadCatalog();
      setProductName("");
      setProductPrice("");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "No se pudo crear el producto.",
      );
    }
  };

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setMessage(undefined);
    try {
      const result = await login(email, password);
      await startSession(result.accessToken);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "No se pudo iniciar sesion.",
      );
    }
  };

  useEffect(() => {
    let active = true;
    let timer: number | undefined;
    const restore = async () => {
      try {
        const { accessToken: token } = await refreshSession();
        if (!active) return;
        await startSession(token);
        if (active) setRestoringSession(false);
      } catch (cause) {
        if (!active) return;
        if (cause instanceof SessionExpiredError) setRestoringSession(false);
        else {
          setSessionRestoreFailed(true);
          timer = window.setTimeout(() => void restore(), 15000);
        }
      }
    };
    void restore();
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    if (!accessToken) return;

    let refreshing = false;
    let active = true;
    let retryTimer: number | undefined;
    const renewAccessToken = async () => {
      if (refreshing) return;
      refreshing = true;
      try {
        const { accessToken: refreshedToken } = await refreshSession();
        if (active) setAccessToken(refreshedToken);
      } catch (cause) {
        if (active && cause instanceof SessionExpiredError) {
          setAccessToken(undefined);
          setUser(undefined);
          setOrganizationId(undefined);
          setMessage("La sesión venció. Iniciá sesión nuevamente.");
        } else if (active) {
          window.clearTimeout(retryTimer);
          retryTimer = window.setTimeout(() => void renewAccessToken(), 15000);
        }
      } finally {
        refreshing = false;
      }
    };
    const intervalId = window.setInterval(
      () => {
        void renewAccessToken();
      },
      12 * 60 * 1000,
    );
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void renewAccessToken();
    };
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      active = false;
      window.clearInterval(intervalId);
      window.clearTimeout(retryTimer);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken || !organizationId) return;
    void Promise.all([
      getUsers(accessToken, organizationId),
      getUserCreateOptions(accessToken, organizationId),
      getRoles(accessToken, organizationId),
      getBranches(accessToken, organizationId),
    ])
      .then(([listedUsers, options, listedRoles, listedBranches]) => {
        setUsers(listedUsers);
        setCreateOptions(options);
        setRoles(listedRoles);
        setBranches(listedBranches);
        setSelectedBranchIds(
          options.branches.slice(0, 1).map((branch) => branch.id),
        );
        setSelectedRoleIds(
          options.roles
            .filter((role) => role.code === "USER")
            .map((role) => role.id),
        );
      })
      .catch(() =>
        setMessage("No se pudo cargar la administracion de usuarios."),
      );
  }, [accessToken, organizationId]);

  const submitNewUser = async (
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();
    if (!accessToken || !organizationId) return;
    setCreating(true);
    setMessage(undefined);
    try {
      await createUser(accessToken, organizationId, {
        email: newUserEmail,
        password: newUserPassword,
        branchIds: selectedBranchIds,
        roleIds: selectedRoleIds,
      });
      setUsers(await getUsers(accessToken, organizationId));
      setNewUserEmail("");
      setNewUserPassword("");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "No se pudo crear el usuario.",
      );
    } finally {
      setCreating(false);
    }
  };

  const submitBranch = async (
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();
    if (!accessToken || !organizationId) return;
    setMessage(undefined);
    try {
      await createBranch(accessToken, organizationId, {
        name: branchName,
        code: branchCode,
      });
      setBranches(await getBranches(accessToken, organizationId));
      setBranchName("");
      setBranchCode("");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "No se pudo crear la sucursal.",
      );
    }
  };

  const setUserActive = async (
    listedUser: UserListItem,
    active: boolean,
  ): Promise<void> => {
    if (!accessToken || !organizationId) return;
    setMessage(undefined);
    try {
      await updateUser(accessToken, organizationId, listedUser.user.id, {
        active,
        branchIds: listedUser.branches.map(({ branch }) => branch.id),
        roleIds: listedUser.roles.map(({ role }) => role.id),
      });
      setUsers(await getUsers(accessToken, organizationId));
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "No se pudo actualizar el usuario.",
      );
    }
  };

  const submitRole = async (
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();
    if (!accessToken || !organizationId) return;
    try {
      await createRole(accessToken, organizationId, {
        name: roleName,
        code: roleCode,
        permissionCodes: rolePermissionCodes,
      });
      setRoles(await getRoles(accessToken, organizationId));
      setRoleName("");
      setRoleCode("");
      setRolePermissionCodes([]);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "No se pudo crear el rol.",
      );
    }
  };

  if (user)
    return (
      <ProductImageSession key={user}>
        <WorkspaceShell
          email={user}
          displayName={accountName}
          organizationName={organizationName}
          accessToken={accessToken}
          organizationId={organizationId}
          onLogout={() => {
            void logout();
            setUser(undefined);
            setAccessToken(undefined);
            setOrganizationId(undefined);
          }}
        />
      </ProductImageSession>
    );
  if (showLegacyWorkspace && user)
    return (
      <main className="min-h-screen bg-slate-100 text-slate-900">
        <header className="flex h-14 items-center justify-between border-b border-slate-200 bg-white px-5">
          <div className="flex items-center gap-3">
            <div className="flex size-8 items-center justify-center bg-teal-700 text-white">
              <Building2 className="size-4" />
            </div>
            <span className="font-semibold">Sistema de Gestion</span>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <span className="text-slate-600">{user}</span>
            <button
              type="button"
              onClick={() => setShowLegacyWorkspace(false)}
              className="text-teal-700"
            >
              Operacion
            </button>
            <button
              type="button"
              onClick={() => {
                void logout();
                setUser(undefined);
                setAccessToken(undefined);
                setOrganizationId(undefined);
                setUsers([]);
              }}
              title="Cerrar sesion"
              className="grid size-8 place-items-center text-slate-600 hover:bg-slate-100"
            >
              <LogOut className="size-4" />
            </button>
          </div>
        </header>
        <div className="grid min-h-[calc(100vh-3.5rem)] grid-cols-[220px_1fr]">
          <aside className="border-r border-slate-200 bg-white p-3">
            <p className="px-3 py-2 text-xs font-semibold text-slate-500">
              OPERACION
            </p>
            <nav className="grid gap-1">
              {[
                [Package, "Inicio"],
                [Package, "Ventas"],
                [Package, "Productos"],
                [Package, "Compras"],
                [Package, "Inventario"],
                [Package, "Transferencias"],
                [Users, "Clientes"],
                [Building2, "Proveedores"],
                [Settings, "Caja"],
                [ShieldCheck, "Reportes"],
              ].map(([Icon, label]) => {
                const NavigationIcon = Icon as typeof Package;
                return (
                  <button
                    key={label as string}
                    type="button"
                    onClick={() => setShowLegacyWorkspace(false)}
                    className="flex h-10 items-center gap-3 px-3 text-sm text-slate-600 hover:bg-slate-50"
                  >
                    <NavigationIcon className="size-4" />
                    {label as string}
                  </button>
                );
              })}
            </nav>
            <p className="px-3 py-2 text-xs font-semibold text-slate-500">
              ADMINISTRACION
            </p>
            <nav className="grid gap-1">
              <button
                type="button"
                onClick={() => {
                  setView("catalog");
                  void loadCatalog();
                }}
                className="flex h-10 items-center gap-3 px-3 text-sm text-slate-600"
              >
                <Package className="size-4" />
                Catalogo
              </button>
              <button
                className={`flex h-10 items-center gap-3 px-3 text-sm ${view === "users" ? "bg-teal-50 font-medium text-teal-800" : "text-slate-600"}`}
                type="button"
                onClick={() => setView("users")}
              >
                <Users className="size-4" />
                Usuarios
              </button>
              <button
                className={`flex h-10 items-center gap-3 px-3 text-sm ${view === "roles" ? "bg-teal-50 font-medium text-teal-800" : "text-slate-600"}`}
                type="button"
                onClick={() => setView("roles")}
              >
                <ShieldCheck className="size-4" />
                Roles y permisos
              </button>
              <button
                className={`flex h-10 items-center gap-3 px-3 text-sm ${view === "organization" ? "bg-teal-50 font-medium text-teal-800" : "text-slate-600"}`}
                type="button"
                onClick={() => setView("organization")}
              >
                <Settings className="size-4" />
                Organizacion
              </button>
            </nav>
          </aside>
          <section className="p-8">
            <p className="text-sm font-medium text-teal-700">
              DEMO ORGANIZATION / CASA CENTRAL
            </p>
            <h1 className="mt-2 text-2xl font-semibold">
              {view === "users"
                ? "Administracion de acceso"
                : view === "roles"
                  ? "Roles y permisos"
                  : view === "catalog"
                    ? "Catalogo de productos"
                    : "Sucursales"}
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-600">
              {view === "users"
                ? "Usuarios activos de la organizacion y sus roles de acceso."
                : view === "roles"
                  ? "Permisos efectivos de cada rol de esta organizacion."
                  : view === "catalog"
                    ? "Productos farmacéuticos y sus precios actuales."
                    : "Sucursales operativas de la organizacion."}
            </p>
            {message ? (
              <p className="mt-4 text-sm text-red-700">{message}</p>
            ) : null}
            {view === "users" ? (
              <div className="mt-8 grid max-w-5xl gap-6 lg:grid-cols-[1.2fr_0.8fr]">
                <div className="border border-slate-200 bg-white">
                  <div className="grid grid-cols-[1fr_160px_100px] border-b border-slate-200 px-5 py-3 text-xs font-semibold text-slate-500">
                    <span>USUARIO</span>
                    <span>ROL</span>
                    <span />
                  </div>
                  {users.map((membership) => (
                    <div
                      key={membership.user.id}
                      className="grid grid-cols-[1fr_160px_100px] items-center border-b border-slate-100 px-5 py-4 text-sm last:border-b-0"
                    >
                      <span
                        className={
                          membership.active ? "" : "text-slate-400 line-through"
                        }
                      >
                        {membership.user.email}
                      </span>
                      <span>
                        {membership.roles
                          .map(({ role }) => role.code)
                          .join(", ")}
                      </span>
                      {membership.user.email !== user ? (
                        <button
                          type="button"
                          className="text-right text-xs font-medium text-teal-700"
                          onClick={() =>
                            void setUserActive(membership, !membership.active)
                          }
                        >
                          {membership.active ? "Desactivar" : "Activar"}
                        </button>
                      ) : null}
                    </div>
                  ))}
                </div>
                <form
                  className="border border-slate-200 bg-white p-5"
                  onSubmit={(event) => void submitNewUser(event)}
                >
                  <h2 className="text-base font-semibold">Nuevo usuario</h2>
                  <label className="mt-4 block text-sm font-medium">
                    Email
                    <input
                      required
                      type="email"
                      value={newUserEmail}
                      onChange={(event) => setNewUserEmail(event.target.value)}
                      className="mt-1 h-10 w-full border border-slate-300 px-3"
                    />
                  </label>
                  <label className="mt-4 block text-sm font-medium">
                    Contrasena
                    <input
                      required
                      minLength={12}
                      type="password"
                      value={newUserPassword}
                      onChange={(event) =>
                        setNewUserPassword(event.target.value)
                      }
                      className="mt-1 h-10 w-full border border-slate-300 px-3"
                    />
                  </label>
                  <fieldset className="mt-4">
                    <legend className="text-sm font-medium">Sucursales</legend>
                    {createOptions?.branches.map((branch) => (
                      <label
                        key={branch.id}
                        className="mt-2 flex items-center gap-2 text-sm"
                      >
                        <input
                          checked={selectedBranchIds.includes(branch.id)}
                          type="checkbox"
                          onChange={(event) =>
                            setSelectedBranchIds((ids) =>
                              event.target.checked
                                ? [...ids, branch.id]
                                : ids.filter((id) => id !== branch.id),
                            )
                          }
                        />
                        {branch.name}
                      </label>
                    ))}
                  </fieldset>
                  <fieldset className="mt-4">
                    <legend className="text-sm font-medium">Roles</legend>
                    {createOptions?.roles.map((role) => (
                      <label
                        key={role.id}
                        className="mt-2 flex items-center gap-2 text-sm"
                      >
                        <input
                          checked={selectedRoleIds.includes(role.id)}
                          type="checkbox"
                          onChange={(event) =>
                            setSelectedRoleIds((ids) =>
                              event.target.checked
                                ? [...ids, role.id]
                                : ids.filter((id) => id !== role.id),
                            )
                          }
                        />
                        {role.name}
                      </label>
                    ))}
                  </fieldset>
                  <button
                    disabled={creating || !createOptions}
                    type="submit"
                    className="mt-6 h-10 w-full bg-teal-700 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-400"
                  >
                    {creating ? "Creando..." : "Crear usuario"}
                  </button>
                </form>
              </div>
            ) : null}
            {view === "catalog" ? (
              <div className="mt-8 grid max-w-5xl gap-6 lg:grid-cols-2">
                <div className="border border-slate-200 bg-white">
                  <div className="border-b border-slate-200 p-4">
                    <input
                      type="search"
                      value={productQuery}
                      onChange={(event) => setProductQuery(event.target.value)}
                      placeholder="Buscar producto"
                      className="h-10 w-full border border-slate-300 px-3"
                    />
                  </div>
                  {products
                    .filter((product) =>
                      product.name
                        .toLocaleLowerCase()
                        .includes(productQuery.trim().toLocaleLowerCase()),
                    )
                    .map((product) => (
                      <div
                        key={product.id}
                        className="border-b border-slate-100 px-5 py-4"
                      >
                        <p className="font-medium">{product.name}</p>
                        <p className="text-sm text-slate-600">
                          $
                          {(
                            Number(product.prices[0]?.amountMinor ?? 0) / 100
                          ).toFixed(2)}
                        </p>
                      </div>
                    ))}
                </div>
                <form
                  className="border border-slate-200 bg-white p-5"
                  onSubmit={(event) => void submitProduct(event)}
                >
                  <h2 className="font-semibold">Nuevo producto</h2>
                  <input
                    required
                    placeholder="Nombre"
                    value={productName}
                    onChange={(event) => setProductName(event.target.value)}
                    className="mt-4 h-10 w-full border px-3"
                  />
                  <input
                    required
                    type="number"
                    step="any"
                    placeholder="Precio"
                    value={productPrice}
                    onChange={(event) => setProductPrice(event.target.value)}
                    className="mt-3 h-10 w-full border px-3"
                  />
                  <button className="mt-4 h-10 w-full bg-teal-700 text-white">
                    Crear producto
                  </button>
                </form>
              </div>
            ) : null}
            {view === "roles" ? (
              <div className="mt-8 grid max-w-5xl gap-6 lg:grid-cols-[1.2fr_0.8fr]">
                <div className="border border-slate-200 bg-white">
                  {roles.map((role) => {
                    const assignedPermissions = new Set(
                      role.permissions.map(({ permission }) => permission.code),
                    );
                    return (
                      <article
                        key={role.id}
                        className="border-b border-slate-100 px-5 py-5 last:border-b-0"
                      >
                        <h2 className="font-semibold">
                          {role.name}{" "}
                          <span className="text-sm font-normal text-slate-500">
                            {role.code}
                          </span>
                        </h2>
                        {role.permissions.length ? (
                          <div className="mt-4 grid gap-4 sm:grid-cols-3">
                            {permissionGroups.map((group) => {
                              const permissions = group.permissions.filter(
                                ({ code }) => assignedPermissions.has(code),
                              );
                              if (!permissions.length) return null;
                              return (
                                <div key={group.title}>
                                  <p className="text-xs font-semibold text-slate-500">
                                    {group.title.toUpperCase()}
                                  </p>
                                  <div className="mt-2 flex flex-wrap gap-2">
                                    {permissions.map(({ code, label }) => (
                                      <span
                                        key={code}
                                        className="border border-teal-200 bg-teal-50 px-2 py-1 text-xs text-teal-800"
                                      >
                                        {label}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="mt-2 text-sm text-slate-600">
                            Sin permisos administrativos asignados.
                          </p>
                        )}
                      </article>
                    );
                  })}
                </div>
                <form
                  className="border border-slate-200 bg-white p-5"
                  onSubmit={(event) => void submitRole(event)}
                >
                  <h2 className="text-base font-semibold">Nuevo rol</h2>
                  <label className="mt-4 block text-sm font-medium">
                    Nombre
                    <input
                      required
                      minLength={2}
                      value={roleName}
                      onChange={(event) => setRoleName(event.target.value)}
                      className="mt-1 h-10 w-full border border-slate-300 px-3"
                    />
                  </label>
                  <label className="mt-4 block text-sm font-medium">
                    Codigo
                    <input
                      required
                      value={roleCode}
                      onChange={(event) =>
                        setRoleCode(event.target.value.toUpperCase())
                      }
                      className="mt-1 h-10 w-full border border-slate-300 px-3"
                    />
                  </label>
                  <fieldset className="mt-4">
                    <legend className="text-sm font-medium">Permisos</legend>
                    {rolePermissionOptions.map(({ code, label }) => (
                      <label
                        key={code}
                        className="mt-2 flex items-center gap-2 text-sm"
                      >
                        <input
                          type="checkbox"
                          checked={rolePermissionCodes.includes(code)}
                          onChange={(event) =>
                            setRolePermissionCodes((codes) =>
                              event.target.checked
                                ? [...codes, code]
                                : codes.filter((item) => item !== code),
                            )
                          }
                        />
                        {label}
                      </label>
                    ))}
                  </fieldset>
                  <button
                    disabled={!rolePermissionCodes.length}
                    type="submit"
                    className="mt-6 h-10 w-full bg-teal-700 text-sm font-medium text-white disabled:bg-slate-400"
                  >
                    Crear rol
                  </button>
                </form>
              </div>
            ) : null}
            {view === "organization" ? (
              <div className="mt-8 grid max-w-4xl gap-6 lg:grid-cols-[1fr_0.8fr]">
                <div className="border border-slate-200 bg-white">
                  {branches.map((branch) => (
                    <div
                      key={branch.id}
                      className="border-b border-slate-100 px-5 py-4 last:border-b-0"
                    >
                      <p className="font-medium">{branch.name}</p>
                      <p className="mt-1 text-sm text-slate-600">
                        {branch.code}
                      </p>
                    </div>
                  ))}
                </div>
                <form
                  className="border border-slate-200 bg-white p-5"
                  onSubmit={(event) => void submitBranch(event)}
                >
                  <h2 className="text-base font-semibold">Nueva sucursal</h2>
                  <label className="mt-4 block text-sm font-medium">
                    Nombre
                    <input
                      required
                      minLength={2}
                      value={branchName}
                      onChange={(event) => setBranchName(event.target.value)}
                      className="mt-1 h-10 w-full border border-slate-300 px-3"
                    />
                  </label>
                  <label className="mt-4 block text-sm font-medium">
                    Codigo
                    <input
                      required
                      minLength={2}
                      maxLength={32}
                      value={branchCode}
                      onChange={(event) =>
                        setBranchCode(event.target.value.toUpperCase())
                      }
                      className="mt-1 h-10 w-full border border-slate-300 px-3"
                    />
                  </label>
                  <button
                    className="mt-6 h-10 w-full bg-teal-700 text-sm font-medium text-white"
                    type="submit"
                  >
                    Crear sucursal
                  </button>
                </form>
              </div>
            ) : null}
            <div className="mt-4 grid max-w-3xl gap-4 md:grid-cols-2">
              <article className="border border-slate-200 bg-white p-5">
                <p className="text-sm font-medium">Sesion protegida</p>
                <p className="mt-2 text-sm text-slate-600">
                  Autenticacion con contrasenas hasheadas y sesiones revocables.
                </p>
              </article>
              <article className="border border-slate-200 bg-white p-5">
                <p className="text-sm font-medium">Alcance preparado</p>
                <p className="mt-2 text-sm text-slate-600">
                  Usuarios, organizaciones, sucursales, roles y permisos se
                  modelan por separado.
                </p>
              </article>
            </div>
          </section>
        </div>
      </main>
    );
  if (restoringSession) {
    return <SessionStartup failed={sessionRestoreFailed} />;
  }

  return (
    <LoginScreen
      email={email}
      password={password}
      message={message}
      onEmailChange={setEmail}
      onPasswordChange={setPassword}
      onSubmit={submit}
    />
  );
}
