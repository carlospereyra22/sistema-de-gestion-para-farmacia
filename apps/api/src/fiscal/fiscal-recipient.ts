import { BadRequestException } from "@nestjs/common";
import {
  readFiscalProfile,
  validateFiscalDraft,
} from "../organizations/fiscal-profile";

export function fiscalRecipient(
  customer: {
    name: string;
    billingName: string | null;
    billingVatCondition: string | null;
    billingTaxId: string | null;
    document: string | null;
  } | null,
) {
  const condition = customer?.billingVatCondition || "Consumidor final";
  const vatId = (
    {
      "Consumidor final": 5,
      "Responsable inscripto": 1,
      Monotributista: 6,
      Exento: 4,
    } as Record<string, number>
  )[condition];
  if (!vatId)
    throw new BadRequestException(
      "Revisá la condición frente al IVA del cliente.",
    );
  const document = (customer?.billingTaxId || customer?.document || "").replace(
    /[\s.-]/g,
    "",
  );
  let docType = 99;
  let docNumber = "0";
  if (document) {
    if (/^\d{11}$/.test(document)) {
      validateFiscalDraft({ ...readFiscalProfile(null), cuit: document });
      docType = 80;
    } else if (
      /^\d{7,8}$/.test(document) &&
      Number(document) > 0 &&
      vatId === 5
    )
      docType = 96;
    else
      throw new BadRequestException(
        "Completá un CUIT válido o un DNI de consumidor final en el cliente.",
      );
    docNumber = String(Number(document));
  }
  if (vatId !== 5 && docType !== 80)
    throw new BadRequestException(
      "El cliente requiere CUIT para su condición fiscal.",
    );
  return {
    name: customer?.billingName || customer?.name || "Consumidor final",
    vatId,
    docType,
    docNumber,
  };
}
