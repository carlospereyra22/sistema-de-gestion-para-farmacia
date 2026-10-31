import { useEffect, useRef, useState } from "react";
import {
  CATEGORY_ICONS,
  CATEGORY_COLORS,
  type CategoryIcon,
  type CategoryColor,
} from "@gestion/contracts";
import {
  Box,
  FolderTree,
  FlaskConical,
  Tag,
  Pill,
  Sparkles,
  ShieldCheck,
  ShoppingBag,
  SprayCan,
  HeartPulse,
  Pencil,
  Trash2,
  Plus,
  Search,
  ImagePlus,
  Baby,
  Thermometer,
  Bandage,
  Syringe,
  Stethoscope,
  BriefcaseMedical,
  Smile,
  Eye,
  Ear,
  Droplets,
  Scissors,
  Sun,
  Leaf,
  Milk,
  ChevronRight,
  ChevronDown,
} from "lucide-react";
import { categoryBranch, visibleCategoryTree } from "./lib/category-tree";
import { CatalogItemDialog } from "./catalog-item-dialog";
import { ProductImageDialog } from "./product-image";
export function CatalogOptionsTitle() {
  return (
    <div className="flex min-w-0 items-center gap-3.5">
      <span
        aria-hidden="true"
        className="grid size-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-emerald-400 via-teal-600 to-teal-800 text-white shadow-sm ring-1 ring-inset ring-white/30"
      >
        <FolderTree size={27} strokeWidth={1.6} />
      </span>
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">
        Categorías y laboratorios
      </h1>
    </div>
  );
}
import {
  changeCatalogNamedItem,
  createCatalogNamedItem,
  getCatalogOptions,
  laboratoryLogo,
  updateCategoryIcon,
  type CatalogOptions,
  type CatalogNamedOption,
} from "./lib/api";

const colorTones: Record<Exclude<CategoryColor, "auto">, string> = {
  teal: "bg-teal-50 text-teal-600",
  blue: "bg-sky-50 text-sky-600",
  violet: "bg-violet-50 text-violet-600",
  rose: "bg-rose-50 text-rose-500",
  amber: "bg-amber-50 text-amber-600",
  emerald: "bg-emerald-50 text-emerald-600",
  slate: "bg-slate-100 text-slate-600",
  red: "bg-red-50 text-red-600",
  orange: "bg-orange-50 text-orange-600",
  yellow: "bg-yellow-50 text-yellow-700",
  lime: "bg-lime-50 text-lime-700",
  cyan: "bg-cyan-50 text-cyan-600",
  indigo: "bg-indigo-50 text-indigo-600",
  fuchsia: "bg-fuchsia-50 text-fuchsia-600",
  brown: "bg-stone-100 text-amber-900",
};
const colorSwatches: Record<CategoryColor, string> = {
  auto: "bg-gradient-to-br from-rose-400 via-violet-500 to-teal-400",
  teal: "bg-teal-500",
  blue: "bg-sky-500",
  violet: "bg-violet-500",
  rose: "bg-rose-500",
  amber: "bg-amber-400",
  emerald: "bg-emerald-500",
  slate: "bg-slate-500",
  red: "bg-red-600",
  orange: "bg-orange-500",
  yellow: "bg-yellow-300",
  lime: "bg-lime-500",
  cyan: "bg-cyan-400",
  indigo: "bg-indigo-700",
  fuchsia: "bg-fuchsia-500",
  brown: "bg-amber-900",
};
const colorLabels: Record<CategoryColor, string> = {
  auto: "Automático",
  teal: "Turquesa",
  blue: "Azul",
  violet: "Violeta",
  rose: "Rosa",
  amber: "Ámbar",
  emerald: "Verde",
  slate: "Gris",
  red: "Rojo",
  orange: "Naranja",
  yellow: "Amarillo",
  lime: "Lima",
  cyan: "Celeste",
  indigo: "Índigo",
  fuchsia: "Fucsia",
  brown: "Marrón",
};
export function CategorySymbol({
  name,
  icon = "auto",
  color = "auto",
}: {
  name: string;
  icon?: CategoryIcon;
  color?: CategoryColor;
}) {
  const key = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const [AutomaticIcon, automaticTone] = key.includes("medicamento")
    ? [Pill, "bg-violet-50 text-violet-600"]
    : key.includes("dermo")
      ? [Sparkles, "bg-sky-50 text-sky-600"]
      : key.includes("higiene")
        ? [ShieldCheck, "bg-emerald-50 text-emerald-600"]
        : key.includes("perfumer")
          ? [SprayCan, "bg-amber-50 text-amber-600"]
          : key.includes("suplement")
            ? [HeartPulse, "bg-indigo-50 text-indigo-600"]
            : key.includes("accesorio")
              ? [ShoppingBag, "bg-rose-50 text-rose-500"]
              : [Tag, "bg-teal-50 text-teal-600"];
  const explicit = {
    tag: Tag,
    pill: Pill,
    sparkles: Sparkles,
    shield: ShieldCheck,
    bag: ShoppingBag,
    spray: SprayCan,
    heart: HeartPulse,
    box: Box,
    baby: Baby,
    thermometer: Thermometer,
    bandage: Bandage,
    syringe: Syringe,
    stethoscope: Stethoscope,
    "first-aid": BriefcaseMedical,
    "oral-care": Smile,
    eye: Eye,
    ear: Ear,
    drops: Droplets,
    scissors: Scissors,
    sun: Sun,
    leaf: Leaf,
    bottle: Milk,
    flask: FlaskConical,
  };
  const Icon = icon === "auto" ? AutomaticIcon : explicit[icon];
  const tone =
    color !== "auto"
      ? colorTones[color]
      : icon === "auto"
        ? automaticTone
        : colorTones.teal;
  return (
    <span
      aria-hidden="true"
      className={`grid size-11 shrink-0 place-items-center rounded-2xl ${tone}`}
    >
      <Icon size={23} />
    </span>
  );
}

