import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Download,
  CalendarDays,
  LockKeyhole,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  TrendingUp,
  Tags,
  X,
} from "lucide-react";
import {
  createPriceList,
  getPriceLists,
  getTicketHeader,
  type CatalogProduct,
  type PriceList,
} from "./lib/api";
import {
  parsePrice,
  previewListIncrease,
  saveListChanges,
  renamePriceList,
  type PriceChange,
} from "./lib/price-lists-api";
import { downloadPriceListPdf } from "./lib/price-list-pdf";
import { defaultPriceListTitle } from "./lib/default-price-list-title";
import { Pagination } from "./pagination";
import { PriceAdjustmentControls } from "./price-adjustment-controls";
import { ListPriceInput } from "./list-price-input";
import { preservePriceListSelection } from "./lib/price-list-selection";

const money = (value: string | null | undefined) =>
  value == null
    ? "Sin precio"
    : new Intl.NumberFormat("es-AR", {
        style: "currency",
        currency: "ARS",
      }).format(Number(value) / 100);
const field =
  "h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm";
const secondary =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-teal-200 bg-white px-4 py-2 text-sm text-teal-800 disabled:opacity-40";
const primary =
  "inline-flex items-center justify-center gap-2 rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40";
function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      className="m-auto max-h-[90dvh] w-[min(760px,calc(100%-2rem))] overflow-y-auto rounded-2xl border bg-white p-6 shadow-xl backdrop:bg-slate-950/40"
    >
      <header className="mb-5 flex items-center justify-between">
        <h2 className="text-lg font-semibold">{title}</h2>
        <button aria-label="Cerrar" onClick={onClose}>
          <X size={20} />
        </button>
      </header>
      {children}
    </dialog>
  );
}
export function PriceListsWorkspace({
  active,
  token,
  organizationId,
  products,
  onError,
  onEditProduct,
}: {
  active: boolean;
  token: string;
  organizationId: string;
  products: CatalogProduct[];
  onError: (message: string) => void;
  onEditProduct: (product: CatalogProduct) => void;
}) {
  const [lists, setLists] = useState<PriceList[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [laboratory, setLaboratory] = useState("");
  const [page, setPage] = useState(1);
  const [selection, setSelection] = useState<string[]>([]);
  const [draft, setDraft] = useState<Record<string, PriceChange>>({});
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const requestId = useRef(crypto.randomUUID());
  const [message, setMessage] = useState("");
  const [modal, setModal] = useState<
    "create" | "edit" | "add" | "increase" | "export" | null
  >(null);
  const [name, setName] = useState("");
  const [fallbackListId, setFallbackListId] = useState("");
  const [includeAll, setIncludeAll] = useState(false);
  const [addQuery, setAddQuery] = useState("");
  const [addIds, setAddIds] = useState<string[]>([]);
  const [increaseIds, setIncreaseIds] = useState<string[]>([]);
  const [mode, setMode] = useState<"PERCENT" | "FIXED">("PERCENT");
  const [increase, setIncrease] = useState("");
  const [direction, setDirection] = useState<"UP" | "DOWN">("UP");
  const [preview, setPreview] = useState<(PriceChange & { name: string })[]>(
    [],
  );
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState("");
  useEffect(() => {
    if (!active || modal !== "increase") return;
    let current = true;
    setPreview([]);
    setPreviewError("");
    const magnitude = parsePrice(increase || "0");
    const value =
      magnitude === null
        ? null
        : Number(magnitude) * (direction === "DOWN" ? -1 : 1);
    if (value === null || !increaseIds.length || increaseIds.length > 2000) {
      setPreviewLoading(false);
      setPreviewError(
        value === null
          ? "Ingresá un ajuste válido con hasta dos decimales."
          : "Seleccioná entre 1 y 2000 productos.",
      );
      return;
    }
    setPreviewLoading(true);
    const timer = window.setTimeout(() => {
      void previewListIncrease(
        token,
        organizationId,
        selectedId,
        increaseIds,
        mode,
        value,
      )
        .then((rows) => {
          if (current) setPreview(rows);
        })
        .catch((error: unknown) => {
          if (current)
            setPreviewError(
              error instanceof Error
                ? error.message
                : "No se pudo calcular la vista previa.",
            );
        })
        .finally(() => {
          if (current) setPreviewLoading(false);
        });
    }, 250);
    return () => {
      current = false;
      window.clearTimeout(timer);
    };
  }, [
    active,
    modal,
    token,
    organizationId,
    selectedId,
    increaseIds,
    mode,
    increase,
    direction,
  ]);
  const [subtitle, setSubtitle] = useState("");
  const [menu, setMenu] = useState<string>();
  const [menuPosition, setMenuPosition] = useState({ left: 0, top: 0 });
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const dismiss = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenu(undefined);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenu(undefined);
    };
    const scroll = () => setMenu(undefined);
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", key);
    window.addEventListener("scroll", scroll, true);
    window.addEventListener("resize", scroll);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", key);
      window.removeEventListener("scroll", scroll, true);
      window.removeEventListener("resize", scroll);
    };
  }, [menu]);
  useEffect(() => {
    if (!active) {
      setMenu(undefined);
      setModal(null);
    }
  }, [active]);
  const selected = lists.find((list) => list.id === selectedId);
  const readOnly = !selected || selected.name === "Precio general";
  const changes = Object.values(draft);
  useEffect(() => {
    if (!changes.length) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [changes.length]);
  const load = async () => {
    const next = await getPriceLists(token, organizationId);
    setLists(next);
    setSelectedId((id) => preservePriceListSelection(next, id));
  };
  useEffect(() => {
    if (!active) return;
    let current = true;
    void getPriceLists(token, organizationId)
      .then((next) => {
        if (current) {
          setLists(next);
          setSelectedId((id) => preservePriceListSelection(next, id));
        }
      })
      .catch((error) => {
        if (current) onError(String(error.message));
      });
    return () => {
      current = false;
    };
  }, [active, token, organizationId, products]); // eslint-disable-line react-hooks/exhaustive-deps
  const execute = async (action: () => Promise<void>) => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setMessage("");
    try {
      await action();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "No se pudo completar la operación.",
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  const amount = (id: string) =>
    Object.hasOwn(draft, id)
      ? draft[id]!.amountMinor
      : (selected?.prices.find((price) => price.productId === id)
          ?.amountMinor ?? null);
  const included = products.filter((product) => amount(product.id) !== null);
  const categories = [
    ...new Map(
      products
        .filter((p) => p.category)
        .map((p) => [p.category!.id, p.category!.path ?? p.category!.name]),
    ).entries(),
  ];
  const laboratories = [
    ...new Map(
      products
        .filter((p) => p.laboratory)
        .map((p) => [p.laboratory!.id, p.laboratory!.name]),
    ).entries(),
  ];
  const matches = (product: CatalogProduct, text: string) =>
    `${product.name} ${product.activeIngredient ?? ""} ${product.barcodes.map((b) => b.code).join(" ")}`
      .toLocaleLowerCase()
      .includes(text.toLocaleLowerCase());
  const visible = included.filter(
    (p) =>
      matches(p, query) &&
      (!category || p.category?.id === category) &&
      (!laboratory || p.laboratory?.id === laboratory),
  );
  const pages = Math.max(1, Math.ceil(visible.length / 10));
  const currentPage = Math.min(page, pages);
  const rows = visible.slice((currentPage - 1) * 10, currentPage * 10);
  const changePrice = (id: string, value: string | null) => {
    const before =
      selected?.prices.find((p) => p.productId === id)?.amountMinor ?? null;
    setDraft((current) => {
      const next = { ...current };
      if (before === value) delete next[id];
      else
        next[id] = { productId: id, expectedMinor: before, amountMinor: value };
      return next;
    });
    requestId.current = crypto.randomUUID();
  };
  const switchList = (id: string) => {
    if (busy || id === selectedId) return;
    if (
      changes.length &&
      !window.confirm(
        "Hay cambios sin guardar. ¿Descartarlos para cambiar de lista?",
      )
    )
      return;
    setSelectedId(id);
    setDraft({});
    setSelection([]);
    setPage(1);
    setMessage("");
    setMenu(undefined);
  };
  const openIncrease = (ids: string[]) => {
    if (changes.length) {
      setMessage(
        "Guardá o descartá los cambios pendientes antes de preparar un ajuste.",
      );
      return;
    }
    setIncreaseIds(ids);
    setIncrease("");
    setDirection("UP");
    setMessage("");
    setPreview([]);
    setModal("increase");
    setMenu(undefined);
  };
  const save = () =>
    execute(async () => {
      await saveListChanges(
        token,
        organizationId,
        selectedId,
        requestId.current,
        changes,
      );
      setDraft({});
      requestId.current = crypto.randomUUID();
      setSelection([]);
      await load();
      setMessage("Cambios guardados.");
    });
  if (!active) return null;
  return (
    <div className="space-y-5">
      <section
        aria-label="Lista de precios seleccionada"
        className="flex flex-wrap items-center justify-between gap-x-8 gap-y-4 rounded-xl border border-slate-200 bg-white p-5"
      >
        <div className="contents">
          <div className="sr-only">
            <h2 className="font-semibold text-slate-800">
              Tus listas de precios
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Elegí una lista para consultar o administrar sus precios.
            </p>
          </div>
          <div className="flex max-w-full flex-wrap items-center gap-3">
            <label className="relative block min-w-0">
              <span className="sr-only">Seleccionar lista</span>
              <Tags
                size={16}
                className="pointer-events-none absolute left-3 top-3 text-teal-700"
              />
              <select
                className={`${field} pl-10 sm:w-64`}
                value={selectedId}
                disabled={busy || !lists.length}
                onChange={(event) => switchList(event.target.value)}
              >
                {!selectedId && <option value="">Seleccionar lista</option>}
                {lists.map((list) => (
                  <option key={list.id} value={list.id}>
                    {list.id === selectedId ? `Lista: ${list.name}` : list.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              className={`${primary} min-h-10`}
              disabled={busy || changes.length > 0}
              title={
                changes.length
                  ? "Guardá o descartá los cambios antes de crear otra lista"
                  : undefined
              }
              onClick={() => {
                setName("");
                setIncludeAll(false);
                setMessage("");
                setModal("create");
              }}
            >
              <Plus size={16} />
              Crear nueva lista
            </button>
          </div>
        </div>
        <div className="order-first min-w-0 flex-[1_1_480px]">
          {lists
            .filter((list) => list.id === selectedId)
            .map((list) => (
              <article
                key={list.id}
                className="flex flex-wrap items-center gap-4 text-left"
              >
                <span className="grid size-12 shrink-0 place-items-center rounded-full bg-emerald-100 text-teal-700">
                  <Tags size={24} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold break-words">{list.name}</h3>
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-teal-700">
                      Activa
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-4">
                    <div>
                      <strong className="text-lg tabular-nums">
                        {
                          list.prices.filter((price) =>
                            products.some((p) => p.id === price.productId),
                          ).length
                        }
                      </strong>
                      <p className="text-xs text-slate-500">productos</p>
                    </div>
                    <div className="flex items-center gap-2 border-l border-slate-200 pl-4 text-slate-500">
                      <CalendarDays size={16} />
                      <div className="text-xs">
                        <p>Última actualización</p>
                        <p className="mt-0.5">
                          {list.updatedAt
                            ? new Date(list.updatedAt).toLocaleString("es-AR", {
                                dateStyle: "short",
                                timeStyle: "short",
                              })
                            : "Sin cambios"}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
                {list.name === "Precio general" ? (
                  <span className="flex items-center gap-2 text-xs text-slate-500">
                    <LockKeyhole size={15} />
                    Solo lectura
                  </span>
                ) : (
                  <button
                    className={secondary}
                    disabled={busy || changes.length > 0}
                    title={
                      changes.length
                        ? "Guardá o descartá los precios pendientes antes de editar la lista"
                        : undefined
                    }
                    onClick={() => {
                      setName(list.name);
                      setFallbackListId(list.fallbackPriceListId ?? "");
                      setMessage("");
                      setModal("edit");
                    }}
                  >
                    <Pencil size={15} />
                    Editar lista
                  </button>
                )}
              </article>
            ))}
        </div>
      </section>
      <div className="flex flex-wrap gap-3 rounded-xl border bg-white p-4">
        <label className="relative min-w-60 flex-1">
          <Search size={16} className="absolute left-3 top-3 text-slate-400" />
          <input
            aria-label="Buscar producto"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            placeholder="Nombre, principio activo o código"
            className={`${field} pl-9`}
          />
        </label>
        <select
          aria-label="Categoría"
          className={`${field} sm:w-44`}
          value={category}
          onChange={(e) => {
            setCategory(e.target.value);
            setPage(1);
          }}
        >
          <option value="">Categorías</option>
          {categories.map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
        <select
          aria-label="Laboratorio"
          className={`${field} sm:w-44`}
          value={laboratory}
          onChange={(e) => {
            setLaboratory(e.target.value);
            setPage(1);
          }}
        >
          <option value="">Laboratorios</option>
          {laboratories.map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
        <button
          disabled={readOnly || busy}
          className={secondary}
          onClick={() => {
            setAddIds([]);
            setAddQuery("");
            setModal("add");
          }}
        >
          <Plus size={15} />
          Productos
        </button>
        <button
          disabled={readOnly || busy || !visible.length}
          className={secondary}
          onClick={() =>
            openIncrease(
              selection.length
                ? visible
                    .filter((p) => selection.includes(p.id))
                    .map((p) => p.id)
                : visible.map((p) => p.id),
            )
          }
        >
          <TrendingUp size={15} />
          Ajuste masivo
        </button>
        <button
          disabled={!included.length || busy || !!changes.length}
          className={secondary}
          onClick={() => {
            setName(defaultPriceListTitle());
            setSubtitle("");
            setModal("export");
          }}
        >
          <Download size={15} />
          Exportar PDF
        </button>
      </div>
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_220px] 2xl:grid-cols-[minmax(0,1fr)_260px]">
        <section className="overflow-x-auto rounded-xl border bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="p-3">
                  <input
                    type="checkbox"
                    aria-label="Seleccionar productos filtrados"
                    disabled={readOnly}
                    checked={
                      !!visible.length &&
                      visible.every((p) => selection.includes(p.id))
                    }
                    onChange={(e) =>
                      setSelection(
                        e.target.checked ? visible.map((p) => p.id) : [],
                      )
                    }
                  />
                </th>
                <th>Producto</th>
                <th className="p-3">Categoría / laboratorio</th>
                <th className="p-3 text-right">Precio actual</th>
                <th className="p-3 text-center">Nuevo precio</th>
                <th className="p-3">Estado</th>
                <th className="p-3">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((product) => (
                <tr key={product.id} className="border-t border-slate-100">
                  <td className="p-3">
                    <input
                      type="checkbox"
                      aria-label={`Seleccionar ${product.name}`}
                      disabled={readOnly}
                      checked={selection.includes(product.id)}
                      onChange={(e) =>
                        setSelection((ids) =>
                          e.target.checked
                            ? [...ids, product.id]
                            : ids.filter((id) => id !== product.id),
                        )
                      }
                    />
                  </td>
                  <td className="min-w-44 py-3">
                    <strong className="font-medium">{product.name}</strong>
                    <p className="text-xs text-slate-500">
                      {product.presentation}
                    </p>
                  </td>
                  <td className="p-3 text-xs text-slate-500">
                    {product.category?.path ??
                      product.category?.name ??
                      "Sin categoría"}
                    <br />
                    {product.laboratory?.name ?? "Sin laboratorio"}
                  </td>
                  <td className="whitespace-nowrap p-3 text-right">
                    {money(
                      selected?.prices.find((p) => p.productId === product.id)
                        ?.amountMinor,
                    )}
                  </td>
                  <td className="whitespace-nowrap p-3 text-center font-medium text-teal-800">
                    {readOnly ? (
                      "—"
                    ) : (
                      <ListPriceInput
                        key={`${selectedId}:${product.id}`}
                        name={product.name}
                        amount={draft[product.id]?.amountMinor}
                        disabled={busy}
                        onChange={(value) =>
                          changePrice(
                            product.id,
                            value ??
                              selected?.prices.find(
                                (p) => p.productId === product.id,
                              )?.amountMinor ??
                              product.prices[0]?.amountMinor ??
                              null,
                          )
                        }
                      />
                    )}
                  </td>
                  <td className="p-3 text-xs">
                    {draft[product.id] ? (
                      <span className="rounded-full bg-amber-50 px-2 py-1 text-amber-800">
                        Pendiente
                      </span>
                    ) : (
                      "Sin cambios"
                    )}
                  </td>
                  <td className="p-3">
                    <div className="flex gap-2">
                      <button
                        aria-label={`Editar producto ${product.name}`}
                        title="Editar datos del producto"
                        disabled={busy}
                        className="disabled:opacity-30"
                        onClick={() => {
                          setMenu(undefined);
                          onEditProduct(product);
                        }}
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        aria-label={`Acciones de ${product.name}`}
                        aria-expanded={menu === product.id}
                        disabled={readOnly || busy}
                        className="disabled:opacity-30"
                        onClick={(event) => {
                          const rect =
                            event.currentTarget.getBoundingClientRect();
                          setMenuPosition({
                            left: Math.max(
                              8,
                              Math.min(
                                rect.right - 220,
                                window.innerWidth - 228,
                              ),
                            ),
                            top: Math.max(
                              8,
                              Math.min(
                                rect.bottom + 6,
                                window.innerHeight - 112,
                              ),
                            ),
                          });
                          setMenu(menu === product.id ? undefined : product.id);
                        }}
                      >
                        <MoreHorizontal size={18} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length && (
            <p className="p-8 text-center text-sm text-slate-500">
              No hay productos en esta selección.
              {!readOnly && " Agregá productos a la lista."}
            </p>
          )}
          <Pagination
            total={visible.length}
            currentPage={currentPage}
            totalPages={pages}
            noun="productos"
            label="Páginas de precios"
            onChange={setPage}
          />
        </section>
        <aside className="space-y-4 rounded-xl border bg-white p-5">
          <h2 className="font-semibold">Resumen de la selección</h2>
          <p className="text-sm text-slate-500">
            Productos visibles{" "}
            <strong className="block text-2xl text-slate-800">
              {visible.length}
            </strong>
          </p>
          <p className="text-sm text-slate-500">
            Seleccionados{" "}
            <strong className="block text-2xl text-slate-800">
              {
                selection.filter((id) => visible.some((p) => p.id === id))
                  .length
              }
            </strong>
          </p>
          <p className="text-sm text-slate-500">
            Cambios pendientes{" "}
            <strong className="block text-2xl text-amber-700">
              {changes.length}
            </strong>
          </p>
          <button
            disabled={readOnly || !changes.length || busy}
            className={`${primary} w-full`}
            onClick={() => void save()}
          >
            {busy ? "Guardando…" : "Guardar cambios"}
          </button>
          <button
            disabled={!changes.length || busy}
            className={`${secondary} w-full`}
            onClick={() => {
              setDraft({});
              requestId.current = crypto.randomUUID();
            }}
          >
            Descartar cambios
          </button>
          <p className="text-xs text-slate-500">
            Los cambios se aplican solo a {selected?.name}. Los productos no
            incluidos usan{" "}
            {lists.find((list) => list.id === selected?.fallbackPriceListId)
              ?.name
              ? `primero ${lists.find((list) => list.id === selected?.fallbackPriceListId)?.name} y luego Precio general`
              : "Precio general"}{" "}
            al vender.
          </p>
        </aside>
      </div>
      {message && (
        <p role="status" className="rounded-lg border bg-white p-3 text-sm">
          {message}
        </p>
      )}
      {modal && (
        <Modal
          title={
            {
              create: "Crear lista de precios",
              edit: "Editar lista",
              add: "Agregar productos",
              increase: "Ajuste de precios",
              export: "Exportar lista en PDF",
            }[modal]
          }
          onClose={() => {
            if (!busy) setModal(null);
          }}
        >
          {modal === "edit" && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void execute(async () => {
                  await renamePriceList(
                    token,
                    organizationId,
                    selectedId,
                    name.trim(),
                    fallbackListId || null,
                  );
                  await load();
                  setModal(null);
                  setMessage("Lista actualizada.");
                });
              }}
            >
              <label className="block text-sm">
                Nombre de la lista
                <input
                  autoFocus
                  required
                  minLength={2}
                  maxLength={120}
                  className={`${field} mt-2`}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </label>
              <label className="mt-4 block text-sm">
                Si el producto no está en esta lista
                <select
                  className={`${field} mt-2`}
                  value={fallbackListId}
                  onChange={(event) => setFallbackListId(event.target.value)}
                >
                  <option value="">Usar Precio general</option>
                  {lists
                    .filter(
                      (list) =>
                        list.id !== selectedId &&
                        list.name !== "Precio general",
                    )
                    .map((list) => (
                      <option key={list.id} value={list.id}>
                        Usar {list.name}
                      </option>
                    ))}
                </select>
              </label>
              <p className="mt-2 rounded-lg bg-teal-50 p-3 text-xs text-teal-800">
                Orden al vender: {name.trim() || "Esta lista"} →{" "}
                {fallbackListId
                  ? `${lists.find((list) => list.id === fallbackListId)?.name ?? "Lista de respaldo"} → `
                  : ""}
                Precio general.
                {fallbackListId &&
                  " Se consulta sólo esa lista de respaldo, no sus propias asociaciones."}
              </p>
              <p className="mt-3 text-xs text-slate-500">
                Cambiar el nombre no modifica los productos, sus precios ni los
                clientes asignados.
              </p>
              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  disabled={busy}
                  className={secondary}
                  onClick={() => setModal(null)}
                >
                  Cancelar
                </button>
                <button
                  disabled={busy || name.trim().length < 2}
                  className={primary}
                >
                  Guardar lista
                </button>
              </div>
            </form>
          )}
          {modal === "create" && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void execute(async () => {
                  const created = await createPriceList(
                    token,
                    organizationId,
                    name,
                    includeAll,
                  );
                  const next = await getPriceLists(token, organizationId);
                  setLists(next);
                  setSelectedId(created.id);
                  setDraft({});
                  setSelection([]);
                  setPage(1);
                  setModal(null);
                  if (!includeAll) {
                    setAddIds([]);
                    setAddQuery("");
                    setModal("add");
                  }
                });
              }}
            >
              <label className="text-sm">
                Nombre
                <input
                  required
                  minLength={2}
                  maxLength={120}
                  className={`${field} mt-2`}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <fieldset
                className="my-5 grid gap-3 sm:grid-cols-2"
                disabled={busy}
              >
                <legend className="mb-3 text-sm font-medium">
                  ¿Qué productos querés incluir?
                </legend>
                {[false, true].map((all) => (
                  <label
                    key={String(all)}
                    className={`cursor-pointer rounded-xl border p-4 ${includeAll === all ? "border-teal-500 bg-teal-50" : "border-slate-200"}`}
                  >
                    <span className="flex items-center gap-2 font-medium">
                      <input
                        type="radio"
                        name="list-type"
                        checked={includeAll === all}
                        onChange={() => setIncludeAll(all)}
                      />
                      {all ? "Todos los productos" : "Personalizada"}
                    </span>
                    <p className="mt-2 text-xs leading-relaxed text-slate-500">
                      {all
                        ? `Copia los precios generales de los ${products.length} productos activos. Después podés ajustarlos.`
                        : "Elegís los productos que querés incluir. Los demás mantienen su precio general al vender."}
                    </p>
                  </label>
                ))}
              </fieldset>
              <button
                disabled={
                  busy || name.trim().toLocaleLowerCase() === "precio general"
                }
                className={primary}
              >
                Crear lista
              </button>
            </form>
          )}
          {modal === "add" && (
            <>
              <input
                className={field}
                placeholder="Buscar productos para agregar"
                value={addQuery}
                onChange={(e) => setAddQuery(e.target.value)}
              />
              <button
                className={`${secondary} my-3`}
                onClick={() =>
                  setAddIds(
                    products
                      .filter(
                        (p) =>
                          amount(p.id) === null &&
                          p.prices[0] &&
                          matches(p, addQuery),
                      )
                      .slice(0, 2000)
                      .map((p) => p.id),
                  )
                }
              >
                Seleccionar filtrados (máx. 2000)
              </button>
              <div className="max-h-80 overflow-auto">
                {products
                  .filter((p) => amount(p.id) === null && matches(p, addQuery))
                  .map((product) => (
                    <label
                      key={product.id}
                      className="flex items-center gap-3 border-t py-3 text-sm"
                    >
                      <input
                        type="checkbox"
                        disabled={!product.prices[0]}
                        checked={addIds.includes(product.id)}
                        onChange={(e) =>
                          setAddIds((ids) =>
                            e.target.checked
                              ? [...ids, product.id]
                              : ids.filter((id) => id !== product.id),
                          )
                        }
                      />
                      <span className="flex-1">{product.name}</span>
                      {money(product.prices[0]?.amountMinor)}
                    </label>
                  ))}
              </div>
              <button
                disabled={!addIds.length || addIds.length > 2000}
                className={`${primary} mt-4`}
                onClick={() => {
                  for (const id of addIds) {
                    const price = products.find((p) => p.id === id)?.prices[0]
                      ?.amountMinor;
                    if (price !== undefined) changePrice(id, price);
                  }
                  setModal(null);
                }}
              >
                Agregar {addIds.length} a los cambios
              </button>
            </>
          )}
          {modal === "increase" && (
            <>
              <p className="mb-4 text-sm text-slate-500">
                Ajustá{" "}
                {increaseIds.length === 1
                  ? "el producto seleccionado"
                  : `los ${increaseIds.length} productos seleccionados`}{" "}
                de{" "}
                <strong className="font-medium text-slate-700">
                  {selected?.name}
                </strong>
                . Los cambios se preparan para revisar antes de guardar.
              </p>
              <PriceAdjustmentControls
                direction={direction}
                mode={mode}
                value={increase}
                onDirectionChange={(next) => {
                  setDirection(next);
                  setPreview([]);
                }}
                onModeChange={(next) => {
                  setMode(next);
                  setPreview([]);
                }}
                onValueChange={(next) => {
                  setIncrease(next);
                  setPreview([]);
                }}
              />
              <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
                <p
                  role="status"
                  className="text-sm font-semibold text-slate-800"
                >
                  Vista previa
                </p>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-medium ${direction === "DOWN" ? "bg-orange-50 text-orange-800" : "bg-teal-50 text-teal-800"}`}
                >
                  {
                    preview.filter(
                      (row) => row.amountMinor !== row.expectedMinor,
                    ).length
                  }{" "}
                  precios a {direction === "DOWN" ? "bajar" : "aumentar"}
                </span>
              </div>
              {previewError && (
                <p role="alert" className="mt-2 text-sm text-red-700">
                  {previewError}
                </p>
              )}
              <div className="my-4 max-h-72 overflow-auto rounded-xl border border-slate-200">
                <table className="w-full text-sm tabular-nums">
                  <thead className="sticky top-0 z-10 bg-slate-100 text-xs text-slate-600">
                    <tr className="text-left">
                      <th className="px-4 py-3 font-medium">Producto</th>
                      <th className="whitespace-nowrap px-4 py-3 text-right font-medium">
                        Precio actual
                      </th>
                      <th className="whitespace-nowrap px-4 py-3 text-right font-medium">
                        Nuevo precio
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {(preview.length
                      ? preview
                      : increaseIds.map((id) => ({
                          productId: id,
                          name:
                            products.find((p) => p.id === id)?.name ??
                            "Producto",
                          expectedMinor:
                            selected?.prices.find((p) => p.productId === id)
                              ?.amountMinor ?? null,
                          amountMinor: null,
                        }))
                    ).map((change) => (
                      <tr
                        key={change.productId}
                        className="border-t border-slate-100 even:bg-slate-50/60"
                      >
                        <td className="min-w-48 px-4 py-3 text-slate-700">
                          {change.name}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right text-slate-500">
                          {money(change.expectedMinor)}
                        </td>
                        <td
                          className={`whitespace-nowrap px-4 py-3 text-right font-semibold ${change.amountMinor === change.expectedMinor || change.amountMinor === null ? "text-slate-600" : direction === "DOWN" ? "text-orange-700" : "text-teal-700"}`}
                        >
                          {change.amountMinor === null
                            ? "—"
                            : money(change.amountMinor)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
                <p className="max-w-sm text-xs leading-relaxed text-slate-500">
                  Todavía no se guardará ningún precio. Después de aplicar,
                  revisá la lista y pulsá Guardar cambios.
                </p>
                <button
                  disabled={
                    !preview.some(
                      (row) => row.amountMinor !== row.expectedMinor,
                    ) ||
                    busy ||
                    previewLoading ||
                    !!previewError
                  }
                  className={
                    direction === "DOWN"
                      ? "inline-flex items-center justify-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-40"
                      : primary
                  }
                  onClick={() => {
                    setDraft(
                      Object.fromEntries(
                        preview
                          .filter(
                            (row) => row.amountMinor !== row.expectedMinor,
                          )
                          .map(({ productId, expectedMinor, amountMinor }) => [
                            productId,
                            { productId, expectedMinor, amountMinor },
                          ]),
                      ),
                    );
                    requestId.current = crypto.randomUUID();
                    setModal(null);
                  }}
                >
                  Aplicar a los cambios (
                  {
                    preview.filter(
                      (row) => row.amountMinor !== row.expectedMinor,
                    ).length
                  }
                  )
                </button>
              </div>
            </>
          )}
          {modal === "export" && (
            <>
              <label className="block text-sm">
                Título
                <input
                  className={`${field} mt-1`}
                  value={name}
                  maxLength={120}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <label className="mt-4 block text-sm">
                Subtítulo / vigencia (opcional)
                <input
                  className={`${field} mt-1`}
                  value={subtitle}
                  maxLength={140}
                  onChange={(e) => setSubtitle(e.target.value)}
                  placeholder="Ej. Vigencia septiembre 2026"
                />
              </label>
              <p className="my-4 text-sm text-slate-500">
                Incluye los {included.length} productos guardados de esta lista,
                agrupados por categoría. Los precios inferiores al general se
                destacan como oferta. La vigencia es informativa; no programa
                cambios.
              </p>
              <button
                disabled={busy || !name.trim()}
                className={primary}
                onClick={() =>
                  void execute(async () => {
                    const header = await getTicketHeader(token, organizationId);
                    downloadPriceListPdf({
                      title: name,
                      subtitle,
                      organization: header.name,
                      rows: included.map((p) => ({
                        name: p.name,
                        category:
                          p.category?.path ??
                          p.category?.name ??
                          "Sin categoría",
                        amountMinor: amount(p.id)!,
                        offer:
                          Number(amount(p.id)) <
                          Number(p.prices[0]?.amountMinor ?? 0),
                      })),
                    });
                    setModal(null);
                  })
                }
              >
                <Download size={16} />
                Descargar PDF
              </button>
            </>
          )}
          {message && (
            <p role="status" className="mt-4 text-sm text-red-700">
              {message}
            </p>
          )}
        </Modal>
      )}
      {menu &&
        createPortal(
          <div
            ref={menuRef}
            style={menuPosition}
            className="fixed z-50 grid w-[220px] gap-1 rounded-xl border border-slate-200 bg-white p-1.5 text-sm shadow-xl"
            aria-label="Acciones del producto"
          >
            <button
              className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-left hover:bg-teal-50"
              onClick={() => openIncrease([menu])}
            >
              <TrendingUp size={16} />
              Ajustar precio
            </button>
            <button
              className="rounded-lg px-3 py-2.5 text-left text-red-700 hover:bg-red-50"
              onClick={() => {
                changePrice(menu, null);
                setMenu(undefined);
              }}
            >
              Quitar de esta lista
            </button>
          </div>,
          document.body,
        )}
    </div>
  );
}
