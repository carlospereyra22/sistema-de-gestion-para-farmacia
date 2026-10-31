export function accountPendingPreview(
  pendingMinor: string,
  draft: string | undefined,
  finalSettlement: boolean,
) {
  const minor = Math.round(Number(draft) * 100);
  return finalSettlement &&
    draft !== undefined &&
    draft.trim() !== "" &&
    Number.isSafeInteger(minor) &&
    minor > 0
    ? minor
    : Number(pendingMinor);
}
