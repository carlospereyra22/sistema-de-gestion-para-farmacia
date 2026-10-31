import { BadRequestException } from "@nestjs/common";
export type SupplierProfile = {
  name?: string;
  phone?: string;
  email?: string;
  contactName?: string;
  address?: string;
  notes?: string;
};
export function supplierProfile(input: SupplierProfile) {
  const result: Partial<Record<keyof SupplierProfile, string | null>> = {};
  const limits = {
    name: 160,
    phone: 60,
    email: 160,
    contactName: 160,
    address: 250,
    notes: 1000,
  };
  for (const key of Object.keys(limits) as (keyof SupplierProfile)[]) {
    const value = input[key];
    if (value === undefined) continue;
    if (typeof value !== "string" || value.trim().length > limits[key])
      throw new BadRequestException(`Revisá el campo ${key} del proveedor.`);
    const trimmed = value.trim();
    if (key === "name" && trimmed.length < 2)
      throw new BadRequestException(
        "El nombre debe tener entre 2 y 160 caracteres.",
      );
    if (
      key === "email" &&
      trimmed &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)
    )
      throw new BadRequestException("Ingresá un correo válido.");
    result[key] = trimmed || null;
  }
  const { name, ...fields } = result;
  return { ...fields, ...(name ? { name } : {}) };
}
