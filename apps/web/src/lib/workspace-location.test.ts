import { describe, expect, it } from "vitest";
import {
  readWorkspaceLocation,
  workspaceLocation,
  type WorkspaceView,
} from "./workspace-location";

describe("workspace navigation", () => {
  it.each<WorkspaceView>([
    "Inicio",
    "Ventas",
    "Productos",
    "Categorías y laboratorios",
    "Listas de precios",
    "Inventario",
    "Caja",
    "Compras",
    "Transferencias",
    "Reportes",
    "Clientes",
    "Cuentas corrientes",
    "Proveedores",
    "Administración",
    "Organización",
  ])("restores %s from the URL after reload", (view) => {
    const url = workspaceLocation(new URLSearchParams(), view);
    expect(
      readWorkspaceLocation(new URLSearchParams(url.toString())).view,
    ).toBe(view);
  });
  it("restores sales history and administration subsections", () => {
    expect(
      readWorkspaceLocation(
        workspaceLocation(new URLSearchParams(), "Ventas", "history"),
      ).salesScreen,
    ).toBe("history");
    for (const tab of ["users", "roles"] as const)
      expect(
        readWorkspaceLocation(
          workspaceLocation(new URLSearchParams(), "Administración", tab),
        ).administrationTab,
      ).toBe(tab);
  });
  it("handles unknown locations safely", () => {
    expect(
      readWorkspaceLocation(
        new URLSearchParams("pagina=unknown&seccion=history"),
      ),
    ).toEqual({
      view: "Inicio",
      salesScreen: "pos",
      administrationTab: "users",
      organizationTab: "general",
    });
  });
  it("clears the previous subsection without changing unrelated parameters", () => {
    const current = new URLSearchParams(
      "pagina=ventas&seccion=history&other=1",
    );
    const next = workspaceLocation(current, "Productos");
    expect(next.get("seccion")).toBeNull();
    expect(next.get("other")).toBe("1");
    expect(current.get("seccion")).toBe("history");
  });
  it.each(["general", "fiscal", "branches", "tickets"] as const)(
    "restores the independent organization section %s",
    (tab) => {
      const location = readWorkspaceLocation(
        workspaceLocation(new URLSearchParams(), "Organización", tab),
      );
      expect(location.view).toBe("Organización");
      expect(location.organizationTab).toBe(tab);
      expect(location.administrationTab).toBe("users");
    },
  );
  it("keeps old organization bookmarks working outside user administration", () => {
    const location = readWorkspaceLocation(
      new URLSearchParams("pagina=administracion&seccion=branches"),
    );
    expect(location.view).toBe("Organización");
    expect(location.organizationTab).toBe("branches");
  });
});
