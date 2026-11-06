import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { PhoneInput } from "./phone-input";

const onChange = () => undefined;

it("arranca en Argentina con un número de ejemplo", () => {
  const html = renderToStaticMarkup(
    <PhoneInput label="Teléfono" onChange={onChange} />,
  );
  expect(html).toContain("Teléfono");
  expect(html).toContain("Argentina +54");
  expect(html).toContain('placeholder="9 376 412-3456"');
  expect(html).toContain('maxLength="36"');
});

it("descuenta el código de país del largo permitido", () => {
  const html = renderToStaticMarkup(
    <PhoneInput
      label="Teléfono"
      maxLength={60}
      value="+595 981 123456"
      onChange={onChange}
    />,
  );
  expect(html).toContain("Paraguay +595");
  expect(html).toContain('value="981 123456"');
  expect(html).toContain('maxLength="55"');
});
