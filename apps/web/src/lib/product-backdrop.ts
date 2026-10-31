export function canDismissProductBackdrop(
  startedOutside: boolean,
  endedOutside: boolean,
  blocked: boolean,
) {
  return startedOutside && endedOutside && !blocked;
}
