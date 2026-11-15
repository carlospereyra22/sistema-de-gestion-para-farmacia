import {
  Fragment,
  useCallback,
  useEffect,
  useState,
  type ComponentType,
} from "react";
import {
  AlertCircle,
  Building2,
  Landmark,
  Layers,
  LifeBuoy,
  LogOut,
  MonitorSmartphone,
  ScrollText,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { AccountMenu } from "./account-menu";
import { SesionesAbiertasDialog } from "./sesiones-abiertas-dialog";
import {
  cerrarOtrasSesionesDelPanel,
  cerrarSesionDelPanel,
  getPlatformSession,
  listarSesionesDelPanel,
  salirDelPanel,
  type PlatformSession,
} from "./lib/platform-api";
import { BUSQUEDA_ARCA } from "./lib/funciones-ocultas";
import {
  guardarSeccion,
  seccionGuardada,
  type SeccionDelPanel,
} from "./lib/platform-navegacion";
import { SoporteContext, type EntrarComo } from "./lib/soporte-panel";
import { useWorkspaceSidebar } from "./use-workspace-sidebar";
import { NavigationRail } from "./navigation-rail";
import { PlatformAccess } from "./platform-access";
import { PlatformAuditPanel } from "./platform-audit-panel";
import { PlatformOrganizations } from "./platform-organizations";
import { PlatformPadron } from "./platform-padron";
import { PlatformPayments } from "./platform-payments";
import { PlatformPlans } from "./platform-plans";
import { PlatformSoporte } from "./platform-soporte";
import { SessionStartup } from "./session-startup";
import { SidebarToggle } from "./sidebar-toggle";

type Icono = ComponentType<{ className?: string; size?: number }>;

const grupos: {
  titulo: string;
  secciones: { valor: SeccionDelPanel; nombre: string; icono: Icono }[];
}[] = [
  {
    titulo: "CLIENTES",
    secciones: [
      { valor: "farmacias", nombre: "Farmacias", icono: Building2 },
      { valor: "pagos", nombre: "Pagos", icono: Wallet },
      { valor: "planes", nombre: "Planes", icono: Layers },
    ],
  },
  {
    titulo: "HERRAMIENTAS",
    secciones: [
      { valor: "soporte", nombre: "Soporte", icono: LifeBuoy },
      { valor: "arca", nombre: "ARCA", icono: Landmark },
      { valor: "auditoria", nombre: "Auditoría", icono: ScrollText },
    ],
  },
];

const visible = (valor: SeccionDelPanel) => BUSQUEDA_ARCA || valor !== "arca";

/** Panel de los dueños de la SaaS. Se carga aparte: una farmacia nunca lo descarga. */
export default function PlatformShell({
  token,
  email,
  onLogout,
  onEntrarComo,
}: {
  token: string;
  email: string;
  onLogout: () => void;
  /** Entrar como un usuario de una farmacia (SISTEMA-89). */
  onEntrarComo?: EntrarComo;
}) {
  const [session, setSession] = useState<PlatformSession>();
  const [error, setError] = useState("");
  const [section, setSection] = useState<SeccionDelPanel>(() => {
    const guardada = seccionGuardada();
    return visible(guardada) ? guardada : "farmacias";
  });
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
  const elegir = (valor: SeccionDelPanel) => {
    setSection(valor);
    guardarSeccion(valor);
  };

  if (error)
    return (
      <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(var(--color-niebla-900)_1px,transparent_1px)] bg-fondo px-4 [background-size:22px_22px]">
        <section className="w-full max-w-sm rounded-2xl border border-niebla-913 bg-white p-7 shadow-[0_12px_40px_-20px_rgba(35,58,66,0.35)]">
          <span className="grid size-11 place-items-center rounded-full bg-rose-50 text-rose-700">
            <AlertCircle size={20} aria-hidden="true" />
          </span>
          <h1 className="mt-4 text-xl font-bold text-slate-900">
            No se pudo abrir el panel
          </h1>
          <p role="alert" className="mt-2 text-sm leading-6 text-slate-600">
            {error}
          </p>
          <button
            type="button"
            onClick={onLogout}
            className="mt-6 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-niebla-900 text-sm font-semibold text-petroleo-517 hover:bg-slate-100"
          >
            <LogOut size={16} aria-hidden="true" />
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
    <PanelVerificado
      token={token}
      email={email}
      section={section}
      onSection={elegir}
      onLogout={onLogout}
      onEntrarComo={onEntrarComo}
      onVerificationExpired={verificationExpired}
    />
  );
}

