import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { AccountBranchSelector } from "./account-branch-selector";

it("shows the active branch in a named disclosure without changing selection on render", () => {
  const onChange = vi.fn();
  const html = renderToStaticMarkup(
    <AccountBranchSelector
      branches={[{ id: "central", name: "Casa Central" }]}
      value="central"
      onChange={onChange}
    />,
  );
  expect(html).toContain('aria-label="Sucursal activa"');
  expect(html).toContain('aria-expanded="false"');
  expect(html).toContain("Casa Central");
  expect(html).not.toContain("<select");
  expect(onChange).not.toHaveBeenCalled();
});
