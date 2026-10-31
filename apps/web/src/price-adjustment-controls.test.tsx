import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { PriceAdjustmentControls } from "./price-adjustment-controls";

it.each(["UP", "DOWN"] as const)(
  "shows explicit operation buttons and an unsigned amount (%s)",
  (direction) => {
    const html = renderToStaticMarkup(
      <PriceAdjustmentControls
        direction={direction}
        mode="FIXED"
        value="500"
        onDirectionChange={vi.fn()}
        onModeChange={vi.fn()}
        onValueChange={vi.fn()}
      />,
    );
    expect(html).toContain("Aumentar");
    expect(html).toContain("Bajar");
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(html).toContain('value="500"');
    expect(html).not.toContain('value="-500"');
    expect(html).toContain("sin signo");
    const down =
      html.match(/<button[^>]*>[\s\S]*?Bajar<\/button>/g)?.at(-1) ?? "";
    expect(down).toContain(
      direction === "DOWN" ? "border-orange-500" : "border-orange-200",
    );
    expect(down).toContain(
      direction === "DOWN" ? "text-orange-800" : "text-orange-700",
    );
  },
);
it("shows percentage units and does not require a preview button", () => {
  const html = renderToStaticMarkup(
    <PriceAdjustmentControls
      direction="DOWN"
      mode="PERCENT"
      value="5"
      onDirectionChange={vi.fn()}
      onModeChange={vi.fn()}
      onValueChange={vi.fn()}
    />,
  );
  expect(html).toContain("Porcentaje");
  expect(html).toContain("automáticamente");
  expect(html.match(/<button/g)).toHaveLength(2);
});
