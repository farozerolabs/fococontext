# syntax=docker/dockerfile:1.7

FROM node:24-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="${PNPM_HOME}:${PATH}"
RUN corepack enable && corepack prepare pnpm@11.5.2 --activate
WORKDIR /app

FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json tsconfig.json .npmrc ./
COPY apps ./apps
COPY packages ./packages
RUN --mount=type=cache,id=fococontext-pnpm-store,target=/pnpm/store \
  pnpm install --frozen-lockfile --store-dir=/pnpm/store \
  && pnpm -F @fococontext/worker... build

FROM base AS production-deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/worker/package.json apps/worker/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/core/package.json packages/core/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/llm/package.json packages/llm/package.json
COPY packages/parsers/package.json packages/parsers/package.json
COPY packages/retrieval/package.json packages/retrieval/package.json
COPY packages/storage/package.json packages/storage/package.json
RUN --mount=type=cache,id=fococontext-pnpm-store,target=/pnpm/store \
  pnpm install --frozen-lockfile --prod --filter @fococontext/worker... --store-dir=/pnpm/store

FROM node:24-alpine AS runtime
ARG FOCOCONTEXT_RELEASE_VERSION="dev"
ARG FOCOCONTEXT_RELEASE_REVISION="unknown"
ARG FOCOCONTEXT_RELEASE_BUILD_TIME="unknown"
ARG FOCOCONTEXT_RELEASE_SOURCE="local"
LABEL org.opencontainers.image.title="FocoContext Worker" \
  org.opencontainers.image.version="${FOCOCONTEXT_RELEASE_VERSION}" \
  org.opencontainers.image.revision="${FOCOCONTEXT_RELEASE_REVISION}" \
  org.opencontainers.image.created="${FOCOCONTEXT_RELEASE_BUILD_TIME}" \
  org.opencontainers.image.source="${FOCOCONTEXT_RELEASE_SOURCE}"
ENV NODE_ENV="production"
ENV FOCOCONTEXT_RELEASE_VERSION="${FOCOCONTEXT_RELEASE_VERSION}"
ENV FOCOCONTEXT_RELEASE_REVISION="${FOCOCONTEXT_RELEASE_REVISION}"
ENV FOCOCONTEXT_RELEASE_BUILD_TIME="${FOCOCONTEXT_RELEASE_BUILD_TIME}"
ENV FOCOCONTEXT_RELEASE_SOURCE="${FOCOCONTEXT_RELEASE_SOURCE}"
WORKDIR /app

COPY --from=production-deps /app/package.json ./package.json
COPY --from=production-deps /app/node_modules ./node_modules
COPY --from=production-deps /app/apps/worker/package.json ./apps/worker/package.json
COPY --from=production-deps /app/apps/worker/node_modules ./apps/worker/node_modules
COPY --from=production-deps /app/packages/contracts/package.json ./packages/contracts/package.json
COPY --from=production-deps /app/packages/core/package.json ./packages/core/package.json
COPY --from=production-deps /app/packages/core/node_modules ./packages/core/node_modules
COPY --from=production-deps /app/packages/db/package.json ./packages/db/package.json
COPY --from=production-deps /app/packages/db/node_modules ./packages/db/node_modules
COPY --from=production-deps /app/packages/llm/package.json ./packages/llm/package.json
COPY --from=production-deps /app/packages/parsers/package.json ./packages/parsers/package.json
COPY --from=production-deps /app/packages/parsers/node_modules ./packages/parsers/node_modules
COPY --from=production-deps /app/packages/retrieval/package.json ./packages/retrieval/package.json
COPY --from=production-deps /app/packages/storage/package.json ./packages/storage/package.json
COPY --from=production-deps /app/packages/storage/node_modules ./packages/storage/node_modules

COPY --from=build /app/apps/worker/dist ./apps/worker/dist
COPY --from=build /app/packages/contracts/dist ./packages/contracts/dist
COPY --from=build /app/packages/core/dist ./packages/core/dist
COPY --from=build /app/packages/db/dist ./packages/db/dist
COPY --from=build /app/packages/db/migrations ./packages/db/migrations
COPY --from=build /app/packages/llm/dist ./packages/llm/dist
COPY --from=build /app/packages/parsers/dist ./packages/parsers/dist
COPY --from=build /app/packages/retrieval/dist ./packages/retrieval/dist
COPY --from=build /app/packages/storage/dist ./packages/storage/dist
RUN mkdir -p node_modules/@fococontext \
  && ln -sf ../../packages/contracts node_modules/@fococontext/contracts \
  && ln -sf ../../packages/core node_modules/@fococontext/core \
  && ln -sf ../../packages/db node_modules/@fococontext/db \
  && ln -sf ../../packages/llm node_modules/@fococontext/llm \
  && ln -sf ../../packages/parsers node_modules/@fococontext/parsers \
  && ln -sf ../../packages/retrieval node_modules/@fococontext/retrieval \
  && ln -sf ../../packages/storage node_modules/@fococontext/storage

USER node
CMD ["node", "apps/worker/dist/runtime.js"]
