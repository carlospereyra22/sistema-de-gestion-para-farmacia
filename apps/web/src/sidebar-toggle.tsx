import { PanelLeftClose, PanelLeftOpen } from "lucide-react";

export function SidebarToggle({
  expanded,
  onToggle,
}: {
  expanded: boolean;
  onToggle: () => void;
}) {
  const label = expanded ? "Contraer barra lateral" : "Expandir barra lateral";
  const Icon = expanded ? PanelLeftClose : PanelLeftOpen;
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-expanded={expanded}
      aria-controls="workspace-navigation"
      onClick={onToggle}
      className="grid size-9 shrink-0 place-items-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-teal-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600"
    >
      <Icon size={20} aria-hidden="true" />
    </button>
  );
}
