import { resolveExternalCategory } from "./lib/api";
import { PurchasesWorkspace } from "./purchases-workspace";
import { SupplierPayablesWorkspace } from "./supplier-payables/workspace";
import {
  ExternalProductLookup,
  type RetailMedicine,
} from "./external-product-lookup";
import {
  externalProductFields,
  externalSaleUnit,
  externalGtin,
} from "./lib/external-product";
import { ProductFilterSelect } from "./product-filter-select";
import {
  medicineReferenceBarcodeConflict,
  medicineReferenceBarcodeToCopy,
} from "./lib/medicine-reference-barcode";
import { findMedicationCategory } from "./lib/medication-category";
import {
  barcodeKindOf,
  equivalentBarcodes,
  findProductByBarcode,
  medicinesByName,
  primaryBarcodeOf,
} from "./lib/equivalent-barcodes";
import { ProductEquivalentBarcodes } from "./product-equivalent-barcodes";
import {
  compatibleRetailMedicineReferences,
  retailMedicineNameQuery,
} from "./lib/retail-medicine-link";
import { categoryBranch } from "./lib/category-tree";
import { SuppliersWorkspace } from "./suppliers-workspace";
import { CustomersWorkspace } from "./customers-workspace";
import { InventoryPendingPurchase } from "./inventory-pending-purchase";
import {
  Fragment,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { DirectTicketPrint } from "./direct-ticket-print";
import { SearchableSaleSelect } from "./searchable-sale-select";
import { TransferList } from "./transfer-list";
import { PendingSaleConfirmDialog } from "./pending-sale-confirm-dialog";
import {
  findTransferProductsByBarcode,
  singleAvailableTransferLotId,
} from "./lib/transfer-product-lookup";
import { NavigationRail } from "./navigation-rail";
import { SidebarToggle } from "./sidebar-toggle";
import { useWorkspaceSidebar } from "./use-workspace-sidebar";
import { ProductInternalBarcode } from "./product-internal-barcode";
import { canDismissProductBackdrop } from "./lib/product-backdrop";
import { SaleQuantityInput } from "./sale-quantity-input";
import { SaleCatalogTable } from "./sale-catalog-table";
import { SaleProductDetail } from "./sale-product-detail";
import {
  filterSaleCatalog,
  nextSaleCatalogSelection,
  saleCatalogRowId,
  saleProductDetail,
  saleCategoryOptions,
} from "./lib/sale-catalog";
import { ResumeSaleDialog } from "./resume-sale-dialog";
import { PriceListsWorkspace } from "./price-lists-workspace";
import { sortSaleLines } from "./lib/sort-sale-lines";
import { FractionalPriceFields } from "./fractional-price-fields";
import { fractionalPricePreview } from "./lib/fractional-price-preview";
import { toggleFractionalPrice } from "./lib/toggle-fractional-price";
import { parsePrice } from "./lib/price-lists-api";
import { dashboardInventoryBars } from "./lib/dashboard-inventory-bars";
import {
  getEffectivePrices,
  type EffectivePrices,
} from "./lib/price-lists-api";
import { AccountMenu } from "./account-menu";
import { CashRegisterIcon } from "./cash-register-icon";
import { AccountBranchSelector } from "./account-branch-selector";
import { OrganizationWorkspace } from "./organization-workspace";
import { OrganizationLogo } from "./organization-logo";
import { SaleDocumentChoice } from "./sale-document-choice";
import { SaleConceptDialog } from "./sale-concept-dialog";
import { SaleProductPricing } from "./sale-product-pricing";
import { paymentsAfterDiscount } from "./lib/discount-editor";
import { subscribeSalesDataRefresh } from "./lib/sales-data-refresh";
import { SaleConceptMenu } from "./sale-concept-menu";
import { conceptMaximumQuantity } from "./lib/concept-amount";
import { SaleFiscalSettings } from "./sale-fiscal-settings";
import { defaultSaleFiscalOptions } from "./lib/sale-fiscal-options";
import { getSaleFiscalCapabilities } from "./lib/api";
import type {
  SaleFiscalOptions,
  SaleFiscalCapabilities,
} from "@gestion/contracts";
import { SaleInvoiceDialog } from "./sale-invoice-dialog";
import { SaleCreditActions } from "./sale-credit-actions";
import { SaleDetailTotal, SalePaymentSummary } from "./sale-detail-summary";
import { UserTicketNameDialog, UserTicketNameField } from "./user-ticket-names";
import { Pagination } from "./pagination";
import { getSaleTicket } from "./lib/api";
import { useSearchParams } from "react-router-dom";
import {
  readWorkspaceLocation,
  workspaceLocation,
  type WorkspaceView as View,
} from "./lib/workspace-location";
import { CustomerAccounts } from "./customer-accounts";
import { DashboardMedicineSearch } from "./dashboard-medicine-search";
import { DashboardOverview, type DashboardAlert } from "./dashboard-overview";
import { DashboardWelcome, DashboardDate } from "./dashboard-welcome";
import { ReportsWorkspace } from "./reports-workspace";
import { DashboardRecentSales } from "./dashboard-recent-sales";
import { ProductSyncStatus } from "./product-sync-status";
import { CatalogUpdateStatus } from "./catalog-update-status";
import {
  adjustmentsByLot,
  lotHasManyCosts,
  lotReceiptRows,
  supplierNamesById,
} from "./lib/lot-costs";
import { DistributionWorkspace } from "./distribution-workspace";
import {
  ProductFormImage,
  ProductImageEditor,
  ProductThumbnail,
} from "./product-image";
import { updateCatalogProductImage } from "./lib/api";
import { BranchProductDialog } from "./branch-product-dialog";
import { ProductCatalogMetrics } from "./product-catalog-header";
import {
  CellText,
  DataTable,
  DataTableCell,
  DataTableDetailRow,
  DataTableEmpty,
  DataTableRow,
  RowIconAction,
  StatusLabel,
} from "./data-table";
import {
  activeCatalogMetric,
  catalogStockTone,
  catalogStockTotals,
  toggleCatalogMetric,
} from "./lib/product-catalog-metrics";
import { formatAmountTyping } from "./lib/amount-typing";
import { lotCostInput, typedCostMinor } from "./lib/lot-cost";
import {
  readCashRegisterChoice,
  ownRegisterId,
  resolveCashRegister,
  resolveSaleSession,
  saveCashRegisterChoice,
} from "./lib/active-cash-register";
import { SaleCashStatus } from "./cash-register-picker";
import { CashWorkspace } from "./cash-workspace";
import { MoneyInput } from "./money-input";
import { stockLevel } from "./lib/stock-level";
import {
  leadingLot,
  lotNumberMatches,
  productLots,
  productStockStatus,
  visibleProductLots,
} from "./lib/product-lots";
import { ProductLotsDetail } from "./product-lots-detail";
import { ProductLotCell } from "./product-lot-cell";
import { ProductCatalogToolbar } from "./product-catalog-toolbar";
import { matchesCatalogExtras } from "./lib/product-catalog-filters";
import {
  emptyCatalogAdditionalFilters,
  matchesCatalogAdditionalFilters,
} from "./lib/catalog-additional-filters";
import {
  InventoryFormActions,
  InventoryScanField,
} from "./inventory-form-parts";
import { InventorySearchSelect } from "./inventory-search-select";
import { InventoryStockTable } from "./inventory-stock-table";
import { InventoryLotInput } from "./inventory-lot-input";
import { InventoryLotPicker } from "./inventory-lot-picker";
import { InventoryToolbar } from "./inventory-toolbar";
import {
  emptyInventoryFilters,
  inventoryPage,
  inventoryRows,
  inventoryStockProductOptions,
  type InventoryFilters,
} from "./lib/inventory-products";
import {
  NO_SUPPLIER,
  noSupplierOption,
  inventoryAdjustSuppliers,
  inventoryDefaultAdjustSupplier,
  inventoryDefaultReturnSupplier,
  inventoryReturnSuppliers,
  inventorySupplierOption,
  inventoryProductOption,
  findScannedProduct,
  scanAutoDelay,
} from "./lib/inventory-search";
import { ProductFormSection } from "./product-form-section";
import { StatusToast } from "./status-toast";
import { UserPasswordDialog } from "./user-password-dialog";
import { OperationHistory } from "./operation-history";
import { shouldRouteSalesSearchKey } from "./lib/sales-search-key";
import { salesShortcut, type SalesShortcut } from "./lib/sales-shortcuts";
import { cashAmountDraft } from "./lib/sale-quick-amounts";
import { SaleCurrentPanel } from "./sale-current-panel";
import { SaleGeneralDiscount } from "./sale-general-discount";
import { SaleCheckoutDialog } from "./sale-checkout-dialog";
import { SaleConfirmedDialog } from "./sale-confirmed-dialog";
import {
  getDocumentTemplate,
  type DocumentTemplateSettings,
} from "./lib/document-template-api";
import { shouldFocusSalesBackground } from "./lib/sales-background-focus";
import { CatalogOptionsManager } from "./catalog-options-manager";
import { CatalogOptionSelect } from "./catalog-option-select";
import { createOrSelectCatalogOption } from "./lib/catalog-option";
import { StockAdjustmentCost } from "./stock-adjustment-cost";
import { StockAdjustmentQuantity } from "./stock-adjustment-quantity";
import {
  stockAdjustmentCost,
  stockAdjustmentDelta,
  type AdjustmentCostMode,
} from "./lib/stock-adjustment";
import { ProductSaveErrorDialog } from "./product-save-error-dialog";
import { MedicineReferenceNote } from "./medicine-reference-note";
import { medicineSources } from "./lib/medicine-search";
import { medicineNameIsFree } from "./lib/medicine-lookup";
import { getMedicinePacks } from "./lib/api";
import {
  intactPacks,
  packSaleProduct,
  type PurchasePack,
} from "./lib/purchase-pack";
import { ProductReferenceSource } from "./product-reference-source";
import { AlfaBetaMedicineCard } from "./alfabeta-medicine-card";
import { distributeSaleDiscount } from "./lib/sale-discount";
import { prepareAccountPayment } from "./lib/account-payment";
import { withStockAvailability } from "./lib/stock-availability";
import type { FormEvent, ReactElement } from "react";
import {
  Archive,
  ArchiveRestore,
  ArrowLeftRight,
  Pencil,
  X,
  ReceiptText,
  Boxes,
  Check,
  LayoutDashboard,
  Shapes,
  ClipboardList,
  ChartNoAxesCombined,
  ContactRound,
  NotebookTabs,
  CreditCard,
  HeartPulse,
  History,
  Minus,
  Package,
  Plus,
  ScanBarcode,
  Search,
  Save,
  ShoppingCart,
  ShieldCheck,
  Tags,
  Trash2,
  Users,
  Settings,
  Truck,
} from "lucide-react";

import {
  createCatalogProduct,
  createRole,
  createUser,
  createSale,
  cancelSale,
  createCustomerReturn,
  createTransfer,
  createSupplierReturn,
  adjustStock,
  dispatchTransfer,
  getBranches,
  getCash,
  getCustomerAccounts,
  type CustomerAccount,
  getCatalogProducts,
  getInventoryCosts,
  type InventoryCosts,
  getCatalogOptions,
  ensureDefaultCatalogCategories,
  searchMedicineReferences,
  addEquivalentBarcode,
  searchAlfaBeta,
  type AlfaBetaMatch,
  getParties,
  getPriceLists,
  getReportSummary,
  getRoles,
  getSales,
  getStock,
  getTransfers,
  getUserCreateOptions,
  getUsers,
  receiveStock,
  receiveTransfer,
  updateCatalogProduct,
  type BranchListItem,
  type CatalogProduct,
  type CatalogOptions,
  type MedicineReference,
  type SaleUnit,
  type CashRegister,
  type CashSession,
  type Party,
  type PriceList,
  type ReportSummary,
  type RoleListItem,
  type Sale,
  type StockLot,
  type Transfer,
  type UserCreateOptions,
  type UserListItem,
  updateUser,
} from "./lib/api";
import {
  effectiveSalePriceListId,
  salePriceListOptions,
} from "./lib/price-list-selection";

const views: { name: View; icon: typeof HeartPulse }[] = [
  { name: "Inicio", icon: LayoutDashboard },
  { name: "Ventas", icon: ShoppingCart },
  { name: "Productos", icon: Package },
  { name: "Categorías y laboratorios", icon: Shapes },
  { name: "Listas de precios", icon: Tags },
  { name: "Inventario", icon: Boxes },
  { name: "Caja", icon: CashRegisterIcon },
  { name: "Compras", icon: ClipboardList },
  { name: "Transferencias", icon: ArrowLeftRight },
  { name: "Reportes", icon: ChartNoAxesCombined },
  { name: "Clientes", icon: ContactRound },
  { name: "Cuentas corrientes", icon: NotebookTabs },
  { name: "Cuentas por pagar", icon: ReceiptText },
  { name: "Proveedores", icon: Truck },
];
const permissionGroups: {
  title: string;
  permissions: readonly (readonly [string, string])[];
}[] = [
  {
    title: "Usuarios y roles",
    permissions: [
      ["USER_READ", "Ver usuarios"],
      ["USER_MANAGE", "Crear y administrar usuarios"],
      ["ROLE_READ", "Ver roles y permisos"],
      ["ROLE_MANAGE", "Crear y administrar roles"],
    ],
  },
  {
    title: "Organización",
    permissions: [
      ["ORGANIZATION_READ", "Ver información de la organización"],
      ["ORGANIZATION_MANAGE", "Administrar organización y sucursales"],
    ],
  },
  {
    title: "Productos y contactos",
    permissions: [
      ["CATALOG_READ", "Ver productos, categorías y listas"],
      ["CATALOG_MANAGE", "Administrar productos, categorías y listas"],
      ["PARTY_READ", "Ver clientes y proveedores"],
      ["PARTY_MANAGE", "Administrar clientes y proveedores"],
    ],
  },
  {
    title: "Operación",
    permissions: [
      ["INVENTORY_READ", "Ver inventario"],
      ["INVENTORY_MANAGE", "Recibir y ajustar stock"],
      ["SALE_READ", "Ver ventas e historial"],
      ["SALE_MANAGE", "Registrar ventas, anulaciones y devoluciones"],
      ["CASH_READ", "Ver caja y movimientos"],
      ["CASH_MANAGE", "Abrir, cerrar y operar la caja"],
      ["PURCHASE_READ", "Ver compras"],
      ["PAYABLE_READ", "Ver cuentas por pagar"],
      ["PAYABLE_MANAGE", "Registrar facturas de proveedores"],
      ["PURCHASE_MANAGE", "Crear y recibir compras"],
      ["REPORT_READ", "Ver reportes"],
      ["REPORT_PROFIT_READ", "Ver costos y ganancias en reportes"],
      ["REPORT_EXPORT", "Exportar reportes"],
    ],
  },
];
const permissionLabels = Object.fromEntries(
  permissionGroups.flatMap(({ permissions }) => permissions),
) as Record<string, string>;
const permissionLabel = (code: string) => permissionLabels[code] ?? code;
const money = (minor: string | number) =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(
    Number(minor) / 100,
  );
// Sin busqueda se muestra todo el catalogo; el tope evita renderizar miles de filas.
const SALE_CATALOG_ROW_LIMIT = 200;

const parseArgentineAmountMinor = (value: string): number | undefined => {
  const cleaned = value.trim().replace(/[^\d.,]/g, "");
  if (!cleaned) return undefined;
  const commaIndex = cleaned.lastIndexOf(",");
  const normalized =
    commaIndex >= 0
      ? `${cleaned.slice(0, commaIndex).replace(/\./g, "")}.${cleaned
          .slice(commaIndex + 1)
          .replace(/[.,]/g, "")}`
      : cleaned
            .split(".")
            .every((part, index, parts) =>
              index === 0
                ? part.length > 0
                : part.length === 3 && index < parts.length,
            ) && cleaned.includes(".")
        ? cleaned.replace(/\./g, "")
        : cleaned;
  const amount = Number(normalized);
  return Number.isFinite(amount) ? Math.round(amount * 100) : undefined;
};

export function WorkspaceShell({
  email,
  displayName,
  organizationName,
  accessToken,
  organizationId,
  onLogout,
}: {
  email: string;
  displayName?: string;
  organizationName?: string;
  accessToken?: string;
  organizationId?: string;
  onLogout: () => void;
}): ReactElement {
  const [searchParams, setSearchParams] = useSearchParams();
  const sidebar = useWorkspaceSidebar();
  const { view, administrationTab, organizationTab, salesScreen } =
    readWorkspaceLocation(searchParams);
  useLayoutEffect(() => {
    const previous = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";
    return () => {
      window.history.scrollRestoration = previous;
    };
  }, []);
  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [view, administrationTab, organizationTab, salesScreen]);
  const setSalesScreen = (screen: "pos" | "history") =>
    setSearchParams(workspaceLocation(searchParams, "Ventas", screen));
  const [branches, setBranches] = useState<BranchListItem[]>([]);
  const [logoRevision, setLogoRevision] = useState(0);
  const [savedOrganizationName, setSavedOrganizationName] = useState<{
    organizationId: string;
    name: string;
  }>();
  const applyBranches = (items: BranchListItem[]) => {
    setBranches(items);
    const accessible = items.filter(
      (item) => item.active && item.canAccess !== false,
    );
    setBranchId((current) =>
      accessible.some((item) => item.id === current)
        ? current
        : (accessible[0]?.id ?? ""),
    );
  };
  const [branchId, setBranchId] = useState("");
  const [purchaseToolbarTarget, setPurchaseToolbarTarget] =
    useState<HTMLDivElement | null>(null);
  const [initialPurchaseId, setInitialPurchaseId] = useState<string>();
  const consumeInitialPurchase = useCallback(
    () => setInitialPurchaseId(undefined),
    [],
  );
  // Compra desde la que se registra una deuda en Cuentas por pagar.
  const [payablePurchaseId, setPayablePurchaseId] = useState<string>();
  const consumePayablePurchase = useCallback(
    () => setPayablePurchaseId(undefined),
    [],
  );
  const [accountToolbarTarget, setAccountToolbarTarget] =
    useState<HTMLDivElement | null>(null);
  const [cashToolbarTarget, setCashToolbarTarget] =
    useState<HTMLDivElement | null>(null);
  const [salesVisited, setSalesVisited] = useState(view === "Ventas");
  const [homeVisited, setHomeVisited] = useState(view === "Inicio");
  useEffect(() => {
    if (view === "Inicio") setHomeVisited(true);
  }, [view]);
  const accountsScope = `${organizationId}:${branchId}`;
  const [visitedCashScope, setVisitedCashScope] = useState("");
  useEffect(() => {
    if (view === "Caja" && organizationId && branchId)
      setVisitedCashScope(accountsScope);
  }, [view, organizationId, branchId, accountsScope]);
  const [visitedAccountsScope, setVisitedAccountsScope] = useState("");
  const [visitedSuppliersScope, setVisitedSuppliersScope] = useState("");
  useEffect(() => {
    if (view === "Proveedores" && organizationId)
      setVisitedSuppliersScope(organizationId);
  }, [view, organizationId]);
  const [visitedReportsScope, setVisitedReportsScope] = useState("");
  useEffect(() => {
    if (view === "Reportes" && organizationId)
      setVisitedReportsScope(organizationId);
  }, [view, organizationId]);
  useEffect(() => {
    if (view === "Cuentas corrientes" && organizationId && branchId)
      setVisitedAccountsScope(accountsScope);
  }, [view, organizationId, branchId, accountsScope]);
  const [pendingSale, setPendingSale] = useState(false);
  const [pendingSaleConfirmation, setPendingSaleConfirmation] = useState<
    { action: "branch"; branchId: string } | { action: "logout" } | null
  >(null);
  const [listEditingProduct, setListEditingProduct] =
    useState<CatalogProduct>();
  // Producto que Compras pide crear desde un renglón importado; `resolve`
  // devuelve el id guardado (o nada si se cerró sin guardar).
  const [purchaseNewProduct, setPurchaseNewProduct] = useState<{
    key: number;
    draft: { barcode: string; name: string };
    resolve: (productId?: string) => void;
  }>();
  const createProductForPurchase = useCallback(
    (draft: { barcode: string; name: string }) =>
      new Promise<string | undefined>((resolve) =>
        setPurchaseNewProduct((current) => {
          current?.resolve();
          return { key: Date.now(), draft, resolve };
        }),
      ),
    [],
  );
  useEffect(() => {
    setListEditingProduct(undefined);
  }, [view, organizationId]);
  useEffect(() => {
    if (view === "Ventas") setSalesVisited(true);
  }, [view]);
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [organizationProducts, setOrganizationProducts] = useState<
    CatalogProduct[]
  >([]);
  const operationalProducts = useMemo(
    () => products.filter((product) => product.active),
    [products],
  );
  const [stock, setStock] = useState<StockLot[]>([]);
  const [openSessions, setOpenSessions] = useState<CashSession[]>([]);
  const [chosenRegisterId, setChosenRegisterId] = useState("");
  const [defaultRegisterId, setDefaultRegisterId] = useState<string | null>(
    null,
  );
  const [allowWithoutSession, setAllowWithoutSession] = useState(true);
  const [registers, setRegisters] = useState<CashRegister[]>([]);
  const activeRegisterId = resolveCashRegister({
    registers,
    openSessions,
    chosen: chosenRegisterId,
    defaultRegisterId,
  });
  const cashSession = openSessions.find(
    (item) => item.cashRegisterId === activeRegisterId,
  );
  const saleSession = resolveSaleSession(openSessions, [
    chosenRegisterId,
    ownRegisterId(openSessions),
    defaultRegisterId,
  ]);
  const chooseRegister = (registerId: string) => {
    setChosenRegisterId(registerId);
    if (organizationId)
      saveCashRegisterChoice(organizationId, branchId, registerId);
  };
  useEffect(() => {
    if (organizationId)
      setChosenRegisterId(readCashRegisterChoice(organizationId, branchId));
  }, [organizationId, branchId]);
  const [message, setMessage] = useState<string>();
  const ready = Boolean(accessToken && organizationId && branchId);
  const refreshRevision = useRef(0);
  const refresh = async () => {
    if (!accessToken || !organizationId || !branchId) return;
    const revision = ++refreshRevision.current;
    const [catalog, lots, cash, sharedCatalog] = await Promise.all([
      getCatalogProducts(accessToken, organizationId, branchId),
      getStock(accessToken, organizationId, branchId),
      getCash(accessToken, organizationId, branchId),
      getCatalogProducts(accessToken, organizationId),
    ]);
    if (revision !== refreshRevision.current) return;
    setProducts(catalog);
    setOrganizationProducts(sharedCatalog);
    setStock(lots);
    setRegisters(cash.registers);
    setOpenSessions(cash.sessions.filter((item) => !item.closedAt));
    setDefaultRegisterId(cash.settings?.defaultRegisterId ?? null);
    setAllowWithoutSession(cash.settings?.allowWithoutSession ?? true);
  };
  useEffect(() => {
    if (accessToken && organizationId)
      void getBranches(accessToken, organizationId)
        .then((items) => {
          applyBranches(items);
        })
        .catch(() => setMessage("No se pudieron cargar las sucursales."));
  }, [accessToken, organizationId]);
  useEffect(() => {
    setProducts([]);
    setStock([]);
    void refresh().catch((error: unknown) =>
      setMessage(
        error instanceof Error
          ? error.message
          : "No se pudieron cargar los datos.",
      ),
    );
  }, [branchId]); // eslint-disable-line react-hooks/exhaustive-deps
  const setPage = (next: View) => {
    setSearchParams(
      workspaceLocation(
        searchParams,
        next,
        next === "Ventas" ? salesScreen : undefined,
      ),
    );
    setMessage(undefined);
  };
  const openAdministration = (tab: "users" | "roles") => {
    setSearchParams(workspaceLocation(searchParams, "Administración", tab));
    setMessage(undefined);
  };
  const branchSelector = (
    <AccountBranchSelector
      branches={branches.filter(
        (item) => item.active && item.canAccess !== false,
      )}
      value={branchId}
      onChange={(id) => {
        if (pendingSale)
          setPendingSaleConfirmation({ action: "branch", branchId: id });
        else setBranchId(id);
      }}
    />
  );
  const administrationButtonClass = (tab: "users" | "roles" | "branches") =>
    `flex min-h-11 w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left text-sm leading-5 ${(tab === "branches" ? view === "Organización" : view === "Administración" && administrationTab === tab) ? "border-[#cce8de] bg-[#e9f8f3] font-semibold text-[#087f70] shadow-[0_3px_10px_rgb(8_127_112_/_7%)]" : "border-transparent text-slate-600 hover:border-slate-100 hover:bg-[#f5f8fa] hover:text-slate-800"}`;
  return (
    <main
      ref={sidebar.shell}
      className="workspace-shell min-h-screen bg-[#f4f8fa] text-slate-900"
    >
      <header
        ref={sidebar.header}
        className={`workspace-header ${view === "Productos" ? "workspace-products-header" : ""} ${view === "Listas de precios" || view === "Clientes" || view === "Proveedores" || view === "Compras" || view === "Inventario" || view === "Productos" || view === "Inicio" || view === "Ventas" || view === "Caja" || view === "Cuentas corrientes" || view === "Categorías y laboratorios" || view === "Transferencias" ? "workspace-sales-header" : ""} flex h-[82px] items-center justify-between border-b border-slate-200 bg-white px-6`}
      >
        <div className="flex items-center gap-3">
          <SidebarToggle
            expanded={sidebar.expanded}
            onToggle={() => sidebar.setExpanded((value) => !value)}
          />
          <OrganizationLogo
            token={accessToken}
            organizationId={organizationId}
            revision={logoRevision}
          />
          <div className="workspace-brand-text">
            <p className="font-semibold">Sistema de Gestión</p>
            <p className="text-xs text-slate-500">
              {branches.find((item) => item.id === branchId)?.name ??
                "Cargando…"}
            </p>
          </div>
          {(view === "Compras" ||
            view === "Listas de precios" ||
            view === "Clientes" ||
            view === "Proveedores" ||
            view === "Inventario" ||
            view === "Productos" ||
            view === "Inicio" ||
            view === "Ventas" ||
            view === "Caja" ||
            view === "Cuentas corrientes" ||
            view === "Cuentas por pagar" ||
            view === "Categorías y laboratorios" ||
            view === "Transferencias" ||
            view === "Reportes") && (
            <h1 className="workspace-sales-title">
              {view === "Compras" ? (
                <ShoppingCart size={22} aria-hidden />
              ) : view === "Proveedores" ? (
                <Truck size={22} aria-hidden />
              ) : view === "Listas de precios" ? (
                <Tags size={22} aria-hidden />
              ) : view === "Clientes" ? (
                <ContactRound size={22} aria-hidden />
              ) : view === "Inventario" ? (
                <Boxes size={22} aria-hidden />
              ) : view === "Productos" ? (
                <Package size={22} aria-hidden />
              ) : view === "Inicio" ? (
                <LayoutDashboard size={22} aria-hidden />
              ) : view === "Ventas" ? (
                <ShoppingCart size={22} aria-hidden="true" />
              ) : view === "Categorías y laboratorios" ? (
                <Shapes size={22} aria-hidden />
              ) : view === "Cuentas corrientes" ? (
                <NotebookTabs size={22} aria-hidden />
              ) : view === "Cuentas por pagar" ? (
                <ReceiptText size={22} aria-hidden />
              ) : view === "Reportes" ? (
                <ChartNoAxesCombined size={22} aria-hidden />
              ) : view === "Transferencias" ? (
                <ArrowLeftRight size={22} aria-hidden />
              ) : (
                <CashRegisterIcon size={22} />
              )}
              {view}
            </h1>
          )}
        </div>
        <div className="workspace-header-actions flex items-center gap-3">
          {view === "Compras" && (
            <div
              className="flex items-center gap-2"
              ref={setPurchaseToolbarTarget}
            />
          )}
          {ready && view === "Inventario" && (
            <>
              <DistributionWorkspace
                key={`${email}:${organizationId}:${branchId}`}
                token={accessToken!}
                organizationId={organizationId!}
                branchId={branchId}
                userKey={email}
                products={products}
                stock={stock}
                done={() => void refresh()}
              />
              <OperationHistory
                key={`${view}-${organizationId}-${branchId}`}
                kind={view}
                token={accessToken!}
                organizationId={organizationId!}
                branchId={branchId}
                products={products}
                branches={branches}
              />
            </>
          )}
          {ready && view === "Transferencias" && (
            <OperationHistory
              key={`${view}-${organizationId}-${branchId}`}
              kind={view}
              token={accessToken!}
              organizationId={organizationId!}
              branchId={branchId}
              products={products}
              branches={branches}
            />
          )}
          {ready && view === "Productos" && (
            <CatalogUpdateStatus
              token={accessToken!}
              organizationId={organizationId!}
            />
          )}
          {view === "Cuentas corrientes" && (
            <div
              ref={setAccountToolbarTarget}
              className="flex flex-wrap items-center gap-2"
            />
          )}
          {view === "Caja" && (
            <div
              ref={setCashToolbarTarget}
              className="flex items-center gap-2"
            />
          )}
          {view === "Ventas" && (
            <div className="workspace-sales-actions">
              <SaleCashStatus
                registers={registers}
                openSessions={openSessions}
                session={saleSession}
                allowWithoutSession={allowWithoutSession}
                onChange={chooseRegister}
              />
              {salesScreen === "pos" ? (
                <button
                  type="button"
                  onClick={() => setSalesScreen("history")}
                  className="inline-flex h-11 items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-teal-700 shadow-sm hover:border-teal-300 hover:bg-teal-50"
                >
                  <History size={16} />
                  Historial
                </button>
              ) : null}
            </div>
          )}
          {accessToken && organizationId && branchId && (
            <NotificationBell
              userKey={email}
              key={`${email}:${organizationId}:${branchId}`}
              token={accessToken}
              organizationId={organizationId}
              branchId={branchId}
              branchName={
                branches.find((item) => item.id === branchId)?.name ??
                "Sucursal"
              }
              onNavigate={setPage}
            />
          )}
          <AccountMenu
            branchSelector={branchSelector}
            email={email}
            displayName={displayName}
            organizationName={
              savedOrganizationName &&
              savedOrganizationName.organizationId === organizationId
                ? savedOrganizationName.name
                : organizationName
            }
            branchName={
              branches.find((item) => item.id === branchId)?.name ?? "Cargando…"
            }
            onLogout={() => {
              if (pendingSale) setPendingSaleConfirmation({ action: "logout" });
              else onLogout();
            }}
          />
        </div>
      </header>
      <div
        data-sidebar={sidebar.expanded ? "expanded" : "collapsed"}
        className="workspace-layout grid min-h-[calc(100vh-5.125rem)] grid-cols-[252px_minmax(0,1fr)]"
      >
        <button
          className="workspace-navigation-backdrop"
          type="button"
          aria-label="Contraer barra lateral"
          onClick={() => sidebar.setExpanded(false)}
        />
        <NavigationRail
          collapsed={!sidebar.expanded}
          className="workspace-navigation border-r border-slate-200 bg-[#fcfefe] px-3 py-5"
        >
          <p className="px-3 pb-3 text-xs font-semibold tracking-wide text-slate-600">
            OPERACIÓN
          </p>
          <nav aria-label="Operación de farmacia" className="space-y-1">
            {views.map(({ name, icon: Icon }) => {
              const active = view === name;
              return (
                <button
                  key={name}
                  aria-label={name}
                  onClick={() => setPage(name)}
                  className={`flex min-h-11 w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left text-sm leading-5 ${active ? "border-[#cce8de] bg-[#e9f8f3] font-semibold text-[#087f70] shadow-[0_3px_10px_rgb(8_127_112_/_7%)]" : "border-transparent text-slate-600 hover:border-slate-100 hover:bg-[#f5f8fa] hover:text-slate-800"}`}
                >
                  <span
                    className={`grid size-6 shrink-0 place-items-center rounded-md ${active ? "bg-white text-[#087f70] shadow-sm" : "text-slate-500"}`}
                  >
                    <Icon className="size-4" />
                  </span>
                  <span>{name}</span>
                </button>
              );
            })}
          </nav>
          <p className="mt-8 px-3 pb-3 text-xs font-semibold tracking-wide text-slate-600">
            ADMINISTRACIÓN
          </p>
          <nav aria-label="Administración" className="space-y-1">
            <button
              type="button"
              onClick={() => openAdministration("users")}
              aria-label="Usuarios"
              className={administrationButtonClass("users")}
            >
              <span className="grid size-6 shrink-0 place-items-center text-current">
                <Users className="size-4" />
              </span>
              <span>Usuarios</span>
            </button>
            <button
              type="button"
              onClick={() => openAdministration("roles")}
              aria-label="Roles y permisos"
              className={administrationButtonClass("roles")}
            >
              <span className="grid size-6 shrink-0 place-items-center text-current">
                <ShieldCheck className="size-4" />
              </span>
              <span>Roles y permisos</span>
            </button>
            <button
              type="button"
              onClick={() => setPage("Organización")}
              aria-label="Organización"
              className={administrationButtonClass("branches")}
            >
              <span className="grid size-6 shrink-0 place-items-center text-current">
                <Settings className="size-4" />
              </span>
              <span>Organización</span>
            </button>
          </nav>
        </NavigationRail>
        <section
          className={`workspace-content min-w-0 bg-[#f4f8fa] p-4 lg:px-7 lg:py-3 ${view === "Transferencias" ? "flex flex-col" : ""}`}
        >
          {accessToken && organizationId && branches.length > 0 && !branchId ? (
            <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-700 shadow-sm">
              No tenés una sucursal asignada. Pedile a un administrador que te
              dé acceso desde Usuarios.
            </div>
          ) : null}
          {view !== "Ventas" &&
            view !== "Listas de precios" &&
            view !== "Caja" &&
            view !== "Cuentas corrientes" &&
            view !== "Cuentas por pagar" &&
            view !== "Categorías y laboratorios" &&
            view !== "Inicio" &&
            view !== "Productos" &&
            view !== "Inventario" &&
            view !== "Proveedores" &&
            view !== "Clientes" &&
            view !== "Compras" &&
            view !== "Transferencias" &&
            view !== "Reportes" && (
              <div className="workspace-page-heading flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h1 className="text-[28px] font-semibold tracking-tight text-slate-900">
                    {view}
                  </h1>
                </div>
              </div>
            )}
          {message ? (
            <StatusToast
              key={message}
              variant="error"
              title={
                message === "El efectivo requiere una caja abierta."
                  ? "Abrí una caja para cobrar"
                  : "Revisá esta operación"
              }
              message={
                message === "El efectivo requiere una caja abierta."
                  ? "Para registrar un pago en efectivo, primero abrí una sesión en Caja."
                  : message
              }
              onClose={() => setMessage(undefined)}
              action={
                message === "El efectivo requiere una caja abierta."
                  ? { label: "Ir a Caja", onClick: () => setPage("Caja") }
                  : undefined
              }
            />
          ) : null}
          {!ready ? (
            <p className="mt-8 bg-white p-5">Cargando permisos de operación…</p>
          ) : null}
          {ready && (view === "Inicio" || homeVisited) ? (
            <div hidden={view !== "Inicio"}>
              <Home
                key={`home:${organizationId}:${branchId}`}
                active={view === "Inicio"}
                branchName={
                  branches.find((item) => item.id === branchId)?.name ??
                  "Sucursal seleccionada"
                }
                onOpenSalesHistory={() => {
                  setSalesScreen("history");
                  setMessage(undefined);
                }}
                token={accessToken!}
                organizationId={organizationId!}
                branchId={branchId}
                products={operationalProducts}
                stock={stock}
                session={openSessions[0]}
                onNavigate={setPage}
              />
            </div>
          ) : null}
          {ready && view === "Productos" ? (
            <Products
              key={`products:${organizationId}:${branchId}`}
              knownProducts={organizationProducts}
              branchId={branchId}
              branchName={
                branches.find((item) => item.id === branchId)?.name ??
                "la sucursal seleccionada"
              }
              token={accessToken!}
              organizationId={organizationId!}
              products={products}
              stock={stock}
              done={() => void refresh()}
              error={setMessage}
            />
          ) : null}
          {ready && view === "Categorías y laboratorios" ? (
            <CatalogOptionsManager
              key={`catalog-options:${organizationId}`}
              token={accessToken!}
              organizationId={organizationId!}
              onError={setMessage}
            />
          ) : null}
          {ready ? (
            <PriceListsWorkspace
              key={`price-lists:${organizationId}`}
              active={view === "Listas de precios"}
              token={accessToken!}
              organizationId={organizationId!}
              products={organizationProducts}
              onError={setMessage}
              onEditProduct={setListEditingProduct}
            />
          ) : null}
          {ready && view === "Listas de precios" && listEditingProduct ? (
            <Products
              key={`${branchId}:${listEditingProduct.id}`}
              branchId={branchId}
              branchName={
                branches.find((item) => item.id === branchId)?.name ??
                "la sucursal seleccionada"
              }
              token={accessToken!}
              organizationId={organizationId!}
              products={products}
              stock={stock}
              initialProduct={listEditingProduct}
              onEditorClose={() => setListEditingProduct(undefined)}
              done={() => void refresh()}
              error={setMessage}
            />
          ) : null}
          {ready && view === "Inventario" ? (
            <Inventory
              key={`inventory:${organizationId}:${branchId}`}
              token={accessToken!}
              organizationId={organizationId!}
              branchId={branchId}
              products={products}
              stock={stock}
              done={() => void refresh()}
              error={setMessage}
              onPurchase={(id) => {
                setInitialPurchaseId(id);
                setPage("Compras");
              }}
            />
          ) : null}
          {ready && (view === "Ventas" || salesVisited) ? (
            <Sales
              key={`sales:${organizationId}:${branchId}`}
              userKey={email}
              allowWithoutSession={allowWithoutSession}
              active={view === "Ventas"}
              onPendingChange={setPendingSale}
              token={accessToken!}
              organizationId={organizationId!}
              branchId={branchId}
              products={operationalProducts}
              stock={stock}
              session={saleSession}
              cashChoiceRequired={openSessions.length > 1 && !saleSession}
              salesScreen={salesScreen}
              onSalesScreenChange={setSalesScreen}
              done={() => void refresh()}
              error={setMessage}
            />
          ) : null}
          {ready && (view === "Caja" || visitedCashScope === accountsScope) ? (
            <CashWorkspace
              key={`cash:${organizationId}:${branchId}`}
              active={view === "Caja"}
              branchName={
                branches.find((branch) => branch.id === branchId)?.name
              }
              toolbarTarget={cashToolbarTarget}
              token={accessToken!}
              organizationId={organizationId!}
              branchId={branchId}
              registers={registers}
              openSessions={openSessions}
              registerId={activeRegisterId}
              onRegisterChange={chooseRegister}
              session={cashSession}
              done={() => void refresh()}
              error={setMessage}
            />
          ) : null}
          {ready && view === "Clientes" ? (
            <CustomersWorkspace
              key={`customers:${organizationId}`}
              token={accessToken!}
              organizationId={organizationId!}
            />
          ) : null}
          {ready &&
          (view === "Cuentas corrientes" ||
            visitedAccountsScope === accountsScope) ? (
            <CustomerAccounts
              key={accountsScope}
              active={view === "Cuentas corrientes"}
              toolbarTarget={accountToolbarTarget}
              token={accessToken!}
              organizationId={organizationId!}
              branchId={branchId}
              organizationName={
                savedOrganizationName &&
                savedOrganizationName.organizationId === organizationId
                  ? savedOrganizationName.name
                  : organizationName
              }
              branchName={branches.find((item) => item.id === branchId)?.name}
              error={setMessage}
            />
          ) : null}
          {ready &&
          (view === "Proveedores" ||
            visitedSuppliersScope === organizationId) ? (
            <SuppliersWorkspace
              visible={view === "Proveedores"}
              key={`suppliers:${organizationId}`}
              token={accessToken!}
              organizationId={organizationId!}
            />
          ) : null}
          {accessToken && organizationId && view === "Organización" ? (
            <OrganizationWorkspace
              key={`organization:${organizationId}`}
              token={accessToken}
              organizationId={organizationId}
              tab={organizationTab}
              onTabChange={(tab) =>
                setSearchParams(
                  workspaceLocation(searchParams, "Organización", tab),
                )
              }
              onBranchesChange={applyBranches}
              onLogoSaved={() => setLogoRevision((value) => value + 1)}
              onNameChange={(name) =>
                setSavedOrganizationName({ organizationId, name })
              }
              onUsers={() => openAdministration("users")}
            />
          ) : null}
          {ready && view === "Administración" ? (
            <Administration
              token={accessToken!}
              organizationId={organizationId!}
              initialTab={administrationTab}
              onError={setMessage}
            />
          ) : null}
          {ready && view === "Cuentas por pagar" ? (
            <SupplierPayablesWorkspace
              key={`payables:${email}:${organizationId}:${branchId}`}
              token={accessToken!}
              organizationId={organizationId!}
              branchId={branchId}
              branchName={
                branches.find((b) => b.id === branchId)?.name ??
                "Sucursal actual"
              }
              userKey={email}
              initialPurchaseId={payablePurchaseId}
              onInitialConsumed={consumePayablePurchase}
              onPurchase={(id) => {
                setInitialPurchaseId(id);
                setPage("Compras");
              }}
            />
          ) : null}
          {ready && view === "Compras" ? (
            <PurchasesWorkspace
              key={`purchases:${email}:${organizationId}:${branchId}`}
              token={accessToken!}
              organizationId={organizationId!}
              branchId={branchId}
              products={products}
              toolbarTarget={purchaseToolbarTarget}
              branchName={
                branches.find((b) => b.id === branchId)?.name ??
                "Sucursal actual"
              }
              branches={branches}
              userKey={email}
              onChanged={() => void refresh()}
              initialPurchaseId={initialPurchaseId}
              onInitialConsumed={consumeInitialPurchase}
              onCreateProduct={createProductForPurchase}
              onRegisterDebt={(id) => {
                setPayablePurchaseId(id);
                setPage("Cuentas por pagar");
              }}
            />
          ) : null}
          {ready && view === "Compras" && purchaseNewProduct ? (
            <Products
              key={`purchase-product:${purchaseNewProduct.key}`}
              branchId={branchId}
              branchName={
                branches.find((item) => item.id === branchId)?.name ??
                "la sucursal seleccionada"
              }
              token={accessToken!}
              organizationId={organizationId!}
              products={products}
              stock={stock}
              initialNewProduct={purchaseNewProduct.draft}
              onSaved={(id) => purchaseNewProduct.resolve(id)}
              onEditorClose={() => {
                purchaseNewProduct.resolve();
                setPurchaseNewProduct(undefined);
              }}
              done={() => void refresh()}
              error={setMessage}
            />
          ) : null}
          {ready && view === "Transferencias" ? (
            <Transfers
              token={accessToken!}
              organizationId={organizationId!}
              branchId={branchId}
              branches={branches}
              products={operationalProducts}
              sharedProducts={organizationProducts}
              stock={stock}
              done={() => void refresh()}
              onError={setMessage}
            />
          ) : null}
          {ready &&
          (view === "Reportes" || visitedReportsScope === organizationId) ? (
            <div hidden={view !== "Reportes"}>
              <ReportsWorkspace
                key={`reports:${organizationId}`}
                active={view === "Reportes"}
                token={accessToken!}
                organizationId={organizationId!}
                search={searchParams}
                onSearchChange={setSearchParams}
              />
            </div>
          ) : null}
        </section>
      </div>
      {pendingSaleConfirmation ? (
        <PendingSaleConfirmDialog
          action={pendingSaleConfirmation.action}
          currentBranch={
            branches.find((branch) => branch.id === branchId)?.name ??
            "esta sucursal"
          }
          nextBranch={
            pendingSaleConfirmation.action === "branch"
              ? branches.find(
                  (branch) => branch.id === pendingSaleConfirmation.branchId,
                )?.name
              : undefined
          }
          onCancel={() => setPendingSaleConfirmation(null)}
          onConfirm={() => {
            const confirmation = pendingSaleConfirmation;
            setPendingSaleConfirmation(null);
            if (confirmation.action === "branch")
              setBranchId(confirmation.branchId);
            else onLogout();
          }}
        />
      ) : null}
    </main>
  );
}

