import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ImagePlus, ImageOff, X } from "lucide-react";
import { getProductImage } from "./lib/api";
import { prepareProductImage } from "./lib/prepare-product-image";
import { isOutsideDialog } from "./lib/dialog-bounds";
import { productImageCache, productImageKey } from "./lib/product-image-cache";
import { useContext } from "react";
import { ImageCacheContext } from "./lib/image-cache-context";

type ImageProps = {
  token: string;
  organizationId: string;
  productId?: string;
  version?: string;
  name: string;
};

function useProductImage(
  { token, organizationId, productId, version }: ImageProps,
  enabled = true,
) {
  const [loaded, setLoaded] = useState<{ key: string; url: string }>();
  const sessionCache = useContext(ImageCacheContext);
  const cache = sessionCache ?? productImageCache;
  const key = productImageKey(
    token,
    organizationId,
    productId,
    version,
    Boolean(sessionCache),
  );
  useEffect(() => {
    if (!enabled || !productId || !version) return;
    let active = true;
    void cache
      .load(key, async () => {
        const url = await getProductImage(token, organizationId, productId);
        const decoded = new Image();
        decoded.src = url;
        await decoded.decode();
        return url;
      })
      .then((url) => {
        if (active) setLoaded({ key, url });
      })
      .catch(() => {
        /* Keep a neutral placeholder if unavailable. */
      });
    return () => {
      active = false;
    };
  }, [enabled, productId, version, token, organizationId, key, cache]);
  return productId && version
    ? (cache.peek(key) ?? (loaded?.key === key ? loaded.url : undefined))
    : undefined;
}

