import { useEffect, useRef, useState, type FormEvent } from "react";
import { ChevronDown, Database, LoaderCircle, Search } from "lucide-react";
import { ProductFilterSelect } from "./product-filter-select";
import {
  searchMedicineReferences,
  searchAlfaBeta,
  type AlfaBetaMatch,
  type MedicineReference,
} from "./lib/api";
import { AlfaBetaMedicineCard } from "./alfabeta-medicine-card";
import { groupMedicines, medicineSources } from "./lib/medicine-search";
import {
  MedicinePresentationHeader,
  MedicinePresentationRow,
} from "./medicine-presentation-row";

export function MedicineSearchResults({
  results,
}: {
  results: MedicineReference[];
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 divide-y divide-slate-200">
      {groupMedicines(results).map((group) => (
        <details key={group.id} className="group bg-white open:bg-slate-50/40">
          <summary className="flex cursor-pointer list-none items-center gap-3 p-4 transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-emerald-700">
            <span className="min-w-0 flex-1">
              <span className="block font-semibold text-slate-900">
                {group.name}
              </span>
              <span className="mt-1 block text-xs text-slate-500">
                {group.laboratory || "Laboratorio no informado"} ·{" "}
                {group.items.length}{" "}
                {group.items.length === 1 ? "presentación" : "presentaciones"}
              </span>
            </span>
            <ChevronDown
              size={18}
              aria-hidden="true"
              className="shrink-0 text-slate-400 transition-transform group-open:rotate-180"
            />
          </summary>
          <div className="border-t border-slate-100 px-4">
            <div className="w-full py-3">
              <MedicinePresentationHeader />
              {group.items.map((item, index) => (
                <MedicinePresentationRow
                  key={index}
                  presentation={item.presentation}
                  priceMinor={item.priceMinor}
                  updatedAt={item.updatedAt}
                >
                  <details className="sm:col-span-2">
                    <summary className="w-fit cursor-pointer text-xs text-slate-500 hover:text-teal-700">
                      Más información
                    </summary>
                    <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                      <dt className="text-slate-500">Principio activo</dt>
                      <dd>{item.activeIngredient || "No informado"}</dd>
                      {item.saleType && (
                        <>
                          <dt className="text-slate-500">Condición de venta</dt>
                          <dd>{item.saleType}</dd>
                        </>
                      )}
                      {item.barcode && (
                        <>
                          <dt className="text-slate-500">Código de barras</dt>
                          <dd className="break-all">{item.barcode}</dd>
                        </>
                      )}
                      {item.troquel && (
                        <>
                          <dt className="text-slate-500">Troquel</dt>
                          <dd>{item.troquel}</dd>
                        </>
                      )}
                      <dt className="text-slate-500">Fuente</dt>
                      <dd>{medicineSources[item.source]}</dd>
                    </dl>
                  </details>
                </MedicinePresentationRow>
              ))}
            </div>
          </div>
        </details>
      ))}
    </div>
  );
}

