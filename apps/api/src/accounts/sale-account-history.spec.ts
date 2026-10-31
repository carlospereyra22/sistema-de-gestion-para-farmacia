import {
  saleAccountHistory,
  type SaleAccountMovement,
} from "./sale-account-history";
const debit: SaleAccountMovement = {
  id: "sale",
  saleId: "a",
  type: "DEBIT",
  amountMinor: 10000n,
  allocations: null,
  createdAt: new Date("2026-10-01T12:00:00Z"),
  actorId: "seller",
  note: null,
  paymentMethod: null,
};
const receipt = (
  amount: number,
  at = "2026-10-05T12:00:00Z",
): SaleAccountMovement => ({
  ...debit,
  id: "receipt",
  saleId: null,
  type: "CREDIT",
  paymentMethod: "TRANSFER",
  amountMinor: BigInt(amount + 5000),
  allocations: [
    { saleItemId: "item-a", amountMinor: amount },
    { saleItemId: "item-b", amountMinor: 5000 },
  ],
  createdAt: new Date(at),
});
const run = (
  movements: SaleAccountMovement[],
  reliable = true,
  now = "2026-10-15T12:00:00Z",
) =>
  saleAccountHistory(
    "a",
    ["item-a"],
    movements,
    new Date("2026-10-08T00:00:00Z"),
    new Date(now),
    reliable,
  );
it("shows only this sale's share of shared receipts, excluding unrelated and unassigned movements", () => {
  const history = run([
    debit,
    receipt(3000),
    { ...debit, id: "other", saleId: "b" },
    { ...receipt(1), id: "unassigned", allocations: null },
  ]);
  expect(history.receipts).toHaveLength(1);
  expect(history.receipts[0]).toMatchObject({
    amountMinor: "3000",
    receiptTotalMinor: "8000",
  });
  expect(history.events.map((e) => e.id).sort()).toEqual([
    "due",
    "receipt",
    "sale",
  ]);
  expect(history.events.find((e) => e.id === "due")).toMatchObject({
    at: "2026-10-09T03:00:00.000Z",
    amountMinor: "7000",
    calculated: true,
  });
});
it("does not invent arrears when paid before the deadline or before Argentina midnight", () => {
  expect(
    run([debit, receipt(10000)]).events.some((e) => e.kind === "due"),
  ).toBe(false);
  expect(
    run([debit], true, "2026-10-09T02:59:59Z").events.some(
      (e) => e.kind === "due",
    ),
  ).toBe(false);
  expect(
    run([debit, receipt(10000)]).events.find((e) => e.id === "receipt")
      ?.settled,
  ).toBe(true);
});
it("keeps adjustment and compensation records distinct from payments", () => {
  const history = run([
    debit,
    {
      ...debit,
      id: "adjust",
      amountMinor: 2000n,
      allocations: { kind: "MANUAL_DEBT_ADJUSTMENT" },
    },
    { ...debit, id: "cancel", type: "CREDIT", amountMinor: 12000n },
  ]);
  expect(history.receipts).toEqual([]);
  expect(history.events.find((e) => e.id === "adjust")?.title).toBe(
    "Actualización del saldo",
  );
  expect(history.events.find((e) => e.id === "cancel")?.kind).toBe("reversal");
});
it("suppresses inferred milestones for incomplete reconciliation", () => {
  const history = run([debit, receipt(10000, "2026-10-10T12:00:00Z")], false);
  expect(history.events.some((e) => e.calculated || e.settled)).toBe(false);
  expect(history.receipts).toHaveLength(1);
});
it("reads mixed receipts without treating other sales' amounts as this sale's payment", () => {
  const payment = receipt(2000);
  payment.allocations = {
    kind: "MIXED_RECEIPT",
    items: payment.allocations,
    payments: [],
  };
  expect(run([debit, payment]).receipts[0]?.amountMinor).toBe("2000");
});
