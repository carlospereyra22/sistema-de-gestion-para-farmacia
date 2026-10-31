const pages = {
  inicio: "Inicio",
  productos: "Productos",
  categorias: "Categorías y laboratorios",
  precios: "Listas de precios",
  inventario: "Inventario",
  ventas: "Ventas",
  caja: "Caja",
  clientes: "Clientes",
  cuentas: "Cuentas corrientes",
  proveedores: "Proveedores",
  compras: "Compras",
  transferencias: "Transferencias",
  reportes: "Reportes",
  administracion: "Administración",
  organizacion: "Organización",
} as const;
export type WorkspaceView = (typeof pages)[keyof typeof pages];
export type AdministrationTab = "users" | "roles";
export type OrganizationTab = "general" | "branches" | "tickets" | "fiscal";

export function readWorkspaceLocation(params: URLSearchParams) {
  const page = params.get("pagina");
  let view: WorkspaceView =
    Object.entries(pages).find(([slug]) => slug === page)?.[1] ?? "Inicio";
  const tab = params.get("seccion");
  if (view === "Administración" && tab === "branches") view = "Organización";
  return {
    view,
    administrationTab: (view === "Administración" && tab === "roles"
      ? tab
      : "users") as AdministrationTab,
    organizationTab: (view === "Organización" &&
    (tab === "branches" || tab === "tickets" || tab === "fiscal")
      ? tab
      : "general") as OrganizationTab,
    salesScreen: (view === "Ventas" && tab === "history"
      ? "history"
      : "pos") as "history" | "pos",
  };
}

export function workspaceLocation(
  params: URLSearchParams,
  view: WorkspaceView,
  tab?: AdministrationTab | OrganizationTab | "pos" | "history",
) {
  const next = new URLSearchParams(params);
  const slug =
    Object.entries(pages).find(([, name]) => name === view)?.[0] ?? "inicio";
  if (slug === "inicio") next.delete("pagina");
  else next.set("pagina", slug);
  next.delete("seccion");
  if (
    (view === "Administración" && tab === "roles") ||
    (view === "Organización" &&
      (tab === "branches" || tab === "tickets" || tab === "fiscal")) ||
    (view === "Ventas" && tab === "history")
  )
    next.set("seccion", tab);
  return next;
}
