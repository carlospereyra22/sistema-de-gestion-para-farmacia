import { useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

export function ProductFormSection({
  title,
  children,
  defaultOpen = false,
  status,
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
  status?: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <section className="rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center gap-x-3 px-4">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen(!open)}
          className="flex min-w-0 flex-1 items-center justify-between gap-3 py-3.5 text-left text-sm font-semibold text-slate-700 hover:text-teal-700"
        >
          {title}
          <ChevronDown
            size={16}
            aria-hidden="true"
            className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
          />
        </button>
        {status}
      </div>
      <div
        id={id}
        hidden={!open}
        className="border-t border-slate-100 px-4 pb-4 pt-1"
      >
        {children}
      </div>
    </section>
  );
}
