import { PrismaClient } from "@prisma/client";
import { hash } from "@node-rs/argon2";

import { organizationPermissions } from "../src/organizations/organization-provisioning";

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const ownerEmail = process.env.SEED_OWNER_EMAIL?.trim().toLowerCase();
  const ownerPassword = process.env.SEED_OWNER_PASSWORD;
  if (!ownerEmail || !ownerPassword || ownerPassword.length < 12) {
    throw new Error(
      "SEED_OWNER_EMAIL and a 12-character SEED_OWNER_PASSWORD are required.",
    );
  }
  const organization = await prisma.organization.upsert({
    where: { id: "6fa3c8e5-7692-4bc8-b6da-8de8f09c2b9b" },
    update: { name: "Demo Organization", active: true },
    create: {
      id: "6fa3c8e5-7692-4bc8-b6da-8de8f09c2b9b",
      name: "Demo Organization",
    },
  });

  const branch = await prisma.branch.upsert({
    where: {
      organizationId_code: {
        organizationId: organization.id,
        code: "CASA-CENTRAL",
      },
    },
    update: { name: "Casa Central", active: true },
    create: {
      organizationId: organization.id,
      name: "Casa Central",
      code: "CASA-CENTRAL",
    },
  });

  for (const [code, description] of organizationPermissions) {
    await prisma.permission.upsert({
      where: { code },
      update: { description },
      create: { code, description },
    });
  }

  const role = await prisma.role.upsert({
    where: {
      organizationId_code: { organizationId: organization.id, code: "OWNER" },
    },
    update: { name: "Owner" },
    create: { organizationId: organization.id, code: "OWNER", name: "Owner" },
  });
  const adminRole = await prisma.role.upsert({
    where: {
      organizationId_code: { organizationId: organization.id, code: "ADMIN" },
    },
    update: { name: "Administrator" },
    create: {
      organizationId: organization.id,
      code: "ADMIN",
      name: "Administrator",
    },
  });
  await prisma.role.upsert({
    where: {
      organizationId_code: { organizationId: organization.id, code: "USER" },
    },
    update: { name: "User" },
    create: { organizationId: organization.id, code: "USER", name: "User" },
  });
  const allPermissions = await prisma.permission.findMany({
    where: { code: { in: organizationPermissions.map(([code]) => code) } },
  });
  for (const permission of allPermissions) {
    for (const assignedRole of [role, adminRole]) {
      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: assignedRole.id,
            permissionId: permission.id,
          },
        },
        update: {},
        create: { roleId: assignedRole.id, permissionId: permission.id },
      });
    }
  }

  const owner = await prisma.user.upsert({
    where: { email: ownerEmail },
    update: { active: true, passwordHash: await hash(ownerPassword) },
    create: { email: ownerEmail, passwordHash: await hash(ownerPassword) },
  });
  const membership = await prisma.userOrganization.upsert({
    where: {
      userId_organizationId: {
        userId: owner.id,
        organizationId: organization.id,
      },
    },
    update: { active: true },
    create: { userId: owner.id, organizationId: organization.id },
  });
  await prisma.userBranch.upsert({
    where: { userId_branchId: { userId: owner.id, branchId: branch.id } },
    update: {},
    create: { userId: owner.id, branchId: branch.id },
  });
  await prisma.userOrganizationRole.upsert({
    where: {
      membershipId_roleId: { membershipId: membership.id, roleId: role.id },
    },
    update: {},
    create: { membershipId: membership.id, roleId: role.id },
  });
  const admin = await prisma.user.upsert({
    where: { email: "admin@demo.local" },
    update: { active: true, passwordHash: await hash("Admin_123456") },
    create: {
      email: "admin@demo.local",
      passwordHash: await hash("Admin_123456"),
    },
  });
  const adminMembership = await prisma.userOrganization.upsert({
    where: {
      userId_organizationId: {
        userId: admin.id,
        organizationId: organization.id,
      },
    },
    update: { active: true },
    create: { userId: admin.id, organizationId: organization.id },
  });
  await prisma.userBranch.upsert({
    where: { userId_branchId: { userId: admin.id, branchId: branch.id } },
    update: {},
    create: { userId: admin.id, branchId: branch.id },
  });
  await prisma.userOrganizationRole.upsert({
    where: {
      membershipId_roleId: {
        membershipId: adminMembership.id,
        roleId: adminRole.id,
      },
    },
    update: {},
    create: { membershipId: adminMembership.id, roleId: adminRole.id },
  });
}

void main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
