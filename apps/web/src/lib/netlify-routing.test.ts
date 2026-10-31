import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Netlify routing", () => {
  const rules = readFileSync(
    new URL("../../public/_redirects", import.meta.url),
    "utf8",
  );

  it("proxies the API over HTTPS before the SPA fallback", () => {
    expect(rules.trim().split(/\r?\n/)).toEqual([
      "/api/v1/* https://163.176.241.51/api/v1/:splat 200!",
      "/* /index.html 200",
    ]);
  });
});
