-- Cuentas por pagar: la migracion 20261020000000 solo los dio a ADMIN y el alta
-- de produccion no los incluia, asi que OWNER y ADMIN pueden no tenerlos.
-- Solo datos: no cambia el esquema.
INSERT INTO "RolePermission" ("roleId","permissionId")
 SELECT r.id,p.id FROM "Role" r CROSS JOIN "Permission" p
 WHERE r.code IN ('OWNER','ADMIN') AND p.code IN ('PAYABLE_READ','PAYABLE_MANAGE')
 ON CONFLICT DO NOTHING;
