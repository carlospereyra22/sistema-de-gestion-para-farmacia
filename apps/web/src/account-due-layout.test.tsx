import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { AccountDueDates } from "./account-due-dates";

it("keeps customer maturities table-only and reserves the detail column for the global view", () => {
  const props = {
    token: "test",
    organizationId: "org",
    branchId: "branch",
    onCustomer: () => {},
  };
  const customer = renderToStaticMarkup(
    <AccountDueDates {...props} customerId="customer" />,
  );
  expect(customer).toContain('data-split="false"');
  expect(customer).not.toContain("Consultá una venta");
  expect(customer).not.toContain("<aside");
  const global = renderToStaticMarkup(<AccountDueDates {...props} />);
  expect(global).toContain('data-split="true"');
  expect(global).toContain("Consultá una venta");
});
