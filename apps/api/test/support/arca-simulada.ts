import type { Prisma } from "@prisma/client";
import type { PrismaService } from "../../src/prisma/prisma.service";

/** Cómo responde la ARCA simulada al próximo FECAESolicitar. */
export type EnvioSimulado =
  "ok" | "no-llega" | "respuesta-perdida" | "solo-errores";

/**
 * ARCA simulada para tests: sólo "existen" los números que llegaron a
 * registrarse, así FECompConsultar y FECompUltimoAutorizado responden como la
 * real ante cortes y respuestas perdidas.
 */
export function arcaSimulada(cuit: string, point: number) {
  const registrados = new Map<number, Map<number, string>>();
  const estado = { envio: "ok" as EnvioSimulado, emisiones: 0 };
  const valor = (body: string, tag: string) =>
    new RegExp(`<${tag}>([^<]+)</${tag}>`).exec(body)?.[1] ?? "";
  const call = async (
    _kind: string,
    operation: string,
    body: string,
  ): Promise<Record<string, unknown>> => {
    const type = Number(valor(body, "CbteTipo"));
    const porTipo = registrados.get(type) ?? new Map<number, string>();
    registrados.set(type, porTipo);
    if (operation === "FECompUltimoAutorizado")
      return {
        CbteNro: String(Math.max(0, ...porTipo.keys())),
        PtoVta: String(point),
        CbteTipo: String(type),
      };
    if (operation === "FECAESolicitar") {
      const number = Number(valor(body, "CbteDesde"));
      if (estado.envio === "no-llega")
        throw new Error("Se cortó antes de llegar a ARCA");
      if (estado.envio === "solo-errores")
        return {
          Errors: {
            Err: { Code: "600", Msg: "ValidacionDeToken: no validaron" },
          },
        };
      estado.emisiones++;
      porTipo.set(number, body);
      if (estado.envio === "respuesta-perdida")
        throw new Error("ARCA autorizó pero se perdió la respuesta");
      return {
        FeCabResp: {
          Cuit: cuit,
          PtoVta: String(point),
          CbteTipo: String(type),
          CantReg: "1",
          Resultado: "A",
        },
        FeDetResp: {
          FECAEDetResponse: {
            Resultado: "A",
            CbteDesde: String(number),
            CbteHasta: String(number),
            CbteFch: valor(body, "CbteFch"),
            DocTipo: valor(body, "DocTipo"),
            DocNro: valor(body, "DocNro"),
            CAE: "12345678901234",
            CAEFchVto: "20991231",
          },
        },
      };
    }
    if (operation === "FECompConsultar") {
      const number = Number(valor(body, "CbteNro"));
      const enviado = porTipo.get(number);
      if (!enviado)
        return {
          Errors: {
            Err: {
              Code: "602",
              Msg: "No existen datos en nuestros registros para los parametros ingresados.",
            },
          },
        };
      const total = valor(enviado, "ImpTotal");
      return {
        ResultGet: {
          Resultado: "A",
          PtoVta: String(point),
          CbteTipo: String(type),
          CbteDesde: String(number),
          CbteHasta: String(number),
          CbteFch: valor(enviado, "CbteFch"),
          Concepto: "1",
          DocTipo: valor(enviado, "DocTipo"),
          DocNro: valor(enviado, "DocNro"),
          MonId: "PES",
          MonCotiz: "1",
          ImpTotal: total,
          ImpNeto: total,
          ImpIVA: "0",
          ImpTrib: "0",
          ImpOpEx: "0",
          ImpTotConc: "0",
          CodAutorizacion: "12345678901234",
          FchVto: "20991231",
        },
      };
    }
    throw new Error(`Operación inesperada ${operation}`);
  };
  return { estado, call };
}

/** PrismaService que corre todo dentro de la transacción del test (rollback). */
export const dentroDeLaTransaccion = (tx: Prisma.TransactionClient) =>
  new Proxy(tx, {
    get(target, key) {
      return key === "$transaction"
        ? (fn: (client: Prisma.TransactionClient) => Promise<unknown>) => fn(tx)
        : Reflect.get(target, key);
    },
  }) as unknown as PrismaService;

/** Simula que pasaron 11 minutos desde el último cambio del comprobante. */
export const envejecer = (
  tx: Prisma.TransactionClient,
  table: "FiscalDocument" | "FiscalTrial",
  id: string,
) =>
  table === "FiscalDocument"
    ? tx.$executeRaw`UPDATE "FiscalDocument" SET "updatedAt" = now() - interval '11 minutes' WHERE id = ${id}::uuid`
    : tx.$executeRaw`UPDATE "FiscalTrial" SET "updatedAt" = now() - interval '11 minutes' WHERE id = ${id}::uuid`;
