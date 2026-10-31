function validateTicket(ticket) {
  const density = ticket?.store?.printDensity;
  if (
    density != null &&
    (!Number.isInteger(density) || density < 1 || density > 8)
  )
    throw new Error("Densidad de impresión inválida.");
  const text = (value, max = 500) =>
    typeof value === "string" &&
    value.length <= max &&
    !/[\x00-\x1f\x7f]/.test(value);
  const money = (value) =>
    typeof value === "string" && /^\d{1,12}$/.test(value);
  if (
    !ticket ||
    !["sale", "account"].includes(ticket.kind) ||
    !text(ticket.id, 80) ||
    !/^[A-Z0-9-]{1,12}$/.test(ticket.number) ||
    !text(ticket.date) ||
    !Number.isFinite(Date.parse(ticket.date)) ||
    !text(ticket.store?.name) ||
    !text(ticket.branch) ||
    !text(ticket.customer)
  )
    throw new Error("Datos de comprobante inválidos.");
  for (const value of [
    ticket.store.address,
    ticket.store.contact,
    ticket.cashier,
    ticket.note,
  ])
    if (value != null && !text(value, 2000))
      throw new Error("Texto de comprobante inválido.");
  if (!money(ticket.totalMinor)) throw new Error("Total inválido.");
  if (
    ticket.store.logoRaster != null &&
    (typeof ticket.store.logoRaster !== "string" ||
      !/^[0-9a-f]{4096}$/.test(ticket.store.logoRaster))
  )
    throw new Error("Logo inválido.");
  for (const value of [
    ticket.subtotalMinor,
    ticket.discountMinor,
    ticket.receivedMinor,
    ticket.changeMinor,
  ])
    if (value != null && !money(value)) throw new Error("Importe inválido.");
  if (
    ticket.balanceAfterMinor != null &&
    !/^-?\d{1,12}$/.test(ticket.balanceAfterMinor)
  )
    throw new Error("Saldo inválido.");
  if (
    !Array.isArray(ticket.items) ||
    ticket.items.length > 2000 ||
    !Array.isArray(ticket.payments) ||
    ticket.payments.length > 100
  )
    throw new Error("Demasiadas líneas.");
  for (const item of ticket.items)
    if (
      !text(item.name) ||
      !money(item.amountMinor) ||
      (item.quantity != null &&
        (!Number.isSafeInteger(item.quantity) ||
          item.quantity <= 0 ||
          !money(item.unitPriceMinor)))
    )
      throw new Error("Artículo inválido.");
  for (const payment of ticket.payments)
    if (!text(payment.method, 80) || !money(payment.amountMinor))
      throw new Error("Pago inválido.");
}
module.exports = { validateTicket };
