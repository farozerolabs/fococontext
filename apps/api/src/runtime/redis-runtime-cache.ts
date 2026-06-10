import { RedisConnection } from "bullmq";
import {
  createRuntimeCacheKey,
  normalizeRuntimeCacheTtlSeconds,
  recordRuntimeCacheMetric,
  runtimeCacheInvalidationPlan,
  type RuntimeCache,
  type RuntimeCacheInvalidationInput,
  type RuntimeCacheInvalidationResult,
  type RuntimeCacheKeyInput,
  type RuntimeCacheResourceKind,
  type RuntimeCacheSetInput,
  type RuntimeConfig,
} from "@fococontext/core";

const cacheIndexTtlSeconds = 24 * 60 * 60;

export function createRedisRuntimeCache(config: RuntimeConfig): RuntimeCache {
  return new RedisRuntimeCache(config);
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
      recordRuntimeCacheMetric({
        event: "miss",
        resourceKind: input.resourceKind,
      });

      return null;
    }

    recordRuntimeCacheMetric({
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
    recordRuntimeCacheMetric({
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
      recordRuntimeCacheMetric({
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
      recordRuntimeCacheMetric({
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
