# Imagen del backend de PetAI. Contexto de build: la raíz del repositorio.
#   docker build -f backend/Dockerfile -t petai-backend .
FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && apt-get clean \
    && corepack enable
WORKDIR /app

FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY backend ./backend
COPY shared ./shared
RUN pnpm install --frozen-lockfile --filter petai-backend...
RUN pnpm --filter petai-backend exec prisma generate && pnpm --filter petai-backend run build

# Se conservan las dependencias completas: la imagen necesita el CLI de Prisma (migrate deploy) y
# ts-node (seed del catálogo). A cambio pesa más que una imagen solo de ejecución.
FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build --chown=node:node /app /app
USER node
WORKDIR /app/backend
EXPOSE 3000
# 9464: servidor de métricas Prometheus (solo red interna; NO se expone al host).
EXPOSE 9464
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# Aplica las migraciones pendientes y arranca. Con varias réplicas, ejecutar las migraciones aparte (ver docs/DEPLOY.md).
# `--expose-gc`: habilita `global.gc` y el `PerformanceObserver({ entryTypes: ['gc'] })` de Node,
# necesario para que prom-client / el observer midan las pausas de GC (`petai_gc_pause_seconds`)
# y la alerta `LongGCPause` pueda dispararse (SC-006, gap G2).
CMD ["sh", "-c", "pnpm exec prisma migrate deploy && node --expose-gc dist/src/main"]
