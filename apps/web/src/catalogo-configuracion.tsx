import { useEffect, useId, useState, type FormEvent } from "react";
import { Building2, Copy, ExternalLink, Save, Tags } from "lucide-react";

import { getPriceLists, type PriceList } from "./lib/api";
import {
  getConfiguracionCatalogo,
  guardarConfiguracionCatalogo,
  type ConfiguracionCatalogo,
} from "./lib/catalogo-online-api";
import { direccionDelCatalogo, SITIO_CATALOGO } from "./lib/catalogo-online";
import { ProductFilterSelect } from "./product-filter-select";

const campo =
  "mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm";

/** Switch con texto y ayuda, para las opciones del catálogo. */
export function Interruptor({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-100 py-3 last:border-b-0">
      <label htmlFor={id} className="min-w-0 cursor-pointer">
        <span className="block text-sm font-medium text-slate-800">
          {label}
        </span>
        <span className="block text-xs text-slate-500">{hint}</span>
      </label>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
          checked ? "bg-teal-600" : "bg-slate-300"
        }`}
      >
        <span
          className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-all ${
            checked ? "left-[22px]" : "left-0.5"
          }`}
        />
      </button>
    </div>
  );
}

/** Configuración de la página pública del catálogo (SISTEMA-107). */
export function CatalogoConfiguracion({
  token,
  organizationId,
  branches,
  onError,
}: {
  token: string;
  organizationId: string;
  branches: { id: string; name: string }[];
  onError: (message: string) => void;
}) {
  const [datos, setDatos] = useState<ConfiguracionCatalogo>();
  const [listas, setListas] = useState<PriceList[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState("");

  useEffect(() => {
    const falla = (cause: unknown) =>
      onError(cause instanceof Error ? cause.message : String(cause));
    void getConfiguracionCatalogo(token, organizationId)
      .then(setDatos)
      .catch(falla);
    void getPriceLists(token, organizationId).then(setListas).catch(falla);
  }, [token, organizationId, onError]);

  if (!datos)
    return (
      <p className="p-6 text-sm text-slate-500">Cargando configuración…</p>
    );

  const cambiar = <K extends keyof ConfiguracionCatalogo>(
    clave: K,
    valor: ConfiguracionCatalogo[K],
  ) => {
    setAviso("");
    setDatos({ ...datos, [clave]: valor });
  };
  const direccion = direccionDelCatalogo(SITIO_CATALOGO, datos.slug);

  const guardar = async (event: FormEvent) => {
    event.preventDefault();
    setGuardando(true);
    try {
      setDatos(
        await guardarConfiguracionCatalogo(token, organizationId, {
          slug: datos.slug,
          branchId: datos.branchId,
          published: datos.published,
          displayName: datos.displayName,
          requireLogin: datos.requireLogin,
          showPricesPublic: datos.showPricesPublic,
          showOutOfStock: datos.showOutOfStock,
          priceListId: datos.priceListId,
          pickupEnabled: datos.pickupEnabled,
          deliveryEnabled: datos.deliveryEnabled,
          deductStockOnDelivery: datos.deductStockOnDelivery,
        }),
      );
      setAviso("Configuración guardada.");
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <form
      onSubmit={(event) => void guardar(event)}
      className="mx-auto flex w-full max-w-4xl flex-col gap-4 overflow-auto"
    >
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-800">
            Link para tus clientes
          </p>
          <p className="truncate font-mono text-sm text-slate-600">
            {direccion}
          </p>
          {!datos.exists ? (
            <p className="text-xs text-amber-700">
              Guardá la configuración para crear el catálogo.
            </p>
          ) : null}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={!datos.exists}
            onClick={() => void navigator.clipboard?.writeText(direccion)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-50"
          >
            <Copy size={15} aria-hidden /> Copiar
          </button>
          <a
            href={datos.exists ? direccion : undefined}
            target="_blank"
            rel="noreferrer"
            aria-disabled={!datos.exists}
            className={`inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50 ${
              datos.exists ? "" : "pointer-events-none opacity-50"
            }`}
          >
            <ExternalLink size={15} aria-hidden /> Abrir
          </a>
        </div>
      </section>

      <section className="grid gap-x-8 rounded-xl border border-slate-200 bg-white p-4 md:grid-cols-2">
        <div>
          <Interruptor
            label="Catálogo publicado"
            hint="Apagado, la dirección muestra que el catálogo no está disponible."
            checked={datos.published}
            onChange={(v) => cambiar("published", v)}
          />
          <Interruptor
            label="Mostrar productos sin stock"
            hint="Apagado, sólo se ven los que tienen stock en la sucursal elegida."
            checked={datos.showOutOfStock}
            onChange={(v) => cambiar("showOutOfStock", v)}
          />
          <Interruptor
            label="Mostrar precios sin iniciar sesión"
            hint="Apagado, los precios se ven sólo al ingresar con usuario."
            checked={datos.showPricesPublic}
            onChange={(v) => cambiar("showPricesPublic", v)}
          />
        </div>
        <div>
          <Interruptor
            label="Ingreso sólo con usuario y contraseña"
            hint="Nadie ve el catálogo sin ingresar."
            checked={datos.requireLogin}
            onChange={(v) => cambiar("requireLogin", v)}
          />
          <Interruptor
            label="Retiro en la farmacia"
            hint="El cliente pasa a buscar el pedido."
            checked={datos.pickupEnabled}
            onChange={(v) => cambiar("pickupEnabled", v)}
          />
          <Interruptor
            label="Envío a domicilio"
            hint="El cliente escribe la dirección de entrega."
            checked={datos.deliveryEnabled}
            onChange={(v) => cambiar("deliveryEnabled", v)}
          />
          <Interruptor
            label="Descontar stock al entregar"
            hint="Al marcar un pedido entregado se descuenta su stock de la sucursal."
            checked={datos.deductStockOnDelivery}
            onChange={(v) => cambiar("deductStockOnDelivery", v)}
          />
        </div>
      </section>

      <section className="grid gap-4 rounded-xl border border-slate-200 bg-white p-4 md:grid-cols-2">
        <label className="text-sm font-medium text-slate-700">
          Nombre que ve el cliente
          <input
            className={campo}
            value={datos.displayName}
            maxLength={80}
            required
            onChange={(event) => cambiar("displayName", event.target.value)}
          />
        </label>
        <label className="text-sm font-medium text-slate-700">
          Final del link
          <input
            className={`${campo} font-mono`}
            value={datos.slug}
            maxLength={60}
            required
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
            title="Minúsculas, números y guiones"
            onChange={(event) =>
              cambiar("slug", event.target.value.toLowerCase())
            }
          />
        </label>
        <div className="text-sm font-medium text-slate-700">
          Sucursal
          <span className="block text-xs font-normal text-slate-500">
            De ella sale el stock y a ella llegan los pedidos.
          </span>
          <div className="mt-1">
            <ProductFilterSelect
              label="Sucursal"
              value={datos.branchId}
              icon={<Building2 size={16} aria-hidden />}
              options={branches.map((b) => ({ value: b.id, label: b.name }))}
              onChange={(v) => cambiar("branchId", v)}
            />
          </div>
        </div>
        <div className="text-sm font-medium text-slate-700">
          Lista de precios
          <span className="block text-xs font-normal text-slate-500">
            La de quien no ingresó. Un cliente con lista propia ve la suya.
          </span>
          <div className="mt-1">
            <ProductFilterSelect
              label="Lista de precios"
              value={datos.priceListId ?? ""}
              icon={<Tags size={16} aria-hidden />}
              options={[
                { value: "", label: "Precio general" },
                ...listas
                  .filter((l) => l.name !== "Precio general")
                  .map((l) => ({ value: l.id, label: l.name })),
              ]}
              onChange={(v) => cambiar("priceListId", v || null)}
            />
          </div>
        </div>
      </section>

      <p className="text-xs text-slate-500">
        Los medicamentos que llevan receta no se muestran en el catálogo.
      </p>

      <div className="flex items-center justify-end gap-3">
        {aviso ? (
          <p role="status" className="text-sm text-emerald-700">
            {aviso}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={guardando}
          className="inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
        >
          <Save size={16} aria-hidden /> Guardar
        </button>
      </div>
    </form>
  );
}
