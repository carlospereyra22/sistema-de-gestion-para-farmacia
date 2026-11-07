-- Separa recibir de comprar y registrar pagos de cargar facturas (SISTEMA-54).
-- Solo datos: no cambia el esquema. Quien ya podia hacerlo conserva el acceso.
INSERT INTO "Permission" ("id","code","description") VALUES
 (gen_random_uuid(),'PURCHASE_RECEIVE','Recibir mercaderia'),
 (gen_random_uuid(),'PAYABLE_PAY','Registrar pagos a proveedores')
 ON CONFLICT ("code") DO NOTHING;
INSERT INTO "RolePermission" ("roleId","permissionId")
 SELECT existing."roleId", granted.id
 FROM "RolePermission" existing
 JOIN "Permission" source ON source.id = existing."permissionId"
 JOIN "Permission" granted ON
   (source.code = 'PURCHASE_MANAGE' AND granted.code = 'PURCHASE_RECEIVE')
   OR (source.code = 'PAYABLE_MANAGE' AND granted.code = 'PAYABLE_PAY')
 ON CONFLICT DO NOTHING;
