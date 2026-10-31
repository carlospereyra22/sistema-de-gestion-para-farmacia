import { useEffect, useRef, useState } from "react";
import { Upload, ArrowLeft } from "lucide-react";
import {
  medicineCandidates,
  normalizeMedicine,
  rememberedMatch,
  orderTotal,
  planDistribution,
  type RememberedMatch,
  shortage,
  type ImportLine,
  type ReviewUnit,
} from "./lib/distribution-import";
import type { CatalogProduct, StockLot } from "./lib/api";

type Row = ImportLine & {
  productId: string;
  unit: ReviewUnit;
  stockUnit: ReviewUnit;
  checked: boolean;
};
const units = {
  "": "Revisar unidad",
  BOX: "Cajas",
  BLISTER: "Blísteres",
  UNIT: "Unidades",
  MIXED: "Stock mezclado",
};
export function DistributionImportReview({
  products,
  stock,
  reserved,
  onBack,
  memoryKey,
  onPrepared,
}: {
  products: CatalogProduct[];
  stock: StockLot[];
  reserved: { lotId: string; quantity: number }[];
  onBack: () => void;
  memoryKey: string;
  onPrepared: (items: { lotId: string; quantity: number }[]) => boolean;
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [raw, setRaw] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [filename, setFilename] = useState("");
  const [generalUnit, setGeneralUnit] = useState<ReviewUnit>("");
  const [generalStockUnit, setGeneralStockUnit] = useState<ReviewUnit>("");
  const [confirmed, setConfirmed] = useState(false);
  const [onlyPending, setOnlyPending] = useState(false);
  const [memory, setMemory] = useState<Record<string, RememberedMatch>>(() => {
    try {
      const value: unknown = JSON.parse(
        localStorage.getItem(memoryKey) || "{}",
      );
      if (!value || typeof value !== "object" || Array.isArray(value))
        return {};
      return Object.fromEntries(
        Object.entries(value).filter(
          ([, entry]) =>
            entry &&
            typeof entry === "object" &&
            typeof entry.productId === "string" &&
            typeof entry.productName === "string" &&
            ["BOX", "BLISTER", "UNIT"].includes(entry.unit),
        ),
      );
    } catch {
      return {};
    }
  });
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  function update(index: number, patch: Partial<Row>) {
    setConfirmed(false);
    setRows((current) =>
      current.map((row, i) =>
        i === index
          ? { ...row, ...patch, checked: patch.checked ?? false }
          : row,
      ),
    );
  }
  async function read(file: File) {
    if (
      rows.length &&
      !window.confirm(
        "¿Reemplazar la revisión actual? No se modificará el stock ni el borrador de salida.",
      )
    )
      return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setConfirmed(false);
    setStatus("Preparando PDF…");
    const timeout = window.setTimeout(() => controller.abort(), 180000);
    try {
      const { readOrderPdf } = await import("./lib/read-order-pdf");
      const result = await readOrderPdf(file, controller.signal, setStatus);
      if (controller.signal.aborted) return;
      setConfirmed(false);
      setRows(
        result.rows.map((row) => {
          const candidates = medicineCandidates(row.name, products);
          const saved = rememberedMatch(row.name, memory, products);
          return {
            ...row,
            productId:
              saved?.productId ||
              (candidates.exact && candidates.products.length === 1
                ? candidates.products[0]!.id
                : ""),
            unit: saved?.unit || "",
            stockUnit: "",
            checked: false,
          };
        }),
      );
      setRaw(result.text);
      setFilename(file.name);
      setStatus(
        result.rows.length
          ? `${result.rows.length} renglones detectados. Las coincidencias claras ya están seleccionadas. Revisá las excepciones y el total contra el PDF.`
          : "No se detectaron renglones. Revisá el texto reconocido; no se cargó ningún medicamento.",
      );
    } catch (error) {
      setStatus(
        controller.signal.aborted
          ? "Lectura cancelada o tiempo agotado. Podés reintentar."
          : error instanceof Error
            ? error.message
            : "No se pudo leer el PDF.",
      );
    } finally {
      window.clearTimeout(timeout);
      setBusy(false);
    }
  }
  const reviewed = rows.map((original, index) => {
    const row = {
      ...original,
      unit: original.unit || generalUnit,
      stockUnit: original.stockUnit || generalStockUnit,
    };
    const available = stock
      .filter((lot) => lot.productId === row.productId)
      .reduce(
        (sum, lot) =>
          sum +
          Math.max(
            0,
            lot.sellableQuantity -
              (reserved.find((item) => item.lotId === lot.id)?.quantity ?? 0),
          ),
        0,
      );
    const duplicate = Boolean(
      row.productId &&
      rows.filter((other) => other.productId === row.productId).length > 1,
    );
    const missing =
      duplicate || !products.some((p) => p.id === row.productId && p.active)
        ? null
        : shortage(row.quantity, available, row.unit, row.stockUnit, true);
    return { ...row, index, available, missing, duplicate };
  });
  const expected = orderTotal(raw);
  const total = rows.reduce((sum, row) => sum + row.quantity, 0);
  const reconciled = expected !== null && expected === total;
  const resolved = reviewed.filter((row) => row.missing !== null);
  const items = planDistribution(
    resolved.map((row) => ({
      productId: row.productId,
      quantity: row.quantity,
    })),
    stock,
    reserved,
  );
  function remember() {
    const next = { ...memory };
    for (const row of resolved) {
      const product = products.find((p) => p.id === row.productId)!;
      next[normalizeMedicine(row.name)] = {
        productId: product.id,
        productName: product.name,
        unit: row.unit,
      };
    }
    try {
      localStorage.setItem(memoryKey, JSON.stringify(next));
      setMemory(next);
    } catch {
      setStatus("No se pudieron recordar las asociaciones en este navegador.");
    }
  }
  function exportMissing() {
    remember();
    const safe = (value: string) =>
      `"${value.replace(/^[=+@-]/, "'$&").replaceAll('"', '""')}"`;
    const content = [
      "Producto;Unidad;Cantidad a pedir",
      ...reviewed
        .filter((row) => row.missing !== null && row.missing > 0)
        .map((row) =>
          [
            products.find((p) => p.id === row.productId)?.name || row.name,
            units[row.unit],
            String(row.missing),
          ]
            .map(safe)
            .join(";"),
        ),
    ].join("\r\n");
    const url = URL.createObjectURL(
      new Blob(["\uFEFF", content], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "faltantes-revisados-distribucion.csv";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <section className="mt-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          disabled={busy}
          className="inline-flex items-center gap-2 text-sm text-teal-700"
        >
          <ArrowLeft size={16} />
          Volver a la salida
        </button>
        <label className="cursor-pointer rounded-lg bg-teal-700 px-4 py-2 text-sm text-white">
          <Upload size={16} className="mr-2 inline" />
          Elegir PDF
          <input
            type="file"
            accept="application/pdf,.pdf"
            disabled={busy}
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void read(file);
            }}
          />
        </label>
      </div>
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <b>Revisión del pedido · No modifica stock</b>
        <p className="mt-1">
          Como hay cajas y blísteres mezclados, no se convierten cantidades
          automáticamente. Confirmá producto, presentación y unidades. Un stock
          mezclado requiere conteo y regularización antes de calcular faltantes.
        </p>
        <p className="mt-1 text-xs">
          El PDF se procesa en este navegador. La primera lectura necesita
          internet para descargar el motor de reconocimiento; el documento no se
          envía.
        </p>
      </div>
      {status && (
        <p role="status" className="text-sm text-slate-600">
          {status}
        </p>
      )}
      {busy && (
        <button
          type="button"
          onClick={() => request.current?.abort()}
          className="text-sm text-rose-700"
        >
          Cancelar lectura
        </button>
      )}
      {rows.length > 0 && (
        <>
          <p className="text-sm text-slate-600">
            {filename} · {rows.length} renglones ·{" "}
            {rows.reduce((sum, row) => sum + row.quantity, 0)} cantidades leídas
            (sin convertir unidades)
          </p>
          <div className="grid gap-4 rounded-xl bg-teal-50 p-4 sm:grid-cols-2">
            <label className="text-sm">
              Unidad general del pedido
              <select
                aria-label="Unidad general del pedido"
                value={generalUnit}
                onChange={(e) => {
                  setGeneralUnit(e.target.value as ReviewUnit);
                  setConfirmed(false);
                }}
                className="mt-1 h-10 w-full border px-2"
              >
                {Object.entries(units)
                  .filter(([key]) => key !== "MIXED")
                  .map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
              </select>
              <small>Cambiá sólo las excepciones en la tabla.</small>
            </label>
            <label className="text-sm">
              El stock está contado en
              <select
                aria-label="Unidad general del stock"
                value={generalStockUnit}
                onChange={(e) => {
                  setGeneralStockUnit(e.target.value as ReviewUnit);
                  setConfirmed(false);
                }}
                className="mt-1 h-10 w-full border px-2"
              >
                {Object.entries(units).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
              <small>
                Declaración física, no convierte existencias. Si está mezclado,
                indicá esa opción.
              </small>
            </label>
          </div>
          <p
            role="status"
            className={`rounded-lg p-3 text-sm ${reconciled ? "bg-teal-50 text-teal-800" : "bg-amber-50 text-amber-900"}`}
          >
            Leído: {total} / Total PDF: {expected ?? "no detectado"}.{" "}
            {reconciled
              ? "Total conciliado. Verificá las presentaciones y las excepciones."
              : "Revisá las cantidades o agregá las filas omitidas. La carga y exportación quedan bloqueadas hasta conciliar el total."}
          </p>
          <button
            type="button"
            onClick={() => setOnlyPending(!onlyPending)}
            className="rounded-lg border px-3 py-2 text-sm text-teal-700"
          >
            {onlyPending
              ? "Ver todos"
              : `Ver sólo pendientes (${reviewed.filter((row) => row.missing === null).length})`}
          </button>
          <div className="max-h-[52vh] overflow-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="sticky top-0 bg-slate-100">
                <tr>
                  {[
                    "Pedido / cantidad",
                    "Producto del catálogo",
                    "Unidad pedida",
                    "Unidad del stock",
                    "Disponible",
                    "Pedir",
                  ].map((label) => (
                    <th key={label} className="p-3">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {reviewed
                  .filter((row) => !onlyPending || row.missing === null)
                  .map((row) => (
                    <tr key={row.index} className="border-t border-slate-100">
                      <td className="p-3">
                        <input
                          aria-label={`Nombre fila ${row.index + 1}`}
                          value={row.name}
                          onChange={(e) =>
                            update(row.index, {
                              name: e.target.value,
                              productId: "",
                            })
                          }
                          className="w-full max-w-52 bg-transparent"
                        />
                        <small className="text-slate-500">
                          Página {row.page}
                        </small>
                        <button
                          type="button"
                          aria-label={`Quitar ${row.name}`}
                          onClick={() => {
                            setRows((current) =>
                              current.filter((_, i) => i !== row.index),
                            );
                            setConfirmed(false);
                          }}
                          className="ml-2 text-xs text-rose-700"
                        >
                          Quitar
                        </button>
                        <input
                          aria-label={`Cantidad de ${row.name}`}
                          type="number"
                          min={1}
                          step={1}
                          value={row.quantity}
                          onChange={(e) =>
                            update(row.index, {
                              quantity: Number(e.target.value),
                            })
                          }
                          className="mt-1 block h-9 w-20 border px-2"
                        />
                      </td>
                      <td className="p-3">
                        <select
                          aria-label={`Coincidencia de ${row.name}`}
                          value={row.productId}
                          onChange={(e) =>
                            update(row.index, {
                              productId: e.target.value,
                              stockUnit: "",
                            })
                          }
                          className="h-10 max-w-52 border px-2"
                        >
                          <option value="">Elegir coincidencia…</option>
                          {products
                            .filter((p) => p.active)
                            .map((product) => (
                              <option key={product.id} value={product.id}>
                                {product.name}
                              </option>
                            ))}
                        </select>
                        <small className="mt-1 block max-w-52 text-slate-500">
                          {row.productId
                            ? "Asociación lista: verificá presentación"
                            : medicineCandidates(row.name, products)
                                .products.map((p) => p.name)
                                .join(" / ") || "Sin coincidencia sugerida"}
                        </small>
                      </td>
                      <td className="p-3">
                        <select
                          aria-label={`Unidad pedida de ${row.name}`}
                          value={rows[row.index]!.unit}
                          onChange={(e) =>
                            update(row.index, {
                              unit: e.target.value as ReviewUnit,
                            })
                          }
                          className="h-10 border px-2"
                        >
                          {Object.entries(units)
                            .filter(([key]) => key !== "MIXED")
                            .map(([key, label]) => (
                              <option key={key} value={key}>
                                {key ? label : `General: ${units[generalUnit]}`}
                              </option>
                            ))}
                        </select>
                      </td>
                      <td className="p-3">
                        <select
                          aria-label={`Unidad del stock de ${row.name}`}
                          value={rows[row.index]!.stockUnit}
                          onChange={(e) =>
                            update(row.index, {
                              stockUnit: e.target.value as ReviewUnit,
                            })
                          }
                          className="h-10 border px-2"
                        >
                          {Object.entries(units).map(([key, label]) => (
                            <option key={key} value={key}>
                              {key
                                ? label
                                : `General: ${units[generalStockUnit]}`}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="p-3">
                        {row.missing === null ? "Por revisar" : row.available}
                      </td>
                      <td className="p-3 font-semibold text-amber-800">
                        {row.missing === null
                          ? row.duplicate
                            ? "Producto repetido: revisar"
                            : "Revisar unidad"
                          : row.missing}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <button
            type="button"
            onClick={() => {
              setRows((current) => [
                ...current,
                {
                  name: "",
                  quantity: 1,
                  page: 1,
                  productId: "",
                  unit: "",
                  stockUnit: "",
                  checked: false,
                },
              ]);
              setConfirmed(false);
              setOnlyPending(false);
            }}
            className="text-sm text-teal-700"
          >
            + Agregar fila omitida
          </button>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            Revisé el pedido y las excepciones; confirmo que las unidades
            indicadas corresponden al stock físico. Recordar asociaciones y
            unidades del pedido en este navegador.
          </label>
          <p className="text-xs text-slate-500">
            {reviewed.filter((row) => row.missing === null).length} renglones
            pendientes: no se incluyen en faltantes. Los faltantes están en la
            unidad indicada, no se convierten a cajas de compra.
          </p>
          <button
            type="button"
            disabled={
              busy ||
              !confirmed ||
              !reconciled ||
              !reviewed.some((row) => row.missing !== null && row.missing > 0)
            }
            onClick={exportMissing}
            className="rounded-lg border border-teal-200 px-4 py-2 text-sm text-teal-700 disabled:opacity-50"
          >
            Exportar faltantes revisados (CSV)
          </button>
          <button
            type="button"
            disabled={busy || !confirmed || !reconciled || !items.length}
            onClick={() => {
              remember();
              if (onPrepared(items)) {
                setRows([]);
                setRaw("");
                setConfirmed(false);
              }
            }}
            className="ml-3 rounded-lg bg-teal-700 px-4 py-2 text-sm text-white disabled:opacity-40"
          >
            Cargar disponibles a la salida
          </button>
          <p className="text-xs text-slate-500">
            Sólo se agregan los disponibles de artículos resueltos, por
            vencimiento. Los pendientes se excluyen. Revisá los lotes físicos
            antes de confirmar la salida; no se descuenta stock al importar.
          </p>
        </>
      )}
      {raw && (
        <details>
          <summary className="cursor-pointer text-sm text-slate-500">
            Ver texto reconocido para detectar omisiones
          </summary>
          <pre className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-xs">
            {raw}
          </pre>
        </details>
      )}
    </section>
  );
}
