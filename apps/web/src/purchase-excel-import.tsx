import { PurchasePackPicker } from "./purchase-pack-picker";
import type { MedicineReference } from "./lib/api";
import {
  applyPacks,
  invoicePackFactor,
  packSearchText,
  type PurchasePack,
} from "./lib/purchase-pack";
import {
  pendingProductRows,
  productRowGroups,
  type BulkProductResult,
  type BulkProductRow,
} from "./lib/purchase-bulk-products";
import { useEffect, useMemo, useRef, useState } from "react";
import { Boxes, FileSpreadsheet, FileUp, Link2, Plus, X } from "lucide-react";
import type { CatalogProduct } from "./lib/api";
import type { PurchaseDraftLine } from "./lib/purchases";
import { invoiceMapping, invoiceSheet } from "./lib/purchase-invoice-pdf";
import {
  detectExcelHeader,
  excelCellText,
  normalizePurchaseText,
  previewPurchaseExcel,
  purchaseExcelLines,
  sameCodeRowNumbers,
  type ExcelColumn,
  type ExcelMapping,
  type ExcelSheet,
  type ImportRow,
} from "./lib/purchase-excel";

const maxExcelBytes = 5 * 1024 * 1024;
const maxPdfBytes = 15 * 1024 * 1024;
const columnLabels: Record<ExcelColumn, string> = {
  code: "Código de barras",
  name: "Producto",
  quantity: "Cantidad",
  cost: "Costo unitario",
};
const fieldClass =
  "h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm";

export type ImportSource = "excel" | "pdf";
type Loaded = {
  source: ImportSource;
  fileName: string;
  sheets: ExcelSheet[];
  sheetIndex: number;
  headerRow: number;
  mapping: ExcelMapping;
};

const columnLetter = (index: number) => {
  let label = "";
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26))
    label = String.fromCharCode(65 + ((n - 1) % 26)) + label;
  return label;
};

const usableSheet = (sheets: ExcelSheet[]) => {
  const index = sheets.findIndex(({ data }) => {
    const { mapping } = detectExcelHeader(data);
    return (
      mapping.quantity !== null &&
      (mapping.code !== null || mapping.name !== null)
    );
  });
  return Math.max(0, index);
};

const autoSelected = (rows: ImportRow[]) =>
  new Set(
    rows.filter((r) => r.productId && r.quantity).map((r) => r.rowNumber),
  );

type PackActions = {
  load: (codes: string[]) => Promise<PurchasePack[]>;
  save: (pack: PurchasePack) => Promise<void>;
  search: (query: string) => Promise<MedicineReference[]>;
};

type CreateProducts = (
  rows: BulkProductRow[],
  onProgress: (done: number) => void,
) => Promise<BulkProductResult>;

