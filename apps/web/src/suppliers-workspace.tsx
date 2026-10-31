import { useEffect, useRef, useState } from "react";
import {
  Truck,
  Search,
  Plus,
  Phone,
  Mail,
  Check,
  Minus,
  Eye,
  Pencil,
  Download,
  Trash2,
  RotateCcw,
  Archive,
} from "lucide-react";
import {
  createParty,
  getParties,
  updateSupplierTerms,
  setSupplierActive,
  type Party,
  type SupplierProfileInput,
} from "./lib/api";
import { Pagination } from "./pagination";
import { StatusToast } from "./status-toast";
import { SupplierDetail } from "./supplier-detail";
import { OperationConfirmDialog } from "./operation-confirm-dialog";
import { SupplierTermsFields } from "./supplier-terms";
import {
  PayableDialog,
  field,
  primary,
  secondary,
} from "./supplier-payables/dialog";

const action =
  "inline-flex h-8 items-center justify-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-slate-500 transition hover:bg-slate-100 hover:text-teal-700 focus-visible:outline-2 focus-visible:outline-teal-500";
function AccountBadge({ enabled }: { enabled?: boolean }) {
  const Icon = enabled ? Check : Minus;
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-1 text-[11px] font-medium ${enabled ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}
    >
      <Icon size={13} />
      {enabled ? "Con cuenta corriente" : "Sin cuenta corriente"}
    </span>
  );
}
export function SuppliersWorkspace({
  token,
  organizationId,
  visible = true,
}: {
  token: string;
  organizationId: string;
  visible?: boolean;
}) {
  const [items, setItems] = useState<Party[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [notice, setNotice] = useState<{ message: string; id: number }>();
  const noticeSequence = useRef(0);
  const loaded = useRef(false);
  const requestSequence = useRef(0);
  const [showArchived, setShowArchived] = useState(false);
  const [lifecycle, setLifecycle] = useState<Party>();
  const [selectedId, setSelectedId] = useState<string>();
  const [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all"),
    [page, setPage] = useState(1),
    [pageSize, setPageSize] = useState(10);
  const [editor, setEditor] = useState<{
    supplier?: Party;
    readOnly: boolean;
  }>();
  const load = async () => {
    const request = ++requestSequence.current;
    if (!loaded.current) setLoading(true);
    setError("");
    try {
      const result = await getParties(token, organizationId, "suppliers");
      if (request !== requestSequence.current) return;
      setItems(result);
      loaded.current = true;
    } catch (e) {
      if (request !== requestSequence.current) return;
      setError(
        e instanceof Error
          ? e.message
          : "No se pudieron cargar los proveedores.",
      );
    } finally {
      if (request === requestSequence.current) setLoading(false);
    }
  };
  useEffect(() => {
    const sequence = requestSequence;
    if (visible) void load();
    return () => {
      sequence.current++;
    };
  }, [token, organizationId, visible]); // eslint-disable-line react-hooks/exhaustive-deps
  const active = items.filter((s) => (showArchived ? !s.active : s.active));
  const normalize = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  const filtered = active.filter(
    (s) =>
      (filter === "all" ||
        Boolean(s.accountEnabled) === (filter === "account")) &&
      normalize(
        [s.name, s.phone, s.email, s.contactName, s.taxId].join(" "),
      ).includes(normalize(query.trim())),
  );
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize)),
    current = Math.min(page, pages);
  const selected = filtered.find((s) => s.id === selectedId && s.active);
  const exportCsv = () => {
    const cell = (value: string) =>
      `"${(/^[=+@\-\t\r]/.test(value) ? "'" + value : value).replace(/"/g, '""')}"`;
    const rows = [
      [
        "Proveedor",
        "Teléfono",
        "Correo",
        "Contacto",
        "Dirección",
        "Cuenta corriente",
        "Plazo (días)",
        "Observaciones",
      ],
      ...filtered.map((s) => [
        s.name,
        s.phone ?? "",
        s.email ?? "",
        s.contactName ?? "",
        s.address ?? "",
        s.accountEnabled ? "Sí" : "No",
        s.accountEnabled ? String(s.accountTermDays ?? "") : "",
        s.notes ?? "",
      ]),
    ];
    const url = URL.createObjectURL(
      new Blob(
        ["\uFEFF" + rows.map((r) => r.map(cell).join(";")).join("\r\n")],
        { type: "text/csv;charset=utf-8" },
      ),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "proveedores.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  if (!visible) return null;
  return (
    <div className="flex min-h-[calc(100dvh-130px)] flex-col gap-5">
      {lifecycle && (
        <OperationConfirmDialog
          title={
            lifecycle.active ? "Eliminar proveedor" : "Restaurar proveedor"
          }
          description={
            lifecycle.active
              ? `¿Eliminar a ${lifecycle.name} del listado activo? Se conservan compras, recepciones, deudas y pagos. Las obligaciones pendientes no se cancelan. Podés restaurarlo desde Eliminados.`
              : `¿Volver a habilitar a ${lifecycle.name}?`
          }
          onClose={() => setLifecycle(undefined)}
          onConfirm={async () => {
            await setSupplierActive(
              token,
              organizationId,
              lifecycle.id,
              !lifecycle.active,
            );
            setSelectedId(undefined);
            setNotice({
              id: ++noticeSequence.current,
              message: lifecycle.active
                ? "Proveedor eliminado del listado activo."
                : "Proveedor restaurado.",
            });
            await load();
          }}
        />
      )}
      {error && (
        <p
          role="alert"
          className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700"
        >
          {error}
          <button className="ml-3 underline" onClick={() => void load()}>
            Reintentar
          </button>
        </p>
      )}
      {notice && (
        <StatusToast
          key={notice.id}
          message={notice.message}
          onClose={() => setNotice(undefined)}
        />
      )}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <label className="relative min-w-[220px] flex-1">
          <Search size={16} className="absolute left-3 top-3 text-slate-400" />
          <input
            aria-label="Buscar proveedor"
            className={`${field} pl-9`}
            placeholder="Buscar por nombre, contacto o correo…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
              setSelectedId(undefined);
            }}
          />
        </label>
        <div
          className="flex flex-wrap gap-1 rounded-lg bg-slate-50 p-1"
          aria-label="Filtrar por cuenta corriente"
        >
          {[
            ["all", `Todos (${active.length})`],
            ["account", "Con cuenta corriente"],
            ["cash", "Sin cuenta corriente"],
          ].map(([value, label]) => (
            <button
              key={value}
              aria-pressed={filter === value}
              className={`h-8 rounded-md px-3 text-xs font-medium transition ${filter === value ? "bg-teal-700 text-white shadow-sm" : "text-slate-500 hover:bg-white"}`}
              onClick={() => {
                setFilter(value!);
                setPage(1);
                setSelectedId(undefined);
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          className={secondary}
          disabled={!filtered.length}
          onClick={exportCsv}
        >
          <Download size={15} />
          Exportar
        </button>
        <button
          className={primary}
          onClick={() => setEditor({ readOnly: false })}
        >
          <Plus size={17} />
          Nuevo proveedor
        </button>
      </div>
      <div
        className={`grid flex-1 items-stretch gap-4 ${selected ? "xl:grid-cols-[minmax(0,1fr)_300px]" : "grid-cols-1"}`}
      >
        <section className="flex min-h-[420px] min-w-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex min-h-11 items-center justify-between gap-3 border-b border-slate-100 px-4">
            <span className="text-xs font-medium text-slate-500">
              {showArchived ? "Proveedores eliminados" : "Proveedores activos"}
            </span>
            <button
              type="button"
              aria-pressed={showArchived}
              className={`inline-flex h-8 items-center gap-2 rounded-md px-2 text-xs transition-colors focus-visible:outline-2 focus-visible:outline-teal-500 ${showArchived ? "bg-slate-100 font-medium text-slate-800" : "text-slate-500 hover:bg-slate-50 hover:text-slate-700"}`}
              onClick={() => {
                setShowArchived(!showArchived);
                setPage(1);
                setSelectedId(undefined);
              }}
            >
              <Archive size={14} /> Eliminados
              <span className="tabular-nums text-slate-400">
                {items.filter((s) => !s.active).length}
              </span>
            </button>
          </div>
          <div className="flex-1 overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-slate-50/80 text-[11px] text-slate-500">
                <tr>
                  {[
                    "Proveedor",
                    "Contacto",
                    "Cuenta corriente",
                    "Plazo habitual",
                    "Observaciones",
                    "Acciones",
                  ].map((h) => (
                    <th
                      key={h}
                      className={`px-4 py-3 font-medium ${h === "Acciones" ? "text-center" : ""}`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered
                  .slice((current - 1) * pageSize, current * pageSize)
                  .map((s) => (
                    <tr
                      key={s.id}
                      onClick={() => setSelectedId(s.id)}
                      className={`cursor-pointer transition-colors ${selectedId === s.id ? "bg-teal-50/60 shadow-[inset_3px_0_0_#0d9488]" : "hover:bg-slate-50/60"}`}
                    >
                      <td className="max-w-64 px-4 py-3">
                        <button
                          className="text-left font-medium text-slate-800"
                          aria-expanded={selectedId === s.id}
                          aria-controls="supplier-detail"
                          onClick={() => setSelectedId(s.id)}
                        >
                          {s.name}
                        </button>
                        {s.taxId && (
                          <p className="mt-1 text-xs text-slate-400">
                            {s.taxId}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">
                        {s.phone && (
                          <p className="flex items-center gap-2">
                            <Phone size={13} />
                            {s.phone}
                          </p>
                        )}
                        {s.email && (
                          <p className="mt-1 flex items-center gap-2">
                            <Mail size={13} />
                            {s.email}
                          </p>
                        )}
                        {!s.phone && !s.email && (s.contactName || "—")}
                      </td>
                      <td className="px-4 py-3">
                        <AccountBadge enabled={s.accountEnabled} />
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">
                        {s.accountEnabled
                          ? s.accountTermDays == null
                            ? "Sin plazo definido"
                            : `${s.accountTermDays} días`
                          : "—"}
                      </td>
                      <td className="max-w-64 px-4 py-3 text-xs text-slate-500">
                        <p
                          className="line-clamp-2"
                          title={s.notes ?? undefined}
                        >
                          {s.notes || "—"}
                        </p>
                      </td>
                      <td
                        className="px-4 py-3"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center justify-center gap-1">
                          <button
                            className={action}
                            onClick={() =>
                              s.active
                                ? setSelectedId(s.id)
                                : setEditor({ supplier: s, readOnly: true })
                            }
                          >
                            <Eye size={15} />
                            Ver
                          </button>
                          <button
                            aria-label={`Editar ${s.name}`}
                            disabled={!s.active}
                            title="Editar proveedor"
                            className={action}
                            onClick={() =>
                              setEditor({ supplier: s, readOnly: false })
                            }
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            className={`${action} hover:text-rose-700`}
                            title={
                              s.active
                                ? "Eliminar proveedor"
                                : "Restaurar proveedor"
                            }
                            aria-label={`${s.active ? "Eliminar" : "Restaurar"} ${s.name}`}
                            onClick={() => setLifecycle(s)}
                          >
                            {s.active ? (
                              <Trash2 size={15} />
                            ) : (
                              <RotateCcw size={15} />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
            {loading ? (
              <div
                role="status"
                aria-label="Cargando proveedores"
                className="space-y-5 p-4"
              >
                {[0, 1, 2].map((row) => (
                  <div
                    key={row}
                    className="flex h-10 items-center gap-12"
                    aria-hidden="true"
                  >
                    <div className="h-3 w-1/4 rounded bg-slate-100" />
                    <div className="h-3 w-1/3 rounded bg-slate-50" />
                  </div>
                ))}
              </div>
            ) : (
              !filtered.length && (
                <div className="p-12 text-center">
                  <Truck className="mx-auto mb-3 text-teal-300" size={30} />
                  <p className="text-sm text-slate-600">
                    {active.length
                      ? "No hay proveedores que coincidan con la búsqueda."
                      : "Todavía no hay proveedores cargados."}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    {active.length
                      ? "Probá otro nombre o cambiá el filtro."
                      : "Creá el primero desde Nuevo proveedor."}
                  </p>
                </div>
              )
            )}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-4 py-2">
            <label className="flex items-center gap-2 text-xs text-slate-500">
              Mostrar
              <select
                className="rounded-lg border border-slate-200 bg-white px-2 py-2"
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                  setSelectedId(undefined);
                }}
              >
                {[10, 25, 50].map((n) => (
                  <option key={n} value={n}>
                    {n} por página
                  </option>
                ))}
              </select>
            </label>
            <Pagination
              total={filtered.length}
              currentPage={current}
              totalPages={pages}
              pageSize={pageSize}
              noun="proveedores"
              label="Páginas de proveedores"
              onChange={(value) => {
                setPage(value);
                setSelectedId(undefined);
              }}
              compact
            />
          </div>
        </section>
        {selected && selected.active && (
          <SupplierDetail
            supplier={selected}
            onClose={() => setSelectedId(undefined)}
            onEdit={() => setEditor({ supplier: selected, readOnly: false })}
          />
        )}
      </div>
      {editor && (
        <SupplierEditor
          key={editor.supplier?.id ?? "new"}
          {...editor}
          token={token}
          organizationId={organizationId}
          onClose={() => setEditor(undefined)}
          onSaved={() => {
            setEditor(undefined);
            setNotice({
              message: "Proveedor guardado.",
              id: ++noticeSequence.current,
            });
            void load();
          }}
        />
      )}
    </div>
  );
}

function SupplierEditor({
  supplier,
  readOnly,
  token,
  organizationId,
  onClose,
  onSaved,
}: {
  supplier?: Party;
  readOnly: boolean;
  token: string;
  organizationId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [viewing, setViewing] = useState(readOnly),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const gate = useRef(false);
  const [value, setValue] = useState<SupplierProfileInput>({
    name: supplier?.name ?? "",
    phone: supplier?.phone ?? "",
    email: supplier?.email ?? "",
    contactName: supplier?.contactName ?? "",
    address: supplier?.address ?? "",
    notes: supplier?.notes ?? "",
    accountEnabled: supplier?.accountEnabled ?? false,
    accountTermDays: supplier?.accountTermDays ?? null,
  });
  const save = async () => {
    if (gate.current) return;
    gate.current = true;
    setBusy(true);
    setError("");
    try {
      if (supplier)
        await updateSupplierTerms(token, organizationId, supplier, value);
      else
        await createParty(
          token,
          organizationId,
          "suppliers",
          value.name!,
          "",
          undefined,
          undefined,
          value,
        );
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      gate.current = false;
      setBusy(false);
    }
  };
  const fields = [
    ["name", "Nombre / razón social", 160],
    ["contactName", "Persona de contacto", 160],
    ["phone", "Teléfono", 60],
    ["email", "Correo electrónico", 160],
    ["address", "Dirección", 250],
  ] as const;
  return (
    <PayableDialog
      title={
        viewing
          ? "Ficha del proveedor"
          : supplier
            ? "Editar proveedor"
            : "Nuevo proveedor"
      }
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      {viewing ? (
        <>
          <h3 className="mb-4 text-xl font-semibold text-slate-800">
            {supplier?.name}
          </h3>
          <dl className="grid gap-4 sm:grid-cols-2">
            {fields
              .filter(([key]) => key !== "name")
              .map(([key, label]) => (
                <div key={key}>
                  <dt className="text-xs text-slate-400">{label}</dt>
                  <dd className="mt-1 break-words text-sm">
                    {value[key] || "Sin informar"}
                  </dd>
                </div>
              ))}
          </dl>
          <div className="my-5 flex items-center gap-3">
            <AccountBadge enabled={value.accountEnabled} />
            <span className="text-xs text-slate-500">
              {value.accountEnabled &&
                (value.accountTermDays == null
                  ? "Sin plazo definido"
                  : `${value.accountTermDays} días`)}
            </span>
          </div>
          <p className="whitespace-pre-wrap rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
            {value.notes || "Sin observaciones"}
          </p>
          <footer className="mt-5 flex justify-end gap-2">
            <button className={secondary} onClick={onClose}>
              Cerrar
            </button>
            <button className={primary} onClick={() => setViewing(false)}>
              <Pencil size={15} />
              Editar proveedor
            </button>
          </footer>
        </>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <fieldset disabled={busy}>
            <div className="grid gap-4 sm:grid-cols-2">
              {fields.map(([key, label, max]) => (
                <label
                  key={key}
                  className={`text-xs text-slate-500 ${key === "address" ? "sm:col-span-2" : ""}`}
                >
                  {label}
                  <input
                    className={`${field} mt-1`}
                    type={
                      key === "email"
                        ? "email"
                        : key === "phone"
                          ? "tel"
                          : "text"
                    }
                    required={key === "name"}
                    minLength={key === "name" ? 2 : undefined}
                    maxLength={max}
                    value={value[key] ?? ""}
                    onChange={(e) =>
                      setValue({ ...value, [key]: e.target.value })
                    }
                  />
                </label>
              ))}
            </div>
            <SupplierTermsFields
              value={value}
              onChange={(terms) => setValue({ ...value, ...terms })}
            />
            <label className="mt-4 block text-xs text-slate-500">
              Observaciones
              <textarea
                className="mt-1 min-h-20 w-full resize-y rounded-lg border border-slate-200 p-3 text-sm outline-none focus:border-teal-500"
                maxLength={1000}
                placeholder="Días de entrega, condiciones o indicaciones…"
                value={value.notes}
                onChange={(e) => setValue({ ...value, notes: e.target.value })}
              />
            </label>
          </fieldset>
          {error && (
            <p role="alert" className="mt-3 text-sm text-rose-700">
              {error}
            </p>
          )}
          <footer className="mt-5 flex justify-end gap-2 border-t border-slate-100 pt-4">
            <button
              type="button"
              disabled={busy}
              className={secondary}
              onClick={onClose}
            >
              Cancelar
            </button>
            <button disabled={busy} className={primary}>
              {busy ? "Guardando…" : "Guardar proveedor"}
            </button>
          </footer>
        </form>
      )}
    </PayableDialog>
  );
}
