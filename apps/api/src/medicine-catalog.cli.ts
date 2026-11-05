import { readFile } from "node:fs/promises";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";

import type { CatalogImportRecord } from "./catalog/medicine-catalog.service";

// Comando de servidor para la base de medicamentos (SISTEMA-26). Uso:
//   pnpm --filter @gestion/api catalogo-medicamentos estado
//   pnpm --filter @gestion/api catalogo-medicamentos importar <archivo.jsonl>
//   pnpm --filter @gestion/api catalogo-medicamentos actualizar
// `actualizar` lee Precios de Remedios y AlfaBeta sin tocar productos.
const USO =
  "Uso: catalogo-medicamentos <estado | importar <archivo.jsonl> | actualizar>";

async function main(): Promise<void> {
  // Sin temporizador: este proceso sólo ejecuta el comando y termina.
  process.env.PRICE_REFRESH_SCHEDULER = "off";
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
