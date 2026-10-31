import { validateEnvironment } from "./environment.validation";

describe("API bind address", () => {
  it("defaults to loopback", () => {
    expect(validateEnvironment({}).HOST).toBe("127.0.0.1");
  });
  it("allows an explicit bind address", () => {
    expect(validateEnvironment({ HOST: "0.0.0.0" }).HOST).toBe("0.0.0.0");
  });
  it("rejects invalid bind addresses", () => {
    expect(() =>
      validateEnvironment({ HOST: "https://example.com" }),
    ).toThrow();
  });
});