function Home({
  active,
  branchName,
  onOpenSalesHistory,
  token,
  organizationId,
  branchId,
  products,
  stock,
  session,
  onNavigate,
}: {
  active: boolean;
  branchName: string;
  onOpenSalesHistory: () => void;
  token: string;
  organizationId: string;
  branchId: string;
  products: CatalogProduct[];
  stock: StockLot[];
  session?: CashSession;
  onNavigate: (view: View) => void;
}): ReactElement {
  const [summary, setSummary] = useState<ReportSummary>();
  const [summaryError, setSummaryError] = useState("");
  useEffect(() => {
    if (!active) return;
    let current = true;
    void getReportSummary(token, organizationId, branchId)
      .then((result) => {
        if (current) {
          setSummary(result);
          setSummaryError("");
        }
      })
      .catch(() => {
        if (current)
          setSummaryError(
            "No se pudo actualizar el resumen. Los datos visibles corresponden a la última consulta.",
          );
      });
    return () => {
      current = false;
    };
  }, [active, branchId, organizationId, token]);
  const expiring = stock.filter(
    (lot) =>
      lot.expiresAt &&
      new Date(lot.expiresAt) < new Date(Date.now() + 90 * 86400000),
  ).length;
  const metrics = [
    {
      label: "Ventas de hoy",
      value: summary ? money(summary.salesTodayMinor) : "—",
      help: summary
        ? `${summary.salesTodayCount} comprobantes emitidos`
        : "Actualizando actividad",
      tone: "bg-teal-50 text-teal-700",
    },
    {
      label: "Stock disponible",
      value: summary ? String(summary.stockUnits) : "—",
      help: `${summary?.stockLots ?? stock.length} lotes con trazabilidad`,
      tone: "bg-sky-50 text-sky-700",
    },
    {
      label: "Compras pendientes",
      value: summary ? String(summary.pendingPurchases) : "—",
      help: "Para recibir o revisar",
      tone: "bg-amber-50 text-amber-700",
    },
    {
      label: "Caja",
      value: session ? "Abierta" : "Cerrada",
      help: session
        ? "Sesión operativa activa"
        : "Abrí una sesión para efectivo",
      tone: session
        ? "bg-emerald-50 text-emerald-700"
        : "bg-slate-100 text-slate-600",
    },
  ];
  const expiringInThirtyDays = stock.filter(
    (lot) =>
      lot.expiresAt &&
      new Date(lot.expiresAt) < new Date(Date.now() + 30 * 86400000),
  ).length;
  const outOfStockProductCount = products.filter(
    (product) => !stock.some((lot) => lot.productId === product.id),
  ).length;
  const dashboardV2Enabled = Boolean(onNavigate);
  if (dashboardV2Enabled) {
    const alerts: DashboardAlert[] = [
      {
        note: "Revisá las existencias para evitar faltantes.",
        view: "Inventario",
        title: outOfStockProductCount
          ? `${outOfStockProductCount} producto${outOfStockProductCount === 1 ? "" : "s"} sin stock`
          : "Sin productos sin stock",
        status: outOfStockProductCount ? "Crítico" : "Normal",
        tone: outOfStockProductCount
          ? "bg-rose-100 text-rose-700"
          : "bg-emerald-100 text-emerald-700",
      },
      {
        note: "Consultá fechas y lotes en inventario.",
        view: "Inventario",
        title: expiringInThirtyDays
          ? `${expiringInThirtyDays} lote${expiringInThirtyDays === 1 ? "" : "s"} vence dentro de 30 días`
          : "Sin vencimientos durante los próximos 30 días",
        status: expiringInThirtyDays ? "Revisar" : "Normal",
        tone: expiringInThirtyDays
          ? "bg-amber-100 text-amber-800"
          : "bg-emerald-100 text-emerald-700",
      },
      {
        note: "Controlá las compras por recibir.",
        view: "Compras",
        title: !summary
          ? "Compras pendientes: sin información"
          : summary.pendingPurchases
            ? `${summary.pendingPurchases} compra${summary.pendingPurchases === 1 ? "" : "s"} pendiente${summary.pendingPurchases === 1 ? "" : "s"}`
            : "No hay compras pendientes",
        status: summary?.pendingPurchases ? "Pendiente" : "Normal",
        tone: summary?.pendingPurchases
          ? "bg-sky-100 text-sky-700"
          : "bg-emerald-100 text-emerald-700",
      },
      {
        title: session ? `Caja abierta en ${branchName}` : "Sin caja abierta",
        note: session
          ? "Consultá la sesión y sus movimientos."
          : "Abrí una sesión para operar en efectivo.",
        status: session ? "Normal" : "Revisar",
        tone: session
          ? "bg-emerald-100 text-emerald-700"
          : "bg-amber-100 text-amber-800",
        view: "Caja",
      },
    ];
    return (
      <div className="dashboard-home space-y-3 pb-2">
        {summaryError && (
          <p role="status" className="text-xs text-amber-700">
            {summaryError}
          </p>
        )}
        <div className="relative max-sm:[&_.dashboard-welcome]:pt-10">
          <div className="absolute right-0 top-0 z-20">
            <DashboardDate />
          </div>
          <DashboardWelcome branchName={branchName} />
        </div>
        <div>
          <DashboardMedicineSearch
            key={organizationId}
            token={token}
            organizationId={organizationId}
          />
        </div>
        <DashboardOverview
          salesTrend={summary?.salesTrend}
          inventoryBars={dashboardInventoryBars(products, stock)}
          sales={summary ? money(summary.salesTodayMinor) : "—"}
          tickets={summary ? String(summary.salesTodayCount) : "—"}
          outOfStock={outOfStockProductCount}
          expiring={expiringInThirtyDays}
          alerts={alerts}
          onNavigate={onNavigate}
        />
        <DashboardRecentSales
          active={active}
          token={token}
          organizationId={organizationId}
          branchId={branchId}
          onOpenHistory={onOpenSalesHistory}
        />
      </div>
    );
  }
  return (
    <div className="mt-8 space-y-5">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <article
            key={metric.label}
            className="inventory-side-form border bg-white p-5"
          >
            <span
              className={`inline-flex rounded-lg px-2.5 py-1 text-xs font-semibold ${metric.tone}`}
            >
              {metric.label}
            </span>
            <p className="mt-4 text-2xl font-semibold tracking-tight">
              {metric.value}
            </p>
            <p className="mt-1 text-xs text-slate-500">{metric.help}</p>
          </article>
        ))}
      </div>
      <div className="grid gap-5 xl:grid-cols-[1.25fr_.75fr]">
        <section className="border bg-white p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold">Estado operativo</h2>
              <p className="mt-1 text-sm text-slate-500">
                Alertas que conviene atender en la sucursal.
              </p>
            </div>
            <span className="rounded-full bg-teal-50 px-3 py-1 text-xs font-medium text-teal-700">
              Actualizado
            </span>
          </div>
          <div className="mt-5 divide-y">
            <div className="flex items-center justify-between gap-4 py-4">
              <div>
                <p className="font-medium">Vencimientos próximos</p>
                <p className="text-sm text-slate-500">
                  Lotes que vencen dentro de los próximos 90 días.
                </p>
              </div>
              <span
                className={`rounded-full px-3 py-1 text-sm font-semibold ${expiring ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-700"}`}
              >
                {expiring} lote{expiring === 1 ? "" : "s"}
              </span>
            </div>
            <div className="flex items-center justify-between gap-4 py-4">
              <div>
                <p className="font-medium">Sesiones de caja</p>
                <p className="text-sm text-slate-500">
                  Controlá los movimientos de efectivo durante el turno.
                </p>
              </div>
              <span className="text-sm font-medium text-slate-700">
                {summary?.openCashSessions ?? (session ? 1 : 0)} abierta
                {(summary?.openCashSessions ?? (session ? 1 : 0)) === 1
                  ? ""
                  : "s"}
              </span>
            </div>
            <div className="flex items-center justify-between gap-4 py-4">
              <div>
                <p className="font-medium">Inventario trazable</p>
                <p className="text-sm text-slate-500">
                  Cada salida se descuenta por lote y vencimiento (FEFO).
                </p>
              </div>
              <span className="text-sm font-medium text-teal-700">
                {summary?.stockLots ?? stock.length} lotes
              </span>
            </div>
          </div>
        </section>
        <section className="border bg-white p-6">
          <h2 className="font-semibold">Accesos rápidos</h2>
          <p className="mt-1 text-sm text-slate-500">
            Continuá con la operación diaria.
          </p>
          <div className="mt-5 space-y-3">
            <div className="rounded-xl border border-teal-100 bg-teal-50/60 p-4">
              <p className="font-medium text-teal-950">Nueva venta</p>
              <p className="mt-1 text-sm text-teal-800">
                Buscá, agregá productos y cobrá en una sola pantalla.
              </p>
            </div>
            <div className="rounded-xl border border-slate-100 p-4">
              <p className="font-medium">Recepción de mercadería</p>
              <p className="mt-1 text-sm text-slate-500">
                Registrá lote, vencimiento y costo para actualizar el stock.
              </p>
            </div>
            <div className="rounded-xl border border-slate-100 p-4">
              <p className="font-medium">Transferencias</p>
              <p className="mt-1 text-sm text-slate-500">
                Prepará y seguí los envíos entre sucursales.
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function Products({
  token,
  organizationId,
  branchId,
  branchName,
  products,
  knownProducts = products,
  stock,
  done,
  error,
  initialProduct,
  initialNewProduct,
  onSaved,
  onEditorClose,
}: {
  token: string;
  organizationId: string;
  products: CatalogProduct[];
  knownProducts?: CatalogProduct[];
  stock: StockLot[];
  done: () => void;
  error: (value: string) => void;
  initialProduct?: CatalogProduct;
  /** Abre sólo el editor de un producto nuevo con código y nombre precargados. */
  initialNewProduct?: { barcode: string; name: string };
  onSaved?: (productId: string) => void;
  onEditorClose?: () => void;
  branchId: string;
  branchName: string;
}): ReactElement {
  const [lifecycle, setLifecycle] = useState<{
    product: CatalogProduct;
    status: "ACTIVE" | "ARCHIVED" | "DELETED" | "PURGE";
  }>();
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [barcode, setBarcode] = useState("");
  const externalFilled = useRef<ReturnType<
    typeof externalProductFields
  > | null>(null);
  const [categoryId, setCategoryId] = useState("");
  const [laboratoryId, setLaboratoryId] = useState("");
  const [suggestedLaboratoryName, setSuggestedLaboratoryName] = useState("");
  const [activeIngredient, setActiveIngredient] = useState("");
  const [pharmaceuticalForm, setPharmaceuticalForm] = useState("");
  const [concentration, setConcentration] = useState("");
  const [presentation, setPresentation] = useState("");
  const [saleUnit, setSaleUnit] = useState<SaleUnit>("UNIT");
  const saleUnitEdited = useRef(false);
  const suggestedSaleUnit = useRef<"UNIT" | null>(null);
  const [prescriptionRequired, setPrescriptionRequired] = useState(false);
  const [brand, setBrand] = useState("");
  const externalBrand = useRef<string | null>(null);
  const [isMedication, setIsMedication] = useState(false);
  const [medicationMode, setMedicationMode] = useState<
    "auto" | "medicine" | "other"
  >("auto");
  const [description, setDescription] = useState("");
  const [editingProduct, setEditingProduct] = useState<CatalogProduct>();
  const [generateInternalBarcode, setGenerateInternalBarcode] = useState(false);
  const [fractionEnabled, setFractionEnabled] = useState(false);
  const [fractionDivisor, setFractionDivisor] = useState("2");
  const [fractionMarkup, setFractionMarkup] = useState("0");
  const [fractionBase, setFractionBase] = useState("");
  const [productImage, setProductImage] = useState<string | null | undefined>();
  const externalImage = useRef<string | null>(null);
  const [imageBusy, setImageBusy] = useState(false);
  const [options, setOptions] = useState<CatalogOptions>();
  const [optionCreating, setOptionCreating] = useState(false);
  const optionCreateLock = useRef(false);
  const [query, setQuery] = useState("");
  const [productPage, setProductPage] = useState({ key: "", page: 1 });
  const [categoryFilter, setCategoryFilter] = useState("");
  const [laboratoryFilter, setLaboratoryFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | "active" | "inactive">(
    "",
  );
  const [stockFilter, setStockFilter] = useState<
    "" | "available" | "out" | "low"
  >("");
  const [expiryFilter, setExpiryFilter] = useState("");
  const [lotQuery, setLotQuery] = useState("");
  const [priceListFilter, setPriceListFilter] = useState("");
  const [priceLists, setPriceLists] = useState<PriceList[]>([]);
  const [listPrices, setListPrices] = useState<{
    id: string;
    prices: Map<string, string | null>;
  }>();
  const [costs, setCosts] = useState<InventoryCosts>();
  const lastCosts = useMemo(
    () =>
      new Map(
        costs?.products.map((item) => [item.productId, item.unitCostMinor]),
      ),
    [costs],
  );
  const lotCosts = useMemo(
    () => new Map(costs?.lots.map((item) => [item.lotId, item.receipts])),
    [costs],
  );
  const lotAdjustments = useMemo(
    () => adjustmentsByLot(costs?.adjustments),
    [costs],
  );
  const lotSupplierNames = useMemo(
    () => supplierNamesById(costs?.suppliers),
    [costs],
  );
  // "Precio general" es lo que la tabla ya muestra como Público.
  const selectablePriceLists = priceLists.filter(
    (list) => list.name !== "Precio general",
  );
  const selectedPriceList = priceLists.find(
    (list) => list.id === priceListFilter,
  );
  useEffect(() => {
    let current = true;
    void getPriceLists(token, organizationId)
      .then((next) => {
        if (current) setPriceLists(next);
      })
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, [token, organizationId]);
  useEffect(() => {
    if (!priceListFilter) return;
    let current = true;
    void getEffectivePrices(token, organizationId, "", priceListFilter)
      .then((next) => {
        if (current)
          setListPrices({
            id: priceListFilter,
            prices: new Map(
              next.prices.map((item) => [item.productId, item.amountMinor]),
            ),
          });
      })
      .catch((cause: unknown) => {
        if (current)
          error(
            cause instanceof Error
              ? cause.message
              : "No se pudieron cargar los precios de la lista.",
          );
      });
    return () => {
      current = false;
    };
  }, [token, organizationId, priceListFilter, products]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    let current = true;
    void getInventoryCosts(token, organizationId, branchId)
      .then((next) => {
        if (current) setCosts(next);
      })
      // Sin permiso de inventario la columna queda sin dato.
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, [token, organizationId, branchId, stock]);
  const [additionalFilters, setAdditionalFilters] = useState(
    emptyCatalogAdditionalFilters,
  );
  const [formOpen, setFormOpen] = useState(false);
  const productEditorDialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (!formOpen) return;
    const dialog = productEditorDialog.current;
    dialog?.showModal();
    const input = dialog?.querySelector<HTMLInputElement>(
      "#external-product-code",
    );
    input?.focus({ preventScroll: true });
    input?.select();
    return () => dialog?.close();
  }, [formOpen]);
  const [expandedLots, setExpandedLots] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [referenceQuery, setReferenceQuery] = useState("");
  const [referenceSearchDone, setReferenceSearchDone] = useState(false);
  // Desplegable de resultados (catálogo propio y fuente externa): se abre al
  // escribir o buscar y se cierra al elegir, con Escape o con un clic afuera.
  const referenceSearchBox = useRef<HTMLDivElement>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  useEffect(() => {
    if (!searchOpen) return;
    const close = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !referenceSearchBox.current?.contains(event.target)
      )
        setSearchOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [searchOpen]);
  const [referenceResults, setReferenceResults] = useState<MedicineReference[]>(
    [],
  );
  const [referenceSource, setReferenceSource] =
    useState<MedicineReference["source"]>("official");
  const [alfaReferenceResults, setAlfaReferenceResults] = useState<
    AlfaBetaMatch[]
  >([]);
  const [selectedReference, setSelectedReference] =
    useState<MedicineReference>();
  const [referenceBarcodeWarning, setReferenceBarcodeWarning] = useState("");
  const [retailLinkSearchRevision, setRetailLinkSearchRevision] = useState(0);
  const [retailLinkHint, setRetailLinkHint] = useState("");
  const scannedMedicine = useRef<MedicineReference | null>(null);
  const priceLocked =
    isMedication &&
    (saleUnit === "BOX" || fractionEnabled) &&
    Boolean(
      (selectedReference && selectedReference.priceMinor !== null) ||
      (editingProduct?.externalReferenceSource &&
        editingProduct.externalReferenceName &&
        editingProduct.externalReferencePriceMinor != null),
    );
  const fractionLinked =
    isMedication &&
    Boolean(
      selectedReference ||
      (editingProduct?.externalReferenceSource &&
        editingProduct.externalReferenceName),
    );
  const fractionReferenceMinor = selectedReference
    ? selectedReference.priceMinor == null
      ? null
      : String(selectedReference.priceMinor)
    : (editingProduct?.externalReferencePriceMinor ?? null);
  const fractionBaseMinor = fractionLinked
    ? fractionReferenceMinor
    : parsePrice(fractionBase);
  const fractionResult = fractionalPricePreview(
    fractionBaseMinor,
    fractionDivisor,
    fractionMarkup,
  );
  const [referenceLoading, setReferenceLoading] = useState(false);
  const [referenceError, setReferenceError] = useState("");
  const [productSaveError, setProductSaveError] = useState("");
  const productSaveLock = useRef(false);
  const [productSaving, setProductSaving] = useState(false);
  const backdropPress = useRef(false);
  const referenceRequest = useRef<AbortController | null>(null);
  // Búsqueda mientras se escribe: espera una pausa para no consultar las
  // fuentes externas en cada tecla.
  const referenceTypingTimer = useRef<number | undefined>(undefined);
  // Código de barras que se copió desde la referencia elegida (no del envase).
  const referenceBarcodeCopied = useRef("");
  // EAN de un envase importado que se asocia al medicamento nacional elegido.
  const [importedBarcode, setImportedBarcode] = useState("");
  const [importTarget, setImportTarget] = useState<CatalogProduct>();
  // Códigos equivalentes cargados en un producto nuevo: se envían con el alta.
  const [pendingEquivalents, setPendingEquivalents] = useState<string[]>([]);
  const [newFormRevision, setNewFormRevision] = useState(0);
  // Código que se busca desde el buscador de arriba (escrito o escaneado). Es
  // distinto del código guardado del producto (`barcode`).
  const [searchCode, setSearchCode] = useState("");
  const productSearchInput = useRef<HTMLInputElement>(null);
  const scheduleReferenceSearch = (
    source: MedicineReference["source"],
    query: string,
  ) => {
    window.clearTimeout(referenceTypingTimer.current);
    referenceTypingTimer.current = undefined;
    if (query.trim().length < 3) return;
    referenceTypingTimer.current = window.setTimeout(() => {
      referenceTypingTimer.current = undefined;
      void searchReferences(source, undefined, query);
    }, 350);
  };
  const cancelReferenceSearch = () => {
    window.clearTimeout(referenceTypingTimer.current);
    referenceTypingTimer.current = undefined;
  };
  useEffect(
    () => () => referenceRequest.current?.abort(),
    [token, organizationId],
  );
  useEffect(() => {
    void ensureDefaultCatalogCategories(token, organizationId)
      .then(() => getCatalogOptions(token, organizationId))
      .then(setOptions)
      .catch((cause: unknown) =>
        error(
          cause instanceof Error
            ? cause.message
            : "No se pudieron cargar las opciones.",
        ),
      );
  }, [organizationId, token]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (imageBusy || productSaveLock.current || optionCreateLock.current)
      return;
    // Envase importado de un medicamento que ya está en el catálogo (abierto
    // para editar): primero se asocia el código; si choca con otro producto
    // no se guarda nada.
    const linkImported =
      editingProduct &&
      importedBarcode &&
      importTarget?.id === editingProduct.id
        ? importedBarcode
        : "";
    productSaveLock.current = true;
    setProductSaving(true);
    let savedId: string | undefined;
    try {
      if (!initialProduct && fractionEnabled && fractionResult === null)
        throw new Error(
          "Revisá el precio base, el divisor (entero mayor a cero) y el recargo del fraccionamiento.",
        );
      const fractionInput = initialProduct
        ? {}
        : {
            priceDivisor: fractionEnabled ? Number(fractionDivisor) : null,
            priceMarkupBps: fractionEnabled
              ? Number(parsePrice(fractionMarkup))
              : 0,
            priceBaseMinor:
              fractionEnabled && !fractionLinked
                ? Number(fractionBaseMinor)
                : null,
          };
      if (editingProduct) {
        if (linkImported)
          await addEquivalentBarcode(
            token,
            organizationId,
            editingProduct.id,
            linkImported,
          );
        savedId = editingProduct.id;
        await updateCatalogProduct(token, organizationId, editingProduct.id, {
          generateInternalBarcode,
          brand,
          isMedication,
          ...fractionInput,
          imageDataUrl: productImage,
          name,
          priceMinor:
            !initialProduct &&
            !fractionEnabled &&
            (selectedReference || !priceLocked)
              ? Math.round(Number(price) * 100)
              : undefined,
          barcode,
          categoryId: categoryId || null,
          laboratoryId: laboratoryId || null,
          activeIngredient,
          pharmaceuticalForm,
          concentration,
          presentation,
          saleUnit,
          prescriptionRequired,
          description,
          ...(isMedication && selectedReference
            ? {
                externalReferenceSource: selectedReference.source,
                externalReferenceName: selectedReference.name,
                externalReferencePresentation: selectedReference.presentation,
                externalReferenceBarcode: selectedReference.barcode,
                externalReferencePriceMinor:
                  selectedReference.priceMinor ?? undefined,
              }
            : {}),
        });
      } else {
        ({ id: savedId } = await createCatalogProduct(token, organizationId, {
          generateInternalBarcode,
          brand: brand || undefined,
          isMedication,
          ...fractionInput,
          imageDataUrl: productImage ?? undefined,
          name,
          priceMinor: fractionEnabled
            ? Number(fractionResult)
            : Math.round(Number(price) * 100),
          barcode: barcode || undefined,
          categoryId: categoryId || undefined,
          laboratoryId: laboratoryId || undefined,
          laboratoryName:
            laboratoryId || !suggestedLaboratoryName
              ? undefined
              : suggestedLaboratoryName,
          activeIngredient: activeIngredient || undefined,
          pharmaceuticalForm: pharmaceuticalForm || undefined,
          concentration: concentration || undefined,
          presentation: presentation || undefined,
          saleUnit,
          prescriptionRequired,
          description: description || undefined,
          equivalentBarcodes: [
            ...(importedBarcode ? [importedBarcode] : []),
            ...pendingEquivalents,
          ].filter(
            (code, index, all) =>
              all.findIndex(
                (other) => externalGtin(other) === externalGtin(code),
              ) === index,
          ),
          ...(isMedication && selectedReference
            ? {
                externalReferenceSource: selectedReference.source,
                externalReferenceName: selectedReference.name,
                externalReferencePresentation: selectedReference.presentation,
                externalReferenceBarcode: selectedReference.barcode,
                externalReferencePriceMinor:
                  selectedReference.priceMinor ?? undefined,
              }
            : {}),
        }));
      }
      if (savedId) onSaved?.(savedId);
      clearForm();
      done();
    } catch (cause) {
      setProductSaveError(
        cause instanceof Error
          ? cause.message
          : "No se pudo guardar. Intentá nuevamente.",
      );
    } finally {
      productSaveLock.current = false;
      setProductSaving(false);
    }
  };
  // El medicamento nacional elegido para un envase importado ya está en el
  // catálogo: se le agrega el código en vez de crear un duplicado.
  const existingNationalProduct =
    !editingProduct && importedBarcode && barcode.trim()
      ? findProductByBarcode([...products, ...knownProducts], barcode)
      : undefined;
  // El código escrito o escaneado ya pertenece a un producto del catálogo
  // (como principal o como equivalente): en vez de crear otro, se abre ese
  // producto para modificarlo con los datos del padrón ya buscados.
  const searchedOwner =
    searchCode && !importedBarcode
      ? findProductByBarcode([...products, ...knownProducts], searchCode)
      : undefined;
  const barcodeOwner =
    searchedOwner && searchedOwner.id !== editingProduct?.id
      ? searchedOwner
      : undefined;
  const [openedFromScan, setOpenedFromScan] = useState("");
  // Código nacional cuya referencia se aplica sola al volver la búsqueda.
  const autoApplyBarcode = useRef("");
  useEffect(() => {
    if (!barcodeOwner) return;
    const owner = barcodeOwner;
    const scanned = searchCode;
    const national = primaryBarcodeOf(owner) ?? scanned;
    edit(owner);
    // El buscador conserva el código escaneado; el producto abierto es otro
    // formulario con su propio código guardado.
    setSearchCode(scanned);
    setReferenceQuery(scanned);
    setOpenedFromScan(
      barcodeKindOf(owner, scanned) === "EQUIVALENT"
        ? `Encontrado: envase importado de “${owner.name}”. Revisá y guardá los cambios.`
        : `Encontrado en tu catálogo: “${owner.name}”. Revisá y guardá los cambios.`,
    );
    if (!owner.isMedication && !owner.externalReferenceSource) return;
    autoApplyBarcode.current = national;
    void searchReferences("official", undefined, national);
  }, [barcodeOwner?.id, searchCode]); // eslint-disable-line react-hooks/exhaustive-deps
  // Si la búsqueda trae una sola presentación con ese código, se precarga.
  useEffect(() => {
    const code = autoApplyBarcode.current;
    if (!code || referenceLoading || !referenceSearchDone) return;
    autoApplyBarcode.current = "";
    const exact = referenceResults.filter(
      (reference) => externalGtin(reference.barcode) === externalGtin(code),
    );
    // Sin coincidencia única se abre Cambiar vinculación para elegir a mano.
    if (exact.length === 1) applyReference(exact[0]!);
    else if (referenceResults.length) {
      setRetailLinkSearchRevision((value) => value + 1);
      setSearchOpen(true);
    }
  }, [referenceResults, referenceLoading, referenceSearchDone]); // eslint-disable-line react-hooks/exhaustive-deps
  // Medicamentos del catálogo que coinciden con lo escrito mientras se asocia
  // un envase importado: elegir uno le agrega el código al instante.
  // Por nombre o por código del nacional.
  const importQuery = referenceQuery.trim();
  // Productos propios que coinciden con lo escrito en el buscador: aparecen
  // primero en el desplegable. Asociando un importado sólo medicamentos (y
  // también por código del nacional); si no, cualquier producto por nombre.
  const importCatalogMatches = (
    importedBarcode && /^\d{8,14}$/.test(importQuery)
      ? [findProductByBarcode([...products, ...knownProducts], importQuery)]
      : /^\d+$/.test(importQuery)
        ? []
        : medicinesByName(
            [...products, ...knownProducts],
            importQuery,
            5,
            Boolean(importedBarcode),
          )
  )
    .filter((product): product is CatalogProduct => Boolean(product))
    .filter(
      (product) =>
        product.id !== importTarget?.id && product.id !== editingProduct?.id,
    );
  // Abrir un producto propio elegido en el buscador para modificarlo.
  const openCatalogProduct = (product: CatalogProduct) => {
    edit(product);
    setReferenceQuery("");
    setReferenceSearchDone(false);
    setOpenedFromScan(
      `Encontrado en tu catálogo: “${product.name}”. Revisá y guardá los cambios.`,
    );
  };
  // Producto del catálogo al que se asocia el envase importado al guardar:
  // el elegido en la búsqueda o el que ya tiene el código nacional copiado.
  const importLinkTarget = importedBarcode
    ? (importTarget ?? existingNationalProduct)
    : undefined;
  // El nacional ya está en el catálogo: se abre ese producto con sus datos y
  // el envase importado queda pendiente hasta Guardar y asociar código.
  const openImportTarget = (product: CatalogProduct) => {
    const code = importedBarcode;
    edit(product);
    setImportedBarcode(code);
    setImportTarget(product);
    setReferenceQuery("");
    setReferenceSearchDone(false);
  };
  useEffect(() => {
    if (existingNationalProduct) openImportTarget(existingNationalProduct);
  }, [existingNationalProduct?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const startImportedLink = (code: string) => {
    cancelReferenceSearch();
    referenceRequest.current?.abort();
    referenceBarcodeCopied.current = "";
    setImportedBarcode(code.trim());
    setImportTarget(undefined);
    setBarcode("");
    setMedicationMode("medicine");
    setIsMedication(true);
    if (!saleUnitEdited.current) setSaleUnit("BOX");
    // El buscador queda libre para buscar el nacional por nombre.
    setSearchCode("");
    setReferenceQuery("");
    setReferenceResults([]);
    setReferenceSearchDone(false);
    setRetailLinkHint("");
    window.setTimeout(() => productSearchInput.current?.focus(), 0);
  };
  // Cada código nuevo del buscador empieza un formulario limpio con ese código;
  // si es de un producto del catálogo, el efecto de `barcodeOwner` lo abre.
  // Un código de uso interno (no GTIN) sólo sirve si ya está en el catálogo.
  const startCodeSearch = (value: string) => {
    const code = value.trim();
    if (code === searchCode) return;
    if (
      !externalGtin(code) &&
      !findProductByBarcode([...products, ...knownProducts], code)
    )
      return;
    clearForm(true);
    setReferenceQuery(code);
    setSearchCode(code);
    setBarcode(code);
  };
  // `keepOpen` vacía el formulario sin cerrarlo: lo usa cada búsqueda por
  // código para empezar de cero, sin restos (foto incluida) del anterior.
  const clearForm = (keepOpen = false) => {
    if (optionCreateLock.current) return;
    setFractionEnabled(false);
    setFractionDivisor("2");
    setFractionMarkup("0");
    setFractionBase("");
    if (!keepOpen) onEditorClose?.();
    setProductImage(undefined);
    externalImage.current = null;
    setImageBusy(false);
    setProductSaveError("");
    referenceRequest.current?.abort();
    setFormOpen(keepOpen);
    setSearchCode("");
    setPendingEquivalents([]);
    setNewFormRevision((value) => value + 1);
    setEditingProduct(undefined);
    setGenerateInternalBarcode(false);
    setName("");
    setPrice("");
    setBarcode("");
    externalFilled.current = null;
    scannedMedicine.current = null;
    saleUnitEdited.current = false;
    suggestedSaleUnit.current = null;
    setCategoryId("");
    setLaboratoryId("");
    setSuggestedLaboratoryName("");
    setActiveIngredient("");
    setPharmaceuticalForm("");
    setConcentration("");
    setPresentation("");
    setSaleUnit("UNIT");
    setPrescriptionRequired(false);
    setBrand("");
    externalBrand.current = null;
    setIsMedication(false);
    setMedicationMode("auto");
    setDescription("");
    cancelReferenceSearch();
    referenceBarcodeCopied.current = "";
    autoApplyBarcode.current = "";
    setOpenedFromScan("");
    setImportedBarcode("");
    setImportTarget(undefined);
    setReferenceQuery("");
    setSelectedReference(undefined);
    setReferenceSearchDone(false);
    setReferenceResults([]);
    setReferenceSource("official");
    setAlfaReferenceResults([]);
    setReferenceLoading(false);
    setReferenceError("");
    setReferenceBarcodeWarning("");
    setRetailLinkSearchRevision(0);
    setRetailLinkHint("");
  };
  const searchReferences = async (
    source: MedicineReference["source"],
    retailName?: string,
    query?: string,
  ) => {
    cancelReferenceSearch();
    referenceRequest.current?.abort();
    const controller = new AbortController();
    referenceRequest.current = controller;
    setAlfaReferenceResults([]);
    const queryText = (retailName ?? query ?? referenceQuery).trim();
    setReferenceSearchDone(true);
    setReferenceSource(source);
    setReferenceResults([]);
    setReferenceError("");
    setReferenceBarcodeWarning("");
    if (!retailName) setRetailLinkHint("");
    if (queryText.length < 2) return;
    setReferenceLoading(true);
    try {
      if (source === "alfabeta") {
        const found = await searchAlfaBeta(
          token,
          organizationId,
          queryText,
          controller.signal,
        );
        if (!controller.signal.aborted) setAlfaReferenceResults(found);
        return;
      }
      let found: MedicineReference[];
      try {
        found = await searchMedicineReferences(
          token,
          organizationId,
          queryText,
          source,
          controller.signal,
        );
      } catch (cause) {
        if (source !== "official" || !retailName || controller.signal.aborted)
          throw cause;
        setRetailLinkHint(
          "El padrón oficial no respondió. Buscamos una referencia por nombre; revisá la presentación antes de vincular.",
        );
        setReferenceSource("preciosderemedios");
        found = await searchMedicineReferences(
          token,
          organizationId,
          retailMedicineNameQuery(queryText),
          "preciosderemedios",
          controller.signal,
        );
        if (!controller.signal.aborted) setReferenceResults(found);
        return;
      }
      if (controller.signal.aborted) return;
      if (source === "official" && retailName) {
        const compatible = compatibleRetailMedicineReferences(barcode, found);
        if (compatible.length) {
          setReferenceResults(compatible);
          setRetailLinkHint(
            "Encontramos posibles referencias oficiales. Revisá la presentación antes de vincular.",
          );
          return;
        }
        setRetailLinkHint(
          "El padrón no tiene una coincidencia segura con este código. Buscamos otra referencia por nombre; revisá la presentación antes de vincular.",
        );
        setReferenceSource("preciosderemedios");
        const alternatives = await searchMedicineReferences(
          token,
          organizationId,
          retailMedicineNameQuery(queryText),
          "preciosderemedios",
          controller.signal,
        );
        if (!controller.signal.aborted) setReferenceResults(alternatives);
        return;
      }
      setReferenceResults(found);
    } catch (cause) {
      if (!controller.signal.aborted)
        setReferenceError(
          cause instanceof Error
            ? cause.message
            : "No se pudo consultar la fuente de medicamentos.",
        );
    } finally {
      if (!controller.signal.aborted) setReferenceLoading(false);
    }
  };
  // Elegir un resultado de la búsqueda. Si el formulario es una búsqueda (un
  // producto nuevo, o uno que se abrió desde el buscador), cada resultado
  // empieza un formulario limpio, sin avisos ni restos del anterior. Sólo al
  // editar un producto abierto desde la lista (o asociando un importado) se
  // reemplazan sus datos y se avisa si cambia el código.
  const pickReference = (reference: MedicineReference) => {
    // Una sola elección: al elegir cualquier resultado (catálogo o fuente
    // externa) se cierra todo el desplegable.
    setSearchOpen(false);
    if ((editingProduct && !openedFromScan) || importedBarcode) {
      applyReference(reference);
      return;
    }
    const query = referenceQuery;
    clearForm(true);
    setReferenceQuery(query);
    applyReference(reference, false, true);
  };
  const applyReference = (
    reference: MedicineReference,
    fromScan = false,
    fresh = false,
  ) => {
    // Elegir un medicamento de la búsqueda confirma que es medicamento, aunque
    // el interruptor estuviera apagado.
    setMedicationMode("medicine");
    cancelReferenceSearch();
    setReferenceBarcodeWarning("");
    // Elegir una referencia de la lista reemplaza todo el medicamento, también
    // el código de barras. Si había otro código se avisa para cotejar el envase.
    if (!fromScan) {
      const nextBarcode = medicineReferenceBarcodeToCopy("", reference.barcode);
      const copied = referenceBarcodeCopied.current;
      if (nextBarcode) {
        if (!fresh && medicineReferenceBarcodeConflict(barcode, nextBarcode))
          setReferenceBarcodeWarning(
            `Se reemplazó el código ${barcode.trim()} por ${nextBarcode}, el que informa la presentación elegida. Revisá que coincida con el envase.`,
          );
        referenceBarcodeCopied.current = nextBarcode;
        setBarcode(nextBarcode);
      } else if (
        !fresh &&
        copied &&
        !medicineReferenceBarcodeConflict(barcode, copied)
      ) {
        referenceBarcodeCopied.current = "";
        setBarcode("");
      }
      scannedMedicine.current = null;
    }
    // Al cambiar de referencia, los datos que traía la anterior y la nueva no
    // informa se limpian para no mezclar dos medicamentos.
    const previous = fresh ? undefined : selectedReference;
    const fromPrevious = (current: string, value: string | undefined) =>
      Boolean(previous && value && current === value);
    // Empezando limpio ya no se edita el producto que estaba abierto (el
    // cierre todavía lo ve hasta el próximo render).
    const editing = fresh ? undefined : editingProduct;
    setIsMedication(true);
    if (!editing && (fresh || !saleUnitEdited.current)) setSaleUnit("BOX");
    setSelectedReference(reference);
    if (!editing) setName(reference.name);
    if (reference.priceMinor !== null)
      setPrice(String(reference.priceMinor / 100));
    else
      setPrice((current) =>
        fromPrevious(
          current,
          previous?.priceMinor != null
            ? String(previous.priceMinor / 100)
            : undefined,
        )
          ? ""
          : current,
      );
    if (reference.activeIngredient)
      setActiveIngredient(reference.activeIngredient);
    else
      setActiveIngredient((current) =>
        fromPrevious(current, previous?.activeIngredient) ? "" : current,
      );
    setPresentation(reference.presentation);
    if (reference.pharmaceuticalForm)
      setPharmaceuticalForm(reference.pharmaceuticalForm);
    else
      setPharmaceuticalForm((current) =>
        fromPrevious(current, previous?.pharmaceuticalForm) ? "" : current,
      );
    if (reference.concentration) setConcentration(reference.concentration);
    else
      setConcentration((current) =>
        fromPrevious(current, previous?.concentration) ? "" : current,
      );
    if (reference.prescriptionRequired !== undefined)
      setPrescriptionRequired(reference.prescriptionRequired);
    else if (previous?.prescriptionRequired) setPrescriptionRequired(false);
    const medicationCategory = findMedicationCategory(options?.categories);
    if (medicationCategory) setCategoryId(medicationCategory.id);
    const matchedLaboratory = options?.laboratories.find(
      (laboratory) =>
        laboratory.name.trim().toLocaleLowerCase("es-AR") ===
        reference.laboratory.trim().toLocaleLowerCase("es-AR"),
    );
    if (matchedLaboratory) {
      setLaboratoryId(matchedLaboratory.id);
      setSuggestedLaboratoryName("");
    } else {
      setLaboratoryId("");
      setSuggestedLaboratoryName(reference.laboratory);
    }
    setReferenceResults([]);
    setReferenceSearchDone(false);
    setAlfaReferenceResults([]);
    setRetailLinkHint("");
  };
  const applyRetailMedicine = (reference: RetailMedicine) => {
    setMedicationMode("medicine");
    setIsMedication(true);
    setSelectedReference(undefined);
    setName(reference.name);
    setPresentation(reference.presentation);
    setBrand(reference.brand);
    setReferenceQuery(reference.name);
    setRetailLinkSearchRevision((value) => value + 1);
    setRetailLinkHint(
      "Buscando una referencia para vincular este medicamento…",
    );
    void searchReferences("official", reference.name);
    externalBrand.current = reference.brand || null;
    if (!saleUnitEdited.current) setSaleUnit("BOX");
    const medicationCategory = findMedicationCategory(options?.categories);
    if (medicationCategory) setCategoryId(medicationCategory.id);
  };
  const clearMismatchedReference = (value: string) => {
    setReferenceBarcodeWarning("");
    if (
      !selectedReference ||
      !medicineReferenceBarcodeConflict(value, selectedReference.barcode)
    )
      return;
    const referencePrice = selectedReference.priceMinor;
    if (referencePrice !== null)
      setPrice((current) =>
        current === String(referencePrice / 100) ? "" : current,
      );
    setSelectedReference(undefined);
    setReferenceBarcodeWarning(
      "El nuevo código no coincide con la ficha vinculada. Revisá el envase y elegí de nuevo la referencia.",
    );
  };
  const edit = (product: CatalogProduct) => {
    setOpenedFromScan("");
    setSearchCode("");
    autoApplyBarcode.current = "";
    setImportedBarcode("");
    setImportTarget(undefined);
    setMedicationMode(
      (product.isMedication ?? Boolean(product.externalReferenceSource))
        ? "medicine"
        : "other",
    );
    externalBrand.current = null;
    setBrand(product.brand ?? "");
    setIsMedication(
      product.isMedication ??
        Boolean(
          product.externalReferenceSource || product.prescriptionRequired,
        ),
    );
    setFractionEnabled(product.priceDivisor != null);
    setFractionDivisor(String(product.priceDivisor ?? 2));
    setFractionMarkup(String((product.priceMarkupBps ?? 0) / 100));
    setFractionBase(
      String(
        Number(product.priceBaseMinor ?? product.prices[0]?.amountMinor ?? 0) /
          100,
      ),
    );
    setProductImage(undefined);
    setImageBusy(false);
    referenceRequest.current?.abort();
    setReferenceSource(product.externalReferenceSource ?? "official");
    setReferenceQuery("");
    setReferenceResults([]);
    setAlfaReferenceResults([]);
    setReferenceSearchDone(false);
    setReferenceError("");
    setReferenceLoading(false);
    setRetailLinkSearchRevision(0);
    setRetailLinkHint("");
    setFormOpen(true);
    setReferenceBarcodeWarning("");
    setEditingProduct(product);
    setGenerateInternalBarcode(false);
    setSuggestedLaboratoryName("");
    setSelectedReference(undefined);
    setName(product.name);
    setPrice(String(Number(product.prices[0]?.amountMinor ?? 0) / 100));
    setBarcode(
      product.barcodes.find(
        (item) => item.primary === true || item.primary === undefined,
      )?.code ?? "",
    );
    setCategoryId(product.category?.id ?? "");
    setLaboratoryId(product.laboratory?.id ?? "");
    setActiveIngredient(product.activeIngredient ?? "");
    setPharmaceuticalForm(product.pharmaceuticalForm ?? "");
    setConcentration(product.concentration ?? "");
    setPresentation(product.presentation ?? "");
    setSaleUnit(product.saleUnit);
    setPrescriptionRequired(product.prescriptionRequired);
    setDescription(product.description ?? "");
  };
  useEffect(() => {
    if (initialProduct) edit(initialProduct);
  }, [initialProduct]);
  // Desde Compras: igual que escanear el código en Nuevo producto (busca la
  // referencia y, si el código ya es de otro producto, abre ése), con el
  // nombre de la factura mientras no llegue el del padrón.
  useEffect(() => {
    if (!initialNewProduct) return;
    const code = initialNewProduct.barcode.trim();
    if (externalGtin(code)) startCodeSearch(code);
    else {
      clearForm(true);
      setBarcode(code);
    }
    setName(initialNewProduct.name);
  }, [initialNewProduct]); // eslint-disable-line react-hooks/exhaustive-deps
  const toggleProductActive = (product: CatalogProduct) => {
    setLifecycle({ product, status: product.active ? "ARCHIVED" : "ACTIVE" });
  };
  const remove = (product: CatalogProduct) => {
    setLifecycle({ product, status: product.active ? "PURGE" : "DELETED" });
  };
  const createProductOption = async (
    type: keyof CatalogOptions,
    name: string,
    parentId?: string | null,
  ) => {
    if (optionCreateLock.current || productSaveLock.current || !options)
      throw new Error("Esperá a que termine la operación actual.");
    optionCreateLock.current = true;
    setOptionCreating(true);
    try {
      const item = await createOrSelectCatalogOption(
        token,
        organizationId,
        type,
        name,
        options[type],
        parentId,
      );
      if (type === "categories") {
        const fresh = await getCatalogOptions(token, organizationId);
        setOptions(fresh);
        return fresh.categories.find((option) => option.id === item.id) ?? item;
      }
      setOptions((current) =>
        current
          ? {
              ...current,
              [type]: [
                ...current[type].filter((option) => option.id !== item.id),
                item,
              ].sort((a, b) => a.name.localeCompare(b.name, "es")),
            }
          : current,
      );
      return item;
    } finally {
      optionCreateLock.current = false;
      setOptionCreating(false);
    }
  };
  const stockTotals = catalogStockTotals(stock);
  const stockForProduct = (productId: string) =>
    stockTotals.physical.get(productId) ?? 0;
  const stockToneForProduct = (productId: string) =>
    catalogStockTone(
      stockForProduct(productId),
      stockTotals.sellable.get(productId) ?? 0,
    );
  const categoryIds = categoryFilter
    ? categoryBranch(options?.categories ?? [], categoryFilter)
    : null;
  const filteredProducts = products.filter((product) => {
    const matchesQuery = matchesCatalogExtras(
      product,
      stock,
      query,
      expiryFilter,
      "",
    );
    return (
      matchesQuery &&
      matchesCatalogAdditionalFilters(product, additionalFilters) &&
      (!categoryIds || categoryIds.has(product.category?.id ?? "")) &&
      (!laboratoryFilter || product.laboratory?.id === laboratoryFilter) &&
      (statusFilter === "inactive" ? !product.active : product.active) &&
      (!stockFilter ||
        (stockFilter === "available"
          ? stockForProduct(product.id) > 0
          : stockToneForProduct(product.id) === stockFilter)) &&
      (!lotQuery.trim() ||
        stock.some(
          (lot) =>
            lot.productId === product.id &&
            lot.quantity > 0 &&
            lotNumberMatches(lot.number, lotQuery),
        ))
    );
  });
  const productFilterKey = JSON.stringify([
    organizationId,
    query,
    lotQuery,
    categoryFilter,
    laboratoryFilter,
    statusFilter,
    stockFilter,
    expiryFilter,
    additionalFilters,
  ]);
  const productTotalPages = Math.max(
    1,
    Math.ceil(filteredProducts.length / 10),
  );
  const currentProductPage =
    productPage.key === productFilterKey
      ? Math.min(productPage.page, productTotalPages)
      : 1;
  if (
    productPage.key !== productFilterKey ||
    productPage.page !== currentProductPage
  ) {
    setProductPage({ key: productFilterKey, page: currentProductPage });
  }
  const pageProducts = filteredProducts.slice(
    (currentProductPage - 1) * 10,
    currentProductPage * 10,
  );
  const catalogV2Enabled = Boolean(window.location.origin);
  if (catalogV2Enabled) {
    return (
      <div
        className={
          initialProduct || initialNewProduct
            ? ""
            : "product-catalog-body space-y-4"
        }
      >
        {lifecycle && (
          <BranchProductDialog
            token={token}
            organizationId={organizationId}
            branchId={branchId}
            branchName={branchName}
            product={lifecycle.product}
            status={lifecycle.status}
            stock={stockForProduct(lifecycle.product.id)}
            onClose={() => setLifecycle(undefined)}
            onSaved={() => {
              if (editingProduct?.id === lifecycle.product.id) clearForm();
              done();
            }}
          />
        )}
        {!initialProduct && !initialNewProduct && (
          <>
            <div className="catalog-summary-row">
              <ProductCatalogMetrics
                products={products}
                stock={stock}
                selected={activeCatalogMetric({
                  stock: stockFilter,
                  expiry: expiryFilter,
                })}
                onSelect={(key) => {
                  const next = toggleCatalogMetric(key, {
                    stock: stockFilter,
                    expiry: expiryFilter,
                  });
                  setStatusFilter("");
                  setStockFilter(next.stock);
                  setExpiryFilter(next.expiry);
                }}
              />
              <button
                type="button"
                onClick={() => {
                  clearForm();
                  setFormOpen(true);
                }}
                className="inline-flex h-10 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-gradient-to-b from-teal-600 to-teal-700 px-4 text-xs font-semibold text-white shadow-sm hover:from-teal-700 hover:to-teal-800"
              >
                <Plus size={17} />
                Nuevo producto
              </button>
            </div>
            <ProductCatalogToolbar
              priceLists={selectablePriceLists}
              additional={additionalFilters}
              onAdditionalChange={setAdditionalFilters}
              filters={{
                query,
                category: categoryFilter,
                laboratory: laboratoryFilter,
                status: statusFilter === "inactive" ? "inactive" : "",
                stock: stockFilter,
                expiry: expiryFilter,
                reference: "",
                lot: lotQuery,
                priceList: priceListFilter,
              }}
              options={options}
              onChange={(filters) => {
                setQuery(filters.query);
                setCategoryFilter(filters.category);
                setLaboratoryFilter(filters.laboratory);
                setStatusFilter(
                  filters.status === "inactive" ? "inactive" : "",
                );
                setStockFilter(
                  filters.stock === "available" ||
                    filters.stock === "out" ||
                    filters.stock === "low"
                    ? filters.stock
                    : "",
                );
                setExpiryFilter(filters.expiry);
                setPriceListFilter(filters.priceList);
                if (filters.lot !== lotQuery) {
                  setLotQuery(filters.lot);
                  setExpandedLots(new Set());
                }
              }}
            />
            <DataTable
              label="Productos"
              minWidthClass="min-w-265"
              columns={[
                { label: "Foto", className: "w-20" },
                { label: "Producto" },
                { label: "Código de barras" },
                { label: "Laboratorio" },
                {
                  label: "Costo",
                  align: "right",
                  hint: {
                    title: "Costo",
                    text: "Lo que se pagó en la última recepción del producto, sea del lote que sea.",
                  },
                },
                {
                  label: `VNT (${selectedPriceList?.name ?? "Público"})`,
                  align: "right",
                },
                { label: "Lote", className: "w-px" },
                {
                  label: "Stock vendible total",
                  className: "w-px",
                  hint: {
                    title: "Qué incluye",
                    text: "Unidades disponibles para vender, sumando todos los lotes del producto. No incluye las vencidas, que se muestran aparte.",
                  },
                },
                { label: "Próx. venc." },
                { label: "Estado" },
                { label: "Acciones", align: "right" },
              ]}
              footer={
                <Pagination
                  integrated
                  total={filteredProducts.length}
                  currentPage={currentProductPage}
                  totalPages={productTotalPages}
                  noun="productos"
                  label="Páginas de productos"
                  onChange={(page) =>
                    setProductPage({ key: productFilterKey, page })
                  }
                />
              }
            >
              {pageProducts.map((product) => {
                const imported = equivalentBarcodes(product);
                const lots = productLots(stock, product.id).map((lot) =>
                  withStockAvailability(lot),
                );
                // Stock total cuenta sólo lo vendible; lo vencido se muestra
                // aparte, sin sumarse.
                const sellableStock = stockTotals.sellable.get(product.id) ?? 0;
                const expiredUnits = lots
                  .filter((lot) => lot.expiryStatus === "EXPIRED")
                  .reduce((total, lot) => total + lot.quantity, 0);
                const stockTone = stockLevel(sellableStock);
                const wholePacks = intactPacks(lots);
                const shownLots = visibleProductLots(
                  lots,
                  product.id,
                  expiryFilter,
                  lotQuery,
                );
                const filteringLots = Boolean(expiryFilter || lotQuery.trim());
                // Próx. venc. y Estado siguen el orden de lotes del detalle y,
                // con Vencimiento o búsqueda por lote, sólo los lotes filtrados.
                const statusLots = filteringLots ? shownLots : lots;
                const leading = leadingLot(statusLots);
                const nextLot = leading?.expiresAt ? leading : undefined;
                const status = productStockStatus(
                  product.active,
                  statusLots,
                  stockTotals.sellable.get(product.id) ?? 0,
                  stockFilter,
                );
                // Lotes con unidades que Vencimiento o la búsqueda por lote dejan afuera.
                const hiddenLots = lots.length - shownLots.length;
                // Un único lote ya se ve en la columna Lote: sólo se despliega
                // cuando hay más de uno (entre los que dejan los filtros).
                const canExpand =
                  shownLots.length > 1 ||
                  shownLots.some((lot) =>
                    lotHasManyCosts(lotCosts.get(lot.id)),
                  );
                const listPrice =
                  listPrices?.id === priceListFilter
                    ? listPrices.prices.get(product.id)
                    : undefined;
                // Al buscar por lote el detalle arranca abierto: estar en
                // expandedLots significa que el usuario lo cerró.
                const lotsOpen =
                  canExpand &&
                  (lotQuery.trim()
                    ? !expandedLots.has(product.id)
                    : expandedLots.has(product.id));
                const lotsId = `lotes-${product.id}`;
                const toggleLots = () =>
                  setExpandedLots((current) => {
                    const next = new Set(current);
                    if (!next.delete(product.id)) next.add(product.id);
                    return next;
                  });
                return (
                  <Fragment key={product.id}>
                    <DataTableRow onToggle={canExpand ? toggleLots : undefined}>
                      <DataTableCell ignoreRowClick>
                        <ProductImageEditor
                          token={token}
                          organizationId={organizationId}
                          productId={product.id}
                          name={product.name}
                          version={product.image?.updatedAt}
                          value={undefined}
                          onChange={() => undefined}
                          onBusy={() => undefined}
                          onSave={async (image) => {
                            await updateCatalogProductImage(
                              token,
                              organizationId,
                              product.id,
                              image,
                            );
                            done();
                          }}
                        />
                      </DataTableCell>
                      <DataTableCell>
                        <CellText
                          primary={product.name}
                          secondary={
                            product.presentation ||
                            product.externalReferencePresentation
                          }
                        />
                      </DataTableCell>
                      <DataTableCell numeric>
                        {primaryBarcodeOf(product) ??
                          product.barcodes[0]?.code ??
                          "—"}
                        {imported.length ? (
                          <span
                            className="mt-0.5 block w-fit cursor-help text-xs font-medium text-teal-700"
                            title={`Envase importado del mismo medicamento: ${imported.join(", ")}`}
                          >
                            ↳ {imported.length}{" "}
                            {imported.length === 1 ? "importado" : "importados"}
                          </span>
                        ) : null}
                      </DataTableCell>
                      <DataTableCell>
                        {product.laboratory?.name ?? "—"}
                      </DataTableCell>
                      <DataTableCell align="right" numeric>
                        {lastCosts.has(product.id)
                          ? money(lastCosts.get(product.id)!)
                          : "—"}
                      </DataTableCell>
                      <DataTableCell align="right" numeric>
                        {!priceListFilter
                          ? money(product.prices[0]?.amountMinor ?? 0)
                          : listPrice
                            ? money(listPrice)
                            : "—"}
                      </DataTableCell>
                      <DataTableCell numeric>
                        <ProductLotCell
                          productName={product.name}
                          lotNumber={leading?.number}
                          total={statusLots.length}
                          open={lotsOpen}
                          controlsId={lotsId}
                          onToggle={toggleLots}
                          expandable={canExpand}
                        />
                      </DataTableCell>
                      {/* A la izquierda, pegado al lote: el título largo dejaba
                          el número lejos. */}
                      <DataTableCell
                        numeric
                        className={
                          stockTone === "out"
                            ? "font-semibold text-rose-600"
                            : stockTone === "low"
                              ? "font-semibold text-amber-600"
                              : ""
                        }
                      >
                        {sellableStock}
                        {wholePacks > 0 && (
                          <span className="mt-0.5 block text-xs font-normal text-slate-500">
                            {wholePacks}{" "}
                            {wholePacks === 1 ? "exhibidor" : "exhibidores"}
                          </span>
                        )}
                        {expiredUnits ? (
                          <span className="mt-0.5 block text-xs font-normal text-rose-600">
                            {expiredUnits}{" "}
                            {expiredUnits === 1 ? "vencida" : "vencidas"}
                          </span>
                        ) : null}
                      </DataTableCell>
                      <DataTableCell
                        numeric
                        className={
                          nextLot?.expiryStatus === "EXPIRED"
                            ? "font-semibold text-rose-600"
                            : nextLot?.expiryStatus === "EXPIRING_SOON"
                              ? "font-semibold text-amber-600"
                              : ""
                        }
                      >
                        {nextLot?.expiresAt
                          ? new Date(nextLot.expiresAt).toLocaleDateString(
                              "es-AR",
                              {
                                month: "2-digit",
                                year: "numeric",
                                timeZone: "UTC",
                              },
                            )
                          : "—"}
                      </DataTableCell>
                      <DataTableCell>
                        <StatusLabel tone={status.tone}>
                          {status.label}
                        </StatusLabel>
                        {status.expiredLots ? (
                          <span className="mt-0.5 block whitespace-nowrap text-xs text-rose-600">
                            {status.expiredLots === 1
                              ? "1 lote vencido"
                              : `${status.expiredLots} lotes vencidos`}
                          </span>
                        ) : null}
                      </DataTableCell>
                      <DataTableCell align="right">
                        <span className="inline-flex gap-1.5">
                          <RowIconAction
                            tone="edit"
                            label={`Editar ${product.name}`}
                            title="Editar producto"
                            onClick={() => edit(product)}
                          >
                            <Pencil size={16} />
                          </RowIconAction>
                          <RowIconAction
                            tone="neutral"
                            label={`${product.active ? "Archivar" : "Restaurar"} ${product.name}`}
                            title={product.active ? "Archivar" : "Restaurar"}
                            onClick={() => toggleProductActive(product)}
                          >
                            {product.active ? (
                              <Archive size={16} />
                            ) : (
                              <ArchiveRestore size={16} />
                            )}
                          </RowIconAction>
                          <RowIconAction
                            tone="danger"
                            label={`${product.active ? "Eliminar definitivamente" : "Eliminar de esta sucursal"} ${product.name}`}
                            title={
                              product.active
                                ? "Eliminar definitivamente"
                                : "Eliminar de esta sucursal"
                            }
                            onClick={() => remove(product)}
                          >
                            <Trash2 size={16} />
                          </RowIconAction>
                        </span>
                      </DataTableCell>
                    </DataTableRow>
                    {lotsOpen ? (
                      <DataTableDetailRow id={lotsId} colSpan={11}>
                        <ProductLotsDetail
                          productName={product.name}
                          lots={shownLots}
                          hidden={hiddenLots}
                          receipts={(lot) =>
                            lotReceiptRows(
                              lotCosts.get(lot.id),
                              lot.unitCostMinor,
                              lotAdjustments.get(lot.id),
                              lotSupplierNames,
                            )
                          }
                        />
                      </DataTableDetailRow>
                    ) : null}
                  </Fragment>
                );
              })}
              {!filteredProducts.length ? (
                <DataTableEmpty colSpan={11}>
                  No hay productos para los filtros seleccionados.
                </DataTableEmpty>
              ) : null}
            </DataTable>
          </>
        )}
        {productSaveError && (
          <ProductSaveErrorDialog
            message={productSaveError}
            onClose={() => setProductSaveError("")}
          />
        )}
        {formOpen ? (
          <dialog
            ref={productEditorDialog}
            data-product-editor
            aria-labelledby="product-editor-title"
            onCancel={(event) => {
              if (event.target !== event.currentTarget) return;
              event.preventDefault();
              if (
                !productSaveLock.current &&
                !optionCreateLock.current &&
                !imageBusy
              )
                clearForm();
            }}
            className="m-auto w-[min(960px,calc(100vw-2rem))] max-h-[calc(100dvh-2rem)] overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 text-slate-800 shadow-2xl backdrop:bg-slate-950/35"
            onPointerDown={(event) => {
              backdropPress.current =
                event.target === event.currentTarget && event.button === 0;
            }}
            onPointerCancel={() => {
              backdropPress.current = false;
            }}
            onClick={(event) => {
              const startedOutside = backdropPress.current;
              backdropPress.current = false;
              if (
                canDismissProductBackdrop(
                  startedOutside,
                  event.target === event.currentTarget,
                  productSaveLock.current ||
                    optionCreateLock.current ||
                    imageBusy ||
                    Boolean(
                      document.querySelector(
                        'dialog[open]:not([data-product-editor]), [aria-modal="true"]:not([data-product-editor])',
                      ),
                    ),
                )
              )
                clearForm();
            }}
          >
            <form
              onSubmit={(event) => void save(event)}
              className="flex max-h-[calc(100dvh-2rem)] w-full flex-col bg-white"
            >
              <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 px-5 py-4 sm:px-7 sm:py-5">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
                  <Package size={22} aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2
                      id="product-editor-title"
                      className="text-lg font-semibold tracking-tight text-slate-800"
                    >
                      {editingProduct ? "Editar producto" : "Nuevo producto"}
                    </h2>
                    <ProductInternalBarcode
                      key={editingProduct?.id ?? "new"}
                      token={token}
                      organizationId={organizationId}
                      productId={editingProduct?.id}
                      draftName={name}
                      draftSaleUnit={saleUnit}
                      pending={generateInternalBarcode}
                      onPendingChange={setGenerateInternalBarcode}
                    />
                  </div>
                  <p className="mt-1 hidden text-sm text-slate-500 sm:block">
                    {initialProduct
                      ? "Los datos del producto se comparten entre todas las listas. El precio de esta lista se edita en la columna Nuevo precio."
                      : "Completá los datos comerciales y farmacéuticos del catálogo."}
                  </p>
                </div>
                <label className="flex shrink-0 cursor-pointer flex-col items-end gap-1 pt-0.5 sm:flex-row sm:items-center sm:gap-2 sm:pt-1.5">
                  <span className="text-[11px] font-medium text-slate-600 sm:text-xs">
                    Es medicamento
                  </span>
                  <input
                    type="checkbox"
                    role="switch"
                    aria-label="Es medicamento"
                    checked={isMedication}
                    disabled={productSaving || optionCreating}
                    className="peer sr-only"
                    onChange={(event) => {
                      const checked = event.target.checked;
                      setMedicationMode(checked ? "medicine" : "other");
                      setIsMedication(checked);
                      if (!editingProduct && !saleUnitEdited.current)
                        setSaleUnit(checked ? "BOX" : "UNIT");
                      referenceRequest.current?.abort();
                      setReferenceLoading(false);
                      if (!checked) {
                        if (
                          fractionEnabled &&
                          fractionLinked &&
                          fractionReferenceMinor != null
                        )
                          setFractionBase(
                            String(Number(fractionReferenceMinor) / 100),
                          );
                        setSelectedReference(undefined);
                        scannedMedicine.current = null;
                        setPrescriptionRequired(false);
                        setReferenceResults([]);
                        setAlfaReferenceResults([]);
                        setReferenceSearchDone(false);
                        setSuggestedLaboratoryName("");
                      }
                    }}
                  />
                  <span
                    aria-hidden
                    style={{
                      backgroundColor: isMedication ? "#087f73" : "#cbd5e1",
                    }}
                    className="relative h-6 w-11 shrink-0 rounded-full bg-slate-200 transition before:absolute before:left-1 before:top-1 before:size-4 before:rounded-full before:bg-white before:shadow-sm before:transition-transform peer-checked:bg-teal-700 peer-checked:before:translate-x-5 peer-focus-visible:ring-2 peer-focus-visible:ring-teal-500 peer-focus-visible:ring-offset-2"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => clearForm()}
                  aria-label="Cerrar"
                  disabled={productSaving || imageBusy || optionCreating}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-xl leading-none text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                >
                  <X size={18} aria-hidden="true" />
                </button>
              </div>
              <div
                data-product-editor-body
                className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain bg-slate-50/30 px-4 py-5 sm:px-7 sm:py-6"
              >
                {!isMedication && editingProduct?.externalReferenceSource && (
                  <p className="px-1 text-xs text-slate-500">
                    Al guardar se quitará la vinculación medicinal y se
                    conservará el precio actual.
                  </p>
                )}
                {/* Siempre arriba y visible: aparecer sólo con Es medicamento
                    movía el resto del formulario. */}
                <ProductFormSection
                  key={retailLinkSearchRevision}
                  title={
                    editingProduct?.externalReferenceName
                      ? "Cambiar vinculación"
                      : "Buscar producto"
                  }
                  defaultOpen={!editingProduct || retailLinkSearchRevision > 0}
                  status={
                    <ProductSyncStatus
                      showSource
                      product={editingProduct}
                      pendingName={selectedReference?.name}
                      pendingSource={selectedReference?.source}
                    />
                  }
                >
                  {/* Los resultados se muestran como desplegable sobre el
                      formulario, sin empujar el resto de los campos. */}
                  <div
                    ref={referenceSearchBox}
                    className="relative"
                    onKeyDown={(event) => {
                      if (event.key === "Escape" && searchOpen) {
                        event.preventDefault();
                        event.stopPropagation();
                        setSearchOpen(false);
                      }
                    }}
                  >
                    {importedBarcode && (
                      <div
                        className="mt-3 rounded-lg border border-teal-200 bg-teal-50/60 px-3 py-2.5 text-xs leading-5 text-slate-700"
                        role="status"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="font-semibold text-teal-800">
                              Asociar envase importado
                            </span>
                            <span className="rounded bg-white px-1.5 py-0.5 font-mono text-slate-800 ring-1 ring-teal-200">
                              {importedBarcode}
                            </span>
                            <span aria-hidden="true" className="text-teal-700">
                              →
                            </span>
                            {importLinkTarget ? (
                              <span className="rounded bg-white px-1.5 py-0.5 ring-1 ring-teal-200">
                                <strong>{importLinkTarget.name}</strong>
                                {importLinkTarget.presentation &&
                                  ` ${importLinkTarget.presentation}`}
                                {primaryBarcodeOf(importLinkTarget) && (
                                  <span className="font-mono text-slate-500">
                                    {" "}
                                    · {primaryBarcodeOf(importLinkTarget)}
                                  </span>
                                )}
                              </span>
                            ) : selectedReference ? (
                              <span className="rounded bg-white px-1.5 py-0.5 ring-1 ring-teal-200">
                                <strong>{selectedReference.name}</strong>
                                {selectedReference.presentation &&
                                  ` ${selectedReference.presentation}`}
                                {barcode.trim() && (
                                  <span className="font-mono text-slate-500">
                                    {" "}
                                    · {barcode.trim()}
                                  </span>
                                )}
                              </span>
                            ) : (
                              <span className="text-slate-500">
                                buscá abajo el medicamento nacional por nombre o
                                por código
                              </span>
                            )}
                          </p>
                          <button
                            type="button"
                            onClick={() => {
                              setImportedBarcode("");
                              setImportTarget(undefined);
                            }}
                            disabled={productSaving}
                            aria-label="Cancelar la asociación del envase importado"
                            className="grid size-6 shrink-0 place-items-center rounded text-teal-700 hover:bg-teal-100"
                          >
                            <X size={14} aria-hidden="true" />
                          </button>
                        </div>
                        {importLinkTarget ? (
                          <p className="mt-1 text-[11px] text-slate-500">
                            Ya está en tu catálogo: abajo ves sus datos. Al
                            apretar <strong>Guardar y asociar código</strong> el
                            envase importado queda como código equivalente de “
                            {importLinkTarget.name}”; no se crea otro producto.
                          </p>
                        ) : (
                          selectedReference && (
                            <p className="mt-1 text-[11px] text-slate-500">
                              Al guardar se crea el producto con el código
                              nacional y este envase importado como código
                              equivalente.
                            </p>
                          )
                        )}
                      </div>
                    )}
                    <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] gap-2 sm:flex">
                      <input
                        ref={productSearchInput}
                        value={referenceQuery}
                        onFocus={() => setSearchOpen(true)}
                        onChange={(event) => {
                          referenceRequest.current?.abort();
                          setReferenceLoading(false);
                          setAlfaReferenceResults([]);
                          setReferenceQuery(event.target.value);
                          setReferenceSearchDone(false);
                          setReferenceResults([]);
                          setReferenceError("");
                          setRetailLinkHint("");
                          const value = event.target.value;
                          setSearchOpen(true);
                          // Sólo números: es un código (se busca solo al
                          // completar un EAN-13/14; 8 o 12 dígitos, con Enter).
                          // Asociando un importado, un código busca el
                          // nacional (catálogo y padrón) sin reiniciar.
                          if (importedBarcode) {
                            scheduleReferenceSearch(referenceSource, value);
                            return;
                          }
                          if (/^\d+$/.test(value.trim())) {
                            cancelReferenceSearch();
                            if (value.trim().length >= 13)
                              startCodeSearch(value);
                            return;
                          }
                          setSearchCode("");
                          scheduleReferenceSearch(referenceSource, value);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            setSearchOpen(true);
                            if (
                              !importedBarcode &&
                              /^\d+$/.test(referenceQuery.trim())
                            )
                              startCodeSearch(referenceQuery);
                            else void searchReferences(referenceSource);
                          }
                        }}
                        inputMode="search"
                        autoComplete="off"
                        aria-label="Buscar producto por nombre o código de barras"
                        placeholder={
                          importedBarcode
                            ? "Buscá el medicamento nacional por nombre…"
                            : referenceSource === "alfabeta"
                              ? "Ej. Actron 400…"
                              : "Nombre, laboratorio, droga o código de barras…"
                        }
                        className="col-span-2 h-10 min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-3 !text-sm placeholder:text-slate-400"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setSearchOpen(true);
                          if (
                            !importedBarcode &&
                            /^\d+$/.test(referenceQuery.trim())
                          )
                            startCodeSearch(referenceQuery);
                          else void searchReferences(referenceSource);
                        }}
                        disabled={referenceLoading}
                        className="h-10 rounded-md border border-teal-600 bg-white px-4 text-sm font-semibold text-teal-800 hover:bg-teal-50"
                      >
                        {referenceLoading ? "Buscando..." : "Buscar"}
                      </button>
                      <ProductReferenceSource
                        value={referenceSource}
                        onChange={(source) => {
                          referenceRequest.current?.abort();
                          setReferenceSource(source);
                          setReferenceResults([]);
                          setAlfaReferenceResults([]);
                          setReferenceSearchDone(false);
                          setReferenceLoading(false);
                          setReferenceError("");
                          setRetailLinkHint("");
                          scheduleReferenceSearch(source, referenceQuery);
                        }}
                      />
                    </div>
                    {openedFromScan && (
                      <p
                        className="mt-1 flex items-start gap-1 text-[11px] leading-4 text-teal-700"
                        role="status"
                      >
                        <Check
                          size={12}
                          className="mt-0.5 shrink-0"
                          aria-hidden="true"
                        />
                        {openedFromScan}
                      </p>
                    )}
                    <ExternalProductLookup
                      searchInput={productSearchInput}
                      medicationMode={medicationMode}
                      onKindConfirmed={(value) => {
                        setMedicationMode(value ? "medicine" : "other");
                        setIsMedication(value);
                        if (!editingProduct && !saleUnitEdited.current)
                          setSaleUnit(value ? "BOX" : "UNIT");
                      }}
                      knownMedication={
                        [...products, ...knownProducts].find((product) =>
                          product.barcodes.some(
                            (item) =>
                              externalGtin(item.code) &&
                              externalGtin(item.code) ===
                                externalGtin(searchCode),
                          ),
                        )?.isMedication
                      }
                      onKindDetected={(value) => {
                        setIsMedication(value);
                        if (!saleUnitEdited.current)
                          setSaleUnit(value ? "BOX" : "UNIT");
                      }}
                      token={token}
                      organizationId={organizationId}
                      code={searchCode}
                      onImported={searchedOwner ? undefined : startImportedLink}
                      catalogOwner={searchedOwner?.name}
                      allowAutomatic={
                        medicineNameIsFree(name, initialNewProduct?.name) &&
                        !presentation &&
                        !selectedReference &&
                        !activeIngredient &&
                        !laboratoryId &&
                        !suggestedLaboratoryName &&
                        !fractionEnabled &&
                        !saleUnitEdited.current &&
                        Boolean(options)
                      }
                      onMedication={(reference) => {
                        scannedMedicine.current = reference;
                        externalFilled.current = null;
                        applyReference(reference, true);
                      }}
                      onRetailMedicine={applyRetailMedicine}
                      onCode={startCodeSearch}
                      disabled={productSaving || imageBusy || optionCreating}
                      onApply={async (candidate) => {
                        if (optionCreateLock.current || productSaveLock.current)
                          return false;
                        optionCreateLock.current = true;
                        setOptionCreating(true);
                        try {
                          const classification = !categoryId
                            ? await resolveExternalCategory(
                                token,
                                organizationId,
                                candidate,
                              )
                            : null;
                          if (classification?.categoryId)
                            setOptions(
                              await getCatalogOptions(token, organizationId),
                            );
                          if (!brand && candidate.brand)
                            externalBrand.current = candidate.brand;
                          setBrand(
                            (current) => current || candidate.brand || "",
                          );
                          const fields = externalProductFields(
                            candidate,
                            options?.categories ?? [],
                            { includeImage: productImage === undefined },
                          );
                          fields.categoryId = classification?.categoryId ?? "";
                          const unit = externalSaleUnit(candidate);
                          if (
                            unit &&
                            !saleUnitEdited.current &&
                            !fractionEnabled &&
                            !selectedReference
                          ) {
                            suggestedSaleUnit.current = unit;
                            setSaleUnit(unit);
                          }
                          externalFilled.current = {
                            name: name
                              ? (externalFilled.current?.name ?? "")
                              : fields.name,
                            presentation: presentation
                              ? (externalFilled.current?.presentation ?? "")
                              : fields.presentation,
                            categoryId: categoryId
                              ? (externalFilled.current?.categoryId ?? "")
                              : fields.categoryId,
                            description: description
                              ? (externalFilled.current?.description ?? "")
                              : fields.description,
                          };
                          setName((value) => value || fields.name);
                          setPresentation(
                            (value) => value || fields.presentation,
                          );
                          setCategoryId((value) => value || fields.categoryId);
                          setDescription(
                            (value) => value || fields.description,
                          );
                          if (
                            productImage === undefined &&
                            candidate.image?.data_url
                          ) {
                            externalImage.current = candidate.image.data_url;
                            setProductImage(candidate.image.data_url);
                          }
                          return true;
                        } finally {
                          optionCreateLock.current = false;
                          setOptionCreating(false);
                        }
                      }}
                    />
                    {searchOpen &&
                    (referenceSearchDone || importCatalogMatches.length) ? (
                      <div className="absolute inset-x-0 top-full z-30 mt-0.5 rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
                        {importCatalogMatches.length > 0 && (
                          <div className="mb-2">
                            <p className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                              {importedBarcode
                                ? "En tu catálogo · se asocia al guardar"
                                : "En tu catálogo · abrir para modificar"}
                            </p>
                            <div className="space-y-1">
                              {importCatalogMatches.map((product) => (
                                <button
                                  key={product.id}
                                  type="button"
                                  disabled={productSaving}
                                  onClick={() => {
                                    setSearchOpen(false);
                                    if (importedBarcode)
                                      openImportTarget(product);
                                    else openCatalogProduct(product);
                                  }}
                                  className="flex w-full items-center justify-between gap-3 rounded-lg border border-teal-200 bg-teal-50/40 px-3 py-2 text-left hover:border-teal-400 hover:bg-teal-50"
                                >
                                  <span className="min-w-0">
                                    <span className="block truncate text-sm font-semibold text-slate-800">
                                      {product.name}
                                    </span>
                                    <span className="block truncate text-xs text-slate-500">
                                      {[
                                        product.presentation,
                                        primaryBarcodeOf(product),
                                      ]
                                        .filter(Boolean)
                                        .join(" · ")}
                                    </span>
                                  </span>
                                  <span className="shrink-0 text-xs font-semibold text-teal-800">
                                    {importedBarcode ? "Elegir" : "Abrir"}
                                  </span>
                                </button>
                              ))}
                            </div>
                            {referenceSearchDone && (
                              <p className="mt-2 px-1 pb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                                Fuente externa · completa un producto nuevo
                              </p>
                            )}
                          </div>
                        )}
                        {!referenceSearchDone ? null : referenceQuery.trim()
                            .length < 2 ? (
                          <p className="rounded-lg bg-white px-3 py-2 text-xs text-slate-600">
                            Ingresá al menos dos caracteres para buscar.
                          </p>
                        ) : referenceError ? (
                          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs leading-5 text-amber-900">
                            {referenceError}
                          </p>
                        ) : referenceLoading ? (
                          <p className="rounded-lg bg-white px-3 py-2 text-xs text-slate-600">
                            Consultando referencias de medicamentos...
                          </p>
                        ) : alfaReferenceResults.length ? (
                          <div className="max-h-44 space-y-1 overflow-y-auto pr-1">
                            {alfaReferenceResults.map((item) => (
                              <div
                                key={item.id}
                                className="overflow-hidden rounded-lg border border-slate-200 bg-white"
                              >
                                <AlfaBetaMedicineCard
                                  compact
                                  item={item}
                                  token={token}
                                  organizationId={organizationId}
                                  onSelect={pickReference}
                                />
                              </div>
                            ))}
                          </div>
                        ) : referenceResults.length ? (
                          <div className="max-h-44 space-y-2 overflow-y-auto pr-1">
                            {referenceResults.map((reference) => (
                              <div
                                key={`${reference.source}-${reference.name}-${reference.presentation}-${reference.laboratory}-${reference.barcode}`}
                              >
                                <button
                                  type="button"
                                  onClick={() => pickReference(reference)}
                                  className="flex w-full items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-left hover:border-teal-300 hover:bg-teal-50/40"
                                >
                                  <span className="min-w-0">
                                    <span className="block truncate text-sm font-semibold text-slate-800">
                                      {reference.name}
                                    </span>
                                    <span className="block truncate text-xs text-slate-500">
                                      {[
                                        reference.presentation,
                                        reference.laboratory,
                                        reference.activeIngredient,
                                      ]
                                        .filter(Boolean)
                                        .join(" · ") || "Sin detalle adicional"}
                                    </span>
                                  </span>
                                  <span className="shrink-0 text-right text-xs text-teal-800">
                                    <span className="block font-semibold">
                                      {reference.priceMinor !== null
                                        ? money(reference.priceMinor)
                                        : "Sin precio"}
                                    </span>
                                    <span className="block text-[10px] text-slate-500">
                                      {reference.source === "official"
                                        ? "Padrón oficial"
                                        : medicineSources[reference.source]}
                                    </span>
                                    <span className="hidden text-[10px] text-slate-500">
                                      Catálogo interno
                                    </span>
                                  </span>
                                </button>
                                <MedicineReferenceNote reference={reference} />
                              </div>
                            ))}
                          </div>
                        ) : (
                          <>
                            <p className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-xs leading-5 text-slate-600">
                              No encontramos coincidencias en la fuente
                              consultada.
                            </p>
                          </>
                        )}
                      </div>
                    ) : null}
                  </div>
                  {retailLinkHint && !importedBarcode && (
                    <p
                      className="mt-2 text-xs leading-5 text-slate-600"
                      role="status"
                    >
                      {retailLinkHint}
                    </p>
                  )}
                </ProductFormSection>
                <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="flex items-center gap-2.5 text-sm font-semibold text-slate-700">
                      <Package
                        size={17}
                        className="text-teal-700"
                        aria-hidden
                      />
                      Datos del producto
                    </h3>
                  </div>
                  <ProductFormImage
                    token={token}
                    organizationId={organizationId}
                    productId={editingProduct?.id}
                    version={editingProduct?.image?.updatedAt}
                    name={name || "Nuevo producto"}
                    value={productImage}
                    onChange={(value) => {
                      externalImage.current = null;
                      setProductImage(value);
                    }}
                    onBusy={setImageBusy}
                    disabled={productSaving || imageBusy || optionCreating}
                  />
                  <div className="mt-1 grid gap-x-6 gap-y-2 sm:grid-cols-2">
                    <Input
                      label="Nombre del producto *"
                      value={name}
                      onChange={setName}
                      placeholder="Ej. Actron 600"
                      labelClassName="mt-3 text-xs font-semibold text-slate-600"
                      className="h-10 rounded-md border-slate-300 !text-sm placeholder:text-slate-400"
                    />
                    {/* Código guardado del producto: se corrige a mano y nunca
                        busca ni cambia de producto (eso lo hace el buscador). */}
                    <Input
                      label="Código de barras"
                      value={barcode}
                      onChange={(value) => {
                        clearMismatchedReference(value);
                        setBarcode(value);
                      }}
                      placeholder="Ej. 7791234567890"
                      required={false}
                      labelClassName="mt-3 text-xs font-semibold text-slate-600"
                      className="h-10 rounded-md border-slate-300 !text-sm placeholder:text-slate-400"
                    />
                    {referenceBarcodeWarning && (
                      <p
                        className="sm:col-span-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900"
                        role="alert"
                      >
                        {referenceBarcodeWarning}
                      </p>
                    )}
                    {editingProduct ? (
                      <ProductEquivalentBarcodes
                        key={editingProduct.id}
                        token={token}
                        organizationId={organizationId}
                        productId={editingProduct.id}
                        initialCodes={equivalentBarcodes(editingProduct)}
                        primaryCode={barcode}
                        disabled={productSaving}
                        onChanged={done}
                        pendingCodes={
                          importedBarcode &&
                          importTarget?.id === editingProduct.id
                            ? [importedBarcode]
                            : []
                        }
                        onRemovePending={() => {
                          setImportedBarcode("");
                          setImportTarget(undefined);
                        }}
                      />
                    ) : (
                      !importedBarcode && (
                        <ProductEquivalentBarcodes
                          key={`nuevo-${newFormRevision}`}
                          token={token}
                          organizationId={organizationId}
                          initialCodes={pendingEquivalents}
                          primaryCode={barcode}
                          disabled={productSaving}
                          onPendingChange={setPendingEquivalents}
                        />
                      )
                    )}
                  </div>
                  <div
                    className={`mt-1 grid gap-x-6 gap-y-2 ${isMedication ? "sm:grid-cols-2" : "sm:grid-cols-1"}`}
                  >
                    <CatalogOptionSelect
                      label="Categoría"
                      emptyLabel="Sin categoría"
                      value={categoryId}
                      options={options?.categories ?? []}
                      disabled={!options || productSaving || optionCreating}
                      onChange={setCategoryId}
                      allowParent
                      onCreate={(name, parentId) =>
                        createProductOption("categories", name, parentId)
                      }
                    />
                    {!isMedication && externalFilled.current && !categoryId && (
                      <p className="text-xs text-amber-700" role="status">
                        Elegí una categoría: la ficha encontrada no tiene una
                        coincidencia clara con tus categorías actuales.
                      </p>
                    )}
                    {isMedication && (
                      <CatalogOptionSelect
                        label="Laboratorio"
                        emptyLabel={
                          suggestedLaboratoryName || "Sin laboratorio"
                        }
                        value={laboratoryId}
                        options={options?.laboratories ?? []}
                        disabled={!options || productSaving || optionCreating}
                        onChange={(id) => {
                          setLaboratoryId(id);
                          setSuggestedLaboratoryName("");
                        }}
                        onCreate={(name) =>
                          createProductOption("laboratories", name)
                        }
                      />
                    )}
                  </div>
                </section>
                <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
                  <h3 className="flex items-center gap-2.5 text-sm font-semibold text-slate-700">
                    <CreditCard
                      size={17}
                      className="text-teal-700"
                      aria-hidden
                    />
                    Precio y venta
                  </h3>
                  <FractionalPriceFields
                    enabled={fractionEnabled}
                    linked={fractionLinked}
                    base={
                      fractionLinked
                        ? fractionReferenceMinor === null
                          ? ""
                          : String(Number(fractionReferenceMinor) / 100)
                        : fractionBase
                    }
                    divisor={fractionDivisor}
                    markup={fractionMarkup}
                    result={fractionResult}
                    disabled={!!initialProduct}
                    onEnabled={(enabled) => {
                      const draft = toggleFractionalPrice({
                        enabled,
                        linked: fractionLinked,
                        box: saleUnit === "BOX",
                        referenceMinor: fractionReferenceMinor,
                        price,
                        base: fractionBase,
                      });
                      setFractionBase(draft.base);
                      setPrice(draft.price);
                      setFractionEnabled(enabled);
                    }}
                    onBase={setFractionBase}
                    onDivisor={setFractionDivisor}
                    onMarkup={setFractionMarkup}
                  />
                  <div
                    className={`mt-3 grid gap-x-6 gap-y-4 sm:grid-cols-2 ${isMedication ? "lg:grid-cols-3" : ""}`}
                  >
                    <Input
                      label="Precio de venta"
                      disabled={
                        priceLocked || fractionEnabled || !!initialProduct
                      }
                      type="number"
                      value={
                        fractionEnabled
                          ? fractionResult === null
                            ? ""
                            : (Number(fractionResult) / 100).toFixed(2)
                          : price
                      }
                      onChange={setPrice}
                      placeholder="Ej. 9900"
                      labelClassName="mt-0 text-xs font-semibold text-slate-600"
                      className="h-10 rounded-md border-slate-300 !text-sm placeholder:text-slate-400"
                    />
                    <div className="mt-0 block text-xs font-semibold text-slate-600">
                      <span className="mb-1 block">Se vende por</span>
                      <ProductFilterSelect
                        label="Se vende por"
                        value={saleUnit}
                        compact
                        icon={<Package size={16} />}
                        options={
                          isMedication
                            ? [
                                { value: "BOX", label: "Caja" },
                                { value: "BLISTER", label: "Blíster" },
                                { value: "UNIT", label: "Unidad" },
                              ]
                            : [
                                {
                                  value: "UNIT",
                                  label: "Unidad / envase completo",
                                },
                                { value: "BOX", label: "Caja / pack completo" },
                                ...(saleUnit === "BLISTER"
                                  ? [
                                      {
                                        value: "BLISTER",
                                        label: "Blíster (unidad guardada)",
                                      },
                                    ]
                                  : []),
                              ]
                        }
                        onChange={(value) => {
                          saleUnitEdited.current = true;
                          setSaleUnit(value as SaleUnit);
                        }}
                      />
                      <span className="mt-1 block text-[11px] font-normal text-slate-500">
                        {saleUnit === "UNIT"
                          ? "Un artículo o envase completo: frasco, pote, pomo…"
                          : "Cómo se descuenta del stock al vender."}
                      </span>
                    </div>
                    {isMedication && (
                      <label className="mt-0 block text-xs font-semibold text-slate-600">
                        Requiere receta
                        <span className="mt-1 flex h-10 items-center justify-between rounded-md border border-slate-300 bg-slate-50 px-3 text-sm font-normal text-slate-700 transition hover:border-[#69a997]">
                          {prescriptionRequired
                            ? "Sí, requiere receta"
                            : "No requiere receta"}
                          <input
                            type="checkbox"
                            checked={prescriptionRequired}
                            onChange={(event) =>
                              setPrescriptionRequired(event.target.checked)
                            }
                            className="peer sr-only"
                          />
                          <span
                            aria-hidden="true"
                            className="relative h-6 w-11 rounded-full bg-slate-200 transition before:absolute before:left-1 before:top-1 before:h-4 before:w-4 before:rounded-full before:bg-white before:shadow-sm before:transition-transform peer-checked:bg-[#31826a] peer-checked:before:translate-x-5"
                          />
                        </span>
                      </label>
                    )}
                    <div className="hidden rounded-md border border-[#cfe6df] bg-[#f3faf7] p-3 text-xs leading-5 text-slate-600">
                      Se crea activo. Podés desactivarlo después sin perder
                      historial.
                    </div>
                  </div>
                </section>
                <div className="space-y-4">
                  <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
                    <h3 className="flex items-center gap-2.5 text-sm font-semibold text-slate-700">
                      <HeartPulse
                        size={17}
                        className="text-teal-700"
                        aria-hidden
                      />
                      {isMedication
                        ? "Detalles farmacéuticos"
                        : "Presentación del producto"}
                    </h3>
                    <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
                      {isMedication && (
                        <>
                          <Input
                            label="Principio activo"
                            value={activeIngredient}
                            onChange={setActiveIngredient}
                            placeholder="Ej. Ibuprofeno"
                            required={false}
                            labelClassName="mt-3 text-xs font-semibold text-slate-600"
                            className="h-10 rounded-md border-slate-300 !text-sm placeholder:text-slate-400"
                          />
                          <Input
                            label="Forma farmacéutica"
                            value={pharmaceuticalForm}
                            onChange={setPharmaceuticalForm}
                            placeholder="Ej. Comprimidos"
                            required={false}
                            labelClassName="mt-3 text-xs font-semibold text-slate-600"
                            className="h-10 rounded-md border-slate-300 !text-sm placeholder:text-slate-400"
                          />
                          <Input
                            label="Concentración"
                            value={concentration}
                            onChange={setConcentration}
                            placeholder="Ej. 600 mg"
                            required={false}
                            labelClassName="mt-3 text-xs font-semibold text-slate-600"
                            className="h-10 rounded-md border-slate-300 !text-sm placeholder:text-slate-400"
                          />
                        </>
                      )}
                      <Input
                        label="Presentación"
                        value={presentation}
                        onChange={setPresentation}
                        placeholder="Ej. Caja x 20 comprimidos · Frasco 250 ml"
                        required={false}
                        labelClassName="mt-3 text-xs font-semibold text-slate-600"
                        className="h-10 rounded-md border-slate-300 !text-sm placeholder:text-slate-400"
                      />
                    </div>
                  </section>
                  <ProductFormSection
                    title={
                      description.trim()
                        ? "Observaciones · Con notas"
                        : "Observaciones"
                    }
                  >
                    <label className="mt-3 block text-sm font-medium text-slate-700">
                      Observaciones internas
                      <textarea
                        value={description}
                        onChange={(event) => setDescription(event.target.value)}
                        placeholder="Notas internas sobre el producto..."
                        rows={3}
                        className="mt-1 w-full resize-y rounded-md border border-slate-300 px-3 py-2 text-sm font-normal"
                      />
                    </label>
                  </ProductFormSection>
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-slate-100 bg-white px-5 py-4 sm:px-7">
                <button
                  type="button"
                  onClick={() => clearForm()}
                  className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-200 px-4 text-sm font-medium text-teal-700 hover:bg-teal-50 disabled:opacity-50"
                  disabled={productSaving || imageBusy || optionCreating}
                >
                  Cancelar
                </button>
                <button
                  disabled={imageBusy || productSaving || optionCreating}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-teal-700 px-5 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-50"
                >
                  <Save size={16} aria-hidden />
                  {editingProduct && importLinkTarget
                    ? "Guardar y asociar código"
                    : editingProduct
                      ? "Guardar cambios"
                      : "Guardar producto"}
                </button>
              </div>
            </form>
          </dialog>
        ) : null}
      </div>
    );
  }
  return (
    <div className="workspace-split mt-8 grid gap-6">
      {lifecycle && (
        <BranchProductDialog
          token={token}
          organizationId={organizationId}
          branchId={branchId}
          branchName={branchName}
          product={lifecycle.product}
          status={lifecycle.status}
          stock={stockForProduct(lifecycle.product.id)}
          onClose={() => setLifecycle(undefined)}
          onSaved={done}
        />
      )}
      <div className="border bg-white">
        {products.map((item) => (
          <div
            key={item.id}
            className="flex justify-between border-b px-5 py-4"
          >
            <span>{item.name}</span>
            <button
              type="button"
              onClick={() => edit(item)}
              className="ml-auto text-sm text-teal-700"
            >
              Editar
            </button>
            <button
              type="button"
              onClick={() => void remove(item)}
              className="ml-4 text-sm text-red-700"
            >
              Eliminar
            </button>
            <button
              type="button"
              onClick={() => void toggleProductActive(item)}
              className="ml-4 mr-4 text-sm text-slate-600"
            >
              {item.active ? "Archivar" : "Restaurar"}
            </button>
            <span>
              {item.category?.name ?? "Sin categoría"} ·{" "}
              {money(item.prices[0]?.amountMinor ?? 0)}
            </span>
          </div>
        ))}
      </div>
      <form
        onSubmit={(event) => void save(event)}
        className="inventory-side-form border bg-white p-5"
      >
        <h2 className="font-semibold">
          {editingProduct ? "Editar producto" : "Nuevo producto"}
        </h2>
        <Input label="Nombre" value={name} onChange={setName} />
        <Input
          label="Código de barras"
          value={barcode}
          onChange={setBarcode}
          required={false}
        />
        <CatalogOptionSelect
          label="Categoría"
          emptyLabel="Sin categoría"
          value={categoryId}
          options={options?.categories ?? []}
          disabled={!options || productSaving || optionCreating}
          onChange={setCategoryId}
          allowParent
          onCreate={(name, parentId) =>
            createProductOption("categories", name, parentId)
          }
        />
        <CatalogOptionSelect
          label="Laboratorio"
          emptyLabel={suggestedLaboratoryName || "Sin laboratorio"}
          value={laboratoryId}
          options={options?.laboratories ?? []}
          disabled={!options || productSaving || optionCreating}
          onChange={(id) => {
            setLaboratoryId(id);
            setSuggestedLaboratoryName("");
          }}
          onCreate={(name) => createProductOption("laboratories", name)}
        />
        <Input
          label="Principio activo"
          value={activeIngredient}
          onChange={setActiveIngredient}
          required={false}
        />
        <Input
          label="Forma farmacéutica"
          value={pharmaceuticalForm}
          onChange={setPharmaceuticalForm}
          required={false}
        />
        <Input
          label="Concentración"
          value={concentration}
          onChange={setConcentration}
          required={false}
        />
        <Input
          label="Presentación"
          value={presentation}
          onChange={setPresentation}
          required={false}
        />
        <Input
          label="Precio de venta"
          disabled={priceLocked}
          type="number"
          value={price}
          onChange={setPrice}
        />
        <button className="mt-5 w-full bg-teal-700 py-2 text-sm text-white">
          {editingProduct ? "Guardar cambios" : "Guardar"}
        </button>
        {editingProduct ? (
          <button
            type="button"
            onClick={() => clearForm()}
            className="mt-2 w-full border py-2 text-sm"
          >
            Cancelar edición
          </button>
        ) : null}
      </form>
    </div>
  );
}

