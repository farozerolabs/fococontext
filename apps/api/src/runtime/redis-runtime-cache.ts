import { RedisConnection } from "bullmq";
import {
  createRuntimeCacheKey,
  normalizeRuntimeCacheTtlSeconds,
  runtimeCacheInvalidationPlan,
  runtimeCacheResourceKinds,
  type RuntimeCache,
  type RuntimeCacheInvalidationInput,
  type RuntimeCacheInvalidationResult,
  type RuntimeCacheKeyInput,
  type RuntimeCacheMetricSummary,
  type RuntimeCacheResourceKind,
  type RuntimeCacheSetInput,
  type RuntimeConfig,
} from "@fococontext/core";

const cacheIndexTtlSeconds = 24 * 60 * 60;
const cacheMetricsKey = "fococontext:runtime-cache-metrics";
const cacheMetricsMaxRecords = 2_000;
const cacheMetricsTtlSeconds = 24 * 60 * 60;

type RuntimeCacheMetricEvent = "delete" | "expired_miss" | "hit" | "invalidation" | "miss" | "set";

interface RuntimeCacheMetricRecord {
  deletedCount: number;
  event: RuntimeCacheMetricEvent;
  resourceKind: RuntimeCacheResourceKind;
  timestampMs: number;
}

export interface RuntimeCacheMetricsStore {
  readonly backend: "redis";
  close?(): Promise<void>;
  record(input: {
    deletedCount?: number;
    event: RuntimeCacheMetricEvent;
    resourceKind: RuntimeCacheResourceKind;
  }): Promise<void>;
  reset?(): Promise<void>;
  snapshot(): Promise<RuntimeCacheMetricSummary>;
}

export const runtimeCacheMetricsStoreToken = Symbol("runtimeCacheMetricsStore");
export const runtimeCacheToken = Symbol("runtimeCache");

export function createRedisRuntimeCache(config: RuntimeConfig): RuntimeCache {
  return new RedisRuntimeCache(config);
}

export function createRedisRuntimeCacheMetricsStore(
  config: RuntimeConfig,
): RuntimeCacheMetricsStore {
  return new RedisRuntimeCacheMetricsStore(config);
}

export class RedisRuntimeCache implements RuntimeCache {
  private readonly connection: RedisConnection;

  constructor(config: RuntimeConfig) {
    this.connection = new RedisConnection({
      url: config.redis.url,
    });
  }

  async get<TValue>(input: RuntimeCacheKeyInput): Promise<TValue | null> {
    const client = await this.connection.client;
    const result = await client.runCommand("get", [createRuntimeCacheKey(input)]);

    if (typeof result !== "string") {
      await this.recordMetric({
        event: "miss",
        resourceKind: input.resourceKind,
      });

      return null;
    }

    await this.recordMetric({
      event: "hit",
      resourceKind: input.resourceKind,
    });

    return JSON.parse(result) as TValue;
  }

  async set<TValue>(input: RuntimeCacheSetInput<TValue>): Promise<void> {
    const client = await this.connection.client;
    const key = createRuntimeCacheKey(input);
    const ttlSeconds = normalizeRuntimeCacheTtlSeconds(input.resourceKind, input.ttlSeconds);
    const indexKey = createRuntimeCacheIndexKey(input.scopeId);

    await client.runCommand("set", [key, JSON.stringify(input.value), "EX", String(ttlSeconds)]);
    await client.runCommand("sadd", [indexKey, key]);
    await client.runCommand("expire", [indexKey, String(cacheIndexTtlSeconds)]);
    await this.recordMetric({
      event: "set",
      resourceKind: input.resourceKind,
    });
  }

  async delete(input: RuntimeCacheKeyInput): Promise<boolean> {
    const client = await this.connection.client;
    const key = createRuntimeCacheKey(input);
    const deleted = await client.runCommand("del", [key]);

    await client.runCommand("srem", [createRuntimeCacheIndexKey(input.scopeId), key]);

    if (Number(deleted) > 0) {
      await this.recordMetric({
        event: "delete",
        resourceKind: input.resourceKind,
      });
    }

    return Number(deleted) > 0;
  }

  async invalidate(input: RuntimeCacheInvalidationInput): Promise<RuntimeCacheInvalidationResult> {
    const client = await this.connection.client;
    const resourceKinds = [...runtimeCacheInvalidationPlan[input.trigger]];
    const indexKey = createRuntimeCacheIndexKey(input.scopeId);
    const indexedKeys = await client.runCommand("smembers", [indexKey]);
    const keys = readStringArray(indexedKeys).filter((key) =>
      resourceKinds.some((resourceKind) =>
        key.startsWith(createRuntimeCacheKeyPrefix(input.scopeId, resourceKind)),
      ),
    );

    if (keys.length === 0) {
      return {
        deleted: 0,
        keys: [],
        resourceKinds,
      };
    }

    const deleted = Number(await client.runCommand("del", keys));

    await client.runCommand("srem", [indexKey, ...keys]);
    for (const resourceKind of resourceKinds) {
      await this.recordMetric({
        deletedCount: keys.filter((key) =>
          key.startsWith(createRuntimeCacheKeyPrefix(input.scopeId, resourceKind)),
        ).length,
        event: "invalidation",
        resourceKind,
      });
    }

    return {
      deleted,
      keys,
      resourceKinds,
    };
  }

