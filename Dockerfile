# syntax=docker/dockerfile:1

FROM node:24-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps ./apps
COPY packages ./packages
COPY extensions ./extensions

RUN pnpm install --frozen-lockfile \
  && pnpm --filter @cartography/server build

ENV NODE_ENV=production
ENV PORT=3847
ENV DATABASE_PATH=/data/cartography.sqlite
ENV ALLOW_DEV_CREDENTIALS_FILE=false

VOLUME /data
EXPOSE 3847

# TLS belongs to the reverse proxy in front of this process.
CMD ["node", "apps/server/dist/index.js"]
