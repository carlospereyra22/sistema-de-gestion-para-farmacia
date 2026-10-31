import { categoryKey } from "./category-classification";

// Explicit equivalents only: never substring matching, brand-based medication
// inference, automatic stemming or a guessed match for missing information.
const equivalents = [
  ["tintura", "tinturas", "tinte", "tintes", "coloracion"],
  ["protector", "protectores", "proteccion"],
  ["solar", "solares"],
  ["infantil", "infantiles", "kids", "ninos", "ninas"],
  ["shampoo", "shampoos", "champu", "champus"],
  ["acondicionador", "acondicionadores"],
  ["crema", "cremas"],
  ["suplemento", "suplementos"],
  ["desodorante", "desodorantes"],
  ["bebe", "bebes", "baby"],
  ["rubio", "rubios", "rubia", "rubias"],
  ["facial", "faciales"],
  ["corporal", "corporales"],
  ["capilar", "capilares"],
  ["labial", "labiales"],
  ["mascarilla", "mascarillas"],
  ["panal", "panales"],
  ["toallita", "toallitas"],
];
const stopwords = new Set([
  "de",
  "del",
  "la",
  "el",
  "los",
  "las",
  "y",
  "para",
  "con",
  "en",
]);
function words(text: string) {
  return categoryKey(text)
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map(
      (word) => equivalents.find((group) => group.includes(word))?.[0] ?? word,
    );
}
export function categoryTokens(text: string) {
  return [
    ...new Set(
      words(text).filter((word) => word.length >= 2 && !stopwords.has(word)),
    ),
  ];
}
export function suggestedCategoryTerms(name: string) {
  return categoryKey(name)
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length >= 2 && !stopwords.has(word))
    .slice(0, 8);
}
export function matchesCategoryTerms(
  terms: string[],
  texts: (string | null | undefined)[],
) {
  const available = new Set(texts.flatMap((text) => words(text ?? "")));
  return (
    terms.length > 0 &&
    terms.every((term) => words(term).every((word) => available.has(word)))
  );
}
