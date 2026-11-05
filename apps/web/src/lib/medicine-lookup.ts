// Elegir un medicamento pone el formulario en modo medicamento y eso repite la
// búsqueda del código: lo que el usuario ya eligió sigue vinculado al volver.
// El nombre que trae una factura no lo escribió nadie: no frena la carga
// automática. Si el usuario lo cambia, sí.
export function medicineNameIsFree(name: string, invoiceName?: string) {
  return !name || name === invoiceName;
}

export function medicineLookupLinked(
  automatic: boolean,
  pickedGtin: string,
  gtin: string,
) {
  return automatic || pickedGtin === gtin;
}
