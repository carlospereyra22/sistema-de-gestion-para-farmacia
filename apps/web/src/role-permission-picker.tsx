import type { ReactElement } from "react";
import { modulesByCode, rolePermissionModules } from "./lib/role-permissions";

export function RolePermissionPicker({
  value,
  onChange,
}: {
  value: readonly string[];
  onChange: (code: string, enabled: boolean) => void;
}): ReactElement {
  return (
    <div className="mt-4 space-y-2">
      {rolePermissionModules.map((module) => {
        const selected = module.permissions.filter(({ code }) =>
          value.includes(code),
        ).length;
        const Icon = module.icon;
        return (
          <details
            key={module.title}
            className="group rounded-xl border border-slate-200 bg-white open:border-slate-300 open:shadow-sm"
          >
            <summary className="flex cursor-pointer list-none items-center gap-3 px-3 py-3 marker:hidden [&::-webkit-details-marker]:hidden">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-teal-700">
                <Icon size={18} />
              </span>
              <span className="min-w-0 flex-1 text-sm font-medium text-slate-800">
                {module.title}
              </span>
              {module.permissions.length > 0 && (
                <span className="text-xs tabular-nums text-slate-500">
                  {selected}/{module.permissions.length}
                </span>
              )}
              <span
                aria-hidden="true"
                className="text-slate-400 group-open:rotate-180"
              >
                ⌄
              </span>
            </summary>
            <div className="space-y-2 border-t border-slate-100 px-3 py-3">
              {module.description && (
                <p className="text-xs leading-5 text-slate-600">
                  {module.description}
                </p>
              )}
              {module.permissions.map(({ code, label }) => {
                const shared = (modulesByCode.get(code) ?? []).filter(
                  (title) => title !== module.title,
                );
                return (
                  <label
                    key={code}
                    className="flex cursor-pointer items-start gap-2.5 rounded-lg px-2 py-1.5 hover:bg-slate-50"
                  >
                    <input
                      type="checkbox"
                      className="mt-0.5 accent-teal-700"
                      checked={value.includes(code)}
                      onChange={(event) => onChange(code, event.target.checked)}
                    />
                    <span className="min-w-0 text-xs text-slate-700">
                      <span className="block font-medium">{label}</span>
                      {shared.length > 0 && (
                        <span className="mt-0.5 block leading-4 text-slate-500">
                          También habilita: {shared.join(", ")}.
                        </span>
                      )}
                    </span>
                  </label>
                );
              })}
            </div>
          </details>
        );
      })}
    </div>
  );
}
