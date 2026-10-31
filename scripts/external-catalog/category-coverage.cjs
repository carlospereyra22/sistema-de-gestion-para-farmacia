/* Read-only classification audit against the same compiled rules as the API.
 * Usage: node scripts/external-catalog/category-coverage.cjs <prepared> <category-nodes.json>
 * Build apps/api first. Overwrites one operational JSON report; creates no categories.
 */
const fs = require("node:fs");
const path = require("node:path");
const { classifyCategoryEvidence, hasCategoryConflict } = require(
  path.resolve(
    __dirname,
    "../../apps/api/dist/src/catalog/category-classification.js",
  ),
);
const prepared = path.resolve(process.argv[2]);
const nodes = JSON.parse(fs.readFileSync(process.argv[3], "utf8")).map(
  (row) => ({ ...row, active: row.active ?? true }),
);
const rows = JSON.parse(
  fs.readFileSync(path.join(prepared, "canonical.json"), "utf8"),
);
const chosen = new Map();
for (const row of rows) {
  // Same preference as the barcode UI: reference facts, then separate ODbL fallback.
  if (!chosen.has(row.gtin14) || !row.beauty) chosen.set(row.gtin14, row);
}
const report = {
  unique_codes: chosen.size,
  assigned: 0,
  needs_category: 0,
  identity_review: 0,
  coverage_percent: 0,
  assigned_roots: {},
  pending: [],
  examples: [],
  reviewed_conflicts: [],
};
for (const [code, row] of chosen) {
  const p = row.payload;
  const hasConflict = hasCategoryConflict(p.review_reason);
  const plan = classifyCategoryEvidence(nodes, p, row.evidence);
  const identityConflict = hasConflict && !plan;
  if (hasConflict)
    report.reviewed_conflicts.push({
      code: p.code,
      name: p.name,
      outcome: plan ? "category_consensus_warnings_preserved" : "manual_review",
      category: plan ? [plan.root.name, ...plan.children].join(" > ") : null,
      reasons: [
        ...new Set(
          (p.review_reason ?? "")
            .split(";")
            .map((s) => s.trim())
            .filter(Boolean),
        ),
      ],
      observations: row.evidence.map((e) => ({
        source: e.source,
        source_ref: e.source_ref,
        name: e.name,
        brand: e.brand,
        scope: e.scope_group,
        path: e.category_path ?? [],
      })),
    });
  if (identityConflict) report.identity_review++;
  else if (plan) {
    report.assigned++;
    report.assigned_roots[plan.root.name] =
      (report.assigned_roots[plan.root.name] ?? 0) + 1;
  } else report.needs_category++;
  if (!plan || identityConflict)
    report.pending.push({
      code: p.code,
      name: p.name,
      source: p.source,
      scope: p.scope_group,
      category_path: p.category_path ?? [],
      reason: identityConflict
        ? p.review_reason
        : "no_matching_existing_category",
    });
  if (["07793742005527", "07798008191792"].includes(code))
    report.examples.push({
      code: p.code,
      category:
        plan && !identityConflict
          ? [plan.root.name, ...plan.children].join(" > ")
          : null,
    });
}
report.coverage_percent =
  Math.round((report.assigned / report.unique_codes) * 10000) / 100;
fs.writeFileSync(
  path.join(prepared, "classification-audit.json"),
  JSON.stringify(report, null, 2),
);
console.log(
  JSON.stringify(
    {
      ...report,
      pending: `${report.pending.length} detailed records in classification-audit.json`,
      reviewed_conflicts: {
        total: report.reviewed_conflicts.length,
        category_consensus: report.reviewed_conflicts.filter(
          (r) => r.outcome === "category_consensus_warnings_preserved",
        ).length,
        manual: report.identity_review,
      },
    },
    null,
    2,
  ),
);