const iconLabels: Record<CategoryIcon, string> = {
  auto: "Automático",
  tag: "Etiqueta",
  pill: "Medicamento",
  sparkles: "Cuidado",
  shield: "Higiene",
  bag: "Accesorios",
  spray: "Perfumería",
  heart: "Bienestar",
  box: "Caja",
  baby: "Bebés",
  thermometer: "Termómetro",
  bandage: "Curaciones",
  syringe: "Inyectables",
  stethoscope: "Control médico",
  "first-aid": "Botiquín",
  "oral-care": "Salud bucal",
  eye: "Ojos",
  ear: "Oídos",
  drops: "Gotas",
  scissors: "Manicura",
  sun: "Protección solar",
  leaf: "Natural",
  bottle: "Nutrición",
  flask: "Preparados",
};
function CategoryIconPicker({
  name,
  value,
  color = "auto",
  onChange,
  disabled = false,
  creation = false,
}: {
  name: string;
  value: CategoryIcon;
  color?: CategoryColor;
  onChange: (icon: CategoryIcon, color: CategoryColor) => void;
  disabled?: boolean;
  creation?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [draftIcon, setDraftIcon] = useState(value);
  const [draftColor, setDraftColor] = useState(color);
  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          setDraftIcon(value);
          setDraftColor(color);
          dialog.current?.showModal();
        }}
        aria-label={`Elegir icono para ${name || "nueva categoría"}`}
        title="Cambiar icono"
        className={
          creation
            ? "inline-flex h-10 shrink-0 items-center gap-2 rounded-lg border border-slate-200 px-2 text-xs text-teal-700 hover:border-teal-300 focus-visible:outline-2 focus-visible:outline-teal-600 [&>span:first-child]:size-8"
            : "grid size-11 shrink-0 place-items-center rounded-2xl p-0 hover:ring-2 hover:ring-teal-200 focus-visible:outline-2 focus-visible:outline-teal-600"
        }
      >
        <CategorySymbol name={name} icon={value} color={color} />
        {creation && <span>Icono</span>}
      </button>
      <dialog
        ref={dialog}
        aria-label={`Icono de ${name || "nueva categoría"}`}
        className="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-sm overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-xl backdrop:bg-slate-900/30"
      >
        <h3 className="mb-4 font-semibold">Elegí un icono y un color</h3>
        <div
          aria-label="Iconos disponibles"
          className="product-filter-options grid max-h-64 grid-cols-3 gap-2 overflow-y-auto overscroll-contain p-1"
        >
          {CATEGORY_ICONS.map((icon) => (
            <button
              key={icon}
              type="button"
              disabled={disabled}
              aria-label={`Icono ${iconLabels[icon]}`}
              aria-pressed={draftIcon === icon}
              onClick={() => setDraftIcon(icon)}
              className={`flex flex-col items-center gap-1 rounded-lg p-1 text-[10px] hover:bg-teal-50 ${draftIcon === icon ? "ring-1 ring-teal-500" : ""}`}
            >
              <CategorySymbol name={name} icon={icon} color={draftColor} />
              {iconLabels[icon]}
            </button>
          ))}
        </div>
        <fieldset className="mt-4 border-t border-slate-100 pt-3">
          <legend className="text-xs font-semibold text-slate-600">
            Color
          </legend>
          <div className="grid grid-cols-8 gap-1.5 pt-2">
            {CATEGORY_COLORS.map((tone) => (
              <button
                key={tone}
                type="button"
                disabled={disabled}
                aria-label={`Color ${colorLabels[tone]}`}
                title={colorLabels[tone]}
                aria-pressed={draftColor === tone}
                onClick={() => setDraftColor(tone)}
                className={`grid h-9 min-w-0 place-items-center rounded-md text-white transition-shadow focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-800 ${colorSwatches[tone]} ${draftColor === tone ? "ring-2 ring-slate-700 ring-offset-2" : "hover:ring-2 hover:ring-slate-300 hover:ring-offset-1"}`}
              >
                <span
                  aria-hidden="true"
                  className="text-base font-bold drop-shadow"
                >
                  {draftColor === tone ? "✓" : ""}
                </span>
              </button>
            ))}
          </div>
        </fieldset>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              onChange(draftIcon, draftColor);
              dialog.current?.close();
            }}
            className="flex-1 rounded-lg bg-teal-700 p-2 text-sm font-semibold text-white"
          >
            Aplicar
          </button>
          <button
            type="button"
            onClick={() => dialog.current?.close()}
            className="flex-1 rounded-lg border border-slate-200 p-2 text-sm"
          >
            Cancelar
          </button>
        </div>
      </dialog>
    </>
  );
}

