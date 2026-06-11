import type {
  RuntimeCacheInvalidationInput,
  RuntimeCacheInvalidationTrigger,
} from "./runtime-cache.js";
import type { RuntimeLockAcquireInput, RuntimeLockResourceKind } from "./runtime-lock.js";
import type {
  RuntimeQueuePressureEvent,
  RuntimeQueuePressureRecordInput,
  RuntimeQueueWorkKind,
} from "./runtime-queue-pressure.js";

export interface BackgroundOperationCoordinationInput {
  operationId: string;
  operationKind: string;
  scopeId: string;
}

export function createBackgroundOperationDedupeKey(
  input: BackgroundOperationCoordinationInput,
): string {
  return `fococontext:background-operation:${encodeURIComponent(
    input.scopeId,
  )}:${encodeURIComponent(input.operationKind)}:${encodeURIComponent(input.operationId)}`;
}

export function createBackgroundOperationLockInput(
  input: BackgroundOperationCoordinationInput & {
    resourceKind?: RuntimeLockResourceKind;
    ttlMs?: number;
  },
): RuntimeLockAcquireInput {
  return {
    resourceId: createBackgroundOperationDedupeKey(input),
    resourceKind: input.resourceKind ?? "background-operation",
    ...(input.ttlMs === undefined ? {} : { ttlMs: input.ttlMs }),
  };
}

export function createBackgroundOperationQueuePressureInput(
  input: BackgroundOperationCoordinationInput & {
    count?: number;
    event: RuntimeQueuePressureEvent;
    now?: Date;
    workKind: RuntimeQueueWorkKind;
  },
): RuntimeQueuePressureRecordInput {
  return {
    event: input.event,
    scopeId: input.scopeId,
    workKind: input.workKind,
    ...(input.count === undefined ? {} : { count: input.count }),
    ...(input.now === undefined ? {} : { now: input.now }),
  };
}

export function createBackgroundOperationCacheInvalidationInput(input: {
  scopeId: string;
  trigger: RuntimeCacheInvalidationTrigger;
}): RuntimeCacheInvalidationInput {
  return {
    scopeId: input.scopeId,
    trigger: input.trigger,
  };
}
