import { describe, expect, it } from "vitest";
import type { CashOrganizationRegister } from "./api";
import {
  filterOrganizationRegisters,
  organizationRegisterState,
} from "./cash-organization-registers";

const row = (
  id: string,
  branchId: string,
  open: boolean,
  active = true,
): CashOrganizationRegister => ({
  id,
  name: id,
  active,
  branchId,
  branchName: branchId,
  session: open ? { openedAt: "2026-11-06T14:00:00Z", openedBy: "Ana" } : null,
});
const rows = [row("a", "centro", true), row("b", "norte", false)];
const ids = (branchId: string, state: "" | "open" | "closed") =>
  filterOrganizationRegisters(rows, branchId, state).map((item) => item.id);

describe("filterOrganizationRegisters", () => {
  it("muestra todas sin filtros", () => {
    expect(ids("", "")).toEqual(["a", "b"]);
  });
  it("filtra por sucursal", () => {
    expect(ids("norte", "")).toEqual(["b"]);
  });
  it("filtra por estado", () => {
    expect(ids("", "open")).toEqual(["a"]);
    expect(ids("", "closed")).toEqual(["b"]);
  });
  it("combina sucursal y estado", () => {
    expect(ids("norte", "open")).toEqual([]);
  });
});

describe("organizationRegisterState", () => {
  it("distingue abierta, cerrada y deshabilitada", () => {
    expect(organizationRegisterState(row("a", "c", true))).toBe("Abierta");
    expect(organizationRegisterState(row("a", "c", false))).toBe("Cerrada");
    expect(organizationRegisterState(row("a", "c", false, false))).toBe(
      "Deshabilitada",
    );
  });
});
