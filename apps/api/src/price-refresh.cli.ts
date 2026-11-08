import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";

// Comando de servidor para la actualización de precios externos (SISTEMA-21),
// para todas las farmacias. Uso en el VPS:
//   pnpm --filter @gestion/api precios estado
//   pnpm --filter @gestion/api precios sincronizar
//   pnpm --filter @gestion/api precios deshacer <idDeCorrida>
//   pnpm --filter @gestion/api precios pausar | reanudar
const USO =
  "Uso: precios <estado | sincronizar | deshacer <idDeCorrida> | pausar | reanudar>";

async function main(): Promise<void> {
  // Sin temporizador: este proceso sólo ejecuta el comando y termina.
  process.env.PRICE_REFRESH_SCHEDULER = "off";
  process.env.SUBSCRIPTION_SCHEDULER = "off";
  process.env.FISCAL_QUEUE_WORKER = "off";
  const [command, argument] = process.argv.slice(2);
  if (!command) throw new Error(USO);
  const { AppModule } = await import("./app.module");
  const { CatalogPriceRefreshService } =
    await import("./catalog/catalog-price-refresh.service");
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ["error", "warn", "log"],
  });
  try {
    const service = app.get(CatalogPriceRefreshService);
    const logger = new Logger("precios");
    switch (command) {
      case "estado": {
        const runs = await service.recentRuns(10);
        for (const run of runs)
          logger.log(
            `${run.id} · ${run.startedAt.toISOString()} · ${run.trigger} · ${run.status} · revisados ${run.checked} · cambiados ${run.updated}${run.revertedAt ? " · DESHECHA" : ""}${run.message ? ` · ${run.message}` : ""}`,
          );
        logger.log(
          (await service.isPaused())
            ? "Aplicación automática: EN PAUSA."
            : "Aplicación automática: activa.",
        );
        break;
      }
      case "sincronizar":
        logger.log(
          JSON.stringify(await service.refreshAll(undefined, "COMMAND")),
        );
        break;
      case "deshacer": {
        if (!argument) throw new Error(USO);
        const result = await service.revertRun(null, argument);
        logger.log(
          `Corrida ${result.runId}: ${result.reverted} de ${result.changes} precios restaurados.`,
        );
        if (result.kept.length)
          logger.warn(
            `No se tocaron ${result.kept.length} productos modificados después: ${result.kept.join(", ")}`,
          );
        break;
      }
      case "pausar":
        await service.setPaused(true);
        logger.log(
          "Aplicación automática en pausa: el padrón se sigue descargando pero no se cambian precios.",
        );
        break;
      case "reanudar":
        await service.setPaused(false);
        logger.log("Aplicación automática reanudada.");
        break;
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
