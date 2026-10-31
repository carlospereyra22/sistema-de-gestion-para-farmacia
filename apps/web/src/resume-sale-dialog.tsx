import { useEffect, useRef } from "react";

export function ResumeSaleDialog({
  count,
  onContinue,
  onDiscard,
}: {
  count: number;
  onContinue: () => void;
  onDiscard: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      onCancel={(event) => event.preventDefault()}
      aria-labelledby="resume-sale-title"
      className="m-auto w-[min(440px,calc(100%-2rem))] rounded-2xl border border-slate-200 bg-white p-6 text-slate-800 shadow-xl backdrop:bg-slate-950/35"
    >
      <h2 id="resume-sale-title" className="text-lg font-semibold">
        ¿Querés continuar con la venta?
      </h2>
      <p className="mt-3 text-sm text-slate-500">
        {`Tenés ${count} ${count === 1 ? "producto cargado" : "productos cargados"}. Conservamos las cantidades, descuentos, cliente y cobros preparados.`}
      </p>
      <div className="mt-6 flex flex-wrap justify-end gap-3">
        <button
          type="button"
          className="rounded-lg border border-slate-200 px-4 py-2 text-sm"
          onClick={onDiscard}
        >
          Descartar venta
        </button>
        <button
          type="button"
          autoFocus
          className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white"
          onClick={onContinue}
        >
          Continuar venta
        </button>
      </div>
    </dialog>
  );
}
