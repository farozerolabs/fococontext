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

export function snapshotRuntimeCacheMetrics(): RuntimeCacheMetricSummary {
  return cloneRuntimeCacheMetricSummary(runtimeCacheMetricSummary);
}

export function resetRuntimeCacheMetrics(): void {
  runtimeCacheMetricSummary = createEmptyRuntimeCacheMetricSummary();
}

export function recordRuntimeCacheMetric(input: {
  deletedCount?: number;
  event: "delete" | "expired_miss" | "hit" | "invalidation" | "miss" | "set";
  resourceKind: RuntimeCacheResourceKind;
}): void {
  const resource = runtimeCacheMetricSummary.byResourceKind[input.resourceKind];
  const deletedCount =
    input.deletedCount === undefined || !Number.isFinite(input.deletedCount)
      ? 0
      : Math.max(0, Math.floor(input.deletedCount));

  if (input.event === "hit") {
    resource.hits += 1;
    runtimeCacheMetricSummary.totals.hits += 1;
    return;
  }
  if (input.event === "miss") {
    resource.misses += 1;
    runtimeCacheMetricSummary.totals.misses += 1;
    return;
  }
  if (input.event === "expired_miss") {
    resource.expiredMisses += 1;
    runtimeCacheMetricSummary.totals.expiredMisses += 1;
    resource.misses += 1;
    runtimeCacheMetricSummary.totals.misses += 1;
    return;
  }
  if (input.event === "set") {
    resource.sets += 1;
    runtimeCacheMetricSummary.totals.sets += 1;
    return;
  }
  if (input.event === "delete") {
    resource.deletes += 1;
    runtimeCacheMetricSummary.totals.deletes += 1;
    return;
  }

  resource.invalidations += 1;
  runtimeCacheMetricSummary.totals.invalidations += 1;
  resource.invalidatedKeys += deletedCount;
  runtimeCacheMetricSummary.totals.invalidatedKeys += deletedCount;
}

export class InMemoryRuntimeCache implements RuntimeCache {
  private readonly entries = new Map<
    string,
    {
      expiresAtMs: number;
      input: RuntimeCacheKeyInput;
      value: unknown;
    }
  >();

  constructor(private readonly now: () => Date = () => new Date()) {}

  async get<TValue>(input: RuntimeCacheKeyInput): Promise<TValue | null> {
    const key = createRuntimeCacheKey(input);
    const entry = this.entries.get(key);

    if (entry === undefined) {
      recordRuntimeCacheMetric({
        event: "miss",
        resourceKind: input.resourceKind,
      });

      return null;
    }
    if (entry.expiresAtMs <= this.now().getTime()) {
      this.entries.delete(key);
      recordRuntimeCacheMetric({
        event: "expired_miss",
        resourceKind: input.resourceKind,
      });

      return null;
    }

    recordRuntimeCacheMetric({
      event: "hit",
      resourceKind: input.resourceKind,
    });

    return entry.value as TValue;
  }

  async set<TValue>(input: RuntimeCacheSetInput<TValue>): Promise<void> {
    const key = createRuntimeCacheKey(input);
    const ttlSeconds = normalizeRuntimeCacheTtlSeconds(input.resourceKind, input.ttlSeconds);

    this.entries.set(key, {
      expiresAtMs: this.now().getTime() + ttlSeconds * 1000,
      input: {
        resourceKind: input.resourceKind,
        scopeId: input.scopeId,
        ...(input.variant === undefined ? {} : { variant: input.variant }),
      },
      value: input.value,
    });
    recordRuntimeCacheMetric({
      event: "set",
      resourceKind: input.resourceKind,
    });
  }

  async delete(input: RuntimeCacheKeyInput): Promise<boolean> {
    const deleted = this.entries.delete(createRuntimeCacheKey(input));

    if (deleted) {
      recordRuntimeCacheMetric({
        event: "delete",
        resourceKind: input.resourceKind,
      });
    }

    return deleted;
  }

  async invalidate(input: RuntimeCacheInvalidationInput): Promise<RuntimeCacheInvalidationResult> {
    const resourceKinds = [...runtimeCacheInvalidationPlan[input.trigger]];
    const keys: string[] = [];

    for (const [key, entry] of this.entries) {
      if (entry.input.scopeId !== input.scopeId) {
        continue;
      }
      if (!resourceKinds.includes(entry.input.resourceKind)) {
        continue;
      }

      this.entries.delete(key);
      keys.push(key);
    }
    for (const resourceKind of resourceKinds) {
      recordRuntimeCacheMetric({
        deletedCount: keys.filter((key) =>
          key.startsWith(
            createRuntimeCacheKey({
              resourceKind,
              scopeId: input.scopeId,
            }),
          ),
        ).length,
        event: "invalidation",
        resourceKind,
      });
    }

    return {
      deleted: keys.length,
      keys,
      resourceKinds,
    };
  }
}

let runtimeCacheMetricSummary = createEmptyRuntimeCacheMetricSummary();

function createEmptyRuntimeCacheMetricSummary(): RuntimeCacheMetricSummary {
  return {
    byResourceKind: Object.fromEntries(
      runtimeCacheResourceKinds.map((resourceKind) => [
        resourceKind,
        {
          deletes: 0,
          expiredMisses: 0,
          hits: 0,
          invalidatedKeys: 0,
          invalidations: 0,
          misses: 0,
          sets: 0,
        },
      ]),
    ) as RuntimeCacheMetricSummary["byResourceKind"],
    totals: {
      deletes: 0,
      expiredMisses: 0,
      hits: 0,
      invalidatedKeys: 0,
      invalidations: 0,
      misses: 0,
      sets: 0,
    },
  };
}

function cloneRuntimeCacheMetricSummary(
  summary: RuntimeCacheMetricSummary,
): RuntimeCacheMetricSummary {
  return {
    byResourceKind: Object.fromEntries(
      runtimeCacheResourceKinds.map((resourceKind) => [
        resourceKind,
        {
          ...summary.byResourceKind[resourceKind],
        },
      ]),
    ) as RuntimeCacheMetricSummary["byResourceKind"],
    totals: {
      ...summary.totals,
    },
  };
}
