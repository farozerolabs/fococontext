# syntax=docker/dockerfile:1.7

FROM node:24-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="${PNPM_HOME}:${PATH}"
RUN corepack enable && corepack prepare pnpm@11.5.2 --activate
WORKDIR /app

FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json tsconfig.json .npmrc ./
COPY apps/admin-web ./apps/admin-web
COPY packages/contracts ./packages/contracts
RUN --mount=type=cache,id=fococontext-pnpm-store,target=/pnpm/store \
  pnpm install --frozen-lockfile --store-dir=/pnpm/store \
  && pnpm -F @fococontext/admin-web build

FROM node:24-alpine AS runtime
ARG FOCOCONTEXT_RELEASE_VERSION="dev"
ARG FOCOCONTEXT_RELEASE_REVISION="unknown"
ARG FOCOCONTEXT_RELEASE_BUILD_TIME="unknown"
ARG FOCOCONTEXT_RELEASE_SOURCE="local"
LABEL org.opencontainers.image.title="FocoContext Admin" \
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
COPY --from=build /app/apps/admin-web/dist ./dist
COPY --from=build /app/apps/admin-web/server.mjs ./server.mjs
USER node
EXPOSE 18081
CMD ["node", "server.mjs"]
