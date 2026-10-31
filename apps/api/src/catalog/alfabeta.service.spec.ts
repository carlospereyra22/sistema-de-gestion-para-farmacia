import {
  AlfaBetaService,
  filterAlfaBetaMatches,
  parseAlfaBetaDetail,
  parseAlfaBetaSearch,
} from "./alfabeta.service";

describe("AlfaBeta read-only consultation", () => {
  afterEach(() => jest.restoreAllMocks());
  it("parses names and laboratories without accepting arbitrary URLs", () => {
    const html = `<form name="pr1" action="medicine.html"><input name="patron"></form><a class="rprod">MEDICAMENTO &amp; UNO</a><a class="rlab">Laboratorio</a><form name="pr2" action="https://evil.test/a.html"></form><a class="rprod">Otro</a>`;
    expect(parseAlfaBetaSearch(html)).toEqual([
      {
        id: "medicine.html",
        name: "MEDICAMENTO & UNO",
        laboratory: "Laboratorio",
      },
    ]);
  });
  it("does not confuse format failures with no matches", () => {
    expect(parseAlfaBetaSearch("<b>0</b> coincidencias")).toEqual([]);
    expect(
      parseAlfaBetaSearch(
        'No se han encontrado coincidencias para <b>"actron 400"</b> en el índice de Nombres.',
      ),
    ).toEqual([]);
    expect(() =>
      parseAlfaBetaSearch("<html>Service unavailable</html>"),
    ).toThrow();
  });
  it("matches all words regardless of spacing, accents or order without mixing strengths", () => {
    const matches = [
      {
        id: "a.html",
        name: "ACTRON  400 RÁPIDA ACCION NF",
        laboratory: "Bayer",
      },
      { id: "b.html", name: "ACTRON 600", laboratory: "Bayer" },
      { id: "c.html", name: "ACTRON 4000", laboratory: "Bayer" },
    ];
    expect(filterAlfaBetaMatches(matches, " actron   400 ")).toEqual([
      matches[0],
    ]);
    expect(filterAlfaBetaMatches(matches, "400 actron rapida")).toEqual([
      matches[0],
    ]);
    expect(filterAlfaBetaMatches(matches, "actron 800")).toEqual([]);
    expect(filterAlfaBetaMatches(matches, "!!!")).toEqual([]);
  });
  it("filters before limiting results and reuses the brand query cache", async () => {
    const html = Array.from(
      { length: 35 },
      (_, i) =>
        `<form name="pr${i + 1}" action="medicine-${i}.html"></form><a class="rprod">ACTRON ${i === 34 ? "400" : "600"}</a><a class="rlab">Bayer</a>`,
    ).join("");
    const fetchMock = jest
      .spyOn(global, "fetch")
      .mockImplementation(async () => new Response(html));
    const service = new AlfaBetaService();
    expect(await service.search("actron")).toHaveLength(30);
    expect(await service.search("actron 400")).toEqual([
      { id: "medicine-34.html", name: "ACTRON 400", laboratory: "Bayer" },
    ]);
    expect(await service.search("400 ACTRON")).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ body: "patron=actron&src=prs&mde=pat" }),
    );
  });
  it("extracts only presentation facts and preserves absent prices", () => {
    const html = `<span class="tproducto">MEDICAMENTO</span><tr><td class="tddesc">comp. x 10</td><td class="tdprecio">$1.234,50</td><td class="tdfecha">(10/09/26)</td></tr><tr><td class="tddesc">comp. x 20</td><td class="tdprecio">No informado</td><td class="tdfecha"></td></tr><p>Unrelated advertising</p>`;
    expect(parseAlfaBetaDetail(html)).toEqual({
      name: "MEDICAMENTO",
      presentations: [
        {
          presentation: "comp. x 10",
          priceMinor: 123450,
          updatedAt: "10/09/26",
        },
        { presentation: "comp. x 20", priceMinor: null, updatedAt: null },
      ],
    });
    expect(() => parseAlfaBetaDetail("<html>Changed format</html>")).toThrow();
  });
  it("rejects traversal, arbitrary URLs and invalid queries before fetching", async () => {
    const fetchMock = jest.spyOn(global, "fetch");
    const service = new AlfaBetaService();
    for (const id of [
      "../a.html",
      "https://evil.test/a.html",
      "a.html?url=x",
      "a/b.html",
    ])
      await expect(service.detail(id)).rejects.toThrow();
    await expect(service.search(" ")).rejects.toThrow();
    await expect(service.search("x".repeat(121))).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("reports upstream failure and does not follow redirects", async () => {
    const fetchMock = jest
      .spyOn(global, "fetch")
      .mockResolvedValue(new Response("", { status: 503 }));
    await expect(new AlfaBetaService().search("medicamento")).rejects.toThrow(
      "no está disponible",
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "https://www.alfabeta.net/precio/srv",
      expect.objectContaining({
        method: "POST",
        redirect: "error",
        body: "patron=medicamento&src=prs&mde=pat",
      }),
    );
  });
});
