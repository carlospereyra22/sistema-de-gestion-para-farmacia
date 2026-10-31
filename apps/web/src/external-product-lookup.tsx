import { useEffect, useRef, useState } from "react";
import {
  LoaderCircle,
  Search,
  Package,
  ArrowUpRight,
  Check,
} from "lucide-react";
import { useProductScanner } from "./use-product-scanner";
import { resolveProductKind } from "./lib/product-kind";
import { apiBaseUrl, type MedicineReference } from "./lib/api";
import {
  externalGtin,
  externalSuggestionGroups,
  type ExternalProductCandidate,
} from "./lib/external-product";

type Result = {
  reference: ExternalProductCandidate[];
  openBeauty: { candidates: ExternalProductCandidate[] };
  truncated: boolean;
};
type MedicineResult = {
  matches: MedicineReference[];
  automaticSelection: boolean;
};
type LookupState = {
  key: string;
  busy?: boolean;
  medicineBusy?: boolean;
  externalBusy?: boolean;
  messages?: string[];
  result?: Result;
  medicines?: MedicineResult;
  linked?: boolean;
  applied?: boolean;
};

export function ExternalProductLookup({
  token,
  organizationId,
  code,
  onCode,
  onApply,
  onMedication,
  allowAutomatic,
  disabled,
  medicationEnabled = true,
  medicationMode,
  knownMedication,
  onKindDetected,
  onKindConfirmed,
}: {
  token: string;
  organizationId: string;
  code: string;
  onCode: (value: string) => void;
  onApply: (
    candidate: ExternalProductCandidate,
  ) => void | boolean | Promise<void | boolean>;
  onMedication: (reference: MedicineReference) => void;
  allowAutomatic: boolean;
  disabled: boolean;
  medicationEnabled?: boolean;
  medicationMode?: "auto" | "medicine" | "other";
  knownMedication?: boolean;
  onKindDetected?: (value: boolean) => void;
  onKindConfirmed?: (value: boolean) => void;
}) {
  const [attempt, setAttempt] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const optionList = useRef<HTMLDivElement>(null);
  const chosenRequest = useRef("");
  const [dismissed, setDismissed] = useState("");
  const [above, setAbove] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<{
    key: string;
    message: string;
  }>();
  const barcodeInput = useRef<HTMLInputElement>(null);
  useProductScanner(
    barcodeInput,
    (value) => {
      onCode(value);
      setAttempt((current) => current + 1);
    },
    disabled,
  );
  const [state, setState] = useState<LookupState>({ key: "" });
  // A session renewal is not a new barcode search. Keep the displayed result
  // and use the latest credentials on the next scan or explicit retry.
  const credentials = useRef(token);
  useEffect(() => {
    credentials.current = token;
  }, [token]);
  const callbacks = useRef({
    onMedication,
    allowAutomatic,
    disabled,
    onKindDetected,
  });
  useEffect(() => {
    callbacks.current = {
      onMedication,
      allowAutomatic,
      disabled,
      onKindDetected,
    };
  }, [onMedication, allowAutomatic, disabled, onKindDetected]);
  const trimmed = code.trim();
  const canonical = externalGtin(trimmed);
  const mode = medicationMode ?? (medicationEnabled ? "medicine" : "other");
  const detected = resolveProductKind(mode, knownMedication);
  const key = `${organizationId}:${canonical ?? trimmed}:${mode}:${knownMedication}`;
  const requestKey = `${key}:${attempt}`;
  useEffect(() => {
    if (!canonical) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setState({
        key,
        busy: true,
        medicineBusy: detected !== false,
        externalBusy: true,
      });
      void (async () => {
        const request = async <T,>(path: string): Promise<T> => {
          const response = await fetch(
            `${apiBaseUrl}/organizations/${encodeURIComponent(organizationId)}/catalog/${path}`,
            {
              headers: { Authorization: `Bearer ${credentials.current}` },
              signal: controller.signal,
            },
          );
          if (!response.ok) throw new Error("Fuente no disponible");
          return response.json() as Promise<T>;
        };
        const queryCode = canonical.startsWith("0")
          ? canonical.slice(1)
          : canonical;
        // Publish each source independently: a slow official index must not
        // hold back an already available local product (or vice versa).
        const update = (patch: Partial<LookupState>, message?: string) => {
          if (controller.signal.aborted) return;
          setState((previous) => {
            if (previous.key !== key) return previous;
            const next = { ...previous, ...patch };
            next.busy = Boolean(next.medicineBusy || next.externalBusy);
            if (message)
              next.messages = [...(previous.messages ?? []), message];
            return next;
          });
        };
        const searchMedicine = () => {
          void request<MedicineResult>(
            `medicine-references/barcode/${queryCode}`,
          ).then(
            (medicines) => {
              if (controller.signal.aborted) return;
              const exact = medicines.matches.filter(
                (item) => externalGtin(item.barcode) === canonical,
              );
              const single =
                exact.length === 1 && medicines.automaticSelection
                  ? exact[0]
                  : undefined;
              const linked = Boolean(
                single &&
                callbacks.current.allowAutomatic &&
                !callbacks.current.disabled &&
                chosenRequest.current !== requestKey,
              );
              if (single) callbacks.current.onKindDetected?.(true);
              if (single && linked) callbacks.current.onMedication(single);
              update({
                medicines: { ...medicines, matches: exact },
                linked,
                medicineBusy: false,
              });
            },
            () =>
              update(
                { medicineBusy: false },
                "No se pudo consultar el padrón de medicamentos.",
              ),
          );
        };
        if (detected !== undefined)
          callbacks.current.onKindDetected?.(detected);
        if (detected === true) searchMedicine();
        void request<Result>(`external-products/barcode/${queryCode}`).then(
          (result) => {
            if (controller.signal.aborted) return;
            update({ result, externalBusy: false });
            if (detected === undefined) {
              const matches = [
                ...result.reference,
                ...result.openBeauty.candidates,
              ].filter(
                (item) =>
                  externalGtin(item.code) === canonical ||
                  item.gtin14 === canonical,
              );
              if (matches.length) {
                if (matches.every((item) => !item.type_review_reason))
                  callbacks.current.onKindDetected?.(false);
                update({ medicineBusy: false });
              } else searchMedicine();
            }
          },
          () => {
            update(
              { externalBusy: false },
              "Catálogo de perfumería no disponible.",
            );
            if (!controller.signal.aborted && detected === undefined)
              searchMedicine();
          },
        );
      })();
    }, 200);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [canonical, key, organizationId, requestKey, detected]);
  const current = state.key === key ? state : undefined;
  const medicines = current?.medicines?.matches ?? [];
  const groups = current?.result
    ? externalSuggestionGroups(
        current.result.reference,
        current.result.openBeauty.candidates,
      )
    : [];
  const count =
    medicines.length +
    groups.reduce((sum, group) => sum + group.rows.length, 0);
  const showDropdown =
    !current?.linked &&
    !medicines.length &&
    groups.some((group) => group.rows.length) &&
    dismissed !== requestKey;
  useEffect(() => {
    if (!showDropdown) return;
    const bounds = barcodeInput.current?.getBoundingClientRect();
    const body = root.current
      ?.closest("[data-product-editor-body]")
      ?.getBoundingClientRect();
    setAbove(
      Boolean(
        bounds &&
        body &&
        body.bottom - bounds.bottom < 190 &&
        bounds.top - body.top > 190,
      ),
    );
    const close = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target))
        setDismissed(requestKey);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [showDropdown, requestKey]);
  const apply = async (candidate: ExternalProductCandidate) => {
    if (disabled || applying) return;
    if (candidate.type_review_reason && medicationMode !== "other") {
      setApplyError({
        key,
        message:
          "Las fuentes difieren. Confirmá el tipo antes de completar la ficha.",
      });
      return;
    }
    chosenRequest.current = requestKey;
    setApplying(true);
    setApplyError(undefined);
    try {
      const result = await onApply(candidate);
      if (result !== false) {
        setDismissed(requestKey);
        setState((previous) =>
          previous.key === key ? { ...previous, applied: true } : previous,
        );
      }
    } catch {
      setApplyError({
        key,
        message: "No se pudieron completar los datos. Reintentá.",
      });
    } finally {
      setApplying(false);
    }
  };
  return (
    <div
      ref={root}
      className="min-w-0"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget))
          setDismissed(requestKey);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && showDropdown) {
          event.preventDefault();
          event.stopPropagation();
          setDismissed(requestKey);
          barcodeInput.current?.focus({ preventScroll: true });
        }
      }}
    >
      <label
        htmlFor="external-product-code"
        className="mt-3 block text-xs font-semibold text-slate-600"
      >
        Código de barras
      </label>
      <div className="relative mt-1">
        <input
          ref={barcodeInput}
          id="external-product-code"
          value={code}
          disabled={disabled}
          aria-expanded={showDropdown}
          aria-controls={showDropdown ? "external-product-options" : undefined}
          onChange={(event) => onCode(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" && count && !current?.linked) {
              event.preventDefault();
              setDismissed("");
              requestAnimationFrame(() =>
                optionList.current
                  ?.querySelector<HTMLButtonElement>("button")
                  ?.focus(),
              );
            }
            if (event.key === "Enter") {
              event.preventDefault();
              setAttempt((value) => value + 1);
            }
          }}
          inputMode="numeric"
          autoComplete="off"
          placeholder="Ej. 7791234567890"
          className="h-10 w-full rounded-md border border-slate-300 bg-white py-2 pl-3 pr-9 text-sm outline-none placeholder:text-slate-400 focus:border-teal-500"
        />
        <button
          type="button"
          disabled={disabled || !canonical || applying}
          onClick={() =>
            count && !current?.linked
              ? setDismissed(showDropdown ? requestKey : "")
              : setAttempt((value) => value + 1)
          }
          aria-label="Buscar código de barras"
          className="absolute right-0 top-0 flex h-10 w-9 items-center justify-center text-slate-400 hover:text-teal-700 disabled:opacity-40"
        >
          {current?.busy && !count ? (
            <LoaderCircle size={15} className="animate-spin" />
          ) : (
            <Search size={15} />
          )}
        </button>
        {showDropdown && (
          <div
            ref={optionList}
            id="external-product-options"
            aria-label="Productos encontrados"
            className={`absolute inset-x-0 z-50 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_12px_32px_-8px_rgba(15,60,80,.25)] ${above ? "bottom-full mb-2" : "top-full mt-2"}`}
          >
            <p className="border-b border-slate-100 px-3 py-2 text-[10px] font-medium text-slate-500">
              Seleccioná el producto que coincide con el envase
            </p>
            <div className="max-h-44 overflow-y-auto p-1">
              {groups
                .flatMap((group) => group.rows)
                .map((candidate) => (
                  <button
                    key={`${candidate.source}:${candidate.fingerprint}`}
                    type="button"
                    disabled={disabled || applying}
                    onClick={() => void apply(candidate)}
                    className="flex w-full items-start gap-3 rounded-lg px-3 py-3 text-left hover:bg-teal-50 focus-visible:bg-teal-50 focus-visible:outline-2 focus-visible:outline-teal-600 disabled:opacity-60"
                  >
                    <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-teal-50 text-teal-700">
                      {candidate.image ? (
                        <img
                          src={candidate.image.data_url}
                          alt=""
                          className="size-9 rounded-lg bg-white object-contain"
                        />
                      ) : (
                        <Package size={18} />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <strong className="block text-xs font-semibold leading-5 text-slate-800">
                        {candidate.name}
                      </strong>
                      {candidate.category_path?.length ? (
                        <span className="block text-[10px] leading-4 text-slate-500">
                          {candidate.category_path.join(" › ")}
                        </span>
                      ) : null}
                      <span className="block text-[11px] leading-4 text-slate-500">
                        {[
                          candidate.brand,
                          candidate.presentation,
                          candidate.scope_group,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                      {candidate.type_review_reason && (
                        <span className="mt-1 block text-[11px] text-amber-700">
                          {candidate.type_review_reason}
                        </span>
                      )}
                      {candidate.review_reason && (
                        <span className="mt-1 block text-[11px] text-amber-700">
                          {candidate.source_review_reason ||
                            "La fuente tiene diferencias: revisá la presentación."}
                        </span>
                      )}
                      {candidate.source === "openbeauty" && (
                        <span className="block text-[10px] text-slate-400">
                          Open Beauty Facts contributors · ODbL
                        </span>
                      )}
                    </span>
                    {applying ? (
                      <LoaderCircle
                        size={15}
                        className="mt-1 shrink-0 animate-spin text-teal-600"
                      />
                    ) : (
                      <ArrowUpRight
                        size={15}
                        className="mt-1 shrink-0 text-teal-600"
                      />
                    )}
                  </button>
                ))}
            </div>
          </div>
        )}
      </div>
      <div
        aria-live="polite"
        className="mt-1 min-h-4 text-[11px] leading-4 text-slate-500"
      >
        {trimmed &&
          !canonical &&
          "Código sin EAN válido. Podés continuar con la carga manual."}
        {current?.busy && !count && "Consultando código…"}
        {applyError?.key === key && (
          <span role="alert" className="text-rose-700">
            {applyError.message}
          </span>
        )}
        {applyError?.key === key &&
          medicationMode === "auto" &&
          groups.some((group) =>
            group.rows.some((row) => row.type_review_reason),
          ) &&
          onKindConfirmed && (
            <span className="mt-2 flex flex-wrap gap-2">
              {[true, false].map((value) => (
                <button
                  key={String(value)}
                  type="button"
                  disabled={disabled || applying}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
                  onClick={() => {
                    setApplyError(undefined);
                    onKindConfirmed(value);
                  }}
                >
                  {value ? "Es medicamento" : "No es medicamento"}
                </button>
              ))}
            </span>
          )}
        {current?.applied && (
          <span className="flex items-center gap-1 text-teal-700">
            <Check size={12} />
            Datos completados
          </span>
        )}
        {current?.linked && (
          <span className="text-teal-700">
            Medicamento completado y vinculado. Se guarda al confirmar el
            producto.
          </span>
        )}
        {current &&
          !current.busy &&
          !count &&
          (current.messages?.length
            ? "No pudimos confirmar coincidencias. Podés reintentar o cargarlo manualmente."
            : "Código no encontrado. Completá los datos manualmente o buscá por nombre.")}
      </div>
      {medicines.length > 0 && !current?.linked && !current?.applied && (
        <div className="mt-2 space-y-2">
          {medicines.map((reference, index) => (
            <button
              type="button"
              key={index}
              disabled={disabled}
              onClick={() => {
                onMedication(reference);
                setState((value) => ({ ...value, linked: true }));
              }}
              className="w-full rounded-md border border-teal-100 bg-teal-50/30 p-2 text-left text-xs"
            >
              <strong className="block">{reference.name}</strong>
              <span className="block text-slate-500">
                {reference.presentation} · {reference.laboratory}
              </span>
              <span className="text-teal-700">Usar y vincular</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
