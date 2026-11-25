# Purpose: the ONE product image (harness rule 1, v0.9.2 R21): dependencies installed and the app built once,
# here; the preview and the ledger run this same image. Target: product.
FROM node:22-bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/* \
 && npm install -g pnpm@12.18.0
WORKDIR /src
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM node:22-bookworm-slim AS product
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOST=0.0.0.0 \
    TIMEAWAY_DB=/data/timeaway.sqlite TIMEAWAY_MIGRATIONS=/app/server/db/migrations
COPY --from=build /src/.output ./.output
COPY --from=build /src/server/db/migrations ./server/db/migrations
# The one-time setup command (D-011) and the start command's supervisor (D-048): it starts the built server, starts
# it again when it ends, and keeps its output lines for the test harness's log door.
COPY --from=build /src/server/scripts ./server/scripts
RUN mkdir -p /data
EXPOSE 3000
CMD ["node", "server/scripts/supervise.mjs"]
