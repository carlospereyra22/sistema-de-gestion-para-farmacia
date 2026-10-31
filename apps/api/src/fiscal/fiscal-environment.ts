import { BadRequestException } from "@nestjs/common";

export type FiscalEnvironment = "HOMOLOGATION" | "PRODUCTION";
export function assertFiscalEnvironment(
  value: string,
): asserts value is FiscalEnvironment {
  if (value !== "HOMOLOGATION" && value !== "PRODUCTION")
    throw new BadRequestException("Ambiente fiscal inválido.");
}
export const fiscalCredentialContext = (
  org: string,
  environment: FiscalEnvironment,
) => `fiscal-credential:v1:${environment}:${org}`;
