import { readTicketHeader } from "./ticket-header";

describe("logo a color de la organización", () => {
  const imagen = "data:image/webp;base64,UklGRiQAAABXRUJQVlA4IBgAAAAw";

  it("guarda el logo original para la cabecera, aparte del raster del ticket", () => {
    const header = readTicketHeader({
      name: "Farmacia",
      ticketHeader: { logoImage: imagen, logoRaster: "0".repeat(4096) },
    });
    expect(header.logoImage).toBe(imagen);
    expect(header.logoRaster).toHaveLength(4096);
  });

  it("descarta lo que no es una imagen o es demasiado grande", () => {
    for (const logoImage of [
      "javascript:alert(1)",
      "data:image/svg+xml;base64,PHN2Zz4=",
      `data:image/png;base64,${"A".repeat(90_000)}`,
    ])
      expect(
        readTicketHeader({ name: "Farmacia", ticketHeader: { logoImage } })
          .logoImage,
      ).toBeUndefined();
  });
});
