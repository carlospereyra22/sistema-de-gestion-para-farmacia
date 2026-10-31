import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { CustomerPriceListOptions } from "./customer-price-list-options";

it.each(["", "general", "custom", "unavailable"])(
  "shows general once and preserves assignment %s",
  (priceListId) => {
    const html = renderToStaticMarkup(
      <select defaultValue={priceListId}>
        <CustomerPriceListOptions
          priceListId={priceListId}
          lists={[
            { id: "general", name: "Precio general" },
            { id: "custom", name: "Mayoristas" },
          ]}
        />
      </select>,
    );
    expect(html.match(/>Precio general</g)).toHaveLength(1);
    expect(html).toContain(`value="${priceListId}"`);
    expect(html).toContain("Mayoristas");
  },
);
