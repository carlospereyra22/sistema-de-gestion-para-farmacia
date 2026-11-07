-- Aditiva: cargos y pagos de la suscripcion (SISTEMA-56). No modifica datos existentes.
CREATE TABLE "SubscriptionCharge" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "breakdown" JSONB NOT NULL,
    "waivedAt" TIMESTAMPTZ(6),
    "waivedById" UUID,
    "waiveReason" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubscriptionCharge_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SubscriptionCharge_amount_check" CHECK ("amountMinor" >= 0),
    CONSTRAINT "SubscriptionCharge_period_check" CHECK ("periodEnd" >= "periodStart")
);

CREATE UNIQUE INDEX "SubscriptionCharge_organizationId_periodStart_key" ON "SubscriptionCharge"("organizationId", "periodStart");

ALTER TABLE "SubscriptionCharge" ADD CONSTRAINT "SubscriptionCharge_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "SubscriptionPayment" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "operationId" UUID NOT NULL,
    "requestHash" TEXT NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "paidOn" DATE NOT NULL,
    "method" TEXT NOT NULL,
    "reference" TEXT,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "voidedAt" TIMESTAMPTZ(6),
    "voidedById" UUID,
    "voidReason" TEXT,

    CONSTRAINT "SubscriptionPayment_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SubscriptionPayment_amount_check" CHECK ("amountMinor" > 0),
    CONSTRAINT "SubscriptionPayment_method_check" CHECK ("method" IN ('TRANSFER', 'CASH', 'CHECK', 'OTHER'))
);

CREATE UNIQUE INDEX "SubscriptionPayment_organizationId_operationId_key" ON "SubscriptionPayment"("organizationId", "operationId");

CREATE INDEX "SubscriptionPayment_organizationId_paidOn_idx" ON "SubscriptionPayment"("organizationId", "paidOn");

ALTER TABLE "SubscriptionPayment" ADD CONSTRAINT "SubscriptionPayment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
