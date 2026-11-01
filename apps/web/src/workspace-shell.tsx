import { resolveExternalCategory } from "./lib/api";
import { PurchasesWorkspace } from "./purchases-workspace";
import { ExternalProductLookup } from "./external-product-lookup";
import {
  externalProductFields,
  externalSaleUnit,
  externalGtin,
} from "./lib/external-product";
import { ProductFilterSelect } from "./product-filter-select";
import { categoryBranch } from "./lib/category-tree";
import { SuppliersWorkspace } from "./suppliers-workspace";
import { CustomersWorkspace } from "./customers-workspace";
import { InventoryPendingPurchase } from "./inventory-pending-purchase";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { DirectTicketPrint } from "./direct-ticket-print";
import { SearchableSaleSelect } from "./searchable-sale-select";
import { NavigationRail } from "./navigation-rail";
import { SidebarToggle } from "./sidebar-toggle";
import { useWorkspaceSidebar } from "./use-workspace-sidebar";
import { ProductInternalBarcode } from "./product-internal-barcode";
import { canDismissProductBackdrop } from "./lib/product-backdrop";
import { SaleQuantityInput } from "./sale-quantity-input";
import { RegisterManager, ClosureVisibility } from "./record-maintenance";
import { getCashManagement, type CashManagement } from "./lib/api";
import { cashSettingsRequest, type CashSettings } from "./lib/api";
import { CashPendingCollections } from "./cash-pending-collections";
import { CashClosureDetail } from "./cash-closure-detail";
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
import { CashCloseForm } from "./cash-close-form";
import { createPortal } from "react-dom";
import { CashOverview, CashMovements } from "./cash-overview";
import { CashLatestClosure } from "./cash-latest-closure";
import { cashResponsibleLabel } from "./lib/cash-responsible";
import { AccountBranchSelector } from "./account-branch-selector";
import { OrganizationWorkspace } from "./organization-workspace";
import { OrganizationLogo } from "./organization-logo";
import { SaleDocumentChoice } from "./sale-document-choice";
import { SaleConceptDialog } from "./sale-concept-dialog";
import { DiscountAmountInput } from "./discount-amount-input";
import { SaleProductPricing } from "./sale-product-pricing";
import {
  discountDraft,
  parseDiscountDraft,
  paymentsAfterDiscount,
} from "./lib/discount-editor";
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
import { DashboardRecentSales } from "./dashboard-recent-sales";
import { ProductSyncStatus } from "./product-sync-status";
import { CatalogReferenceRefresh } from "./catalog-reference-refresh";
import { DistributionWorkspace } from "./distribution-workspace";
import {
  ProductFormImage,
  ProductImageEditor,
  ProductThumbnail,
} from "./product-image";
import { updateCatalogProductImage } from "./lib/api";
import { BranchProductDialog } from "./branch-product-dialog";
import { ProductCatalogMetrics } from "./product-catalog-header";
import { ProductCatalogToolbar } from "./product-catalog-toolbar";
import { matchesCatalogExtras } from "./lib/product-catalog-filters";
import {
  emptyCatalogAdditionalFilters,
  matchesCatalogAdditionalFilters,
} from "./lib/catalog-additional-filters";
import { InventorySearchSelect } from "./inventory-search-select";
import { InventoryStockTable } from "./inventory-stock-table";
import { inventoryStockPage } from "./lib/inventory-stock-page";
import {
  inventoryProductOption,
  inventoryLotOption,
} from "./lib/inventory-search";
import { ProductFormSection } from "./product-form-section";
import { StatusToast } from "./status-toast";
import { UserPasswordDialog } from "./user-password-dialog";
import { OperationHistory } from "./operation-history";
import { ProductActionsMenu } from "./product-actions-menu";
import { shouldRouteSalesSearchKey } from "./lib/sales-search-key";
import { shouldFocusSalesBackground } from "./lib/sales-background-focus";
import { CatalogOptionsManager } from "./catalog-options-manager";
import { CatalogOptionSelect } from "./catalog-option-select";
import { createOrSelectCatalogOption } from "./lib/catalog-option";
import { StockAdjustmentQuantity } from "./stock-adjustment-quantity";
import { stockAdjustmentDelta } from "./lib/stock-adjustment";
import { ProductSaveErrorDialog } from "./product-save-error-dialog";
import { ProductReferenceSource } from "./product-reference-source";
import { AlfaBetaMedicineCard } from "./alfabeta-medicine-card";
import { distributeSaleDiscount } from "./lib/sale-discount";
import { prepareAccountPayment } from "./lib/account-payment";
import { withStockAvailability } from "./lib/stock-availability";
import type { FormEvent, ReactElement } from "react";
import {
  ArrowLeftRight,
  X,
  ReceiptText,
  Boxes,
  Banknote,
  LayoutDashboard,
  Shapes,
  ClipboardList,
  ChartNoAxesCombined,
  ContactRound,
  NotebookTabs,
  CreditCard,
  HeartPulse,
  Eye,
  History,
  Minus,
  Package,
  ChevronDown,
  Pencil,
  Plus,
  ScanBarcode,
  Search,
  Save,
  ShoppingCart,
  ShieldCheck,
  Tags,
  Trash2,
  UserRound,
  Users,
  Settings,
  Truck,
} from "lucide-react";

