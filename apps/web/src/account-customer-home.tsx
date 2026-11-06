import { useState } from "react";
import { AccountCustomerList } from "./account-customer-panels";
import { AccountSummary } from "./account-summary";
import type { CustomerAccount } from "./lib/api";

export function AccountCustomerHome({
  accounts,
  disabled,
  loading,
  onSelect,
  onCreate,
}: {
  accounts: CustomerAccount[];
  disabled: boolean;
  loading: boolean;
  onSelect: (id: string) => void;
  onCreate: (name?: string) => void;
}) {
  const [query, setQuery] = useState("");
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-4">
      <AccountCustomerList
        accounts={accounts}
        disabled={disabled}
        loading={loading}
        query={query}
        onQuery={setQuery}
        onSelect={onSelect}
        onCreate={onCreate}
        summary={
          <AccountSummary
            debtMinor={accounts.reduce(
              (sum, account) => sum + Math.max(Number(account.balanceMinor), 0),
              0,
            )}
            enabled={accounts.filter((account) => account.creditEnabled).length}
            owing={
              accounts.filter((account) => Number(account.balanceMinor) > 0)
                .length
            }
          />
        }
      />
    </div>
  );
}
