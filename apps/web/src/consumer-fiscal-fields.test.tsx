import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ConsumerFiscalFields } from "./consumer-fiscal-fields";

describe("consumer fiscal fields", () => {
  it("starts without identity fields and offers an explicit optional action", () => {
    const html = renderToStaticMarkup(
      <ConsumerFiscalFields
        value={{ recipient: "FINAL_CONSUMER", voucherType: 11 }}
        onChange={() => undefined}
      />,
    );
    expect(html).toContain("Consumidor final sin identificar");
    expect(html).toContain("Agregar datos del comprador");
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('type="button"');
    expect(html).not.toContain("<input");
  });
  it.each([{ consumerDocument: "12345678" }, { consumerName: "Comprador" }])(
    "exposes previously saved data instead of hiding it: %j",
    (fields) => {
      const html = renderToStaticMarkup(
        <ConsumerFiscalFields
          value={{ recipient: "FINAL_CONSUMER", voucherType: 11, ...fields }}
          onChange={() => undefined}
        />,
      );
      expect(html).toContain('aria-expanded="true"');
      expect(html).toContain("Quitar datos y dejar sin identificar");
      expect(html).toContain("<input");
      expect(html).toContain("opcional, salvo identificación requerida");
      expect(html).not.toContain('required=""');
      expect(html).toContain(fields.consumerDocument ?? fields.consumerName);
    },
  );
});
