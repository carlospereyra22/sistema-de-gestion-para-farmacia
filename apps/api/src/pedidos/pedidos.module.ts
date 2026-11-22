import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { CatalogoOnlineModule } from "../catalogo-online/catalogo-online.module";
import { PreventaModule } from "../preventa/preventa.module";
import { PedidosController } from "./pedidos.controller";
import { PedidosService } from "./pedidos.service";

/**
 * Pantalla Pedidos (SISTEMA-119): lee los pedidos del catálogo online y de
 * preventa con los servicios de cada módulo. No escribe pedidos.
 */
@Module({
  imports: [AuthModule, CatalogoOnlineModule, PreventaModule],
  controllers: [PedidosController],
  providers: [PedidosService],
})
export class PedidosModule {}
