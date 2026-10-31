import { Injectable, BadGatewayException } from "@nestjs/common";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import * as forge from "node-forge";
import { randomInt } from "node:crypto";
import { postProductionWsfe } from "./arca-production-transport";
import { productionIssuanceAvailable } from "./production-issuance";
import {
  type FiscalEnvironment,
  assertFiscalEnvironment,
} from "./fiscal-environment";

export const WSAA = "https://wsaahomo.afip.gov.ar/ws/services/LoginCms";
export const WSFE = "https://wswhomo.afip.gov.ar/wsfev1/service.asmx";
export const PRODUCTION_WSAA = "https://wsaa.afip.gov.ar/ws/services/LoginCms";
export const PRODUCTION_WSFE =
  "https://servicios1.afip.gov.ar/wsfev1/service.asmx";
export const NS = "http://ar.gov.afip.dif.FEV1/";
export const obj = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
export const str = (value: unknown) => (typeof value === "string" ? value : "");
export const list = (value: unknown): unknown[] =>
  value == null ? [] : Array.isArray(value) ? value : [value];
export const escapeXml = (value: string | number) =>
  String(value).replace(
    /[<>&"']/g,
    (c) =>
      ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        '"': "&quot;",
        "'": "&apos;",
      })[c]!,
  );
export function parseXml(xml: string): Record<string, unknown> {
  if (
    xml.length > 1000000 ||
    /<!DOCTYPE|<!ENTITY/i.test(xml) ||
    XMLValidator.validate(xml) !== true
  )
    throw new BadGatewayException("ARCA devolvió una respuesta XML inválida.");
  return obj(
    new XMLParser({
      removeNSPrefix: true,
      parseTagValue: false,
      ignoreAttributes: true,
    }).parse(xml) as unknown,
  );
}
export function signedLogin(certificate: string, privateKey: string) {
  const now = Date.now();
  const xml = `<?xml version="1.0" encoding="UTF-8"?><loginTicketRequest version="1.0"><header><uniqueId>${randomInt(1, 2147483647)}</uniqueId><generationTime>${new Date(now - 60000).toISOString()}</generationTime><expirationTime>${new Date(now + 600000).toISOString()}</expirationTime></header><service>wsfe</service></loginTicketRequest>`;
  const cms = forge.pkcs7.createSignedData();
  cms.content = forge.util.createBuffer(xml, "utf8");
  cms.addCertificate(certificate);
  cms.addSigner({
    key: privateKey,
    certificate,
    digestAlgorithm: "2.16.840.1.101.3.4.2.1",
    authenticatedAttributes: [
      { type: "1.2.840.113549.1.9.3", value: "1.2.840.113549.1.7.1" },
      { type: "1.2.840.113549.1.9.4" },
      { type: "1.2.840.113549.1.9.5" },
    ],
  });
  cms.sign();
  return forge.util.encode64(forge.asn1.toDer(cms.toAsn1()).getBytes());
}
export function arcaMessages(result: Record<string, unknown>): string {
  return [
    ...list(obj(result.Errors).Err),
    ...list(obj(result.Observaciones).Obs),
  ]
    .map((v) => `${str(obj(v).Code)}: ${str(obj(v).Msg).slice(0, 350)}`)
    .join(" · ")
    .slice(0, 1000);
}
@Injectable()
export class ArcaSoap {
  async call(
    kind: "wsaa" | "wsfe",
    operation: string,
    content: string,
    environment: FiscalEnvironment = "HOMOLOGATION",
  ) {
    assertFiscalEnvironment(environment);
    if (
      environment === "PRODUCTION" &&
      process.env.FISCAL_LOCAL_TESTING === "true"
    ) {
      throw new BadGatewayException(
        "El entorno local de pruebas no puede conectarse a ARCA producción. Usá homologación.",
      );
    }
    // Queries used for recovery remain available with issuance disabled.
    if (
      environment === "PRODUCTION" &&
      !(kind === "wsaa" && operation === "loginCms") &&
      !(
        kind === "wsfe" &&
        ["FEParamGetPtosVenta", "FECompConsultar"].includes(operation)
      ) &&
      !(
        kind === "wsfe" &&
        productionIssuanceAvailable() &&
        ["FECompUltimoAutorizado", "FECAESolicitar"].includes(operation)
      )
    )
      throw new BadGatewayException(
        "La emisión productiva todavía no está habilitada.",
      );
    const endpoint =
      environment === "PRODUCTION"
        ? kind === "wsaa"
          ? PRODUCTION_WSAA
          : PRODUCTION_WSFE
        : kind === "wsaa"
          ? WSAA
          : WSFE;
    const namespace =
      kind === "wsaa" ? "http://wsaa.view.sua.dvadac.desein.afip.gov" : NS;
    const body = `<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><${operation} xmlns="${namespace}">${content}</${operation}></soap:Body></soap:Envelope>`;
    let xml: string;
    try {
      if (environment === "PRODUCTION" && kind === "wsfe") {
        xml = await postProductionWsfe(body, `"${NS + operation}"`);
      } else {
        const response = await fetch(endpoint, {
          method: "POST",
          redirect: "error",
          signal: AbortSignal.timeout(20000),
          headers: {
            "Content-Type": "text/xml; charset=utf-8",
            SOAPAction: `"${kind === "wsaa" ? "" : NS + operation}"`,
          },
          body,
        });
        if (!response.body) throw new Error();
        const reader = response.body.getReader();
        let size = 0;
        const chunks: Uint8Array[] = [];
        for (;;) {
          const part = await reader.read();
          if (part.done) break;
          size += part.value.length;
          if (size > 1000000) {
            await reader.cancel();
            throw new Error();
          }
          chunks.push(part.value);
        }
        xml = Buffer.concat(chunks).toString("utf8");
      }
    } catch {
      throw new BadGatewayException(
        `No se pudo completar la comunicación con ARCA ${environment === "PRODUCTION" ? "producción" : "homologación"}. ${operation === "loginCms" || operation === "FEParamGetPtosVenta" ? "No se emitió ningún comprobante en esta verificación. Volvé a verificar la conexión." : "No repitas una emisión: consultá su resultado."}`,
      );
    }
    const envelope = obj(parseXml(xml).Envelope);
    const payload = obj(envelope.Body);
    if (payload.Fault) {
      const fault = str(obj(payload.Fault).faultstring);
      const hint =
        environment === "PRODUCTION"
          ? /alreadyAuthenticated/i.test(fault)
            ? "ARCA ya emitió un acceso vigente. Usá la instalación que lo solicitó o esperá su vencimiento."
            : "Revisá el certificado de PRODUCCIÓN, su asociación a WSFE y el CUIT representado en el Administrador de Relaciones de ARCA. No uses el certificado de WSASS de pruebas."
          : /alreadyAuthenticated/i.test(fault)
            ? "ARCA ya emitió un acceso vigente para este certificado. Esperá su vencimiento o usá la instalación que lo solicitó."
            : /notAuthorized|not.authorized/i.test(fault)
              ? "En WSASS autorizá el alias para el servicio wsfe y el CUIT representado."
              : /untrusted/i.test(fault)
                ? "El certificado no fue aceptado por homologación. Revisá que sea el certificado de pruebas de WSASS."
                : "Revisá certificado, autorización WSASS y fecha/hora del servidor.";
      // Never return SOAP bodies: they can contain credentials.
      throw new BadGatewayException(`ARCA rechazó la conexión. ${hint}`);
    }
    const result = obj(payload[`${operation}Response`]);
    if (!Object.keys(result).length)
      throw new BadGatewayException(
        "Respuesta inesperada de ARCA; no se confirmó la operación.",
      );
    return kind === "wsaa" ? result : obj(result[`${operation}Result`]);
  }
}
