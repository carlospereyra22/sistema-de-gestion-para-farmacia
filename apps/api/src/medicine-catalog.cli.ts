import { readFile } from "node:fs/promises";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";

import type { CatalogImportRecord } from "./catalog/medicine-catalog.service";
import type { Monografia } from "./catalog/monografias";

// Comando de servidor para la base de medicamentos (SISTEMA-26). Uso:
//   pnpm --filter @gestion/api catalogo-medicamentos estado
//   pnpm --filter @gestion/api catalogo-medicamentos importar <archivo.jsonl>
//   pnpm --filter @gestion/api catalogo-medicamentos actualizar
//   pnpm --filter @gestion/api catalogo-medicamentos guias
// `actualizar` lee Precios de Remedios y AlfaBeta sin tocar productos.
// `guias` carga las guías por principio activo (SISTEMA-108).
// `dosis-marcas` completa la dosis de las marcas cargadas sin dosis escrita.
// `monografias <archivo.json>` carga las fichas de PR Vademécum (SISTEMA-123),
// armadas con scripts/medicine-catalog/prvademecum.py.
const USO =
  "Uso: catalogo-medicamentos <estado | importar <archivo.jsonl> | actualizar | guias | dosis-marcas | monografias <archivo.json>>";

async function main(): Promise<void> {
  // Sin temporizador: este proceso sólo ejecuta el comando y termina.
  process.env.PRICE_REFRESH_SCHEDULER = "off";
  process.env.SUBSCRIPTION_SCHEDULER = "off";
  process.env.CATALOG_APORTES_SCHEDULER = "off";
  process.env.MEDICINE_PHOTOS_SCHEDULER = "off";
  process.env.FISCAL_QUEUE_WORKER = "off";
  const [command, argument] = process.argv.slice(2);
  if (!command) throw new Error(USO);
  const { AppModule } = await import("./app.module");
  const { MedicineCatalogService } =
    await import("./catalog/medicine-catalog.service");
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ["error", "warn", "log"],
  });
  try {
    const service = app.get(MedicineCatalogService);
    const logger = new Logger("catalogo-medicamentos");
    switch (command) {
      case "estado":
        logger.log(JSON.stringify(await service.summary()));
        break;
      case "importar": {
        if (!argument) throw new Error(USO);
        const records = (await readFile(argument, "utf8"))
          .split("\n")
          .filter((line) => line.trim())
          .map((line) => JSON.parse(line) as CatalogImportRecord);
        logger.log(JSON.stringify(await service.importRecords(records)));
        break;
      }
      case "actualizar": {
        const started = Date.now();
        const result = await service.refreshLinkedSources();
        logger.log(
          `${JSON.stringify(result)} en ${Math.round((Date.now() - started) / 1000)} s`,
        );
        break;
      }
      // Guías por principio activo (SISTEMA-108): descarga el padrón y carga
      // acción, vía y las dosis orientativas del archivo versionado.
      case "guias": {
        const { MedicineReferenceService } =
          await import("./catalog/medicine-reference.service");
        const { payload } = await app
          .get(MedicineReferenceService)
          .downloadOfficialData();
        logger.log(JSON.stringify(await service.actualizarGuias(payload)));
        break;
      }
      // Dosis de las marcas cargadas que el padrón no escribe (SISTEMA-108).
      case "dosis-marcas": {
        logger.log(
          JSON.stringify(
            await service.completarDosisDeMarcas((mensaje) =>
              logger.log(mensaje),
            ),
          ),
        );
        break;
      }
      case "monografias": {
        if (!argument) throw new Error(USO);
        const { MonografiasService } =
          await import("./catalog/monografias.service");
        const fichas = JSON.parse(
          await readFile(argument, "utf8"),
        ) as Monografia[];
        logger.log(
          JSON.stringify(await app.get(MonografiasService).importar(fichas)),
        );
        break;
      }
      default:
        throw new Error(USO);
    }
  } finally {
    await app.close();
  }
}

main().catch((cause: unknown) => {
  console.error(cause instanceof Error ? cause.message : cause);
  process.exitCode = 1;
});
