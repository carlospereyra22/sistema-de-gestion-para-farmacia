import { assertSplitLink } from "./split-link";

describe("vínculo para abrir cajas", () => {
  it("acepta sin vínculo o con vínculo completo", () => {
    expect(() =>
      assertSplitLink("x100", {
        splitTargetProductId: null,
        splitFactor: null,
      }),
    ).not.toThrow();
    expect(() =>
      assertSplitLink("x100", { splitTargetProductId: "x10", splitFactor: 10 }),
    ).not.toThrow();
  });

  it("rechaza vínculos a medias, factores fuera de rango y a sí mismo", () => {
    expect(() =>
      assertSplitLink("x100", {
        splitTargetProductId: "x10",
        splitFactor: null,
      }),
    ).toThrow("elegí el producto");
    expect(() =>
      assertSplitLink("x100", { splitTargetProductId: null, splitFactor: 10 }),
    ).toThrow("elegí el producto");
    for (const splitFactor of [1, 1001, 2.5])
      expect(() =>
        assertSplitLink("x100", { splitTargetProductId: "x10", splitFactor }),
      ).toThrow("entre 2 y 1000");
    expect(() =>
      assertSplitLink("x100", {
        splitTargetProductId: "x100",
        splitFactor: 10,
      }),
    ).toThrow("mismo producto");
  });
});
