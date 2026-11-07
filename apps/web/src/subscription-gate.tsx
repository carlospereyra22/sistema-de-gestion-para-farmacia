import {
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Lock, LogOut, MessageCircle, RefreshCw } from "lucide-react";
import { SUBSCRIPTION_RESTRICTED } from "./lib/api-fetch";
import {
  SubscriptionNoticeContext,
  type SubscriptionNoticeState,
} from "./lib/subscription-notice-context";
import {
  blockedCopy,
  getSubscriptionStatus,
  subscriptionNotice,
  type SubscriptionStatus,
} from "./lib/subscription-status";
import { SessionStartup } from "./session-startup";
import { SubscriptionDocuments } from "./subscription-documents";
import { ars } from "./supplier-payables/api";
import { primary, secondary } from "./supplier-payables/dialog";

/** Número para regularizar, formato internacional sin "+". Sin configurar, no se muestra. */
const supportWhatsapp: string | undefined = (
  import.meta.env.VITE_SUPPORT_WHATSAPP as string | undefined
)?.trim();

/** Mismo estilo que el chip de caja del encabezado. */
const chipTones = {
  info: "bg-sky-50 text-sky-800",
  warning: "bg-amber-50 text-amber-800",
  danger: "bg-rose-50 text-rose-700",
} as const;

type NoticeContext = SubscriptionNoticeState;

const readDismissed = (key: string) => {
  try {
    return sessionStorage.getItem(key) === "1";
  } catch {
    return false;
  }
};

const rememberDismissed = (key: string) => {
  try {
    sessionStorage.setItem(key, "1");
  } catch {
    /* Sin almacenamiento, el aviso vuelve al recargar. */
  }
};

