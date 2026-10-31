-- Reportes (SISTEMA-3): permisos para costos/ganancias y exportacion.
-- Solo datos: no cambia el esquema. Se asignan a OWNER y ADMIN; el dueno los
-- ajusta por rol en Configuracion -> Roles y permisos.
INSERT INTO "Permission" ("id","code","description") VALUES
 (gen_random_uuid(),'REPORT_PROFIT_READ','Ver costos y ganancias en reportes'),
 (gen_random_uuid(),'REPORT_EXPORT','Exportar reportes')
 ON CONFLICT ("code") DO NOTHING;
INSERT INTO "RolePermission" ("roleId","permissionId")
 SELECT r.id,p.id FROM "Role" r CROSS JOIN "Permission" p
 WHERE r.code IN ('OWNER','ADMIN') AND p.code IN ('REPORT_PROFIT_READ','REPORT_EXPORT')
 ON CONFLICT DO NOTHING;
