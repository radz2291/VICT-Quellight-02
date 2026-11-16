# Candidate host image; container execution is a separate qualification step.
FROM node:22.23.5-bookworm-slim AS builder
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
COPY packs ./packs
COPY svelte.config.js vite.config.ts tsconfig.json ./
COPY src ./src
COPY config ./config
COPY scripts ./scripts
COPY baseline.json ./
RUN npm ci --no-fund && npm run build

FROM node:22.23.5-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production QUELLIGHT_MODE=foundation QUELLIGHT_DEPLOYMENT=hosted HOST=0.0.0.0 PORT=4317
COPY --from=builder --chown=node:node /app/build ./build
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/package.json ./package.json
COPY --from=builder --chown=node:node /app/config ./config
COPY --from=builder --chown=node:node /app/scripts/start.mjs ./scripts/start.mjs
USER node
EXPOSE 4317
CMD ["node", "scripts/start.mjs"]