export function DashboardMedicineSearch({
  token,
  organizationId,
}: {
  token: string;
  organizationId: string;
}) {
  const [query, setQuery] = useState("");
  const [source, setSource] = useState<
    MedicineReference["source"] | "alfabeta"
  >("alfabeta");
  const [results, setResults] = useState<MedicineReference[]>([]);
  const [alfaResults, setAlfaResults] = useState<AlfaBetaMatch[]>([]);
  const [searched, setSearched] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const request = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      request.current?.abort();
    },
    [organizationId],
  );

  function resetResults() {
    request.current?.abort();
    setResults([]);
    setAlfaResults([]);
    setSearched("");
    setError("");
    setLoading(false);
  }

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = query.trim();
    if (text.length < 2) {
      event.preventDefault();
      setError("Ingresá al menos dos caracteres.");
      return;
    }
    event.preventDefault();
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setError("");
    setResults([]);
    setAlfaResults([]);
    setSearched("");
    try {
      if (source === "alfabeta") {
        const found = await searchAlfaBeta(
          token,
          organizationId,
          text,
          controller.signal,
        );
        if (!controller.signal.aborted) {
          setAlfaResults(found);
          setSearched(text);
        }
        return;
      }
      const found = await searchMedicineReferences(
        token,
        organizationId,
        text,
        source,
        controller.signal,
      );
      if (!controller.signal.aborted) {
        setResults(found);
        setSearched(text);
      }
    } catch (cause) {
      if (!controller.signal.aborted)
        setError(
          cause instanceof Error
            ? cause.message
            : "No se pudo consultar la fuente. Intentá nuevamente.",
        );
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }

  return (
    <section aria-labelledby="medicine-search-title" className="cash-card p-0!">
      <div className="p-4">
        <div className="cash-card-heading">
          <span className="cash-icon">
            <Search size={20} aria-hidden="true" />
          </span>
          <div>
            <h2 id="medicine-search-title">Buscador de medicamentos</h2>
            <p className="text-xs text-slate-500">
              Consultá precios, presentaciones y laboratorios.
            </p>
          </div>
        </div>
        <form
          onSubmit={(event) => void search(event)}
          className="mt-3 flex flex-col gap-3 md:flex-row md:items-center"
        >
          <label
            htmlFor="medicine-query"
            className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 shadow-sm focus-within:ring-2 focus-within:ring-teal-500"
          >
            <span className="sr-only">Nombre del medicamento</span>
            <Search
              size={17}
              aria-hidden="true"
              className="shrink-0 text-teal-600"
            />
            <input
              id="medicine-query"
              type="search"
              value={query}
              maxLength={120}
              onChange={(event) => {
                resetResults();
                setQuery(event.target.value);
              }}
              placeholder="Ej.: Actron, ibuprofeno 400…"
              className="h-12 w-full min-w-0 border-0 bg-transparent p-0 !text-sm shadow-none outline-none"
            />
          </label>
          <div className="w-full md:w-60">
            <ProductFilterSelect
              label="Fuente"
              icon={<Database size={18} />}
              value={source}
              options={[
                { value: "alfabeta", label: "AlfaBeta · Principal" },
                ...Object.entries(medicineSources)
                  .filter(([value]) => value !== "alfabeta")
                  .map(([value, label]) => ({ value, label })),
              ]}
              onChange={(value) => {
                resetResults();
                setSource(value as MedicineReference["source"] | "alfabeta");
              }}
            />
          </div>
          <button
            disabled={loading || query.trim().length < 2}
            className="flex h-12! w-full items-center justify-center gap-2 rounded-lg bg-teal-700 px-6 text-sm! font-semibold text-white hover:bg-teal-800 disabled:opacity-50 md:w-auto"
          >
            {loading ? (
              <LoaderCircle
                size={18}
                className="animate-spin"
                aria-hidden="true"
              />
            ) : (
              <Search size={18} aria-hidden="true" />
            )}
            {loading ? "Buscando…" : "Buscar"}
          </button>
        </form>
      </div>
      <div
        className={
          loading || searched || error
            ? "border-t border-[#e8edf2] p-3 sm:p-4"
            : ""
        }
        aria-busy={loading}
      >
        {error && (
          <p
            role="alert"
            className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700"
          >
            {error}
          </p>
        )}
        <p
          role="status"
          className={loading || searched ? "text-sm text-slate-600" : "sr-only"}
        >
          {loading
            ? "Consultando la fuente. Puede demorar unos segundos…"
            : searched
              ? (source === "alfabeta" ? alfaResults.length : results.length)
                ? ""
                : `No se encontraron resultados para “${searched}”. Probá otro nombre o cambiá la fuente.`
              : ""}
        </p>
        {results.length > 0 && <MedicineSearchResults results={results} />}
        {source === "alfabeta" && alfaResults.length > 0 && (
          <div className="overflow-hidden rounded-xl border border-slate-200 divide-y divide-slate-200">
            {alfaResults.map((item, index) => (
              <AlfaBetaMedicineCard
                compact
                prefetch={index < 2}
                key={`${organizationId}:${searched}:${item.id}`}
                item={item}
                token={token}
                organizationId={organizationId}
              />
            ))}
          </div>
        )}
        {alfaResults.length >= 30 && (
          <p className="mt-3 text-xs text-slate-500">
            Se muestran hasta 30 medicamentos. Precisá el nombre para reducir
            los resultados.
          </p>
        )}
        {results.length >= 8 && (
          <p className="mt-3 text-xs text-slate-500">
            Se muestran hasta 8 coincidencias por consulta. Agregá concentración
            o presentación para precisar la búsqueda.
          </p>
        )}
      </div>
    </section>
  );
}