  async close(): Promise<void> {
    await this.connection.close();
  }

  private async recordMetric(input: {
    deletedCount?: number;
    event: RuntimeCacheMetricEvent;
    resourceKind: RuntimeCacheResourceKind;
  }): Promise<void> {
    const client = await this.connection.client;
    const record: RuntimeCacheMetricRecord = {
      deletedCount:
        input.deletedCount === undefined || !Number.isFinite(input.deletedCount)
          ? 0
          : Math.max(0, Math.floor(input.deletedCount)),
      event: input.event,
      resourceKind: input.resourceKind,
      timestampMs: Date.now(),
    };

    await client.runCommand("rpush", [cacheMetricsKey, JSON.stringify(record)]);
    await client.runCommand("ltrim", [cacheMetricsKey, String(-cacheMetricsMaxRecords), "-1"]);
    await client.runCommand("expire", [cacheMetricsKey, String(cacheMetricsTtlSeconds)]);
  }
}

class RedisRuntimeCacheMetricsStore implements RuntimeCacheMetricsStore {
  readonly backend = "redis";

  private readonly connection: RedisConnection;

  constructor(config: RuntimeConfig) {
    this.connection = new RedisConnection({
      url: config.redis.url,
    });
  }

  async record(input: {
    deletedCount?: number;
    event: RuntimeCacheMetricEvent;
    resourceKind: RuntimeCacheResourceKind;
  }): Promise<void> {
    const client = await this.connection.client;
    const record: RuntimeCacheMetricRecord = {
      deletedCount:
        input.deletedCount === undefined || !Number.isFinite(input.deletedCount)
          ? 0
          : Math.max(0, Math.floor(input.deletedCount)),
      event: input.event,
      resourceKind: input.resourceKind,
      timestampMs: Date.now(),
    };

    await client.runCommand("rpush", [cacheMetricsKey, JSON.stringify(record)]);
    await client.runCommand("ltrim", [cacheMetricsKey, String(-cacheMetricsMaxRecords), "-1"]);
    await client.runCommand("expire", [cacheMetricsKey, String(cacheMetricsTtlSeconds)]);
  }

  async snapshot(): Promise<RuntimeCacheMetricSummary> {
    const client = await this.connection.client;
    const values = await client.runCommand("lrange", [cacheMetricsKey, "0", "-1"]);

    return summarizeRuntimeCacheMetricRecords(readMetricRecords(values));
  }

  async reset(): Promise<void> {
    const client = await this.connection.client;

    await client.runCommand("del", [cacheMetricsKey]);
  }

  async close(): Promise<void> {
    await this.connection.close();
  }
}

function createRuntimeCacheIndexKey(scopeId: string): string {
  return `fococontext:runtime-cache-index:${encodeURIComponent(scopeId)}`;
}

function createRuntimeCacheKeyPrefix(
  scopeId: string,
  resourceKind: RuntimeCacheResourceKind,
): string {
  return createRuntimeCacheKey({
    resourceKind,
    scopeId,
  });
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
}

function readMetricRecords(value: unknown): RuntimeCacheMetricRecord[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (typeof item !== "string") {
      return [];
    }

    try {
      const parsed = JSON.parse(item) as Partial<RuntimeCacheMetricRecord>;

      if (
        parsed.event === undefined ||
        parsed.resourceKind === undefined ||
        !runtimeCacheResourceKinds.includes(parsed.resourceKind)
      ) {
        return [];
      }

      return [
        {
          deletedCount:
            typeof parsed.deletedCount === "number" && Number.isFinite(parsed.deletedCount)
              ? Math.max(0, Math.floor(parsed.deletedCount))
              : 0,
          event: parsed.event,
          resourceKind: parsed.resourceKind,
          timestampMs:
            typeof parsed.timestampMs === "number" && Number.isFinite(parsed.timestampMs)
              ? parsed.timestampMs
              : 0,
        },
      ];
    } catch {
      return [];
    }
  });
}

function summarizeRuntimeCacheMetricRecords(
  records: readonly RuntimeCacheMetricRecord[],
): RuntimeCacheMetricSummary {
  const summary = createEmptyRuntimeCacheMetricSummary();

  for (const record of records) {
    const resource = summary.byResourceKind[record.resourceKind];

    if (record.event === "hit") {
      resource.hits += 1;
      summary.totals.hits += 1;
      continue;
    }

    if (record.event === "miss") {
      resource.misses += 1;
      summary.totals.misses += 1;
      continue;
    }

    if (record.event === "expired_miss") {
      resource.expiredMisses += 1;
      summary.totals.expiredMisses += 1;
      resource.misses += 1;
      summary.totals.misses += 1;
      continue;
    }

    if (record.event === "set") {
      resource.sets += 1;
      summary.totals.sets += 1;
      continue;
    }

    if (record.event === "delete") {
      resource.deletes += 1;
      summary.totals.deletes += 1;
      continue;
    }

    resource.invalidations += 1;
    summary.totals.invalidations += 1;
    resource.invalidatedKeys += record.deletedCount;
    summary.totals.invalidatedKeys += record.deletedCount;
  }

  return summary;
}

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
