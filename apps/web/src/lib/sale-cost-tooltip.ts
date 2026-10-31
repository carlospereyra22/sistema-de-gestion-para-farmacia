// One owner across all cart rows; stale cleanup must not close a newer tooltip.
export function createSaleCostTooltipController() {
  let active: (() => void) | undefined;
  const blockers = new Set<symbol>();
  return {
    suspend() {
      const blocker = Symbol();
      blockers.add(blocker);
      active?.();
      return () => {
        blockers.delete(blocker);
      };
    },
    show(close: () => void) {
      if (blockers.size) return undefined;
      active?.();
      const dismiss = () => {
        if (active !== dismiss) return;
        clearTimeout(timer);
        active = undefined;
        close();
      };
      const timer = setTimeout(dismiss, 2000);
      active = dismiss;
      return () => {
        clearTimeout(timer);
        if (active === dismiss) active = undefined;
      };
    },
  };
}

export const saleCostTooltipController = createSaleCostTooltipController();
