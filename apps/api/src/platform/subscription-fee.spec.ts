import { contractedQuota, monthlyFeeMinor } from "./subscription-fee";

// Importes de ejemplo: los reales se cargan desde el panel.
const plan = {
  baseMinor: 5_500_000n,
  extraUserMinor: 1_000_000n,
  extraBranchMinor: 3_500_000n,
  includedUsers: 1,
  includedBranches: 1,
};
const subscription = {
  exempt: false,
  extraUsers: 0,
  extraBranches: 0,
  agreedPriceMinor: null,
};

describe("monthlyFeeMinor", () => {
  it.each([
    [0, 0, 5_500_000n],
    [1, 0, 6_500_000n],
    [2, 0, 7_500_000n],
    [1, 1, 10_000_000n],
    [4, 1, 13_000_000n],
  ])(
    "con %i usuarios y %i sucursales extra",
    (extraUsers, extraBranches, expected) => {
      expect(
        monthlyFeeMinor(plan, { ...subscription, extraUsers, extraBranches }),
      ).toBe(expected);
    },
  );

  it("el precio acordado reemplaza a la fórmula", () => {
    expect(
      monthlyFeeMinor(plan, {
        ...subscription,
        extraUsers: 3,
        agreedPriceMinor: 4_000_000n,
      }),
    ).toBe(4_000_000n);
  });

  it("también puede acordarse en cero", () => {
    expect(
      monthlyFeeMinor(plan, { ...subscription, agreedPriceMinor: 0n }),
    ).toBe(0n);
  });

  it("una farmacia exenta no paga, aunque tenga precio acordado", () => {
    expect(
      monthlyFeeMinor(plan, {
        ...subscription,
        exempt: true,
        agreedPriceMinor: 4_000_000n,
      }),
    ).toBe(0n);
  });
});

describe("contractedQuota", () => {
  it("suma lo incluido y lo adicional", () => {
    expect(
      contractedQuota(plan, {
        ...subscription,
        extraUsers: 2,
        extraBranches: 1,
      }),
    ).toEqual({ users: 3, branches: 2 });
  });
});
