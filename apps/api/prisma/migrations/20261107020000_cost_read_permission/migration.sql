-- Permiso para ver los costos de los productos (SISTEMA-58). Solo datos: no cambia el esquema.
-- Hasta ahora los veia cualquiera que consultaba stock: lo conservan todos esos roles, menos
-- el de mostrador, que no tiene por que ver cuanto le costo cada producto a la farmacia.
INSERT INTO "Permission" ("id","code","description") VALUES
 (gen_random_uuid(),'COST_READ','Ver costos de los productos')
 ON CONFLICT ("code") DO NOTHING;
INSERT INTO "RolePermission" ("roleId","permissionId")
 SELECT existing."roleId", granted.id
 FROM "RolePermission" existing
 JOIN "Permission" source ON source.id = existing."permissionId"
 JOIN "Role" r ON r.id = existing."roleId"
 JOIN "Permission" granted ON granted.code = 'COST_READ'
 WHERE source.code = 'INVENTORY_READ' AND r.code <> 'EMPLEADO'
 ON CONFLICT DO NOTHING;
