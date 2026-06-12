import { CanActivate, ExecutionContext, Inject, Injectable, Optional } from "@nestjs/common";
import { timingSafeEqual } from "node:crypto";
import { ApiError } from "@fococontext/contracts";
import type { RuntimeConfig } from "@fococontext/core";
import type { FastifyRequest } from "fastify";

import { runtimeConfigToken } from "../runtime-config.provider.js";
import type { AdminSessionCarrier } from "./admin-session.middleware.js";
import {
  createSecurityAuditActorFromRequest,
  SecurityAuditService,
} from "../security/security-audit.js";

export const apiKeyResolverToken = Symbol("apiKeyResolver");
export const adminSessionApiScopeToken = Symbol("adminSessionApiScope");

export interface ApiResourceScope {
  tenantId: string;
  projectId: string;
}

export interface ApiKeyScope extends ApiResourceScope {
  accountId?: string | null;
  apiKeyId: string;
  permissions: readonly string[];
  source: "env_bootstrap" | "persisted" | "static";
}

export interface StaticApiKeyRecord extends ApiResourceScope {
  accountId?: string | null;
  apiKey: string;
  expiresAt: string | null;
  id: string;
  permissions: readonly string[];
  source?: ApiKeyScope["source"];
  status: "active" | "revoked";
}

export interface ApiKeyResolver {
  resolveApiKey(candidate: string): ApiKeyScope | Promise<ApiKeyScope | undefined> | undefined;
}

export type ApiKeyRequest = FastifyRequest & {
  apiKeyAuthenticated?: true;
  apiKeyScope?: ApiKeyScope;
  raw: AdminSessionCarrier;
};

export const defaultApiResourceScope: ApiResourceScope = {
  tenantId: "tenant_default",
  projectId: "project_default",
};

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    @Inject(runtimeConfigToken) private readonly config: RuntimeConfig,
    @Optional()
    @Inject(apiKeyResolverToken)
    private readonly apiKeyResolver?: ApiKeyResolver,
    @Optional()
    @Inject(adminSessionApiScopeToken)
    private readonly adminSessionApiScope: ApiKeyScope = createAdminSessionApiScope(),
    @Optional()
    private readonly auditService?: SecurityAuditService,
  ) {}

  canActivate(context: ExecutionContext): boolean | Promise<boolean> {
    const request = context.switchToHttp().getRequest<ApiKeyRequest>();

    if (requiresOpenApiDocumentAuth(request.url)) {
      if (request.raw.adminSession !== undefined) {
        return true;
      }

      if (extractBearerApiKey(request.headers.authorization) === undefined) {
        this.recordAudit(request, {
          eventType: "openapi_document_auth_failed",
          reasonCode: "missing_bearer_token",
          routeGroup: "openapi",
        });
        throw new ApiError("forbidden", {
          messageKey: "api.validation.openapi_document_auth_required",
        });
      }

      return this.withResolvedBearerScope(request, (scope) => {
        if (!hasApiKeyPermission(scope, "openapi:read")) {
          this.recordAudit(request, {
            eventType: "openapi_document_auth_failed",
            reasonCode: "missing_openapi_permission",
            routeGroup: "openapi",
          });
          throw new ApiError("forbidden", {
            messageKey: "api.validation.openapi_document_auth_required",
          });
        }

        request.apiKeyScope = scope;
        request.apiKeyAuthenticated = true;

        return true;
      });
    }

    if (requiresBearerApiKey(request.url)) {
      if (request.raw.adminSession !== undefined) {
        request.apiKeyScope = this.adminSessionApiScope;
        request.apiKeyAuthenticated = true;

        return true;
      }

      return this.withResolvedBearerScope(request, (scope) => {
        const permission = requiredApiKeyRoutePermission(request.method, request.url);

        if (permission !== undefined && !hasApiKeyPermission(scope, permission)) {
          request.apiKeyScope = scope;
          this.recordAudit(request, {
            eventType: "api_key_authorization_failed",
            reasonCode: "missing_permission",
            routeGroup: "developer_api",
          });
          throw new ApiError("forbidden", {
            messageKey: "api.validation.api_key_permission_required",
            details: {
              permission,
            },
          });
        }

        request.apiKeyScope = scope;
        request.apiKeyAuthenticated = true;

        return true;
      });
    }

    return true;
  }

  private withResolvedBearerScope(
    request: ApiKeyRequest,
    next: (scope: ApiKeyScope) => boolean,
  ): boolean | Promise<boolean> {
    const resolved = this.resolveBearerApiKeyScope(request);

    if (isPromiseLike(resolved)) {
      return resolved.then(next);
    }

    return next(resolved);
  }

  private resolveBearerApiKeyScope(request: ApiKeyRequest): ApiKeyScope | Promise<ApiKeyScope> {
    const token = extractBearerApiKey(request.headers.authorization);
    const resolver = this.apiKeyResolver ?? createEnvApiKeyResolver(this.config);

    if (token === undefined) {
      this.recordAudit(request, {
        eventType: "api_key_auth_failed",
        reasonCode: "missing_bearer_token",
        routeGroup: "developer_api",
      });
      throw new ApiError("invalid_api_key");
    }

    const scope = resolver.resolveApiKey(token);

    if (scope === undefined) {
      this.recordAudit(request, {
        eventType: "api_key_auth_failed",
        reasonCode: "invalid_api_key",
        routeGroup: "developer_api",
      });
      throw new ApiError("invalid_api_key");
    }

    if (isPromiseLike(scope)) {
      return scope.then((resolved) => {
        if (resolved === undefined) {
          this.recordAudit(request, {
            eventType: "api_key_auth_failed",
            reasonCode: "invalid_api_key",
            routeGroup: "developer_api",
          });
          throw new ApiError("invalid_api_key");
        }

        return resolved;
      });
    }

    return scope;
  }

  private recordAudit(
    request: ApiKeyRequest,
    input: {
      eventType: string;
      reasonCode: string;
      routeGroup: string;
    },
  ): void {
    void this.auditService
      ?.record({
        actor: createSecurityAuditActorFromRequest(request),
        eventType: input.eventType,
        outcome: "failure",
        reasonCode: input.reasonCode,
        requestId: null,
        routeGroup: input.routeGroup,
      })
      .catch((error: unknown) => {
        console.warn("Security audit recording failed.", error);
      });
  }
}

