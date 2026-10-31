import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { CashClosureContent, type ClosureDetail } from "./cash-closure-detail";

it("shows missing historical metadata explicitly and never offers editing", () => {
  const detail: ClosureDetail = {
    id: "id",
    cashRegisterId: "register",
    cashRegisterName: "Central",
    openedAt: "2026-10-17T12:00:00Z",
    closedAt: "2026-10-17T14:00:00Z",
    openingAmountMinor: "10000",
    closingAmountMinor: "9000",
    expectedAmountMinor: "10000",
    differenceMinor: "-1000",
    cashSalesMinor: "0",
    manualInMinor: "0",
    manualOutMinor: "0",
    movements: [],
    cashPayments: [],
    snapshotAvailable: false,
    openedBy: "Ana",
    closedBy: null,
    reason: null,
    archived: false,
  };
  const html = renderToStaticMarkup(<CashClosureContent detail={detail} />);
  expect(html).toContain("Responsable no registrado");
  expect(html).toContain("se reconstruye");
  expect(html).toContain("Solo lectura");
  expect(html).not.toContain("<input");
  expect(html).not.toContain("<button");
});
