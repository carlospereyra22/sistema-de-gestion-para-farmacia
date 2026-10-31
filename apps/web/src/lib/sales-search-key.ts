export function shouldRouteSalesSearchKey(
  event: {
    key: string;
    ctrlKey: boolean;
    altKey: boolean;
    metaKey: boolean;
    isComposing: boolean;
    repeat: boolean;
    defaultPrevented: boolean;
  },
  context: { editing: boolean; blocked: boolean },
): boolean {
  return (
    !context.blocked &&
    !context.editing &&
    !event.defaultPrevented &&
    !event.ctrlKey &&
    !event.altKey &&
    !event.metaKey &&
    !event.isComposing &&
    !event.repeat &&
    event.key.length === 1 &&
    event.key.trim().length > 0
  );
}
