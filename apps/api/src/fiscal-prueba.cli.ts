import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { PROCESO_AUTOMATICO } from "./fiscal/actor-fiscal";

// Prueba real contra ARCA HOMOLOGACIÓN (el ambiente de prueba, sin validez
// fiscal), con la credencial de homologación guardada en la base LOCAL.
// Nunca llama a producción y no registra ventas, stock ni caja.
//   pnpm --filter @gestion/api build
//   pnpm --filter @gestion/api fiscal-prueba conexion
//   pnpm --filter @gestion/api fiscal-prueba emitir [--organizacion <id o nombre>] [--punto <n>]
// `conexion` verifica certificado, puntos y último número sin emitir.
// `emitir` hace una factura C de $1 a consumidor final y la vuelve a consultar.
const USO =
  "Uso: fiscal-prueba <conexion | emitir> [--organizacion <id o nombre>] [--punto <número>]";

function opcion(args: string[], nombre: string) {
  const i = args.indexOf(`--${nombre}`);
  return i >= 0 ? args[i + 1] : undefined;
}

async function main(): Promise<void> {
  process.env.PRICE_REFRESH_SCHEDULER = "off";
  process.env.SUBSCRIPTION_SCHEDULER = "off";
  process.env.FISCAL_QUEUE_WORKER = "off";
  const args = process.argv.slice(2);
  const comando = args[0];
  if (comando !== "conexion" && comando !== "emitir") throw new Error(USO);
  const { AppModule } = await import("./app.module");
  const { EnvironmentService } = await import("./config/environment.service");
  const { PrismaService } = await import("./prisma/prisma.service");
  const { ArcaConnectionService, authXml } =
    await import("./fiscal/arca-connection.service");
  const { ArcaSoap, arcaMessages, obj, str } =
    await import("./fiscal/arca-soap");
  const { argentinaDate, matchesTrial, trialBody } =
    await import("./fiscal/fiscal-trial.service");
  const { ultimoAutorizado } = await import("./fiscal/resolucion-incierta");
  const { readFiscalProfile } = await import("./organizations/fiscal-profile");
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ["error", "warn", "log"],
  });
  const log = new Logger("fiscal-prueba");
  try {
    const url = new URL(app.get(EnvironmentService).databaseUrl ?? "");
    if (!["localhost", "127.0.0.1", "::1"].includes(url.hostname))
      throw new Error(
        "Este comando sólo corre contra la base local de pruebas, nunca contra un servidor.",
      );
    const prisma = app.get(PrismaService);
    const buscada = opcion(args, "organizacion");
    const credenciales = await prisma.fiscalCredential.findMany({
      where: { environment: "HOMOLOGATION", certificate: { not: null } },
      include: { organization: { select: { id: true, name: true } } },
    });
    const candidatas = credenciales.filter(
      (c) =>
        !buscada ||
        c.organizationId === buscada ||
        c.organization.name.toLowerCase().includes(buscada.toLowerCase()),
    );
    if (candidatas.length !== 1) {
      log.warn(
        candidatas.length
          ? "Hay varias organizaciones con certificado de homologación. Elegí una con --organizacion:"
          : "No hay organizaciones con certificado de homologación cargado. Subilo en Organización → Facturación.",
      );
      for (const c of candidatas)
        log.log(`  ${c.organizationId} · ${c.organization.name}`);
      process.exitCode = 1;
      return;
    }
    const credencial = candidatas[0]!;
    const org = credencial.organizationId;
    const organizacion = await prisma.organization.findUniqueOrThrow({
      where: { id: org },
    });
    const perfil = readFiscalProfile(organizacion.fiscalProfile);
    log.log(
      `Organización: ${organizacion.name} · CUIT ${perfil.cuit} · certificado vence ${credencial.expiresAt?.toISOString().slice(0, 10) ?? "?"}`,
    );

    // Siempre HOMOLOGATION: este comando no tiene camino a producción.
    const connection = app.get(ArcaConnectionService);
    const soap = app.get(ArcaSoap);
    const access = await connection.access(
      PROCESO_AUTOMATICO,
      org,
      "sale",
      "HOMOLOGATION",
    );
    log.log("1. Certificado aceptado por ARCA homologación (WSAA).");
    const puntos = await connection.points(access);
    const asociado = await prisma.fiscalPoint.findFirst({
      where: { organizationId: org, environment: "HOMOLOGATION", active: true },
      orderBy: { number: "asc" },
    });
    const punto = Number(
      opcion(args, "punto") ?? asociado?.number ?? puntos[0]?.number ?? 1,
    );
    if (!Number.isInteger(punto) || punto < 1 || punto > 99999)
      throw new Error(
        "El punto de venta tiene que ser un número de 1 a 99999.",
      );
    log.log(
      `2. Puntos informados por ARCA: ${puntos.length ? puntos.map((p) => p.number).join(", ") : "ninguno (normal en homologación)"}. Se usa el ${punto}.`,
    );
    const tipo = perfil.vatCondition === "REGISTERED" ? 6 : 11;
    const ultimo = ultimoAutorizado(
      await soap.call(
        "wsfe",
        "FECompUltimoAutorizado",
        `${authXml(access)}<PtoVta>${punto}</PtoVta><CbteTipo>${tipo}</CbteTipo>`,
        "HOMOLOGATION",
      ),
      punto,
      tipo,
    );
    if (ultimo === null)
      throw new Error(
        "ARCA no devolvió el último número autorizado para ese punto.",
      );
    log.log(
      `3. Último comprobante ${tipo === 11 ? "C" : "B"} autorizado en el punto ${punto}: ${ultimo}.`,
    );
    if (comando === "conexion") {
      log.log("Conexión OK. No se emitió nada.");
      return;
    }

    const prueba = {
      point: punto,
      voucherType: tipo,
      number: ultimo + 1,
      date: argentinaDate(),
      totalMinor: tipo === 6 ? 12100 : 100,
      docType: 99,
      docNumber: "0",
    };
    const respuesta = await soap.call(
      "wsfe",
      "FECAESolicitar",
      authXml(access) + trialBody(prueba),
      "HOMOLOGATION",
    );
    const detalle = obj(obj(respuesta.FeDetResp).FECAEDetResponse);
    if (str(detalle.Resultado) !== "A" || !/^\d{14}$/.test(str(detalle.CAE))) {
      log.error(
        `4. ARCA no autorizó: ${arcaMessages(respuesta) || arcaMessages(detalle) || "sin detalle"}`,
      );
      process.exitCode = 1;
      return;
    }
    log.log(
      `4. Factura ${String(punto).padStart(5, "0")}-${String(prueba.number).padStart(8, "0")} autorizada. CAE ${str(detalle.CAE)}, vence ${str(detalle.CAEFchVto)}.`,
    );
    const consulta = obj(
      (
        await soap.call(
          "wsfe",
          "FECompConsultar",
          `${authXml(access)}<FeCompConsReq><CbteTipo>${tipo}</CbteTipo><CbteNro>${prueba.number}</CbteNro><PtoVta>${punto}</PtoVta></FeCompConsReq>`,
          "HOMOLOGATION",
        )
      ).ResultGet,
    );
    const coincide =
      matchesTrial(consulta, {
        ...prueba,
        id: "",
        organizationId: org,
        requestId: "",
        environment: "HOMOLOGATION",
        issuer: {},
        status: "AUTHORIZED",
        cae: null,
        caeExpires: null,
        detail: null,
        sourceSaleId: null,
        saleSnapshot: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }) && str(consulta.CodAutorizacion) === str(detalle.CAE);
    log.log(
      coincide
        ? "5. Consulta en ARCA: el comprobante existe y coincide. Todo OK."
        : "5. Consulta en ARCA: no coincide con lo enviado. Revisalo.",
    );
    if (!coincide) process.exitCode = 1;
  } finally {
    await app.close();
  }
}

main().catch((cause: unknown) => {
  console.error(cause instanceof Error ? cause.message : cause);
  process.exitCode = 1;
});
