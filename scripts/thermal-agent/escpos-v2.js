const ESC = 0x1b;
const GS = 0x1d;
const WIDTH = 48;
const logoBitmap = require("./logo-bitmap.json");
const storeNameBitmap = require("./store-name-bitmap.json");

function sanitize(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ñ/g, "n")
    .replace(/Ñ/g, "N")
    .replace(/¡/g, "!")
    .replace(/¿/g, "?")
    .replace(/[×]/g, "x")
    .replace(/[·]/g, "-")
    .replace(/[–—−]/g, "-")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[^\x20-\x7e]/g, "?");
}

function moneyText(value) {
  const signed = BigInt(value);
  const minor = signed < 0n ? -signed : signed;
  return (
    (signed < 0n ? "- " : "") +
    "$ " +
    (minor / 100n).toLocaleString("es-AR") +
    "," +
    String(minor % 100n).padStart(2, "0")
  );
}

function qty(value) {
  const n = Number(value || 0);
  return Number.isInteger(n)
    ? String(n)
    : n.toLocaleString("es-AR", { maximumFractionDigits: 3 });
}

function fit(text, width) {
  text = sanitize(text);
  return text.length > width ? text.slice(0, width) : text;
}

function lrRaw(left, right, width = WIDTH) {
  left = sanitize(left);
  right = sanitize(right);
  if (right.length >= width)
    return { left: "", spaces: "", right: right.slice(0, width) };
  left = fit(left, Math.max(0, width - right.length - 1));
  return {
    left,
    spaces: " ".repeat(Math.max(1, width - left.length - right.length)),
    right,
  };
}

function wrap(text, width = WIDTH) {
  text = sanitize(text).trim();
  if (!text) return [""];
  const words = text.split(/\s+/);
  const lines = [];
  let line = "";

  for (const word of words) {
    if (!line) {
      if (word.length <= width) line = word;
      else {
        for (let i = 0; i < word.length; i += width) {
          lines.push(word.slice(i, i + width));
        }
      }
      continue;
    }

    if ((line + " " + word).length <= width) {
      line += " " + word;
    } else {
      lines.push(line);
      if (word.length <= width) {
        line = word;
      } else {
        for (let i = 0; i < word.length; i += width) {
          lines.push(word.slice(i, i + width));
        }
        line = "";
      }
    }
  }

  if (line) lines.push(line);
  return lines;
}

class Builder {
  constructor() {
    this.parts = [];
  }
  bytes(...v) {
    this.parts.push(Buffer.from(v));
    return this;
  }
  buffer(v) {
    this.parts.push(Buffer.from(v));
    return this;
  }
  text(v) {
    this.parts.push(Buffer.from(sanitize(v), "ascii"));
    return this;
  }
  line(v = "") {
    return this.text(v).bytes(0x0a);
  }
  init() {
    return this.bytes(ESC, 0x40);
  }
  alignLeft() {
    return this.bytes(ESC, 0x61, 0x00);
  }
  alignCenter() {
    return this.bytes(ESC, 0x61, 0x01);
  }
  bold(on = true) {
    return this.bytes(ESC, 0x45, on ? 1 : 0);
  }
  normal() {
    return this.bytes(GS, 0x21, 0x00);
  }
  doubleHeight() {
    return this.bytes(GS, 0x21, 0x01);
  }
  double() {
    return this.bytes(GS, 0x21, 0x11);
  }
  feed(n = 4) {
    for (let i = 0; i < n; i++) this.line();
    return this;
  }
  cut() {
    return this.bytes(GS, 0x56, 0x42, 0x00);
  }
  openDrawer() {
    return this.bytes(ESC, 0x70, 0x00, 0x19, 0xfa);
  }
  raster(widthBytes, height, data) {
    const xL = widthBytes & 255;
    const xH = (widthBytes >> 8) & 255;
    const yL = height & 255;
    const yH = (height >> 8) & 255;
    return this.bytes(GS, 0x76, 0x30, 0x00, xL, xH, yL, yH).buffer(data);
  }
  barcode39(text) {
    const safe = sanitize(text)
      .toUpperCase()
      .replace(/[^0-9A-Z \-\.\$\/\+%]/g, "");
    this.bytes(GS, 0x48, 0x00);
    this.bytes(GS, 0x68, 0x3c);
    this.bytes(GS, 0x77, 0x02);
    this.bytes(GS, 0x6b, 0x04).text(safe).bytes(0x00);
    return this;
  }
  build() {
    return Buffer.concat(this.parts);
  }
}

