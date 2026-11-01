import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { LoginScreen } from "./login-screen";
import { UserPasswordDialog } from "./user-password-dialog";

const noop = () => undefined;

describe("login screen", () => {
  const html = renderToStaticMarkup(
    <LoginScreen
      email=""
      password=""
      message="La sesión venció. Iniciá sesión nuevamente."
      onEmailChange={noop}
      onPasswordChange={noop}
      onSubmit={async () => undefined}
    />,
  );

  it("pide correo y contraseña, sin sucursal", () => {
    expect(html).toContain("Correo electrónico");
    expect(html).toContain('autoComplete="username"');
    expect(html).toContain('id="login-password"');
    expect(html).toContain('minLength="12"');
    expect(html).not.toContain("Sucursal");
  });

  it("ofrece ver la contraseña y La olvidaste", () => {
    expect(html).toContain('aria-label="Mostrar contraseña"');
    expect(html).toContain("¿La olvidaste?");
  });

  it("muestra el error como alerta", () => {
    expect(html).toContain('role="alert"');
    expect(html).toContain("La sesión venció");
  });

  it("en desarrollo enlaza a la landing para pedir una demo", () => {
    expect(html).toContain('href="http://localhost:5174#contacto"');
    expect(html).toContain("Pedí una demo");
  });
});

describe("user password dialog", () => {
  it("pide la contraseña dos veces y avisa que cierra sesiones", () => {
    const html = renderToStaticMarkup(
      <UserPasswordDialog
        token="t"
        organizationId="o"
        user={{
          displayName: null,
          active: true,
          user: { id: "u", email: "cajera@farmacia.com", active: true },
          branches: [],
          roles: [],
        }}
        onDone={noop}
        onClose={noop}
      />,
    );
    expect(html).toContain("Restablecer contraseña");
    expect(html).toContain("cajera@farmacia.com");
    expect(html).toContain("Repetir contraseña");
    expect(html).toContain("se cierran las sesiones");
    expect(html.match(/autoComplete="new-password"/gi)).toHaveLength(2);
  });
});
