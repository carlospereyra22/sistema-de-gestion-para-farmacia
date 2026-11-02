// Importe mientras se escribe: los puntos de miles los pone la web, la coma
// separa centavos. "20792" -> "20.792", "1000,5" -> "1.000,5".
export function formatAmountTyping(value: string): string {
  const [integerText = "", ...rest] = value.split(",");
  const integer = integerText.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  if (!rest.length) return grouped;
  const decimals = rest.join("").replace(/\D/g, "").slice(0, 2);
  return `${grouped || "0"},${decimals}`;
}

// Centavos que faltan mostrar en gris a la derecha: "1.000" -> ",00".
export function amountTypingSuffix(value: string): string {
  if (!value) return "";
  const comma = value.indexOf(",");
  if (comma < 0) return ",00";
  return "0".repeat(Math.max(0, 2 - (value.length - comma - 1)));
}