function normalizeSale(input) {
  return {
    ...input,
    store: {
      name: input.store?.name || "",
      address: input.store?.address || "",
      contact: input.store?.contact || "",
      logoRaster: input.store?.logoRaster,
    },
    date: new Date(input.date).toLocaleString("es-AR", {
      timeZone: "America/Argentina/Buenos_Aires",
    }),
  };
}

function printLogo(b, raster) {
  if (raster) {
    if (!/^[0-9a-f]{4096}$/.test(raster))
      throw new Error("Invalid ticket logo");
    b.alignCenter().raster(16, 128, Buffer.from(raster, "hex")).line();
    return;
  }
  if (!logoBitmap?.dataBase64) return;
  b.alignCenter()
    .raster(
      logoBitmap.widthBytes,
      logoBitmap.height,
      Buffer.from(logoBitmap.dataBase64, "base64"),
    )
    .line();
}

function printProductionHeader(b, store) {
  // V20:
  // - logo como bitmap
  // - FARMACIA JUNCOS como bitmap de texto para que se parezca a la vista previa
  // - datos de la farmacia en texto nativo, misma base que SUBTOTAL
  printLogo(b, store.logoRaster);

  b.alignCenter();
  const expectedName = sanitize(store?.name).toUpperCase();
  const bitmapName = sanitize(storeNameBitmap?.text || "").toUpperCase();

  if (storeNameBitmap?.dataBase64 && expectedName === bitmapName) {
    b.raster(
      storeNameBitmap.widthBytes,
      storeNameBitmap.height,
      Buffer.from(storeNameBitmap.dataBase64, "base64"),
    ).line();
  } else {
    b.bold(true).double();
    for (const line of wrap(store.name.toUpperCase(), 24)) b.line(line);
    b.normal();
  }

  b.bold(true);
  if (store.address)
    for (const line of wrap(store.address, WIDTH)) b.line(line);
  if (store.contact)
    for (const line of wrap(store.contact, WIDTH)) b.line(line);
  b.bold(false).line();
}

function splitMoneySegments(text) {
  text = sanitize(text);
  return text
    .split(/(\$)/)
    .filter(Boolean)
    .map((text) => ({ text, bold: text !== "$" }));
}

function printSegmentsLine(b, segments) {
  for (const seg of segments) {
    b.bold(seg.bold !== false);
    b.text(seg.text);
  }
  b.bytes(0x0a);
  return b;
}

function printMoneyLine(b, left, right, width = WIDTH) {
  if (sanitize(left).length + sanitize(right).length + 1 > width) {
    for (const line of wrap(left, width))
      printSegmentsLine(b, splitMoneySegments(line));
    left = "";
  }
  const row = lrRaw(left, right, width);
  return printSegmentsLine(b, [
    ...splitMoneySegments(row.left),
    { text: row.spaces, bold: true },
    ...splitMoneySegments(row.right),
  ]);
}

function printPlainMoneyLine(b, left, right) {
  return b
    .bold(true)
    .line(
      lrRaw(left, right, WIDTH).left +
        lrRaw(left, right, WIDTH).spaces +
        lrRaw(left, right, WIDTH).right,
    );
}

function printPayment(b, payment) {
  if (!payment) return;

  b.line("-".repeat(WIDTH));
  b.alignCenter().bold(true).line("FORMA DE PAGO").alignLeft();

  if (typeof payment === "string") {
    b.bold(true).line(payment.toUpperCase());
  } else if (Array.isArray(payment)) {
    for (const p of payment) {
      const label = (p.method || p.type || "PAGO").toUpperCase();
      if (p.amount != null) printMoneyLine(b, label, moneyText(p.amount));
      else b.bold(true).line(label);
    }
  } else {
    const label = (payment.method || payment.type || "PAGO").toUpperCase();
    if (payment.amount != null)
      printMoneyLine(b, label, moneyText(payment.amount));
    else b.bold(true).line(label);

    if (payment.received != null)
      printMoneyLine(b, "RECIBIDO", moneyText(payment.received));
    if (payment.change != null)
      printMoneyLine(b, "VUELTO", moneyText(payment.change));
  }

  b.bold(false);
}

function printMetadata(b, label, value) {
  const lines = wrap(value, WIDTH - label.length - 2);
  lines.forEach((line, index) => {
    const row = lrRaw(index === 0 ? label : "", line);
    b.line(row.left + row.spaces + row.right);
  });
}

