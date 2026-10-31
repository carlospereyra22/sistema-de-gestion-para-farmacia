import { useId, useState, type ReactNode } from "react";

export function DashboardChartDetail({
  title,
  rows,
  color,
  children,
}: {
  title: string;
  rows: { label: string; value: string }[];
  color: string;
  children: ReactNode;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  return (
    <div
      className="relative shrink-0"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          setOpen(false);
          event.stopPropagation();
        }
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <button
        type="button"
        aria-label={title}
        aria-expanded={open}
        aria-controls={id}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        className="block rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-4"
      >
        {children}
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 w-[260px] max-w-[calc(100vw-48px)] pt-2">
          <div
            id={id}
            role="region"
            aria-label={title}
            className="rounded-xl border border-slate-200 bg-white p-4 shadow-[0_12px_36px_-8px_rgba(15,23,42,0.25)]"
          >
            <p className="text-xs font-semibold text-slate-900">{title}</p>
            <dl className="mt-3 space-y-2 border-t border-slate-100 pt-3">
              {rows.map((row) => (
                <div
                  key={row.label}
                  className="flex items-start justify-between gap-3 text-xs"
                >
                  <dt className="flex min-w-0 items-start gap-2 text-slate-600">
                    <span
                      className="mt-1 size-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: color }}
                    />
                    {row.label}
                  </dt>
                  <dd className="shrink-0 font-semibold tabular-nums text-slate-900">
                    {row.value}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      )}
    </div>
  );
}
