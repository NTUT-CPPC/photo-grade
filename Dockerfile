FROM node:24-bookworm-slim AS base
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates perl make g++ python3 \
  && rm -rf /var/lib/apt/lists/*

FROM base AS deps
COPY package.json package-lock.json* ./
COPY apps/server/package.json apps/server/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN npm install

FROM deps AS builder
COPY . .
RUN npm run build

FROM base AS runner
ENV NODE_ENV=production
COPY --from=builder /app/package.json /app/package-lock.json ./
COPY --from=builder /app/apps/server/package.json apps/server/package.json
COPY --from=builder /app/apps/worker/package.json apps/worker/package.json
COPY --from=builder /app/packages/shared/package.json packages/shared/package.json
COPY --from=builder /app/node_modules node_modules
COPY --from=builder /app/apps/server/node_modules apps/server/node_modules
COPY --from=builder /app/apps/worker/node_modules apps/worker/node_modules
COPY --from=builder /app/apps/server/dist apps/server/dist
COPY --from=builder /app/apps/server/prisma apps/server/prisma
COPY --from=builder /app/apps/web/dist apps/web/dist
COPY --from=builder /app/apps/worker/dist apps/worker/dist
COPY --from=builder /app/packages/shared/dist packages/shared/dist
RUN mkdir -p /data/imports /data/originals /data/previews /data/thumbnails /data/metadata /data/logs /data/exports /data/secrets
EXPOSE 8080
CMD ["sh", "-c", "npm run db:push && npm run start"]
