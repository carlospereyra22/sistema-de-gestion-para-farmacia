export type FeePlan = {
  baseMinor: bigint;
  extraUserMinor: bigint;
  extraBranchMinor: bigint;
  includedUsers: number;
  includedBranches: number;
};

export type FeeSubscription = {
  exempt: boolean;
  extraUsers: number;
  extraBranches: number;
  agreedPriceMinor: bigint | null;
};

/** Un precio acordado reemplaza a la fórmula: no toda farmacia sigue la misma escala. */
export function monthlyFeeMinor(
  plan: FeePlan,
  subscription: FeeSubscription,
): bigint {
  if (subscription.exempt) return 0n;
  if (subscription.agreedPriceMinor !== null)
    return subscription.agreedPriceMinor;
  return (
    plan.baseMinor +
    BigInt(subscription.extraUsers) * plan.extraUserMinor +
    BigInt(subscription.extraBranches) * plan.extraBranchMinor
  );
}

export function contractedQuota(plan: FeePlan, subscription: FeeSubscription) {
  return {
    users: plan.includedUsers + subscription.extraUsers,
    branches: plan.includedBranches + subscription.extraBranches,
  };
}
