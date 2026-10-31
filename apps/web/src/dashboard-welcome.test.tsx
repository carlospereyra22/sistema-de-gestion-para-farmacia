import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { DashboardWelcome, DashboardDate } from "./dashboard-welcome";
import { DashboardRecentSales } from "./dashboard-recent-sales";

afterEach(() => vi.useRealTimers());
it.each([
  ["2026-10-14T12:00:00Z", "¡Buen día!"],
  ["2026-10-14T18:00:00Z", "¡Buenas tardes!"],
  ["2026-10-15T01:00:00Z", "¡Buenas noches!"],
])("uses the Argentina clock for %s", (time, greeting) => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(time));
  const html = renderToStaticMarkup(
    <DashboardWelcome branchName="Casa Central" />,
  );
  expect(html).toContain(greeting);
  expect(html).toContain("Casa Central");
  expect(renderToStaticMarkup(<DashboardDate />)).toContain("14 oct");
});
it("shows loading rather than fabricated activity before fetching recent sales", () => {
  const html = renderToStaticMarkup(
    <DashboardRecentSales
      token="test"
      organizationId="org"
      branchId="branch"
      onOpenHistory={() => {}}
    />,
  );
  expect(html).toContain("Cargando actividad");
  expect(html).toContain("Ver historial");
  expect(html).not.toContain("Completada");
  expect(html).not.toContain("$ 0");
});
