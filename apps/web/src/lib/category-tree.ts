type Node = { id: string; name: string; parentId?: string | null };

export function categoryPath(node: Node, nodes: Node[]) {
  const byId = new Map(nodes.map((item) => [item.id, item]));
  const names = [node.name];
  const seen = new Set([node.id]);
  let parent = node.parentId;
  while (parent && !seen.has(parent)) {
    seen.add(parent);
    const item = byId.get(parent);
    if (!item) break;
    names.unshift(item.name);
    parent = item.parentId;
  }
  return names.join(" › ");
}

export function categoryBranch(nodes: Node[], root: string) {
  const ids = new Set([root]);
  const children = new Map<string, string[]>();
  for (const node of nodes)
    if (node.parentId)
      children.set(node.parentId, [
        ...(children.get(node.parentId) ?? []),
        node.id,
      ]);
  const pending = [root];
  while (pending.length)
    for (const id of children.get(pending.pop()!) ?? [])
      if (!ids.has(id)) {
        ids.add(id);
        pending.push(id);
      }
  return ids;
}

export function visibleCategoryTree<T extends Node>(
  nodes: T[],
  expanded: Set<string>,
  search: string,
) {
  const result: (T & { depth: number; hasChildren: boolean })[] = [];
  const byParent = new Map<string, T[]>();
  const known = new Set(nodes.map((node) => node.id));
  for (const node of nodes) {
    const parent =
      node.parentId && known.has(node.parentId) ? node.parentId : "";
    byParent.set(parent, [...(byParent.get(parent) ?? []), node]);
  }
  const query = search.trim().toLocaleLowerCase("es");
  const seen = new Set<string>();
  const pending = (byParent.get("") ?? [])
    .slice()
    .reverse()
    .map((node) => ({ node, depth: 0 }));
  while (pending.length) {
    const { node, depth } = pending.pop()!;
    if (seen.has(node.id)) continue;
    seen.add(node.id);
    const children = byParent.get(node.id) ?? [];
    if (
      !query ||
      categoryPath(node, nodes).toLocaleLowerCase("es").includes(query)
    )
      result.push({ ...node, depth, hasChildren: children.length > 0 });
    if (query || expanded.has(node.id))
      for (const child of children.slice().reverse())
        pending.push({ node: child, depth: depth + 1 });
  }
  return result;
}
