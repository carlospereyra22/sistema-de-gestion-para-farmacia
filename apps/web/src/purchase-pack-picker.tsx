import { useEffect, useState } from "react";
import { X } from "lucide-react";
import type { MedicineReference } from "./lib/api";

// Elige el envase base de un exhibidor. Se hace una vez por código.
export function PurchasePackPicker({
  initialQuery,
  initialFactor,
  search,
  onPick,
  onCancel,
}: {
  initialQuery: string;
  initialFactor: number;
  search: (query: string) => Promise<MedicineReference[]>;
  onPick: (reference: MedicineReference, factor: number) => Promise<void>;
  onCancel: () => void;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [factor, setFactor] = useState(String(initialFactor));
  const [results, setResults] = useState<MedicineReference[]>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    let current = true;
    const text = query.trim();
    const timer = window.setTimeout(() => {
      if (text.length < 2) return setResults([]);
      search(text).then(
        (found) => {
          if (current) setResults(found.filter((item) => item.barcode));
        },
        () => {
          if (current) setError("No se pudo buscar en la base.");
        },
      );
    }, 300);
    return () => {
      current = false;
      window.clearTimeout(timer);
    };
  }, [query, search]);
  const units = Number(factor);
  const valid = Number.isInteger(units) && units >= 2 && units <= 1000;
  return (
    <div className="grid gap-1">
      <p className="text-xs font-medium text-slate-600">
        Elegí el envase que trae adentro
      </p>
      <div className="flex gap-1">
        <input
          autoFocus
          aria-label="Buscar envase base"
          placeholder="Nombre o código"
          className="h-9 min-w-0 flex-1 rounded-lg border border-slate-300 px-2 text-sm"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <input
          aria-label="Unidades por exhibidor"
          inputMode="numeric"
          className="h-9 w-14 rounded-lg border border-slate-300 px-2 text-right text-sm"
          value={factor}
          onChange={(event) => setFactor(event.target.value)}
        />
        <button
          type="button"
          aria-label="Cancelar exhibidor"
          className="px-2 text-slate-500"
          onClick={onCancel}
        >
          <X size={16} />
        </button>
      </div>
      <ul className="max-h-48 overflow-y-auto rounded-lg border border-slate-200">
        {results.map((reference) => (
          <li key={`${reference.barcode}-${reference.presentation}`}>
            <button
              type="button"
              disabled={!valid || saving}
              className="w-full px-2 py-1.5 text-left hover:bg-teal-50 disabled:opacity-50"
              onClick={() => {
                setSaving(true);
                setError("");
                onPick(reference, units).catch((cause: unknown) => {
                  setSaving(false);
                  setError(
                    cause instanceof Error
                      ? cause.message
                      : "No se pudo guardar el exhibidor.",
                  );
                });
              }}
            >
              <span className="block text-sm">{reference.name}</span>
              <span className="block text-xs text-slate-500">
                {reference.presentation} · {reference.laboratory}
              </span>
            </button>
          </li>
        ))}
        {!results.length && (
          <li className="px-2 py-1.5 text-xs text-slate-500">
            Sin resultados. Probá con menos palabras.
          </li>
        )}
      </ul>
      {error && (
        <p role="alert" className="text-xs text-rose-700">
          {error}
        </p>
      )}
    </div>
  );
}
