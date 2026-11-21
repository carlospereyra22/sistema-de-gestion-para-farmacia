// ¿La compra en curso todavía no tiene nada cargado? (SISTEMA-110). Así,
// cerrar una "Nueva compra" sin haber hecho nada no pregunta si guardar el
// borrador: no hay nada que perder. Cambiar sólo la modalidad no cuenta.
export function borradorVacio(borrador: {
  step: "edit" | "receive";
  supplierId: string;
  reference: string;
  notes: string;
  orderedAt: string;
  lines: readonly unknown[];
  lots: readonly unknown[];
  purchase?: unknown;
  debt?: unknown;
  locked?: unknown;
}): boolean {
  return (
    borrador.step === "edit" &&
    !borrador.supplierId &&
    !borrador.reference.trim() &&
    !borrador.notes.trim() &&
    !borrador.orderedAt &&
    borrador.lines.length === 0 &&
    borrador.lots.length === 0 &&
    !borrador.purchase &&
    !borrador.debt &&
    !borrador.locked
  );
}
