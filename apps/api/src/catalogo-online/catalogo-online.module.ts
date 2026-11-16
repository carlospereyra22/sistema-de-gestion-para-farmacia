import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { LimiteDeLogin } from "../auth/limite-login";
import { CatalogoOnlineController } from "./catalogo-online.controller";
import { CatalogoOnlineService } from "./catalogo-online.service";
import { CatalogoPublicoController } from "./catalogo-publico.controller";
import { CatalogoPublicoService } from "./catalogo-publico.service";

/**
 * Catálogo online (SISTEMA-107): página pública con los productos de la
 * farmacia, usuarios del portal y pedidos. Ver docs/CATALOGO_ONLINE.md.
 */
@Module({
  imports: [AuthModule],
  controllers: [CatalogoOnlineController, CatalogoPublicoController],
  providers: [CatalogoOnlineService, CatalogoPublicoService, LimiteDeLogin],
})
export class CatalogoOnlineModule {}