export function PurchaseExcelImport({
  products,
  existingLines,
  disabled,
  onImport,
  onError,
  onCreateProduct,
  onCreateProducts,
  packActions,
}: {
  products: CatalogProduct[];
  existingLines: PurchaseDraftLine[];
  disabled?: boolean;
  onImport: (lines: PurchaseDraftLine[]) => void;
  onError: (message: string) => void;
  onCreateProduct?: (draft: {
    barcode: string;
    name: string;
  }) => Promise<string | undefined>;
  onCreateProducts?: CreateProducts;
  packActions?: PackActions;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [reading, setReading] = useState("");
  const [loaded, setLoaded] = useState<Loaded>();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [assigned, setAssigned] = useState<Record<number, string>>({});
  const [packs, setPacks] = useState<PurchasePack[]>([]);
  const sheet = loaded?.sheets[loaded.sheetIndex];
  const rows = useMemo(
    () =>
      loaded && sheet
        ? applyPacks(
            previewPurchaseExcel(
              sheet.data,
              loaded.headerRow,
              loaded.mapping,
              products,
            ),
            packs,
            products,
          )
        : [],
    [loaded, sheet, products, packs],
  );

  // Los exhibidores ya conocidos pasan a su producto base apenas se leen.
  const loadPacks = (next: Loaded, found: PurchasePack[]) => {
    setPacks(found);
    const applied = applyPacks(
      previewPurchaseExcel(
        next.sheets[next.sheetIndex].data,
        next.headerRow,
        next.mapping,
        products,
      ),
      found,
      products,
    );
    setSelected((current) => new Set([...current, ...autoSelected(applied)]));
  };

  // Vincular un renglón alcanza a los que traen el mismo código.
  const assign = (rowNumber: number, productId: string) => {
    const numbers = sameCodeRowNumbers(rows, rowNumber);
    setAssigned((current) => ({
      ...current,
      ...Object.fromEntries(numbers.map((number) => [number, productId])),
    }));
    setSelected((current) => new Set([...current, ...numbers]));
  };

  const show = (next: Loaded) => {
    setLoaded(next);
    setAssigned({});
    setPacks([]);
    const codes = previewPurchaseExcel(
      next.sheets[next.sheetIndex].data,
      next.headerRow,
      next.mapping,
      products,
    )
      .map((row) => row.code)
      .filter((code) => /^\d{8,14}$/.test(code))
      .slice(0, 100);
    if (packActions && codes.length)
      void packActions
        .load(codes)
        .then((found) => loadPacks(next, found))
        .catch(() => undefined);
    setSelected(
      autoSelected(
        previewPurchaseExcel(
          next.sheets[next.sheetIndex].data,
          next.headerRow,
          next.mapping,
          products,
        ),
      ),
    );
  };

  const readPdf = async (file: File) => {
    if (file.size > maxPdfBytes)
      return onError(
        "La factura supera 15 MB. Revisá que sea el PDF correcto.",
      );
    setReading("Leyendo factura…");
    try {
      const { readPurchaseInvoicePdf } =
        await import("./lib/read-purchase-invoice-pdf");
      const lines = await readPurchaseInvoicePdf(file, setReading);
      show({
        source: "pdf",
        fileName: file.name,
        sheets: [{ sheet: "Factura", data: invoiceSheet(lines) }],
        sheetIndex: 0,
        headerRow: -1,
        mapping: invoiceMapping,
      });
    } catch (e) {
      // La causa real queda en la consola y en el aviso, para poder revisarla.
      console.error("No se pudo leer la factura PDF", e);
      onError(
        e instanceof Error && e.message.startsWith("Importá")
          ? e.message
          : `No se pudo leer la factura. Revisá que sea un PDF.${e instanceof Error && e.message ? ` (${e.message})` : ""}`,
      );
    } finally {
      setReading("");
    }
  };

  const read = async (file: File) => {
    if (/\.pdf$/i.test(file.name)) return readPdf(file);
    if (!/\.xlsx$/i.test(file.name))
      return onError("Elegí un Excel .xlsx o una factura PDF.");
    if (file.size > maxExcelBytes)
      return onError("El Excel supera 5 MB. Revisá que sea el pedido.");
    setReading("Leyendo…");
    try {
      const { default: readXlsxFile } = await import("read-excel-file/browser");
      const sheets: ExcelSheet[] = await readXlsxFile(file);
      if (!sheets.some((s) => s.data.length))
        return onError("El Excel no tiene filas para importar.");
      const sheetIndex = usableSheet(sheets);
      show({
        source: "excel",
        fileName: file.name,
        sheets,
        sheetIndex,
        ...detectExcelHeader(sheets[sheetIndex].data),
      });
    } catch {
      onError("No se pudo leer el archivo. Revisá que sea un Excel .xlsx.");
    } finally {
      setReading("");
    }
  };

  const reconfigure = (value: Partial<Loaded>) => {
    if (!loaded) return;
    const next = { ...loaded, ...value };
    if (value.sheetIndex !== undefined)
      Object.assign(next, detectExcelHeader(next.sheets[next.sheetIndex].data));
    show(next);
  };

  return (
    <>
      <button
        type="button"
        disabled={disabled || Boolean(reading)}
        onClick={() => input.current?.click()}
        title="Excel del pedido o factura PDF de la droguería"
        className="inline-flex h-9 items-center gap-2 rounded-lg border border-teal-200 bg-teal-50 px-3 text-sm font-medium text-teal-800 hover:bg-teal-100 disabled:opacity-50"
      >
        <FileUp size={16} aria-hidden="true" />
        {reading || "Importar archivo"}
      </button>
      <input
        ref={input}
        type="file"
        hidden
        aria-label="Excel o factura PDF de la droguería"
        accept=".xlsx,.pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/pdf"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void read(file);
        }}
      />
      {loaded && sheet && (
        <PurchaseExcelReview
          source={loaded.source}
          fileName={loaded.fileName}
          sheetNames={loaded.sheets.map((s) => s.sheet)}
          sheetIndex={loaded.sheetIndex}
          sheetData={sheet.data}
          headerRow={loaded.headerRow}
          mapping={loaded.mapping}
          rows={rows}
          products={products}
          existingLines={existingLines}
          selected={selected}
          assigned={assigned}
          onSheet={(sheetIndex) => reconfigure({ sheetIndex })}
          onMapping={(column, index) =>
            reconfigure({ mapping: { ...loaded.mapping, [column]: index } })
          }
          onToggle={(rowNumber, checked) =>
            setSelected((current) => {
              const next = new Set(current);
              if (checked) next.add(rowNumber);
              else next.delete(rowNumber);
              return next;
            })
          }
          onAssign={assign}
          onCreateProduct={
            onCreateProduct &&
            (async (row) => {
              const productId = await onCreateProduct({
                barcode: row.code,
                name: row.name,
              });
              if (productId) assign(row.rowNumber, productId);
            })
          }
          onCreateProducts={
            onCreateProducts &&
            (async (rows, onProgress) => {
              const result = await onCreateProducts(rows, onProgress);
              for (const { rowNumber, productId } of result.created)
                assign(rowNumber, productId);
              return result;
            })
          }
          searchPackBase={packActions?.search}
          onSavePack={
            packActions &&
            (async (row, baseBarcode, factor) => {
              const pack = { barcode: row.code, baseBarcode, factor };
              await packActions.save(pack);
              setAssigned((current) => {
                const next = { ...current };
                delete next[row.rowNumber];
                return next;
              });
              loadPacks(loaded, [
                ...packs.filter((item) => item.barcode !== pack.barcode),
                pack,
              ]);
            })
          }
          onCancel={() => setLoaded(undefined)}
          onConfirm={(lines) => {
            setLoaded(undefined);
            onImport(lines);
          }}
        />
      )}
    </>
  );
}

