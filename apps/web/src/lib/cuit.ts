// CUIT/CUIL: se escribe con o sin guiones, se guarda sólo con los 11 números.

const pesos = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];

/** Deja sólo los números (hasta 11) de lo que se escribió o pegó. */
export function digitosCuit(texto: string) {
  return texto.replace(/\D/g, "").slice(0, 11);
}

/** Muestra los números como 20-42641309-5, a medida que se escriben. */
export function formatearCuit(digitos: string) {
  const limpio = digitosCuit(digitos);
  if (limpio.length <= 2) return limpio;
  if (limpio.length <= 10) return `${limpio.slice(0, 2)}-${limpio.slice(2)}`;
  return `${limpio.slice(0, 2)}-${limpio.slice(2, 10)}-${limpio.slice(10)}`;
}

/** Verifica el dígito verificador con el mismo cálculo que la API. */
export function cuitValido(digitos: string) {
  if (!/^\d{11}$/.test(digitos)) return false;
  const resto =
    11 -
    (pesos.reduce((suma, peso, i) => suma + Number(digitos[i]) * peso, 0) % 11);
  const verificador = resto === 11 ? 0 : resto === 10 ? 9 : resto;
  return verificador === Number(digitos[10]);
}

/** Aviso para mostrar debajo del campo, o null si no hay nada que avisar. */
export function avisoCuit(digitos: string) {
  if (!digitos) return null;
  const faltan = 11 - digitos.length;
  if (faltan > 0)
    return faltan === 1 ? "Falta 1 número." : `Faltan ${faltan} números.`;
  return cuitValido(digitos)
    ? null
    : "Revisá el CUIT: el dígito verificador no coincide.";
}
