import { createHash } from "node:crypto";
import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  type NestMiddleware,
} from "@nestjs/common";
import { RedisConnection } from "bullmq";
import { ApiError } from "@fococontext/contracts";
import type { RuntimeConfig, RuntimeSecurityRateLimitClass } from "@fococontext/core";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { IncomingMessage } from "node:http";

import { runtimeConfigToken } from "../runtime-config.provider.js";
import { SecurityAuditService, type SecurityAuditActor } from "./security-audit.js";

export interface SecurityRateLimitCheckInput {
  actorKey: string;
  limitClass: RuntimeSecurityRateLimitClass;
  max: number;
  nowMs?: number;
  windowSeconds: number;
}

export interface SecurityRateLimitDecision {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
  windowSeconds: number;
}

export interface SecurityRateLimitStore {
  readonly backend: "memory" | "redis";
  check(input: SecurityRateLimitCheckInput): Promise<SecurityRateLimitDecision>;
  close?(): Promise<void>;
  reset?(): Promise<void>;
}

export const securityRateLimitStoreToken = Symbol("securityRateLimitStore");

@Injectable()
export class SecurityRateLimitGuard implements CanActivate {
  constructor(
    @Inject(runtimeConfigToken) private readonly config: RuntimeConfig,
    @Inject(securityRateLimitStoreToken) private readonly store: SecurityRateLimitStore,
    private readonly auditService: SecurityAuditService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<FastifyRequest>();

    await enforceSecurityRateLimit({
      auditService: this.auditService,
      config: this.config,
      request: request.raw,
      store: this.store,
    });

    return true;
  }
}

@Injectable()
export class RequestRateLimitMiddleware implements NestMiddleware {
  constructor(
    @Inject(runtimeConfigToken) private readonly config: RuntimeConfig,
    @Inject(securityRateLimitStoreToken) private readonly store: SecurityRateLimitStore,
    private readonly auditService: SecurityAuditService,
  ) {}

  async use(
    request: IncomingMessage,
    _reply: FastifyReply,
    next: (error?: unknown) => void,
  ): Promise<void> {
    try {
      await enforceSecurityRateLimit({
        auditService: this.auditService,
        config: this.config,
        request,
        store: this.store,
      });
      next();
    } catch (error) {
      next(error);
    }
  }
}

async function enforceSecurityRateLimit(input: {
  auditService: SecurityAuditService;
  config: RuntimeConfig;
  request: IncomingMessage;
  store: SecurityRateLimitStore;
}): Promise<void> {
  if (!input.config.security.rateLimits.enabled) {
    return;
  }

  const limitClass = classifySecurityRateLimitRoute(input.request.method, input.request.url);
  const limitConfig = input.config.security.rateLimits.classes[limitClass];
  const actor = getRateLimitActor(input.request);
  const decision = await input.store.check({
    actorKey: actor.key,
    limitClass,
    max: limitConfig.max,
    windowSeconds: limitConfig.windowSeconds,
  });

  if (!decision.allowed) {
    await input.auditService.record({
      actor: actor.auditActor,
      eventType: "rate_limit_triggered",
      metadata: {
        limit: decision.limit,
        rateLimitClass: limitClass,
        remaining: decision.remaining,
        retryAfterSeconds: decision.retryAfterSeconds,
        windowSeconds: decision.windowSeconds,
      },
      outcome: "blocked",
      reasonCode: "rate_limit_exceeded",
      requestId: null,
      routeGroup: limitClass,
    });

    throw new ApiError("rate_limited", {
      details: {
        rate_limit_class: limitClass,
        retry_after_seconds: decision.retryAfterSeconds,
      },
    });
  }
}

export function createRedisSecurityRateLimitStore(config: RuntimeConfig): SecurityRateLimitStore {
  return new RedisSecurityRateLimitStore(config);
}

class RedisSecurityRateLimitStore implements SecurityRateLimitStore {
  readonly backend = "redis";

  private readonly connection: RedisConnection;

  constructor(config: RuntimeConfig) {
    this.connection = new RedisConnection({
      url: config.redis.url,
    });
  }

  async check(input: SecurityRateLimitCheckInput): Promise<SecurityRateLimitDecision> {
    const nowMs = input.nowMs ?? Date.now();
    const windowIndex = Math.floor(nowMs / (input.windowSeconds * 1000));
    const key = createRateLimitKey(input.limitClass, input.actorKey, windowIndex);
    const client = await this.connection.client;
    const count = await client.runCommand("incr", [key]);

    if (count === 1) {
      await client.runCommand("expire", [key, String(input.windowSeconds)]);
    }

    const numericCount = typeof count === "number" ? count : input.max + 1;
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil(((windowIndex + 1) * input.windowSeconds * 1000 - nowMs) / 1000),
    );