export function ImagePreview({
  src,
  name,
  onClose,
  children,
  busy = false,
  emptyMessage = "Este producto no tiene foto",
}: {
  src?: string | null;
  name: string;
  onClose: () => void;
  children?: ReactNode;
  busy?: boolean;
  emptyMessage?: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const previewImage = useRef<HTMLImageElement>(null);
  const pressedOutside = useRef(false);
  useLayoutEffect(() => {
    const element = dialog.current;
    let cancelled = false;
    const show = () => {
      if (!cancelled && element?.isConnected && !element.open)
        element.showModal();
    };
    // Decode the actual enlarged image before revealing the dialog, not only
    // a separate preloaded image. Keep an already open dialog mounted.
    const picture = previewImage.current;
    if (picture) void picture.decode().then(show, show);
    else show();
    return () => {
      cancelled = true;
    };
  }, [src]);
  useLayoutEffect(() => {
    const element = dialog.current;
    return () => {
      if (element?.open) element.close();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      aria-label={`Foto de ${name}`}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
      onPointerDown={(event) => {
        pressedOutside.current = isOutsideDialog(
          event,
          event.currentTarget.getBoundingClientRect(),
        );
      }}
      onPointerCancel={() => {
        pressedOutside.current = false;
      }}
      onClick={(event) => {
        if (
          !busy &&
          pressedOutside.current &&
          isOutsideDialog(event, event.currentTarget.getBoundingClientRect())
        )
          onClose();
        pressedOutside.current = false;
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 shadow-2xl outline-none backdrop:bg-slate-950/40 backdrop:backdrop-blur-sm"
    >
      <div className="grid grid-cols-[2.25rem_minmax(0,1fr)_2.25rem] items-center gap-2 border-b border-emerald-100 bg-gradient-to-r from-emerald-50 to-white px-4 py-4">
        <span aria-hidden="true" />
        <h2 className="break-words text-center text-lg font-semibold text-slate-900">
          {name}
        </h2>
        <button
          type="button"
          disabled={busy}
          onClick={onClose}
          aria-label="Cerrar foto"
          className="grid size-9 place-items-center rounded-full text-slate-500 hover:bg-white hover:text-teal-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
        >
          <X size={18} />
        </button>
      </div>
      <div
        className={`grid w-full shrink-0 place-items-center overflow-hidden ${children ? "h-[min(45dvh,420px)]" : "h-[min(70dvh,560px)]"}`}
      >
        {src ? (
          <img
            ref={previewImage}
            src={src}
            alt={name}
            decoding="sync"
            className="h-full min-h-0 w-full object-contain p-5 sm:p-7"
          />
        ) : (
          <div className="grid h-full w-full place-content-center justify-items-center gap-3 bg-slate-50 text-slate-400">
            <ImagePlus size={48} />
            <p className="text-sm">{emptyMessage}</p>
          </div>
        )}
      </div>
      {children}
    </dialog>
  );
}

export function ProductThumbnail(
  props: ImageProps & { preview?: boolean; large?: boolean },
) {
  // `large` sólo agranda la miniatura ampliable (80 px), p. ej. el detalle de Ventas.
  const box = props.large ? "size-20" : "size-12";
  const container = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [open, setOpen] = useState(false);
  const src = useProductImage(props, visible);
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "100px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return (
    <div
      ref={container}
      className={props.preview === false ? "size-9 shrink-0" : box}
    >
      {src && props.preview === false ? (
        <span className="block size-9 overflow-hidden rounded-lg border border-slate-200 bg-white p-0.5">
          <img
            src={src}
            alt={props.name}
            className="h-full w-full object-contain"
          />
        </span>
      ) : src ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={`Ampliar foto de ${props.name}`}
          className={`${box} overflow-hidden rounded-xl border border-slate-200 bg-white p-1 hover:border-teal-400`}
        >
          <img
            src={src}
            alt={props.name}
            className="h-full w-full object-contain"
          />
        </button>
      ) : (
        <span
          title={props.version ? "Foto no disponible" : "Sin foto"}
          className={`grid place-items-center border border-slate-100 bg-slate-50 text-slate-300 ${props.preview === false ? "size-9 rounded-lg" : `${box} rounded-xl`}`}
        >
          <ImageOff size={props.large ? 28 : 20} aria-hidden="true" />
        </span>
      )}
      {open && src && (
        <ImagePreview
          src={src}
          name={props.name}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}

export function ProductImageEditor({
  value,
  onChange,
  onBusy,
  onSave,
  ...props
}: ImageProps & {
  value: string | null | undefined;
  onChange: (value: string | null | undefined) => void;
  onBusy: (busy: boolean) => void;
  onSave?: (value: string | null) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const element = trigger.current;
    if (!element) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "100px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const existing = useProductImage(props, visible || open);
  const src = value === undefined ? existing : value;
  return (
    <>
      <button
        ref={trigger}
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Gestionar foto de ${props.name}`}
        title="Ver y gestionar foto"
        className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50 p-1 text-teal-600 hover:border-teal-400 focus-visible:outline-teal-600"
      >
        {src ? (
          <img
            src={src}
            alt={props.name}
            className="h-full w-full object-contain"
          />
        ) : (
          <ImagePlus size={22} aria-hidden="true" />
        )}
      </button>
      {open && (
        <ProductImageDialog
          name={props.name}
          existing={existing}
          initialValue={value}
          hasExisting={Boolean(props.version)}
          immediate={Boolean(onSave)}
          onBusy={onBusy}
          onClose={() => setOpen(false)}
          onCommit={async (next) => {
            if (onSave && next !== undefined) await onSave(next);
            else onChange(next);
          }}
        />
      )}
    </>
  );
}

export function ProductFormImage({
  value,
  onChange,
  onBusy,
  disabled,
  ...props
}: ImageProps & {
  value: string | null | undefined;
  onChange: (value: string | null | undefined) => void;
  onBusy: (busy: boolean) => void;
  disabled: boolean;
}) {
  const existing = useProductImage(props);
  const src = value === undefined ? existing : value;
  const input = useRef<HTMLInputElement>(null);
  const processing = useRef(false);
  const [error, setError] = useState("");
  async function select(file: File) {
    if (processing.current || disabled) return;
    processing.current = true;
    onBusy(true);
    setError("");
    try {
      onChange(await prepareProductImage(file));
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "No se pudo abrir la foto.",
      );
    } finally {
      processing.current = false;
      onBusy(false);
    }
  }
  return (
    <div className="mt-4 rounded-lg border border-slate-100 bg-slate-50/60 p-3">
      <div className="flex items-center gap-4">
        <div className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-xl border border-slate-200 bg-white p-1 text-slate-400">
          {src ? (
            <img
              src={src}
              alt="Foto del producto"
              className="h-full w-full object-contain"
            />
          ) : (
            <ImagePlus size={24} aria-hidden />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-slate-600">
            Foto del producto{" "}
            <span className="font-normal text-slate-400">· Opcional</span>
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-2">
            <button
              type="button"
              disabled={disabled}
              onClick={() => input.current?.click()}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-teal-700 hover:border-teal-300 disabled:opacity-50"
            >
              {processing.current
                ? "Preparando foto…"
                : src || (props.version && value !== null)
                  ? "Cambiar foto"
                  : "Subir foto"}
            </button>
            {(src || (props.version && value !== null)) && (
              <button
                type="button"
                disabled={disabled}
                onClick={() => {
                  onChange(null);
                  setError("");
                }}
                className="text-xs text-slate-500 hover:text-rose-600 disabled:opacity-50"
              >
                Quitar
              </button>
            )}
            <span className="text-[11px] text-slate-400">
              JPG, PNG o WebP · hasta 10 MB
            </span>
          </div>
        </div>
      </div>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        aria-label="Seleccionar foto del producto"
        className="hidden"
        disabled={disabled}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void select(file);
        }}
      />
      {error && (
        <p role="alert" className="mt-2 text-xs text-rose-700">
          {error}
        </p>
      )}
    </div>
  );
}

export function ProductImageDialog({
  name,
  existing,
  initialValue,
  hasExisting,
  immediate,
  onBusy,
  onClose,
  onCommit,
  laboratory = false,
}: {
  name: string;
  existing?: string;
  initialValue?: string | null;
  hasExisting: boolean;
  immediate: boolean;
  onBusy: (busy: boolean) => void;
  onClose: () => void;
  onCommit: (value: string | null | undefined) => Promise<void>;
  laboratory?: boolean;
}) {
  const [draft, setDraft] = useState(initialValue);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const src = draft === undefined ? existing : draft;
  const hasPhoto = Boolean(src || (hasExisting && draft !== null));
  async function select(file: File) {
    setBusy(true);
    onBusy(true);
    setError("");
    try {
      setDraft(await prepareProductImage(file));
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "No se pudo abrir la foto.",
      );
    } finally {
      setBusy(false);
      onBusy(false);
    }
  }
  async function commit() {
    setBusy(true);
    onBusy(true);
    setError("");
    try {
      await onCommit(draft);
      onClose();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "No se pudo guardar la foto.",
      );
    } finally {
      setBusy(false);
      onBusy(false);
    }
  }
  return (
    <ImagePreview
      src={src}
      name={name}
      onClose={onClose}
      busy={busy}
      emptyMessage={laboratory ? "Este laboratorio no tiene logo" : undefined}
    >
      <div className="space-y-4 border-t border-slate-100 p-5">
        <div className="flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => fileInput.current?.click()}
            className="rounded-lg border border-teal-200 bg-teal-50 px-4 py-2 text-sm font-medium text-teal-700 disabled:opacity-50"
          >
            {hasPhoto ? "Cambiar foto" : "Subir foto"}
          </button>
          {hasPhoto && (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setDraft(null);
                setError("");
              }}
              className="rounded-lg px-4 py-2 text-sm text-rose-600 hover:bg-rose-50 disabled:opacity-50"
            >
              Quitar foto
            </button>
          )}
          {draft !== undefined && (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setDraft(undefined);
                setError("");
              }}
              className="rounded-lg px-3 py-2 text-sm text-slate-500"
            >
              Deshacer
            </button>
          )}
        </div>
        <p className="text-center text-xs text-slate-500">
          JPG, PNG o WebP · hasta 10 MB
        </p>
        <input
          ref={fileInput}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          aria-label={
            laboratory
              ? "Seleccionar logo del laboratorio"
              : "Seleccionar foto del producto"
          }
          disabled={busy}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void select(file);
          }}
        />
        {error && (
          <p
            role="alert"
            className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700"
          >
            {error}
          </p>
        )}
        {!immediate && (
          <p className="text-center text-xs text-slate-500">
            La foto se guardará al guardar el producto.
          </p>
        )}
        <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={busy || draft === initialValue}
            onClick={() => void commit()}
            className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-50"
          >
            {busy ? "Procesando…" : immediate ? "Guardar foto" : "Aplicar"}
          </button>
        </div>
      </div>
    </ImagePreview>
  );
}
