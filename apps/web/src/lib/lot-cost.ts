export function lotCostInput(minor: string): string {
  const amount = BigInt(minor);
  return `${amount / 100n},${String(amount % 100n).padStart(2, "0")}`;
}

export function lotCostMinor(value: string): string {
  const normalized = value.trim().replace(",", ".");
  if (!/^\d{1,12}(\.\d{1,2})?$/.test(normalized))
    throw new Error(
      "Ingresá un costo no negativo, sin separador de miles y con hasta dos decimales.",
    );
  const [whole, fraction = ""] = normalized.split(".");
  return (BigInt(whole!) * 100n + BigInt(fraction.padEnd(2, "0"))).toString();
}