function NoticeChip({ status, storageKey }: NoticeContext) {
  const [hidden, setHidden] = useState(() => readDismissed(storageKey));
  const [open, setOpen] = useState(false);
  const notice = subscriptionNotice(status);
  if (!notice || (notice.dismissible && hidden)) return null;
  return (
    <div className="relative">
      <button
        type="button"
        aria-expanded={open}
        title={notice.text}
        onClick={() => setOpen((value) => !value)}
        className={`inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 ${chipTones[notice.tone]}`}
      >
        <span aria-hidden className="size-1.5 rounded-full bg-current" />
        {/* El tamaño va en el span: la regla global de button pisa las utilidades. */}
        <span className="text-xs font-semibold">{notice.label}</span>
      </button>
      {open && (
        <div
          role="status"
          className="fixed inset-x-4 top-[90px] z-50 rounded-xl border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-700 shadow-[0_12px_40px_rgb(15_23_42_/_16%)] sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-80"
        >
          <p>{notice.text}</p>
          <div className="mt-3 flex justify-end gap-2">
            {notice.dismissible && (
              <button
                type="button"
                className={secondary}
                onClick={() => {
                  rememberDismissed(storageKey);
                  setHidden(true);
                }}
              >
                Ocultar aviso
              </button>
            )}
            <button
              type="button"
              className={secondary}
              onClick={() => setOpen(false)}
            >
              Cerrar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Aviso del abono en el encabezado, como el de caja: no cambia ninguna altura, así el
 * punto de venta sigue entrando completo en la pantalla.
 */
export function SubscriptionNoticeChip() {
  const context = useContext(SubscriptionNoticeContext);
  if (!context) return null;
  return <NoticeChip key={context.storageKey} {...context} />;
}

export function SubscriptionBlockedScreen({
  status,
  token,
  organizationId,
  email,
  onVerify,
  onLogout,
}: {
  status: SubscriptionStatus;
  token: string;
  organizationId: string;
  email: string;
  onVerify: () => Promise<SubscriptionStatus | null | undefined>;
  onLogout: () => void;
}) {
  const [verifying, setVerifying] = useState(false);
  const [stillBlocked, setStillBlocked] = useState(false);
  const [documents, setDocuments] = useState(false);
  const copy = blockedCopy(status);
  const balance =
    status.isOwner && status.balanceMinor && BigInt(status.balanceMinor) > 0n
      ? status.balanceMinor
      : null;
  return (
    <main className="min-h-screen bg-slate-100 px-4 py-8 text-slate-900">
      <section className="mx-auto w-full max-w-3xl rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-rose-50 text-rose-600">
            <Lock size={22} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h1 className="text-xl font-semibold">{copy.title}</h1>
            <p className="mt-1 text-sm text-slate-500">{email}</p>
          </div>
        </div>
        <p className="mt-4 text-sm leading-6 text-slate-700">{copy.body}</p>
        {balance && (
          <p className="mt-3 rounded-lg bg-slate-50 px-4 py-3 text-sm">
            Saldo pendiente:{" "}
            <strong className="font-semibold">{ars(balance)}</strong>
          </p>
        )}
        {status.isOwner && supportWhatsapp && (
          <a
            href={`https://wa.me/${supportWhatsapp}`}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-teal-700 hover:underline"
          >
            <MessageCircle size={16} />
            Escribinos por WhatsApp
          </a>
        )}
        {stillBlocked && (
          <p role="alert" className="mt-4 text-sm text-amber-700">
            Todavía figura sin pago. Si ya pagaste, puede que todavía no lo
            hayamos registrado: comunicate con nosotros.
          </p>
        )}
        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={verifying}
            className={primary}
            onClick={async () => {
              setVerifying(true);
              setStillBlocked(false);
              const result = await onVerify();
              setVerifying(false);
              if (!result || result.access === "BLOCKED") setStillBlocked(true);
            }}
          >
            <RefreshCw size={16} />
            {verifying ? "Verificando…" : "Ya pagué, verificar"}
          </button>
          {status.isOwner && (
            <button
              type="button"
              className={secondary}
              aria-expanded={documents}
              onClick={() => setDocuments((value) => !value)}
            >
              {documents ? "Ocultar facturas" : "Ver facturas"}
            </button>
          )}
          <button type="button" className={secondary} onClick={onLogout}>
            <LogOut size={16} />
            Cerrar sesión
          </button>
        </div>
        {documents && (
          <SubscriptionDocuments
            token={token}
            organizationId={organizationId}
          />
        )}
      </section>
    </main>
  );
}

/**
 * Aplica el estado comercial en la web. La API es la que corta: esto solo avisa y, si la
 * farmacia está bloqueada, muestra cómo regularizar en lugar del sistema. Ante cualquier
 * duda (sin respuesta, error) deja usar el sistema como siempre.
 */
export function SubscriptionGate({
  token,
  organizationId,
  email,
  onLogout,
  children,
}: {
  token?: string;
  organizationId?: string;
  email: string;
  onLogout: () => void;
  children: ReactNode;
}) {
  const [status, setStatus] = useState<SubscriptionStatus | null>();
  const running = useRef(false);
  const check = useCallback(async () => {
    if (!token || !organizationId || running.current) return undefined;
    running.current = true;
    try {
      const value = await getSubscriptionStatus(token, organizationId);
      setStatus(value);
      return value;
    } catch {
      setStatus((current) => (current === undefined ? null : current));
      return null;
    } finally {
      running.current = false;
    }
  }, [token, organizationId]);
  useEffect(() => {
    void check();
    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };
    const onRestricted = () => void check();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener(SUBSCRIPTION_RESTRICTED, onRestricted);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener(SUBSCRIPTION_RESTRICTED, onRestricted);
    };
  }, [check]);

  if (!token || !organizationId) return children;
  if (status === undefined) return <SessionStartup failed={false} />;
  if (status?.access === "BLOCKED")
    return (
      <SubscriptionBlockedScreen
        status={status}
        token={token}
        organizationId={organizationId}
        email={email}
        onVerify={check}
        onLogout={onLogout}
      />
    );
  const storageKey = `aviso-abono:${organizationId}:${status?.stage ?? ""}:${status?.coveredUntil ?? ""}`;
  return (
    <SubscriptionNoticeContext.Provider
      value={status ? { status, storageKey } : null}
    >
      {children}
    </SubscriptionNoticeContext.Provider>
  );
}
