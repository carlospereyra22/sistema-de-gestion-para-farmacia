/** Un usuario sin farmacia no tiene sistema que abrir: sin esto queda esperando permisos. */
export function NoOrganizationScreen({
  email,
  onLogout,
}: {
  email: string;
  onLogout: () => void;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4 sm:px-6">
      <section className="w-full max-w-md rounded-xl border bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold">Tu usuario no tiene farmacia</h1>
        <p className="mt-1 break-all text-sm text-slate-500">{email}</p>
        <p className="mt-3 text-sm text-slate-600">
          Pedile al dueño de tu farmacia que te agregue, o escribinos si creés
          que es un error.
        </p>
        <button
          type="button"
          onClick={onLogout}
          className="mt-4 rounded-lg border px-4 py-2 text-sm"
        >
          Cerrar sesión
        </button>
      </section>
    </main>
  );
}
