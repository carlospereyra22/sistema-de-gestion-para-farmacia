ALTER TABLE "CustomerAccountMovement" ADD COLUMN "paymentMethod" "PaymentMethod", ADD COLUMN "clientOperationId" UUID, ADD COLUMN "cashSessionId" UUID;
CREATE UNIQUE INDEX "CustomerAccountMovement_organizationId_clientOperationId_key" ON "CustomerAccountMovement"("organizationId", "clientOperationId");
INSERT INTO "Permission" ("id", "code", "description") VALUES (gen_random_uuid(), 'ACCOUNT_READ', 'Read customer current accounts'), (gen_random_uuid(), 'ACCOUNT_MANAGE', 'Manage customer current accounts') ON CONFLICT ("code") DO NOTHING;
INSERT INTO "RolePermission" ("roleId", "permissionId") SELECT r.id, p.id FROM "Role" r CROSS JOIN "Permission" p WHERE r.code IN ('OWNER', 'ADMIN') AND p.code IN ('ACCOUNT_READ', 'ACCOUNT_MANAGE') ON CONFLICT DO NOTHING;
