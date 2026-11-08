import { readdirSync } from "node:fs";
import { join } from "node:path";
import { RequestMethod } from "@nestjs/common";
import { METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants";

import { SUBSCRIPTION_RULE, type SubscriptionRule } from "./subscription-gate";

type Route = { method: string; path: string; rule?: SubscriptionRule };

/** Recorre todos los controllers con sus metadatos, sin levantar la API. */
async function routes(): Promise<Route[]> {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true }))
      if (entry.isDirectory()) walk(join(dir, entry.name));
      else if (entry.name.endsWith(".controller.ts"))
        files.push(join(dir, entry.name));
  };
  walk(join(__dirname, ".."));
  const found: Route[] = [];
  const clean = (value: unknown) =>
    (Array.isArray(value) ? String(value[0] ?? "") : String(value ?? ""))
      .split("/")
      .filter(Boolean);
  for (const file of files)
    for (const exported of Object.values(
      (await import(file)) as Record<string, unknown>,
    )) {
      if (typeof exported !== "function") continue;
      if (Reflect.getMetadata(PATH_METADATA, exported) === undefined) continue;
      const base = clean(Reflect.getMetadata(PATH_METADATA, exported));
      const prototype = exported.prototype as Record<string, unknown>;
      for (const name of Object.getOwnPropertyNames(prototype)) {
        const handler = prototype[name];
        if (typeof handler !== "function" || name === "constructor") continue;
        const method = Reflect.getMetadata(METHOD_METADATA, handler) as
          RequestMethod | undefined;
        if (method === undefined) continue;
        found.push({
          method: RequestMethod[method],
          path: [
            ...base,
            ...clean(Reflect.getMetadata(PATH_METADATA, handler)),
          ].join("/"),
          rule:
            (Reflect.getMetadata(SUBSCRIPTION_RULE, handler) as
              SubscriptionRule | undefined) ??
            (Reflect.getMetadata(SUBSCRIPTION_RULE, exported) as
              SubscriptionRule | undefined),
        });
      }
    }
  return found;
}

/** Rutas sin farmacia: el corte no las alcanza, a propósito. */
const GLOBAL_PREFIXES = ["auth/", "health", "platform/", "print-gateway/"];

const sales = "organizations/:organizationId/branches/:branchId/sales";
const cash = "organizations/:organizationId/branches/:branchId/cash";

/**
 * Las únicas excepciones al corte. Cambiar esta lista es una decisión comercial: lo que
 * sigue andando en solo lectura evita dejar algo a medias, y lo del dueño bloqueado le
 * deja ver sus comprobantes.
 */
const EXCEPTIONS = [
  `ALWAYS GET organizations/:organizationId/subscription/status`,
  `OWNER_WHEN_BLOCKED GET organizations/:organizationId/branches`,
  `OWNER_WHEN_BLOCKED GET ${sales}`,
  `OWNER_WHEN_BLOCKED GET ${sales}/:saleId/credits`,
  `OWNER_WHEN_BLOCKED GET ${sales}/:saleId/credits/:documentId/settlement`,
  `OWNER_WHEN_BLOCKED GET ${sales}/:saleId/invoice`,
  `OWNER_WHEN_BLOCKED GET ${sales}/:saleId/ticket`,
  `READ_ONLY PATCH organizations/:organizationId/users/:userId`,
  `READ_ONLY PATCH organizations/:organizationId/users/:userId/password`,
  `READ_ONLY POST ${cash}/pending-collections/:collectionId/assign`,
  `READ_ONLY POST ${cash}/pending-collections/:collectionId/destination`,
  `READ_ONLY POST ${cash}/pending-collections/:collectionId/destination/clear`,
  `READ_ONLY POST ${cash}/sessions/:sessionId/close`,
  `READ_ONLY POST ${sales}/:saleId/credits/:documentId/process`,
  `READ_ONLY POST ${sales}/:saleId/credits/:documentId/settlement`,
  `READ_ONLY POST ${sales}/:saleId/invoice/process`,
  // Volver a emitir la factura de una venta ya hecha, igual que invoice/process (07/11/2026).
  `READ_ONLY POST ${sales}/:saleId/invoice/reencolar`,
  // Ventas hechas sin conexión: se deciden con el estado que tenía la farmacia
  // cuando ocurrieron; marcar un aviso como revisado termina algo pendiente (SISTEMA-63).
  `OFFLINE_SYNC POST ${sales}/offline`,
  // Venta sin conexión de otro usuario de la PC (SISTEMA-66).
  `OFFLINE_SYNC POST ${sales}/offline/firmada`,
  `READ_ONLY POST ${sales}/offline-issues/:issueId/resolve`,
  `READ_ONLY POST organizations/:organizationId/branches/:branchId/printing/jobs/:id/retry`,
  `READ_ONLY POST organizations/:organizationId/branches/:branchId/transfers/:id/receive`,
  `READ_ONLY POST organizations/:organizationId/catalog/default-categories`,
  `READ_ONLY POST organizations/:organizationId/catalog/price-lists/:priceListId/preview`,
  `READ_ONLY POST organizations/:organizationId/fiscal-testing/trials/:id/reconcile`,
];

describe("rutas frente al corte", () => {
  let all: Route[] = [];

  beforeAll(async () => {
    all = await routes();
  });

  it("encuentra los controllers", () => {
    expect(all.length).toBeGreaterThan(150);
  });

  it("toda ruta es de una farmacia o está en la lista de rutas globales", () => {
    const unclassified = all
      .filter(
        ({ path }) =>
          !path.startsWith("organizations/:organizationId") &&
          !GLOBAL_PREFIXES.some((prefix) => path.startsWith(prefix)),
      )
      .map(({ method, path }) => `${method} ${path}`);

    expect(unclassified).toEqual([]);
  });

  it("las excepciones al corte son exactamente las decididas", () => {
    expect(
      all
        .filter(({ rule }) => rule)
        .map(({ rule, method, path }) => `${rule} ${method} ${path}`)
        .sort(),
    ).toEqual([...EXCEPTIONS].sort());
  });

  it("lo que conserva el dueño bloqueado son solo lecturas", () => {
    expect(
      all.filter(
        ({ rule, method }) => rule === "OWNER_WHEN_BLOCKED" && method !== "GET",
      ),
    ).toEqual([]);
  });

  it("marcar una lectura para solo lectura no hace falta: ya pasa", () => {
    expect(
      all.filter(
        ({ rule, method }) => rule === "READ_ONLY" && method === "GET",
      ),
    ).toEqual([]);
  });
});
