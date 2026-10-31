import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { saleCostTooltipController } from "./lib/sale-cost-tooltip";
import { ChevronDown, LogOut, MapPin, UserRound } from "lucide-react";
import { FullscreenMenuButton } from "./fullscreen-menu-button";
import { StatusToast } from "./status-toast";
import { InstallMenuButton } from "./install-menu-button";

export function AccountMenu({
  email,
  displayName,
  organizationName,
  branchName,
  branchSelector,
  onLogout,
}: {
  email: string;
  displayName?: string;
  organizationName?: string;
  branchName: string;
  branchSelector?: ReactNode;
  onLogout: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [fullscreenError, setFullscreenError] = useState("");
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  useLayoutEffect(() => {
    if (open) return saleCostTooltipController.suspend();
  }, [open]);
  const label =
    displayName?.trim() ||
    organizationName?.trim() ||
    email.split("@")[0] ||
    "Mi cuenta";
  const words = label.split(/[\s._-]+/).filter(Boolean);
  const initials = (
    words.length > 1
      ? `${words[0]?.[0] ?? ""}${words.at(-1)?.[0] ?? ""}`
      : label.slice(0, 2)
  ).toLocaleUpperCase("es-AR");

  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !container.current?.contains(event.target)
      )
        setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  return (
    <div
      ref={container}
      className="relative shrink-0"
      data-account-menu-open={open ? "true" : undefined}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <button
        ref={trigger}
        type="button"
        aria-label={`Cuenta de ${label}`}
        title={`Cuenta de ${label} · ${branchName}`}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
        className={`workspace-account-trigger flex items-center gap-3 rounded-xl border px-2.5 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 sm:px-3 ${open ? "border-teal-100 bg-teal-50/60" : "border-transparent hover:border-slate-100 hover:bg-slate-50"}`}
      >
        <span
          aria-hidden="true"
          className="grid size-10 shrink-0 place-items-center rounded-full bg-[#e4f6f0] text-sm font-bold tracking-wide text-[#087f70]"
        >
          {initials}
        </span>
        <span className="workspace-account-label hidden min-w-0 sm:block">
          <span
            className="block max-w-52 truncate text-[13px] font-semibold leading-5 text-slate-800"
            title={label}
          >
            {label}
          </span>
          <span
            className="block max-w-52 truncate text-[11px] leading-4 text-slate-500"
            title={branchName}
          >
            {branchName}
          </span>
        </span>
        <ChevronDown
          aria-hidden="true"
          size={15}
          className={`text-slate-500 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div
          id={panelId}
          className="workspace-account-panel absolute right-0 top-full z-40 mt-2 w-52 max-w-[calc(100vw-24px)] rounded-xl border border-slate-200 bg-white shadow-[0_12px_40px_rgb(25_56_74_/_12%)]"
        >
          <div className="rounded-t-xl border-b border-slate-100 bg-slate-50/70 px-4 py-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-slate-800">
              <UserRound size={16} className="shrink-0 text-teal-700" />
              <span className="break-words">
                {displayName?.trim() || "Mi cuenta"}
              </span>
            </p>
            <p className="mt-1.5 break-all text-xs text-slate-500">{email}</p>
            {branchSelector ? (
              <p className="mt-3 text-xs font-semibold text-slate-700">
                Sucursal
              </p>
            ) : (
              organizationName && (
                <p className="mt-3 break-words text-xs font-medium text-slate-700">
                  {organizationName}
                </p>
              )
            )}
            <div className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
              {!branchSelector && (
                <MapPin size={13} className="mt-0.5 shrink-0" />
              )}
              {branchSelector ?? (
                <span className="break-words">{branchName}</span>
              )}
            </div>
          </div>
          <div className="p-2">
            <InstallMenuButton
              onDone={() => setOpen(false)}
              onError={(message) => {
                setFullscreenError(message);
                setOpen(false);
                trigger.current?.focus();
              }}
            />
            <FullscreenMenuButton
              onDone={() => {
                setFullscreenError("");
                setOpen(false);
                trigger.current?.focus();
              }}
              onError={(message) => {
                setFullscreenError(message);
                setOpen(false);
                trigger.current?.focus();
              }}
            />
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onLogout();
              }}
              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-slate-600 outline-none hover:bg-rose-50 hover:text-rose-700 focus-visible:ring-2 focus-visible:ring-teal-600"
            >
              <LogOut size={17} />
              Cerrar sesión
            </button>
          </div>
        </div>
      )}
      {fullscreenError && (
        <StatusToast
          variant="error"
          message={fullscreenError}
          onClose={() => setFullscreenError("")}
        />
      )}
    </div>
  );
}
