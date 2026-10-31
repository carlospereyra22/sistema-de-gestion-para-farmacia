import { BadRequestException } from "@nestjs/common";
import {
  readFiscalProfile,
  validateFiscalDraft,
} from "../organizations/fiscal-profile";

// Pure preparation utility: no endpoint, authorization, or issuance side effects.
// Only consume a persisted, authorized production document, never a browser draft.
export interface FiscalQrDocument {
  environment: string;
  status: string;
  date: string;
  issuerCuit: string;
  point: number;
  voucherType: number;
  number: number;
  totalMinor: bigint;
  currency: string;
  cae: string;
  recipient?: { docType: number; docNumber: string };
}

function invalid(): never {
  throw new BadRequestException(
    "El comprobante no reúne los datos para generar su QR fiscal.",
  );
}
function integer(value: number, max: number) {
  if (!Number.isSafeInteger(value) || value < 1 || value > max) invalid();
  return value;
}

export function fiscalQrUrl(document: FiscalQrDocument): string {
  if (document.environment !== "PRODUCTION" || document.status !== "AUTHORIZED")
    invalid();
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(document.date) ||
    !Number.isFinite(Date.parse(document.date)) ||
    new Date(document.date).toISOString().slice(0, 10) !== document.date
  )
    invalid();
  if (!/^\d{11}$/.test(document.issuerCuit)) invalid();
  validateFiscalDraft({
    ...readFiscalProfile(null),
    cuit: document.issuerCuit,
  });
  // Initial integration only supports pesos; do not invent a currency conversion.
  if (
    document.currency !== "PES" ||
    typeof document.totalMinor !== "bigint" ||
    document.totalMinor <= 0n ||
    document.totalMinor > 2147483647n ||
    !/^[1-9]\d{13}$/.test(document.cae)
  )
    invalid();
  const recipient: { tipoDocRec?: number; nroDocRec?: number } = {};
  if (document.recipient) {
    const { docType, docNumber } = document.recipient;
    if (docType === 99) {
      if (docNumber !== "0") invalid();
    } else {
      if (
        ![80, 96].includes(docType) ||
        !/^[1-9]\d*$/.test(docNumber) ||
        !Number.isSafeInteger(Number(docNumber))
      )
        invalid();
      if (docType === 80) {
        if (docNumber.length !== 11) invalid();
        validateFiscalDraft({ ...readFiscalProfile(null), cuit: docNumber });
      } else if (!/^[1-9]\d{0,7}$/.test(docNumber)) invalid();
      recipient.tipoDocRec = docType;
      recipient.nroDocRec = Number(docNumber);
    }
  }
  const payload = {
    ver: 1,
    fecha: document.date,
    cuit: Number(document.issuerCuit),
    ptoVta: integer(document.point, 99999),
    tipoCmp: integer(document.voucherType, 999),
    nroCmp: integer(document.number, 99999999),
    importe: Number(document.totalMinor) / 100,
    moneda: "PES",
    ctz: 1,
    ...recipient,
    tipoCodAut: "E",
    codAut: Number(document.cae),
  };
  return `https://www.arca.gob.ar/fe/qr/?p=${encodeURIComponent(Buffer.from(JSON.stringify(payload), "utf8").toString("base64"))}`;
}
