import "reflect-metadata";

import multipart from "@fastify/multipart";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import type { RuntimeConfig } from "@fococontext/core";

import { ApiModule, type ApiModuleOptions } from "./api.module.js";
import { ApiErrorFilter } from "./errors/api-error.filter.js";
import { ApiLocalizationInterceptor, apiLocaleHeaderName } from "./errors/api-localization.js";
import { RuntimeApiMetricsInterceptor } from "./runtime/runtime-api-metrics.js";

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

  app.enableCors({
    allowedHeaders: [
      "accept-language",
      "authorization",
      "content-type",
      "idempotency-key",
      apiLocaleHeaderName,
    ],
    credentials: true,
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    origin: config.cors.origins.includes("*") ? true : config.cors.origins,
  });
  await app.register(multipart, {
    limits: {
      fileSize: config.limits.upload.maxFileSizeMb * 1024 * 1024,
    },
  });
  app.useGlobalFilters(new ApiErrorFilter());
  app.useGlobalInterceptors(new RuntimeApiMetricsInterceptor(), new ApiLocalizationInterceptor());
  await app.init();
  await app.getHttpAdapter().getInstance().ready();

  return app;
}
