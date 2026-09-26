# Backend NestJS. Contexto de build: raíz del monorepo
#   docker build -f backend/Dockerfile .
# Imagen multi-arquitectura: sirve en Oracle Ampere (arm64) y en x86_64.

ARG NODE_IMAGE=node:20-bookworm-slim

FROM ${NODE_IMAGE} AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY shared/package.json shared/package.json
# Solo el workspace del backend + dependencias del root (class-validator, etc.).
RUN npm ci -w clinica-backend --include-workspace-root --no-audit --no-fund
COPY backend backend
COPY shared shared
RUN cd backend && npx prisma generate && npx nest build
RUN npm prune --omit=dev -w clinica-backend --include-workspace-root

FROM ${NODE_IMAGE}
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production \
    NODE_PATH=/app/node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/backend/package.json ./backend/package.json
COPY --from=build /app/backend/node_modules ./backend/node_modules
COPY --from=build /app/backend/dist ./backend/dist
COPY --from=build /app/backend/prisma ./backend/prisma
WORKDIR /app/backend
USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]
