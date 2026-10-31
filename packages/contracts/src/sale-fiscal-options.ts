/** Options belong to one sale, never to the customer's account or tax profile. */
export type SaleFiscalOptions = {
  recipient: "FINAL_CONSUMER" | "CUSTOMER";
  voucherType: 11;
  consumerName?: string;
  consumerDocument?: string;
};

export type SaleFiscalCapabilities = {
  environment: "HOMOLOGATION" | "PRODUCTION";
  voucherTypes: { code: 11; label: string }[];
  reason: string | null;
};
