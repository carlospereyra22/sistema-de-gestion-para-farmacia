import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  ChevronDown,
  HandCoins,
  Percent,
  RefreshCw,
} from "lucide-react";

import {
  preventaApi,
  type ComisionesPreventa,
  type ContextoPreventa,
} from "./lib/preventa-api";
import {
  bpsATexto,
  fecha,
  mensajeDe,
  numeroDePedido,
  pesos,
  porcentajeABps,
} from "./lib/preventa";
import {
  Aviso,
  Hoja,
  Indicador,
  Pastilla,
  Segmento,
  Vacio,
  botonPrimario,
  botonSecundario,
  campo,
} from "./preventa-ui";

/**
 * Comisiones de los preventistas (SISTEMA-108). Cada preventista ve las
 * suyas; quien administra ve todas, cambia el porcentaje de un pedido y
 * registra el pago. El porcentaje sale del preventista hasta que se paga.
 */
export function PreventaComisiones({
  token,
  organizationId,
  contexto,
}: {
  token: string;
  organizationId: string;
  contexto: ContextoPreventa;
}) {
  const [datos, setDatos] = useState<ComisionesPreventa | null>(null);
  const [vista, setVista] = useState<"pendientes" | "pagadas" | "todas">(
    "pendientes",
  );
  const [abierto, setAbierto] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [pagando, setPagando] = useState<
    ComisionesPreventa["vendedores"][number] | null
  >(null);
  const [porcentajeDe, setPorcentajeDe] = useState<{
    orderId: string;
    actual: number;
  } | null>(null);
  const administra = contexto.permisos.administrar;

  const cargar = useCallback(async () => {
    try {
      setDatos(await preventaApi.comisiones(token, organizationId));
      setError("");
    } catch (causa) {
      setError(mensajeDe(causa));
    }
  }, [token, organizationId]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const sinPorcentaje =
    datos?.vendedores.reduce((s, v) => s + v.sinPorcentaje, 0) ?? 0;

  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-2 gap-2">
        <Indicador
          titulo="Pendiente de pago"
          valor={pesos(datos?.pendienteMinor ?? "0")}
          detalle={`${datos?.vendedores.filter((v) => BigInt(v.pendienteMinor) > 0n).length ?? 0} con saldo`}
          tono="bien"
        />
        <Indicador
          titulo="Comisiones pagadas"
          valor={pesos(datos?.pagadoMinor ?? "0")}
          detalle="No suman al pendiente"
          tono="marca"
        />
      </div>
      {sinPorcentaje ? (
        <Aviso tipo="info">
          <AlertCircle size={14} className="mr-1 inline" aria-hidden />
          <strong>
            {sinPorcentaje} pedido{sinPorcentaje === 1 ? "" : "s"} sin
            porcentaje.
          </strong>{" "}
          {administra
            ? "Cargá la comisión del preventista en Configuración → Equipo."
            : "Todavía no suman comisión."}
        </Aviso>
      ) : null}
      {aviso ? <Aviso tipo="bien">{aviso}</Aviso> : null}
      {error ? <Aviso tipo="error">{error}</Aviso> : null}
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <Segmento
            etiqueta="Qué comisiones ver"
            valor={vista}
            onChange={setVista}
            opciones={[
              { id: "pendientes", label: "Pendientes" },
              { id: "pagadas", label: "Pagadas" },
              { id: "todas", label: "Todas" },
            ]}
          />
        </div>
        <button
          type="button"
          aria-label="Actualizar comisiones"
          onClick={() => void cargar()}
          className="grid size-11 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600"
        >
          <RefreshCw size={18} aria-hidden />
        </button>
      </div>
      {datos && !datos.vendedores.length ? (
        <Vacio
          icono={<HandCoins size={22} aria-hidden />}
          titulo="Todavía no hay pedidos entregados"
          detalle="La comisión se calcula sobre los pedidos entregados."
        />
      ) : null}
      <ul className="grid gap-2">
        {datos?.vendedores.map((v) => {
          const pedidos = v.pedidos.filter((p) =>
            vista === "todas"
              ? true
              : vista === "pagadas"
                ? p.pagada
                : !p.pagada,
          );
          const pendientes = v.pedidos.filter((p) => !p.pagada);
          return (
            <li
              key={v.sellerId}
              className="rounded-2xl border border-slate-200 bg-white shadow-sm"
            >
              <button
                type="button"
                onClick={() =>
                  setAbierto(abierto === v.sellerId ? null : v.sellerId)
                }
                aria-expanded={abierto === v.sellerId}
                className="flex w-full items-center gap-3 p-3 text-left"
              >
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-teal-50 text-sm font-bold text-teal-800">
                  {v.sellerName.slice(0, 1).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-slate-900">
                    {v.sellerName}
                  </span>
                  <span className="block text-xs text-slate-500">
                    {v.pedidos.length} pedido{v.pedidos.length === 1 ? "" : "s"}{" "}
                    ·{" "}
                    {v.commissionRateBps
                      ? bpsATexto(v.commissionRateBps)
                      : "sin %"}
                    {v.sinPorcentaje ? (
                      <span className="ml-1 text-amber-700">
                        {v.sinPorcentaje} sin porcentaje
                      </span>
                    ) : null}
                  </span>
                </span>
                <ChevronDown
                  size={18}
                  className={`text-slate-400 transition-transform ${abierto === v.sellerId ? "rotate-180" : ""}`}
                  aria-hidden
                />
              </button>
              <div className="grid grid-cols-2 border-t border-slate-100 px-3 py-2">
                <div>
                  <p className="text-xs text-slate-500">Pendiente de pago</p>
                  <p className="text-base font-bold tabular-nums text-emerald-700">
                    {pesos(v.pendienteMinor)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-500">Ya pagado</p>
                  <p className="text-base font-bold tabular-nums text-teal-800">
                    {pesos(v.pagadoMinor)}
                  </p>
                </div>
              </div>
              {abierto === v.sellerId ? (
                <div className="border-t border-slate-100 p-3">
                  {administra &&
                  pendientes.length &&
                  BigInt(v.pendienteMinor) > 0n ? (
                    <button
                      type="button"
                      className={`${botonPrimario} mb-3 w-full`}
                      onClick={() => setPagando(v)}
                    >
                      <HandCoins size={16} aria-hidden /> Pagar{" "}
                      {pesos(v.pendienteMinor)}
                    </button>
                  ) : null}
                  <ul className="divide-y divide-slate-100">
                    {pedidos.map((p) => (
                      <li
                        key={p.orderId}
                        className="flex items-center gap-2 py-2 text-sm"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium text-slate-900">
                            {p.customerName}
                          </span>
                          <span className="block text-xs text-slate-500">
                            {numeroDePedido(p.number)}
                            {p.deliveredAt
                              ? ` · ${fecha(p.deliveredAt)}`
                              : ""}{" "}
                            · {pesos(p.totalMinor)}
                          </span>
                        </span>
                        {administra && !p.pagada ? (
                          <button
                            type="button"
                            onClick={() =>
                              setPorcentajeDe({
                                orderId: p.orderId,
                                actual: p.rateBps,
                              })
                            }
                            className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-700"
                          >
                            {p.origen === "SIN_PORCENTAJE"
                              ? "Poner %"
                              : bpsATexto(p.rateBps)}
                          </button>
                        ) : (
                          <span className="text-xs text-slate-500">
                            {bpsATexto(p.rateBps)}
                          </span>
                        )}
                        <span className="w-24 text-right font-semibold tabular-nums text-slate-900">
                          {pesos(p.commissionMinor)}
                        </span>
                        {p.pagada ? (
                          <Pastilla tono="bien">Pagada</Pastilla>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      {pagando ? (
        <PagarComision
          vendedor={pagando}
          onClose={() => setPagando(null)}
          onPagar={async (nota, requestId) => {
            await preventaApi.pagarComisiones(token, organizationId, {
              requestId,
              sellerId: pagando.sellerId,
              orderIds: pagando.pedidos
                .filter((p) => !p.pagada)
                .map((p) => p.orderId),
              note: nota || null,
            });
            setAviso(
              `Comisión de ${pagando.sellerName} registrada como pagada.`,
            );
            setPagando(null);
            void cargar();
          }}
        />
      ) : null}
      {porcentajeDe ? (
        <PorcentajeDelPedido
          actual={porcentajeDe.actual}
          onClose={() => setPorcentajeDe(null)}
          onGuardar={async (bps) => {
            try {
              await preventaApi.comisionDelPedido(
                token,
                organizationId,
                porcentajeDe.orderId,
                bps,
              );
              setPorcentajeDe(null);
              void cargar();
            } catch (causa) {
              setError(mensajeDe(causa));
              setPorcentajeDe(null);
            }
          }}
        />
      ) : null}
    </div>
  );
}

function PagarComision({
  vendedor,
  onClose,
  onPagar,
}: {
  vendedor: ComisionesPreventa["vendedores"][number];
  onClose: () => void;
  onPagar: (nota: string, requestId: string) => Promise<void>;
}) {
  const requestId = useRef(crypto.randomUUID());
  const [nota, setNota] = useState("");
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);
  const pendientes = vendedor.pedidos.filter((p) => !p.pagada);
  return (
    <Hoja
      titulo={`Pagar a ${vendedor.sellerName}`}
      onClose={onClose}
      pie={
        <button
          type="button"
          className={`${botonPrimario} min-h-12 w-full`}
          disabled={enviando}
          onClick={async () => {
            setEnviando(true);
            setError("");
            try {
              await onPagar(nota.trim(), requestId.current);
            } catch (causa) {
              setError(mensajeDe(causa));
            } finally {
              setEnviando(false);
            }
          }}
        >
          <HandCoins size={18} aria-hidden /> Registrar pago de{" "}
          {pesos(vendedor.pendienteMinor)}
        </button>
      }
    >
      <p className="text-sm text-slate-600">
        Se liquidan {pendientes.length} pedido
        {pendientes.length === 1 ? "" : "s"} entregado
        {pendientes.length === 1 ? "" : "s"}. El porcentaje de cada uno queda
        fijo.
      </p>
      <label className="mt-3 block text-sm font-medium text-slate-700">
        Nota (opcional)
        <input
          className={campo}
          maxLength={300}
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          placeholder="Ej.: pagado en efectivo el viernes"
        />
      </label>
      <p className="mt-2 text-xs text-slate-500">
        Esto no mueve la caja: si el pago sale de la caja, registrá el egreso en
        Caja.
      </p>
      {error ? (
        <div className="mt-2">
          <Aviso tipo="error">{error}</Aviso>
        </div>
      ) : null}
    </Hoja>
  );
}

function PorcentajeDelPedido({
  actual,
  onClose,
  onGuardar,
}: {
  actual: number;
  onClose: () => void;
  onGuardar: (bps: number | null) => Promise<void>;
}) {
  const [texto, setTexto] = useState(
    actual ? String(actual / 100).replace(".", ",") : "",
  );
  const bps = porcentajeABps(texto);
  return (
    <Hoja
      titulo="Comisión del pedido"
      onClose={onClose}
      pie={
        <div className="flex gap-2">
          <button
            type="button"
            className={`${botonSecundario} flex-1`}
            onClick={() => void onGuardar(null)}
          >
            Usar la del preventista
          </button>
          <button
            type="button"
            className={`${botonPrimario} flex-1`}
            disabled={bps === null}
            onClick={() => void onGuardar(bps)}
          >
            Guardar
          </button>
        </div>
      }
    >
      <label className="block text-sm font-medium text-slate-700">
        Porcentaje
        <span className="relative block">
          <input
            className={`${campo} pr-10`}
            inputMode="decimal"
            autoFocus
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
          />
          <Percent
            size={16}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
            aria-hidden
          />
        </span>
      </label>
    </Hoja>
  );
}
