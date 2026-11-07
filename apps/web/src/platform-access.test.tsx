import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PlatformAccess } from "./platform-access";

const base = {
  token: "token",
  email: "dani@example.com",
  onVerified: () => {},
  onLogout: () => {},
};

describe("PlatformAccess", () => {
  it("sin código configurado explica para qué es y no pide nada", () => {
    const html = renderToStaticMarkup(
      <PlatformAccess {...base} enrolled={false} />,
    );

    expect(html).toContain("Configurá tu código");
    expect(html).toContain("Empezar");
    expect(html).not.toContain("Código de 6 dígitos");
  });

  it("al empezar muestra el QR, la clave manual y pide confirmar", () => {
    const html = renderToStaticMarkup(
      <PlatformAccess
        {...base}
        enrolled={false}
        initialEnrollment={{
          secret: "CLAVEDEPRUEBA",
          uri: "otpauth://totp/Farmatec?secret=CLAVEDEPRUEBA",
        }}
      />,
    );

    expect(html).toContain("Código QR para la aplicación del celular");
    expect(html).toContain("CLAVEDEPRUEBA");
    expect(html).toContain("<rect");
    expect(html).toContain("Confirmar");
  });

  it("con el código configurado solo lo pide, sin mostrar ningún secreto", () => {
    const html = renderToStaticMarkup(<PlatformAccess {...base} enrolled />);

    expect(html).toContain("Ingresá tu código");
    expect(html).toContain("Entrar");
    expect(html).not.toContain("QR");
  });

  it("siempre deja cerrar sesión", () => {
    for (const enrolled of [true, false])
      expect(
        renderToStaticMarkup(<PlatformAccess {...base} enrolled={enrolled} />),
      ).toContain("Cerrar sesión");
  });
});
