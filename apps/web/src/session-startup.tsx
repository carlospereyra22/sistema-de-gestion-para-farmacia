export function SessionStartup({ failed }: { failed: boolean }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-6">
      <section className="w-full max-w-md rounded-xl border bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold">Sistema de Gestión</h1>
        <p role="status" className="mt-3 text-sm text-slate-600">
          {failed
            ? "No pudimos conectar con el servidor para recuperar tu sesión. Reintentamos automáticamente cada 15 segundos."
            : "Conectando y recuperando tu sesión…"}
        </p>
        {failed && (
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-4 rounded-lg bg-teal-700 px-4 py-2 text-sm text-white"
          >
            Reintentar ahora
          </button>
        )}
      </section>
    </main>
  );
}
