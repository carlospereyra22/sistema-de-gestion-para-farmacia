import { BadRequestException } from "@nestjs/common";

export function productionIssuanceAvailable() {
  return (
    process.env.FISCAL_LOCAL_TESTING !== "true" &&
    process.env.FISCAL_PRODUCTION_ISSUANCE === "enabled"
  );
}

export function assertProductionIssuance() {
  if (!productionIssuanceAvailable())
    throw new BadRequestException(
      "La emisión productiva no está activada en este servidor.",
    );
}
