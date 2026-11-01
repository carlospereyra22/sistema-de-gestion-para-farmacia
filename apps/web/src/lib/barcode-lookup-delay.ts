export type BarcodeLookupTrigger = "typing" | "scanner" | "submit";

// The field only enters this stage after a complete valid EAN/GTIN. Waiting
// after that point only makes scanners and pastes feel slower; stale requests
// are cancelled by the lookup component when the code changes.
export function barcodeLookupDelay(trigger: BarcodeLookupTrigger): number {
  void trigger;
  return 0;
}