export function requireApiKeyScope(request: ApiKeyRequest): ApiKeyScope {
  if (request.apiKeyScope === undefined) {
    throw new ApiError("invalid_api_key");
  }

  return request.apiKeyScope;
}

export function createEnvApiKeyRecord(
  config: RuntimeConfig,
  scope: ApiResourceScope & { accountId?: string | null } = defaultApiResourceScope,
): StaticApiKeyRecord {
  return {
    accountId: scope.accountId ?? null,
    apiKey: config.auth.apiKey,
    expiresAt: null,
    id: "api_key_env_default",
    permissions: ["*"],
    projectId: scope.projectId,
    source: "env_bootstrap",
    status: "active",
    tenantId: scope.tenantId,
  };
}

export function createEnvApiKeyResolver(config: RuntimeConfig): ApiKeyResolver {
  return createStaticApiKeyResolver([createEnvApiKeyRecord(config)]);
}

export function createAdminSessionApiScope(
  scope: ApiResourceScope & { accountId?: string | null } = defaultApiResourceScope,
): ApiKeyScope {
  return {
    accountId: scope.accountId ?? null,
    apiKeyId: "admin_session",
    permissions: ["*"],
    projectId: scope.projectId,
    source: "static",
    tenantId: scope.tenantId,
  };
}

export function createStaticApiKeyResolver(
  records: readonly StaticApiKeyRecord[],
  options: { now?: () => Date } = {},
): ApiKeyResolver {
  const now = options.now ?? (() => new Date());

  return {
    resolveApiKey(candidate: string): ApiKeyScope | undefined {
      for (const record of records) {
        if (!compareApiKeyConstantTime(candidate, record.apiKey)) {
          continue;
        }

        if (record.status !== "active") {
          return undefined;
        }

        if (record.expiresAt !== null && new Date(record.expiresAt).getTime() <= now().getTime()) {
          return undefined;
        }

        return {
          accountId: record.accountId ?? null,
          apiKeyId: record.id,
          permissions: [...record.permissions],
          projectId: record.projectId,
          source: record.source ?? "static",
          tenantId: record.tenantId,
        };
      }

      return undefined;
    },
  };
}

export function hasApiKeyPermission(scope: ApiKeyScope, permission: string): boolean {
  const namespace = permission.split(":")[0];

  return (
    scope.permissions.includes("*") ||
    scope.permissions.includes(permission) ||
    (namespace !== undefined && scope.permissions.includes(`${namespace}:*`))
  );
}