function Inventory({
  token,
  organizationId,
  branchId,
  products,
  stock,
  done,
  error,
  onPurchase,
}: {
  token: string;
  organizationId: string;
  branchId: string;
  products: CatalogProduct[];
  stock: StockLot[];
  done: () => void;
  error: (value: string) => void;
  onPurchase: (id: string) => void;
}): ReactElement {
  const [inventoryFilters, setInventoryFilters] = useState(
    emptyInventoryFilters,
  );
  const [stockPageNumber, setStockPageNumber] = useState(1);
  const productOptions = useMemo(
    () => products.map(inventoryProductOption),
    [products],
  );
  const stockProductOptions = useMemo(
    () => inventoryStockProductOptions(products, stock),
    [products, stock],
  );
  const stockRows = useMemo(
    () => inventoryRows(products, stock, inventoryFilters),
    [products, stock, inventoryFilters],
  );
  const stockPage = inventoryPage(stockRows, stockPageNumber);
  const filterInventory = (filters: InventoryFilters) => {
    setInventoryFilters(filters);
    setStockPageNumber(1);
  };
  const [productId, setProductId] = useState("");
  const [inventoryMode, setInventoryMode] = useState<
    "receive" | "adjust" | "return"
  >("receive");
  const [scannedCode, setScannedCode] = useState("");
  const [scanStatus, setScanStatus] = useState("");
  const [scanError, setScanError] = useState(false);
  const [receiveSupplierId, setReceiveSupplierId] = useState("");
  const [lotNumber, setLotNumber] = useState("");
  const [quantity, setQuantity] = useState("");
  const [cost, setCost] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [adjustmentProductId, setAdjustmentProductId] = useState("");
  const [adjustmentLotId, setAdjustmentLotId] = useState("");
  const [adjustmentQuantity, setAdjustmentQuantity] = useState("");
  const [adjustmentDirection, setAdjustmentDirection] = useState<
    "subtract" | "add"
  >("add");
  const [adjustmentReason, setAdjustmentReason] = useState("");
  const [adjustmentSupplierId, setAdjustmentSupplierId] = useState("");
  const [adjustmentCostMode, setAdjustmentCostMode] =
    useState<AdjustmentCostMode>("none");
  const [adjustmentCost, setAdjustmentCost] = useState("");
  const [suppliers, setSuppliers] = useState<Party[]>([]);
  const [returnSupplierId, setReturnSupplierId] = useState("");
  const [returnProductId, setReturnProductId] = useState("");
  const [returnLotId, setReturnLotId] = useState("");
  const [returnQuantity, setReturnQuantity] = useState("");
  const [returnReason, setReturnReason] = useState("");
  const scannerInputRef = useRef<HTMLInputElement>(null);
  const lotInputRef = useRef<HTMLInputElement>(null);
  const receiveQuantityInputRef = useRef<HTMLInputElement>(null);
  const adjustmentLotSelectRef = useRef<HTMLInputElement>(null);
  const adjustmentQuantityInputRef = useRef<HTMLInputElement>(null);
  const [adjustmentError, setAdjustmentError] = useState("");
  const returnQuantityInputRef = useRef<HTMLInputElement>(null);
  const returnLotSelectRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    void getParties(token, organizationId, "suppliers")
      .then(setSuppliers)
      .catch((cause: unknown) =>
        error(
          cause instanceof Error
            ? cause.message
            : "No se pudieron cargar los proveedores.",
        ),
      );
  }, [organizationId, token]); // eslint-disable-line react-hooks/exhaustive-deps
  const focusScanner = () => {
    window.requestAnimationFrame(() => scannerInputRef.current?.focus());
  };
  const supplierOptions = suppliers
    .filter((supplier) => supplier.active)
    .map(inventorySupplierOption);
  const returnSupplierOptions = inventoryReturnSuppliers(
    stock.find((lot) => lot.id === returnLotId),
    supplierOptions,
  );
  const adjustmentLot = stock.find((lot) => lot.id === adjustmentLotId);
  const adjustmentSupplierOptions = inventoryAdjustSuppliers(
    adjustmentLot,
    supplierOptions,
    adjustmentDirection,
  );
  const clearAdjustmentCost = () => {
    setAdjustmentCostMode("none");
    setAdjustmentCost("");
  };
  const chooseAdjustmentLot = (id: string, supplierId?: string) => {
    setAdjustmentLotId(id);
    clearAdjustmentCost();
    setAdjustmentSupplierId(
      supplierId ??
        inventoryDefaultAdjustSupplier(stock.find((lot) => lot.id === id)),
    );
  };
  // Lo elegido para sumar puede no tener unidades para restar.
  const chooseAdjustmentDirection = (direction: "subtract" | "add") => {
    setAdjustmentDirection(direction);
    if (direction === "subtract") clearAdjustmentCost();
    const available = inventoryAdjustSuppliers(
      adjustmentLot,
      supplierOptions,
      direction,
    );
    if (!available.some((option) => option.value === adjustmentSupplierId))
      setAdjustmentSupplierId(inventoryDefaultAdjustSupplier(adjustmentLot));
  };
  const chooseReturnLot = (id: string, supplierId?: string) => {
    setReturnLotId(id);
    setReturnSupplierId(
      supplierId ??
        inventoryDefaultReturnSupplier(stock.find((lot) => lot.id === id)),
    );
  };
  const selectScannedProduct = () => {
    if (!scannedCode.trim()) return;
    const product = findScannedProduct(products, scannedCode);
    if (!product) {
      setScanStatus("No encontramos un producto con ese código.");
      setScanError(true);
      return;
    }
    setScannedCode("");
    setScanError(false);
    if (inventoryMode === "receive") {
      setProductId(product.id);
      setScanStatus(`${product.name} seleccionado.`);
      if (!quantity) setQuantity("1");
      window.requestAnimationFrame(() => lotInputRef.current?.focus());
      return;
    }
    const productLots = stock.filter((lot) => lot.productId === product.id);
    if (!productLots.length) {
      setScanStatus(
        `${product.name} no tiene stock disponible en esta sucursal.`,
      );
      setScanError(true);
      return;
    }
    const selectedLot = productLots.length === 1 ? productLots[0] : undefined;
    const detail = selectedLot
      ? `Lote ${selectedLot.number} seleccionado.`
      : "Elegí el lote para continuar.";
    setScanStatus(`${product.name}. ${detail}`);
    if (inventoryMode === "adjust") {
      setAdjustmentProductId(product.id);
      chooseAdjustmentLot(selectedLot?.id ?? "");
      window.requestAnimationFrame(() =>
        (selectedLot
          ? adjustmentQuantityInputRef.current
          : adjustmentLotSelectRef.current
        )?.focus(),
      );
      return;
    }
    setReturnProductId(product.id);
    chooseReturnLot(selectedLot?.id ?? "");
    window.requestAnimationFrame(() =>
      (selectedLot
        ? returnQuantityInputRef.current
        : returnLotSelectRef.current
      )?.focus(),
    );
  };
  // El lector no necesita Enter: al terminar de escribir se procesa solo.
  useEffect(() => {
    const delay = scanAutoDelay(
      Boolean(findScannedProduct(products, scannedCode)),
      scannedCode,
    );
    if (delay === null) return;
    const timer = window.setTimeout(selectScannedProduct, delay);
    return () => window.clearTimeout(timer);
  }, [scannedCode]); // eslint-disable-line react-hooks/exhaustive-deps
  const receiveLots = useMemo(
    () => visibleProductLots(stock, productId, ""),
    [stock, productId],
  );
  // La API reemplaza costo y vencimiento del lote con lo que se envía: se
  // precargan los actuales para no cambiarlos sin querer.
  const pickReceiveLot = (lot: StockLot) => {
    setLotNumber(lot.number);
    setCost(formatAmountTyping(lotCostInput(lot.unitCostMinor)));
    setExpiresAt(lot.expiresAt?.slice(0, 10) ?? "");
  };
  // Atajos desde un lote de la tabla: abren el formulario con el lote elegido.
  const receiveLot = (lot: StockLot, supplierId?: string) => {
    setInventoryMode("receive");
    setProductId(lot.productId);
    setReceiveSupplierId(supplierId ?? inventoryDefaultAdjustSupplier(lot));
    pickReceiveLot(lot);
    setScanStatus("");
    setScanError(false);
    window.requestAnimationFrame(() =>
      receiveQuantityInputRef.current?.focus(),
    );
  };
  const adjustLot = (lot: StockLot, supplierId?: string) => {
    setInventoryMode("adjust");
    setAdjustmentProductId(lot.productId);
    chooseAdjustmentLot(lot.id, supplierId);
    setScanStatus("");
    setScanError(false);
    window.requestAnimationFrame(() =>
      adjustmentQuantityInputRef.current?.focus(),
    );
  };
  const returnLot = (lot: StockLot, supplierId?: string) => {
    setInventoryMode("return");
    setReturnProductId(lot.productId);
    chooseReturnLot(lot.id, supplierId);
    setScanStatus("");
    setScanError(false);
    window.requestAnimationFrame(() => returnQuantityInputRef.current?.focus());
  };
  // El proveedor queda elegido: una misma entrega trae varios productos.
  const clearReceiveItem = () => {
    setProductId("");
    setScannedCode("");
    setLotNumber("");
    setQuantity("");
    setCost("");
    setExpiresAt("");
    setScanStatus("");
    setScanError(false);
  };
  const clearAdjustForm = () => {
    setAdjustmentProductId("");
    chooseAdjustmentLot("");
    setAdjustmentQuantity("");
    setAdjustmentReason("");
    setScannedCode("");
    setScanStatus("");
    setScanError(false);
  };
  const clearReturnForm = () => {
    setReturnProductId("");
    setReturnLotId("");
    setReturnQuantity("");
    setReturnSupplierId("");
    setReturnReason("");
    setScannedCode("");
    setScanStatus("");
    setScanError(false);
  };
  const save = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await receiveStock(token, organizationId, branchId, {
        productId,
        supplierId:
          receiveSupplierId === NO_SUPPLIER ? null : receiveSupplierId,
        lotNumber,
        quantity: Number(quantity),
        unitCostMinor: Number(typedCostMinor(cost)),
        expiresAt: expiresAt || undefined,
      });
      clearReceiveItem();
      setScanStatus("Recepción registrada. Escaneá el siguiente producto.");
      done();
      focusScanner();
    } catch (cause) {
      error(
        cause instanceof Error
          ? cause.message
          : "No se pudo recibir la mercadería.",
      );
    }
  };
  const adjust = async (event: FormEvent) => {
    event.preventDefault();
    if (!adjustmentSupplierId) {
      setAdjustmentError("Elegí de qué proveedor son las unidades.");
      return;
    }
    try {
      await adjustStock(token, organizationId, branchId, {
        lotId: adjustmentLotId,
        quantity: stockAdjustmentDelta(adjustmentQuantity, adjustmentDirection),
        reason: adjustmentReason,
        supplierId:
          adjustmentSupplierId === NO_SUPPLIER ? null : adjustmentSupplierId,
        unitCostMinor: stockAdjustmentCost(
          adjustmentCostMode,
          adjustmentDirection,
          adjustmentLot?.unitCostMinor,
          adjustmentCost,
        ),
      });
      clearAdjustmentCost();
      setAdjustmentQuantity("");
      setAdjustmentReason("");
      setAdjustmentSupplierId(inventoryDefaultAdjustSupplier(adjustmentLot));
      setScannedCode("");
      setScanStatus("Ajuste registrado. Escaneá el siguiente producto.");
      setScanError(false);
      done();
      focusScanner();
    } catch (cause) {
      setAdjustmentError(
        cause instanceof Error
          ? cause.message
          : "No se pudo ajustar el stock. Intentá nuevamente.",
      );
    }
  };
  const returnToSupplier = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await createSupplierReturn(token, organizationId, branchId, {
        supplierId: returnSupplierId === NO_SUPPLIER ? null : returnSupplierId,
        lotId: returnLotId,
        quantity: Number(returnQuantity),
        reason: returnReason,
      });
      setReturnQuantity("");
      setReturnSupplierId("");
      setReturnReason("");
      setScannedCode("");
      setScanStatus("Devolución registrada. Escaneá el siguiente producto.");
      setScanError(false);
      done();
      focusScanner();
    } catch (cause) {
      error(
        cause instanceof Error
          ? cause.message
          : "No se pudo registrar la devolución al proveedor.",
      );
    }
  };
  return (
    <div className="workspace-split grid gap-6">
      <div className="min-w-0 self-start space-y-3">
        {adjustmentError && (
          <ProductSaveErrorDialog
            title="No pudimos registrar el ajuste"
            message={adjustmentError}
            onClose={() => setAdjustmentError("")}
          />
        )}
        <InventoryToolbar
          filters={inventoryFilters}
          products={stockPage.total}
          lots={stockPage.lots}
          onChange={filterInventory}
        />
        {stockPage.total > 0 ? (
          <InventoryStockTable
            rows={stockPage.rows}
            lotQuery={inventoryFilters.lot}
            token={token}
            organizationId={organizationId}
            branchId={branchId}
            done={done}
            onAdjust={adjustLot}
            onReceive={receiveLot}
            onReturn={returnLot}
            footer={
              <Pagination
                integrated
                total={stockPage.total}
                currentPage={stockPage.currentPage}
                totalPages={stockPage.totalPages}
                noun="productos"
                label="Páginas de inventario"
                onChange={setStockPageNumber}
              />
            }
          />
        ) : (
          <p
            role="status"
            className="rounded-xl border bg-white px-5 py-10 text-center text-sm text-slate-500"
          >
            {Object.values(inventoryFilters).some(Boolean)
              ? "No hay productos que coincidan con los filtros."
              : "No hay productos en esta sucursal."}
          </p>
        )}
      </div>
      <div>
        <div className="mb-3 grid grid-cols-3 rounded-lg border border-slate-200 bg-white p-1">
          {[
            ["receive", "Recibir"],
            ["adjust", "Ajustar"],
            ["return", "Devolver"],
          ].map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              onClick={() =>
                setInventoryMode(mode as "receive" | "adjust" | "return")
              }
              className={`rounded-md px-2 py-2 text-xs font-semibold transition ${
                inventoryMode === mode
                  ? "bg-teal-700 text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {inventoryMode === "receive" ? (
          <form
            onSubmit={(event) => void save(event)}
            className="inventory-side-form border bg-white p-5"
          >
            <h2 className="font-semibold">Recibir mercadería</h2>
            <InventoryScanField
              value={scannedCode}
              status={scanStatus}
              error={scanError}
              inputRef={scannerInputRef}
              onChange={(value) => {
                setScannedCode(value);
                setScanStatus("");
                setScanError(false);
              }}
              onSubmit={selectScannedProduct}
            />
            <InventorySearchSelect
              label="Proveedor"
              value={receiveSupplierId}
              options={[noSupplierOption, ...supplierOptions]}
              placeholder="Elegí el proveedor"
              onChange={setReceiveSupplierId}
            />
            <InventorySearchSelect
              label="Producto"
              value={productId}
              options={productOptions}
              onChange={(id) => {
                setProductId(id);
                setScanStatus("");
                setScanError(false);
                if (id)
                  window.requestAnimationFrame(() =>
                    lotInputRef.current?.focus(),
                  );
              }}
            />
            <InventoryLotInput
              value={lotNumber}
              lots={receiveLots}
              productSelected={Boolean(productId)}
              onChange={setLotNumber}
              onPick={pickReceiveLot}
              inputRef={lotInputRef}
            />
            <Input
              label="Cantidad"
              type="number"
              value={quantity}
              onChange={setQuantity}
              inputRef={receiveQuantityInputRef}
            />
            <MoneyInput
              label="Costo unitario"
              value={cost}
              onChange={setCost}
            />
            <Input
              label="Vencimiento"
              type="date"
              value={expiresAt}
              onChange={setExpiresAt}
              required={false}
            />
            <InventoryFormActions
              submitLabel="Confirmar recepción"
              canClear={Boolean(
                receiveSupplierId ||
                productId ||
                scannedCode ||
                lotNumber ||
                quantity ||
                cost ||
                expiresAt,
              )}
              onClear={() => {
                clearReceiveItem();
                setReceiveSupplierId("");
                focusScanner();
              }}
            />
            {/* Va al final: su alto varía y no debe correr los campos. */}
            <InventoryPendingPurchase
              token={token}
              organizationId={organizationId}
              branchId={branchId}
              productId={productId}
              onOpen={onPurchase}
            />
          </form>
        ) : null}
        {inventoryMode === "adjust" ? (
          <form
            onSubmit={(event) => void adjust(event)}
            className="inventory-side-form border bg-white p-5"
          >
            <h2 className="font-semibold">Ajuste de stock</h2>
            <InventoryScanField
              value={scannedCode}
              status={scanStatus}
              error={scanError}
              inputRef={scannerInputRef}
              onChange={(value) => {
                setScannedCode(value);
                setScanStatus("");
                setScanError(false);
              }}
              onSubmit={selectScannedProduct}
            />
            <InventoryLotPicker
              stock={stock}
              productOptions={stockProductOptions}
              productId={adjustmentProductId}
              lotId={adjustmentLotId}
              lotInputRef={adjustmentLotSelectRef}
              onProductChange={(id) => {
                setAdjustmentProductId(id);
                chooseAdjustmentLot("");
              }}
              onLotChange={(id) => {
                chooseAdjustmentLot(id);
                if (id)
                  window.requestAnimationFrame(() =>
                    adjustmentQuantityInputRef.current?.focus(),
                  );
              }}
            />
            <StockAdjustmentQuantity
              direction={adjustmentDirection}
              onDirectionChange={chooseAdjustmentDirection}
              value={adjustmentQuantity}
              onChange={setAdjustmentQuantity}
              inputRef={adjustmentQuantityInputRef}
            />
            <InventorySearchSelect
              label="Proveedor"
              value={adjustmentSupplierId}
              options={adjustmentSupplierOptions}
              disabled={!adjustmentLotId}
              placeholder={
                adjustmentLotId ? "Elegí el proveedor" : "Elegí primero el lote"
              }
              onChange={setAdjustmentSupplierId}
            />
            {adjustmentDirection === "add" ? (
              <StockAdjustmentCost
                lastCostMinor={adjustmentLot?.unitCostMinor}
                mode={adjustmentCostMode}
                onModeChange={setAdjustmentCostMode}
                value={adjustmentCost}
                onChange={setAdjustmentCost}
              />
            ) : null}
            <Input
              label="Motivo"
              value={adjustmentReason}
              onChange={setAdjustmentReason}
            />
            <InventoryFormActions
              submitLabel="Registrar ajuste"
              canClear={Boolean(
                adjustmentProductId ||
                scannedCode ||
                adjustmentQuantity ||
                adjustmentReason,
              )}
              onClear={() => {
                clearAdjustForm();
                focusScanner();
              }}
            />
          </form>
        ) : null}
        {inventoryMode === "return" ? (
          <form
            onSubmit={(event) => void returnToSupplier(event)}
            className="inventory-side-form border bg-white p-5"
          >
            <div>
              <h2 className="font-semibold">Devolución a proveedor</h2>
              <p className="mt-1 text-xs text-slate-500">
                Da salida al lote; usalo para vencidos, daños o reclamos al
                proveedor.
              </p>
            </div>
            <InventoryScanField
              value={scannedCode}
              status={scanStatus}
              error={scanError}
              inputRef={scannerInputRef}
              onChange={(value) => {
                setScannedCode(value);
                setScanStatus("");
                setScanError(false);
              }}
              onSubmit={selectScannedProduct}
            />
            <InventoryLotPicker
              stock={stock}
              productOptions={stockProductOptions}
              productId={returnProductId}
              lotId={returnLotId}
              lotInputRef={returnLotSelectRef}
              onProductChange={(id) => {
                setReturnProductId(id);
                chooseReturnLot("");
              }}
              onLotChange={(id) => {
                chooseReturnLot(id);
                if (id)
                  window.requestAnimationFrame(() =>
                    returnQuantityInputRef.current?.focus(),
                  );
              }}
            />
            <Input
              label="Cantidad"
              type="number"
              value={returnQuantity}
              onChange={setReturnQuantity}
              inputRef={returnQuantityInputRef}
            />
            <InventorySearchSelect
              label="Proveedor"
              value={returnSupplierId}
              options={returnSupplierOptions}
              disabled={!returnLotId}
              placeholder={
                returnLotId ? "Elegí el proveedor" : "Elegí primero el lote"
              }
              onChange={setReturnSupplierId}
            />
            <Input
              label="Motivo"
              value={returnReason}
              onChange={setReturnReason}
            />
            <InventoryFormActions
              submitLabel="Confirmar devolución"
              canClear={Boolean(
                returnProductId ||
                scannedCode ||
                returnQuantity ||
                returnSupplierId ||
                returnReason,
              )}
              onClear={() => {
                clearReturnForm();
                focusScanner();
              }}
            />
          </form>
        ) : null}
      </div>
    </div>
  );
}

const cashChoiceNotice =
  "Hay varias cajas abiertas: cerrá el cobro y elegí arriba en cuál cobrar.";

function Sales({
  allowWithoutSession,
  userKey,
  active,
  onPendingChange,
  token,
  organizationId,
  branchId,
  products: catalogProducts,
  stock,
  session,
  cashChoiceRequired,
  salesScreen,
  onSalesScreenChange,
  done,
  error,
}: {
  active: boolean;
  onPendingChange: (pending: boolean) => void;
  allowWithoutSession: boolean;
  userKey: string;
  token: string;
  organizationId: string;
  branchId: string;
  products: CatalogProduct[];
  stock: StockLot[];
  session?: CashSession;
  cashChoiceRequired: boolean;
  salesScreen: "pos" | "history";
  onSalesScreenChange: (screen: "pos" | "history") => void;
  done: () => void;
  error: (value: string) => void;
}): ReactElement {
  type ReceiptLine = {
    name: string;
    quantity: number;
    unitPriceMinor: number;
    discountMinor: number;
  };
  type Receipt = {
    sale: Sale;
    customerName: string;
    lines: ReceiptLine[];
    subtotalMinor: number;
    discountMinor: number;
    payments: {
      method: "TRANSFER" | "CARD" | "CASH" | "ACCOUNT";
      amountMinor: number;
    }[];
  };
  const [productId, setProductId] = useState("");
  const [productQuery, setProductQuery] = useState("");
  const [catalogCategoryId, setCatalogCategoryId] = useState("");
  const [catalogInStockOnly, setCatalogInStockOnly] = useState(false);
  const [detailQuantity, setDetailQuantity] = useState(1);
  const [salePacks, setSalePacks] = useState<PurchasePack[]>([]);
  useEffect(() => {
    getMedicinePacks(token, organizationId).then(setSalePacks, () =>
      setSalePacks([]),
    );
  }, [token, organizationId]);
  const catalogId = useId();
  const productSearchRef = useRef<HTMLInputElement>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkoutError, setCheckoutError] = useState("");
  const [lastAddedId, setLastAddedId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [lines, setLines] = useState<
    {
      productId: string;
      description?: string;
      unitPriceMinor?: number;
      requestedUnitPriceMinor?: number;
      quantity: number;
      discountMinor: number;
      // Unidades de la línea vendidas como exhibidor cerrado.
      packQuantity?: number;
    }[]
  >([]);
  const [resumeNeeded, setResumeNeeded] = useState(false);
  const posVisible = active && salesScreen === "pos";
  const wasVisible = useRef(posVisible);
  useEffect(() => {
    if (wasVisible.current && !posVisible && lines.length > 0)
      setResumeNeeded(true);
    wasVisible.current = posVisible;
  }, [posVisible, lines.length]);
  useEffect(() => {
    onPendingChange(lines.length > 0);
    const warnBeforeClose = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    if (lines.length > 0)
      window.addEventListener("beforeunload", warnBeforeClose);
    return () => window.removeEventListener("beforeunload", warnBeforeClose);
  }, [lines.length, onPendingChange]);
  const [method, setMethod] = useState<
    "TRANSFER" | "CARD" | "CASH" | "ACCOUNT"
  >("CASH");
  const [payments, setPayments] = useState<
    { method: "TRANSFER" | "CARD" | "CASH" | "ACCOUNT"; amountMinor: number }[]
  >([]);
  const [history, setHistory] = useState<Sale[]>([]);
  const [operationReason, setOperationReason] = useState("");
  const [customers, setCustomers] = useState<Party[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [salePriceListId, setSalePriceListId] = useState("");
  const resetSaleParties = useCallback(() => {
    setCustomerId("");
    setSalePriceListId("");
  }, []);
  // Cada venta nueva arranca en Público general y Precio general. Con productos
  // cargados no se toca: es una venta en curso y se decide al volver.
  useEffect(() => {
    if (!posVisible && lines.length === 0) resetSaleParties();
  }, [posVisible, lines.length, resetSaleParties]);
  const [invoiceSaleId, setInvoiceSaleId] = useState<string>();
  const [fiscalSettingsOpen, setFiscalSettingsOpen] = useState(false);
  const [fiscalOptions, setFiscalOptions] = useState<SaleFiscalOptions>(
    defaultSaleFiscalOptions,
  );
  const [fiscalCapabilities, setFiscalCapabilities] =
    useState<SaleFiscalCapabilities | null>(null);
  useEffect(() => {
    if (!active) return;
    let current = true;
    void getSaleFiscalCapabilities(token, organizationId, branchId)
      .then((result) => {
        if (current) setFiscalCapabilities(result);
      })
      .catch(() => {
        if (current) setFiscalCapabilities(null);
      });
    return () => {
      current = false;
    };
  }, [active, token, organizationId, branchId]);
  const [documentType, setDocumentType] = useState<"INTERNAL" | "INVOICE">(
    "INTERNAL",
  );
  const [salePriceLists, setSalePriceLists] = useState<PriceList[]>([]);
  useEffect(() => {
    if (!active) return;
    let current = true;
    void getPriceLists(token, organizationId)
      .then((lists) => {
        if (current) setSalePriceLists(lists);
      })
      .catch(() => {
        if (current) setSalePriceLists([]);
      });
    return () => {
      current = false;
    };
  }, [active, token, organizationId]);
  const activeSaleListId = effectiveSalePriceListId(
    salePriceLists,
    salePriceListId,
    customers.find((customer) => customer.id === customerId)?.priceListId,
  );
  const [pricing, setPricing] = useState<{
    key: string;
    data: EffectivePrices;
  }>();
  const [pricingLoading, setPricingLoading] = useState(true);
  const [pricingError, setPricingError] = useState("");
  const [pricingVersion, setPricingVersion] = useState(0);
  const lastPricing = useRef("");
  const pricingKey = `${organizationId}:${customerId}:${salePriceListId}`;
  useEffect(() => {
    if (!active) return;
    let current = true;
    setPricingLoading(true);
    setPricingError("");
    void getEffectivePrices(token, organizationId, customerId, salePriceListId)
      .then((data) => {
        if (!current) return;
        const signature = JSON.stringify({ key: pricingKey, data });
        if (lastPricing.current && lastPricing.current !== signature) {
          setPayments([]);
          setLines((current) =>
            current.map((line) => ({
              ...line,
              requestedUnitPriceMinor: undefined,
            })),
          );
        }
        lastPricing.current = signature;
        setPricing({ key: pricingKey, data });
        setPricingLoading(false);
      })
      .catch((cause) => {
        if (current) {
          setPricingError(
            cause instanceof Error
              ? cause.message
              : "No se pudieron cargar precios.",
          );
          setPricingLoading(false);
        }
      });
    return () => {
      current = false;
    };
  }, [
    active,
    token,
    organizationId,
    customerId,
    pricingKey,
    salePriceListId,
    pricingVersion,
    catalogProducts,
  ]);
  const pricingReady =
    !pricingLoading && !pricingError && pricing?.key === pricingKey;
  const products = catalogProducts.map((product) => {
    const price =
      pricing?.key === pricingKey
        ? pricing.data.prices.find((p) => p.productId === product.id)
            ?.amountMinor
        : null;
    return {
      ...product,
      prices: price == null ? [] : [{ amountMinor: price }],
    };
  });
  const [receipt, setReceipt] = useState<Receipt>();
  const [conceptOpen, setConceptOpen] = useState(false);
  const [creditAccounts, setCreditAccounts] = useState<CustomerAccount[]>([]);
  const creditAccount = creditAccounts.find(
    (account) => account.id === customerId,
  );
  useEffect(() => {
    if (!active) return;
    let current = true;
    let revision = 0;
    const unsubscribe = subscribeSalesDataRefresh(() => {
      const requested = ++revision;
      const isCurrent = () => current && requested === revision;
      void getParties(token, organizationId, "customers")
        .then((items) => {
          if (isCurrent()) setCustomers(items);
        })
        .catch(() => {
          if (isCurrent())
            error(
              "No se pudo actualizar el listado de clientes. Volvé a entrar a Ventas para reintentar.",
            );
        });
      void getCustomerAccounts(token, organizationId, branchId)
        .then((items) => {
          if (isCurrent()) setCreditAccounts(items);
        })
        .catch(() => {
          if (isCurrent()) setCreditAccounts([]);
        });
    });
    return () => {
      current = false;
      unsubscribe();
    };
  }, [active, token, organizationId, branchId, receipt, error]);
  useEffect(() => {
    setPayments((current) =>
      current.filter((payment) => payment.method !== "ACCOUNT"),
    );
    setMethod((current) => (current === "ACCOUNT" ? "CASH" : current));
  }, [customerId]);
  const [clientOperationId, setClientOperationId] = useState(() =>
    crypto.randomUUID(),
  );
  const stockByProduct = useMemo(() => {
    const totals = new Map<string, { available: number; expired: number }>();
    for (const lot of stock) {
      const current = totals.get(lot.productId) ?? { available: 0, expired: 0 };
      const lotStock = withStockAvailability(lot);
      totals.set(lot.productId, {
        available: current.available + lotStock.sellableQuantity,
        expired: current.expired + lotStock.expiredQuantity,
      });
    }
    return totals;
  }, [stock]);
  const productStock = (id: string) =>
    stockByProduct.get(id) ?? { available: 0, expired: 0 };
  const available = (id: string) => productStock(id).available;
  const subtotal = lines.reduce(
    (sum, line) =>
      sum +
      Number(
        line.requestedUnitPriceMinor ??
          line.unitPriceMinor ??
          products.find((item) => item.id === line.productId)?.prices[0]
            ?.amountMinor ??
          0,
      ) *
        line.quantity,
    0,
  );
  const discountMinor = lines.reduce(
    (sum, line) => sum + line.discountMinor,
    0,
  );
  const total = subtotal - discountMinor;
  const searchTerm = productQuery.trim().toLocaleLowerCase();
  const exactBarcodeProduct = products.find(
    (item) =>
      available(item.id) > 0 &&
      item.barcodes.some(
        (barcode) => barcode.code.toLocaleLowerCase() === searchTerm,
      ),
  );
  // Un exhibidor se vende como N unidades del producto base.
  const packSale =
    searchTerm && !exactBarcodeProduct
      ? packSaleProduct(searchTerm, products, salePacks)
      : null;
  const catalogMatches = filterSaleCatalog(products, productStock, {
    query: productQuery,
    categoryId: catalogCategoryId,
    inStockOnly: catalogInStockOnly,
  });
  // El código del exhibidor no es de ningún producto: se muestra su envase base.
  const catalogRows = (
    packSale && !catalogMatches.length ? [packSale.product] : catalogMatches
  ).slice(0, SALE_CATALOG_ROW_LIMIT);
  // Mientras se escribe, el primer resultado vendible queda elegido para Enter.
  const selectedCatalogProduct =
    products.find((item) => item.id === productId) ??
    (searchTerm
      ? (exactBarcodeProduct ??
        packSale?.product ??
        catalogRows.find((item) => available(item.id) > 0))
      : undefined);
  // Con el código de un exhibidor la cantidad es su factor: no depende de la
  // selección de la fila, que vuelve la cantidad a 1.
  const saleDetailQuantity =
    packSale && selectedCatalogProduct?.id === packSale.product.id
      ? packSale.factor
      : detailQuantity;
  const focusProductSearch = () =>
    window.requestAnimationFrame(() => productSearchRef.current?.focus());
  const selectCatalogProduct = (id: string | undefined) => {
    if (!id) return;
    setProductId(id);
    setDetailQuantity(1);
  };
  const clearCatalogSelection = () => {
    setProductId("");
    setProductQuery("");
    setDetailQuantity(1);
    focusProductSearch();
  };
  const addCatalogProduct = (id: string, quantity: number) => {
    const packQuantity = packSale?.product.id === id ? quantity : 0;
    if (!addProductToSale(id, quantity, packQuantity)) return;
    clearCatalogSelection();
  };
  const addProductToSale = (
    selectedProductId: string,
    requestedQuantity: number,
    packQuantity = 0,
  ) => {
    if (
      !Number.isInteger(requestedQuantity) ||
      requestedQuantity < 1 ||
      requestedQuantity > available(selectedProductId)
    ) {
      error("Revisá el producto y su stock disponible.");
      return false;
    }
    setLines((current) => {
      const currentLine = current.find(
        (line) => line.productId === selectedProductId,
      );
      if (
        currentLine &&
        currentLine.quantity + requestedQuantity > available(selectedProductId)
      ) {
        error("La cantidad acumulada supera el stock disponible.");
        return current;
      }
      if (!currentLine) {
        return [
          ...current,
          {
            productId: selectedProductId,
            quantity: requestedQuantity,
            discountMinor: 0,
            packQuantity,
          },
        ];
      }
      return current.map((line) =>
        line.productId === selectedProductId
          ? {
              ...line,
              quantity: line.quantity + requestedQuantity,
              packQuantity: (line.packQuantity ?? 0) + packQuantity,
            }
          : line,
      );
    });
    setLastAddedId(selectedProductId);
    return true;
  };
  const scanIntoSale = (code: string) => {
    const scanned = products.find((product) =>
      product.barcodes.some((barcode) => barcode.code.trim() === code.trim()),
    );
    const pack = scanned ? null : packSaleProduct(code, products, salePacks);
    if (scanned) addProductToSale(scanned.id, 1);
    else if (pack) addProductToSale(pack.product.id, pack.factor, pack.factor);
    else error("No se encontró un producto con ese código.");
  };
  const add = (event: Pick<FormEvent, "preventDefault">) => {
    event.preventDefault();
    if (!selectedCatalogProduct) return;
    addCatalogProduct(selectedCatalogProduct.id, saleDetailQuantity);
  };
  const updateLineQuantity = (
    productIdToUpdate: string,
    nextQuantity: number,
  ) => {
    if (!Number.isSafeInteger(nextQuantity)) return;
    if (nextQuantity < 1) {
      setLines((current) =>
        current.filter((line) => line.productId !== productIdToUpdate),
      );
      return;
    }
    const editingLine = lines.find(
      (line) => line.productId === productIdToUpdate,
    );
    const maximum = editingLine?.description
      ? conceptMaximumQuantity(editingLine.unitPriceMinor ?? 0)
      : available(productIdToUpdate);
    if (nextQuantity > maximum) {
      error(
        editingLine?.description
          ? "La cantidad supera el límite admitido para este importe."
          : "La cantidad supera el stock disponible.",
      );
      return;
    }
    setLines((current) =>
      current.map((line) =>
        line.productId === productIdToUpdate
          ? { ...line, quantity: nextQuantity }
          : line,
      ),
    );
  };
  const applyDiscount = (nextDiscountMinor: number) => {
    if (
      !Number.isSafeInteger(nextDiscountMinor) ||
      nextDiscountMinor < 0 ||
      nextDiscountMinor > subtotal
    ) {
      error("Indicá un descuento válido que no supere el subtotal.");
      return;
    }
    const nextTotal = subtotal - nextDiscountMinor;
    let nextPayments: typeof payments;
    try {
      nextPayments = paymentsAfterDiscount(nextTotal, payments);
    } catch (cause) {
      error(
        cause instanceof Error
          ? cause.message
          : "Revisá los pagos antes de aplicar el descuento.",
      );
      return;
    }
    setLines((current) =>
      distributeSaleDiscount(
        current,
        nextDiscountMinor,
        (line) =>
          Number(
            line.requestedUnitPriceMinor ??
              line.unitPriceMinor ??
              products.find((product) => product.id === line.productId)
                ?.prices[0]?.amountMinor ??
              0,
          ) * line.quantity,
      ),
    );
    setPayments(nextPayments);
  };
  const paid = payments.reduce((sum, payment) => sum + payment.amountMinor, 0);
  const paymentAmountMinor = parseArgentineAmountMinor(paymentAmount);
  // Con la ventana de cobro abierta, los errores se muestran dentro de ella.
  const reportPayment = (message: string): undefined => {
    if (checkoutOpen) setCheckoutError(message);
    else error(message);
  };
  const groupedPayments = payments.reduce<
    { method: "TRANSFER" | "CARD" | "CASH" | "ACCOUNT"; amountMinor: number }[]
  >((groups, payment) => {
    const current = groups.find((group) => group.method === payment.method);
    if (current) {
      current.amountMinor += payment.amountMinor;
    } else {
      groups.push({ ...payment });
    }
    return groups;
  }, []);
  // Devuelve los pagos con el importe del campo agregado, o undefined si no es válido.
  const paymentsWithAmount = () => {
    const remaining = total - paid;
    if (remaining <= 0)
      return reportPayment("La venta ya está completamente cobrada.");
    if (method === "ACCOUNT" && !customerId)
      return reportPayment("Seleccioná un cliente para usar cuenta corriente.");
    const amountMinor = paymentAmount.trim() ? paymentAmountMinor : remaining;
    if (amountMinor === undefined || amountMinor <= 0)
      return reportPayment("Indicá un importe válido para el pago.");
    if (
      method === "ACCOUNT" &&
      (!creditAccount?.creditEnabled ||
        (creditAccount.creditLimitMinor !== null &&
          amountMinor +
            payments
              .filter((payment) => payment.method === "ACCOUNT")
              .reduce((sum, payment) => sum + payment.amountMinor, 0) >
            Number(creditAccount.creditLimitMinor) -
              Number(creditAccount.balanceMinor)))
    )
      return reportPayment(
        "La cuenta no está habilitada o el importe supera el crédito disponible.",
      );
    if (method !== "CASH" && amountMinor > remaining)
      return reportPayment(
        "Solo el efectivo puede superar el saldo pendiente para entregar vuelto.",
      );
    const existingAmount = payments
      .filter((payment) => payment.method === method)
      .reduce((sum, payment) => sum + payment.amountMinor, 0);
    return [
      ...payments.filter((payment) => payment.method !== method),
      { method, amountMinor: existingAmount + amountMinor },
    ];
  };
  const openCheckout = () => {
    if (!lines.length || !pricingReady || submitting) return;
    setCheckoutError("");
    if (!payments.length) setPaymentAmount(cashAmountDraft(total));
    setCheckoutOpen(true);
  };
  const closeCheckout = () => {
    setCheckoutOpen(false);
    setCheckoutError("");
    focusProductSearch();
  };
  // Registra el importe actual y sigue con otro medio, precargando lo que resta.
  const splitPayment = (nextMethod: typeof method) => {
    const next = paymentsWithAmount();
    if (!next) return;
    const nextPaid = next.reduce(
      (sum, payment) => sum + payment.amountMinor,
      0,
    );
    setCheckoutError("");
    if (nextMethod === "ACCOUNT") {
      try {
        setPayments(prepareAccountPayment(total, next, creditAccount));
        setPaymentAmount("");
      } catch (cause) {
        setPayments(next);
        setPaymentAmount(cashAmountDraft(Math.max(total - nextPaid, 0)));
        return reportPayment(
          cause instanceof Error
            ? cause.message
            : "No se pudo aplicar la cuenta corriente.",
        );
      }
    } else {
      setPayments(next);
      setPaymentAmount(cashAmountDraft(Math.max(total - nextPaid, 0)));
    }
    setMethod(nextMethod);
  };
  const confirmCheckout = () => {
    if (submitting) return;
    setCheckoutError("");
    if (paid >= total) return void complete(payments);
    const next = paymentsWithAmount();
    if (!next) return;
    const nextPaid = next.reduce(
      (sum, payment) => sum + payment.amountMinor,
      0,
    );
    setPayments(next);
    // Pago parcial: queda registrado y se precarga lo que falta.
    if (nextPaid < total) {
      setPaymentAmount(cashAmountDraft(total - nextPaid));
      return;
    }
    setPaymentAmount("");
    void complete(next);
  };
  const removePayment = (
    paymentMethod: "TRANSFER" | "CARD" | "CASH" | "ACCOUNT",
  ) => {
    setPayments((current) =>
      current.filter((payment) => payment.method !== paymentMethod),
    );
  };
  const selectPaymentMethod = (value: typeof method) => {
    setCheckoutError("");
    if (value === "ACCOUNT") {
      try {
        setPayments(prepareAccountPayment(total, payments, creditAccount));
        setPaymentAmount("");
      } catch (cause) {
        reportPayment(
          cause instanceof Error
            ? cause.message
            : "No se pudo aplicar la cuenta corriente.",
        );
        return;
      }
    } else if (!paymentAmount.trim())
      setPaymentAmount(cashAmountDraft(Math.max(total - paid, 0)));
    setMethod(value);
  };
  const loadHistory = async () => {
    try {
      setHistory(await getSales(token, organizationId, branchId));
    } catch (cause) {
      error(
        cause instanceof Error
          ? cause.message
          : "No se pudieron cargar las ventas.",
      );
    }
  };
  useEffect(() => {
    void loadHistory();
  }, [branchId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!active || resumeNeeded || salesScreen !== "pos") return;
    const frame = window.requestAnimationFrame(() =>
      productSearchRef.current?.focus(),
    );
    return () => window.cancelAnimationFrame(frame);
  }, [active, resumeNeeded, salesScreen]);
  // El listener global se registra una vez; el ref le da las acciones del render actual.
  const runSalesShortcut = useRef<(shortcut: SalesShortcut) => void>(() => {});
  useEffect(() => {
    runSalesShortcut.current = (shortcut) => {
      if (shortcut.action === "checkout") return openCheckout();
      const line =
        lines.find((item) => item.productId === lastAddedId) ?? lines.at(-1);
      if (!line) return;
      if (shortcut.action === "increment-last-line")
        updateLineQuantity(line.productId, line.quantity + 1);
      if (shortcut.action === "decrement-last-line")
        updateLineQuantity(line.productId, line.quantity - 1);
    };
  });
  useEffect(() => {
    const focusProductSearch = (event: KeyboardEvent) => {
      const input = productSearchRef.current;
      const blocked =
        !active ||
        resumeNeeded ||
        salesScreen !== "pos" ||
        submitting ||
        !input ||
        Boolean(
          document.querySelector(
            'dialog[open], [aria-modal="true"], [data-account-menu-open="true"]',
          ),
        );
      if (blocked) return;
      if (event.key === "F2") {
        event.preventDefault();
        input.focus();
        return;
      }
      const target = event.target instanceof Element ? event.target : null;
      const editing = Boolean(
        target?.closest(
          'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="combobox"], [role="spinbutton"]',
        ),
      );
      const shortcut = salesShortcut(event, {
        editing,
        blocked,
        checkoutOpen: false,
      });
      if (shortcut) {
        event.preventDefault();
        event.stopPropagation();
        runSalesShortcut.current(shortcut);
        return;
      }
      if (!shouldRouteSalesSearchKey(event, { editing, blocked })) return;
      event.preventDefault();
      setProductQuery(event.key);
      setProductId("");
      setDetailQuantity(1);
      input.focus();
    };
    window.addEventListener("keydown", focusProductSearch, true);
    return () =>
      window.removeEventListener("keydown", focusProductSearch, true);
  }, [active, resumeNeeded, salesScreen, submitting]);
  const cancel = async (sale: Sale) => {
    if (operationReason.trim().length < 3)
      return "Indicá un motivo de al menos 3 caracteres.";
    try {
      await cancelSale(
        token,
        organizationId,
        branchId,
        sale.id,
        operationReason,
      );
      setOperationReason("");
      await Promise.all([loadHistory(), Promise.resolve(done())]);
      return "Venta anulada correctamente.";
    } catch (cause) {
      return cause instanceof Error
        ? cause.message
        : "No se pudo anular la venta.";
    }
  };
  const returnAll = async (sale: Sale) => {
    if (!sale.items.some((item) => item.productId))
      return "Esta venta sólo contiene conceptos, sin devolución física. Para revertir el cobro utilizá Anular.";
    if (operationReason.trim().length < 3)
      return "Indicá un motivo de al menos 3 caracteres.";
    try {
      await createCustomerReturn(token, organizationId, branchId, sale.id, {
        reason: operationReason,
        items: sale.items
          .filter((item) => item.productId)
          .map((item) => ({
            saleItemId: item.id,
            quantity: item.quantity,
          })),
      });
      setOperationReason("");
      await loadHistory();
      return "Devolución registrada correctamente.";
    } catch (cause) {
      return cause instanceof Error
        ? cause.message
        : "No se pudo registrar la devolución.";
    }
  };
  // Recibe la lista final de pagos para no depender del setState asíncrono.
  const complete = async (finalPayments = payments) => {
    if (submitting) return;
    if (
      cashChoiceRequired &&
      finalPayments.some((payment) => payment.method !== "ACCOUNT")
    )
      return reportPayment(cashChoiceNotice);
    if (!allowWithoutSession && !session)
      return reportPayment(
        "Esta sucursal requiere una caja abierta para vender. Abrí una caja y reintentá.",
      );
    if (documentType === "INVOICE" && !fiscalCapabilities?.voucherTypes.length)
      return reportPayment(
        fiscalCapabilities?.reason ||
          "No se pudo verificar la configuración fiscal. Revisala antes de facturar.",
      );
    if (
      !pricingReady ||
      lines.some(
        (line) =>
          !line.description &&
          !products.find((p) => p.id === line.productId)?.prices[0],
      )
    )
      return reportPayment(
        "Esperá a que se carguen los precios o actualizalos antes de cobrar.",
      );
    try {
      if (
        finalPayments.reduce((sum, payment) => sum + payment.amountMinor, 0) <
        total
      )
        return reportPayment(
          "Agregá cobros hasta cubrir el total de la venta.",
        );
      setSubmitting(true);
      const completedSale = await createSale(token, organizationId, branchId, {
        priceListId: salePriceListId || undefined,
        documentType,
        confirmHomologation:
          documentType === "INVOICE" &&
          fiscalCapabilities?.environment === "HOMOLOGATION",
        confirmProduction:
          documentType === "INVOICE" &&
          fiscalCapabilities?.environment === "PRODUCTION",
        fiscalEnvironment:
          documentType === "INVOICE"
            ? fiscalCapabilities?.environment
            : undefined,
        fiscalOptions: documentType === "INVOICE" ? fiscalOptions : undefined,
        clientOperationId,
        customerId: customerId || undefined,
        items: lines.map((line) =>
          line.description
            ? {
                description: line.description,
                unitPriceMinor: line.unitPriceMinor,
                quantity: line.quantity,
                discountMinor: line.discountMinor,
              }
            : {
                ...line,
                // Si después bajaron la cantidad, no puede quedar de más.
                packQuantity: Math.min(line.packQuantity ?? 0, line.quantity),
                expectedUnitPriceMinor: products.find(
                  (p) => p.id === line.productId,
                )!.prices[0]!.amountMinor,
              },
        ),
        payments: finalPayments.map((payment) => ({
          ...payment,
          cashSessionId: payment.method !== "ACCOUNT" ? session?.id : undefined,
        })),
      });
      if (completedSale.documentType === "INVOICE")
        setInvoiceSaleId(completedSale.id);
      else
        setReceipt({
          sale: completedSale,
          customerName:
            customers.find((customer) => customer.id === customerId)?.name ??
            "Público general",
          lines: lines.map((line) => ({
            name:
              line.description ??
              products.find((product) => product.id === line.productId)?.name ??
              "Producto",
            quantity: line.quantity,
            unitPriceMinor: Number(
              line.requestedUnitPriceMinor ??
                line.unitPriceMinor ??
                products.find((product) => product.id === line.productId)
                  ?.prices[0]?.amountMinor ??
                0,
            ),
            discountMinor: line.discountMinor,
          })),
          subtotalMinor: subtotal,
          discountMinor,
          payments: finalPayments,
        });
      setLines([]);
      resetSaleParties();
      setLastAddedId("");
      setFiscalOptions(defaultSaleFiscalOptions);
      setPayments([]);
      setMethod("CASH");
      setPaymentAmount("");
      setCheckoutOpen(false);
      setCheckoutError("");
      setClientOperationId(crypto.randomUUID());
      await loadHistory();
      done();
    } catch (cause) {
      // El mismo clientOperationId se conserva: reintentar no duplica la venta.
      reportPayment(
        cause instanceof Error
          ? cause.message
          : "No se pudo completar la venta.",
      );
    } finally {
      setSubmitting(false);
    }
  };
  const [ticketSaleId, setTicketSaleId] = useState<string>();
  const loadTicket = useCallback(
    () => getSaleTicket(token, organizationId, branchId, ticketSaleId!),
    [token, organizationId, branchId, ticketSaleId],
  );
  const invoiceDialog = invoiceSaleId ? (
    <SaleInvoiceDialog
      token={token}
      organizationId={organizationId}
      branchId={branchId}
      saleId={invoiceSaleId}
      onClose={() => setInvoiceSaleId(undefined)}
    />
  ) : null;
  const ticketDialog = ticketSaleId ? (
    <DirectTicketPrint
      key={ticketSaleId}
      load={loadTicket}
      onClose={() => setTicketSaleId(undefined)}
    />
  ) : null;
  const printReceipt = () => {
    if (receipt) setTicketSaleId(receipt.sale.id);
  };
  // Plantilla A4 y formato de impresión de esta sucursal; se recarga al volver a
  // Ventas por si cambió en Organización. Sin respuesta se imprime ticket.
  const [documentTemplate, setDocumentTemplate] =
    useState<DocumentTemplateSettings>();
  useEffect(() => {
    if (!active) return;
    let current = true;
    void getDocumentTemplate(token, organizationId, branchId)
      .then((template) => {
        if (current) setDocumentTemplate(template);
      })
      .catch(() => {
        if (current) setDocumentTemplate(undefined);
      });
    return () => {
      current = false;
    };
  }, [active, token, organizationId, branchId]);
  const receiptSaleId = receipt?.sale.id;
  const loadReceiptTicket = useCallback(
    () => getSaleTicket(token, organizationId, branchId, receiptSaleId!),
    [token, organizationId, branchId, receiptSaleId],
  );
  if (!active) return <></>;
  if (resumeNeeded && submitting) {
    return (
      <p role="status" className="rounded-xl border bg-white p-6">
        La venta se está confirmando. Esperá el resultado antes de continuar.
      </p>
    );
  }
  const resumeDialog =
    resumeNeeded && salesScreen === "pos" && lines.length > 0 ? (
      <ResumeSaleDialog
        count={lines.length}
        onContinue={() => {
          setCheckoutOpen(false);
          setResumeNeeded(false);
        }}
        onDiscard={() => {
          setLines([]);
          setFiscalOptions(defaultSaleFiscalOptions);
          setFiscalSettingsOpen(false);
          setPayments([]);
          resetSaleParties();
          setMethod("CASH");
          setPaymentAmount("");
          setCheckoutOpen(false);
          setCheckoutError("");
          setLastAddedId("");
          setProductId("");
          setProductQuery("");
          setClientOperationId(crypto.randomUUID());
          setResumeNeeded(false);
        }}
      />
    ) : null;
  if (salesScreen === "history") {
    return (
      <>
        {ticketDialog}
        {invoiceDialog}
        <SalesHistory
          token={token}
          organizationId={organizationId}
          branchId={branchId}
          sales={history}
          products={products}
          customers={customers}
          operationReason={operationReason}
          onReasonChange={setOperationReason}
          onBack={() => onSalesScreenChange("pos")}
          onCancel={cancel}
          onReturn={returnAll}
          onPrint={(sale) =>
            sale.documentType === "INVOICE"
              ? setInvoiceSaleId(sale.id)
              : setTicketSaleId(sale.id)
          }
        />
      </>
    );
  }
  return (
    <div
      className="sales-layout grid gap-4"
      onClick={(event) => {
        const target = event.target instanceof Element ? event.target : null;
        if (!target || !event.currentTarget.contains(target)) return;
        const blocked =
          !active ||
          resumeNeeded ||
          salesScreen !== "pos" ||
          submitting ||
          Boolean(
            document.querySelector(
              'dialog[open], [aria-modal="true"], [data-account-menu-open="true"]',
            ),
          );
        if (
          shouldFocusSalesBackground(target, {
            blocked,
            defaultPrevented: event.defaultPrevented,
            button: event.button,
            detail: event.detail,
            selection: Boolean(window.getSelection()?.toString()),
          })
        ) {
          productSearchRef.current?.focus({ preventScroll: true });
        }
      }}
    >
      {resumeDialog}
      {ticketDialog}
      {invoiceDialog}
      <section
        aria-label="Catálogo de venta"
        className="sale-catalog-column flex min-h-[585px] flex-col lg:h-full lg:min-h-0"
      >
        <form onSubmit={add} className="flex min-h-0 flex-1 flex-col gap-2.5">
          <div className="sale-catalog-filters flex flex-wrap items-center gap-2">
            <span className="relative min-w-[180px] flex-1">
              <Search
                size={17}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-teal-700"
              />
              <input
                ref={productSearchRef}
                aria-label="Buscar producto"
                role="combobox"
                aria-expanded
                aria-controls={catalogId}
                aria-activedescendant={
                  selectedCatalogProduct &&
                  catalogRows.some(
                    (item) => item.id === selectedCatalogProduct.id,
                  )
                    ? saleCatalogRowId(catalogId, selectedCatalogProduct.id)
                    : undefined
                }
                className="h-11 w-full rounded-lg border border-teal-400 bg-white pl-10 pr-20 text-sm"
                value={productQuery}
                placeholder="Escaneá o buscá por nombre, droga o código"
                autoComplete="off"
                onChange={(event) => {
                  setProductQuery(event.target.value);
                  setProductId("");
                  setDetailQuantity(1);
                }}
                onKeyDown={(event) => {
                  // El form tiene varios campos: el navegador ya no lo envía solo con Enter.
                  if (event.key === "Enter" && !event.ctrlKey) {
                    add(event);
                    return;
                  }
                  if (event.key === "Escape") {
                    event.preventDefault();
                    clearCatalogSelection();
                    return;
                  }
                  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                    event.preventDefault();
                    selectCatalogProduct(
                      nextSaleCatalogSelection(
                        catalogRows,
                        selectedCatalogProduct?.id,
                        event.key === "ArrowDown" ? 1 : -1,
                      ),
                    );
                  }
                }}
              />
              <span className="pointer-events-none absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-2 text-teal-600">
                <ScanBarcode size={20} />
                <kbd className="rounded-md border border-slate-300 px-1.5 py-0.5 text-xs font-semibold text-slate-600">
                  F2
                </kbd>
              </span>
            </span>
            <div className="w-48 shrink-0 [&>div]:mt-0">
              <SearchableSaleSelect
                label="Categoría"
                floatingOptions
                options={saleCategoryOptions(products)}
                value={catalogCategoryId}
                onChange={(value) => {
                  setCatalogCategoryId(value);
                  setProductId("");
                }}
              />
            </div>
            <button
              type="button"
              aria-pressed={catalogInStockOnly}
              onClick={() => {
                setCatalogInStockOnly((current) => !current);
                setProductId("");
                focusProductSearch();
              }}
              className={`inline-flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border px-3 text-sm font-medium ${catalogInStockOnly ? "border-teal-300 bg-teal-50 text-teal-800" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
            >
              {catalogInStockOnly && <Check size={15} />}
              Con stock
            </button>
          </div>
          <SaleCatalogTable
            token={token}
            organizationId={organizationId}
            idPrefix={catalogId}
            rows={catalogRows.map((item) => ({
              product: item,
              ...productStock(item.id),
            }))}
            selectedId={selectedCatalogProduct?.id}
            hiddenCount={catalogMatches.length - catalogRows.length}
            onSelect={(id) => {
              selectCatalogProduct(id);
              focusProductSearch();
            }}
            onAdd={(id) => addCatalogProduct(id, 1)}
          />
          <SaleProductDetail
            token={token}
            organizationId={organizationId}
            product={selectedCatalogProduct}
            available={
              selectedCatalogProduct ? available(selectedCatalogProduct.id) : 0
            }
            quantity={saleDetailQuantity}
            onQuantityChange={(quantity) => {
              setDetailQuantity(quantity);
              focusProductSearch();
            }}
            onAdd={() => {
              if (selectedCatalogProduct)
                addCatalogProduct(
                  selectedCatalogProduct.id,
                  saleDetailQuantity,
                );
            }}
            onClear={clearCatalogSelection}
            onFinished={focusProductSearch}
            onInvalid={error}
          />
          <p className="sale-shortcuts text-xs text-slate-500">
            Doble clic o Enter agrega · <strong>F2</strong> buscar ·{" "}
            <strong>+ / −</strong> última línea · <strong>Ctrl + Enter</strong>{" "}
            cobrar
          </p>
        </form>
      </section>

      <SaleCurrentPanel
        lineCount={lines.length}
        unitCount={lines.reduce((sum, line) => sum + line.quantity, 0)}
        totalMinor={total}
        submitting={submitting}
        checkoutDisabled={!lines.length || submitting || !pricingReady}
        onCheckout={openCheckout}
        onClear={() => {
          setLines([]);
          resetSaleParties();
          setLastAddedId("");
          setFiscalOptions(defaultSaleFiscalOptions);
          setFiscalSettingsOpen(false);
          setPayments([]);
          setMethod("CASH");
          setPaymentAmount("");
          focusProductSearch();
        }}
        headerActions={
          <SaleConceptMenu
            disabled={submitting}
            onAdd={() => setConceptOpen(true)}
          />
        }
        discount={
          <SaleGeneralDiscount
            subtotalMinor={subtotal}
            discountMinor={discountMinor}
            totalDiscountMinor={
              discountMinor +
              // Descuento por producto: precio de lista menos el precio rebajado.
              lines.reduce((sum, line) => {
                if (line.description || line.requestedUnitPriceMinor == null)
                  return sum;
                const list = Number(
                  products.find((item) => item.id === line.productId)?.prices[0]
                    ?.amountMinor ?? 0,
                );
                return (
                  sum +
                  Math.max(list - line.requestedUnitPriceMinor, 0) *
                    line.quantity
                );
              }, 0)
            }
            disabled={!lines.length || submitting}
            onApply={applyDiscount}
            onInvalid={error}
          />
        }
        context={
          <>
            <div className="block text-xs font-medium text-slate-700">
              Cliente
              <SearchableSaleSelect
                label="Cliente"
                floatingOptions
                options={[
                  { value: "", label: "Público general" },
                  ...customers
                    .filter((customer) => customer.active)
                    .map((customer) => ({
                      value: customer.id,
                      label: [
                        customer.name,
                        customerIdentityDetail(customer) ||
                          (matchingCustomerNames(
                            customers,
                            customer.name,
                            customer.id,
                          ).length
                            ? `Ficha ${customer.id.slice(0, 8)}`
                            : ""),
                      ]
                        .filter(Boolean)
                        .join(" · "),
                    })),
                ]}
                value={customerId}
                onChange={(value) => {
                  setCustomerId(value);
                  setSalePriceListId("");
                  setPayments([]);
                }}
              />
            </div>
            <div className="text-xs font-medium text-slate-700">
              Lista de precios
              <SearchableSaleSelect
                label="Lista de precios"
                tinted
                floatingOptions
                options={salePriceListOptions(salePriceLists, activeSaleListId)}
                value={activeSaleListId}
                onChange={(value) => {
                  setSalePriceListId(value);
                  setPayments([]);
                }}
              />
              {pricingError && (
                <span role="alert" className="mt-2 block text-xs text-red-700">
                  {pricingError}{" "}
                  <button
                    type="button"
                    disabled={pricingLoading || submitting}
                    className="underline disabled:opacity-40"
                    onClick={() => setPricingVersion((version) => version + 1)}
                  >
                    Reintentar
                  </button>
                </span>
              )}
            </div>
          </>
        }
        lines={
          <div className="sale-cart flex min-h-0 flex-1 flex-col">
            <div className="sales-cart-row grid gap-2.5 border-b border-slate-200 bg-slate-50 px-5 py-2.5 text-xs font-bold uppercase tracking-wide text-slate-500">
              <span>Producto</span>
              <span className="text-center">Cantidad</span>
              <span className="text-center">Precio unit.</span>
              <span className="text-center" title="Descuento por unidad">
                Descuento
              </span>
              <span className="text-right">Subtotal</span>
              <span aria-hidden="true" />
            </div>
            <div className="min-h-0 flex-1 divide-y divide-slate-100 overflow-y-auto">
              {lines.length ? (
                sortSaleLines(lines, products).map((line) => {
                  const product = products.find(
                    (item) => item.id === line.productId,
                  );
                  const unitPrice = Number(
                    line.requestedUnitPriceMinor ??
                      line.unitPriceMinor ??
                      product?.prices[0]?.amountMinor ??
                      0,
                  );
                  return (
                    <article
                      key={line.productId}
                      className={`sales-cart-row grid items-center gap-2.5 px-5 py-2.5 ${line.productId === lastAddedId ? "bg-teal-50" : ""}`}
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <div className="shrink-0">
                          {line.description ? (
                            <ReceiptText
                              size={22}
                              className="m-2 text-teal-600"
                            />
                          ) : (
                            <ProductThumbnail
                              token={token}
                              organizationId={organizationId}
                              productId={line.productId}
                              name={product?.name ?? "Producto"}
                              version={product?.image?.updatedAt}
                            />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p
                            className="sales-cart-product-name text-[15px] font-semibold"
                            title={line.description ?? product?.name}
                          >
                            {line.description ?? product?.name}
                          </p>
                          {/* La presentación distingue productos de nombre parecido. */}
                          {!line.description &&
                            product &&
                            saleProductDetail(product) && (
                              <p
                                className="truncate text-xs text-slate-600"
                                title={saleProductDetail(product)}
                              >
                                {saleProductDetail(product)}
                              </p>
                            )}
                          <p className="flex items-center gap-2 text-xs text-slate-500">
                            {line.productId === lastAddedId && (
                              <span className="rounded-full bg-teal-100/70 px-2 py-0.5 text-[11px] font-semibold text-teal-800">
                                Recién agregado
                              </span>
                            )}
                            <span className="truncate">
                              {line.description
                                ? "Concepto · Sin movimiento de stock"
                                : `${available(line.productId)} disponibles`}
                            </span>
                          </p>
                        </div>
                      </div>
                      <div className="sale-quantity-stepper">
                        <button
                          type="button"
                          aria-label="Restar unidad"
                          onClick={() => {
                            updateLineQuantity(
                              line.productId,
                              line.quantity - 1,
                            );
                            window.requestAnimationFrame(() =>
                              productSearchRef.current?.focus(),
                            );
                          }}
                          className="p-1.5 text-slate-600 hover:text-teal-700"
                        >
                          <Minus size={15} />
                        </button>
                        <SaleQuantityInput
                          onInvalid={error}
                          quantity={line.quantity}
                          maximum={
                            line.description
                              ? conceptMaximumQuantity(unitPrice)
                              : available(line.productId)
                          }
                          name={line.description ?? product?.name ?? "Producto"}
                          onFinished={() =>
                            window.requestAnimationFrame(() =>
                              productSearchRef.current?.focus(),
                            )
                          }
                          onScan={scanIntoSale}
                          onCommit={(quantity) =>
                            updateLineQuantity(line.productId, quantity)
                          }
                        />
                        <button
                          type="button"
                          aria-label="Sumar unidad"
                          onClick={() => {
                            updateLineQuantity(
                              line.productId,
                              line.quantity + 1,
                            );
                            window.requestAnimationFrame(() =>
                              productSearchRef.current?.focus(),
                            );
                          }}
                          className="p-1.5 text-slate-600 hover:text-teal-700"
                        >
                          <Plus size={15} />
                        </button>
                      </div>
                      {line.description ? (
                        <>
                          <p className="text-right text-xs font-medium text-slate-600">
                            {money(unitPrice)}
                          </p>
                          <span className="text-center text-xs text-slate-400">
                            —
                          </span>
                        </>
                      ) : (
                        <SaleProductPricing
                          costs={stock.filter(
                            (lot) =>
                              lot.productId === line.productId &&
                              lot.sellableQuantity > 0,
                          )}
                          price={unitPrice}
                          maximum={Number(product?.prices[0]?.amountMinor ?? 0)}
                          name={product?.name ?? "Producto"}
                          disabled={submitting || !pricingReady}
                          onInvalid={error}
                          onFinished={() =>
                            window.requestAnimationFrame(() =>
                              productSearchRef.current?.focus(),
                            )
                          }
                          onScan={scanIntoSale}
                          onCommit={(next) => {
                            if (
                              !Number.isSafeInteger(next * line.quantity) ||
                              next * line.quantity < line.discountMinor
                            ) {
                              error(
                                "Revisá el descuento general: supera el subtotal con ese precio.",
                              );
                              return false;
                            }
                            try {
                              const nextTotal =
                                total + (next - unitPrice) * line.quantity;
                              const nextPayments = paymentsAfterDiscount(
                                nextTotal,
                                payments,
                              );
                              setLines((current) =>
                                current.map((item) =>
                                  item.productId === line.productId
                                    ? { ...item, requestedUnitPriceMinor: next }
                                    : item,
                                ),
                              );
                              setPayments(nextPayments);
                              return true;
                            } catch (cause) {
                              error(
                                cause instanceof Error
                                  ? cause.message
                                  : "Revisá los pagos antes de cambiar el precio.",
                              );
                              return false;
                            }
                          }}
                        />
                      )}
                      <div className="text-right text-[15px] font-semibold tabular-nums">
                        <p>
                          {money(
                            unitPrice * line.quantity - line.discountMinor,
                          )}
                        </p>
                        {line.discountMinor ? (
                          <p className="text-[10px] font-medium text-teal-700">
                            Dto. {money(line.discountMinor)}
                          </p>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        aria-label="Quitar producto"
                        onClick={() => updateLineQuantity(line.productId, 0)}
                        className="ml-auto rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-700"
                      >
                        <Trash2 size={17} />
                      </button>
                    </article>
                  );
                })
              ) : (
                <div className="flex h-full flex-col items-center justify-center px-6 text-center text-slate-400">
                  <div className="flex h-20 w-20 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                    <ShoppingCart size={36} strokeWidth={1.3} />
                  </div>
                  <p className="mt-4 font-semibold text-slate-600">
                    El carrito está vacío
                  </p>
                  <p className="mt-1 text-sm">
                    Buscá o escaneá un producto para agregarlo.
                  </p>
                </div>
              )}
            </div>
          </div>
        }
      />
      {checkoutOpen && !resumeNeeded ? (
        <SaleCheckoutDialog
          summary={[
            `${lines.length} producto${lines.length === 1 ? "" : "s"}`,
            (() => {
              const units = lines.reduce((sum, line) => sum + line.quantity, 0);
              return `${units} unidad${units === 1 ? "" : "es"}`;
            })(),
            customers.find((customer) => customer.id === customerId)?.name ??
              "Público general",
            salePriceListOptions(salePriceLists, activeSaleListId).find(
              (option) => option.value === activeSaleListId,
            )?.label ?? "Precio general",
          ].join(" · ")}
          subtotalMinor={subtotal}
          discountMinor={discountMinor}
          totalMinor={total}
          paidMinor={paid}
          payments={groupedPayments}
          method={method}
          accountEnabled={Boolean(
            creditAccount?.active && creditAccount.creditEnabled,
          )}
          amount={paymentAmount}
          receivedMinor={paymentAmountMinor}
          sessionNotice={
            method !== "ACCOUNT" && !session
              ? cashChoiceRequired
                ? cashChoiceNotice
                : allowWithoutSession
                  ? "El cobro quedará pendiente de asignación a una caja."
                  : "Esta sucursal requiere una caja abierta para cobrar."
              : undefined
          }
          errorMessage={checkoutError || undefined}
          submitting={submitting}
          confirmDisabled={submitting || !pricingReady}
          onMethod={selectPaymentMethod}
          onAmount={(value) => {
            setPaymentAmount(value);
            setCheckoutError("");
          }}
          onRemovePayment={removePayment}
          onSplit={splitPayment}
          onConfirm={confirmCheckout}
          onClose={closeCheckout}
          documentChoice={
            <SaleDocumentChoice
              value={documentType}
              onChange={setDocumentType}
              disabled={submitting}
              onConfigure={() => setFiscalSettingsOpen(true)}
              environment={fiscalCapabilities?.environment}
              invoiceDisabled={!fiscalCapabilities?.voucherTypes.length}
              unavailableReason={
                fiscalCapabilities?.reason ??
                "No se pudo verificar la configuración fiscal."
              }
              summary={`${fiscalOptions.recipient === "CUSTOMER" ? customers.find((customer) => customer.id === customerId)?.name || "Cliente no seleccionado" : fiscalOptions.consumerName || "Consumidor final"} · Factura C`}
            />
          }
        />
      ) : null}
      {conceptOpen && (
        <SaleConceptDialog
          key={`${organizationId}:${userKey}`}
          organizationId={organizationId}
          userKey={userKey}
          onClose={() => setConceptOpen(false)}
          onAdd={(concept) => {
            const conceptId = crypto.randomUUID();
            setLines((current) => [
              ...current,
              {
                productId: conceptId,
                ...concept,
                quantity: 1,
                discountMinor: 0,
              },
            ]);
            setLastAddedId(conceptId);
            setConceptOpen(false);
            focusProductSearch();
          }}
        />
      )}
      {fiscalSettingsOpen && (
        <SaleFiscalSettings
          value={fiscalOptions}
          capabilities={fiscalCapabilities}
          customerName={
            customers.find((customer) => customer.id === customerId)?.name
          }
          customerFiscalSummary={(() => {
            const customer = customers.find((item) => item.id === customerId);
            return customer
              ? [
                  customer.billingName || customer.name,
                  customer.billingVatCondition || "Consumidor final",
                  customer.billingTaxId || customer.document,
                ]
                  .filter(Boolean)
                  .join(" · ")
              : undefined;
          })()}
          onClose={() => setFiscalSettingsOpen(false)}
          onSave={(options) => {
            setFiscalOptions(options);
            setFiscalSettingsOpen(false);
          }}
        />
      )}
      {receipt ? (
        <SaleConfirmedDialog
          saleId={receipt.sale.id}
          totalMinor={Number(receipt.sale.totalMinor)}
          customerName={receipt.customerName}
          payments={receipt.payments}
          template={
            documentTemplate && {
              ...documentTemplate,
              defaultFormat: documentTemplate.effectiveFormat,
            }
          }
          loadTicket={loadReceiptTicket}
          onPrint={printReceipt}
          onViewSale={() => {
            setReceipt(undefined);
            onSalesScreenChange("history");
          }}
          onNewSale={() => {
            setReceipt(undefined);
            focusProductSearch();
          }}
        />
      ) : null}
    </div>
  );
}

function SalesHistory({
  token,
  organizationId,
  branchId,
  sales,
  products,
  customers,
  operationReason,
  onReasonChange,
  onBack,
  onCancel,
  onReturn,
  onPrint,
}: {
  token: string;
  organizationId: string;
  branchId: string;
  sales: Sale[];
  products: CatalogProduct[];
  customers: Party[];
  operationReason: string;
  onReasonChange: (value: string) => void;
  onBack: () => void;
  onCancel: (sale: Sale) => Promise<string>;
  onReturn: (sale: Sale) => Promise<string>;
  onPrint: (sale: Sale) => void;
}): ReactElement {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [status, setStatus] = useState<"" | Sale["status"]>("");
  const [selectedSaleId, setSelectedSaleId] = useState<string>();
  const [page, setPage] = useState(1);
  const detailDialog = useRef<HTMLDialogElement>(null);
  const actionPending = useRef(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionMessage, setActionMessage] = useState("");
  const runAction = async (action: () => Promise<string>) => {
    if (actionPending.current) return;
    actionPending.current = true;
    setActionBusy(true);
    setActionMessage("");
    try {
      setActionMessage(await action());
    } catch {
      setActionMessage("No se pudo completar la operación.");
    } finally {
      actionPending.current = false;
      setActionBusy(false);
    }
  };
  const filteredSales = sales.filter((sale) => {
    const date = sale.completedAt?.slice(0, 10) ?? "";
    return (
      (!from || date >= from) &&
      (!to || date <= to) &&
      (!status || sale.status === status)
    );
  });
  filteredSales.sort(
    (a, b) =>
      (b.completedAt ?? "").localeCompare(a.completedAt ?? "") ||
      b.id.localeCompare(a.id),
  );
  const selectedSale = sales.find((sale) => sale.id === selectedSaleId);
  const totalPages = Math.max(1, Math.ceil(filteredSales.length / 10));
  const currentPage = Math.min(page, totalPages);
  const pageSales = filteredSales.slice(
    (currentPage - 1) * 10,
    currentPage * 10,
  );
  useEffect(() => {
    const dialog = detailDialog.current;
    if (selectedSaleId) dialog?.showModal();
    return () => dialog?.close();
  }, [selectedSaleId]);
  const customerName = (sale: Sale) =>
    customers.find((customer) => customer.id === sale.customerId)?.name ??
    "Público general";
  const paymentName = (sale: Sale) => {
    const labels = sale.payments.map((payment) =>
      payment.method === "ACCOUNT"
        ? "Cuenta corriente"
        : payment.method === "TRANSFER"
          ? "Transferencia"
          : payment.method === "CARD"
            ? "Tarjeta"
            : payment.method === "CASH"
              ? "Efectivo"
              : "Otro",
    );
    return labels.length ? [...new Set(labels)].join(" + ") : "Sin cobro";
  };
  const exportCsv = () => {
    const rows = filteredSales.map((sale) => [
      sale.id.slice(0, 8).toUpperCase(),
      sale.completedAt
        ? new Date(sale.completedAt).toLocaleString("es-AR")
        : "",
      customerName(sale),
      money(sale.totalMinor),
      paymentName(sale),
      sale.status === "COMPLETED" ? "Confirmada" : "Anulada",
    ]);
    const csv = [
      ["Número", "Fecha", "Cliente", "Total", "Pago", "Estado"],
      ...rows,
    ]
      .map((row) =>
        row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(","),
      )
      .join("\n");
    const url = URL.createObjectURL(
      new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "historial-de-ventas.csv";
    link.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className="mt-8 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold">Historial de ventas</h2>
          <p className="mt-1 text-sm text-slate-500">
            Consultá, filtrá y revisá las operaciones de la sucursal.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={exportCsv}
            className="h-10 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700"
          >
            Exportar CSV
          </button>
          <button
            type="button"
            onClick={onBack}
            className="h-10 rounded-lg bg-[#31826a] px-4 text-sm font-semibold text-white"
          >
            Nueva venta
          </button>
        </div>
      </div>
      <section className="border bg-white p-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="text-xs font-medium text-slate-600">
            Desde
            <input
              type="date"
              value={from}
              onChange={(event) => {
                setFrom(event.target.value);
                setPage(1);
              }}
              className="mt-1 h-10 w-full border bg-white px-3 text-sm"
            />
          </label>
          <label className="text-xs font-medium text-slate-600">
            Hasta
            <input
              type="date"
              value={to}
              onChange={(event) => {
                setTo(event.target.value);
                setPage(1);
              }}
              className="mt-1 h-10 w-full border bg-white px-3 text-sm"
            />
          </label>
          <label className="text-xs font-medium text-slate-600">
            Estado
            <select
              value={status}
              onChange={(event) => {
                setStatus(event.target.value as "" | Sale["status"]);
                setPage(1);
              }}
              className="mt-1 h-10 w-full border bg-white px-3 text-sm"
            >
              <option value="">Todos</option>
              <option value="COMPLETED">Confirmada</option>
              <option value="CANCELLED">Anulada</option>
            </select>
          </label>
        </div>
      </section>
      <section className="overflow-hidden border bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-210 text-left text-sm">
            <thead className="bg-[#edf3f5] text-[10px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">#</th>
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3">Total</th>
                <th className="px-4 py-3">Pago</th>
                <th className="px-4 py-3">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pageSales.map((sale) => (
                <tr
                  key={sale.id}
                  onClick={() => {
                    onReasonChange("");
                    setActionMessage("");
                    setSelectedSaleId(sale.id);
                  }}
                  className={`cursor-pointer hover:bg-[#f6faf9] ${selectedSaleId === sale.id ? "bg-[#eef9f5]" : ""}`}
                >
                  <td className="px-4 py-3 font-mono text-xs">
                    <button
                      type="button"
                      aria-label={`Ver venta ${sale.id.slice(0, 8).toUpperCase()}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        onReasonChange("");
                        setActionMessage("");
                        setSelectedSaleId(sale.id);
                      }}
                    >
                      {sale.id.slice(0, 8).toUpperCase()}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    {sale.completedAt
                      ? new Date(sale.completedAt).toLocaleString("es-AR")
                      : "—"}
                  </td>
                  <td className="px-4 py-3">{customerName(sale)}</td>
                  <td className="px-4 py-3 font-semibold">
                    {money(sale.totalMinor)}
                  </td>
                  <td className="px-4 py-3">{paymentName(sale)}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${sale.status === "COMPLETED" ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}
                    >
                      {sale.status === "COMPLETED" ? "Confirmada" : "Anulada"}
                    </span>
                  </td>
                </tr>
              ))}
              {!filteredSales.length ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-10 text-center text-slate-500"
                  >
                    No hay ventas para los filtros seleccionados.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
      <Pagination
        total={filteredSales.length}
        currentPage={currentPage}
        totalPages={totalPages}
        noun="ventas"
        label="Páginas del historial de ventas"
        onChange={setPage}
      />
      <dialog
        ref={detailDialog}
        aria-labelledby="sale-detail-title"
        onCancel={(event) => {
          event.preventDefault();
          if (!actionPending.current) setSelectedSaleId(undefined);
        }}
        className="m-auto w-[calc(100%-2rem)] max-w-5xl rounded-2xl border border-slate-200 bg-white p-0 shadow-xl backdrop:bg-slate-950/35 backdrop:backdrop-blur-sm"
      >
        <header className="flex items-center justify-between gap-3 border-b border-slate-100 bg-teal-50/60 p-5">
          <div>
            <h3 id="sale-detail-title" className="text-lg font-semibold">
              Detalle de venta · {selectedSale?.id.slice(0, 8).toUpperCase()}
            </h3>
            {selectedSale && (
              <p className="mt-1 text-sm text-slate-500">
                {customerName(selectedSale)} ·{" "}
                {selectedSale.completedAt
                  ? new Date(selectedSale.completedAt).toLocaleString("es-AR")
                  : ""}
              </p>
            )}
          </div>
          <button
            type="button"
            aria-label="Cerrar detalle"
            disabled={actionBusy}
            onClick={() => setSelectedSaleId(undefined)}
            className="rounded-lg p-2"
          >
            ✕
          </button>
        </header>
        <div className="max-h-[70dvh] overflow-y-auto p-5">
          {selectedSale ? (
            <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_290px]">
              <div>
                <div className="divide-y divide-slate-100 rounded-lg border">
                  <div className="grid grid-cols-[1fr_70px_110px] gap-3 bg-slate-50 px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    <span>Producto</span>
                    <span>Cant.</span>
                    <span className="text-right">Total</span>
                  </div>
                  {selectedSale.items.map((item) => {
                    const product = products.find(
                      (candidate) => candidate.id === item.productId,
                    );
                    const lineTotal =
                      Number(item.unitPriceMinor ?? 0) * item.quantity -
                      Number(item.discountMinor ?? 0);
                    return (
                      <div
                        key={item.id}
                        className="grid grid-cols-[1fr_70px_110px] gap-3 px-4 py-3 text-sm"
                      >
                        <span>
                          {item.description ??
                            product?.name ??
                            "Producto histórico"}
                        </span>
                        <span>{item.quantity}</span>
                        <span className="text-right font-medium">
                          {money(lineTotal)}
                        </span>
                      </div>
                    );
                  })}
                </div>
                <SalePaymentSummary payments={selectedSale.payments} />
              </div>
              <aside className="space-y-4">
                {actionMessage && (
                  <p role="status" className="mb-3 text-sm text-teal-800">
                    {actionMessage}
                  </p>
                )}
                <SaleDetailTotal
                  total={money(selectedSale.totalMinor)}
                  status={selectedSale.status}
                  documentType={selectedSale.documentType}
                />
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onPrint(selectedSale)}
                    className="flex min-h-10 flex-1 items-center justify-center gap-2 rounded-lg border border-teal-200 bg-white px-3 py-2 text-sm font-medium text-teal-700 hover:bg-teal-50"
                  >
                    <ReceiptText size={17} aria-hidden="true" />
                    {selectedSale.documentType === "INVOICE"
                      ? "Ver / imprimir factura"
                      : "Imprimir ticket"}
                  </button>
                  {selectedSale.documentType === "INVOICE" && (
                    <SaleCreditActions
                      key={`${organizationId}:${branchId}:${selectedSale.id}`}
                      token={token}
                      organizationId={organizationId}
                      branchId={branchId}
                      saleId={selectedSale.id}
                    />
                  )}
                </div>
                {selectedSale.status === "COMPLETED" ? (
                  <details className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                    <summary className="cursor-pointer text-sm font-medium text-slate-600 focus-visible:outline-2 focus-visible:outline-teal-700">
                      Anulación o devolución
                    </summary>
                    <Input
                      label="Motivo para anulación o devolución"
                      value={operationReason}
                      onChange={onReasonChange}
                      required={false}
                    />
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        disabled={actionBusy}
                        onClick={() =>
                          void runAction(() => onCancel(selectedSale))
                        }
                        className="border border-rose-200 bg-white py-2 text-xs font-semibold text-rose-700"
                      >
                        Anular
                      </button>
                      <button
                        type="button"
                        disabled={actionBusy}
                        onClick={() =>
                          void runAction(() => onReturn(selectedSale))
                        }
                        className="border border-teal-200 bg-white py-2 text-xs font-semibold text-teal-700"
                      >
                        Devolver
                      </button>
                    </div>
                  </details>
                ) : (
                  <p className="mt-4 text-xs text-slate-500">
                    Venta anulada: se conserva para trazabilidad.
                  </p>
                )}
              </aside>
            </div>
          ) : (
            <p className="mt-3 text-sm text-slate-500">
              Seleccioná una venta de la tabla para ver sus productos, pagos y
              acciones disponibles.
            </p>
          )}
        </div>
      </dialog>
    </div>
  );
}

function Transfers({
  token,
  organizationId,
  branchId,
  branches,
  products,
  sharedProducts,
  stock,
  done,
  onError,
}: {
  token: string;
  organizationId: string;
  branchId: string;
  branches: BranchListItem[];
  products: CatalogProduct[];
  sharedProducts: CatalogProduct[];
  stock: StockLot[];
  done: () => void;
  onError: (value: string) => void;
}): ReactElement {
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [advancingId, setAdvancingId] = useState<string | null>(null);
  const [destinationBranchId, setDestinationBranchId] = useState("");
  const [barcode, setBarcode] = useState("");
  const [productId, setProductId] = useState("");
  const [lotId, setLotId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const availableLots = stock.filter((lot) => lot.quantity > 0);
  const availableProductIds = new Set(
    availableLots.map((lot) => lot.productId),
  );
  const availableProducts = products.filter((product) =>
    availableProductIds.has(product.id),
  );
  const barcodeMatches = findTransferProductsByBarcode(
    availableProducts,
    availableLots,
    barcode,
  );
  const selectedLot = availableLots.find(
    (lot) => lot.id === lotId && lot.productId === productId,
  );
  const load = async () => {
    try {
      setTransfers(await getTransfers(token, organizationId, branchId));
    } catch (cause) {
      onError(
        cause instanceof Error
          ? cause.message
          : "No se pudieron cargar las transferencias.",
      );
    }
  };
  useEffect(() => {
    void load();
  }, [branchId]); // eslint-disable-line react-hooks/exhaustive-deps
  const create = async (event: FormEvent) => {
    event.preventDefault();
    const destination = branches.find(
      (branch) => branch.id === destinationBranchId && branch.active,
    );
    if (
      !destination ||
      destination.id === branchId ||
      !selectedLot ||
      !Number.isInteger(Number(quantity)) ||
      Number(quantity) < 1 ||
      Number(quantity) > selectedLot.quantity
    )
      return onError(
        "Elegí una sucursal destino, un lote y una cantidad disponible para transferir.",
      );
    try {
      await createTransfer(token, organizationId, branchId, {
        destinationBranchId,
        items: [{ lotId, quantity: Number(quantity) }],
      });
      setBarcode("");
      setProductId("");
      setLotId("");
      setQuantity("1");
      await load();
    } catch (cause) {
      onError(
        cause instanceof Error
          ? cause.message
          : "No se pudo preparar la transferencia.",
      );
    }
  };
  const advance = async (transfer: Transfer) => {
    if (advancingId !== null) return;
    setAdvancingId(transfer.id);
    try {
      if (
        transfer.status === "PREPARED" &&
        transfer.sourceBranchId === branchId
      )
        await dispatchTransfer(token, organizationId, branchId, transfer.id);
      if (
        transfer.status === "IN_TRANSIT" &&
        transfer.destinationBranchId === branchId
      )
        await receiveTransfer(token, organizationId, branchId, transfer.id);
      await Promise.all([load(), Promise.resolve(done())]);
    } catch (cause) {
      onError(
        cause instanceof Error
          ? cause.message
          : "No se pudo actualizar la transferencia.",
      );
    } finally {
      setAdvancingId(null);
    }
  };
  return (
    <div className="workspace-split mt-1 grid flex-1 items-stretch gap-5">
      <TransferList
        transfers={transfers}
        branchId={branchId}
        branches={branches}
        products={sharedProducts}
        busyId={advancingId}
        onAdvance={(transfer) => void advance(transfer)}
      />
      <form
        onSubmit={(event) => void create(event)}
        className="flex flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
      >
        <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
          <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-teal-50 text-teal-700">
            <ArrowLeftRight size={19} aria-hidden />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-slate-800">
              Nueva transferencia
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Elegí el destino y el lote que vas a enviar.
            </p>
          </div>
        </div>
        <div className="mt-4">
          <label className="text-xs font-semibold text-slate-600">
            Sucursal destino
          </label>
          <SearchableSaleSelect
            label="Sucursal destino"
            value={destinationBranchId}
            onChange={setDestinationBranchId}
            placeholder="Buscar sucursal…"
            floatingOptions
            options={branches
              .filter((branch) => branch.active && branch.id !== branchId)
              .map((branch) => ({ value: branch.id, label: branch.name }))}
          />
          {branches.find((branch) => branch.id === destinationBranchId)
            ?.canAccess === false ? (
            <p className="mt-1.5 text-xs leading-5 text-slate-500">
              Podés enviar a esta sucursal. Para recibir, un administrador debe
              asignarte acceso desde Usuarios.
            </p>
          ) : null}
        </div>
        <label className="mt-4 block">
          <span className="text-xs font-semibold text-slate-600">
            Código de barras
          </span>
          <span className="mt-1 flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 shadow-sm focus-within:border-teal-500">
            <ScanBarcode
              size={18}
              aria-hidden
              className="shrink-0 text-teal-700"
            />
            <input
              type="text"
              value={barcode}
              onChange={(event) => {
                const code = event.target.value;
                const matches = findTransferProductsByBarcode(
                  availableProducts,
                  availableLots,
                  code,
                );
                const matchedProductId =
                  matches.length === 1 ? matches[0].id : "";
                setBarcode(code);
                setProductId(matchedProductId);
                setLotId(
                  singleAvailableTransferLotId(availableLots, matchedProductId),
                );
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.preventDefault();
              }}
              placeholder="Escaneá el código"
              autoComplete="off"
              className="h-full min-w-0 flex-1 bg-transparent text-sm font-normal text-slate-700 outline-none placeholder:text-slate-400"
            />
          </span>
        </label>
        {barcode.trim() &&
        barcodeMatches.length === 0 &&
        barcode.trim().length >= 8 ? (
          <p className="mt-1.5 text-xs text-amber-700">
            No hay un producto con stock para ese código.
          </p>
        ) : null}
        {barcodeMatches.length > 1 ? (
          <p className="mt-1.5 text-xs text-slate-500">
            El código coincide con varios productos. Elegí el correcto.
          </p>
        ) : null}
        <div className="mt-4">
          <label className="text-xs font-semibold text-slate-600">
            Nombre del producto
          </label>
          <SearchableSaleSelect
            label="Nombre del producto"
            value={productId}
            onChange={(value) => {
              setProductId(value);
              if (!barcodeMatches.some((product) => product.id === value))
                setBarcode("");
              setLotId(singleAvailableTransferLotId(availableLots, value));
            }}
            placeholder="Buscar producto…"
            floatingOptions
            options={(barcodeMatches.length > 1
              ? barcodeMatches
              : availableProducts
            ).map((product) => ({ value: product.id, label: product.name }))}
          />
        </div>
        <div className="mt-4">
          <label className="text-xs font-semibold text-slate-600">
            Lote de origen
          </label>
          <SearchableSaleSelect
            label="Lote de origen"
            value={lotId}
            onChange={setLotId}
            placeholder={
              productId ? "Elegir lote…" : "Primero elegí un producto"
            }
            floatingOptions
            disabled={!productId}
            options={availableLots
              .filter((lot) => lot.productId === productId)
              .map((lot) => ({
                value: lot.id,
                label: `Lote ${lot.number} · ${lot.quantity} un.`,
              }))}
          />
          {selectedLot && (
            <p className="mt-1.5 text-xs text-slate-500">
              Disponible: {selectedLot.quantity} unidades
            </p>
          )}
        </div>
        <label className="mt-4 block text-xs font-semibold text-slate-600">
          Cantidad
          <input
            type="number"
            min={1}
            max={selectedLot?.quantity}
            step={1}
            required
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
            className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal text-slate-800 outline-none focus:border-teal-500"
          />
        </label>
        <div className="mt-auto pt-5">
          <button className="h-10 w-full rounded-lg bg-teal-700 px-4 text-sm font-semibold text-white shadow-sm hover:bg-teal-800">
            Preparar transferencia
          </button>
        </div>
      </form>
    </div>
  );
}

function Administration({
  token,
  organizationId,
  initialTab,
  onError,
}: {
  token: string;
  organizationId: string;
  initialTab: "users" | "roles";
  onError: (value: string) => void;
}): ReactElement {
  const [tab, setTab] = useState<"users" | "roles">(initialTab);
  const [users, setUsers] = useState<UserListItem[]>([]);
  const [roles, setRoles] = useState<RoleListItem[]>([]);
  const [options, setOptions] = useState<UserCreateOptions>();
  const load = async (): Promise<void> => {
    try {
      const [listedUsers, listedRoles, userOptions] = await Promise.all([
        getUsers(token, organizationId),
        getRoles(token, organizationId),
        getUserCreateOptions(token, organizationId),
      ]);
      setUsers(listedUsers);
      setRoles(listedRoles);
      setOptions(userOptions);
    } catch (cause) {
      onError(
        cause instanceof Error
          ? cause.message
          : "No se pudo cargar la administración.",
      );
    }
  };
  useEffect(() => {
    void load();
  }, [organizationId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => setTab(initialTab), [initialTab]);
  return (
    <div className="mt-8">
      <div className="flex gap-2 border-b border-slate-200">
        {[
          ["users", "Usuarios"],
          ["roles", "Roles y permisos"],
        ].map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key as typeof tab)}
            className={`px-4 py-3 text-sm ${tab === key ? "border-b-2 border-teal-700 font-medium text-teal-800" : "text-slate-600"}`}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "users" ? (
        <UsersPanel
          token={token}
          organizationId={organizationId}
          users={users}
          options={options}
          onDone={() => void load()}
          onError={onError}
        />
      ) : null}
      {tab === "roles" ? (
        <RolesPanel
          token={token}
          organizationId={organizationId}
          roles={roles}
          onDone={() => void load()}
          onError={onError}
        />
      ) : null}
    </div>
  );
}

function UsersPanel({
  token,
  organizationId,
  users,
  options,
  onDone,
  onError,
}: {
  token: string;
  organizationId: string;
  users: UserListItem[];
  options?: UserCreateOptions;
  onDone: () => void;
  onError: (value: string) => void;
}): ReactElement {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [roleId, setRoleId] = useState("");
  const [branchId, setBranchId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [editingUser, setEditingUser] = useState<UserListItem | null>(null);
  const [passwordUser, setPasswordUser] = useState<UserListItem | null>(null);
  const [notice, setNotice] = useState("");
  const deactivate = async (item: UserListItem): Promise<void> => {
    try {
      await updateUser(token, organizationId, item.user.id, {
        active: false,
        roleIds: item.roles.map(({ role }) => role.id),
        branchIds: item.branches.map(({ branch }) => branch.id),
      });
      onDone();
    } catch (cause) {
      onError(
        cause instanceof Error
          ? cause.message
          : "No se pudo actualizar el usuario.",
      );
    }
  };
  const save = async (event: FormEvent) => {
    event.preventDefault();
    try {
      if (!roleId || !branchId)
        return onError("Seleccioná un rol y una sucursal.");
      await createUser(token, organizationId, {
        email,
        password,
        displayName,
        roleIds: [roleId],
        branchIds: [branchId],
      });
      setEmail("");
      setPassword("");
      setDisplayName("");
      onDone();
    } catch (cause) {
      onError(
        cause instanceof Error ? cause.message : "No se pudo crear el usuario.",
      );
    }
  };
  return (
    <div className="workspace-split mt-6 grid gap-6">
      {editingUser && (
        <UserTicketNameDialog
          key={`${organizationId}:${editingUser.user.id}`}
          token={token}
          organizationId={organizationId}
          user={editingUser}
          onDone={onDone}
          onClose={() => setEditingUser(null)}
        />
      )}
      {passwordUser && (
        <UserPasswordDialog
          key={`${organizationId}:${passwordUser.user.id}`}
          token={token}
          organizationId={organizationId}
          user={passwordUser}
          onDone={(value) => {
            setNotice(value);
            onDone();
          }}
          onClose={() => setPasswordUser(null)}
        />
      )}
      {notice ? (
        <StatusToast
          key={notice}
          message={notice}
          onClose={() => setNotice("")}
        />
      ) : null}
      <div className="border bg-white">
        {users.map((item) => (
          <div
            key={item.user.id}
            className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4 break-words"
          >
            <div>
              <p>{item.displayName || item.user.email}</p>
              {item.displayName && (
                <p className="text-xs text-slate-500">{item.user.email}</p>
              )}
            </div>
            <span>{item.roles.map(({ role }) => role.code).join(", ")}</span>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setEditingUser(item)}
                aria-label={`Editar usuario ${item.user.email}`}
                className="rounded-lg border px-3 py-2 text-sm text-teal-700"
              >
                Editar
              </button>
              <button
                type="button"
                onClick={() => setPasswordUser(item)}
                aria-label={`Restablecer contraseña de ${item.user.email}`}
                className="rounded-lg border px-3 py-2 text-sm text-teal-700"
              >
                Contraseña
              </button>
              {item.active ? (
                <button
                  type="button"
                  onClick={() => void deactivate(item)}
                  className="text-sm text-teal-700"
                >
                  Desactivar
                </button>
              ) : (
                <span className="text-sm text-slate-400">Inactivo</span>
              )}
            </div>
          </div>
        ))}
      </div>
      <form
        onSubmit={(event) => void save(event)}
        className="inventory-side-form border bg-white p-5"
      >
        <h2 className="font-semibold">Nuevo usuario</h2>
        <UserTicketNameField value={displayName} onChange={setDisplayName} />
        <Input label="Email" type="email" value={email} onChange={setEmail} />
        <Input
          label="Contraseña"
          type="password"
          value={password}
          onChange={setPassword}
        />
        <Select
          label="Sucursal"
          value={branchId}
          onChange={setBranchId}
          options={options?.branches ?? []}
        />
        <Select
          label="Rol"
          value={roleId}
          onChange={setRoleId}
          options={options?.roles ?? []}
        />
        <button className="mt-5 w-full bg-teal-700 py-2 text-sm text-white">
          Crear usuario
        </button>
      </form>
    </div>
  );
}

function RolesPanel({
  token,
  organizationId,
  roles,
  onDone,
  onError,
}: {
  token: string;
  organizationId: string;
  roles: RoleListItem[];
  onDone: () => void;
  onError: (value: string) => void;
}): ReactElement {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [permissionCodes, setPermissionCodes] = useState<string[]>([]);
  const save = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await createRole(token, organizationId, {
        name,
        code: code.toUpperCase(),
        permissionCodes,
      });
      setName("");
      setCode("");
      setPermissionCodes([]);
      onDone();
    } catch (cause) {
      onError(
        cause instanceof Error ? cause.message : "No se pudo crear el rol.",
      );
    }
  };
  return (
    <div className="workspace-split mt-6 grid gap-6">
      <div className="border bg-white">
        {roles.map((role) => (
          <div key={role.id} className="border-b px-5 py-4">
            <div className="flex items-center justify-between gap-3">
              <p className="font-medium">{role.name}</p>
              <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-500">
                {role.code}
              </span>
            </div>
            {role.permissions.length ? (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {role.permissions.map(({ permission }) => (
                  <span
                    key={permission.code}
                    className="rounded-full bg-teal-50 px-2.5 py-1 text-xs text-teal-800"
                  >
                    {permissionLabel(permission.code)}
                  </span>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-sm text-slate-500">
                Sin permisos asignados.
              </p>
            )}
          </div>
        ))}
      </div>
      <form
        onSubmit={(event) => void save(event)}
        className="inventory-side-form border bg-white p-5"
      >
        <h2 className="font-semibold">Nuevo rol</h2>
        <Input label="Nombre" value={name} onChange={setName} />
        <Input label="Código" value={code} onChange={setCode} />
        <fieldset className="mt-5">
          <legend className="text-sm font-semibold">
            Qué puede hacer este rol
          </legend>
          <p className="mt-1 text-xs text-slate-500">
            Elegí las tareas que esta persona podrá realizar en el sistema.
          </p>
          <div className="mt-4 space-y-5">
            {permissionGroups.map((group) => (
              <div key={group.title}>
                <p className="mb-2 text-xs font-semibold text-slate-700">
                  {group.title}
                </p>
                <div className="space-y-1.5">
                  {group.permissions.map(([permission, label]) => (
                    <label
                      key={permission}
                      className={`flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-xs ${permissionCodes.includes(permission) ? "border-teal-200 bg-teal-50 text-teal-950" : "border-slate-200 bg-white text-slate-700 hover:border-teal-200"}`}
                    >
                      <input
                        className="mt-0.5"
                        type="checkbox"
                        checked={permissionCodes.includes(permission)}
                        onChange={(event) =>
                          setPermissionCodes((current) =>
                            event.target.checked
                              ? [...current, permission]
                              : current.filter((code) => code !== permission),
                          )
                        }
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </fieldset>
        <button className="mt-5 w-full bg-teal-700 py-2 text-sm text-white">
          Crear rol
        </button>
      </form>
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { id: string; name: string; code?: string }[];
}): ReactElement {
  return (
    <label className="mt-4 block text-sm">
      {label}
      <select
        required
        className="mt-1 h-10 w-full border px-3"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">Seleccionar…</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.name}
            {option.code ? ` (${option.code})` : ""}
          </option>
        ))}
      </select>
    </label>
  );
}

function Input({
  disabled = false,
  label,
  value,
  onChange,
  type = "text",
  required = true,
  allowNegative = false,
  placeholder,
  className,
  labelClassName,
  inputRef,
}: {
  label: string;
  disabled?: boolean;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
  allowNegative?: boolean;
  placeholder?: string;
  className?: string;
  labelClassName?: string;
  inputRef?: React.RefObject<HTMLInputElement | null>;
}): ReactElement {
  return (
    <label
      className={
        labelClassName
          ? `block text-sm ${labelClassName}`
          : "mt-4 block text-sm"
      }
    >
      {label}
      <input
        ref={inputRef}
        disabled={disabled}
        required={required}
        type={type}
        min={type === "number" && !allowNegative ? 0 : undefined}
        step={type === "number" ? "any" : undefined}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={`mt-1 h-10 w-full border px-3 ${className ?? ""}`}
      />
    </label>
  );
}
import { NotificationBell } from "./notification-bell";
import {
  customerIdentityDetail,
  matchingCustomerNames,
} from "./lib/customer-identity";
