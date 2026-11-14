# syntax=docker/dockerfile:1
# Imagen única de la API (SISTEMA-106). Se construye desde la raíz del repo:
#   docker build -f apps/api/Dockerfile -t gestion-api:<version> .
# La misma imagen corre en cuatro roles (ver deploy/docker/compose.prod.yaml):
# API, worker de tareas programadas, migraciones y comandos de servidor.
# Ver docs/DOCKER.md.

FROM node:24-bookworm-slim AS base
# Prisma necesita OpenSSL; los certificados, para ARCA y el padrón.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /app

FROM base AS build
# Primero sólo los manifiestos: la capa de dependencias se reutiliza mientras
# no cambie el lockfile.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
  pnpm install --frozen-lockfile --filter "@gestion/api..."

COPY packages/contracts packages/contracts
COPY apps/api apps/api
COPY deploy/oracle/check-migrations.cjs deploy/oracle/check-preprod-migrations.cjs deploy/oracle/
RUN pnpm --filter @gestion/api prisma:generate \
  && pnpm --filter @gestion/contracts build \
  && pnpm --filter @gestion/api build
# Nest deja la entrada en dist/src o en dist según qué archivos compile: se
# detecta acá y se deja un enlace fijo para que el arranque no dependa de eso.
RUN cd apps/api \
  && if [ -f dist/src/main.js ]; then salida=dist/src; else salida=dist; fi \
  && test -f "$salida/main.js" && test -f "$salida/worker.js" \
  && ln -s "/app/apps/api/$salida" /app/entrada

FROM base AS runtime
ENV NODE_ENV=production
# Se copia el árbol completo, con la CLI de Prisma: la misma imagen aplica las
# migraciones (`prisma migrate deploy`) sin instalar nada en el servidor.
COPY --from=build --chown=node:node /app /app
USER node
WORKDIR /app/apps/api
EXPOSE 3000
CMD ["node", "/app/entrada/main.js"]
