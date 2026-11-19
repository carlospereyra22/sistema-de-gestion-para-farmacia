import { useEffect, useState } from "react";
import { Building2, Percent, Save, Truck, UserRound } from "lucide-react";

import {
  preventaApi,
  type ConfiguracionPreventa,
  type EfectoEntrega,
  type MiembroEquipo,
} from "./lib/preventa-api";
import { EFECTOS, bpsATexto, mensajeDe, porcentajeABps } from "./lib/preventa";
import { ProductFilterSelect } from "./product-filter-select";
import {
  Aviso,
  Interruptor,
  Pastilla,
  Tarjeta,
  botonPrimario,
  botonSecundario,
  campo,
} from "./preventa-ui";

/**
 * Configuración de la preventa (SISTEMA-108): qué hace la entrega (nada,
 * stock o venta), qué puede hacer el preventista y la comisión de cada uno.
 */
export function PreventaConfiguracion({
  token,
  organizationId,
  branches,
  onGuardada,
}: {
  token: string;
  organizationId: string;
  branches: { id: string; name: string }[];
  onGuardada: () => void;
}) {
  const [datos, setDatos] = useState<ConfiguracionPreventa | null>(null);
  const [equipo, setEquipo] = useState<MiembroEquipo[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");

  useEffect(() => {
    Promise.all([
      preventaApi.configuracion(token, organizationId),
      preventaApi.equipo(token, organizationId),
    ])
      .then(([configuracion, miembros]) => {
        setDatos(configuracion);
        setEquipo(miembros);
      })
      .catch((causa) => setError(mensajeDe(causa)));
  }, [token, organizationId]);

  if (!datos) return error ? <Aviso tipo="error">{error}</Aviso> : null;

  const cambiar = <K extends keyof ConfiguracionPreventa>(
    clave: K,
    valor: ConfiguracionPreventa[K],
  ) => {
    setAviso("");
    setDatos((d) => (d ? { ...d, [clave]: valor } : d));
  };

  const guardar = async () => {
    setGuardando(true);
    setError("");
    try {
      const guardada = await preventaApi.guardarConfiguracion(
        token,
        organizationId,
        {
          branchId: datos.branchId,
          deliveryEffect: datos.deliveryEffect,
          sellerCanChangePrice: datos.sellerCanChangePrice,
          sellerSeesAllCustomers: datos.sellerSeesAllCustomers,
          showStock: datos.showStock,
          allowOutOfStock: datos.allowOutOfStock,
          applyOffers: datos.applyOffers,
          receiptNote: datos.receiptNote,
        },
      );
      setDatos(guardada);
      setAviso("Configuración guardada.");
      onGuardada();
    } catch (causa) {
      setError(mensajeDe(causa));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <div className="grid content-start gap-4">
        {!datos.exists ? (
          <Aviso tipo="info">
            La preventa todavía no se configuró: revisá estas opciones y guardá.
          </Aviso>
        ) : null}
        <Tarjeta>
          <h3 className="text-sm font-bold text-slate-800">
            Al entregar un pedido
          </h3>
          <p className="text-xs text-slate-500">
            Elegí qué toca la entrega. Se aplica a los pedidos que se entreguen
            desde ahora.
          </p>
          <div
            role="radiogroup"
            aria-label="Al entregar un pedido"
            className="mt-3 grid gap-2"
          >
            {(Object.keys(EFECTOS) as EfectoEntrega[]).map((efecto) => (
              <button
                key={efecto}
                type="button"
                role="radio"
                aria-checked={datos.deliveryEffect === efecto}
                onClick={() => cambiar("deliveryEffect", efecto)}
                className={`rounded-xl border p-3 text-left ${
                  datos.deliveryEffect === efecto
                    ? "border-teal-600 bg-teal-50 ring-1 ring-teal-200"
                    : "border-slate-200 bg-white hover:bg-slate-50"
                }`}
              >
                <span className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <span
                    className={`size-4 rounded-full border-2 ${
                      datos.deliveryEffect === efecto
                        ? "border-teal-600 bg-teal-600 ring-2 ring-inset ring-white"
                        : "border-slate-300"
                    }`}
                    aria-hidden
                  />
                  {EFECTOS[efecto].label}
                </span>
                <span className="mt-1 block text-xs text-slate-600">
                  {EFECTOS[efecto].detalle}
                </span>
              </button>
            ))}
          </div>
          <div className="mt-3 text-sm font-medium text-slate-700">
            Sucursal
            <span className="block text-xs font-normal text-slate-500">
              De ella sale el stock y en ella se registran las ventas.
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
        </Tarjeta>

        <Tarjeta>
          <h3 className="text-sm font-bold text-slate-800">El preventista</h3>
          <div className="mt-1 divide-y divide-slate-100">
            <Interruptor
              label="Puede bajar precios"
              hint="Pone un precio especial por producto (nunca más caro que la lista)."
              checked={datos.sellerCanChangePrice}
              onChange={(v) => cambiar("sellerCanChangePrice", v)}
            />
            <Interruptor
              label="Ve todos los clientes"
              hint="Apagado, cada preventista ve sólo los de su cartera."
              checked={datos.sellerSeesAllCustomers}
              onChange={(v) => cambiar("sellerSeesAllCustomers", v)}
            />
            <Interruptor
              label="Ve el stock"
              hint="Cuántas unidades hay en la sucursal."
              checked={datos.showStock}
              onChange={(v) => cambiar("showStock", v)}
            />
            <Interruptor
              label="Puede pedir sin stock"
              hint="La farmacia consigue lo que falta antes de entregar."
              checked={datos.allowOutOfStock}
              onChange={(v) => cambiar("allowOutOfStock", v)}
            />
            <Interruptor
              label="Aplicar ofertas"
              hint="Las ofertas de mostrador valen también en los pedidos."
              checked={datos.applyOffers}
              onChange={(v) => cambiar("applyOffers", v)}
            />
          </div>
          <label className="mt-2 block text-sm font-medium text-slate-700">
            Pie del comprobante
            <input
              className={campo}
              maxLength={300}
              value={datos.receiptNote ?? ""}
              onChange={(e) => cambiar("receiptNote", e.target.value || null)}
              placeholder="Ej.: Gracias por su compra. Consultas al 351 555-1234"
            />
          </label>
        </Tarjeta>
        {error ? <Aviso tipo="error">{error}</Aviso> : null}
        {aviso ? <Aviso tipo="bien">{aviso}</Aviso> : null}
        <button
          type="button"
          className={`${botonPrimario} justify-self-end`}
          disabled={guardando}
          onClick={() => void guardar()}
        >
          <Save size={16} aria-hidden />{" "}
          {guardando ? "Guardando…" : "Guardar configuración"}
        </button>
      </div>

      <Tarjeta className="content-start">
        <h3 className="text-sm font-bold text-slate-800">Equipo</h3>
        <p className="text-xs text-slate-500">
          Usuarios con el rol Preventista o Repartidor. Los roles se asignan en
          Administración → Usuarios.
        </p>
        {!equipo.length ? (
          <p className="mt-3 text-sm text-slate-500">
            Todavía no hay nadie con esos roles.
          </p>
        ) : null}
        <ul className="mt-2 divide-y divide-slate-100">
          {equipo.map((miembro) => (
            <MiembroFila
              key={miembro.userId}
              miembro={miembro}
              onGuardar={async (bps) => {
                const r = await preventaApi.comisionDelVendedor(
                  token,
                  organizationId,
                  miembro.userId,
                  bps,
                );
                setEquipo((lista) =>
                  lista.map((m) =>
                    m.userId === miembro.userId
                      ? { ...m, commissionRateBps: r.commissionRateBps }
                      : m,
                  ),
                );
              }}
            />
          ))}
        </ul>
      </Tarjeta>
    </div>
  );
}

function MiembroFila({
  miembro,
  onGuardar,
}: {
  miembro: MiembroEquipo;
  onGuardar: (bps: number) => Promise<void>;
}) {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(
    String((miembro.commissionRateBps ?? 0) / 100).replace(".", ","),
  );
  const [error, setError] = useState("");
  const bps = porcentajeABps(texto);
  return (
    <li className="py-3">
      <div className="flex items-center gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-600">
          <UserRound size={16} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-900">
            {miembro.name}
          </p>
          <div className="mt-0.5 flex flex-wrap gap-1">
            {miembro.vende ? (
              <Pastilla tono="marca">Preventista</Pastilla>
            ) : null}
            {miembro.reparte ? (
              <Pastilla tono="info">
                <Truck size={10} aria-hidden /> Repartidor
              </Pastilla>
            ) : null}
          </div>
        </div>
        {miembro.vende && !editando ? (
          <button
            type="button"
            className={`${botonSecundario} min-h-9 px-3`}
            onClick={() => setEditando(true)}
          >
            Comisión {bpsATexto(miembro.commissionRateBps ?? 0)}
          </button>
        ) : null}
      </div>
      {editando ? (
        <div className="mt-2 flex items-center gap-2">
          <span className="relative flex-1">
            <input
              className={`${campo} mt-0 pr-9`}
              inputMode="decimal"
              aria-label={`Comisión de ${miembro.name}`}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
            />
            <Percent
              size={14}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
              aria-hidden
            />
          </span>
          <button
            type="button"
            className={botonSecundario}
            onClick={() => setEditando(false)}
          >
            Cancelar
          </button>
          <button
            type="button"
            className={botonPrimario}
            disabled={bps === null}
            onClick={async () => {
              if (bps === null) return;
              try {
                await onGuardar(bps);
                setEditando(false);
                setError("");
              } catch (causa) {
                setError(mensajeDe(causa));
              }
            }}
          >
            Guardar
          </button>
        </div>
      ) : null}
      {error ? <p className="mt-1 text-xs text-rose-700">{error}</p> : null}
    </li>
  );
}
