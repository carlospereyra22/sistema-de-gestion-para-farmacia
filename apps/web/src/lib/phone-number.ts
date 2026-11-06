export const phoneMaxLength = 40;
export const defaultPhoneDial = "+54";
// Vacío significa "Otro país": el número se escribe completo, con su código.
export const otherPhoneDial = "";

export const phoneCountries = [
  { dial: "+54", name: "Argentina", example: "9 376 412-3456" },
  { dial: "+595", name: "Paraguay", example: "981 123456" },
  { dial: "+55", name: "Brasil", example: "45 91234-5678" },
  { dial: "+598", name: "Uruguay", example: "94 123 456" },
  { dial: "+56", name: "Chile", example: "9 1234 5678" },
  { dial: "+591", name: "Bolivia", example: "7123 4567" },
  { dial: "+51", name: "Perú", example: "912 345 678" },
  { dial: "+34", name: "España", example: "612 34 56 78" },
  { dial: "+1", name: "EE. UU.", example: "201 555 0123" },
];

export function splitPhone(value?: string | null) {
  const text = value?.trim() ?? "";
  // Los teléfonos cargados antes no tenían código de país.
  if (!text.startsWith("+")) return { dial: defaultPhoneDial, number: text };
  const country = phoneCountries.find(({ dial }) => text.startsWith(dial));
  return country
    ? {
        dial: country.dial,
        number: text
          .slice(country.dial.length)
          .replace(/^[\s-]+/, "")
          .trim(),
      }
    : { dial: otherPhoneDial, number: text };
}

export function joinPhone(dial: string, number: string) {
  const text = number.trim();
  if (!text) return "";
  return dial ? `${dial} ${text}` : text;
}

export function normalizePhone(value?: string | null) {
  const { dial, number } = splitPhone(value);
  return joinPhone(dial, number);
}

export function phoneExample(dial: string) {
  return (
    phoneCountries.find((country) => country.dial === dial)?.example ??
    "+81 90 1234 5678"
  );
}

export function cleanPhoneInput(value: string) {
  const start = value.trimStart();
  return `${start.startsWith("+") ? "+" : ""}${start.replace(/[^\d\s()-]/g, "")}`;
}

// Un número pegado con su código elige el país solo.
export function phoneFromInput(dial: string, input: string) {
  const number = cleanPhoneInput(input);
  if (!number.startsWith("+")) return { dial, number };
  const known = splitPhone(number);
  return known.dial ? known : { dial: otherPhoneDial, number };
}

// Un número con el código de otro país no sirve para el país elegido.
export function phoneWithDial(number: string, dial: string) {
  return { dial, number: dial && number.startsWith("+") ? "" : number };
}