function LaboratoryLogo({
  item,
  token,
  organizationId,
  onSaved,
}: {
  item: CatalogNamedOption;
  token: string;
  organizationId: string;
  onSaved: () => Promise<void>;
}) {
  const [image, setImage] = useState<{ key: string; url: string }>();
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const key = `${organizationId}:${item.id}:${item.logoUpdatedAt ?? ""}:${token}`;
  const src = image?.key === key ? image.url : undefined;
  useEffect(() => {
    if (!item.logoUpdatedAt) return;
    const controller = new AbortController();
    void laboratoryLogo(
      token,
      organizationId,
      item.id,
      undefined,
      controller.signal,
    )
      .then((url) => {
        if (url && !controller.signal.aborted) {
          setImage({ key, url });
          setFailed(false);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => controller.abort();
  }, [token, organizationId, item.id, item.logoUpdatedAt, key]);
  return (
    <>
      <button
        type="button"
        title={
          failed
            ? "No se pudo cargar el logo; podés reemplazarlo"
            : "Subir o cambiar logo"
        }
        aria-label={`Logo de ${item.name}: subir o cambiar`}
        onClick={() => setOpen(true)}
        className="group relative grid size-12 shrink-0 place-items-center overflow-hidden rounded-xl border border-slate-200 bg-white text-teal-700 hover:border-teal-400 focus-visible:outline-2 focus-visible:outline-teal-600"
      >
        {src ? (
          <img
            src={src}
            alt={`Logo de ${item.name}`}
            className="size-full object-contain p-1"
          />
        ) : (
          <span className="text-sm font-bold">
            {item.name.slice(0, 2).toUpperCase()}
          </span>
        )}
        <ImagePlus
          size={13}
          className="absolute bottom-0 right-0 rounded-tl bg-teal-50 text-teal-700"
        />
      </button>
      {open && (
        <ProductImageDialog
          laboratory
          name={`Logo · ${item.name}`}
          existing={src}
          hasExisting={Boolean(item.logoUpdatedAt)}
          immediate
          onBusy={() => {}}
          onClose={() => setOpen(false)}
          onCommit={async (value) => {
            if (value === undefined) return;
            await laboratoryLogo(token, organizationId, item.id, value);
            await onSaved();
          }}
        />
      )}
    </>
  );
}

type Kind = "categories" | "laboratories";
export function CatalogOptionsManager({
  token,
  organizationId,
  onError,
}: {
  token: string;
  organizationId: string;
  onError: (message: string) => void;
}) {
  const [options, setOptions] = useState<CatalogOptions>();
  const [tab, setTab] = useState<Kind>("categories");
  const [parentId, setParentId] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const creationInput = useRef<HTMLInputElement>(null);
  const [loadError, setLoadError] = useState("");
  const [reload, setReload] = useState(0);
  const [categoryIcon, setCategoryIcon] = useState<CategoryIcon>("auto");
  const [categoryColor, setCategoryColor] = useState<CategoryColor>("auto");
  const [names, setNames] = useState({ categories: "", laboratories: "" });
  const [search, setSearch] = useState({ categories: "", laboratories: "" });
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [action, setAction] = useState<{
    type: Kind;
    id: string;
    name: string;
    mode: "edit" | "delete";
    parentId?: string | null;
  }>();
  const load = async () =>
    setOptions(await getCatalogOptions(token, organizationId));
  useEffect(() => {
    let active = true;
    void getCatalogOptions(token, organizationId)
      .then((result) => {
        if (active) {
          setOptions(result);
          setLoadError("");
        }
      })
      .catch((error: unknown) => {
        if (active)
          setLoadError(
            error instanceof Error
              ? error.message
              : "No se pudieron cargar las opciones.",
          );
      });
    return () => {
      active = false;
    };
  }, [token, organizationId, reload]);
  async function create(type: Kind) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      await createCatalogNamedItem(
        token,
        organizationId,
        type,
        names[type].trim(),
        type === "categories" ? categoryIcon : undefined,
        type === "categories" ? categoryColor : undefined,
        type === "categories" ? parentId || null : undefined,
      );
      setNames((current) => ({ ...current, [type]: "" }));
      if (type === "categories") {
        setExpanded((current) => new Set([...current, parentId]));
        setCategoryIcon("auto");
        setCategoryColor("auto");
      }
      await load();
    } catch (error) {
      onError(error instanceof Error ? error.message : "No se pudo guardar.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="min-w-0 rounded-2xl border border-slate-200 bg-white shadow-sm">
      <nav
        aria-label="Administrar catálogo"
        className="mx-5 flex gap-6 border-b border-slate-200 pt-5"
        role="tablist"
      >
        {(["categories", "laboratories"] as const).map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            aria-controls={`catalog-${key}`}
            id={`catalog-tab-${key}`}
            onClick={() => setTab(key)}
            className={`flex items-center gap-2 border-b-2 px-1 pb-3 text-sm ${tab === key ? "border-teal-600 font-semibold text-teal-700" : "border-transparent text-slate-500 hover:text-slate-800"}`}
          >
            {key === "categories" ? (
              <FolderTree size={17} />
            ) : (
              <FlaskConical size={17} />
            )}
            {key === "categories" ? "Categorías" : "Laboratorios"}
            {options && (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">
                {key === "categories"
                  ? options.categories.filter((item) => !item.parentId).length
                  : options[key].length}
              </span>
            )}
          </button>
        ))}
      </nav>
      {loadError && (
        <div
          role="alert"
          className="col-span-full rounded-xl bg-rose-50 p-4 text-sm text-rose-700"
        >
          {loadError}
          <button
            type="button"
            className="ml-3 underline"
            onClick={() => {
              setLoadError("");
              setReload((v) => v + 1);
            }}
          >
            Reintentar
          </button>
        </div>
      )}
      {action && (
        <CatalogItemDialog
          editTitle={
            action.type === "categories"
              ? "Editar categoría"
              : "Editar laboratorio"
          }
          name={action.name}
          mode={action.mode}
          onClose={() => setAction(undefined)}
          onSave={async (name) => {
            await changeCatalogNamedItem(
              token,
              organizationId,
              action.type,
              action.id,
              name,
              action.type === "categories"
                ? (action.parentId ?? null)
                : undefined,
            );
            setAction(undefined);
            await load();
          }}
        >
          {action.type === "categories" && (
            <label className="mt-4 block text-sm text-slate-600">
              Categoría superior
              <select
                aria-label="Categoría superior"
                value={action.parentId ?? ""}
                onChange={(event) =>
                  setAction({ ...action, parentId: event.target.value || null })
                }
                className="mt-2 h-11 w-full rounded-lg border border-slate-200 px-3 text-sm"
              >
                <option value="">Ninguna · categoría principal</option>
                {options?.categories
                  .filter(
                    (item) =>
                      !categoryBranch(options.categories, action.id).has(
                        item.id,
                      ),
                  )
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.path ?? item.name}
                    </option>
                  ))}
              </select>
            </label>
          )}
        </CatalogItemDialog>
      )}
      {[tab].map((type) => {
        const category = type === "categories";
        const title = category ? "Categorías" : "Laboratorios";
        const noun = category ? "categoría" : "laboratorio";
        const items = options?.[type];
        const primaryCount = category
          ? items?.filter((item) => !item.parentId).length
          : undefined;
        const visible = category
          ? visibleCategoryTree(items ?? [], expanded, search[type])
          : items
              ?.filter((item) =>
                item.name
                  .toLocaleLowerCase("es")
                  .includes(search[type].toLocaleLowerCase("es")),
              )
              .map((item) => ({ ...item, depth: 0, hasChildren: false }));
        const Icon = category ? Tag : FlaskConical;
        return (
          <section
            key={type}
            role="tabpanel"
            id={`catalog-${type}`}
            aria-labelledby={`catalog-tab-${type}`}
            className="min-w-0 p-4 sm:p-5"
          >
            <header className="mb-5 flex items-center gap-3">
              <span className="grid size-11 place-items-center rounded-xl bg-teal-50 text-teal-700">
                <Icon size={23} />
              </span>
              <div>
                <h2 className="text-base font-bold text-slate-900">{title}</h2>
              </div>
              <span className="ml-auto rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                {category && primaryCount !== undefined
                  ? `${primaryCount} principales`
                  : (items?.length ?? "—")}
              </span>
            </header>
            <form
              className="mb-4 flex flex-wrap gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                void create(type);
              }}
            >
              <input
                ref={creationInput}
                aria-label={category ? "Nueva categoría" : "Nuevo laboratorio"}
                placeholder={
                  category ? "Nueva categoría…" : "Nuevo laboratorio…"
                }
                required
                minLength={2}
                maxLength={120}
                value={names[type]}
                onChange={(event) => {
                  const value = event.target.value;
                  setNames((current) => ({
                    ...current,
                    [type]: value,
                  }));
                }}
                className="h-10 min-w-0 flex-[1_1_180px] rounded-lg border border-slate-200 px-3 text-sm"
              />
              {category && (
                <select
                  aria-label="Crear dentro de"
                  value={parentId}
                  onChange={(event) => setParentId(event.target.value)}
                  disabled={busy}
                  className="h-10 min-w-0 max-w-full flex-[1_1_100%] rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-600 sm:flex-[0_1_280px]"
                >
                  <option value="">Categoría principal</option>
                  {options?.categories.map((item) => (
                    <option key={item.id} value={item.id}>
                      Dentro de {item.path ?? item.name}
                    </option>
                  ))}
                </select>
              )}
              {category && (
                <CategoryIconPicker
                  creation
                  name={names.categories}
                  value={categoryIcon}
                  color={categoryColor}
                  onChange={(icon, color) => {
                    setCategoryIcon(icon);
                    setCategoryColor(color);
                  }}
                  disabled={busy}
                />
              )}
              <button
                disabled={busy || names[type].trim().length < 2}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-teal-700 px-4 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
              >
                <Plus size={15} />
                Crear {category && parentId ? "subcategoría" : noun}
              </button>
            </form>
            <label className="mb-3 flex items-center gap-2 rounded-lg bg-slate-50 px-3 text-slate-400">
              <Search size={15} />
              <input
                aria-label={`Buscar ${title.toLowerCase()}`}
                placeholder={`Buscar ${title.toLowerCase()}…`}
                value={search[type]}
                onChange={(event) => {
                  const value = event.target.value;
                  setSearch((current) => ({
                    ...current,
                    [type]: value,
                  }));
                }}
                className="h-9 w-full min-w-0 border-0 bg-transparent text-xs shadow-none outline-none"
              />
            </label>
            <ul className="product-filter-options max-h-[65vh] min-h-64 space-y-2 overflow-y-auto pr-1">
              {visible?.map((item) => (
                <li
                  key={item.id}
                  style={
                    category
                      ? { marginLeft: Math.min(item.depth * 20, 100) }
                      : undefined
                  }
                  className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-100 bg-white p-3 transition-colors hover:border-teal-200 sm:flex-nowrap sm:gap-3"
                >
                  {category &&
                    (item.hasChildren ? (
                      <button
                        type="button"
                        aria-label={`${expanded.has(item.id) ? "Contraer" : "Expandir"} ${item.name}`}
                        aria-expanded={expanded.has(item.id)}
                        onClick={() =>
                          setExpanded((current) => {
                            const next = new Set(current);
                            if (next.has(item.id)) next.delete(item.id);
                            else next.add(item.id);
                            return next;
                          })
                        }
                        className="grid size-7 shrink-0 place-items-center rounded-md text-slate-500 hover:bg-slate-100"
                      >
                        {expanded.has(item.id) ? (
                          <ChevronDown size={16} />
                        ) : (
                          <ChevronRight size={16} />
                        )}
                      </button>
                    ) : (
                      <span className="w-7 shrink-0" />
                    ))}
                  {category ? (
                    <CategoryIconPicker
                      name={item.name}
                      value={item.icon ?? "auto"}
                      color={item.color ?? "auto"}
                      disabled={busy}
                      onChange={(icon, color) => {
                        if (lock.current) return;
                        lock.current = true;
                        setBusy(true);
                        void updateCategoryIcon(
                          token,
                          organizationId,
                          item.id,
                          icon,
                          color,
                        )
                          .then(() =>
                            setOptions((current) =>
                              current
                                ? {
                                    ...current,
                                    categories: current.categories.map((row) =>
                                      row.id === item.id
                                        ? { ...row, icon, color }
                                        : row,
                                    ),
                                  }
                                : current,
                            ),
                          )
                          .catch((error: unknown) =>
                            onError(
                              error instanceof Error
                                ? error.message
                                : "No se pudo guardar el icono.",
                            ),
                          )
                          .finally(() => {
                            lock.current = false;
                            setBusy(false);
                          });
                      }}
                    />
                  ) : (
                    <LaboratoryLogo
                      key={item.id}
                      item={item}
                      token={token}
                      organizationId={organizationId}
                      onSaved={load}
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-sm font-semibold text-slate-800">
                      {item.name}
                    </p>
                    {category && search.categories && item.parentId && (
                      <p className="text-[11px] text-slate-400">{item.path}</p>
                    )}
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      {item._count
                        ? item._count.products === 0
                          ? "Sin productos"
                          : `${item._count.products.toLocaleString("es-AR")} productos`
                        : ""}
                    </p>
                  </div>
                  <div className="flex w-full shrink-0 justify-end gap-1.5 sm:w-auto">
                    {category && (
                      <button
                        type="button"
                        disabled={busy}
                        title="Agregar subcategoría"
                        aria-label={`Agregar subcategoría a ${item.name}`}
                        onClick={() => {
                          setParentId(item.id);
                          creationInput.current?.focus();
                        }}
                        className="rounded-lg p-2 text-teal-700 hover:bg-teal-50"
                      >
                        <Plus size={16} />
                      </button>
                    )}
                    <button
                      type="button"
                      aria-label={`Editar ${noun} ${item.name}`}
                      title="Editar nombre"
                      onClick={() => setAction({ ...item, type, mode: "edit" })}
                      className="rounded-lg bg-teal-50 p-2 text-teal-700 hover:bg-teal-100"
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      type="button"
                      aria-label={`Eliminar ${noun} ${item.name}`}
                      title="Eliminar"
                      onClick={() =>
                        setAction({ ...item, type, mode: "delete" })
                      }
                      className="rounded-lg bg-rose-50 p-2 text-rose-500 hover:bg-rose-100"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            {!options && !loadError ? (
              <p
                role="status"
                className="py-8 text-center text-sm text-slate-500"
              >
                Cargando…
              </p>
            ) : !visible?.length ? (
              <div className="py-8 text-center text-sm text-slate-500">
                <Box size={24} className="mx-auto mb-2 text-slate-300" />
                {items?.length
                  ? "No hay coincidencias."
                  : `Todavía no hay ${title.toLowerCase()}.`}
              </div>
            ) : null}
            <footer className="mt-4 flex flex-wrap justify-between gap-2 border-t border-slate-100 pt-3 text-[11px] text-slate-500">
              <span>
                {category && primaryCount !== undefined
                  ? `${primaryCount} categorías principales · ${(items?.length ?? 0) - primaryCount} subcategorías`
                  : `Mostrando ${visible?.length ?? 0} de ${items?.length ?? 0}`}
              </span>
            </footer>
          </section>
        );
      })}
    </div>
  );
}
