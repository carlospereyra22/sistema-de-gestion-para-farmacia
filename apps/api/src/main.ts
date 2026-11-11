import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import * as cookieParser from "cookie-parser";
import helmet from "helmet";

import { AppModule } from "./app.module";
import { ApiExceptionFilter } from "./common/http/api-exception.filter";
import { requestIdMiddleware } from "./common/http/request-id.middleware";
import { errorDeValidacion } from "./common/http/mensajes-validacion";
import { EnvironmentService } from "./config/environment.service";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const environment = app.get(EnvironmentService);

  app.setGlobalPrefix("api/v1");
  // nginx en la misma máquina pasa la IP real (X-Forwarded-For): la usan
  // "Sesiones abiertas" y la auditoría (SISTEMA-93).
  app.getHttpAdapter().getInstance().set("trust proxy", "loopback");
  app.use(helmet());
  // Date se expone para que la web tome la hora del servidor (ventas sin
  // conexión, SISTEMA-64) también cuando la API está en otro origen.
  app.enableCors({
    origin: environment.corsOrigin,
    credentials: true,
    exposedHeaders: ["Date"],
  });
  app.use(cookieParser());
  app.use(requestIdMiddleware);
  app.useGlobalFilters(new ApiExceptionFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      // Mensajes en castellano (SISTEMA-67).
      exceptionFactory: errorDeValidacion,
    }),
  );

  const openApi = new DocumentBuilder()
    .setTitle("Sistema de Gestión para Farmacias")
    .setDescription("API REST versionada del sistema de gestión.")
    .setVersion("1.0")
    .addBearerAuth()
    .build();
  SwaggerModule.setup(
    "api/docs",
    app,
    SwaggerModule.createDocument(app, openApi),
  );

  app.enableShutdownHooks();
  await app.listen(environment.port, environment.host);
}

void bootstrap();
