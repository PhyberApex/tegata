# syntax=docker/dockerfile:1@sha256:4edf897a3ffa55b89f906fc8cc78afdb3f1834cc9c7083565e611a8a7d5fe99e
FROM node:26-alpine@sha256:6bd9ab43c0ec0190ca7b2d193906cb8b7edf6e7f4afa43ddeccd6452710bffb5 AS frontend-build
WORKDIR /app
RUN npm install -g corepack && corepack enable
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY frontend/package.json frontend/
COPY backend/package.json backend/
COPY shared/package.json shared/
# The trailing `...` takes in @tegata/shared's own dev dependencies, which
# its build needs (README.md, "The shared package").
RUN --mount=type=cache,id=pnpm-tegata,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --filter tegata-frontend...
COPY tsconfig.base.json ./
COPY shared/ shared/
COPY frontend/ frontend/
RUN pnpm --filter @tegata/shared run build
RUN pnpm --filter tegata-frontend run build

FROM node:26-alpine@sha256:6bd9ab43c0ec0190ca7b2d193906cb8b7edf6e7f4afa43ddeccd6452710bffb5 AS backend-build
WORKDIR /app
RUN apk add --no-cache python3 make g++
RUN npm install -g corepack && corepack enable
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY frontend/package.json frontend/
COPY backend/package.json backend/
COPY shared/package.json shared/
RUN --mount=type=cache,id=pnpm-tegata,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --filter tegata-backend...
COPY tsconfig.base.json ./
COPY shared/ shared/
COPY backend/ backend/
RUN pnpm --filter @tegata/shared run build
RUN pnpm --filter tegata-backend run build
# The runtime never runs pnpm: the production dependency tree, native modules
# already compiled, is assembled here and copied over as plain files.
# --legacy because the workspace does not use injected workspace packages.
# @tegata/shared lands in it as a copy of its built dist/, so it has to be
# built before this step.
RUN --mount=type=cache,id=pnpm-tegata,target=/root/.local/share/pnpm/store \
    pnpm --filter tegata-backend deploy --prod --legacy /deploy

FROM node:26-alpine@sha256:6bd9ab43c0ec0190ca7b2d193906cb8b7edf6e7f4afa43ddeccd6452710bffb5
WORKDIR /app
# The backend resolves the frontend as ../../frontend/dist from its own dist,
# so the deployed tree keeps the workspace layout.
COPY --from=backend-build /deploy backend
COPY --from=frontend-build /app/frontend/dist frontend/dist
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:${PORT:-3000}/api/health || exit 1
EXPOSE 3000
CMD ["node", "backend/dist/main.js"]
