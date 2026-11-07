import { describe, expect, it } from "vitest";
import { PlatformApiError } from "./platform-api";
import {
  balanceAfterPayment,
  balanceLabel,
  chargeStatus,
  debtors,
  paymentOutcomeUnknown,
  totalDebtMinor,
} from "./platform-billing";

const balance = (balanceMinor: string, creditMinor = "0") => ({
  balanceMinor,
  creditMinor,
});

describe("saldo de una farmacia", () => {
  it("dice cuánto debe", () => {
    expect(balanceLabel(balance("6500000"))).toBe("Debe $ 65.000,00");
  });

  it("dice cuánto tiene a favor", () => {
    expect(balanceLabel(balance("0", "300000"))).toBe("A favor $ 3.000,00");
  });

  it("sin deuda ni crédito no muestra importes", () => {
    expect(balanceLabel(balance("0"))).toBe("Sin deuda");
  });
});

describe("vista previa de un pago", () => {
  it("un pago parcial deja saldo", () => {
    expect(balanceAfterPayment(balance("6500000"), "2500000")).toBe(
      "Debe $ 40.000,00",
    );
  });

  it("el pago exacto deja sin deuda", () => {
    expect(balanceAfterPayment(balance("6500000"), "6500000")).toBe(
      "Sin deuda",
    );
  });

  it("el excedente queda a favor", () => {
    expect(balanceAfterPayment(balance("6500000"), "7000000")).toBe(
      "A favor $ 5.000,00",
    );
  });

  it("suma al crédito que ya tenía", () => {
    expect(balanceAfterPayment(balance("0", "100000"), "100000")).toBe(
      "A favor $ 2.000,00",
    );
  });
});

describe("estado de un cargo", () => {
  const charge = {
    amountMinor: "1000",
    paidMinor: "0",
    balanceMinor: "1000",
    waived: false,
  };

  it("sin pagos está pendiente", () => {
    expect(chargeStatus(charge)).toEqual({
      label: "Pendiente",
      tone: "danger",
    });
  });

  it("con parte pagada es parcial", () => {
    expect(
      chargeStatus({ ...charge, paidMinor: "400", balanceMinor: "600" }).label,
    ).toBe("Pago parcial");
  });

  it("sin saldo está pagado", () => {
    expect(
      chargeStatus({ ...charge, paidMinor: "1000", balanceMinor: "0" }).label,
    ).toBe("Pagado");
  });

  it("condonado gana sobre lo demás", () => {
    expect(
      chargeStatus({ ...charge, balanceMinor: "0", waived: true }).label,
    ).toBe("Condonado");
  });
});

describe("quién debe", () => {
  const rows = [
    { name: "Sin deuda", balanceMinor: "0" },
    { name: "Poca", balanceMinor: "100" },
    { name: "Mucha", balanceMinor: "9000000000000000" },
  ];

  it("deja solo a las que deben, la deuda más grande primero", () => {
    expect(debtors(rows).map(({ name }) => name)).toEqual(["Mucha", "Poca"]);
  });

  it("suma sin perder centavos en importes grandes", () => {
    expect(totalDebtMinor(rows)).toBe("9000000000000100");
  });
});

describe("resultado incierto de un pago", () => {
  it("un rechazo de la API es definitivo", () => {
    expect(paymentOutcomeUnknown(new PlatformApiError("Mal", 400))).toBe(false);
    expect(paymentOutcomeUnknown(new PlatformApiError("Otro", 409))).toBe(
      false,
    );
  });

  it("un error del servidor o de red no dice si se registró", () => {
    expect(paymentOutcomeUnknown(new PlatformApiError("Falló", 500))).toBe(
      true,
    );
    expect(paymentOutcomeUnknown(new TypeError("Failed to fetch"))).toBe(true);
  });
});
