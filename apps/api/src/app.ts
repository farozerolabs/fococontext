import "reflect-metadata";

import multipart from "@fastify/multipart";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { ApiError } from "@fococontext/contracts";
import type { RuntimeConfig } from "@fococontext/core";

import { ApiModule, type ApiModuleOptions } from "./api.module.js";
import { adminCsrfHeaderName } from "./auth/admin-session.middleware.js";
import { ApiErrorFilter } from "./errors/api-error.filter.js";
import { ApiLocalizationInterceptor, apiLocaleHeaderName } from "./errors/api-localization.js";

export type ApiApplication = NestFastifyApplication;

export async function createApiApp(
  config: RuntimeConfig,
  options: ApiModuleOptions = {},
): Promise<ApiApplication> {
  const app = await NestFactory.create<NestFastifyApplication>(
    ApiModule.register(config, options),
    new FastifyAdapter({
      logger: false,
    }),
    {
      logger: false,
      abortOnError: false,
    },
  );

  registerRequestBoundaryChecks(app);
  const corsUsesWildcard = config.cors.origins.includes("*");

  app.enableCors({
    allowedHeaders: [
      "accept-language",
      "authorization",
      "content-type",
      "idempotency-key",
      adminCsrfHeaderName,
      apiLocaleHeaderName,
    ],
    credentials: !corsUsesWildcard,
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    origin: corsUsesWildcard ? "*" : config.cors.origins,
  });
  registerSecurityHeaders(app, config);
  await app.register(multipart, {
    limits: {
      fileSize: config.limits.upload.maxFileSizeMb * 1024 * 1024,
    },
  });
  app.useGlobalFilters(new ApiErrorFilter());
  app.useGlobalInterceptors(new ApiLocalizationInterceptor());
  await app.init();
  await app.getHttpAdapter().getInstance().ready();

  return app;
}

function registerRequestBoundaryChecks(app: ApiApplication): void {
  const fastify = app.getHttpAdapter().getInstance();

  fastify.addHook("onRequest", async (request) => {
    if (
      hasHeader(request.headers, "x-http-method-override") ||
      hasHeader(request.headers, "x-method-override") ||
      hasHeader(request.headers, "x-original-method") ||
      hasUnsafeHeaderValue(request.headers) ||
      hasPathTraversalProbe(request.raw.url ?? request.url)
    ) {
      throw new ApiError("invalid_request", {
        messageKey: "api.validation.request_boundary_invalid",
      });
    }
  });
}

function registerSecurityHeaders(app: ApiApplication, config: RuntimeConfig): void {
  if (!config.security.headersEnabled) {
    return;
  }

  const fastify = app.getHttpAdapter().getInstance();

  fastify.addHook("onSend", async (_request, reply, payload) => {
    reply.header("x-content-type-options", "nosniff");
    reply.header("x-frame-options", "DENY");
    reply.header("referrer-policy", "no-referrer");
    reply.header("permissions-policy", "camera=(), microphone=(), geolocation=()");
    reply.header("cross-origin-resource-policy", "same-site");

    if (config.security.hstsEnabled) {
      reply.header("strict-transport-security", `max-age=${config.security.hstsMaxAgeSeconds}`);
    }

    return payload;
  });
}

function hasHeader(headers: Record<string, unknown>, name: string): boolean {
  return headers[name] !== undefined;
}

function hasUnsafeHeaderValue(headers: Record<string, unknown>): boolean {
  return Object.values(headers).some((value) => {
    if (Array.isArray(value)) {
      return value.some((item) => typeof item === "string" && containsControlCharacter(item));
    }

    return typeof value === "string" && containsControlCharacter(value);
  });
}

function containsControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const codePoint = value.charCodeAt(index);

    if (codePoint <= 31 || codePoint === 127) {
      return true;
    }
  }

  return false;
}

function hasPathTraversalProbe(url: string): boolean {
  const path = url.split("?")[0] ?? "";
  const variants = new Set([path.toLowerCase()]);
  let decoded = path;

  for (let index = 0; index < 3; index += 1) {
    try {
      decoded = decodeURIComponent(decoded);
      variants.add(decoded.toLowerCase());
    } catch {
      break;
    }
  }

  for (const variant of variants) {
    if (
      variant.includes("../") ||
      variant.includes("..\\") ||
      variant.includes("/..") ||
      variant.includes("\\..")
    ) {
      return true;
    }
  }

  return false;
}
