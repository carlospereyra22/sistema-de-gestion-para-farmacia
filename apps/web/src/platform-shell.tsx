import { useCallback, useEffect, useState } from "react";
import { LogOut } from "lucide-react";
import { getPlatformSession, type PlatformSession } from "./lib/platform-api";
import { PlatformAccess } from "./platform-access";
import { PlatformAuditPanel } from "./platform-audit-panel";
import { PlatformOrganizations } from "./platform-organizations";
import { PlatformPlans } from "./platform-plans";
import { SessionStartup } from "./session-startup";

const sections = [
  ["farmacias", "Farmacias"],
  ["planes", "Planes"],
  ["auditoria", "Auditoría"],
] as const;
type Section = (typeof sections)[number][0];

/** Panel de los dueños de la SaaS. Se carga aparte: una farmacia nunca lo descarga. */
export default function PlatformShell({
  token,
  email,
  onLogout,
}: {
  token: string;
  email: string;
  onLogout: () => void;
}) {
  const [session, setSession] = useState<PlatformSession>();
  const [error, setError] = useState("");
  const [section, setSection] = useState<Section>("farmacias");
  useEffect(() => {
    if (window.location.pathname !== "/plataforma")
      window.history.replaceState(null, "", "/plataforma");
  }, []);
  useEffect(() => {
    let active = true;
    getPlatformSession(token)
      .then((value) => {
        if (active) setSession(value);
      })
      .catch((cause: unknown) => {
        if (active)
          setError(
            cause instanceof Error
              ? cause.message
              : "No se pudo abrir la plataforma.",
          );
      });
    return () => {
      active = false;
    };
  }, [token]);
  const verificationExpired = useCallback(
    () => setSession({ enrolled: true, verified: false }),
    [],
  );

  if (error)
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
        <section className="w-full max-w-md rounded-xl border bg-white p-6 shadow-sm">
          <h1 className="text-xl font-semibold">Plataforma</h1>
          <p role="alert" className="mt-3 text-sm text-red-700">
            {error}
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
  if (!session) return <SessionStartup failed={false} />;
  if (!session.verified)
    return (
      <PlatformAccess
        token={token}
        email={email}
        enrolled={session.enrolled}
        onVerified={() => setSession({ enrolled: true, verified: true })}
        onLogout={onLogout}
      />
    );
  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <header className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
        <div className="min-w-0">
          <p className="font-semibold leading-5">Farmatec</p>
          <p className="text-xs text-slate-500">Plataforma</p>
        </div>
        <div className="flex min-w-0 items-center gap-3">
          <span className="hidden truncate text-sm text-slate-500 sm:block">
            {email}
          </span>
          <button
            type="button"
            onClick={onLogout}
            className="flex shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-sm"
          >
            <LogOut size={16} />
            Cerrar sesión
          </button>
        </div>
      </header>
      <nav
        aria-label="Secciones de la plataforma"
        className="flex gap-1 overflow-x-auto border-b border-slate-200 bg-white px-4 sm:px-6"
      >
        {sections.map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-current={section === value ? "page" : undefined}
            onClick={() => setSection(value)}
            className={`shrink-0 border-b-2 px-3 py-2.5 text-sm font-medium ${section === value ? "border-teal-700 text-teal-800" : "border-transparent text-slate-500 hover:text-slate-800"}`}
          >
            {label}
          </button>
        ))}
      </nav>
      <main className="mx-auto w-full max-w-7xl p-4 sm:p-6">
        {section === "farmacias" && (
          <PlatformOrganizations
            token={token}
            onVerificationExpired={verificationExpired}
          />
        )}
        {section === "planes" && (
          <PlatformPlans
            token={token}
            onVerificationExpired={verificationExpired}
          />
        )}
        {section === "auditoria" && (
          <PlatformAuditPanel
            token={token}
            onVerificationExpired={verificationExpired}
          />
        )}
      </main>
    </div>
  );
}
