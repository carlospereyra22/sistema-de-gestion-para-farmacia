import { createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { DistributionProductSearch } from "./distribution-product-search";

it("does not expand results just because a selected name is present", () => {
  const select = vi.fn();
  const html = renderToStaticMarkup(
    <DistributionProductSearch
      products={[]}
      query="Actron"
      onChange={vi.fn()}
      onSelect={select}
      inputRef={createRef<HTMLInputElement>()}
    />,
  );
  expect(html).toContain('role="combobox"');
  expect(html).toContain('aria-expanded="false"');
  expect(html).toContain('value="Actron"');
  expect(html).not.toContain('role="listbox"');
  expect(html).toContain('autoComplete="off"');
  expect(select).not.toHaveBeenCalled();
});
