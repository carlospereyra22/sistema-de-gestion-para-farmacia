import { describe, expect, it } from "vitest";
import type { CashSession } from "./api";
import {
  assignedCollectionsFirst,
  hasAssignedCollections,
  cashDifferenceView,
  cashSessionTotals,
  cashTimeline,
  defaultClosureRange,
  pendingCollectionsSummary,
} from "./cash-session-view";

const id = "0f8fad5b-d9cb-469f-a165-70867728950e";
const movement = (
  category: string,
  type: "IN" | "OUT",
  amountMinor: string,
  reason: string,
  createdAt = "2026-11-06T12:00:00Z",
) => ({ id: reason, category, type, amountMinor, reason, createdAt });

const session = (changes: Partial<CashSession> = {}): CashSession => ({
  id: "s",
  cashRegisterId: "r",
  openedAt: "2026-11-06T11:00:00Z",
  closedAt: null,
  openingAmountMinor: "1000",
  closingAmountMinor: null,
  cashSalesMinor: "0",
  saleChangeMinor: "0",
  cardMinor: "0",
  transferMinor: "0",
  manualInMinor: "0",
  manualOutMinor: "0",
  expectedAmountMinor: "1000",
  differenceMinor: null,
  movements: [],
  ...changes,
});

describe("línea de tiempo", () => {
  it("muestra conceptos legibles sin UUID ni fechas ISO", () => {
    const labels = cashTimeline(
      session({
        movements: [
          movement("SALE_CHANGE", "OUT", "200", `Vuelto de venta ${id}`),
          movement("SALE_CHANGE", "OUT", "1", `Change for sale ${id}`),
          movement(
            "SALE_CHANGE_REVERSAL",
            "IN",
            "200",
            `Anulación de vuelto · Venta ${id}: Error`,
          ),
          movement(
            "ACCOUNT_COLLECTION",
            "IN",
            "5",
            `Cobro cuenta corriente · Ana Pérez · Recibo ${id}`,
          ),
          movement(
            "PENDING_ASSIGNMENT",
            "IN",
            "6",
            `Asignación de cobro sin caja · Recibo ${id} · 2026-11-05T10:00:00.000Z`,
          ),
          movement(
            "PENDING_REVERSAL",
            "OUT",
            "6",
            `Anulación de cobro asignado · Venta ${id}: Error`,
          ),
          movement("CREDIT_NOTE", "OUT", "7", `Nota de crédito ${id}: Dev`),
          movement("MANUAL", "OUT", "8", "Pago de limpieza"),
          movement("MANUAL", "IN", "9", ""),
        ],
      }),
    ).map((entry) => entry.label);
    expect(labels).toEqual(
      expect.arrayContaining([
        "Vuelto · Venta 0f8fad5b",
        "Anulación de vuelto · Venta 0f8fad5b",
        "Cobro cuenta corriente · Ana Pérez",
        "Cobro incorporado · Recibo 0f8fad5b",
        "Anulación de cobro · Venta 0f8fad5b",
        "Nota de crédito · 0f8fad5b",
        "Pago de limpieza",
        "Movimiento sin motivo",
      ]),
    );
    expect(labels.join()).not.toContain(id);
    expect(labels.join()).not.toContain("2026-11-05");
  });

  it("incluye las ventas y ordena del más reciente al más antiguo", () => {
    const entries = cashTimeline(
      session({
        movements: [
          movement(
            "MANUAL",
            "OUT",
            "10",
            "Primero",
            "2026-11-06T10:00:00.000Z",
          ),
        ],
        cashPayments: [
          {
            id: "p",
            saleId: id,
            amountMinor: "800",
            createdAt: "2026-11-06T11:00:00.000Z",
          },
        ],
      }),
    );
    expect(entries.map((entry) => entry.label)).toEqual([
      "Venta · 0f8fad5b",
      "Primero",
    ]);
    expect(entries[0]).toMatchObject({ out: false, amountMinor: "800" });
    expect(entries[1]).toMatchObject({ out: true });
  });
});

it("los totales más el fondo reconstruyen el esperado de la API", () => {
  const value = session({
    openingAmountMinor: "1000",
    cashSalesMinor: "1800",
    saleChangeMinor: "200",
    manualInMinor: "850",
    manualOutMinor: "560",
    expectedAmountMinor: "3090",
    movements: [
      movement("SALE_CHANGE", "OUT", "400", `Vuelto de venta ${id}`),
      movement("SALE_CHANGE_REVERSAL", "IN", "200", "a"),
      movement("ACCOUNT_COLLECTION", "IN", "300", "b"),
      movement("PENDING_ASSIGNMENT", "IN", "100", "c"),
      movement("PENDING_REVERSAL", "OUT", "50", "d"),
      movement("CREDIT_NOTE", "OUT", "60", "e"),
      movement("MANUAL", "OUT", "50", "f"),
      movement("MANUAL", "IN", "250", "g"),
    ],
  });
  const { collectedMinor, otherInMinor, outflowsMinor } =
    cashSessionTotals(value);
  expect(collectedMinor).toBe(1950n);
  expect(otherInMinor).toBe(250n);
  expect(outflowsMinor).toBe(110n);
  expect(
    (
      BigInt(value.openingAmountMinor) +
      collectedMinor +
      otherInMinor -
      outflowsMinor
    ).toString(),
  ).toBe(value.expectedAmountMinor);
});

it("describe la diferencia sin repetir el signo", () => {
  expect(cashDifferenceView("-10000")).toMatchObject({
    label: "Faltante",
    tone: "short",
  });
  expect(cashDifferenceView("-10000").amount).not.toContain("-");
  expect(cashDifferenceView("500")).toMatchObject({
    label: "Sobrante",
    tone: "over",
  });
  expect(cashDifferenceView("0")).toMatchObject({
    label: "Sin diferencia",
    tone: "even",
  });
  expect(cashDifferenceView(null).tone).toBe("even");
});

it("usa los 30 días de la API en fechas de Argentina", () => {
  expect(defaultClosureRange(new Date("2026-11-06T02:00:00Z"))).toEqual({
    from: "2026-10-07",
    to: "2026-11-05",
  });
});

describe("cobros asignados a una caja", () => {
  const rows = [
    { id: "1", destinationRegisterId: null },
    { id: "2", destinationRegisterId: "otra" },
    { id: "3", destinationRegisterId: "caja" },
    { id: "4", destinationRegisterId: "caja" },
  ];
  it("detecta sólo los cobros de la caja que se abre", () => {
    expect(hasAssignedCollections(rows, "caja")).toBe(true);
    expect(hasAssignedCollections(rows, "sin-cobros")).toBe(false);
    expect(hasAssignedCollections([], "caja")).toBe(false);
  });
  it("los pone primero sin perder ni reordenar el resto", () => {
    expect(assignedCollectionsFirst(rows, "caja").map((row) => row.id)).toEqual(
      ["3", "4", "1", "2"],
    );
    expect(rows[0]?.id).toBe("1");
  });
});

it("resume los cobros pendientes sin perder centavos", () => {
  expect(
    pendingCollectionsSummary([
      { cashMinor: "100", cardMinor: "20", transferMinor: "3" },
      { cashMinor: "1", cardMinor: "0", transferMinor: "0" },
    ]),
  ).toEqual({ count: 2, totalMinor: 124n });
  expect(pendingCollectionsSummary([]).count).toBe(0);
});
