# Fastify serves the static React SPA, REST API and MCP from one Node.js process.
FROM node:22-alpine AS build
WORKDIR /opt/nihon
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund --fetch-retries=5 --fetch-retry-mintimeout=1000
COPY tsconfig.json vite.config.ts eslint.config.mjs ./
COPY src ./src
COPY scripts ./scripts
COPY public ./public
RUN npm run build
# Keep only 8 direct runtime dependencies; remove Vite/React/build tooling.
RUN npm prune --omit=dev --no-audit --no-fund && npm cache clean --force

FROM node:22-alpine AS runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
WORKDIR /opt/nihon
COPY --from=build /opt/nihon/package.json /opt/nihon/package-lock.json ./
COPY --from=build /opt/nihon/node_modules ./node_modules
COPY --from=build /opt/nihon/dist ./dist
COPY --from=build /opt/nihon/src/db/migrations ./src/db/migrations
COPY --from=build /opt/nihon/src/db/mysql/migrations ./src/db/mysql/migrations
RUN addgroup -g 10001 -S nihon && adduser -S -D -H -u 10001 -G nihon nihon && \
    mkdir -p /opt/nihon/data && chown -R nihon:nihon /opt/nihon/data
USER nihon
VOLUME ["/opt/nihon/data"]
EXPOSE 3000
CMD ["sh","-c","node dist/scripts/migrate.mjs && node dist/server/index.mjs"]
