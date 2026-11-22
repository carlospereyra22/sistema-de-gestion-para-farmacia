import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { SalesModule } from "../sales/sales.module";
import { PreventaComisionesService } from "./preventa-comisiones.service";
import { PreventaPedidosService } from "./preventa-pedidos.service";
import { PreventaController } from "./preventa.controller";
import { PreventaService } from "./preventa.service";

/**
 * Preventa (SISTEMA-108): pedidos del preventista, reparto, cobros,
 * comisiones y cartera de clientes. Ver docs/PREVENTA.md.
 */
@Module({
  imports: [AuthModule, SalesModule],
  controllers: [PreventaController],
  providers: [
    PreventaService,
    PreventaPedidosService,
    PreventaComisionesService,
  ],
  // La pantalla Pedidos (SISTEMA-119) lee los pedidos con este servicio.
  exports: [PreventaPedidosService],
})
export class PreventaModule {}