    return {
      allowed: numericCount <= input.max,
      limit: input.max,
      remaining: Math.max(0, input.max - numericCount),
      retryAfterSeconds,
      windowSeconds: input.windowSeconds,
    };
  }

  async reset(): Promise<void> {
    const client = await this.connection.client;
    const keys = await client.runCommand("keys", ["fococontext:rate-limit:*"]);

    if (Array.isArray(keys) && keys.length > 0) {
      await client.runCommand("del", keys.map(String));
    }
  }

  async close(): Promise<void> {
    await this.connection.close();
  }
}

export function createMemorySecurityRateLimitStore(): SecurityRateLimitStore & {
  readonly buckets: Map<string, number>;
} {
  const buckets = new Map<string, number>();

  return {
    backend: "memory",
    buckets,
    async check(input) {
      const nowMs = input.nowMs ?? Date.now();
      const windowIndex = Math.floor(nowMs / (input.windowSeconds * 1000));
      const key = createRateLimitKey(input.limitClass, input.actorKey, windowIndex);
      const count = (buckets.get(key) ?? 0) + 1;
      buckets.set(key, count);

      return {
        allowed: count <= input.max,
        limit: input.max,
        remaining: Math.max(0, input.max - count),
        retryAfterSeconds: Math.max(
          1,
          Math.ceil(((windowIndex + 1) * input.windowSeconds * 1000 - nowMs) / 1000),
        ),
        windowSeconds: input.windowSeconds,
      };
    },
    async reset() {
      buckets.clear();
    },
  };
}

export function classifySecurityRateLimitRoute(
  method: string | undefined,
  url: string | undefined,
): RuntimeSecurityRateLimitClass {
  const normalizedMethod = method?.toUpperCase() ?? "GET";
  const pathname = normalizePathname(url);

  if (pathname === "/health") {
    return "public_health";
  }
  if (pathname === "/openapi.json" || pathname === "/v1/openapi.json") {
    return "openapi";
  }
  if (pathname.startsWith("/admin/auth/login")) {
    return "login";
  }
  if (pathname.startsWith("/v1/runtime/") || pathname.startsWith("/admin/system/")) {
    return "diagnostics";
  }
  if (pathname.includes("/retrieve")) {
    return "retrieve";
  }
  if (pathname.includes("/source-evidence")) {
    return "source_evidence";
  }
  if (pathname.includes("/upload-sessions")) {
    return "direct_upload";
  }
  if (pathname.includes("/upload") || pathname.includes("/documents")) {
    return "upload";
  }
  if (pathname.includes("/export")) {
    return "export";
  }
  if (pathname.includes("/cleanup") || pathname.includes("/delete")) {
    return "cleanup";
  }
  if (pathname.includes("/webhooks")) {
    return "webhook";
  }
  if (pathname.startsWith("/admin/") && normalizedMethod !== "GET" && normalizedMethod !== "HEAD") {
    return "admin_expensive";
  }

  return "default_api";
}

function getRateLimitActor(request: IncomingMessage): {
  auditActor: SecurityAuditActor;
  key: string;
} {
  const authorization = readHeader(request.headers.authorization);
  const cookie = readHeader(request.headers.cookie);
  const clientAddress = request.socket.remoteAddress ?? "unknown";

  if (authorization?.toLowerCase().startsWith("bearer ") === true) {
    return {
      auditActor: {
        apiKeyId: "bearer_hash",
        type: "api_key",
      },
      key: `api:${stableHash(authorization.slice("bearer ".length))}`,
    };
  }

  if (cookie !== undefined && cookie.includes("fococontext_admin_session=")) {
    return {
      auditActor: {
        type: "admin_session",
      },
      key: `admin:${stableHash(cookie)}`,
    };
  }

  return {
    auditActor: {
      type: "anonymous",
    },
    key: `ip:${stableHash(clientAddress)}`,
  };
}

function createRateLimitKey(
  limitClass: RuntimeSecurityRateLimitClass,
  actorKey: string,
  windowIndex: number,
): string {
  return `fococontext:rate-limit:${limitClass}:${actorKey}:${windowIndex}`;
}

function normalizePathname(url: string | undefined): string {
  const pathname = (url ?? "/").split("?")[0] ?? "/";

  try {
    return decodeURIComponent(pathname).toLowerCase();
  } catch {
    return pathname.toLowerCase();
  }
}

function readHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function stableHash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 32);
}
