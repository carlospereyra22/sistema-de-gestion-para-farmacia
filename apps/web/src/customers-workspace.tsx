import { useEffect, useRef, useState } from "react";
import {
  Search,
  Plus,
  Pencil,
  Trash2,
  RotateCcw,
  X,
  Phone,
  Mail,
  MapPin,
  FileText,
  Tag,
  Users,
} from "lucide-react";
import {
  getParties,
  getPriceLists,
  setCustomerActive,
  type Party,
  type PriceList,
} from "./lib/api";
import { Pagination } from "./pagination";
import { StatusToast } from "./status-toast";
import { CatalogItemDialog } from "./catalog-item-dialog";
import { CustomerEditor } from "./customer-editor";
import { ProductFilterSelect } from "./product-filter-select";
import { field, primary, secondary } from "./supplier-payables/dialog";

import { filterCustomers } from "./lib/customer-directory";
const rowAction =
  "inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs text-slate-500 hover:bg-slate-100 hover:text-teal-700";
function State({ active }: { active: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium ${active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {active ? "Activo" : "Eliminado"}
    </span>
  );
}
function Avatar({ name }: { name: string }) {
  return (
    <span
      aria-hidden="true"
      className="grid size-9 shrink-0 place-items-center rounded-full bg-teal-50 text-sm font-semibold text-teal-700"
    >
      {name.trim().slice(0, 1).toLocaleUpperCase("es") || "C"}
    </span>
  );
}
export function CustomersWorkspace({
  token,
  organizationId,
}: {
  token: string;
  organizationId: string;
}) {
  const [items, setItems] = useState<Party[]>([]),
    [lists, setLists] = useState<PriceList[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const [query, setQuery] = useState(""),
    [listFilter, setListFilter] = useState("all"),
    [archived, setArchived] = useState(false),
    [page, setPage] = useState(1),
    [selectedId, setSelectedId] = useState<string>();
  const [editor, setEditor] = useState<{ customer?: Party }>(),
    [deleting, setDeleting] = useState<Party>(),
    [restoring, setRestoring] = useState(false);
  const [notice, setNotice] = useState<{ message: string; id: number }>();
  const sequence = useRef(0),
    restoreGate = useRef(false);
  const notify = (message: string) =>
    setNotice({ message, id: ++sequence.current });
  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [customers, priceLists] = await Promise.all([
        getParties(token, organizationId, "customers"),
        getPriceLists(token, organizationId).catch(() => []),
      ]);
      setItems(customers);
      setLists(priceLists);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar Clientes.");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, [token, organizationId]); // eslint-disable-line react-hooks/exhaustive-deps
  const general = lists.find((p) => p.name === "Precio general");
  const filtered = filterCustomers(
    items,
    query,
    listFilter,
    archived,
    general?.id,
  );
  const pages = Math.max(1, Math.ceil(filtered.length / 10)),
    current = Math.min(page, pages);
  const selected = filtered.find((c) => c.id === selectedId);
  const listName = (c: Party) =>
    !c.priceListId
      ? "Precio general"
      : (lists.find((p) => p.id === c.priceListId)?.name ?? "Lista asignada");
  const restore = async (c: Party) => {
    if (restoreGate.current) return;
    restoreGate.current = true;
    setRestoring(true);
    try {
      await setCustomerActive(token, organizationId, c.id, true);
      notify("Cliente restaurado.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo restaurar.");
    } finally {
      restoreGate.current = false;
      setRestoring(false);
    }
  };
  return (
    <div className="flex min-h-[calc(100dvh-120px)] flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <label className="relative min-w-[220px] flex-1">
          <Search size={16} className="absolute left-3 top-3 text-slate-400" />
          <input
            aria-label="Buscar clientes"
            className={`${field} pl-9`}
            placeholder="Buscar por nombre, documento o ficha…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
              setSelectedId(undefined);
            }}
          />
        </label>
        <div className="min-w-[210px]">
          <ProductFilterSelect
            compact
            label="Filtrar por lista de precios"
            icon={null}
            value={listFilter}
            onChange={(value) => {
              setListFilter(value);
              setPage(1);
              setSelectedId(undefined);
            }}
            options={[
              { value: "all", label: "Todas las listas de precios" },
              { value: "general", label: "Precio general" },
              ...lists
                .filter((p) => p.name !== "Precio general")
                .map((p) => ({ value: p.id, label: p.name })),
            ]}
          />
        </div>
        <label className="flex items-center gap-2 whitespace-nowrap text-xs text-slate-500">
          <input
            type="checkbox"
            className="accent-teal-700"
            checked={archived}
            onChange={(e) => {
              setArchived(e.target.checked);
              setPage(1);
              setSelectedId(undefined);
            }}
          />
          Mostrar eliminados
        </label>
        <button className={`${primary} ml-auto`} onClick={() => setEditor({})}>
          <Plus size={17} />
          Nuevo cliente
        </button>
      </div>
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
      <div
        className={`grid flex-1 items-stretch gap-4 ${selected ? "xl:grid-cols-[minmax(0,1fr)_300px]" : "grid-cols-1"}`}
      >
        <section className="flex min-h-[calc(100dvh-200px)] min-w-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex-1 overflow-x-auto">
            <table
              className="w-full min-w-[720px] text-left text-sm"
              aria-label="Clientes"
            >
              <thead className="bg-slate-50/80 text-[11px] text-slate-500">
                <tr>
                  {[
                    "Cliente",
                    "Documento / Ficha",
                    "Contacto",
                    "Lista de precios",
                    "Estado",
                    "Acciones",
                  ].map((label) => (
                    <th key={label} className="px-4 py-3 font-medium">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.slice((current - 1) * 10, current * 10).map((c) => (
                  <tr
                    key={c.id}
                    onClick={() => setSelectedId(c.id)}
                    className={`cursor-pointer transition-colors ${selectedId === c.id ? "bg-teal-50/60 shadow-[inset_3px_0_0_#0d9488]" : "hover:bg-slate-50/70"}`}
                  >
                    <td className="px-4 py-3">
                      <button
                        aria-expanded={selectedId === c.id}
                        aria-controls="customer-detail"
                        className="flex items-center gap-3 text-left font-medium text-slate-800"
                        onClick={() => setSelectedId(c.id)}
                      >
                        <Avatar name={c.name} />
                        {c.name}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      <p>{c.billingTaxId || c.document || "Sin documento"}</p>
                      <p className="mt-1 text-[11px] text-slate-400">
                        Ficha {c.id.slice(0, 8)}
                      </p>
                    </td>
                    <td className="max-w-48 px-4 py-3 text-xs text-slate-500">
                      <p className="truncate">
                        {c.billingPhone || c.billingEmail || "—"}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <span className="whitespace-nowrap rounded-md bg-slate-100 px-2 py-1 text-[11px] text-slate-600">
                        {listName(c)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <State active={c.active} />
                    </td>
                    <td
                      className="px-3 py-3"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex gap-1">
                        <button
                          className={rowAction}
                          aria-label={`Editar ${c.name}`}
                          onClick={() => setEditor({ customer: c })}
                        >
                          <Pencil size={14} />
                          Editar
                        </button>
                        {c.active ? (
                          <button
                            className={`${rowAction} hover:text-rose-600`}
                            aria-label={`Eliminar ${c.name}`}
                            onClick={() => setDeleting(c)}
                          >
                            <Trash2 size={14} />
                          </button>
                        ) : (
                          <button
                            disabled={restoring}
                            className={rowAction}
                            aria-label={`Restaurar ${c.name}`}
                            onClick={() => void restore(c)}
                          >
                            <RotateCcw size={14} />
                            Restaurar
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {loading ? (
              <p className="p-12 text-center text-sm text-slate-400">
                Cargando clientes…
              </p>
            ) : (
              !filtered.length && (
                <div className="p-12 text-center">
                  <Users size={28} className="mx-auto mb-3 text-teal-300" />
                  <p className="text-sm text-slate-500">
                    {items.length
                      ? "No hay clientes que coincidan con estos filtros."
                      : "Todavía no hay clientes cargados."}
                  </p>
                </div>
              )
            )}
          </div>
          <Pagination
            integrated
            total={filtered.length}
            currentPage={current}
            totalPages={pages}
            noun="clientes"
            label="Páginas de clientes"
            onChange={(p) => {
              setPage(p);
              setSelectedId(undefined);
            }}
          />
        </section>
        {selected && (
          <aside
            id="customer-detail"
            aria-label={`Detalle de ${selected.name}`}
            className="order-first flex min-w-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm xl:order-none"
          >
            <header className="flex items-start gap-3 border-b border-slate-100 bg-slate-50/60 p-5">
              <Avatar name={selected.name} />
              <div className="min-w-0 flex-1">
                <p className="mb-1 text-[11px] font-medium text-slate-500">
                  Ficha del cliente
                </p>
                <h2 className="break-words text-base font-semibold text-slate-800">
                  {selected.name}
                </h2>
                <div className="mt-2">
                  <State active={selected.active} />
                </div>
              </div>
              <button
                aria-label="Cerrar detalle del cliente"
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
                onClick={() => setSelectedId(undefined)}
              >
                <X size={17} />
              </button>
            </header>
            <dl className="space-y-5 p-5">
              {[
                [
                  FileText,
                  "CUIT / CUIL / DNI",
                  selected.billingTaxId || selected.document,
                ],
                [Tag, "Lista de precios", listName(selected)],
                [FileText, "Ficha", selected.id.slice(0, 8)],
                [
                  MapPin,
                  "Domicilio de facturación",
                  [
                    selected.billingAddress,
                    selected.billingCity,
                    selected.billingProvince,
                    selected.billingPostalCode,
                  ]
                    .filter(Boolean)
                    .join(", "),
                ],
                [
                  FileText,
                  "Condición frente al IVA",
                  selected.billingVatCondition,
                ],
              ].map(([Icon, label, value]) => {
                const ItemIcon = Icon as typeof FileText;
                return (
                  <div key={String(label)} className="flex gap-2.5">
                    <ItemIcon
                      size={15}
                      className="mt-0.5 shrink-0 text-slate-400"
                    />
                    <div className="min-w-0">
                      <dt className="text-[11px] font-medium text-slate-500">
                        {String(label)}
                      </dt>
                      <dd
                        className={`mt-1 break-words text-xs leading-relaxed ${value ? "text-slate-800" : "text-slate-400"}`}
                      >
                        {value ? String(value) : "Sin especificar"}
                      </dd>
                    </div>
                  </div>
                );
              })}
            </dl>
            <div className="mx-5 space-y-3 border-t border-slate-100 py-5 text-xs text-slate-500">
              <h3 className="font-medium text-slate-700">Contacto</h3>
              <p className="flex items-center gap-2">
                <Phone size={14} />
                {selected.billingPhone || "Sin teléfono"}
              </p>
              <p className="flex items-center gap-2 break-all">
                <Mail size={14} />
                {selected.billingEmail || "Sin email"}
              </p>
              {selected.notes && (
                <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-3">
                  <h3 className="mb-1.5 text-[11px] font-medium text-slate-600">
                    Observaciones
                  </h3>
                  <p className="whitespace-pre-wrap break-words leading-relaxed">
                    {selected.notes}
                  </p>
                </div>
              )}
            </div>
            <footer className="mt-auto border-t border-slate-100 p-4">
              <button
                className={`${secondary} w-full`}
                onClick={() => setEditor({ customer: selected })}
              >
                <Pencil size={14} />
                Editar cliente
              </button>
            </footer>
          </aside>
        )}
      </div>
      {editor && (
        <CustomerEditor
          key={editor.customer?.id ?? "new"}
          customer={editor.customer}
          customers={items}
          priceLists={lists}
          token={token}
          organizationId={organizationId}
          onClose={() => setEditor(undefined)}
          onSaved={() => {
            setEditor(undefined);
            notify("Cliente guardado.");
            void load();
          }}
        />
      )}
      {deleting && (
        <CatalogItemDialog
          mode="delete"
          name={deleting.name}
          deleteDescription={`¿Eliminar a “${deleting.name}”? Sus ventas y movimientos históricos se conservan. Podés restaurarlo desde Mostrar eliminados.`}
          onClose={() => setDeleting(undefined)}
          onSave={async () => {
            await setCustomerActive(token, organizationId, deleting.id, false);
            setDeleting(undefined);
            setSelectedId(undefined);
            notify("Cliente eliminado del listado activo.");
            await load();
          }}
        />
      )}
      {notice && (
        <StatusToast
          key={notice.id}
          message={notice.message}
          onClose={() => setNotice(undefined)}
        />
      )}
    </div>
  );
}
