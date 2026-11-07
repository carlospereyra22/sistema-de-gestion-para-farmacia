import { PasswordChangeForm } from "./password-change-form";

/** Pantalla previa al sistema: la API bloquea todo lo demás hasta cambiar la clave. */
export function ForcedPasswordChange({
  token,
  email,
  onDone,
  onLogout,
}: {
  token: string;
  email: string;
  onDone: () => void;
  onLogout: () => void;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-6 sm:px-6">
      <section className="w-full max-w-md rounded-xl border bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold">Elegí tu contraseña</h1>
        <p className="mt-1 break-all text-sm text-slate-500">{email}</p>
        <p className="mt-3 text-sm text-slate-600">
          Por seguridad, antes de empezar cambiá la contraseña que te pasaron
          por una que solo conozcas vos.
        </p>
        <PasswordChangeForm
          token={token}
          submitLabel="Guardar y entrar"
          secondaryLabel="Cerrar sesión"
          onSecondary={onLogout}
          onDone={onDone}
        />
      </section>
    </main>
  );
}
