export type { ThermalTicket } from "./thermal-ticket";
export type {
  SaleFiscalOptions,
  SaleFiscalCapabilities,
} from "./sale-fiscal-options";
export type HealthResponse =
  | {
      status: "ok";
      database: "ok";
    }
  | {
      status: "error";
      database: "unavailable";
      message: string;
    };
export const CATEGORY_ICONS = [
  "auto",
  "tag",
  "pill",
  "sparkles",
  "shield",
  "bag",
  "spray",
  "heart",
  "box",
  "baby",
  "thermometer",
  "bandage",
  "syringe",
  "stethoscope",
  "first-aid",
  "oral-care",
  "eye",
  "ear",
  "drops",
  "scissors",
  "sun",
  "leaf",
  "bottle",
  "flask",
] as const;
export type CategoryIcon = (typeof CATEGORY_ICONS)[number];
export const CATEGORY_COLORS = [
  "auto",
  "teal",
  "blue",
  "violet",
  "rose",
  "amber",
  "emerald",
  "slate",
  "red",
  "orange",
  "yellow",
  "lime",
  "cyan",
  "indigo",
  "fuchsia",
  "brown",
] as const;
export type CategoryColor = (typeof CATEGORY_COLORS)[number];
