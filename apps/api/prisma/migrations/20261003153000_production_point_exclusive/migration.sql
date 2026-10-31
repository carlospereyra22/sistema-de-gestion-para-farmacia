-- One productive issuer/point may only be associated with one branch in this installation.
CREATE UNIQUE INDEX "FiscalProductionConfiguration_issuerCuit_point_key"
ON "FiscalProductionConfiguration"("issuerCuit", "point");
