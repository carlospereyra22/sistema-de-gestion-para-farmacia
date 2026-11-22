import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { ReportProfitability } from "@gestion/contracts";
import { PrismaService } from "../prisma/prisma.service";
import { ReportAccessService } from "./report-access.service";
import type { ReportFiltersQuery } from "./report-filters.dto";
import {
  divideRounded,
  kpi,
  sharePct,
  trendBuckets,
  unavailableKpi,
} from "./report-math";
import type { ReportRange } from "./report-period";
import {
  netOf,
  profitOf,
  ReportSalesData,
  returnsWhere,
  salesWhere,
  sumTotals,
  TZ,
} from "./report-sales-data";
import {
  marginPct,
  profitBy,
  profitRow,
  reportMeta,
  rejectFilters,
  requireAccess,
  trendUnitOf,
} from "./report-tab-helpers";

/** Margen objetivo: por debajo, el producto aparece en las alertas. */
export const MARGIN_TARGET_PCT = 20;
/** Para la alerta de margen bajo, un producto tiene que haberse vendido algo. */
const MIN_UNITS_FOR_ALERT = 2;

/**
 * Pestaña Rentabilidad (SISTEMA-116). Ganancia bruta **estimada** con el costo
 * del lote vendido; las ventas sin lote (conceptos manuales) no tienen costo y
 * quedan fuera del margen. No es ganancia neta: no descuenta gastos fijos.
 */
