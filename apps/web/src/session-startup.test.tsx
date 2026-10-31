import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect } from "vitest";
import { SessionStartup } from "./session-startup";
describe("session startup", () => {
  it("shows a visible loading state instead of a blank screen", () => {
    expect(renderToStaticMarkup(<SessionStartup failed={false} />)).toContain(
      "recuperando tu sesión",
    );
  });
  it("explains a connection failure and offers retry without clearing session data", () => {
    const html = renderToStaticMarkup(<SessionStartup failed />);
    expect(html).toContain("No pudimos conectar");
    expect(html).toContain("Reintentar ahora");
  });
});