function PanelVerificado({
  token,
  email,
  section,
  onSection,
  onLogout,
  onEntrarComo,
  onVerificationExpired,
}: {
  token: string;
  email: string;
  section: SeccionDelPanel;
  onSection: (valor: SeccionDelPanel) => void;
  onLogout: () => void;
  onEntrarComo?: EntrarComo;
  onVerificationExpired: () => void;
}) {
  const sidebar = useWorkspaceSidebar();
  const [viendoSesiones, setViendoSesiones] = useState(false);
  const cargarSesiones = useCallback(
    () => listarSesionesDelPanel(token),
    [token],
  );
  // Revoca el token de esta pestaña y cierra la sesión del navegador.
  const salir = () => {
    void salirDelPanel(token)
      .catch(() => {})
      .finally(onLogout);
  };
  const actual = grupos
    .flatMap(({ secciones }) => secciones)
    .find(({ valor }) => valor === section)!;
  const IconoActual = actual.icono;
  return (
    <main
      ref={sidebar.shell}
      className="workspace-shell min-h-screen bg-fondo text-slate-900"
    >
      <header
        ref={sidebar.header}
        className="workspace-header workspace-sales-header flex h-[82px] items-center justify-between border-b border-slate-200 bg-white px-6"
      >
        <div className="flex min-w-0 items-center gap-3">
          <SidebarToggle
            expanded={sidebar.expanded}
            onToggle={() => sidebar.setExpanded((value) => !value)}
          />
          <span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5 shadow-sm">
            <img
              src="/icons/app-192.png"
              alt="Farmatec"
              className="size-full object-contain"
            />
          </span>
          <div className="workspace-brand-text max-sm:hidden">
            <p className="font-semibold">Farmatec</p>
            <p className="text-xs text-slate-500">Panel de plataforma</p>
          </div>
          <h1 className="workspace-sales-title">
            <IconoActual size={22} aria-hidden />
            {actual.nombre}
          </h1>
        </div>
        <div className="workspace-header-actions flex items-center gap-3">
          <span
            title="Entraste con contraseña y código de 6 dígitos"
            className="hidden items-center gap-1.5 rounded-full border border-marca-908 bg-teal-50 px-3 py-1.5 text-xs font-semibold text-marca-535 md:inline-flex"
          >
            <ShieldCheck size={14} aria-hidden="true" />
            Acceso verificado
          </span>
          <button
            type="button"
            onClick={() => setViendoSesiones(true)}
            aria-label="Sesiones del panel"
            title="Sesiones del panel"
            className="grid size-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
          >
            <MonitorSmartphone size={18} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={salir}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-rose-200 bg-white px-3 text-sm font-semibold text-rose-700 hover:bg-rose-50"
          >
            <LogOut size={16} aria-hidden="true" />
            <span className="max-sm:hidden">Salir del panel</span>
          </button>
          <AccountMenu
            email={email}
            displayName="Superadmin"
            organizationName="Farmatec"
            branchName="Panel de plataforma"
            placeIcon={<ShieldCheck size={13} className="mt-0.5 shrink-0" />}
            onLogout={salir}
          />
          {viendoSesiones && (
            <SesionesAbiertasDialog
              titulo="Sesiones del panel"
              subtitulo="Pestañas donde se ingresó el código. Cerrarlas pide el código de nuevo ahí."
              textoCerrarTodas="Cerrar todas las demás"
              cargar={cargarSesiones}
              cerrarUna={(id) => cerrarSesionDelPanel(token, id)}
              cerrarTodas={() => cerrarOtrasSesionesDelPanel(token)}
              onClose={() => setViendoSesiones(false)}
            />
          )}
        </div>
      </header>
      <div
        data-sidebar={sidebar.expanded ? "expanded" : "collapsed"}
        className="workspace-layout grid min-h-[calc(100vh-5.125rem)] grid-cols-[252px_minmax(0,1fr)]"
      >
        <button
          className="workspace-navigation-backdrop"
          type="button"
          aria-label="Contraer barra lateral"
          onClick={() => sidebar.setExpanded(false)}
        />
        <NavigationRail
          collapsed={!sidebar.expanded}
          className="workspace-navigation border-r border-slate-200 bg-niebla-996 px-3 py-5"
        >
          {grupos.map(({ titulo, secciones }, indice) => (
            <Fragment key={titulo}>
              <p
                className={`${indice > 0 ? "mt-8" : ""} px-3 pb-3 text-xs font-semibold tracking-wide text-slate-600`}
              >
                {titulo}
              </p>
              <nav
                aria-label={
                  indice === 0 ? "Secciones de la plataforma" : "Herramientas"
                }
                className="space-y-1"
              >
                {secciones
                  .filter(({ valor }) => visible(valor))
                  .map(({ valor, nombre, icono: Icono }) => {
                    const activa = section === valor;
                    return (
                      <button
                        key={valor}
                        type="button"
                        aria-label={nombre}
                        aria-current={activa ? "page" : undefined}
                        onClick={() => onSection(valor)}
                        className={`flex min-h-11 w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left text-sm leading-5 ${activa ? "border-marca-908 bg-marca-970 font-semibold text-marca-535 shadow-[0_3px_10px_rgb(8_127_112_/_7%)]" : "border-transparent text-slate-600 hover:border-slate-100 hover:bg-niebla-973 hover:text-slate-800"}`}
                      >
                        <span
                          className={`grid size-6 shrink-0 place-items-center rounded-md ${activa ? "bg-white text-marca-535 shadow-sm" : "text-slate-500"}`}
                        >
                          <Icono className="size-4" />
                        </span>
                        <span>{nombre}</span>
                      </button>
                    );
                  })}
              </nav>
            </Fragment>
          ))}
        </NavigationRail>
        <SoporteContext.Provider value={onEntrarComo}>
          <section className="workspace-content min-w-0 bg-fondo p-4 lg:px-7 lg:py-5">
            <div
              key={section}
              className="panel-animado mx-auto w-full max-w-[1400px] pt-3"
            >
              {section === "farmacias" && (
                <PlatformOrganizations
                  token={token}
                  onVerificationExpired={onVerificationExpired}
                />
              )}
              {section === "pagos" && (
                <PlatformPayments
                  token={token}
                  onVerificationExpired={onVerificationExpired}
                />
              )}
              {section === "planes" && (
                <PlatformPlans
                  token={token}
                  onVerificationExpired={onVerificationExpired}
                />
              )}
              {BUSQUEDA_ARCA && section === "arca" && (
                <PlatformPadron
                  token={token}
                  onVerificationExpired={onVerificationExpired}
                />
              )}
              {section === "soporte" && (
                <PlatformSoporte
                  token={token}
                  onVerificationExpired={onVerificationExpired}
                />
              )}
              {section === "auditoria" && (
                <PlatformAuditPanel
                  token={token}
                  onVerificationExpired={onVerificationExpired}
                />
              )}
            </div>
          </section>
        </SoporteContext.Provider>
      </div>
    </main>
  );
}
