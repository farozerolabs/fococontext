export const runtimeCacheResourceKinds = [
  "runtime-status",
  "graph-readiness",
  "retrieval-readiness",
  "admin-summary",
] as const;

export type RuntimeCacheResourceKind = (typeof runtimeCacheResourceKinds)[number];

export type RuntimeCacheInvalidationTrigger =
  | "ingest-completed"
  | "deletion-completed"
  | "settings-updated"
  | "fork-sync-completed"
  | "version-created"
  | "graph-refresh-completed"
  | "cleanup-completed";

export interface RuntimeCacheKeyInput {
  resourceKind: RuntimeCacheResourceKind;
  scopeId: string;
  variant?: string;
}

export interface RuntimeCacheSetInput<TValue> extends RuntimeCacheKeyInput {
  ttlSeconds?: number;
  value: TValue;
}

export interface RuntimeCache {
  get<TValue>(input: RuntimeCacheKeyInput): Promise<TValue | null>;
  set<TValue>(input: RuntimeCacheSetInput<TValue>): Promise<void>;
  delete(input: RuntimeCacheKeyInput): Promise<boolean>;
  invalidate(input: RuntimeCacheInvalidationInput): Promise<RuntimeCacheInvalidationResult>;
}

export interface RuntimeCacheInvalidationInput {
  scopeId: string;
  trigger: RuntimeCacheInvalidationTrigger;
}

export interface RuntimeCacheInvalidationResult {
  deleted: number;
  keys: string[];
  resourceKinds: RuntimeCacheResourceKind[];
}

export interface RuntimeCacheMetricSummary {
  byResourceKind: Record<
    RuntimeCacheResourceKind,
    {
      deletes: number;
      expiredMisses: number;
      hits: number;
      invalidatedKeys: number;
      invalidations: number;
      misses: number;
      sets: number;
    }
  >;
  totals: {
    deletes: number;
    expiredMisses: number;
    hits: number;
    invalidatedKeys: number;
    invalidations: number;
    misses: number;
    sets: number;
  };
}

export const runtimeCacheDefaultTtlSeconds = {
  "runtime-status": 30,
  "retrieval-readiness": 60,
  "admin-summary": 120,
  "graph-readiness": 300,
} as const satisfies Record<RuntimeCacheResourceKind, number>;

export const runtimeCacheInvalidationPlan = {
  "ingest-completed": ["admin-summary", "graph-readiness", "retrieval-readiness", "runtime-status"],
  "deletion-completed": [
    "admin-summary",
    "graph-readiness",
    "retrieval-readiness",
    "runtime-status",
  ],
  "settings-updated": ["admin-summary", "retrieval-readiness", "runtime-status"],
  "fork-sync-completed": ["admin-summary", "graph-readiness", "retrieval-readiness"],
  "version-created": ["admin-summary", "graph-readiness", "retrieval-readiness"],
  "graph-refresh-completed": ["admin-summary", "graph-readiness", "retrieval-readiness"],
  "cleanup-completed": ["admin-summary", "runtime-status"],
} as const satisfies Record<RuntimeCacheInvalidationTrigger, readonly RuntimeCacheResourceKind[]>;

export function createRuntimeCacheKey(input: RuntimeCacheKeyInput): string {
  const base = `fococontext:runtime-cache:${input.resourceKind}:${encodeURIComponent(
    input.scopeId,
  )}`;

  if (input.variant === undefined || input.variant.length === 0) {
    return base;
  }

  return `${base}:${encodeURIComponent(input.variant)}`;
}

export function normalizeRuntimeCacheTtlSeconds(
  resourceKind: RuntimeCacheResourceKind,
  ttlSeconds?: number,
): number {
  if (ttlSeconds === undefined || !Number.isFinite(ttlSeconds)) {
    return runtimeCacheDefaultTtlSeconds[resourceKind];
  }

  return Math.max(1, Math.floor(ttlSeconds));
}
