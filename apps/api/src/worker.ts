import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";

import { AppModule } from "./app.module";

/**
 * Proceso de tareas programadas (SISTEMA-106): actualización de precios (09 y
 * 17 h de Argentina), cola fiscal, cargos de suscripción y aportes de las
 * farmacias al catálogo externo (SISTEMA-112) y fotos de medicamentos
 * (SISTEMA-122). Es la misma
 * aplicación que la API pero sin puerto HTTP; los temporizadores arrancan solos
 * al iniciar los módulos. Las copias de la API corren con las tres tareas
 * apagadas (PRICE_REFRESH_SCHEDULER, FISCAL_QUEUE_WORKER,
 * SUBSCRIPTION_SCHEDULER, CATALOG_APORTES_SCHEDULER y MEDICINE_PHOTOS_SCHEDULER en
 * "off") y este proceso las deja encendidas.
 * Debe haber una sola copia. Ver docs/DOCKER.md.
 */
async function bootstrap(): Promise<void> {
  const logger = new Logger("Worker");
  const apagadas = [
    "PRICE_REFRESH_SCHEDULER",
    "FISCAL_QUEUE_WORKER",
    "SUBSCRIPTION_SCHEDULER",
    "CATALOG_APORTES_SCHEDULER",
    "MEDICINE_PHOTOS_SCHEDULER",
  ].filter((nombre) => process.env[nombre] === "off");
  if (apagadas.length)
    logger.warn(
      `Tareas apagadas por configuración en este proceso: ${apagadas.join(", ")}.`,
    );
  const app = await NestFactory.createApplicationContext(AppModule);
  app.enableShutdownHooks();
  logger.log("Tareas programadas en marcha (sin puerto HTTP).");
}

void bootstrap();
