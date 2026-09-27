# syntax=docker/dockerfile:1

# ---- Stage 1: build the PWA ----
FROM node:20-bookworm-slim AS web-build
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

# ---- Stage 2: install server deps (compiles better-sqlite3) ----
# Same Debian base + Node version as runtime so the native binary's ABI/libc match.
FROM node:20-bookworm-slim AS server-deps
WORKDIR /srv
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev

# ---- Stage 3: runtime ----
FROM node:20-bookworm-slim AS runtime
ENV NODE_ENV=production \
    PORT=3000 \
    DB_PATH=/app/data/expenses.db \
    PUBLIC_DIR=/app/public
WORKDIR /app

COPY --from=server-deps /srv/node_modules ./node_modules
COPY server/package.json ./package.json
COPY server/src ./src
COPY --from=web-build /web/dist ./public

# Writable data dir owned by the non-root user (named volume inherits this ownership).
RUN mkdir -p /app/data && chown -R node:node /app/data
USER node

EXPOSE 3000
CMD ["node", "src/index.js"]
