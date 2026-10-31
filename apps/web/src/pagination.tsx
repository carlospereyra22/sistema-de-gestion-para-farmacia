import { historyPages } from "./lib/history-pagination";

export function Pagination({
  total,
  currentPage,
  totalPages,
  noun,
  label,
  onChange,
  compact = false,
  pageSize = 10,
  integrated = false,
}: {
  total: number;
  currentPage: number;
  totalPages: number;
  noun: string;
  label: string;
  onChange: (page: number) => void;
  compact?: boolean;
  pageSize?: number;
  integrated?: boolean;
}) {
  return (
    <nav
      aria-label={label}
      className={`pagination-footer flex shrink-0 flex-wrap items-center justify-center gap-2 bg-white ${integrated ? "border-t px-3 py-1.5" : `rounded-xl border ${compact ? "px-3 py-1.5" : "p-4"}`}`}
    >
      <span className="mr-3 text-xs text-slate-500">
        {total} {noun} · {pageSize} por página
      </span>
      <button
        type="button"
        aria-label="Página anterior"
        disabled={currentPage === 1}
        onClick={() => onChange(currentPage - 1)}
        className="size-9 rounded-full border text-teal-800 disabled:opacity-40"
      >
        ‹
      </button>
      {historyPages(currentPage, totalPages).map((item) =>
        typeof item === "string" ? (
          <span key={item} className="text-slate-400">
            …
          </span>
        ) : (
          <button
            key={item}
            type="button"
            aria-label={`Página ${item}`}
            aria-current={item === currentPage ? "page" : undefined}
            onClick={() => onChange(item)}
            className={`size-9 rounded-full border text-sm font-semibold ${item === currentPage ? "bg-teal-700 text-white shadow-md" : "bg-slate-50 text-teal-800"}`}
          >
            {item}
          </button>
        ),
      )}
      <button
        type="button"
        aria-label="Página siguiente"
        disabled={currentPage === totalPages}
        onClick={() => onChange(currentPage + 1)}
        className="size-9 rounded-full border text-teal-800 disabled:opacity-40"
      >
        ›
      </button>
    </nav>
  );
}
