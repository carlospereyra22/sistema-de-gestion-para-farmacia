-- Aditiva: modelo comercial (SISTEMA-55). Las organizaciones existentes quedan exentas,
-- asi que publicar esto no cobra ni corta a nadie. El plan nace sin importes: los precios
-- se cargan desde el panel y no se escriben en el repositorio.
CREATE TABLE "SubscriptionPlan" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "baseMinor" BIGINT NOT NULL DEFAULT 0,
    "extraUserMinor" BIGINT NOT NULL DEFAULT 0,
    "extraBranchMinor" BIGINT NOT NULL DEFAULT 0,
    "includedUsers" INTEGER NOT NULL DEFAULT 1,
    "includedBranches" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "SubscriptionPlan_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SubscriptionPlan_amounts_check" CHECK ("baseMinor" >= 0 AND "extraUserMinor" >= 0 AND "extraBranchMinor" >= 0),
    CONSTRAINT "SubscriptionPlan_included_check" CHECK ("includedUsers" >= 1 AND "includedBranches" >= 1)
);

CREATE UNIQUE INDEX "SubscriptionPlan_code_key" ON "SubscriptionPlan"("code");

CREATE TABLE "OrganizationSubscription" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "planId" UUID NOT NULL,
    "exempt" BOOLEAN NOT NULL DEFAULT false,
    "trialEndsAt" DATE,
    "paidThrough" DATE,
    "extendedUntil" DATE,
    "extendedReason" TEXT,
    "suspendedAt" TIMESTAMPTZ(6),
    "cancelledAt" TIMESTAMPTZ(6),
    "extraUsers" INTEGER NOT NULL DEFAULT 0,
    "extraBranches" INTEGER NOT NULL DEFAULT 0,
    "agreedPriceMinor" BIGINT,
    "contactName" TEXT,
    "contactPhone" TEXT,
    "contactEmail" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "OrganizationSubscription_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "OrganizationSubscription_extras_check" CHECK ("extraUsers" >= 0 AND "extraBranches" >= 0),
    CONSTRAINT "OrganizationSubscription_agreed_check" CHECK ("agreedPriceMinor" IS NULL OR "agreedPriceMinor" >= 0),
    -- Sin ninguna fecha base no se podria calcular el estado de la farmacia.
    CONSTRAINT "OrganizationSubscription_base_date_check" CHECK ("exempt" OR "trialEndsAt" IS NOT NULL OR "paidThrough" IS NOT NULL)
);

CREATE UNIQUE INDEX "OrganizationSubscription_organizationId_key" ON "OrganizationSubscription"("organizationId");

CREATE INDEX "OrganizationSubscription_planId_idx" ON "OrganizationSubscription"("planId");

ALTER TABLE "OrganizationSubscription" ADD CONSTRAINT "OrganizationSubscription_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "OrganizationSubscription" ADD CONSTRAINT "OrganizationSubscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "SubscriptionPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "SubscriptionPlan" ("id", "code", "name", "updatedAt")
VALUES (gen_random_uuid(), 'ESTANDAR', 'Estándar', CURRENT_TIMESTAMP);

INSERT INTO "OrganizationSubscription" ("id", "organizationId", "planId", "exempt", "updatedAt")
SELECT gen_random_uuid(), organization.id, plan.id, true, CURRENT_TIMESTAMP
FROM "Organization" organization
CROSS JOIN "SubscriptionPlan" plan
WHERE plan.code = 'ESTANDAR';
