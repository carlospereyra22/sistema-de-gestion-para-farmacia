import { BadRequestException } from "@nestjs/common";

// Abrir cajas (SISTEMA-103): una caja (ej. Buscapina x100) se abre en
// `splitFactor` unidades de otro producto del catálogo (Buscapina blíster x10).

export type SplitLink = {
  splitTargetProductId: string | null;
  splitFactor: number | null;
};

/** El vínculo completo o ninguno; factor entre 2 y 1000; nunca a sí mismo. */
export function assertSplitLink(productId: string | null, link: SplitLink) {
  const { splitTargetProductId: target, splitFactor: factor } = link;
  if (target == null && factor == null) return;
  if (target == null || factor == null)
    throw new BadRequestException(
      "Para abrir cajas elegí el producto y cuántas unidades trae cada caja.",
    );
  if (!Number.isInteger(factor) || factor < 2 || factor > 1000)
    throw new BadRequestException(
      "Las unidades por caja tienen que ser un entero entre 2 y 1000.",
    );
  if (productId && target === productId)
    throw new BadRequestException(
      "Una caja no se puede abrir en el mismo producto.",
    );
}
