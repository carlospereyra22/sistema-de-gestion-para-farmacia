const { test } = require("node:test");
const assert = require("node:assert/strict");
const { buildTicketV2, splitMoneySegments, wrap } = require("./escpos-v2");
const { validateTicket } = require("./validate-ticket");
const ticket = {
  kind: "sale",
  id: "sale-id",
  number: "ABC12345",
  date: "2026-09-13T15:00:00Z",
  store: { name: "FARMACIA JUNCOS" },
  branch: "Central",
  customer: "Cliente",
  items: [
    {
      name: "Producto largo ".repeat(10),
      quantity: 2,
      unitPriceMinor: "1000",
      amountMinor: "2000",
    },
  ],
  subtotalMinor: "2000",
  discountMinor: "500",
  totalMinor: "1500",
  payments: [{ method: "CASH", amountMinor: "2000" }],
  receivedMinor: "2000",
  changeMinor: "500",
};
test("saved density changes only the density byte for sales and receipts", () => {
  for (const kind of ["sale", "account"]) {
    const base = { ...ticket, kind };
    const original = buildTicketV2(base);
    for (const printDensity of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const selected = { ...base, store: { ...base.store, printDensity } };
      validateTicket(selected);
      const bytes = buildTicketV2(selected);
      assert.equal(bytes[5], printDensity);
      assert.deepEqual(bytes.subarray(6), original.subarray(6));
    }
    for (const printDensity of [0, 9, -1, 2.5, "3"]) {
      const selected = { ...base, store: { ...base.store, printDensity } };
      assert.throws(() => validateTicket(selected));
      assert.throws(() => buildTicketV2(selected));
    }
  }
});
test("custom logo uses bounded raster bytes and rejects invalid data", () => {
  const custom = {
    ...ticket,
    store: { ...ticket.store, logoRaster: "a5".repeat(2048) },
  };
  validateTicket(custom);
  assert.ok(
    buildTicketV2(custom).includes(Buffer.from("a5".repeat(2048), "hex")),
  );
  assert.throws(() =>
    validateTicket({
      ...custom,
      store: { ...custom.store, logoRaster: "bad" },
    }),
  );
});
test("V21 uses authoritative totals, barcode, double total, normal dollars and cut", () => {
  validateTicket(ticket);
  const bytes = buildTicketV2(ticket);
  assert.deepEqual([...bytes.subarray(0, 8)], [31, 27, 31, 19, 20, 4, 27, 64]);
  assert.ok(bytes.includes(Buffer.from([29, 33, 17])));
  assert.ok(bytes.includes(Buffer.from([27, 69, 0, 36, 27, 69, 1])));
  assert.ok(bytes.includes(Buffer.from(" 15,00")));
  assert.ok(
    bytes.includes(Buffer.from([29, 107, 4, ...Buffer.from(ticket.number), 0])),
  );
  assert.deepEqual([...bytes.subarray(-4)], [29, 86, 66, 0]);
  assert.ok(bytes.includes(Buffer.from("VUELTO")));
  const text = bytes.toString("ascii");
  assert.ok(
    text.includes(
      "TICKET" +
        " ".repeat(48 - 6 - ticket.number.length - 1) +
        "#" +
        ticket.number,
    ),
  );
  assert.ok(
    text.includes(
      "SUCURSAL" + " ".repeat(48 - 8 - ticket.branch.length) + ticket.branch,
    ),
  );
  assert.ok(!bytes.includes(Buffer.from("No es factura fiscal")));
  assert.ok(!bytes.includes(Buffer.from("Operacion:")));
  assert.ok(!bytes.includes(Buffer.from("Ivercrem")));
});
test("every dollar is normal and long names wrap at 48", () => {
  assert.deepEqual(
    splitMoneySegments("$ 1 $ 2")
      .filter((s) => !s.bold)
      .map((s) => s.text),
    ["$", "$"],
  );
  assert.ok(wrap("X".repeat(150)).every((line) => line.length <= 48));
});
test("account payments preserve balance including customer credit", () => {
  const account = {
    ...ticket,
    kind: "account",
    balanceAfterMinor: "-150",
    items: [{ name: "Abono parcial", amountMinor: "1500" }],
  };
  validateTicket(account);
  const bytes = buildTicketV2(account).toString("ascii");
  assert.ok(bytes.includes("RECIBO DE CUENTA CORRIENTE"));
  assert.ok(bytes.includes(" 1,50"));
});
test("rejects control commands, missing real data and malformed amounts", () => {
  for (const invalid of [
    { ...ticket, number: "" },
    { ...ticket, totalMinor: "1.5" },
    { ...ticket, date: "" },
    { ...ticket, customer: "\x1b@" },
  ])
    assert.throws(() => validateTicket(invalid));
});
