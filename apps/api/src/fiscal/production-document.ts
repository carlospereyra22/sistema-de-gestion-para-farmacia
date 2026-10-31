import { BadRequestException } from "@nestjs/common";
import type { FiscalDocument } from "@prisma/client";
import { obj, str, list } from "./arca-soap";

export {
  productionIssuanceAvailable,
  assertProductionIssuance,
} from "./production-issuance";
export function validFiscalDate(value: string) {
  if (!/^\d{8}$/.test(value)) return false;
  const iso = `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
  const date = new Date(iso);
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === iso
  );
}
export function productionBody(
  doc: FiscalDocument,
  original?: FiscalDocument | null,
) {
  if (
    doc.environment !== "PRODUCTION" ||
    ![11, 13].includes(doc.voucherType) ||
    !["INVOICE", "CREDIT_NOTE"].includes(doc.kind) ||
    doc.voucherType !== (doc.kind === "CREDIT_NOTE" ? 13 : 11) ||
    !Number.isInteger(doc.point) ||
    doc.point < 1 ||
    doc.point > 99999 ||
    !Number.isInteger(doc.number) ||
    !doc.number ||
    doc.number < 1 ||
    doc.number > 99999999 ||
    !/^\d{11}$/.test(doc.issuerCuit) ||
    ![80, 96, 99].includes(doc.docType) ||
    ![1, 4, 5, 6].includes(doc.recipientVatId) ||
    (doc.docType === 99 ? doc.docNumber !== "0" : Number(doc.docNumber) <= 0) ||
    !validFiscalDate(doc.date) ||
    doc.totalMinor <= 0 ||
    !Number.isSafeInteger(doc.totalMinor) ||
    !/^\d{1,11}$/.test(doc.docNumber)
  )
    throw new BadRequestException("Documento productivo inválido.");
  if (
    doc.kind === "CREDIT_NOTE" &&
    (!original ||
      original.status !== "AUTHORIZED" ||
      original.environment !== "PRODUCTION" ||
      original.id !== doc.originalId ||
      original.organizationId !== doc.organizationId ||
      original.sourceSaleId !== doc.sourceSaleId ||
      original.issuerCuit !== doc.issuerCuit ||
      original.totalMinor < doc.totalMinor ||
      original.docType !== doc.docType ||
      original.docNumber !== doc.docNumber ||
      original.voucherType !== 11 ||
      !original.number)
  )
    throw new BadRequestException(
      "La nota de crédito requiere la factura original autorizada del mismo emisor y receptor.",
    );
  const amount = `${Math.floor(doc.totalMinor / 100)}.${String(doc.totalMinor % 100).padStart(2, "0")}`;
  const associated =
    original && doc.kind === "CREDIT_NOTE"
      ? `<CbtesAsoc><CbteAsoc><Tipo>${original.voucherType}</Tipo><PtoVta>${original.point}</PtoVta><Nro>${original.number}</Nro><Cuit>${original.issuerCuit}</Cuit><CbteFch>${original.date}</CbteFch></CbteAsoc></CbtesAsoc>`
      : "";
  return `<FeCAEReq><FeCabReq><CantReg>1</CantReg><PtoVta>${doc.point}</PtoVta><CbteTipo>${doc.voucherType}</CbteTipo></FeCabReq><FeDetReq><FECAEDetRequest><Concepto>1</Concepto><DocTipo>${doc.docType}</DocTipo><DocNro>${doc.docNumber}</DocNro><CbteDesde>${doc.number}</CbteDesde><CbteHasta>${doc.number}</CbteHasta><CbteFch>${doc.date}</CbteFch><ImpTotal>${amount}</ImpTotal><ImpTotConc>0</ImpTotConc><ImpNeto>${amount}</ImpNeto><ImpOpEx>0</ImpOpEx><ImpTrib>0</ImpTrib><ImpIVA>0</ImpIVA><MonId>PES</MonId><MonCotiz>1</MonCotiz><CondicionIVAReceptorId>${doc.recipientVatId}</CondicionIVAReceptorId>${associated}</FECAEDetRequest></FeDetReq></FeCAEReq>`;
}
export function authorizedProductionResponse(
  response: Record<string, unknown>,
  doc: FiscalDocument,
) {
  const head = obj(response.FeCabResp);
  const detail = obj(obj(response.FeDetResp).FECAEDetResponse);
  return (
    str(head.Resultado) === "A" &&
    Number(str(head.Cuit)) === Number(doc.issuerCuit) &&
    Number(str(head.PtoVta)) === doc.point &&
    Number(str(head.CbteTipo)) === doc.voucherType &&
    str(head.CantReg) === "1" &&
    str(detail.Resultado) === "A" &&
    Number(str(detail.CbteDesde)) === doc.number &&
    Number(str(detail.CbteHasta)) === doc.number &&
    str(detail.CbteFch) === doc.date &&
    Number(str(detail.DocTipo)) === doc.docType &&
    str(detail.DocNro) === doc.docNumber &&
    /^[1-9]\d{13}$/.test(str(detail.CAE)) &&
    validFiscalDate(str(detail.CAEFchVto)) &&
    str(detail.CAEFchVto) >= doc.date
  );
}
export function matchesProduction(
  result: Record<string, unknown>,
  doc: FiscalDocument,
  original?: FiscalDocument | null,
) {
  if (doc.kind === "CREDIT_NOTE") {
    const associated = list(obj(result.CbtesAsoc).CbteAsoc).map(obj);
    if (
      !original ||
      original.id !== doc.originalId ||
      associated.length !== 1 ||
      Number(str(associated[0]!.Tipo)) !== original.voucherType ||
      Number(str(associated[0]!.PtoVta)) !== original.point ||
      Number(str(associated[0]!.Nro)) !== original.number
    )
      return false;
  }
  return (
    str(result.Resultado) === "A" &&
    Number(str(result.PtoVta)) === doc.point &&
    Number(str(result.CbteTipo)) === doc.voucherType &&
    Number(str(result.CbteDesde)) === doc.number &&
    Number(str(result.CbteHasta)) === doc.number &&
    str(result.CbteFch) === doc.date &&
    Number(str(result.DocTipo)) === doc.docType &&
    str(result.DocNro) === doc.docNumber &&
    str(result.Concepto) === "1" &&
    str(result.MonId) === "PES" &&
    Number(str(result.MonCotiz)) === 1 &&
    Math.round(Number(str(result.ImpTotal)) * 100) === doc.totalMinor &&
    Math.round(Number(str(result.ImpNeto)) * 100) === doc.totalMinor &&
    ["ImpIVA", "ImpTrib", "ImpOpEx", "ImpTotConc"].every(
      (key) => Number(str(result[key])) === 0 && str(result[key]) !== "",
    ) &&
    /^[1-9]\d{13}$/.test(str(result.CodAutorizacion)) &&
    validFiscalDate(str(result.FchVto)) &&
    str(result.FchVto) >= doc.date
  );
}
