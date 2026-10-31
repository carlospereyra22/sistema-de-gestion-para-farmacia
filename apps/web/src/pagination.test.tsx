import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { Pagination } from "./pagination";

it("reduces compact spacing without changing navigation or the default layout", () => {
  const props = {
    total: 18,
    currentPage: 1,
    totalPages: 2,
    noun: "ventas",
    label: "Páginas",
    onChange: () => {},
  };
  const compact = renderToStaticMarkup(<Pagination {...props} compact />);
  const standard = renderToStaticMarkup(<Pagination {...props} />);
  expect(compact).toContain("px-3 py-1.5");
  expect(standard).toContain("p-4");
  expect(compact).toContain('aria-label="Página 2"');
  expect(compact).toContain('aria-current="page"');
  expect(compact.match(/size-9/g)).toHaveLength(4);
  const integrated = renderToStaticMarkup(<Pagination {...props} integrated />);
  expect(integrated).toContain("border-t px-3 py-1.5");
  expect(integrated).not.toContain("rounded-xl");
  expect(integrated).toContain('aria-label="Página 2"');
});
