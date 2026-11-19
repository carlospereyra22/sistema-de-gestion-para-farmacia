import { useEffect, useState } from "react";
import {
  CircleDollarSign,
  ClipboardList,
  Package,
  Receipt,
  Store,
  Users,
} from "lucide-react";

import { preventaApi, type ResumenPreventa } from "./lib/preventa-api";
import { diaLocal, mensajeDe, pesos } from "./lib/preventa";
import { Aviso, Indicador, Segmento, Tarjeta } from "./preventa-ui";

type Periodo = "hoy" | "semana" | "mes";
const DESDE: Record<Periodo, number> = { hoy: 0, semana: 6, mes: 29 };

/**
 * Resumen de la preventa (SISTEMA-108): pedidos, ventas, ticket promedio,
 * cobranza, ranking de preventistas y productos más pedidos. El preventista
 * ve sólo lo suyo.
 */
export function PreventaResumen({
  token,
  organizationId,
  administra,
}: {
  token: string;
  organizationId: string;
  administra: boolean;
}) {
  const [periodo, setPeriodo] = useState<Periodo>("semana");
  const [datos, setDatos] = useState<ResumenPreventa | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let vigente = true;
    preventaApi
      .resumen(token, organizationId, diaLocal(DESDE[periodo]), diaLocal(0))
      .then((r) => vigente && (setDatos(r), setError("")))
      .catch((causa) => vigente && setError(mensajeDe(causa)));
    return () => {
      vigente = false;
    };
  }, [token, organizationId, periodo]);

  const maximo = Math.max(
    1,
    ...(datos?.porDia.map((d) => Number(d.totalMinor)) ?? [1]),
  );

  return (
    <div className="grid gap-3">
      <Segmento
        etiqueta="Período"
        valor={periodo}
        onChange={setPeriodo}
        opciones={[
          { id: "hoy", label: "Hoy" },
          { id: "semana", label: "7 días" },
          { id: "mes", label: "30 días" },
        ]}
      />
      {error ? <Aviso tipo="error">{error}</Aviso> : null}
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Indicador
          titulo="Ventas"
          icono={<CircleDollarSign size={14} aria-hidden />}
          valor={pesos(datos?.totalMinor ?? "0")}
          detalle={`${datos?.pedidos ?? 0} pedidos`}
          tono="bien"
        />
        <Indicador
          titulo="Ticket promedio"
          icono={<Receipt size={14} aria-hidden />}
          valor={pesos(datos?.promedioMinor ?? "0")}
          tono="marca"
        />
        <Indicador
          titulo="Clientes"
          icono={<Store size={14} aria-hidden />}
          valor={String(datos?.clientes ?? 0)}
          detalle="con al menos un pedido"
        />
        <Indicador
          titulo="Por cobrar"
          icono={<ClipboardList size={14} aria-hidden />}
          valor={pesos(datos?.porCobrarMinor ?? "0")}
          detalle={`Cobrado ${pesos(datos?.cobradoMinor ?? "0")}`}
          tono="aviso"
        />
      </div>

      {datos?.porDia.length ? (
        <Tarjeta>
          <h3 className="text-sm font-bold text-slate-800">Ventas por día</h3>
          <ul className="mt-3 grid gap-1.5">
            {datos.porDia.map((d) => (
              <li
                key={d.dia}
                className="grid grid-cols-[3.5rem_1fr_auto] items-center gap-2 text-xs"
              >
                <span className="text-slate-500">
                  {d.dia.slice(8, 10)}/{d.dia.slice(5, 7)}
                </span>
                <span className="h-3 overflow-hidden rounded-full bg-slate-100">
                  <span
                    className="block h-full rounded-full bg-teal-600"
                    style={{
                      width: `${Math.max(3, (Number(d.totalMinor) / maximo) * 100)}%`,
                    }}
                  />
                </span>
                <span className="w-28 text-right font-semibold tabular-nums text-slate-800">
                  {pesos(d.totalMinor)}
                </span>
              </li>
            ))}
          </ul>
        </Tarjeta>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-2">
        {administra ? (
          <Tarjeta>
            <h3 className="flex items-center gap-1.5 text-sm font-bold text-slate-800">
              <Users size={16} aria-hidden /> Preventistas
            </h3>
            {datos?.porVendedor.length ? (
              <ol className="mt-2 divide-y divide-slate-100">
                {datos.porVendedor.map((v, i) => (
                  <li
                    key={v.sellerId}
                    className="flex items-center gap-3 py-2 text-sm"
                  >
                    <span className="grid size-7 place-items-center rounded-full bg-slate-100 text-xs font-bold text-slate-600">
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold text-slate-900">
                        {v.sellerName}
                      </span>
                      <span className="block text-xs text-slate-500">
                        {v.pedidos} pedidos · {v.clientes} clientes
                      </span>
                    </span>
                    <span className="font-bold tabular-nums text-emerald-700">
                      {pesos(v.totalMinor)}
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-2 text-sm text-slate-500">
                Sin pedidos en el período.
              </p>
            )}
          </Tarjeta>
        ) : null}
        <Tarjeta>
          <h3 className="flex items-center gap-1.5 text-sm font-bold text-slate-800">
            <Package size={16} aria-hidden /> Productos más pedidos
          </h3>
          {datos?.productos.length ? (
            <ol className="mt-2 divide-y divide-slate-100">
              {datos.productos.map((p) => (
                <li
                  key={p.productId}
                  className="flex items-center gap-3 py-2 text-sm"
                >
                  <span className="min-w-0 flex-1 truncate text-slate-900">
                    {p.productName}
                  </span>
                  <span className="text-xs text-slate-500">
                    {p.cantidad} u.
                  </span>
                  <span className="w-28 text-right font-semibold tabular-nums text-slate-800">
                    {pesos(p.totalMinor)}
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-2 text-sm text-slate-500">
              Sin pedidos en el período.
            </p>
          )}
        </Tarjeta>
      </div>
    </div>
  );
}
