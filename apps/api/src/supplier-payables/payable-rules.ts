import { BadRequestException } from "@nestjs/common";

export const documentTypes = [
  "FACTURA_A",
  "FACTURA_B",
  "FACTURA_C",
  "OTRO",
] as const;
export type PayableInput = {
  operationId: string;
  supplierId: string;
  purchaseId?: string;
  documentType: string;
  pointOfSale: string;
  documentNumber: string;
  issuedOn: string;
  amountMinor: string;
  reference?: string;
  notes?: string;
  dues: { dueOn: string | null; amountMinor: string }[];
};
export function payableToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  return ["year", "month", "day"]
    .map((type) => parts.find((p) => p.type === type)!.value)
    .join("-");
}
export function civilDate(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw new BadRequestException("Revisá las fechas del comprobante.");
  const date = new Date(`${value}T00:00:00.000Z`);
  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value ||
    value < "1900-01-01"
  )
    throw new BadRequestException("La fecha no es válida.");
  return date;
}
export function payableAmount(value: string) {
  if (!/^\d{1,14}$/.test(value) || BigInt(value) <= 0n)
    throw new BadRequestException(
      "El importe debe ser mayor que cero, con hasta dos decimales.",
    );
  return BigInt(value);
}
export function documentIdentity(point: string, number: string) {
  let pointOfSale = point.trim(),
    documentNumber = number.trim();
  if (/^\d{1,5}\s*-\s*\d{1,20}$/.test(documentNumber)) {
    const [prefix, serial] = documentNumber.split("-").map((s) => s.trim()) as [
      string,
      string,
    ];
    if (
      pointOfSale &&
      (!/^\d{1,5}$/.test(pointOfSale) || BigInt(pointOfSale) !== BigInt(prefix))
    )
      throw new BadRequestException(
        "El punto de venta no coincide con el número completo ingresado.",
      );
    pointOfSale = pointOfSale || prefix;
    documentNumber = serial;
  }
  if (
    !/^\d{0,5}$/.test(pointOfSale) ||
    !/^[\p{L}\d][\p{L}\d ._/-]{0,59}$/u.test(documentNumber)
  )
    throw new BadRequestException(
      "Revisá el punto de venta y el número del comprobante.",
    );
  const key = (text: string) =>
    text
      .toLocaleUpperCase("es-AR")
      .replace(/[\s._/-]/g, "")
      .replace(/^0+(?=\d)/, "");
  return {
    pointOfSale,
    documentNumber,
    documentKey: `${key(pointOfSale || "0")}:${key(documentNumber)}`,
  };
}
export function validatePayable(input: PayableInput, today = payableToday()) {
  if (
    !documentTypes.includes(
      input.documentType as (typeof documentTypes)[number],
    )
  )
    throw new BadRequestException(
      "Elegí un tipo de documento de deuda válido.",
    );
  const issuedOn = civilDate(input.issuedOn);
  if (input.issuedOn > today)
    throw new BadRequestException("La emisión no puede estar en el futuro.");
  const amountMinor = payableAmount(input.amountMinor);
  if (!input.dues.length || input.dues.length > 36)
    throw new BadRequestException("Indicá entre 1 y 36 vencimientos.");
  const dues = input.dues.map((due, index) => {
    if (due.dueOn !== null && typeof due.dueOn !== "string")
      throw new BadRequestException(
        "Indicá una fecha o elegí Sin vencimiento definido.",
      );
    const dueOn = due.dueOn === null ? null : civilDate(due.dueOn);
    if (due.dueOn !== null && due.dueOn < input.issuedOn)
      throw new BadRequestException(
        "Un vencimiento no puede ser anterior a la emisión.",
      );
    if (input.dues.length > 1 && dueOn === null)
      throw new BadRequestException(
        "Cada vencimiento dividido necesita una fecha.",
      );
    return {
      sequence: index + 1,
      dueOn,
      amountMinor: payableAmount(due.amountMinor),
    };
  });
  if (dues.reduce((sum, d) => sum + d.amountMinor, 0n) !== amountMinor)
    throw new BadRequestException(
      "La suma de los vencimientos debe coincidir con el total.",
    );
  if ((input.reference?.length ?? 0) > 120 || (input.notes?.length ?? 0) > 1000)
    throw new BadRequestException(
      "La referencia u observación es demasiado larga.",
    );
  return {
    ...(input.documentNumber.trim()
      ? documentIdentity(input.pointOfSale, input.documentNumber)
      : { pointOfSale: "", documentNumber: "", documentKey: null }),
    issuedOn,
    amountMinor,
    dues,
  };
}
export function dueSummary(
  dues: { dueOn: Date | null; amountMinor: bigint }[],
  today: string,
) {
  const plusDays = (n: number) =>
    new Date(civilDate(today).getTime() + n * 86400000)
      .toISOString()
      .slice(0, 10);
  const sum = (check: (date: string) => boolean) =>
    dues.reduce(
      (total, d) =>
        total +
        (d.dueOn && check(d.dueOn.toISOString().slice(0, 10))
          ? d.amountMinor
          : 0n),
      0n,
    );
  const overdueMinor = sum((d) => d < today),
    todayMinor = sum((d) => d === today),
    next7Minor = sum((d) => d > today && d <= plusDays(7)),
    next30Minor = sum((d) => d > today && d <= plusDays(30));
  const nextDueOn =
    dues
      .flatMap((d) => (d.dueOn ? [d.dueOn.toISOString().slice(0, 10)] : []))
      .sort()[0] ?? null;
  return {
    overdueMinor: overdueMinor.toString(),
    todayMinor: todayMinor.toString(),
    next7Minor: next7Minor.toString(),
    next30Minor: next30Minor.toString(),
    nextDueOn,
    dueStatus:
      overdueMinor > 0n
        ? "OVERDUE"
        : todayMinor > 0n
          ? "TODAY"
          : next7Minor > 0n
            ? "SOON"
            : nextDueOn
              ? "UPCOMING"
              : "UNDATED",
  };
}
