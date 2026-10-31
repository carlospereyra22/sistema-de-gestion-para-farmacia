import {
  equivalentCategory,
  hasCategoryConflict,
  type CategoryEvidence,
} from "./category-classification";
import {
  categoryTokens,
  matchesCategoryTerms,
  suggestedCategoryTerms,
} from "./category-matching";
import type { CategoryNode } from "./category-tree";

/** Re-evaluated against the organization's current tree on every completion.
 * Source facts remain unchanged; no configured keywords or commercial writes. */
export function automaticCategory(
  nodes: CategoryNode[],
  evidence: CategoryEvidence,
  baseline: { root: CategoryNode; children: string[] } | null,
) {
  if (hasCategoryConflict(evidence.review_reason))
    return { categoryId: null, ambiguous: false };
  const paths = [
    ...(evidence.category_path ?? []),
    evidence.scope_group ?? "",
    evidence.subcategory ?? "",
  ];
  const texts = [...paths, evidence.name, evidence.presentation];
  const baselineNames = baseline
    ? [baseline.root.name, ...baseline.children]
    : [];
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const chain = (node: CategoryNode) => {
    const result: CategoryNode[] = [];
    const seen = new Set<string>();
    let current: CategoryNode | undefined = node;
    while (current) {
      if (!current.active || seen.has(current.id)) return null;
      seen.add(current.id);
      result.unshift(current);
      if (!current.parentId) return result;
      current = byId.get(current.parentId);
    }
    return null;
  };
  const matchesLabel = (name: string) =>
    paths.some((part) => equivalentCategory(name, part)) ||
    matchesCategoryTerms(suggestedCategoryTerms(name), texts);
  const candidates = nodes.flatMap((node) => {
    const ancestors = chain(node);
    if (!ancestors || !matchesLabel(node.name)) return [];
    // Do not truncate an explicit source path at a broad existing ancestor.
    if (
      ancestors[0]!.id === baseline?.root.id &&
      ancestors.length < baselineNames.length &&
      ancestors.every((parent, index) =>
        equivalentCategory(parent.name, baselineNames[index]!),
      )
    )
      return [];
    // "Infantil" beneath hair care cannot capture an infant sunscreen.
    if (
      ancestors
        .slice(0, -1)
        .some(
          (parent) =>
            parent.id !== baseline?.root.id &&
            !matchesLabel(parent.name) &&
            !baselineNames.some((name) =>
              equivalentCategory(parent.name, name),
            ),
        )
    )
      return [];
    const generalRoots = [
      "Cuidado personal",
      "Dermocosmética",
      "Perfumería y maquillaje",
      "Bebés y maternidad",
      "Salud y bienestar",
      "Hogar y alimentos",
      "Medicamentos",
    ];
    const specific = ancestors.filter(
      (parent) =>
        parent.id !== baseline?.root.id &&
        !(
          parent.parentId === null &&
          generalRoots.some((name) => equivalentCategory(parent.name, name))
        ),
    );
    const score = new Set(
      specific.flatMap((parent) => categoryTokens(parent.name)),
    ).size;
    return [{ node, ancestors, score }];
  });
  if (!candidates.length) return { categoryId: null, ambiguous: false };
  // Prefer a more specific descendant, but never choose between competing paths
  // merely because one was created more recently.
  const leaves = candidates.filter(
    (item) =>
      !candidates.some(
        (other) =>
          other.node.id !== item.node.id &&
          other.ancestors.some((ancestor) => ancestor.id === item.node.id),
      ),
  );
  const bestScore = Math.max(...leaves.map((item) => item.score));
  const best = leaves.filter((item) => item.score === bestScore);
  return best.length === 1
    ? { categoryId: best[0]!.node.id, ambiguous: false }
    : { categoryId: null, ambiguous: true };
}