import {
  createCashMovement,
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
  getCashClosures,
  getCustomerAccounts,
  type CustomerAccount,
  getCatalogProducts,
  getCatalogOptions,
  ensureDefaultCatalogCategories,
  searchMedicineReferences,
  searchAlfaBeta,
  type AlfaBetaMatch,
  getParties,
  getPriceLists,
  getReportSummary,
  getReportDetail,
  getRoles,
  getSales,
  getStock,
  getTransfers,
  getUserCreateOptions,
  getUsers,
  openCashSession,
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
  type CashClosure,
  type Party,
  type PriceList,
  type ReportSummary,
  type ReportDetail,
  type RoleListItem,
  type Sale,
  type StockLot,
  type Transfer,
  type UserCreateOptions,
  type UserListItem,
  updateUser,
} from "./lib/api";

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
    setBranchId((current) =>
      items.some((item) => item.id === current && item.active)
        ? current
        : (items.find((item) => item.active)?.id ?? ""),
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
  useEffect(() => {
    if (view === "Cuentas corrientes" && organizationId && branchId)
      setVisitedAccountsScope(accountsScope);
  }, [view, organizationId, branchId, accountsScope]);
  const [pendingSale, setPendingSale] = useState(false);
  const [listEditingProduct, setListEditingProduct] =
    useState<CatalogProduct>();
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
  const [session, setSession] = useState<CashSession>();
  const [allowWithoutSession, setAllowWithoutSession] = useState(true);
  const [registers, setRegisters] = useState<CashRegister[]>([]);
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
    setSession(cash.sessions.find((item) => !item.closedAt));
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
      branches={branches.filter((item) => item.active)}
      value={branchId}
      onChange={(id) => {
        if (
          !pendingSale ||
          window.confirm(
            "Hay una venta pendiente en esta sucursal. Si cambiás de sucursal se descartará. ¿Continuar?",
          )
        )
          setBranchId(id);
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
        className={`workspace-header ${view === "Productos" ? "workspace-products-header" : ""} ${view === "Listas de precios" || view === "Clientes" || view === "Proveedores" || view === "Compras" || view === "Inventario" || view === "Productos" || view === "Inicio" || view === "Ventas" || view === "Caja" || view === "Cuentas corrientes" || view === "Categorías y laboratorios" ? "workspace-sales-header" : ""} flex h-[82px] items-center justify-between border-b border-slate-200 bg-white px-6`}
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
            view === "Categorías y laboratorios") && (
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
          {ready && view === "Productos" && (
            <CatalogReferenceRefresh
              compact
              key={organizationId}
              token={accessToken!}
              organizationId={organizationId!}
              products={products}
              done={() => void refresh()}
              error={setMessage}
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
              if (
                !pendingSale ||
                window.confirm(
                  "Hay una venta pendiente. Si cerrás sesión se descartará. ¿Querés salir?",
                )
              )
                onLogout();
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
        <section className="workspace-content min-w-0 bg-[#f4f8fa] p-4 lg:px-7 lg:py-3">
          {view !== "Ventas" &&
            view !== "Listas de precios" &&
            view !== "Caja" &&
            view !== "Cuentas corrientes" &&
            view !== "Categorías y laboratorios" &&
            view !== "Inicio" &&
            view !== "Productos" &&
            view !== "Inventario" &&
            view !== "Proveedores" &&
            view !== "Clientes" &&
            view !== "Compras" && (
              <div className="workspace-page-heading flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h1 className="text-[28px] font-semibold tracking-tight text-slate-900">
                    {view}
                  </h1>
                </div>
                <div className="workspace-page-actions flex min-w-0 flex-wrap items-center gap-2">
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
                session={session}
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
              session={session}
              salesScreen={salesScreen}
              onSalesScreenChange={setSalesScreen}
              done={() => void refresh()}
              error={setMessage}
            />
          ) : null}
          {ready && (view === "Caja" || visitedCashScope === accountsScope) ? (
            <Cash
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
              session={session}
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
            />
          ) : null}
          {ready && view === "Transferencias" ? (
            <Transfers
              token={accessToken!}
              organizationId={organizationId!}
              branchId={branchId}
              branches={branches}
              products={operationalProducts}
              stock={stock}
              done={() => void refresh()}
              onError={setMessage}
            />
          ) : null}
          {ready && view === "Reportes" ? (
            <Reports
              token={accessToken!}
              organizationId={organizationId!}
              branchId={branchId}
              onError={setMessage}
            />
          ) : null}
        </section>
      </div>
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
          <article key={metric.label} className="border bg-white p-5">
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
  const [stockFilter, setStockFilter] = useState<"" | "available" | "out">("");
  const [expiryFilter, setExpiryFilter] = useState("");
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
  const [openActionMenu, setOpenActionMenu] = useState<string>();
  const [actionAnchor, setActionAnchor] = useState<HTMLButtonElement>();
  const [referenceQuery, setReferenceQuery] = useState("");
  const [referenceSearchDone, setReferenceSearchDone] = useState(false);
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
    productSaveLock.current = true;
    setProductSaving(true);
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
        await createCatalogProduct(token, organizationId, {
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
      }
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
  const clearForm = () => {
    if (optionCreateLock.current) return;
    setFractionEnabled(false);
    setFractionDivisor("2");
    setFractionMarkup("0");
    setFractionBase("");
    onEditorClose?.();
    setProductImage(undefined);
    externalImage.current = null;
    setImageBusy(false);
    setProductSaveError("");
    referenceRequest.current?.abort();
    setFormOpen(false);
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
    setReferenceQuery("");
    setSelectedReference(undefined);
    setReferenceSearchDone(false);
    setReferenceResults([]);
    setReferenceSource("official");
    setAlfaReferenceResults([]);
    setReferenceLoading(false);
    setReferenceError("");
  };
  const searchReferences = async (source: MedicineReference["source"]) => {
    referenceRequest.current?.abort();
    const controller = new AbortController();
    referenceRequest.current = controller;
    setAlfaReferenceResults([]);
    const queryText = referenceQuery.trim();
    setReferenceSearchDone(true);
    setReferenceSource(source);
    setReferenceResults([]);
    setReferenceError("");
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
      const found = await searchMedicineReferences(
        token,
        organizationId,
        queryText,
        source,
        controller.signal,
      );
      if (!controller.signal.aborted) setReferenceResults(found);
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
  const applyReference = (reference: MedicineReference) => {
    if (medicationMode === "other") return;
    setIsMedication(true);
    if (!editingProduct && !saleUnitEdited.current) setSaleUnit("BOX");
    setSelectedReference(reference);
    if (!editingProduct) setName(reference.name);
    if (reference.priceMinor !== null)
      setPrice(String(reference.priceMinor / 100));
    if (reference.barcode && !fractionEnabled && saleUnit === "BOX")
      setBarcode(reference.barcode);
    if (reference.activeIngredient)
      setActiveIngredient(reference.activeIngredient);
    setPresentation(reference.presentation);
    if (reference.pharmaceuticalForm !== undefined)
      setPharmaceuticalForm(reference.pharmaceuticalForm);
    if (reference.concentration !== undefined)
      setConcentration(reference.concentration);
    if (reference.prescriptionRequired !== undefined)
      setPrescriptionRequired(reference.prescriptionRequired);
    const medicationCategory = options?.categories.find(
      (category) =>
        category.name.trim().toLocaleLowerCase("es-AR") === "medicamentos",
    );
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
  };
  const edit = (product: CatalogProduct) => {
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
    setFormOpen(true);
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
  const toggleProductActive = (product: CatalogProduct) => {
    setOpenActionMenu(undefined);
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
  const stockForProduct = (productId: string) =>
    stock
      .filter((lot) => lot.productId === productId)
      .reduce((total, lot) => total + lot.quantity, 0);
  const nextExpiryForProduct = (productId: string) =>
    stock
      .filter((lot) => lot.productId === productId && lot.expiresAt)
      .sort(
        (left, right) =>
          new Date(left.expiresAt!).getTime() -
          new Date(right.expiresAt!).getTime(),
      )[0]?.expiresAt;
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
          : stockForProduct(product.id) === 0))
    );
  });
  const productFilterKey = JSON.stringify([
    organizationId,
    query,
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
      <div className={initialProduct ? "" : "product-catalog-body space-y-4"}>
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
        {!initialProduct && (
          <>
            <div className="catalog-summary-row">
              <ProductCatalogMetrics products={products} stock={stock} />
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
                  filters.stock === "available"
                    ? "available"
                    : filters.stock === "out"
                      ? "out"
                      : "",
                );
                setExpiryFilter(filters.expiry);
              }}
            />
            <section className="overflow-hidden border bg-white">
              <div className="overflow-x-auto">
                <table className="w-full min-w-235 text-left text-sm">
                  <thead className="bg-[#edf3f5] text-[10px] uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="w-20 px-4 py-3">Foto</th>
                      <th className="px-4 py-3">Producto</th>
                      <th className="px-4 py-3">Código de barras</th>
                      <th className="px-4 py-3">Laboratorio</th>
                      <th className="px-4 py-3">Público</th>
                      <th className="px-4 py-3">Stock</th>
                      <th className="px-4 py-3">Próx. venc.</th>
                      <th className="px-4 py-3">Estado</th>
                      <th className="px-4 py-3 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {pageProducts.map((product) => {
                      const productStock = stockForProduct(product.id);
                      const expiry = nextExpiryForProduct(product.id);
                      return (
                        <tr key={product.id} className="hover:bg-[#f6faf9]">
                          <td className="px-4 py-3">
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
                          </td>
                          <td className="px-4 py-3 font-medium">
                            {product.name}

                            {(product.presentation ||
                              product.externalReferencePresentation) && (
                              <span className="mt-1 block text-xs font-normal text-slate-500">
                                {product.presentation ||
                                  product.externalReferencePresentation}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 font-mono text-xs text-slate-600">
                            {product.barcodes[0]?.code ?? "—"}
                          </td>
                          <td className="px-4 py-3">
                            {product.laboratory?.name ?? "—"}
                          </td>
                          <td className="px-4 py-3">
                            {money(product.prices[0]?.amountMinor ?? 0)}
                          </td>
                          <td className="px-4 py-3">{productStock}</td>
                          <td className="px-4 py-3">
                            {expiry
                              ? new Date(expiry).toLocaleDateString("es-AR", {
                                  month: "2-digit",
                                  year: "numeric",
                                })
                              : "—"}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${product.active ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"}`}
                            >
                              {product.active
                                ? productStock
                                  ? "Activo"
                                  : "Sin stock"
                                : "Archivado"}
                            </span>
                          </td>
                          <td className="relative px-4 py-3 text-right">
                            <button
                              type="button"
                              aria-label={`Acciones para ${product.name}`}
                              aria-expanded={openActionMenu === product.id}
                              onClick={(event) => {
                                setActionAnchor(event.currentTarget);
                                setOpenActionMenu((current) =>
                                  current === product.id
                                    ? undefined
                                    : product.id,
                                );
                              }}
                              className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 shadow-sm hover:border-teal-300 hover:bg-teal-50 hover:text-teal-800"
                            >
                              Gestionar
                              <ChevronDown size={14} />
                            </button>
                            {openActionMenu === product.id && actionAnchor ? (
                              <ProductActionsMenu
                                anchor={actionAnchor}
                                onClose={() => setOpenActionMenu(undefined)}
                              >
                                <button
                                  type="button"
                                  onClick={() => {
                                    setOpenActionMenu(undefined);
                                    edit(product);
                                  }}
                                  className="w-full px-3 py-2 text-center text-sm text-slate-700 hover:bg-slate-50"
                                >
                                  Editar producto
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    void toggleProductActive(product)
                                  }
                                  className="w-full px-3 py-2 text-center text-sm text-slate-700 hover:bg-slate-50"
                                >
                                  {product.active ? "Archivar" : "Restaurar"}
                                </button>
                                <div className="my-1 border-t border-slate-100" />
                                <button
                                  type="button"
                                  onClick={() => {
                                    setOpenActionMenu(undefined);
                                    void remove(product);
                                  }}
                                  className="w-full px-3 py-2 text-center text-sm text-rose-700 hover:bg-rose-50"
                                >
                                  {product.active
                                    ? "Eliminar definitivamente"
                                    : "Eliminar de esta sucursal"}
                                </button>
                              </ProductActionsMenu>
                            ) : null}
                          </td>
                        </tr>
                      );
                    })}
                    {!filteredProducts.length ? (
                      <tr>
                        <td
                          colSpan={9}
                          className="px-4 py-10 text-center text-slate-500"
                        >
                          No hay productos para los filtros seleccionados.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
              <Pagination
                integrated
                total={filteredProducts.length}
                currentPage={currentProductPage}
                totalPages={productTotalPages}
                noun="productos"
                label="Páginas de productos"
                onChange={(page) => {
                  setOpenActionMenu(undefined);
                  setActionAnchor(undefined);
                  setProductPage({ key: productFilterKey, page });
                }}
              />
            </section>
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
                  onClick={clearForm}
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
                {isMedication && (
                  <ProductFormSection
                    title={
                      editingProduct?.externalReferenceName || selectedReference
                        ? "Cambiar vinculación"
                        : "Vincular medicamento"
                    }
                    defaultOpen={false}
                    status={
                      <ProductSyncStatus
                        showSource
                        product={editingProduct}
                        pendingName={selectedReference?.name}
                        pendingSource={selectedReference?.source}
                      />
                    }
                  >
                    <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] gap-2 sm:flex">
                      <input
                        value={referenceQuery}
                        onChange={(event) => {
                          referenceRequest.current?.abort();
                          setReferenceLoading(false);
                          setAlfaReferenceResults([]);
                          setReferenceQuery(event.target.value);
                          setReferenceSearchDone(false);
                          setReferenceResults([]);
                          setReferenceError("");
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            void searchReferences(referenceSource);
                          }
                        }}
                        aria-label="Buscar medicamento en la fuente seleccionada"
                        placeholder={
                          referenceSource === "alfabeta"
                            ? "Ej. Actron 400…"
                            : "Ej. Actron, ibuprofeno o código de barras…"
                        }
                        className="col-span-2 h-10 min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-3 text-sm placeholder:text-slate-400"
                      />
                      <button
                        type="button"
                        onClick={() => void searchReferences(referenceSource)}
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
                        }}
                      />
                    </div>
                    {referenceSearchDone ? (
                      <div className="mt-3">
                        {referenceQuery.trim().length < 2 ? (
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
                          <div className="max-h-80 space-y-2 overflow-y-auto">
                            {alfaReferenceResults.map((item) => (
                              <AlfaBetaMedicineCard
                                key={item.id}
                                item={item}
                                token={token}
                                organizationId={organizationId}
                                onSelect={applyReference}
                              />
                            ))}
                          </div>
                        ) : referenceResults.length ? (
                          <div className="max-h-44 space-y-2 overflow-y-auto pr-1">
                            {referenceResults.map((reference) => (
                              <button
                                key={`${reference.source}-${reference.name}-${reference.presentation}-${reference.laboratory}`}
                                type="button"
                                onClick={() => applyReference(reference)}
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
                                      : "Precios de Remedios"}
                                  </span>
                                  <span className="hidden text-[10px] text-slate-500">
                                    Catálogo interno
                                  </span>
                                </span>
                              </button>
                            ))}
                          </div>
                        ) : (
                          <>
                            <p className="rounded-lg border border-dashed border-teal-200 bg-white px-3 py-2.5 text-xs leading-5 text-slate-600">
                              No encontramos coincidencias en la fuente
                              consultada.
                            </p>
                          </>
                        )}
                      </div>
                    ) : null}
                  </ProductFormSection>
                )}
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
                      className="h-10 rounded-md border-slate-300 text-sm placeholder:text-slate-400"
                    />
                    {!editingProduct && (
                      <ExternalProductLookup
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
                                  externalGtin(barcode),
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
                        code={barcode}
                        allowAutomatic={
                          !name &&
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
                          applyReference(reference);
                          setBarcode(barcode.trim());
                        }}
                        onCode={(value) => {
                          if (
                            value.trim() !== barcode.trim() &&
                            externalBrand.current
                          ) {
                            const previousBrand = externalBrand.current;
                            setBrand((current) =>
                              current === previousBrand ? "" : current,
                            );
                            externalBrand.current = null;
                          }
                          if (
                            value.trim() !== barcode.trim() &&
                            scannedMedicine.current
                          ) {
                            const previous = scannedMedicine.current;
                            setSelectedReference(undefined);
                            if (previous.pharmaceuticalForm !== undefined)
                              setPharmaceuticalForm((current) =>
                                current === previous.pharmaceuticalForm
                                  ? ""
                                  : current,
                              );
                            if (previous.concentration !== undefined)
                              setConcentration((current) =>
                                current === previous.concentration
                                  ? ""
                                  : current,
                              );
                            if (previous.prescriptionRequired !== undefined)
                              setPrescriptionRequired((current) =>
                                current === previous.prescriptionRequired
                                  ? false
                                  : current,
                              );
                            setName((current) =>
                              current === previous.name ? "" : current,
                            );
                            setPresentation((current) =>
                              current === previous.presentation ? "" : current,
                            );
                            setActiveIngredient((current) =>
                              current === previous.activeIngredient
                                ? ""
                                : current,
                            );
                            setPrice((current) =>
                              previous.priceMinor !== null &&
                              current === String(previous.priceMinor / 100)
                                ? ""
                                : current,
                            );
                            setSuggestedLaboratoryName((current) =>
                              current === previous.laboratory ? "" : current,
                            );
                            setLaboratoryId((current) =>
                              options?.laboratories
                                .find((item) => item.id === current)
                                ?.name.trim()
                                .toLocaleLowerCase("es-AR") ===
                              previous.laboratory
                                .trim()
                                .toLocaleLowerCase("es-AR")
                                ? ""
                                : current,
                            );
                            setCategoryId((current) =>
                              options?.categories
                                .find((item) => item.id === current)
                                ?.name.toLocaleLowerCase("es-AR") ===
                              "medicamentos"
                                ? ""
                                : current,
                            );
                            scannedMedicine.current = null;
                          }
                          const filled = externalFilled.current;
                          if (
                            value.trim() !== barcode.trim() &&
                            externalImage.current
                          ) {
                            const previousImage = externalImage.current;
                            setProductImage((current) =>
                              current === previousImage ? undefined : current,
                            );
                            externalImage.current = null;
                          }
                          if (value.trim() !== barcode.trim() && filled) {
                            if (
                              !saleUnitEdited.current &&
                              suggestedSaleUnit.current
                            )
                              setSaleUnit("BOX");
                            suggestedSaleUnit.current = null;
                            setName((current) =>
                              current === filled.name ? "" : current,
                            );
                            setPresentation((current) =>
                              current === filled.presentation ? "" : current,
                            );
                            setCategoryId((current) =>
                              current === filled.categoryId ? "" : current,
                            );
                            setDescription((current) =>
                              current === filled.description ? "" : current,
                            );
                            externalFilled.current = null;
                          }
                          setBarcode(value);
                        }}
                        disabled={productSaving || imageBusy || optionCreating}
                        onApply={async (candidate) => {
                          if (
                            optionCreateLock.current ||
                            productSaveLock.current
                          )
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
                            fields.categoryId =
                              classification?.categoryId ?? "";
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
                            setCategoryId(
                              (value) => value || fields.categoryId,
                            );
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
                    )}
                    {editingProduct && (
                      <Input
                        label="Código de barras"
                        value={barcode}
                        onChange={setBarcode}
                        placeholder="Ej. 7791234567890"
                        required={false}
                        labelClassName="mt-3 text-xs font-semibold text-slate-600"
                        className="h-10 rounded-md border-slate-300 text-sm placeholder:text-slate-400"
                      />
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
                      className="h-10 rounded-md border-slate-300 text-sm placeholder:text-slate-400"
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
                            className="h-10 rounded-md border-slate-300 text-sm placeholder:text-slate-400"
                          />
                          <Input
                            label="Forma farmacéutica"
                            value={pharmaceuticalForm}
                            onChange={setPharmaceuticalForm}
                            placeholder="Ej. Comprimidos"
                            required={false}
                            labelClassName="mt-3 text-xs font-semibold text-slate-600"
                            className="h-10 rounded-md border-slate-300 text-sm placeholder:text-slate-400"
                          />
                          <Input
                            label="Concentración"
                            value={concentration}
                            onChange={setConcentration}
                            placeholder="Ej. 600 mg"
                            required={false}
                            labelClassName="mt-3 text-xs font-semibold text-slate-600"
                            className="h-10 rounded-md border-slate-300 text-sm placeholder:text-slate-400"
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
                        className="h-10 rounded-md border-slate-300 text-sm placeholder:text-slate-400"
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
                  onClick={clearForm}
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
                  {editingProduct ? "Guardar cambios" : "Guardar producto"}
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
        className="border bg-white p-5"
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
            onClick={clearForm}
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
  const [inventoryQuery, setInventoryQuery] = useState("");
  const [inventoryPage, setInventoryPage] = useState(1);
  const productMap = useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products],
  );
  const productOptions = useMemo(
    () => products.map(inventoryProductOption),
    [products],
  );
  const lotOptions = useMemo(
    () =>
      stock.map((lot) =>
        inventoryLotOption(lot, productMap.get(lot.productId)),
      ),
    [stock, productMap],
  );
  const stockPage = inventoryStockPage(
    stock,
    lotOptions,
    inventoryQuery,
    inventoryPage,
  );
  const [productId, setProductId] = useState("");
  const [inventoryMode, setInventoryMode] = useState<
    "receive" | "adjust" | "return"
  >("receive");
  const [scannedCode, setScannedCode] = useState("");
  const [scanStatus, setScanStatus] = useState("");
  const [scanError, setScanError] = useState(false);
  const [lotNumber, setLotNumber] = useState("");
  const [quantity, setQuantity] = useState("");
  const [cost, setCost] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [adjustmentLotId, setAdjustmentLotId] = useState("");
  const [adjustmentQuantity, setAdjustmentQuantity] = useState("");
  const [adjustmentDirection, setAdjustmentDirection] = useState<
    "subtract" | "add"
  >("add");
  const [adjustmentReason, setAdjustmentReason] = useState("");
  const [suppliers, setSuppliers] = useState<Party[]>([]);
  const [returnSupplierId, setReturnSupplierId] = useState("");
  const [returnLotId, setReturnLotId] = useState("");
  const [returnQuantity, setReturnQuantity] = useState("");
  const [returnReason, setReturnReason] = useState("");
  const scannerInputRef = useRef<HTMLInputElement>(null);
  const lotInputRef = useRef<HTMLInputElement>(null);
  const adjustmentLotSelectRef = useRef<HTMLInputElement>(null);
  const adjustmentQuantityInputRef = useRef<HTMLInputElement>(null);
  const [adjustmentError, setAdjustmentError] = useState("");
  const returnSupplierSelectRef = useRef<HTMLSelectElement>(null);
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
  const selectScannedProduct = () => {
    const rawCode = scannedCode.trim();
    if (!rawCode) return;
    const candidates = new Set(
      [rawCode, ...(rawCode.match(/\d{8,14}/g) ?? [])].flatMap((code) =>
        code.length === 14 && code.startsWith("0")
          ? [code, code.slice(1)]
          : [code],
      ),
    );
    const product = products.find((item) =>
      item.barcodes.some((barcode) => candidates.has(barcode.code.trim())),
    );
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
      setAdjustmentLotId(selectedLot?.id ?? "");
      window.requestAnimationFrame(() =>
        (selectedLot
          ? adjustmentQuantityInputRef.current
          : adjustmentLotSelectRef.current
        )?.focus(),
      );
      return;
    }
    setReturnLotId(selectedLot?.id ?? "");
    window.requestAnimationFrame(() =>
      (selectedLot
        ? returnSupplierSelectRef.current
        : returnLotSelectRef.current
      )?.focus(),
    );
  };
  const save = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await receiveStock(token, organizationId, branchId, {
        productId,
        lotNumber,
        quantity: Number(quantity),
        unitCostMinor: Math.round(Number(cost) * 100),
        expiresAt: expiresAt || undefined,
      });
      setProductId("");
      setScannedCode("");
      setLotNumber("");
      setQuantity("");
      setCost("");
      setExpiresAt("");
      setScanStatus("Recepción registrada. Escaneá el siguiente producto.");
      setScanError(false);
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
    try {
      await adjustStock(token, organizationId, branchId, {
        lotId: adjustmentLotId,
        quantity: stockAdjustmentDelta(adjustmentQuantity, adjustmentDirection),
        reason: adjustmentReason,
      });
      setAdjustmentQuantity("");
      setAdjustmentReason("");
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
        supplierId: returnSupplierId,
        lotId: returnLotId,
        quantity: Number(returnQuantity),
        reason: returnReason,
      });
      setReturnQuantity("");
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
        <div className="overflow-hidden rounded-xl border bg-white">
          {adjustmentError && (
            <ProductSaveErrorDialog
              title="No pudimos registrar el ajuste"
              message={adjustmentError}
              onClose={() => setAdjustmentError("")}
            />
          )}
          <div className="flex items-center gap-3 border-b border-slate-100 p-3">
            <input
              type="search"
              aria-label="Buscar en inventario"
              placeholder="Buscar producto, laboratorio, código o lote…"
              value={inventoryQuery}
              onChange={(event) => {
                setInventoryQuery(event.target.value);
                setInventoryPage(1);
              }}
              className="h-10 min-w-0 flex-1 rounded-lg border bg-white px-3 text-sm"
            />
            <p aria-live="polite" className="shrink-0 text-xs text-slate-500">
              {stockPage.total} de {stock.length} lotes
            </p>
          </div>
          {!stockPage.total && (
            <p
              role="status"
              className="px-5 py-10 text-center text-sm text-slate-500"
            >
              {stock.length
                ? "No hay lotes que coincidan con la búsqueda."
                : "No hay existencias en esta sucursal."}
            </p>
          )}
          {stockPage.total > 0 && (
            <InventoryStockTable
              lots={stockPage.lots}
              products={productMap}
              token={token}
              organizationId={organizationId}
              branchId={branchId}
              done={done}
            />
          )}
          <Pagination
            integrated
            total={stockPage.total}
            currentPage={stockPage.currentPage}
            totalPages={stockPage.totalPages}
            noun="lotes"
            label="Páginas de inventario"
            onChange={setInventoryPage}
          />
        </div>
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
            className="border bg-white p-5"
          >
            <h2 className="mb-4 font-semibold">Recibir mercadería</h2>
            <label className="block text-sm font-medium text-slate-700">
              Escanear código o QR
              <div className="mt-1 flex items-center gap-2 rounded-md border border-teal-600 bg-teal-50/40 px-3 focus-within:ring-2 focus-within:ring-teal-200">
                <ScanBarcode size={19} className="shrink-0 text-teal-700" />
                <input
                  ref={scannerInputRef}
                  autoFocus
                  value={scannedCode}
                  onChange={(event) => {
                    setScannedCode(event.target.value);
                    setScanStatus("");
                    setScanError(false);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      selectScannedProduct();
                    }
                  }}
                  placeholder="Escaneá y presioná Enter"
                  className="h-10 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400"
                />
              </div>
            </label>
            {scanStatus ? (
              <p
                className={`mt-2 text-xs ${
                  scanError ? "text-rose-600" : "text-teal-700"
                }`}
              >
                {scanStatus}
              </p>
            ) : null}
            <h2 className="sr-only">Recibir mercadería</h2>
            <InventoryPendingPurchase
              token={token}
              organizationId={organizationId}
              branchId={branchId}
              productId={productId}
              onOpen={onPurchase}
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
            <Input
              label="Número de lote"
              value={lotNumber}
              onChange={setLotNumber}
              inputRef={lotInputRef}
            />
            <Input
              label="Cantidad"
              type="number"
              value={quantity}
              onChange={setQuantity}
            />
            <Input
              label="Costo unitario"
              type="number"
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
            <button className="mt-5 w-full bg-teal-700 py-2 text-sm text-white">
              Confirmar recepción
            </button>
          </form>
        ) : null}
        {inventoryMode === "adjust" ? (
          <form
            onSubmit={(event) => void adjust(event)}
            className="border bg-white p-5"
          >
            <h2 className="font-semibold">Ajuste de stock</h2>
            <label className="mt-4 block text-sm font-medium text-slate-700">
              Escanear código o QR
              <div className="mt-1 flex items-center gap-2 rounded-md border border-teal-600 bg-teal-50/40 px-3 focus-within:ring-2 focus-within:ring-teal-200">
                <ScanBarcode size={19} className="shrink-0 text-teal-700" />
                <input
                  ref={scannerInputRef}
                  autoFocus
                  value={scannedCode}
                  onChange={(event) => {
                    setScannedCode(event.target.value);
                    setScanStatus("");
                    setScanError(false);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      selectScannedProduct();
                    }
                  }}
                  placeholder="Escaneá y presioná Enter"
                  className="h-10 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400"
                />
              </div>
            </label>
            {scanStatus ? (
              <p
                className={`mt-2 text-xs ${scanError ? "text-rose-600" : "text-teal-700"}`}
              >
                {scanStatus}
              </p>
            ) : null}
            <InventorySearchSelect
              label="Producto y lote"
              value={adjustmentLotId}
              options={lotOptions}
              inputRef={adjustmentLotSelectRef}
              onChange={(id) => {
                setAdjustmentLotId(id);
                if (id)
                  window.requestAnimationFrame(() =>
                    adjustmentQuantityInputRef.current?.focus(),
                  );
              }}
            />
            <StockAdjustmentQuantity
              direction={adjustmentDirection}
              onDirectionChange={setAdjustmentDirection}
              value={adjustmentQuantity}
              onChange={setAdjustmentQuantity}
              inputRef={adjustmentQuantityInputRef}
            />
            <Input
              label="Motivo"
              value={adjustmentReason}
              onChange={setAdjustmentReason}
            />
            <button className="mt-5 w-full border border-teal-700 py-2 text-sm text-teal-800">
              Registrar ajuste
            </button>
          </form>
        ) : null}
        {inventoryMode === "return" ? (
          <form
            onSubmit={(event) => void returnToSupplier(event)}
            className="border bg-white p-5"
          >
            <h2 className="font-semibold">Devolución a proveedor</h2>
            <label className="mt-4 block text-sm font-medium text-slate-700">
              Escanear código o QR
              <div className="mt-1 flex items-center gap-2 rounded-md border border-teal-600 bg-teal-50/40 px-3 focus-within:ring-2 focus-within:ring-teal-200">
                <ScanBarcode size={19} className="shrink-0 text-teal-700" />
                <input
                  ref={scannerInputRef}
                  autoFocus
                  value={scannedCode}
                  onChange={(event) => {
                    setScannedCode(event.target.value);
                    setScanStatus("");
                    setScanError(false);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      selectScannedProduct();
                    }
                  }}
                  placeholder="Escaneá y presioná Enter"
                  className="h-10 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400"
                />
              </div>
            </label>
            {scanStatus ? (
              <p
                className={`mt-2 text-xs ${scanError ? "text-rose-600" : "text-teal-700"}`}
              >
                {scanStatus}
              </p>
            ) : null}
            <p className="mt-2 text-xs text-slate-500">
              Da salida al lote; usalo para vencidos, daños o reclamos al
              proveedor.
            </p>
            <label className="mt-4 block text-sm">
              Proveedor
              <select
                required
                className="mt-1 h-10 w-full border px-3"
                value={returnSupplierId}
                onChange={(event) => setReturnSupplierId(event.target.value)}
                ref={returnSupplierSelectRef}
              >
                <option value="">Seleccionar…</option>
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </select>
            </label>
            <InventorySearchSelect
              label="Producto y lote"
              value={returnLotId}
              options={lotOptions}
              inputRef={returnLotSelectRef}
              onChange={setReturnLotId}
            />
            <Input
              label="Cantidad"
              type="number"
              value={returnQuantity}
              onChange={setReturnQuantity}
            />
            <Input
              label="Motivo"
              value={returnReason}
              onChange={setReturnReason}
            />
            <button className="mt-5 w-full border border-teal-700 py-2 text-sm text-teal-800">
              Confirmar devolución
            </button>
          </form>
        ) : null}
      </div>
    </div>
  );
}

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
  const [highlightedSuggestionIndex, setHighlightedSuggestionIndex] =
    useState(0);
  const productSearchRef = useRef<HTMLInputElement>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [discountEditorOpen, setDiscountEditorOpen] = useState(false);
  const [discountAmount, setDiscountAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [lines, setLines] = useState<
    {
      productId: string;
      description?: string;
      unitPriceMinor?: number;
      requestedUnitPriceMinor?: number;
      quantity: number;
      discountMinor: number;
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
  const available = (id: string) =>
    stock
      .filter((lot) => lot.productId === id)
      .reduce(
        (sum, lot) => sum + withStockAvailability(lot).sellableQuantity,
        0,
      );
  const expiredStock = (id: string) =>
    stock
      .filter((lot) => lot.productId === id)
      .reduce(
        (sum, lot) => sum + withStockAvailability(lot).expiredQuantity,
        0,
      );
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
  const matchingProducts = products.filter(
    (item) =>
      (available(item.id) > 0 || expiredStock(item.id) > 0) &&
      `${item.name} ${item.barcodes.map((barcode) => barcode.code).join(" ")}`
        .toLocaleLowerCase()
        .includes(searchTerm),
  );
  const keyboardProducts = matchingProducts
    .filter((item) => available(item.id) > 0)
    .slice(0, 8);
  const exactBarcodeProduct = products.find(
    (item) =>
      available(item.id) > 0 &&
      item.barcodes.some(
        (barcode) => barcode.code.toLocaleLowerCase() === searchTerm,
      ),
  );
  const selectProductSuggestion = (id: string) => {
    const selectedProduct = products.find((item) => item.id === id);
    if (!selectedProduct) return;
    setProductId(selectedProduct.id);
    setProductQuery("");
    setHighlightedSuggestionIndex(0);
    window.requestAnimationFrame(() => productSearchRef.current?.focus());
  };
  const addProductToSale = (
    selectedProductId: string,
    requestedQuantity: number,
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
          },
        ];
      }
      return current.map((line) =>
        line.productId === selectedProductId
          ? { ...line, quantity: line.quantity + requestedQuantity }
          : line,
      );
    });
    return true;
  };
  const add = (event: FormEvent) => {
    event.preventDefault();
    const selectedProductId =
      productId ||
      exactBarcodeProduct?.id ||
      keyboardProducts[highlightedSuggestionIndex]?.id;
    const requestedQuantity = 1;
    if (
      !selectedProductId ||
      !addProductToSale(selectedProductId, requestedQuantity)
    )
      return;
    setProductId("");
    setProductQuery("");
    window.requestAnimationFrame(() => productSearchRef.current?.focus());
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
  const applyDiscount = () => {
    const nextDiscountMinor = parseDiscountDraft(discountAmount);
    if (
      nextDiscountMinor === undefined ||
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
    setDiscountEditorOpen(false);
  };
  const paid = payments.reduce((sum, payment) => sum + payment.amountMinor, 0);
  const changeMinor = Math.max(paid - total, 0);
  const paymentAmountMinor = parseArgentineAmountMinor(paymentAmount);
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
  const addPayment = () => {
    const remaining = total - paid;
    if (remaining <= 0) return error("La venta ya está completamente cobrada.");
    if (method === "ACCOUNT" && !customerId)
      return error("Seleccioná un cliente para usar cuenta corriente.");
    const amountMinor = paymentAmount.trim() ? paymentAmountMinor : remaining;
    if (amountMinor === undefined || amountMinor <= 0)
      return error("Indicá un importe válido para el pago.");
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
      return error(
        "La cuenta no está habilitada o el importe supera el crédito disponible.",
      );
    if (method !== "CASH" && amountMinor > remaining)
      return error(
        "Solo el efectivo puede superar el saldo pendiente para entregar vuelto.",
      );
    setPayments((current) => {
      const existingAmount = current
        .filter((payment) => payment.method === method)
        .reduce((sum, payment) => sum + payment.amountMinor, 0);
      return [
        ...current.filter((payment) => payment.method !== method),
        { method, amountMinor: existingAmount + amountMinor },
      ];
    });
    setPaymentAmount("");
  };
  const removePayment = (
    paymentMethod: "TRANSFER" | "CARD" | "CASH" | "ACCOUNT",
  ) => {
    setPayments((current) =>
      current.filter((payment) => payment.method !== paymentMethod),
    );
  };
  const selectPaymentMethod = (value: typeof method) => {
    if (value === "ACCOUNT") {
      try {
        setPayments(prepareAccountPayment(total, payments, creditAccount));
        setPaymentAmount("");
      } catch (cause) {
        error(
          cause instanceof Error
            ? cause.message
            : "No se pudo aplicar la cuenta corriente.",
        );
        return;
      }
    }
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
      if (!shouldRouteSalesSearchKey(event, { editing, blocked })) return;
      event.preventDefault();
      setProductQuery(event.key);
      setProductId("");
      setHighlightedSuggestionIndex(0);
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
  const complete = async () => {
    if (submitting) return;
    if (!allowWithoutSession && !session)
      return error(
        "Esta sucursal requiere una caja abierta para vender. Abrí una caja y reintentá.",
      );
    if (documentType === "INVOICE" && !fiscalCapabilities?.voucherTypes.length)
      return error(
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
      return error(
        "Esperá a que se carguen los precios o actualizalos antes de cobrar.",
      );
    try {
      if (paid < total)
        return error("Agregá cobros hasta cubrir el total de la venta.");
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
                expectedUnitPriceMinor: products.find(
                  (p) => p.id === line.productId,
                )!.prices[0]!.amountMinor,
              },
        ),
        payments: payments.map((payment) => ({
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
          payments,
        });
      setLines([]);
      setFiscalOptions(defaultSaleFiscalOptions);
      setPayments([]);
      setMethod("CASH");
      setPaymentAmount("");
      setPaymentModalOpen(false);
      setClientOperationId(crypto.randomUUID());
      await loadHistory();
      done();
    } catch (cause) {
      error(
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
          setPaymentModalOpen(false);
          setResumeNeeded(false);
        }}
        onDiscard={() => {
          setLines([]);
          setFiscalOptions(defaultSaleFiscalOptions);
          setFiscalSettingsOpen(false);
          setPayments([]);
          setCustomerId("");
          setSalePriceListId("");
          setMethod("CASH");
          setPaymentAmount("");
          setPaymentModalOpen(false);
          setDiscountAmount("");
          setDiscountEditorOpen(false);
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
      <section className="flex min-h-[585px] flex-col border bg-white p-4 xl:h-full xl:min-h-0">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-teal-800">
            <ScanBarcode size={19} />
            <h2 className="font-semibold">Buscar productos</h2>
          </div>
          <SaleConceptMenu
            disabled={submitting}
            onAdd={() => setConceptOpen(true)}
          />
        </div>
        <form onSubmit={add} className="mt-4 flex min-h-0 flex-1 flex-col">
          <label className="block text-sm font-medium">
            Producto
            <span className="relative mt-1 block">
              <Search
                size={17}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-teal-700"
              />
              <input
                ref={productSearchRef}
                className="h-10 w-full border border-teal-400 bg-white pl-10 pr-10 text-sm"
                value={productQuery}
                placeholder="Escaneá o escribí para buscar"
                autoComplete="off"
                onChange={(event) => {
                  setProductQuery(event.target.value);
                  setProductId("");
                  setHighlightedSuggestionIndex(0);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    setProductQuery("");
                    return;
                  }
                  if (!keyboardProducts.length) return;
                  if (event.key === "ArrowDown") {
                    event.preventDefault();
                    setHighlightedSuggestionIndex((current) =>
                      Math.min(current + 1, keyboardProducts.length - 1),
                    );
                  }
                  if (event.key === "ArrowUp") {
                    event.preventDefault();
                    setHighlightedSuggestionIndex((current) =>
                      Math.max(current - 1, 0),
                    );
                  }
                }}
              />
              <ScanBarcode
                size={18}
                className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-teal-600"
              />
            </span>
          </label>
          <div className="mt-4 flex min-h-0 flex-1 flex-col">
            <p className="mb-2 text-xs font-semibold text-slate-600">
              Resultados
            </p>
            <div className="-mx-2 min-h-0 flex-1 divide-y divide-slate-100 overflow-y-auto border-y border-slate-100">
              {matchingProducts.map((item) => (
                <div
                  key={item.id}
                  className={`flex w-full items-center px-1 py-2.5 text-left text-sm ${productId === item.id || (productQuery && keyboardProducts[highlightedSuggestionIndex]?.id === item.id) ? "bg-teal-50 text-teal-950" : "hover:bg-teal-50/60"}`}
                >
                  <div className="mr-2 shrink-0">
                    <ProductThumbnail
                      token={token}
                      organizationId={organizationId}
                      productId={item.id}
                      name={item.name}
                      version={item.image?.updatedAt}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => selectProductSuggestion(item.id)}
                    disabled={available(item.id) <= 0}
                    className="flex min-w-0 flex-1 items-center text-left"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium">
                        {item.name}
                      </span>
                      <span className="block truncate text-[11px] text-slate-500">
                        {[
                          item.activeIngredient,
                          item.concentration,
                          item.pharmaceuticalForm,
                          item.presentation,
                        ]
                          .filter((detail): detail is string => Boolean(detail))
                          .join(" · ") || "Sin detalle farmacéutico"}
                      </span>
                      <span className="block truncate text-[11px] font-medium text-teal-700">
                        {available(item.id) > 0
                          ? `Disponibles: ${available(item.id)} unidades`
                          : "Sin stock vendible"}
                      </span>
                      {expiredStock(item.id) > 0 && (
                        <span className="block text-[11px] font-medium text-rose-600">
                          {expiredStock(item.id)} unidades vencidas · No
                          vendibles
                        </span>
                      )}
                    </span>
                  </button>
                  <span className="ml-2 whitespace-nowrap text-xs font-medium text-teal-800">
                    {money(Number(item.prices[0]?.amountMinor ?? 0))}
                  </span>
                  <button
                    type="button"
                    aria-label={`Agregar ${item.name}`}
                    disabled={available(item.id) <= 0}
                    onClick={() => {
                      if (!addProductToSale(item.id, 1)) return;
                      setProductId("");
                      setProductQuery("");
                      window.requestAnimationFrame(() =>
                        productSearchRef.current?.focus(),
                      );
                    }}
                    className="ml-2 grid h-7 w-7 shrink-0 place-items-center rounded-md border border-teal-600 text-teal-700 hover:bg-teal-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-300"
                  >
                    <Plus size={15} />
                  </button>
                </div>
              ))}
              {!matchingProducts.length ? (
                <p className="flex h-full items-center justify-center px-3 text-center text-sm text-slate-500">
                  No hay productos con stock para esta búsqueda.
                </p>
              ) : null}
            </div>
          </div>
        </form>
        <div className="sales-customer-fields mt-auto grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-2">
          <div className="block text-xs font-medium text-slate-700">
            Cliente
            <SearchableSaleSelect
              label="Cliente"
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
              options={[
                ...(customerId ? [{ value: "", label: "Según cliente" }] : []),
                ...salePriceLists.map((list) => ({
                  value: list.id,
                  label: list.name,
                })),
              ]}
              value={
                salePriceListId ||
                (!customerId
                  ? (salePriceLists.find(
                      (list) => list.name === "Precio general",
                    )?.id ?? "")
                  : "")
              }
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
        </div>
      </section>

      <section className="flex min-h-[585px] flex-col overflow-hidden border bg-white xl:h-full xl:min-h-0">
        <header className="flex items-center justify-between border-b px-5 py-4">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 text-teal-700">
              <ShoppingCart size={20} />
            </span>
            <div>
              <h2 className="font-semibold">Venta actual</h2>
              <p className="text-xs text-slate-500">
                {lines.length
                  ? `${lines.length} producto${lines.length === 1 ? "" : "s"} en el carrito`
                  : "Agregá productos para comenzar"}
              </p>
            </div>
          </div>
          {lines.length ? (
            <button
              type="button"
              onClick={() => {
                setLines([]);
                setFiscalOptions(defaultSaleFiscalOptions);
                setFiscalSettingsOpen(false);
                setPayments([]);
                setMethod("CASH");
                setPaymentAmount("");
                window.requestAnimationFrame(() =>
                  productSearchRef.current?.focus(),
                );
              }}
              className="inline-flex h-10 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-slate-200 bg-slate-50 px-4 text-xs font-medium text-slate-500 transition-colors hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2"
            >
              <Trash2 size={16} /> Vaciar venta
            </button>
          ) : null}
        </header>
        <div className="sales-cart-row grid grid-cols-[minmax(0,1.7fr)_90px_100px_105px_84px] gap-3 border-b bg-slate-50 px-5 py-3 text-[10px] font-bold uppercase tracking-wide text-slate-500">
          <span>Producto</span>
          <span className="text-center">Cantidad</span>
          <span className="text-center">Precio unit.</span>
          <span className="text-center" title="Descuento por unidad">
            Descuento
          </span>
          <span className="text-right">Subtotal</span>
          <span aria-hidden="true" />
        </div>
        <div className="min-h-0 flex-1 divide-y overflow-y-auto">
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
                  className="sales-cart-row grid grid-cols-[minmax(0,1.7fr)_90px_100px_105px_84px] items-center gap-3 px-5 py-3"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <div className="shrink-0">
                      {line.description ? (
                        <ReceiptText size={22} className="m-2 text-teal-600" />
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
                        className="sales-cart-product-name text-sm font-semibold"
                        title={line.description ?? product?.name}
                      >
                        {line.description ?? product?.name}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {line.description
                          ? "Concepto · Sin movimiento de stock"
                          : `${available(line.productId)} disponibles`}
                      </p>
                    </div>
                  </div>
                  <div className="sale-quantity-stepper">
                    <button
                      type="button"
                      aria-label="Restar unidad"
                      onClick={() => {
                        updateLineQuantity(line.productId, line.quantity - 1);
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
                      onScan={(code) => {
                        const scanned = products.find((product) =>
                          product.barcodes.some(
                            (barcode) => barcode.code.trim() === code.trim(),
                          ),
                        );
                        if (scanned) addProductToSale(scanned.id, 1);
                        else
                          error("No se encontró un producto con ese código.");
                      }}
                      onCommit={(quantity) =>
                        updateLineQuantity(line.productId, quantity)
                      }
                    />
                    <button
                      type="button"
                      aria-label="Sumar unidad"
                      onClick={() => {
                        updateLineQuantity(line.productId, line.quantity + 1);
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
                      onScan={(code) => {
                        const scanned = products.find((product) =>
                          product.barcodes.some(
                            (barcode) => barcode.code.trim() === code.trim(),
                          ),
                        );
                        if (scanned) addProductToSale(scanned.id, 1);
                        else
                          error("No se encontró un producto con ese código.");
                      }}
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
                  <div className="text-right text-sm font-semibold">
                    <p>
                      {money(unitPrice * line.quantity - line.discountMinor)}
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
        <footer className="shrink-0 border-t bg-slate-50/70 px-5 py-4">
          <div className="flex items-center justify-between gap-5">
            <div className="border-r pr-10 text-xs text-slate-500">
              <p className="font-semibold text-slate-700">Total de ítems</p>
              <p className="mt-1">
                {lines.reduce((sum, line) => sum + line.quantity, 0)} producto
                {lines.reduce((sum, line) => sum + line.quantity, 0) === 1
                  ? ""
                  : "s"}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs font-semibold text-slate-700">
                Total a cobrar
              </p>
              <strong className="mt-1 block text-2xl tracking-tight text-teal-700">
                {money(total)}
              </strong>
            </div>
          </div>
        </footer>
      </section>

      <aside className="sales-checkout flex min-h-[585px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-sm xl:h-full xl:min-h-0">
        <div
          className="sales-payment-body min-h-0 flex-1 overflow-y-auto"
          tabIndex={0}
          role="region"
          aria-label="Detalle del cobro de la venta"
        >
          <div className="flex items-center gap-2 text-teal-800">
            <CreditCard size={19} />
            <h2 className="text-base font-semibold">Cobro de la venta</h2>
          </div>
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
          {conceptOpen && (
            <SaleConceptDialog
              key={`${organizationId}:${userKey}`}
              organizationId={organizationId}
              userKey={userKey}
              onClose={() => setConceptOpen(false)}
              onAdd={(concept) => {
                setLines((current) => [
                  ...current,
                  {
                    productId: crypto.randomUUID(),
                    ...concept,
                    quantity: 1,
                    discountMinor: 0,
                  },
                ]);
                setConceptOpen(false);
                window.requestAnimationFrame(() =>
                  productSearchRef.current?.focus(),
                );
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
                const customer = customers.find(
                  (item) => item.id === customerId,
                );
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
          <div className="sales-checkout-total mt-4 text-center">
            <p className="text-xs font-semibold text-teal-700">
              {paid > 0 ? "SALDO PENDIENTE" : "TOTAL A PAGAR"}
            </p>
            <p className="mt-1 text-3xl font-bold tracking-tight text-teal-700">
              {money(Math.max(total - paid, 0))}
            </p>
          </div>
          <div className="sales-checkout-methods mt-4">
            <p className="text-sm font-semibold text-slate-700">
              Medio de pago
            </p>
            <div className="sales-checkout-method-grid mt-2 grid grid-cols-3 gap-2">
              {(
                [
                  ["CASH", "Efectivo"],
                  ["CARD", "Tarjeta"],
                  ["TRANSFER", "Transferencia"],
                  ["ACCOUNT", "Cuenta corriente"],
                ] as const
              )
                .filter(
                  ([value]) =>
                    value !== "ACCOUNT" ||
                    (creditAccount?.active && creditAccount.creditEnabled),
                )
                .map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    disabled={
                      !lines.length ||
                      (value === "ACCOUNT" && !creditAccount?.creditEnabled)
                    }
                    onClick={() => selectPaymentMethod(value)}
                    aria-pressed={method === value}
                    className={`${value === "ACCOUNT" ? "col-span-3 flex min-h-14 items-center gap-3 px-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 disabled:opacity-40" : "px-1"} rounded-xl border py-2.5 text-sm font-medium ${method === value ? "border-teal-600 bg-teal-50 text-teal-800" : "border-slate-200 bg-white text-slate-600 hover:border-teal-200"}`}
                  >
                    {value === "ACCOUNT" ? (
                      <span
                        className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${method === value ? "bg-teal-100 text-teal-700" : "bg-slate-100 text-slate-500"}`}
                      >
                        <UserRound size={18} aria-hidden="true" />
                      </span>
                    ) : value === "CASH" ? (
                      <Banknote className="mx-auto mb-1" size={18} />
                    ) : value === "TRANSFER" ? (
                      <ArrowLeftRight className="mx-auto mb-1" size={18} />
                    ) : (
                      <CreditCard className="mx-auto mb-1" size={18} />
                    )}
                    <span
                      className={value === "ACCOUNT" ? "flex-1" : undefined}
                    >
                      {label}
                    </span>
                    {value === "ACCOUNT" && (
                      <span
                        aria-hidden="true"
                        className={`grid h-4 w-4 shrink-0 place-items-center rounded-full border ${method === value ? "border-teal-600 bg-teal-600" : "border-slate-300"}`}
                      >
                        {method === value && (
                          <span className="h-1.5 w-1.5 rounded-full bg-white" />
                        )}
                      </span>
                    )}
                  </button>
                ))}
            </div>
            {method !== "ACCOUNT" && (
              <label className="mt-3 block text-sm font-semibold text-slate-700">
                Importe recibido
                <span className="mt-2 flex gap-2">
                  <span className="grid h-11 min-w-0 flex-1 grid-cols-[40px_1fr] overflow-hidden rounded-xl border border-teal-400 bg-white">
                    <span className="grid place-items-center border-r bg-slate-50 text-base font-semibold text-slate-600">
                      $
                    </span>
                    <input
                      className="min-w-0 border-0 px-3 text-base"
                      type="text"
                      inputMode="decimal"
                      value={paymentAmount}
                      placeholder="Ej. 5.000 o 5.000,00"
                      onChange={(event) => setPaymentAmount(event.target.value)}
                    />
                  </span>
                  <button
                    type="button"
                    disabled={!lines.length || paid >= total}
                    onClick={addPayment}
                    className="shrink-0 rounded-xl border border-[#0f9b8e] bg-white px-5 text-sm font-semibold text-[#087f70] shadow-sm hover:bg-teal-50 disabled:border-slate-200 disabled:text-slate-400"
                  >
                    Agregar
                  </button>
                </span>
              </label>
            )}
          </div>
          <div className="pr-1">
            {method !== "ACCOUNT" && !session ? (
              <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                {allowWithoutSession
                  ? "El cobro quedará pendiente de asignación a una caja."
                  : "Esta sucursal requiere una caja abierta para cobrar."}
              </p>
            ) : null}
            {payments.length ? (
              <div className="mt-2">
                <p className="mb-1.5 text-xs font-semibold text-slate-700">
                  Pagos agregados
                </p>
                <div className="max-h-28 space-y-1.5 overflow-y-auto pr-1">
                  {groupedPayments.map((payment) => (
                    <div
                      key={payment.method}
                      className="relative flex min-h-10 items-center rounded-lg border border-slate-200 bg-slate-50/70 px-2.5 py-1.5 text-xs"
                    >
                      <div className="flex items-center gap-2 pr-4 text-sm text-slate-700">
                        {payment.method === "CASH" ? (
                          <Banknote size={16} className="text-teal-700" />
                        ) : payment.method === "TRANSFER" ? (
                          <ArrowLeftRight size={16} className="text-teal-700" />
                        ) : (
                          <CreditCard size={16} className="text-teal-700" />
                        )}
                        <span className="truncate">
                          {payment.method === "ACCOUNT"
                            ? "Cuenta corriente"
                            : payment.method === "CASH"
                              ? "Efectivo"
                              : payment.method === "CARD"
                                ? "Tarjeta"
                                : "Transferencia"}
                        </span>
                      </div>
                      <p className="ml-auto mr-6 shrink-0 text-sm tracking-tight text-slate-800">
                        {money(payment.amountMinor)}
                      </p>
                      <button
                        type="button"
                        aria-label="Quitar pago"
                        onClick={() => removePayment(payment.method)}
                        className="absolute right-1.5 top-1.5 rounded p-0.5 text-rose-500 hover:bg-rose-50 hover:text-rose-700"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            <div className="sales-checkout-summary mt-3 border-t pt-3 text-sm">
              <div className="flex justify-between text-slate-600">
                <span>Subtotal</span>
                <span>{money(subtotal)}</span>
              </div>
              <div className="mt-1.5 flex justify-between text-slate-600">
                {discountEditorOpen && !paymentModalOpen ? (
                  <>
                    <span className="pt-1.5">Descuento</span>
                    <span className="flex h-8 items-center gap-1">
                      <label className="discount-amount-field flex h-8 w-28 items-center">
                        <span aria-hidden="true" className="pl-2 text-xs">
                          $
                        </span>
                        <DiscountAmountInput
                          className="min-w-0 flex-1 px-2 text-right text-xs"
                          value={discountAmount}
                          onChange={setDiscountAmount}
                          onApply={applyDiscount}
                          onCancel={() => setDiscountEditorOpen(false)}
                        />
                      </label>
                      <button
                        type="button"
                        onClick={applyDiscount}
                        className="rounded-md bg-teal-700 px-2 py-1.5 text-[11px] font-semibold text-white"
                      >
                        Aplicar
                      </button>
                      <button
                        type="button"
                        aria-label="Cancelar descuento"
                        onClick={() => setDiscountEditorOpen(false)}
                        className="px-1 text-slate-400 hover:text-slate-700"
                      >
                        ×
                      </button>
                    </span>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setDiscountAmount(discountDraft(discountMinor));
                        setDiscountEditorOpen(true);
                      }}
                      className="flex items-center gap-1 hover:text-teal-700"
                    >
                      Descuento <Pencil size={12} className="text-teal-700" />
                    </button>
                    <span>{money(discountMinor)}</span>
                  </>
                )}
              </div>
              <div className="my-2 border-t" />
              <div className="flex justify-between text-lg font-semibold">
                <span>Total</span>
                <span className="text-teal-700">{money(total)}</span>
              </div>
              <div className="mt-2 flex justify-between font-semibold text-teal-700">
                <span>Pagado</span>
                <span>{money(paid)}</span>
              </div>
              {changeMinor ? (
                <div className="mt-2 flex items-center justify-between rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sky-950">
                  <span className="flex items-center gap-2 font-semibold">
                    <span className="grid h-7 w-7 place-items-center rounded-md bg-sky-100 text-sky-700">
                      <Banknote size={15} />
                    </span>
                    Cambio a entregar
                  </span>
                  <span className="text-base font-bold text-sky-700">
                    {money(changeMinor)}
                  </span>
                </div>
              ) : (
                <div className="mt-2 flex justify-between font-semibold">
                  <span>Pendiente</span>
                  <span
                    className={
                      paid >= total ? "text-teal-700" : "text-rose-600"
                    }
                  >
                    {money(Math.max(total - paid, 0))}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
        <footer className="mt-3 shrink-0 border-t border-slate-100 bg-white pt-3">
          <button
            type="button"
            disabled={
              !lines.length || paid < total || submitting || !pricingReady
            }
            onClick={() => void complete()}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-teal-700 py-3 text-base font-semibold text-white shadow-sm disabled:bg-slate-400"
          >
            <ShieldCheck size={17} />{" "}
            {submitting ? "Confirmando…" : "Confirmar venta"}
          </button>
        </footer>
      </aside>
      {paymentModalOpen && !resumeNeeded ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 p-4 backdrop-blur-sm">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="sale-payment-title"
            className="w-full max-w-xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
          >
            <header className="flex items-center justify-between border-b px-6 py-4">
              <div>
                <h2 id="sale-payment-title" className="font-semibold">
                  Cobro de la venta
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Confirmá los medios de pago para cerrar la operación.
                </p>
              </div>
              <button
                type="button"
                aria-label="Cerrar cobro"
                onClick={() => setPaymentModalOpen(false)}
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
              >
                ×
              </button>
            </header>
            <div className="p-6">
              <div className="text-center">
                <p className="text-xs font-medium text-teal-700">
                  TOTAL A COBRAR
                </p>
                <p className="mt-1 text-3xl font-semibold tracking-tight text-teal-700">
                  {money(total)}
                </p>
              </div>
              <div className="mt-5 grid grid-cols-3 divide-x border-y py-3 text-center text-xs">
                <div>
                  <p className="text-slate-500">Subtotal</p>
                  <p className="mt-1 font-semibold">{money(subtotal)}</p>
                </div>
                <div>
                  <p className="text-slate-500">Descuento</p>
                  <div className="mt-1 flex items-center justify-center gap-1.5">
                    <p className="font-semibold">{money(discountMinor)}</p>
                    <button
                      type="button"
                      aria-label="Editar descuento"
                      title="Editar descuento"
                      onClick={() => {
                        setDiscountAmount(discountDraft(discountMinor));
                        setDiscountEditorOpen((current) => !current);
                      }}
                      className="rounded p-1 text-teal-700 hover:bg-teal-50"
                    >
                      <Pencil size={13} />
                    </button>
                  </div>
                </div>
                <div>
                  <p className="text-slate-500">Saldo pendiente</p>
                  <p className="mt-1 font-semibold text-rose-600">
                    {money(Math.max(total - paid, 0))}
                  </p>
                </div>
              </div>
              {discountEditorOpen ? (
                <div className="mt-4 rounded-xl border border-teal-100 bg-teal-50/70 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-teal-900">
                        Descuento de la venta
                      </p>
                      <p className="mt-0.5 text-xs text-teal-800">
                        Se distribuye entre los productos de esta venta.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setDiscountEditorOpen(false)}
                      className="text-sm text-teal-800"
                    >
                      Cerrar
                    </button>
                  </div>
                  <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
                    <label className="discount-amount-field grid h-10 grid-cols-[36px_1fr]">
                      <span
                        aria-hidden="true"
                        className="grid place-items-center text-sm text-slate-500"
                      >
                        $
                      </span>
                      <DiscountAmountInput
                        className="min-w-0 border-0 px-3 text-sm"
                        value={discountAmount}
                        onChange={setDiscountAmount}
                        onApply={applyDiscount}
                        onCancel={() => setDiscountEditorOpen(false)}
                      />
                    </label>
                    <button
                      type="button"
                      onClick={applyDiscount}
                      className="border border-teal-700 bg-white px-4 text-sm font-medium text-teal-800"
                    >
                      Aplicar descuento
                    </button>
                  </div>
                </div>
              ) : null}
              <div className="mt-5 grid grid-cols-3 gap-2">
                {(
                  [
                    ["CASH", "Efectivo"],
                    ["TRANSFER", "Transferencia"],
                    ["CARD", "Tarjeta"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setMethod(value)}
                    className={`rounded-lg border px-2 py-2.5 text-xs font-medium ${method === value ? "border-teal-600 bg-teal-50 text-teal-800" : "border-slate-200 text-slate-600 hover:border-teal-200"}`}
                  >
                    {value === "CASH" ? (
                      <Banknote className="mx-auto mb-1" size={16} />
                    ) : (
                      <CreditCard className="mx-auto mb-1" size={16} />
                    )}
                    {label}
                  </button>
                ))}
              </div>
              {method !== "ACCOUNT" && !session ? (
                <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  {allowWithoutSession
                    ? "El cobro quedará pendiente de asignación a una caja."
                    : "Esta sucursal requiere una caja abierta para cobrar."}
                </p>
              ) : null}
              <label className="mt-5 block text-sm font-medium">
                Importe recibido
                <span className="mt-1 grid h-11 grid-cols-[42px_1fr] overflow-hidden rounded-lg border bg-white">
                  <span className="grid place-items-center border-r bg-slate-50 text-sm font-semibold text-slate-600">
                    $
                  </span>
                  <input
                    className="h-full min-w-0 border-0 px-3 text-sm"
                    type="text"
                    inputMode="decimal"
                    value={paymentAmount}
                    placeholder="Ej. 5000 o 5.000,00"
                    onChange={(event) => setPaymentAmount(event.target.value)}
                  />
                </span>
              </label>
              <button
                type="button"
                disabled={paid >= total}
                onClick={addPayment}
                className="mt-3 w-full border border-teal-700 py-2.5 text-sm font-medium text-teal-800 disabled:border-slate-200 disabled:text-slate-400"
              >
                {paymentAmount
                  ? paymentAmountMinor === undefined
                    ? "Ingresá un importe válido"
                    : `Agregar pago de ${money(paymentAmountMinor)}`
                  : `Agregar saldo pendiente: ${money(Math.max(total - paid, 0))}`}
              </button>
              <div className="mt-5">
                <p className="text-xs font-semibold text-slate-700">
                  Pagos agregados
                </p>
                <div className="mt-2 max-h-36 space-y-2 overflow-y-auto pr-1">
                  {payments.length ? (
                    payments.map((payment, index) => (
                      <div
                        key={`${payment.method}-${index}`}
                        className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2 text-sm"
                      >
                        <span>
                          {payment.method === "ACCOUNT"
                            ? "Cuenta corriente"
                            : payment.method === "TRANSFER"
                              ? "Transferencia"
                              : payment.method === "CARD"
                                ? "Tarjeta"
                                : "Efectivo"}
                        </span>
                        <span className="ml-auto font-medium">
                          {money(payment.amountMinor)}
                        </span>
                        <button
                          type="button"
                          aria-label={`Quitar pago de ${money(payment.amountMinor)}`}
                          onClick={() => removePayment(payment.method)}
                          className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-700"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))
                  ) : (
                    <p className="rounded-lg bg-slate-50 px-3 py-3 text-sm text-slate-500">
                      Todavía no agregaste pagos.
                    </p>
                  )}
                </div>
                {payments.length && paid < total ? (
                  <p className="mt-3 text-xs text-slate-500">
                    Podés elegir otro medio para completar un pago combinado.
                  </p>
                ) : null}
              </div>
              <div className="mt-5 rounded-lg border border-teal-100 bg-teal-50 px-4 py-3">
                <div className="flex justify-between text-sm font-semibold text-teal-900">
                  <span>{changeMinor ? "Cambio" : "Saldo pendiente"}</span>
                  <span>
                    {changeMinor
                      ? money(changeMinor)
                      : money(Math.max(total - paid, 0))}
                  </span>
                </div>
              </div>
            </div>
            <footer className="border-t bg-slate-50 px-6 py-4">
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setPaymentModalOpen(false)}
                  className="flex-1 border border-slate-300 bg-white py-2.5 text-sm font-medium text-slate-700"
                >
                  Volver a la venta
                </button>
                <button
                  type="button"
                  disabled={paid < total || submitting || !pricingReady}
                  onClick={() => void complete()}
                  className="flex-1 bg-teal-700 py-2.5 text-sm font-semibold text-white disabled:bg-slate-400"
                >
                  {submitting ? "Confirmando…" : "Confirmar venta"}
                </button>
              </div>
              <p className="mt-3 text-center text-[11px] text-slate-500">
                La venta se confirmará y se generará el comprobante.
              </p>
            </footer>
          </section>
        </div>
      ) : null}
      {receipt ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 p-4 backdrop-blur-sm">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="sale-confirmed-title"
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
          >
            <div className="flex size-12 items-center justify-center rounded-full bg-teal-100 text-teal-700">
              <ShieldCheck size={25} />
            </div>
            <h2
              id="sale-confirmed-title"
              className="mt-4 text-xl font-semibold"
            >
              Venta confirmada
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              Se registró correctamente un cobro de{" "}
              {money(receipt.sale.totalMinor)}.
            </p>
            <div className="mt-5 rounded-xl bg-slate-50 p-4 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Cliente</span>
                <span className="font-medium">{receipt.customerName}</span>
              </div>
              <div className="mt-2 flex justify-between">
                <span className="text-slate-500">Comprobante interno</span>
                <span className="font-mono text-xs">
                  {receipt.sale.id.slice(0, 8).toUpperCase()}
                </span>
              </div>
            </div>
            <p className="mt-4 text-xs text-slate-500">
              Podés imprimir el ticket ahora. La factura fiscal requiere
              integración con AFIP.
            </p>
            <div className="mt-6 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setReceipt(undefined)}
                className="border border-slate-300 py-2.5 text-sm font-medium text-slate-700"
              >
                Cerrar
              </button>
              <button
                type="button"
                onClick={printReceipt}
                className="bg-teal-700 py-2.5 text-sm font-semibold text-white"
              >
                Imprimir ticket
              </button>
            </div>
          </section>
        </div>
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
  stock,
  done,
  onError,
}: {
  token: string;
  organizationId: string;
  branchId: string;
  branches: BranchListItem[];
  products: CatalogProduct[];
  stock: StockLot[];
  done: () => void;
  onError: (value: string) => void;
}): ReactElement {
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [destinationBranchId, setDestinationBranchId] = useState("");
  const [lotId, setLotId] = useState("");
  const [quantity, setQuantity] = useState("1");
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
    const selectedLot = stock.find((lot) => lot.id === lotId);
    if (
      !selectedLot ||
      Number(quantity) < 1 ||
      Number(quantity) > selectedLot.quantity
    )
      return onError(
        "Indicá un lote y una cantidad disponible para transferir.",
      );
    try {
      await createTransfer(token, organizationId, branchId, {
        destinationBranchId,
        items: [{ lotId, quantity: Number(quantity) }],
      });
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
    }
  };
  const branchName = (id: string) =>
    branches.find((branch) => branch.id === id)?.name ?? "Sucursal desconocida";
  return (
    <div className="workspace-split mt-8 grid gap-6">
      <div className="border bg-white">
        {transfers.map((transfer) => {
          const action =
            transfer.status === "PREPARED" &&
            transfer.sourceBranchId === branchId
              ? "Despachar"
              : transfer.status === "IN_TRANSIT" &&
                  transfer.destinationBranchId === branchId
                ? "Recibir"
                : undefined;
          return (
            <article key={transfer.id} className="border-b p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-medium">{transfer.status}</p>
                  <p className="mt-1 text-sm text-slate-600">
                    {branchName(transfer.sourceBranchId)} →{" "}
                    {branchName(transfer.destinationBranchId)}
                  </p>
                </div>
                {action ? (
                  <button
                    type="button"
                    onClick={() => void advance(transfer)}
                    className="border border-teal-700 px-3 py-1.5 text-sm text-teal-800"
                  >
                    {action}
                  </button>
                ) : null}
              </div>
              <ul className="mt-3 text-sm text-slate-600">
                {transfer.items.map((item) => (
                  <li key={item.id}>
                    {products.find((product) => product.id === item.productId)
                      ?.name ?? "Producto"}{" "}
                    · {item.quantity} un.
                  </li>
                ))}
              </ul>
            </article>
          );
        })}
        {!transfers.length ? (
          <p className="p-5 text-sm text-slate-500">
            No hay transferencias para esta sucursal.
          </p>
        ) : null}
      </div>
      <form
        onSubmit={(event) => void create(event)}
        className="border bg-white p-5"
      >
        <h2 className="font-semibold">Nueva transferencia</h2>
        <label className="mt-4 block text-sm">
          Sucursal destino
          <select
            required
            value={destinationBranchId}
            onChange={(event) => setDestinationBranchId(event.target.value)}
            className="mt-1 h-10 w-full border px-3"
          >
            <option value="">Seleccionar…</option>
            {branches
              .filter((branch) => branch.active && branch.id !== branchId)
              .map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
          </select>
        </label>
        <label className="mt-4 block text-sm">
          Lote de origen
          <select
            required
            value={lotId}
            onChange={(event) => setLotId(event.target.value)}
            className="mt-1 h-10 w-full border px-3"
          >
            <option value="">Seleccionar…</option>
            {stock
              .filter((lot) => lot.quantity > 0)
              .map((lot) => (
                <option key={lot.id} value={lot.id}>
                  {lot.productName} · lote {lot.number} · {lot.quantity} un.
                </option>
              ))}
          </select>
        </label>
        <Input
          label="Cantidad"
          type="number"
          value={quantity}
          onChange={setQuantity}
        />
        <button className="mt-5 w-full bg-teal-700 py-2 text-sm text-white">
          Preparar transferencia
        </button>
      </form>
    </div>
  );
}

function Reports({
  token,
  organizationId,
  branchId,
  onError,
}: {
  token: string;
  organizationId: string;
  branchId: string;
  onError: (value: string) => void;
}): ReactElement {
  const [summary, setSummary] = useState<ReportSummary>();
  const [detail, setDetail] = useState<ReportDetail>();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const load = async () => {
    const [nextSummary, nextDetail] = await Promise.all([
      getReportSummary(token, organizationId, branchId),
      getReportDetail(
        token,
        organizationId,
        branchId,
        from || undefined,
        to || undefined,
      ),
    ]);
    setSummary(nextSummary);
    setDetail(nextDetail);
  };
  useEffect(() => {
    void load().catch((cause: unknown) =>
      onError(
        cause instanceof Error
          ? cause.message
          : "No se pudieron cargar los reportes.",
      ),
    );
  }, [branchId, onError, organizationId, token]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!summary || !detail)
    return (
      <p className="mt-8 border bg-white p-5 text-sm">Cargando reportes…</p>
    );
  const reportTotal = Number(detail.totalSalesMinor) / 100;
  const averageTicket = detail.saleCount ? reportTotal / detail.saleCount : 0;
  const topQuantity = Math.max(
    ...detail.topProducts.map((product) => product.quantity),
    1,
  );
  const trend = detail.dailySales.slice(-14);
  const trendMaximum = Math.max(
    ...trend.map((day) => Number(day.totalMinor)),
    1,
  );
  if (window.location.origin) {
    return (
      <div className="mt-7 space-y-5">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void load().catch((cause: unknown) =>
              onError(
                cause instanceof Error
                  ? cause.message
                  : "No se pudieron cargar los reportes.",
              ),
            );
          }}
          className="flex flex-wrap items-end justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
        >
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#315da8]">
              Período de análisis
            </p>
            <p className="mt-1 text-sm text-slate-500">
              Consultá el rendimiento comercial de la sucursal.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <Input
              label="Desde"
              type="date"
              value={from}
              onChange={setFrom}
              required={false}
              labelClassName="mt-0 text-xs text-slate-600"
              className="h-10 rounded-lg border-slate-300 text-sm"
            />
            <Input
              label="Hasta"
              type="date"
              value={to}
              onChange={setTo}
              required={false}
              labelClassName="mt-0 text-xs text-slate-600"
              className="h-10 rounded-lg border-slate-300 text-sm"
            />
            <button className="h-10 rounded-lg bg-[#315da8] px-4 text-sm font-semibold text-white hover:bg-[#254a88]">
              Actualizar
            </button>
          </div>
        </form>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            [
              "Ventas",
              String(detail.saleCount),
              "operaciones en rango",
              "#2d8a3f",
            ],
            [
              "Facturación",
              money(detail.totalSalesMinor),
              "monto total",
              "#315da8",
            ],
            [
              "Ticket promedio",
              money(Math.round(averageTicket * 100)),
              "por venta",
              "#7c3aed",
            ],
            [
              "Stock disponible",
              String(summary.stockUnits),
              "unidades en sucursal",
              "#0ea5c9",
            ],
          ].map(([label, value, note, color]) => (
            <article
              key={label}
              className="relative overflow-hidden rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_12px_26px_rgb(35_61_96_/_10%)]"
              style={{ borderTopWidth: 4, borderTopColor: color }}
            >
              <div
                className="absolute right-5 top-4 grid size-12 place-items-center rounded-2xl bg-slate-100"
                style={{ color }}
              >
                ●
              </div>
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                {label}
              </p>
              <p
                className="mt-2 pr-12 text-3xl font-bold tracking-tight"
                style={{ color }}
              >
                {value}
              </p>
              <p className="mt-1 text-xs font-medium text-slate-500">{note}</p>
            </article>
          ))}
        </div>
        <div className="grid gap-5 xl:grid-cols-[1.05fr_1fr]">
          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_12px_26px_rgb(35_61_96_/_8%)]">
            <p className="text-xs font-bold uppercase tracking-wide text-[#315da8]">
              Ranking
            </p>
            <h2 className="mt-1 text-2xl font-bold tracking-tight">
              Productos top
            </h2>
            <div className="mt-5 space-y-3">
              {detail.topProducts.length ? (
                detail.topProducts.map((product, index) => {
                  const palette = [
                    "#315da8",
                    "#16a34a",
                    "#f59e0b",
                    "#0ea5c9",
                    "#7c3aed",
                  ];
                  return (
                    <div key={product.productId}>
                      <div className="flex items-end justify-between gap-3 text-sm">
                        <div>
                          <p className="font-semibold">
                            {index + 1}. {product.productName}
                          </p>
                          <p className="text-xs text-slate-500">
                            {product.quantity} unidades
                          </p>
                        </div>
                      </div>
                      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${Math.max((product.quantity / topQuantity) * 100, 6)}%`,
                            backgroundColor: palette[index % palette.length],
                          }}
                        />
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="py-8 text-sm text-slate-500">
                  Todavía no hay ventas en el período.
                </p>
              )}
            </div>
          </section>
          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_12px_26px_rgb(35_61_96_/_8%)]">
            <p className="text-xs font-bold uppercase tracking-wide text-[#315da8]">
              Cobros
            </p>
            <h2 className="mt-1 text-2xl font-bold tracking-tight">
              Medios de pago
            </h2>
            <div className="mt-5 space-y-3">
              {detail.payments.length ? (
                detail.payments.map((payment) => (
                  <div
                    key={payment.method}
                    className="flex items-center justify-between rounded-2xl border border-[#d5e1f5] bg-[#f6f9ff] px-4 py-3"
                  >
                    <span className="font-semibold text-slate-700">
                      {payment.method}
                    </span>
                    <strong className="text-[#315da8]">
                      {money(payment.amountMinor)}
                    </strong>
                  </div>
                ))
              ) : (
                <p className="py-8 text-sm text-slate-500">
                  Sin cobros para el período.
                </p>
              )}
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-[#edf8f1] p-3">
                <p className="text-[10px] font-bold uppercase text-[#2d8a3f]">
                  Vencimientos
                </p>
                <p className="mt-1 text-xl font-bold">{summary.expiringLots}</p>
              </div>
              <div className="rounded-2xl bg-[#fff7eb] p-3">
                <p className="text-[10px] font-bold uppercase text-[#d97706]">
                  Compras pendientes
                </p>
                <p className="mt-1 text-xl font-bold">
                  {summary.pendingPurchases}
                </p>
              </div>
            </div>
          </section>
        </div>
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_12px_26px_rgb(35_61_96_/_8%)]">
          <p className="text-xs font-bold uppercase tracking-wide text-[#315da8]">
            Evolución
          </p>
          <h2 className="mt-1 text-2xl font-bold tracking-tight">
            Tendencia diaria
          </h2>
          <div className="mt-6 flex h-52 items-end gap-2">
            {trend.length ? (
              trend.map((day) => (
                <div
                  key={day.date}
                  className="flex h-full min-w-0 flex-1 flex-col justify-end text-center"
                >
                  <span className="mb-2 text-[10px] font-semibold text-[#2d8a3f]">
                    {money(day.totalMinor)}
                  </span>
                  <div
                    className="min-h-1 rounded-t-lg bg-gradient-to-t from-[#315da8] to-[#5a8df0]"
                    style={{
                      height: `${Math.max((Number(day.totalMinor) / trendMaximum) * 100, 1)}%`,
                    }}
                  />
                  <span className="mt-2 text-[10px] text-slate-500">
                    {new Date(`${day.date}T12:00:00`).toLocaleDateString(
                      "es-AR",
                      { day: "2-digit", month: "2-digit" },
                    )}
                  </span>
                </div>
              ))
            ) : (
              <p className="m-auto text-sm text-slate-500">
                No hay ventas para graficar.
              </p>
            )}
          </div>
        </section>
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_12px_26px_rgb(35_61_96_/_8%)]">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-[#315da8]">
                Control de caja
              </p>
              <h2 className="mt-1 text-2xl font-bold tracking-tight">
                Cierres por día y mes
              </h2>
            </div>
            <p className="text-sm text-slate-500">
              {detail.cashClosures.count} cierres en el período
            </p>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {[
              [
                "Efectivo esperado",
                detail.cashClosures.expectedMinor,
                "#315da8",
              ],
              ["Efectivo contado", detail.cashClosures.countedMinor, "#0f8a78"],
              [
                "Diferencia acumulada",
                detail.cashClosures.differenceMinor,
                "#e11d48",
              ],
            ].map(([label, amount, color]) => (
              <div key={label} className="rounded-2xl bg-slate-50 p-4">
                <p className="text-xs font-semibold text-slate-500">{label}</p>
                <p className="mt-2 text-xl font-bold" style={{ color }}>
                  {money(amount)}
                </p>
              </div>
            ))}
          </div>
          <div className="mt-5 grid gap-5 xl:grid-cols-2">
            <ClosureReportTable
              title="Por día"
              groups={detail.cashClosures.daily}
            />
            <ClosureReportTable
              title="Por mes"
              groups={detail.cashClosures.monthly}
              monthly
            />
          </div>
        </section>
      </div>
    );
  }
  return (
    <div className="mt-8 grid gap-4 md:grid-cols-3">
      {[
        ["Ventas de hoy", money(summary.salesTodayMinor)],
        ["Operaciones de venta", String(summary.salesTodayCount)],
        ["Unidades en stock", String(summary.stockUnits)],
        ["Lotes disponibles", String(summary.stockLots)],
        ["Vencimientos próximos", String(summary.expiringLots)],
        ["Compras pendientes", String(summary.pendingPurchases)],
        ["Cajas abiertas", String(summary.openCashSessions)],
      ].map(([label, value]) => (
        <article key={label} className="border bg-white p-5">
          <p className="text-sm text-slate-500">{label}</p>
          <p className="mt-3 text-xl font-semibold">{value}</p>
        </article>
      ))}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void load().catch((cause: unknown) =>
            onError(
              cause instanceof Error
                ? cause.message
                : "No se pudieron cargar los reportes.",
            ),
          );
        }}
        className="mt-6 flex flex-wrap items-end gap-3 border bg-white p-4"
      >
        <Input
          label="Desde"
          type="date"
          value={from}
          onChange={setFrom}
          required={false}
        />
        <Input
          label="Hasta"
          type="date"
          value={to}
          onChange={setTo}
          required={false}
        />
        <button className="h-10 bg-teal-700 px-4 text-sm text-white">
          Actualizar
        </button>
      </form>
      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <section className="border bg-white p-5">
          <h2 className="font-semibold">
            Medios de venta (incluye financiación)
          </h2>
          {detail.payments.map((payment) => (
            <p
              key={payment.method}
              className="mt-3 flex justify-between text-sm"
            >
              <span>{payment.method}</span>
              <span>{money(payment.amountMinor)}</span>
            </p>
          ))}
          <p className="mt-4 border-t pt-3 text-sm font-semibold">
            {detail.saleCount} ventas · {money(detail.totalSalesMinor)}
          </p>
        </section>
        <section className="border bg-white p-5">
          <h2 className="font-semibold">Productos más vendidos</h2>
          {detail.topProducts.map((product) => (
            <p
              key={product.productId}
              className="mt-3 flex justify-between text-sm"
            >
              <span>{product.productName}</span>
              <span>{product.quantity} un.</span>
            </p>
          ))}
        </section>
        <section className="border bg-white p-5">
          <h2 className="font-semibold">Ventas por día</h2>
          {detail.dailySales.map((day) => (
            <p key={day.date} className="mt-3 flex justify-between text-sm">
              <span>
                {new Date(`${day.date}T12:00:00`).toLocaleDateString("es-AR")}
              </span>
              <span>{money(day.totalMinor)}</span>
            </p>
          ))}
        </section>
        <section className="border bg-white p-5">
          <h2 className="font-semibold">Vencimientos próximos</h2>
          {detail.expiring.map((lot) => (
            <p
              key={`${lot.productName}-${lot.lotNumber}`}
              className="mt-3 flex justify-between text-sm"
            >
              <span>
                {lot.productName} · {lot.lotNumber}
              </span>
              <span>{lot.quantity} un.</span>
            </p>
          ))}
          <p className="mt-4 border-t pt-3 text-sm">
            Valor de costo en stock: {money(detail.stockCostMinor)}
          </p>
        </section>
      </div>
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
        className="border bg-white p-5"
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
        className="border bg-white p-5"
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

function ClosureReportTable({
  title,
  groups,
  monthly = false,
}: {
  title: string;
  groups: {
    period: string;
    count: number;
    expectedMinor: string;
    countedMinor: string;
    differenceMinor: string;
  }[];
  monthly?: boolean;
}): ReactElement {
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-100">
      <h3 className="border-b px-4 py-3 text-sm font-semibold">{title}</h3>
      {groups.length ? (
        <table className="w-full min-w-[400px] text-sm">
          <thead className="text-left text-[11px] uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2">Período</th>
              <th className="px-2 py-2 text-right">Cierres</th>
              <th className="px-2 py-2 text-right">Esperado</th>
              <th className="px-4 py-2 text-right">Diferencia</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => (
              <tr key={group.period} className="border-t border-slate-100">
                <td className="px-4 py-2.5">
                  {monthly
                    ? new Date(
                        `${group.period}-01T12:00:00`,
                      ).toLocaleDateString("es-AR", {
                        month: "long",
                        year: "numeric",
                      })
                    : new Date(`${group.period}T12:00:00`).toLocaleDateString(
                        "es-AR",
                      )}
                </td>
                <td className="px-2 py-2.5 text-right">{group.count}</td>
                <td className="px-2 py-2.5 text-right">
                  {money(group.expectedMinor)}
                </td>
                <td
                  className={`px-4 py-2.5 text-right font-semibold ${
                    group.differenceMinor === "0"
                      ? "text-teal-700"
                      : "text-rose-600"
                  }`}
                >
                  {money(group.differenceMinor)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="px-4 py-5 text-sm text-slate-500">
          Sin cierres para este período.
        </p>
      )}
    </div>
  );
}

function Cash({
  active,
  branchName,
  toolbarTarget,
  token,
  organizationId,
  branchId,
  registers,
  session,
  done,
  error,
}: {
  active: boolean;
  branchName?: string;
  toolbarTarget: HTMLDivElement | null;
  token: string;
  organizationId: string;
  branchId: string;
  registers: CashRegister[];
  session?: CashSession;
  done: () => void;
  error: (value: string) => void;
}): ReactElement {
  const [registerId, setRegisterId] = useState("");
  const [opening, setOpening] = useState("");
  const [cashBusy, setCashBusy] = useState(false);
  const cashPending = useRef(false);
  const movementRequest = useRef<{ signature: string; id: string } | null>(
    null,
  );
  const [movementType, setMovementType] = useState<"IN" | "OUT">("IN");
  const [movementAmount, setMovementAmount] = useState("");
  const [movementReason, setMovementReason] = useState("");
  const [closures, setClosures] = useState<CashClosure[]>([]);
  const [closureDetailId, setClosureDetailId] = useState<string>();
  const [management, setManagement] = useState<CashManagement>();
  const [rules, setRules] = useState<CashSettings>();
  useEffect(() => {
    if (rules?.defaultRegisterId) setRegisterId(rules.defaultRegisterId);
  }, [rules?.defaultRegisterId]);
  const [archived, setArchived] = useState(false);
  const [closureFrom, setClosureFrom] = useState("");
  const [closureTo, setClosureTo] = useState("");
  const closureRequest = useRef(0);
  useEffect(() => {
    if (active) done();
  }, [active]); // eslint-disable-line react-hooks/exhaustive-deps
  const loadClosures = async () => {
    const request = ++closureRequest.current;
    const rows = await getCashClosures(
      token,
      organizationId,
      branchId,
      closureFrom || undefined,
      closureTo || undefined,
      archived,
    );
    if (request === closureRequest.current) setClosures(rows);
  };
  useEffect(() => {
    if (!registers.some((register) => register.id === registerId))
      setRegisterId(registers[0]?.id ?? "");
  }, [registerId, registers]);
  useEffect(() => {
    let cancelled = false;
    if (!active) return;
    void Promise.all([
      getCashManagement(token, organizationId, branchId),
      cashSettingsRequest(token, organizationId, branchId),
    ])
      .then(([value, settings]) => {
        if (!cancelled) {
          setManagement(value);
          setRules(settings);
        }
      })
      .catch((cause: unknown) => {
        if (!cancelled)
          error(
            cause instanceof Error
              ? cause.message
              : "No se pudo cargar la gestión de cajas.",
          );
      });
    return () => {
      cancelled = true;
    };
  }, [token, organizationId, branchId, registers, active]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!active) return;
    void loadClosures().catch((cause: unknown) =>
      error(
        cause instanceof Error
          ? cause.message
          : "No se pudieron cargar los cierres.",
      ),
    );
  }, [branchId, organizationId, token, archived, active]); // eslint-disable-line react-hooks/exhaustive-deps
  const open = async (event: FormEvent) => {
    event.preventDefault();
    if (cashPending.current) return;
    const openingAmount =
      rules?.askOpeningAmount === false ? 0 : Number(opening);
    if (!registerId) {
      error("Seleccioná una caja para abrir la sesión.");
      return;
    }
    if (!Number.isFinite(openingAmount) || openingAmount < 0) {
      error("Ingresá un fondo inicial válido.");
      return;
    }
    cashPending.current = true;
    setCashBusy(true);
    try {
      await openCashSession(
        token,
        organizationId,
        branchId,
        registerId,
        Math.round(openingAmount * 100),
      );
      done();
    } catch (cause) {
      error(
        cause instanceof Error ? cause.message : "No se pudo abrir la caja.",
      );
    } finally {
      cashPending.current = false;
      setCashBusy(false);
    }
  };
  const movement = async (event: FormEvent) => {
    event.preventDefault();
    if (!session || cashPending.current) return;
    const signature = JSON.stringify([
      session.id,
      movementType,
      movementAmount,
      movementReason.trim(),
    ]);
    if (movementRequest.current?.signature !== signature)
      movementRequest.current = { signature, id: crypto.randomUUID() };
    cashPending.current = true;
    setCashBusy(true);
    try {
      await createCashMovement(token, organizationId, branchId, session.id, {
        clientOperationId: movementRequest.current.id,
        type: movementType,
        amountMinor: Math.round(Number(movementAmount) * 100),
        reason: movementReason,
      });
      movementRequest.current = null;
      setMovementType("IN");
      setMovementAmount("");
      setMovementReason("");
      done();
    } catch (cause) {
      error(
        cause instanceof Error
          ? cause.message
          : "No se pudo registrar el movimiento de caja.",
      );
    } finally {
      cashPending.current = false;
      setCashBusy(false);
    }
  };
  return (
    <div className={active ? "cash-workspace" : "hidden"}>
      {active &&
        management?.canManage &&
        toolbarTarget &&
        createPortal(
          <RegisterManager
            branchName={branchName}
            token={token}
            organizationId={organizationId}
            branchId={branchId}
            registers={management.registers}
            done={done}
          />,
          toolbarTarget,
        )}
      <CashOverview
        session={session}
        closedDetails={
          active && registerId ? (
            <CashLatestClosure
              key={`${organizationId}:${branchId}:${registerId}`}
              token={token}
              organizationId={organizationId}
              branchId={branchId}
              registerId={registerId}
              refreshKey={closures}
              onView={setClosureDetailId}
            />
          ) : undefined
        }
        registerName={
          registers.find(
            (item) => item.id === (session?.cashRegisterId ?? registerId),
          )?.name
        }
      />
      <section className="cash-card cash-close">
        <div className="cash-card-heading">
          <span className="cash-icon bg-amber-50 text-amber-600">
            <CashRegisterIcon size={20} />
          </span>
          <h2>{session ? "Cierre pendiente" : "Abrir caja"}</h2>
          <CashPendingCollections
            token={token}
            organizationId={organizationId}
            branchId={branchId}
            registers={registers}
            canManage={Boolean(management?.canManage)}
            active={active}
            onAssigned={done}
          />
        </div>
        {session ? (
          <CashCloseForm
            key={session.id}
            session={session}
            token={token}
            organizationId={organizationId}
            branchId={branchId}
            disabled={!management?.canManage || cashBusy}
            onClosed={() => {
              done();
              void loadClosures().catch(() =>
                error(
                  "El cierre se guardó, pero no se pudo actualizar el historial.",
                ),
              );
            }}
          />
        ) : (
          <form onSubmit={(event) => void open(event)}>
            <label className="mt-4 block text-sm">
              Caja
              <select
                required
                className="mt-1 h-10 w-full border px-3"
                value={registerId}
                onChange={(event) => setRegisterId(event.target.value)}
              >
                <option value="">Seleccionar…</option>
                {registers.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            {rules?.askOpeningAmount !== false && (
              <Input
                label="Fondo inicial"
                type="number"
                value={opening}
                onChange={setOpening}
              />
            )}
            <button
              disabled={cashBusy || !management?.canManage}
              className="mt-5 w-full bg-teal-700 py-2 text-sm text-white disabled:opacity-50"
            >
              Abrir caja
            </button>
          </form>
        )}
      </section>
      {session &&
      management?.canManage &&
      rules?.allowManualMovements !== false ? (
        <form
          onSubmit={(event) => void movement(event)}
          className="cash-card cash-manual"
        >
          <div className="cash-card-heading">
            <span className="cash-icon bg-slate-50 text-slate-500">
              <ArrowLeftRight size={20} />
            </span>
            <h2>Movimiento manual</h2>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Registrá ingresos o egresos de efectivo en la caja actual.
          </p>
          <div
            className="cash-movement-toggle"
            role="group"
            aria-label="Tipo de movimiento"
          >
            <button
              type="button"
              aria-pressed={movementType === "IN"}
              onClick={() => setMovementType("IN")}
            >
              ↑ Ingreso de efectivo
            </button>
            <button
              type="button"
              aria-pressed={movementType === "OUT"}
              onClick={() => setMovementType("OUT")}
            >
              ↓ Egreso de efectivo
            </button>
          </div>
          <div className="grid gap-x-3 sm:grid-cols-2">
            <Input
              label="Importe"
              type="number"
              value={movementAmount}
              onChange={setMovementAmount}
            />
            <Input
              label="Motivo"
              required={rules?.requireMovementReason !== false}
              value={movementReason}
              onChange={setMovementReason}
            />
          </div>
          <button
            disabled={cashBusy}
            className="mt-5 w-full bg-teal-700 py-2 text-sm text-white disabled:opacity-50"
          >
            {cashBusy
              ? "Guardando…"
              : movementType === "IN"
                ? "Registrar ingreso"
                : "Registrar egreso"}
          </button>
        </form>
      ) : (
        <section className="cash-card cash-manual">
          <div className="cash-card-heading">
            <span className="cash-icon">
              <ArrowLeftRight size={20} />
            </span>
            <h2>Movimiento manual</h2>
          </div>
          <p className="py-8 text-sm text-slate-500">
            {session
              ? rules?.allowManualMovements === false
                ? "Los movimientos manuales están deshabilitados en esta sucursal."
                : "No tenés permiso para registrar movimientos de caja."
              : "Abrí una caja para registrar ingresos y egresos."}
          </p>
        </section>
      )}
      <CashMovements key={session?.id ?? "closed"} session={session} />
      <section className="cash-card cash-closures">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 font-semibold">
              <History size={19} className="text-teal-700" />
              Historial de cierres
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Consultá el efectivo esperado, contado y la diferencia por cada
              cierre.
            </p>
          </div>
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void loadClosures().catch((cause: unknown) =>
                error(
                  cause instanceof Error
                    ? cause.message
                    : "No se pudieron cargar los cierres.",
                ),
              );
            }}
          >
            <Input
              label="Desde"
              type="date"
              value={closureFrom}
              onChange={setClosureFrom}
              required={false}
              className="h-9"
              labelClassName="mt-0 text-xs"
            />
            <Input
              label="Hasta"
              type="date"
              value={closureTo}
              onChange={setClosureTo}
              required={false}
              className="h-9"
              labelClassName="mt-0 text-xs"
            />
            {management?.canArchive && (
              <label className="block text-xs text-slate-500">
                Estado
                <select
                  aria-label="Estado de los cierres"
                  className="mt-1 h-9 w-full min-w-32 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/15"
                  value={archived ? "archived" : "visible"}
                  onChange={(event) => {
                    setClosures([]);
                    setArchived(event.target.value === "archived");
                  }}
                >
                  <option value="visible">Visibles</option>
                  <option value="archived">Eliminados</option>
                </select>
              </label>
            )}
            <button className="h-9 bg-teal-700 px-4 text-sm text-white">
              Ver cierres
            </button>
          </form>
        </div>
        <div className="mt-5 overflow-x-auto">
          {closures.length ? (
            <table className="w-full min-w-[680px] text-left text-sm">
              <thead className="border-y text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-2 py-3">Cierre</th>
                  <th className="px-2 py-3">Caja</th>
                  <th className="px-2 py-3">Responsable</th>
                  <th className="px-2 py-3 text-right">Esperado</th>
                  <th className="px-2 py-3 text-right">Contado</th>
                  <th className="px-2 py-3 text-right">Diferencia</th>
                  <th className="w-px whitespace-nowrap px-2 py-3 text-center">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody>
                {closures.map((closure) => (
                  <tr key={closure.id} className="border-b">
                    <td className="px-2 py-3">
                      {new Date(closure.closedAt!).toLocaleString("es-AR")}
                    </td>
                    <td className="px-2 py-3">{closure.cashRegisterName}</td>
                    <td className="px-2 py-3 text-xs text-slate-500">
                      {cashResponsibleLabel(closure)}
                    </td>
                    <td className="px-2 py-3 text-right">
                      {money(closure.expectedAmountMinor)}
                    </td>
                    <td className="px-2 py-3 text-right">
                      {money(closure.closingAmountMinor ?? "0")}
                    </td>
                    <td
                      className={`px-2 py-3 text-right font-semibold ${
                        closure.differenceMinor === "0"
                          ? "text-teal-700"
                          : "text-rose-600"
                      }`}
                    >
                      {money(closure.differenceMinor ?? "0")}
                    </td>
                    <td className="px-2 py-3">
                      <div className="flex items-center justify-end gap-2 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => setClosureDetailId(closure.id)}
                          className="inline-flex h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-600 shadow-sm transition hover:border-teal-200 hover:bg-teal-50 hover:text-teal-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600"
                        >
                          <Eye size={15} aria-hidden /> Ver cierre
                        </button>
                        {management?.canArchive && (
                          <ClosureVisibility
                            key={`${closure.id}-${archived}`}
                            token={token}
                            organizationId={organizationId}
                            branchId={branchId}
                            id={closure.id}
                            label={`${closure.cashRegisterName} · ${new Date(closure.closedAt!).toLocaleString("es-AR")}`}
                            archived={archived}
                            done={() => {
                              void loadClosures().catch((cause: unknown) =>
                                error(
                                  cause instanceof Error
                                    ? cause.message
                                    : "No se pudieron actualizar los cierres.",
                                ),
                              );
                            }}
                          />
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="py-5 text-sm text-slate-500">
              No hay cierres para el período seleccionado.
            </p>
          )}
        </div>
      </section>
      {active && closureDetailId && (
        <CashClosureDetail
          key={closureDetailId}
          token={token}
          organizationId={organizationId}
          branchId={branchId}
          id={closureDetailId}
          onClose={() => setClosureDetailId(undefined)}
        />
      )}
    </div>
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