function buildTicketV2(input, options = {}) {
  const density = input.store?.printDensity ?? 4;
  if (!Number.isInteger(density) || density < 1 || density > 8)
    throw new Error("Densidad de impresión inválida.");
  const s = normalizeSale(input);
  const b = new Builder();

  // Borrador final actual:
  // - encabezado bitmap
  // - cuerpo con configuración "B"
  // - signo $ sin bold
  // Xprinter profile: same density-4 prefix as the supplied V24 physical test.
  // Vendor-specific command; not a universal ESC/POS density setting.
  b.bytes(0x1f, 0x1b, 0x1f, 0x13, 0x14, density);
  b.init().normal();

  printProductionHeader(b, s.store);

  b.alignLeft().bold(true);
  b.line("-".repeat(WIDTH));
  if (s.kind === "account") b.line("RECIBO DE CUENTA CORRIENTE");
  if (s.cancelled) b.line("*** VENTA ANULADA ***");
  printMetadata(b, s.kind === "account" ? "RECIBO" : "TICKET", `#${s.number}`);
  b.line(
    lrRaw("FECHA", s.date, WIDTH).left +
      lrRaw("FECHA", s.date, WIDTH).spaces +
      lrRaw("FECHA", s.date, WIDTH).right,
  );
  if (s.cashier) {
    b.line(
      lrRaw("ATENDIO", s.cashier.toUpperCase(), WIDTH).left +
        lrRaw("ATENDIO", s.cashier.toUpperCase(), WIDTH).spaces +
        lrRaw("ATENDIO", s.cashier.toUpperCase(), WIDTH).right,
    );
  }
  printMetadata(b, "SUCURSAL", s.branch);
  printMetadata(b, "CLIENTE", s.customer);
  b.line("-".repeat(WIDTH));
  b.line();

  b.line(
    lrRaw("PRODUCTO", "IMPORTE", WIDTH).left +
      lrRaw("PRODUCTO", "IMPORTE", WIDTH).spaces +
      lrRaw("PRODUCTO", "IMPORTE", WIDTH).right,
  );
  b.line();

  for (const item of s.items) {
    for (const nameLine of wrap(String(item.name || "").toUpperCase(), WIDTH)) {
      b.bold(true).line(nameLine);
    }

    printMoneyLine(
      b,
      item.quantity == null
        ? "PAGADO"
        : `${qty(item.quantity)} x ${moneyText(item.unitPriceMinor)}`,
      moneyText(item.amountMinor),
    );
    b.line();
  }

  b.line("-".repeat(WIDTH));
  if (s.subtotalMinor != null)
    printMoneyLine(b, "SUBTOTAL", moneyText(s.subtotalMinor));

  if (BigInt(s.discountMinor || "0") > 0n) {
    printMoneyLine(b, "DESCUENTO", `- ${moneyText(s.discountMinor)}`);
  }

  b.line("-".repeat(WIDTH));

  const totalRow = lrRaw(
    s.kind === "account" ? "RECIBIDO" : "TOTAL",
    moneyText(s.totalMinor),
    24,
  );
  b.double();
  printSegmentsLine(b, [
    { text: totalRow.left, bold: true },
    { text: totalRow.spaces, bold: true },
    ...splitMoneySegments(totalRow.right),
  ]);
  b.normal();

  const labels = {
    CASH: "EFECTIVO",
    CARD: "TARJETA",
    TRANSFER: "TRANSFERENCIA",
    ACCOUNT: "CUENTA CORRIENTE",
    OTHER: "OTRO",
  };
  printPayment(
    b,
    s.payments.map((p) => ({
      method: labels[p.method] || p.method,
      amount: p.amountMinor,
    })),
  );
  if (s.receivedMinor != null)
    printMoneyLine(b, "RECIBIDO EFECTIVO", moneyText(s.receivedMinor));
  if (s.changeMinor != null)
    printMoneyLine(b, "VUELTO", moneyText(s.changeMinor));
  if (s.balanceAfterMinor != null)
    printMoneyLine(
      b,
      "SALDO PENDIENTE AL COBRAR",
      moneyText(s.balanceAfterMinor),
    );
  if (s.note)
    for (const line of wrap(s.note))
      printSegmentsLine(b, splitMoneySegments(line));

  b.line("-".repeat(WIDTH));
  b.alignCenter()
    .bold(true)
    .line(
      s.kind === "account"
        ? "!GRACIAS POR TU PAGO!"
        : "!GRACIAS POR TU COMPRA!",
    );
  b.line("Conserva este comprobante.");
  b.bold(false).line();

  const barcodeValue = s.number;

  b.barcode39(barcodeValue).line();
  b.bold(true).line(`#${barcodeValue}`).bold(false);

  if (options.openDrawer) b.openDrawer();

  b.feed(4).cut();
  return b.build();
}

module.exports = { buildTicketV2, splitMoneySegments, wrap };
