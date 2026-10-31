import { describe, expect, it } from "vitest";
import type { Party } from "./api";
import { filterCustomers } from "./customer-directory";

const customers: Party[] = [
  {
    id: "abc12345-rest",
    name: "María Pérez",
    active: true,
    billingTaxId: "20123456789",
    billingPhone: "3814441234",
  },
  { id: "def12345-rest", name: "Pedro", active: true, priceListId: "general" },
  {
    id: "ghi12345-rest",
    name: "Ana",
    active: false,
    priceListId: "special",
    billingEmail: "ana@example.com",
  },
];
describe("customer directory filters", () => {
  it("searches names without accents, identity, phone, email and ficha", () => {
    for (const query of ["MARIA", "20123456789", "381444", "abc12345"])
      expect(filterCustomers(customers, query, "all", false)).toEqual([
        customers[0],
      ]);
    expect(filterCustomers(customers, "ana@", "all", true)).toEqual([
      customers[2],
    ]);
  });
  it("hides archived customers unless requested", () => {
    expect(filterCustomers(customers, "", "all", false)).toHaveLength(2);
    expect(filterCustomers(customers, "", "all", true)).toHaveLength(3);
  });
  it("combines price lists with search and supports implicit general price", () => {
    expect(filterCustomers(customers, "", "general", true, "general")).toEqual(
      customers.slice(0, 2),
    );
    expect(filterCustomers(customers, "ana", "special", true)).toEqual([
      customers[2],
    ]);
    expect(filterCustomers(customers, "Pedro", "special", true)).toEqual([]);
  });
});
