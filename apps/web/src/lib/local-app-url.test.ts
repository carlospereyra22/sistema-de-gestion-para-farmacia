import { describe, it, expect } from "vitest";
import { localAppUrl } from "./local-app-url";
describe("local app origin", () => {
  it("redirects the numeric loopback before session restoration, preserving navigation", () => {
    expect(
      localAppUrl(
        "http://127.0.0.1:5173/ventas?x=1#detalle",
        "http://localhost:3000/api/v1",
        true,
      ),
    ).toBe("http://localhost:5173/ventas?x=1#detalle");
  });
  it("does not loop or alter production, remote servers or other hostnames", () => {
    expect(
      localAppUrl("http://localhost:5173", "http://localhost:3000", true),
    ).toBeUndefined();
    expect(
      localAppUrl("http://127.0.0.1:5173", "http://localhost:3000", false),
    ).toBeUndefined();
    expect(
      localAppUrl("http://127.0.0.1:5173", "https://api.example.com", true),
    ).toBeUndefined();
    expect(
      localAppUrl("http://example.com", "http://localhost:3000", true),
    ).toBeUndefined();
    expect(
      localAppUrl("invalid", "http://localhost:3000", true),
    ).toBeUndefined();
  });
});
