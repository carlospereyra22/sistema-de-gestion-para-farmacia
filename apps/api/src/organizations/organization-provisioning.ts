import type { Prisma } from "@prisma/client";

/** Catálogo único de permisos: lo usan el bootstrap, el seed y el alta de farmacias. */
export const organizationPermissions = [
  ["USER_READ", "Read users"],
  ["USER_MANAGE", "Manage users"],
  ["ROLE_READ", "Read roles"],
  ["ROLE_MANAGE", "Manage roles"],
  ["ORGANIZATION_READ", "Read organization settings"],
  ["ORGANIZATION_MANAGE", "Manage branches"],
  ["CATALOG_READ", "Read catalog"],
  ["CATALOG_MANAGE", "Manage catalog"],
  ["PARTY_READ", "Read customers and suppliers"],
  ["PARTY_MANAGE", "Manage customers and suppliers"],
  ["ACCOUNT_READ", "Read customer current accounts"],
  ["ACCOUNT_MANAGE", "Manage customer current accounts"],
  ["INVENTORY_READ", "Read inventory"],
  ["INVENTORY_MANAGE", "Receive and adjust inventory"],
  ["COST_READ", "Ver costos de los productos"],
  ["OFFER_READ", "Ver ofertas"],
  ["OFFER_MANAGE", "Crear y editar ofertas"],
  ["SALE_READ", "Read sales"],
  ["SALE_MANAGE", "Complete sales"],
  ["CASH_READ", "Read cash registers and sessions"],
  ["CASH_MANAGE", "Manage cash registers and sessions"],
  ["PURCHASE_READ", "Read purchases"],
  ["PURCHASE_MANAGE", "Crear y editar compras"],
  ["PURCHASE_RECEIVE", "Recibir mercaderia"],
  ["PAYABLE_READ", "Consultar facturas y vencimientos de proveedores"],
  ["PAYABLE_MANAGE", "Registrar facturas de proveedores"],
  ["PAYABLE_PAY", "Registrar pagos a proveedores"],
  ["REPORT_READ", "Read operational reports"],
  ["REPORT_PROFIT_READ", "Ver costos y ganancias en reportes"],
  ["REPORT_EXPORT", "Exportar reportes"],
] as const;

const initialRoles = [
  ["OWNER", "Owner"],
  ["ADMIN", "Administrator"],
  ["EMPLEADO", "Empleado"],
  ["USER", "User"],
] as const;

/** Lo mínimo para atender el mostrador; el dueño suma el resto desde Administración. */
export const employeePermissions: readonly string[] = [
  "SALE_READ",
  "SALE_MANAGE",
  "CASH_READ",
  "CASH_MANAGE",
  "CATALOG_READ",
  "OFFER_READ",
  "INVENTORY_READ",
  "PARTY_READ",
  "ACCOUNT_READ",
];

export type OrganizationGraphInput = {
  organizationName: string;
  branchName: string;
  ownerEmail: string;
  ownerPasswordHash: string;
  /** El alta desde el panel usa una clave temporal que el dueño debe cambiar. */
  ownerMustChangePassword?: boolean;
};

/**
 * Crea una farmacia con su sucursal principal, roles, permisos y dueño.
 * Quien la llama decide si el alta corresponde, abre la transacción y audita.
 */
export async function provisionOrganizationGraph(
  tx: Prisma.TransactionClient,
  input: OrganizationGraphInput,
) {
  const organization = await tx.organization.create({
    data: { name: input.organizationName },
  });
  const branch = await tx.branch.create({
    data: {
      organizationId: organization.id,
      name: input.branchName,
      code: "PRINCIPAL",
    },
  });
  const roles = [];
  for (const [code, name] of initialRoles) {
    roles.push(
      await tx.role.create({
        data: { organizationId: organization.id, code, name },
      }),
    );
  }
  for (const [code, description] of organizationPermissions) {
    const permission = await tx.permission.upsert({
      where: { code },
      update: {},
      create: { code, description },
    });
    for (const role of roles.filter(
      ({ code: roleCode }) =>
        roleCode === "OWNER" ||
        roleCode === "ADMIN" ||
        (roleCode === "EMPLEADO" && employeePermissions.includes(code)),
    )) {
      await tx.rolePermission.create({
        data: { roleId: role.id, permissionId: permission.id },
      });
    }
  }
  const ownerRole = roles.find((role) => role.code === "OWNER");
  if (!ownerRole) throw new Error("Owner role missing");
  const owner = await tx.user.create({
    data: {
      email: input.ownerEmail,
      passwordHash: input.ownerPasswordHash,
      mustChangePassword: input.ownerMustChangePassword ?? false,
    },
  });
  const membership = await tx.userOrganization.create({
    data: { userId: owner.id, organizationId: organization.id },
  });
  await tx.userBranch.create({
    data: { userId: owner.id, branchId: branch.id },
  });
  await tx.userOrganizationRole.create({
    data: { membershipId: membership.id, roleId: ownerRole.id },
  });
  return { organization, branch, owner };
}
