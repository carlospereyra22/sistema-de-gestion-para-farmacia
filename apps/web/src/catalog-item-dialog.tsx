import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Pencil, Trash2, X } from "lucide-react";

export function CatalogItemDialog({
  name,
  mode,
  onSave,
  onClose,
  deleteDescription,
  children,
  editTitle = "Editar nombre",
}: {
  name: string;
  mode: "edit" | "delete";
  onSave: (name?: string) => Promise<void>;
  onClose: () => void;
  deleteDescription?: string;
  children?: ReactNode;
  editTitle?: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const lock = useRef(false);
  const [value, setValue] = useState(name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const id = useId();
  const deleting = mode === "delete";
  useEffect(() => {
    const element = dialog.current;
    const previous = document.activeElement;
    element?.showModal();
    return () => {
      element?.close();
      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus();
    };
  }, []);
  async function submit() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await onSave(deleting ? undefined : value.trim());
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No se pudo guardar el cambio.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      aria-labelledby={`${id}-title`}
      onCancel={(event) => {
        event.preventDefault();
        if (!lock.current) onClose();
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-slate-900 shadow-2xl backdrop:bg-slate-950/40 backdrop:backdrop-blur-sm"
    >
      <div className="flex items-center justify-between">
        <span
          className={`rounded-xl p-3 ${deleting ? "bg-rose-50 text-rose-600" : "bg-teal-50 text-teal-700"}`}
        >
          {deleting ? (
            <Trash2 size={23} aria-hidden="true" />
          ) : (
            <Pencil size={23} aria-hidden="true" />
          )}
        </span>
        <button
          type="button"
          disabled={busy}
          aria-label="Cerrar"
          onClick={onClose}
          className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
        >
          <X size={18} />
        </button>
      </div>
      <h2 id={`${id}-title`} className="mt-4 text-xl font-semibold">
        {deleting ? "Eliminar del catálogo" : editTitle}
      </h2>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        {deleting ? (
          <p className="mt-3 break-words text-sm leading-6 text-slate-600">
            {deleteDescription ??
              `¿Querés eliminar “${name}”? Dejará de aparecer en las opciones. Si tiene productos asociados, te avisaremos antes de realizar cambios.`}
          </p>
        ) : (
          <label className="mt-4 block text-sm text-slate-600">
            Nombre
            <input
              value={value}
              onChange={(event) => setValue(event.target.value)}
              required
              minLength={2}
              maxLength={120}
              disabled={busy}
              className="mt-2 h-11 w-full rounded-lg border border-slate-300 px-3 text-slate-900"
            />
          </label>
        )}
        {!deleting && children}
        {error && (
          <p
            role="alert"
            className="mt-4 rounded-xl border border-amber-100 bg-amber-50 p-3 text-sm leading-5 text-amber-900"
          >
            {error}
          </p>
        )}
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm"
          >
            Cancelar
          </button>
          <button
            disabled={busy || (!deleting && value.trim().length < 2)}
            className={`rounded-lg px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50 ${deleting ? "bg-rose-600 hover:bg-rose-700" : "bg-[#31826a] hover:bg-[#276c58]"}`}
          >
            {busy ? "Guardando…" : deleting ? "Eliminar" : "Guardar cambios"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