@Injectable()
export class ReportProfitabilityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ReportAccessService,
    private readonly salesData: ReportSalesData,
  ) {}

  async profitability(
    actorId: string,
    organizationId: string,
    query: ReportFiltersQuery,
    now = new Date(),
  ): Promise<ReportProfitability> {
    rejectFilters(query, ["granularity"], "Rentabilidad");
    const scope = await this.access.scope(actorId, organizationId, query, now);
    requireAccess(scope.access, "profitability");
    const { period, branchIds } = scope;
    const unit = trendUnitOf(query, period);
    const sales = (range: ReportRange) =>
      salesWhere(organizationId, branchIds, range);
    const returns = (range: ReportRange) =>
      returnsWhere(organizationId, branchIds, range);
    const previous = period.previous;
    const bucket = (column: Prisma.Sql) =>
      Prisma.sql`to_char(date_trunc(${unit}, ${column} AT TIME ZONE ${TZ}), 'YYYY-MM-DD')`;

    const [
      current,
      before,
      trend,
      products,
      categories,
      branchesNow,
      branchesBefore,
      names,
    ] = await Promise.all([
      this.salesData.branchTotals(sales(period), returns(period)),
      previous
        ? this.salesData.branchTotals(sales(previous), returns(previous))
        : null,
      profitBy(
        this.prisma,
        bucket(Prisma.sql`s."completedAt"`),
        sales(period),
        returns(period),
        Prisma.empty,
        bucket(Prisma.sql`cr."createdAt"`),
      ),
      profitBy(
        this.prisma,
        Prisma.sql`p.id::text`,
        sales(period),
        returns(period),
      ),
      profitBy(
        this.prisma,
        Prisma.sql`coalesce(p."categoryId"::text, 'none')`,
        sales(period),
        returns(period),
      ),
      profitBy(
        this.prisma,
        Prisma.sql`s."branchId"::text`,
        sales(period),
        returns(period),
      ),
      previous
        ? profitBy(
            this.prisma,
            Prisma.sql`s."branchId"::text`,
            sales(previous),
            returns(previous),
          )
        : null,
      Promise.all([
        this.prisma.category.findMany({
          where: { organizationId },
          select: { id: true, name: true },
        }),
        this.prisma.branch.findMany({
          where: { id: { in: branchIds } },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        }),
      ]),
    ]);
    const [categoryNames, branches] = names;
    const productNames = new Map(
      (
        await this.prisma.product.findMany({
          where: { id: { in: [...products.keys()] } },
          select: { id: true, name: true },
        })
      ).map((product) => [product.id, product.name]),
    );
    const categoryName = new Map(
      categoryNames.map((item) => [item.id, item.name]),
    );

    const total = sumTotals(current.values());
    const prior = before ? sumTotals(before.values()) : null;
    const profit = profitOf(total);
    const margin = marginPct(profit, total.costedSales);
    const previousMargin = prior
      ? marginPct(profitOf(prior), prior.costedSales)
      : null;
    const coverage = sharePct(total.costedSales, netOf(total));
    const warnings =
      coverage !== null && coverage < 100
        ? [
            `El margen se calcula sobre el ${coverage.toLocaleString("es-AR")} % de las ventas: el resto no tiene costo de lote (conceptos manuales).`,
          ]
        : [];

    const productRows = [...products]
      .map(([id, totals]) =>
        profitRow(id, productNames.get(id) ?? "Producto", totals),
      )
      .filter((row) => row.units > 0);
    const byProfit = (
      left: { profitMinor: string },
      right: { profitMinor: string },
    ) => (BigInt(right.profitMinor) > BigInt(left.profitMinor) ? 1 : -1);
    const branchProfit = (id: string) => {
      const totals = branchesNow.get(id);
      return totals ? totals.netSales - totals.cost : 0n;
    };

    return {
      meta: reportMeta("profitability", scope, now, warnings),
      kpis: {
        grossProfit: kpi("money", profit, prior ? profitOf(prior) : null, {
          estimated: true,
        }),
        marginPct:
          margin === null
            ? unavailableKpi("percent", "NO_DATA")
            : {
                ...kpi("percent", 0, null, { estimated: true }),
                value: margin.toString(),
                previous: previousMargin?.toString() ?? null,
                changePct: null,
                changePp:
                  previousMargin === null
                    ? null
                    : Math.round((margin - previousMargin) * 10) / 10,
              },
        costOfSales: kpi("money", total.cost, prior?.cost ?? null, {
          estimated: true,
        }),
        profitPerTicket: total.tickets
          ? kpi(
              "money",
              divideRounded(profit, total.tickets)!,
              prior?.tickets
                ? divideRounded(profitOf(prior), prior.tickets)
                : null,
              { estimated: true },
            )
          : unavailableKpi("money", "NO_DATA"),
      },
      charts: {
        trendUnit: unit,
        trend: trendBuckets(period, unit).map((key) => {
          const row = trend.get(key);
          const value = row ? row.netSales - row.cost : 0n;
          return {
            bucket: key,
            profitMinor: value.toString(),
            netSalesMinor: (row?.netSales ?? 0n).toString(),
            marginPct: row ? marginPct(value, row.netSales) : null,
          };
        }),
        products: productRows.sort(byProfit).slice(0, 20),
        categories: [...categories]
          .map(([id, totals]) =>
            profitRow(
              id === "none" ? null : id,
              id === "none"
                ? "Sin categoría"
                : (categoryName.get(id) ?? "Categoría"),
              totals,
            ),
          )
          .filter((row) => row.netSalesMinor !== "0")
          .sort(byProfit),
      },
      tables: {
        branches: branches.map((branch) => {
          const totals = branchesNow.get(branch.id) ?? {
            netSales: 0n,
            cost: 0n,
            units: 0,
          };
          const row = profitRow(branch.id, branch.name, totals);
          const old = branchesBefore?.get(branch.id);
          const oldMargin = old
            ? marginPct(old.netSales - old.cost, old.netSales)
            : null;
          return {
            ...row,
            previousMarginPct: oldMargin,
            changePp:
              row.marginPct === null || oldMargin === null
                ? null
                : Math.round((row.marginPct - oldMargin) * 10) / 10,
            sharePct: sharePct(branchProfit(branch.id), profit),
          };
        }),
        lowMargin: productRows
          .filter(
            (row) =>
              row.units >= MIN_UNITS_FOR_ALERT &&
              row.marginPct !== null &&
              row.marginPct < MARGIN_TARGET_PCT,
          )
          .sort((left, right) => left.marginPct! - right.marginPct!)
          .slice(0, 15),
        marginTargetPct: MARGIN_TARGET_PCT,
        costCoveragePct: coverage,
      },
    };
  }
}