export function PurchaseExcelReview({
  source = "excel",
  fileName,
  sheetNames,
  sheetIndex,
  sheetData,
  headerRow,
  mapping,
  rows,
  products,
  existingLines,
  selected,
  assigned,
  onSheet,
  onMapping,
  onToggle,
  onAssign,
  onCreateProduct,
  onCreateProducts,
  searchPackBase,
  onSavePack,
  onCancel,
  onConfirm,
}: {
  source?: ImportSource;
  fileName: string;
  sheetNames: string[];
  sheetIndex: number;
  sheetData: unknown[][];
  headerRow: number;
  mapping: ExcelMapping;
  rows: ImportRow[];
  products: CatalogProduct[];
  existingLines: PurchaseDraftLine[];
  selected: Set<number>;
  assigned: Record<number, string>;
  onSheet: (index: number) => void;
  onMapping: (column: ExcelColumn, index: number | null) => void;
  onToggle: (rowNumber: number, checked: boolean) => void;
  onAssign: (rowNumber: number, productId: string) => void;
  /** Abre Nuevo producto con el código y el nombre del renglón; al guardar queda vinculado. */
  onCreateProduct?: (row: ImportRow) => Promise<void>;
  /** Crea los renglones sin producto con los datos de la base de medicamentos. */
  onCreateProducts?: CreateProducts;
  searchPackBase?: PackActions["search"];
  /** Guarda que el código del renglón equivale a N unidades del envase base. */
  onSavePack?: (
    row: ImportRow,
    baseBarcode: string,
    factor: number,
  ) => Promise<void>;
  onCancel: () => void;
  onConfirm: (lines: PurchaseDraftLine[]) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [linking, setLinking] = useState<number>();
  const [creating, setCreating] = useState<number>();
  const [packing, setPacking] = useState<number>();
  const [bulkDone, setBulkDone] = useState<number>();
  const [failures, setFailures] = useState<BulkProductResult["failed"]>([]);
  const bulkBusy = bulkDone !== undefined;
  // Con la creación en curso no se cierra: quedarían productos sin agregar.
  const cancel = () => {
    if (!bulkBusy) onCancel();
  };
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  const columnCount = Math.max(
    0,
    ...sheetData.slice(0, 30).map((row) => row.length),
  );
  const header = sheetData[headerRow] ?? [];
  const productName = (id: string) =>
    products.find((p) => p.id === id)?.name ?? "Producto";
  const lines = purchaseExcelLines(rows, selected, assigned, existingLines);
  const chosen = rows.filter(
    (r) =>
      selected.has(r.rowNumber) &&
      r.quantity &&
      (assigned[r.rowNumber] || r.productId),
  );
  const chosenProducts = new Set(
    chosen.map((r) => assigned[r.rowNumber] || r.productId),
  ).size;
  const pendingReview = rows.filter(
    (r) => !(assigned[r.rowNumber] || r.productId) || !r.quantity,
  ).length;
  const pdf = source === "pdf";
  const pending = pendingProductRows(rows, assigned);
  const pendingProducts = productRowGroups(pending).length;
  const createAll = async () => {
    if (!onCreateProducts || bulkBusy) return;
    setFailures([]);
    setBulkDone(0);
    const result = await onCreateProducts(pending, setBulkDone).catch(
      (cause: unknown): BulkProductResult => ({
        created: [],
        failed: pending.map((row) => ({
          rowNumber: row.rowNumber,
          name: row.name || row.code,
          reason:
            cause instanceof Error
              ? cause.message
              : "No se pudo crear el producto.",
        })),
      }),
    );
    setBulkDone(undefined);
    if (result.failed.length) {
      setFailures(result.failed);
      return;
    }
    const created = result.created;
    onConfirm(
      purchaseExcelLines(
        rows,
        new Set([...selected, ...created.map((item) => item.rowNumber)]),
        {
          ...assigned,
          ...Object.fromEntries(
            created.map((item) => [item.rowNumber, item.productId]),
          ),
        },
        existingLines,
      ),
    );
  };
  // Las facturas informan el total de unidades: sirve para controlar la lectura.
  const units = rows.reduce(
    (sum, r) => sum + (Number(r.quantity) || 0) / (r.pack?.factor ?? 1),
    0,
  );

  return (
    <dialog
      ref={ref}
      aria-label={
        pdf ? "Revisar factura de la droguería" : "Revisar Excel del pedido"
      }
      onKeyDown={(event) => {
        // El diálogo de la compra también escucha Escape: sólo cerramos éste.
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          cancel();
        }
      }}
      onCancel={(event) => {
        event.preventDefault();
        cancel();
      }}
      className="m-auto flex max-h-[90dvh] w-[min(1180px,calc(100vw-2rem))] max-w-[calc(100vw-2rem)] flex-col rounded-2xl border border-slate-200 bg-white p-0 shadow-xl backdrop:bg-slate-950/40"
    >
      <header className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 font-semibold">
            <FileSpreadsheet size={20} className="text-teal-700" />
            {pdf ? "Revisar factura" : "Revisar Excel"}
          </h2>
          <p className="truncate text-xs text-slate-500">
            {fileName} · {rows.length} {pdf ? "renglones" : "filas"}
            {pdf && ` · ${units} unidades`} · {pendingReview} para revisar
          </p>
        </div>
        <button
          type="button"
          aria-label="Cerrar revisión del archivo"
          className="p-2 text-slate-500"
          onClick={cancel}
        >
          <X size={18} />
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        <div
          hidden={pdf}
          className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5"
        >
          {sheetNames.length > 1 && (
            <label className="text-sm">
              Hoja
              <select
                className={fieldClass}
                value={sheetIndex}
                onChange={(e) => onSheet(Number(e.target.value))}
              >
                {sheetNames.map((name, index) => (
                  <option key={name} value={index}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {(Object.keys(columnLabels) as ExcelColumn[]).map((column) => (
            <label key={column} className="text-sm">
              {columnLabels[column]}
              <select
                className={fieldClass}
                value={mapping[column] ?? ""}
                onChange={(e) =>
                  onMapping(
                    column,
                    e.target.value === "" ? null : Number(e.target.value),
                  )
                }
              >
                <option value="">Sin usar</option>
                {Array.from({ length: columnCount }, (_, index) => (
                  <option key={index} value={index}>
                    {columnLetter(index)}
                    {excelCellText(header[index])
                      ? ` · ${excelCellText(header[index])}`
                      : ""}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
        {pdf && (
          <p className="mb-3 border-l-2 border-slate-300 pl-3 text-sm text-slate-600">
            Compará las unidades con el total de la factura. El costo es el
            precio unitario neto de cada renglón; el lote y el vencimiento se
            cargan al recibir.
          </p>
        )}
        {!pdf && mapping.quantity === null && (
          <p
            role="alert"
            className="mb-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800"
          >
            No encontramos la columna de cantidad. Elegila arriba para seguir.
          </p>
        )}
        {failures.length > 0 && (
          <div
            role="alert"
            className="mb-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800"
          >
            <p className="font-semibold">
              {failures.length === 1
                ? "No se pudo crear 1 producto:"
                : `No se pudieron crear ${failures.length} productos:`}
            </p>
            <ul className="mt-1 space-y-0.5">
              {failures.map((failure) => (
                <li key={failure.rowNumber}>
                  {pdf ? "Renglón" : "Fila"} {failure.rowNumber} ·{" "}
                  {failure.name}: {failure.reason}
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="bg-slate-50 text-left text-slate-600">
              <tr>
                <th className="w-10 p-2" />
                <th className="p-2">{pdf ? "Renglón" : "Fila"}</th>
                <th className="p-2">{pdf ? "En la factura" : "En el Excel"}</th>
                <th className="p-2">Producto del catálogo</th>
                <th className="p-2 text-right">Cant.</th>
                <th className="p-2 text-right">Costo</th>
                <th className="p-2">Estado</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const productId = assigned[row.rowNumber] || row.productId;
                const status = assigned[row.rowNumber]
                  ? row.quantity
                    ? "Vinculado a mano"
                    : row.issue
                  : (row.issue ??
                    (row.pack
                      ? `Exhibidor ×${row.pack.factor}`
                      : row.matchedBy === "code"
                        ? "Por código"
                        : "Por nombre"));
                const packFactor =
                  !row.pack && onSavePack && searchPackBase
                    ? invoicePackFactor(row.name)
                    : null;
                const warn =
                  !productId ||
                  !row.quantity ||
                  Boolean(row.issue && !assigned[row.rowNumber]);
                return (
                  <tr
                    key={row.rowNumber}
                    className="border-t border-slate-100 align-top"
                  >
                    <td className="p-2">
                      <input
                        type="checkbox"
                        aria-label={`Importar fila ${row.rowNumber}`}
                        disabled={!productId || !row.quantity}
                        checked={
                          selected.has(row.rowNumber) &&
                          Boolean(productId && row.quantity)
                        }
                        onChange={(e) =>
                          onToggle(row.rowNumber, e.target.checked)
                        }
                      />
                    </td>
                    <td className="p-2 text-slate-500">{row.rowNumber}</td>
                    <td className="p-2">
                      <div>{row.name || "—"}</div>
                      {row.code && (
                        <div className="text-xs text-slate-500">
                          {row.pack
                            ? `Exhibidor ${row.pack.code} · ${row.pack.factor} unidades de ${row.code}`
                            : row.code}
                        </div>
                      )}
                    </td>
                    <td className="p-2">
                      {packing === row.rowNumber &&
                      packFactor &&
                      searchPackBase &&
                      onSavePack ? (
                        <PurchasePackPicker
                          initialQuery={packSearchText(row.name)}
                          initialFactor={packFactor}
                          search={searchPackBase}
                          onPick={async (reference, factor) => {
                            await onSavePack(row, reference.barcode, factor);
                            setPacking(undefined);
                          }}
                          onCancel={() => setPacking(undefined)}
                        />
                      ) : linking === row.rowNumber ? (
                        <ExcelProductPicker
                          products={products}
                          initialQuery={row.name}
                          onPick={(id) => {
                            onAssign(row.rowNumber, id);
                            setLinking(undefined);
                          }}
                          onCancel={() => setLinking(undefined)}
                        />
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className={productId ? "" : "text-slate-400"}>
                            {productId
                              ? productName(productId)
                              : "Sin vincular"}
                          </span>
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 text-xs font-medium text-teal-700"
                            onClick={() => setLinking(row.rowNumber)}
                          >
                            <Link2 size={14} aria-hidden="true" />
                            {productId ? "Cambiar" : "Vincular"}
                          </button>
                          {packFactor && (
                            <button
                              type="button"
                              className="inline-flex items-center gap-1 text-xs font-medium text-teal-700"
                              onClick={() => setPacking(row.rowNumber)}
                            >
                              <Boxes size={14} aria-hidden="true" />
                              Exhibidor ×{packFactor}
                            </button>
                          )}
                          {!productId && onCreateProduct && (
                            <button
                              type="button"
                              aria-label={`Crear producto ${row.name || row.code}`}
                              disabled={creating !== undefined}
                              className="inline-flex items-center gap-1 text-xs font-medium text-teal-700 disabled:opacity-50"
                              onClick={() => {
                                setCreating(row.rowNumber);
                                void onCreateProduct(row).finally(() =>
                                  setCreating(undefined),
                                );
                              }}
                            >
                              <Plus size={14} aria-hidden="true" />
                              {creating === row.rowNumber
                                ? "Creando…"
                                : "Crear producto"}
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="p-2 text-right">{row.quantity || "—"}</td>
                    <td className="p-2 text-right">
                      {row.cost ? `$ ${row.cost.replace(".", ",")}` : "—"}
                    </td>
                    <td
                      className={`p-2 text-xs ${warn ? "text-amber-700" : "text-teal-700"}`}
                    >
                      {status}
                    </td>
                  </tr>
                );
              })}
              {!rows.length && (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-slate-500">
                    No hay filas con productos en esta hoja.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-5 py-4">
        <p className="text-sm text-slate-600">
          {chosenProducts > lines.length
            ? `${chosenProducts - lines.length} productos no se agregan: ya están en el pedido o se superan los 100 productos.`
            : chosen.length > chosenProducts
              ? "Los renglones del mismo producto se suman en una sola línea del pedido."
              : "Las filas se suman al pedido; la compra no se guarda hasta que la confirmes."}
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={cancel}
            disabled={bulkBusy}
            className="h-10 rounded-lg border border-slate-200 px-4 text-sm font-medium text-slate-600 disabled:opacity-50"
          >
            Cancelar
          </button>
          {onCreateProducts && pending.length > 0 && (
            <button
              type="button"
              disabled={bulkBusy}
              onClick={() => void createAll()}
              className="h-10 rounded-lg border border-teal-600 bg-white px-4 text-sm font-semibold text-teal-800 hover:bg-teal-50 disabled:opacity-60"
            >
              {bulkBusy
                ? `Creando ${Math.min(bulkDone + 1, pendingProducts)} de ${pendingProducts}…`
                : `Crear ${pendingProducts} y agregar todo`}
            </button>
          )}
          <button
            type="button"
            disabled={!lines.length || bulkBusy}
            onClick={() => onConfirm(lines)}
            className="h-10 rounded-lg bg-teal-700 px-4 text-sm font-semibold text-white disabled:opacity-50"
          >
            Agregar {lines.length}{" "}
            {lines.length === 1 ? "producto" : "productos"} al pedido
          </button>
        </div>
      </footer>
    </dialog>
  );
}

function ExcelProductPicker({
  products,
  initialQuery,
  onPick,
  onCancel,
}: {
  products: CatalogProduct[];
  initialQuery: string;
  onPick: (productId: string) => void;
  onCancel: () => void;
}) {
  const [query, setQuery] = useState(initialQuery);
  const words = normalizePurchaseText(query).split(" ").filter(Boolean);
  const results = words.length
    ? products
        .filter(
          (p) =>
            p.active &&
            (!p.branchStatus || p.branchStatus === "ACTIVE") &&
            words.every(
              (word) =>
                normalizePurchaseText(p.name).includes(word) ||
                p.barcodes.some((b) => b.code.includes(word)),
            ),
        )
        .slice(0, 8)
    : [];
  return (
    <div className="grid gap-1">
      <div className="flex gap-1">
        <input
          autoFocus
          aria-label="Buscar producto del catálogo"
          placeholder="Nombre o código"
          className={fieldClass}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button
          type="button"
          aria-label="Cancelar vinculación"
          className="px-2 text-slate-500"
          onClick={onCancel}
        >
          <X size={16} />
        </button>
      </div>
      <ul className="max-h-48 overflow-y-auto rounded-lg border border-slate-200">
        {results.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              className="w-full px-2 py-1.5 text-left hover:bg-teal-50"
              onClick={() => onPick(p.id)}
            >
              {p.name}
            </button>
          </li>
        ))}
        {!results.length && (
          <li className="px-2 py-1.5 text-xs text-slate-500">
            Sin resultados. Probá con menos palabras.
          </li>
        )}
      </ul>
    </div>
  );
}
