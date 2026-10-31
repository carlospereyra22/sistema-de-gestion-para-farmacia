import { ConflictException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";

export const normalizeCustomerDocument = (value?: string | null): string =>
  (value ?? "").replace(/[\s.-]/g, "").toUpperCase();

export async function assertCustomerDocumentAvailable(
  tx: Prisma.TransactionClient,
  organizationId: string,
  documents: (string | null | undefined)[],
  excludeId?: string,
) {
  const keys = documents.map(normalizeCustomerDocument).filter(Boolean);
  if (!keys.length) return;
  // All customer identity writes share this transaction-scoped organization lock.
  // Archived records also reserve their document; no historical rows are changed.
  await tx.$queryRaw`SELECT id FROM "Organization" WHERE id = ${organizationId}::uuid FOR UPDATE`;
  const customers = await tx.customer.findMany({
    where: { organizationId, ...(excludeId ? { id: { not: excludeId } } : {}) },
    select: {
      id: true,
      name: true,
      active: true,
      document: true,
      billingTaxId: true,
    },
  });
  const duplicate = customers.find((customer) =>
    [customer.document, customer.billingTaxId].some((value) => {
      const key = normalizeCustomerDocument(value);
      return key !== "" && keys.includes(key);
    }),
  );
  if (duplicate)
    throw new ConflictException(
      `Ya existe un cliente con ese DNI/CUIT: ${duplicate.name}.${duplicate.active ? " Usá su ficha existente." : " Está eliminado; podés restaurarlo desde Mostrar eliminados."}`,
    );
}