export function requiredApiKeyRoutePermission(
  method: string | undefined,
  path: string | undefined,
): string | undefined {
  if (path === undefined) {
    return undefined;
  }

  const [pathname = ""] = path.split("?");
  const normalizedMethod = method?.toUpperCase() ?? "GET";
  const access = normalizedMethod === "GET" || normalizedMethod === "HEAD" ? "read" : "write";

  if (pathname === "/v1" || pathname === "/v1/") {
    return undefined;
  }
  if (pathname === "/v1/openapi.json") {
    return "openapi:read";
  }
  if (pathname === "/v1/runtime/status" || pathname.startsWith("/v1/runtime/")) {
    return "runtime:read";
  }
  if (pathname === "/v1/dataset-configuration-presets") {
    return "dataset_configuration:read";
  }
  if (pathname === "/v1/api-keys") {
    return "api_keys:write";
  }
  if (pathname === "/v1/source-evidence/resolve") {
    return "documents:read";
  }
  if (
    pathname === "/v1/retrieve" ||
    pathname === "/v1/retrieve/expand" ||
    pathname.includes("/retrieve")
  ) {
    return "retrieve:read";
  }
  if (pathname.startsWith("/v1/graph") || pathname.includes("/graph")) {
    return "graph:read";
  }
  if (pathname.startsWith("/v1/documents/") || pathname.includes("/documents")) {
    return `documents:${access}`;
  }
  if (pathname.startsWith("/v1/media-assets/") || pathname.startsWith("/v1/source-evidence/")) {
    return `documents:${access}`;
  }
  if (pathname === "/v1/jobs/batch") {
    return "jobs:read";
  }
  if (pathname.startsWith("/v1/jobs/") || pathname.includes("/jobs")) {
    return `jobs:${access}`;
  }
  if (pathname.startsWith("/v1/source-watch-rules") || pathname.includes("/source-watch-rules")) {
    return `source_watch:${access}`;
  }
  if (pathname.startsWith("/v1/scheduled-import-jobs")) {
    return `source_watch:${access}`;
  }
  if (pathname.startsWith("/v1/webhooks")) {
    return `webhooks:${access}`;
  }
  if (pathname.startsWith("/v1/cleanup-operations")) {
    return `cleanup:${access}`;
  }
  if (pathname.includes("/imports")) {
    return "imports:write";
  }
  if (pathname.includes("/knowledge-checks")) {
    return `knowledge_checks:${access}`;
  }
  if (pathname.includes("/wiki-drafts") || pathname.includes("/pages")) {
    return `wiki:${access}`;
  }
  if (
    pathname.includes("/versions") ||
    pathname.includes("/change-sets") ||
    pathname.includes("/rollback")
  ) {
    return `wiki:${access}`;
  }
  if (pathname.startsWith("/v1/forks") || pathname.includes("/forks")) {
    return `forks:${access}`;
  }
  if (pathname.startsWith("/v1/knowledge-bases")) {
    return `knowledge_bases:${access}`;
  }

  return `api:${access}`;
}

export function assertApiKeyRoutePermission(
  scope: ApiKeyScope,
  method: string | undefined,
  path: string | undefined,
): void {
  const permission = requiredApiKeyRoutePermission(method, path);

  if (permission !== undefined && !hasApiKeyPermission(scope, permission)) {
    throw new ApiError("forbidden", {
      messageKey: "api.validation.api_key_permission_required",
      details: {
        permission,
      },
    });
  }
}

export function requiresBearerApiKey(path: string | undefined): boolean {
  if (path === undefined) {
    return false;
  }

  const [pathname = ""] = path.split("?");

  return pathname === "/v1" || pathname.startsWith("/v1/");
}

export function requiresOpenApiDocumentAuth(path: string | undefined): boolean {
  if (path === undefined) {
    return false;
  }

  const [pathname = ""] = path.split("?");

  return pathname === "/openapi.json" || pathname === "/v1/openapi.json";
}

export function extractBearerApiKey(
  authorizationHeader: string | string[] | undefined,
): string | undefined {
  if (typeof authorizationHeader !== "string") {
    return undefined;
  }

  const [scheme, token, extra] = authorizationHeader.trim().split(/\s+/);

  if (scheme?.toLowerCase() !== "bearer" || token === undefined || extra !== undefined) {
    return undefined;
  }

  return token;
}

export function compareApiKeyConstantTime(candidate: string, expected: string): boolean {
  const maxLength = Math.max(candidate.length, expected.length);
  const candidateBuffer = Buffer.alloc(maxLength);
  const expectedBuffer = Buffer.alloc(maxLength);

  Buffer.from(candidate).copy(candidateBuffer);
  Buffer.from(expected).copy(expectedBuffer);

  return timingSafeEqual(candidateBuffer, expectedBuffer) && candidate.length === expected.length;
}

function isPromiseLike<T>(value: T | Promise<T>): value is Promise<T> {
  return typeof (value as { then?: unknown }).then === "function";
}
