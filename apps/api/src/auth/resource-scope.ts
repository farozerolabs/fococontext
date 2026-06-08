import { ApiError } from "@fococontext/contracts";

import type { ApiResourceScope } from "./api-key.guard.js";

export interface ApiScopedResource {
  tenantId: string;
  projectId: string;
}

export function isApiResourceInScope(
  resource: ApiScopedResource | undefined,
  scope: ApiResourceScope | undefined,
): boolean {
  if (resource === undefined) {
    return false;
  }
  if (scope === undefined) {
    return true;
  }

  return resource.tenantId === scope.tenantId && resource.projectId === scope.projectId;
}

export function requireScopedResource<T extends ApiScopedResource>(
  resource: T | undefined,
  scope: ApiResourceScope | undefined,
  notFoundFactory: () => ApiError,
): T {
  if (resource === undefined || !isApiResourceInScope(resource, scope)) {
    throw notFoundFactory();
  }

  return resource;
}

export function requireScopedKnowledgeBase<T extends ApiScopedResource>(
  resource: T | undefined,
  scope: ApiResourceScope | undefined,
  notFoundFactory: () => ApiError = () => new ApiError("knowledge_base_not_found"),
): T {
  return requireScopedResource(resource, scope, notFoundFactory);
}

export function requireScopedFork<T extends ApiScopedResource>(
  resource: T | undefined,
  scope: ApiResourceScope | undefined,
  notFoundFactory: () => ApiError = () => new ApiError("knowledge_base_not_found"),
): T {
  return requireScopedResource(resource, scope, notFoundFactory);
}

export function requireScopedDocument<T extends ApiScopedResource>(
  resource: T | undefined,
  scope: ApiResourceScope | undefined,
  notFoundFactory: () => ApiError = () => new ApiError("document_not_found"),
): T {
  return requireScopedResource(resource, scope, notFoundFactory);
}

export function requireScopedJob<T extends ApiScopedResource>(
  resource: T | undefined,
  scope: ApiResourceScope | undefined,
  notFoundFactory: () => ApiError = () => new ApiError("job_not_found"),
): T {
  return requireScopedResource(resource, scope, notFoundFactory);
}

export function requireScopedTrace<T extends ApiScopedResource>(
  resource: T | undefined,
  scope: ApiResourceScope | undefined,
  notFoundFactory: () => ApiError = () => new ApiError("invalid_request"),
): T {
  return requireScopedResource(resource, scope, notFoundFactory);
}

export function requireScopedCleanupOperation<T extends ApiScopedResource>(
  resource: T | undefined,
  scope: ApiResourceScope | undefined,
  notFoundFactory: () => ApiError = () => new ApiError("cleanup_operation_not_found"),
): T {
  return requireScopedResource(resource, scope, notFoundFactory);
}

export function requireScopedWebhook<T extends ApiScopedResource>(
  resource: T | undefined,
  scope: ApiResourceScope | undefined,
  notFoundFactory: () => ApiError = () => new ApiError("invalid_request"),
): T {
  return requireScopedResource(resource, scope, notFoundFactory);
}

export function requireScopedSourceWatchRule<T extends ApiScopedResource>(
  resource: T | undefined,
  scope: ApiResourceScope | undefined,
  notFoundFactory: () => ApiError = () => new ApiError("invalid_request"),
): T {
  return requireScopedResource(resource, scope, notFoundFactory);
}
