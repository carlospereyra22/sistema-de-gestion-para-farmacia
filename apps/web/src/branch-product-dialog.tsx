import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  changeBranchProduct,
  deleteUnusedCatalogProduct,
  type CatalogProduct,
} from "./lib/api";

export function BranchProductDialog({
  token,
  organizationId,
  branchId,
  branchName,
  product,
  status,
  stock,
  onClose,
  onSaved,
}: {
  token: string;
  organizationId: string;
  branchId: string;
  branchName: string;
  product: CatalogProduct;
  status: "ACTIVE" | "ARCHIVED" | "DELETED" | "PURGE";
  stock: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [reason, setReason] = useState("");
  const [confirmedStock, setConfirmedStock] = useState<number>();
  const confirmed = confirmedStock === stock;
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const [error, setError] = useState("");
  const deleting = status === "DELETED";
  const permanent = status === "PURGE";
  const action = permanent
    ? "Eliminar definitivamente"
    : deleting
      ? "Eliminar de esta sucursal"
      : status === "ARCHIVED"
        ? "Archivar"
        : "Restaurar";
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  const save = async () => {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      if (permanent)
        await deleteUnusedCatalogProduct(token, organizationId, product.id);
      else
        await changeBranchProduct(token, organizationId, branchId, product.id, {
          status,
          expectedStatus:
            product.branchStatus ?? (product.active ? "ACTIVE" : "ARCHIVED"),
          reason: reason.trim(),
          expectedUpdatedAt: product.branchStateUpdatedAt ?? null,
          expectedStock: stock,
          confirmStockWriteOff: confirmed,
        });
      onSaved();
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo guardar.");
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };
  return createPortal(
    <dialog
      ref={dialog}
      aria-labelledby="branch-product-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
      className="m-auto max-h-[90dvh] w-[min(460px,calc(100vw-32px))] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 text-slate-800 shadow-xl backdrop:bg-slate-900/35"
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <h2 id="branch-product-title" className="text-lg font-semibold">
          {action}
        </h2>
        <p className="mt-3 font-medium">{product.name}</p>
        <p className="mt-1 text-sm text-slate-500">
          {permanent
            ? "Se eliminará del catálogo compartido de la organización."
            : `Sólo en ${branchName}. Las demás sucursales no cambian.`}
        </p>
        <p className="mt-3 text-sm">
          {permanent
            ? "Sólo se permite si no tiene ventas, stock ni movimientos históricos en ninguna sucursal. Esta acción no se puede deshacer. Si tiene historial, usá Archivar."
            : deleting
              ? "Desaparecerá del catálogo de esta sucursal. Se conservan las ventas, comprobantes y movimientos históricos."
              : status === "ARCHIVED"
                ? "Dejará de ofrecerse en ventas. Conserva el stock y podrás restaurarlo desde Archivados."
                : "Volverá a estar disponible en esta sucursal. No repone stock dado de baja."}
        </p>
        {deleting && (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
            <p>
              Stock a dar de baja: <strong>{stock} unidades</strong>, incluidos
              los lotes vencidos. La baja quedará registrada con tu usuario y
              motivo.
            </p>
            {stock > 0 && (
              <label className="mt-3 flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(event) =>
                    setConfirmedStock(event.target.checked ? stock : undefined)
                  }
                  disabled={busy}
                />
                Confirmo la baja de estas existencias.
              </label>
            )}
          </div>
        )}
        {!permanent && (
          <label className="mt-4 block text-sm">
            Motivo
            <input
              autoFocus
              required
              minLength={3}
              maxLength={300}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              disabled={busy}
              className="mt-1 w-full rounded-lg border p-2"
            />
          </label>
        )}
        {error && (
          <p role="alert" className="mt-3 text-sm text-rose-700">
            {error}
          </p>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-lg border px-4 py-2"
          >
            Cancelar
          </button>
          <button
            disabled={
              busy ||
              (!permanent && reason.trim().length < 3) ||
              (deleting && stock > 0 && !confirmed)
            }
            className={`rounded-lg px-4 py-2 text-white disabled:opacity-50 ${deleting || permanent ? "bg-rose-700" : "bg-teal-700"}`}
          >
            {busy ? "Guardando…" : action}
          </button>
        </div>
      </form>
    </dialog>,
    document.body,
  );
}
