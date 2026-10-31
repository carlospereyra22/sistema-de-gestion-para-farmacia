import { BadRequestException, ConflictException } from "@nestjs/common";

export type CategoryNode = {
  id: string;
  name: string;
  parentId: string | null;
  active: boolean;
};

export function categoryPaths(
  nodes: Pick<CategoryNode, "id" | "name" | "parentId">[],
) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  return new Map(
    nodes.map((node) => {
      const names: string[] = [];
      const seen = new Set<string>();
      let current: typeof node | undefined = node;
      while (current && !seen.has(current.id)) {
        seen.add(current.id);
        names.unshift(current.name);
        current = current.parentId ? byId.get(current.parentId) : undefined;
      }
      return [node.id, names.join(" › ")];
    }),
  );
}

export function validateCategoryPlacement(
  nodes: CategoryNode[],
  id: string | undefined,
  name: string,
  parentId: string | null,
) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const seen = new Set<string>();
  let ancestor = parentId;
  while (ancestor) {
    if (ancestor === id || seen.has(ancestor))
      throw new BadRequestException(
        "Una categoría no puede estar dentro de sí misma ni de sus subcategorías.",
      );
    seen.add(ancestor);
    const parent = byId.get(ancestor);
    if (!parent?.active)
      throw new BadRequestException(
        "La categoría superior no está disponible en esta organización.",
      );
    ancestor = parent.parentId;
  }
  if (
    nodes.some(
      (node) =>
        node.id !== id &&
        node.parentId === parentId &&
        node.name.trim().toLocaleLowerCase("es") ===
          name.toLocaleLowerCase("es"),
    )
  )
    throw new ConflictException(
      "Ya existe una categoría con ese nombre en este nivel, incluso si fue eliminada.",
    );
}
