import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { CashModule } from "../cash/cash.module";
import { ReportAccessService } from "./report-access.service";
import { ReportFiltersController } from "./report-filters.controller";
import { ReportOverviewService } from "./report-overview.service";
import { ReportSalesData } from "./report-sales-data";
import { ReportSalesService } from "./report-sales.service";
import { ReportsController } from "./reports.controller";
import { ReportsService } from "./reports.service";
@Module({
  imports: [AuthModule, CashModule],
  controllers: [ReportsController, ReportFiltersController],
  providers: [
    ReportsService,
    ReportAccessService,
    ReportOverviewService,
    ReportSalesData,
    ReportSalesService,
  ],
  exports: [ReportAccessService],
})
export class ReportsModule {}
