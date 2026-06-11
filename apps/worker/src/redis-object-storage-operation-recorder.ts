import { RedisConnection } from "bullmq";
import type { RuntimeConfig } from "@fococontext/core";
import type {
  ObjectStorageOperationRecord,
  ObjectStorageOperationRecorder,
} from "@fococontext/storage";

const objectStorageMetricsKey = "fococontext:object-storage-operation-metrics";
const objectStorageMetricsMaxRecords = 5_000;
const objectStorageMetricsTtlSeconds = 24 * 60 * 60;

export interface RedisObjectStorageOperationRecorder extends ObjectStorageOperationRecorder {
  readonly backend: "redis";
  close(): Promise<void>;
  snapshotAsync(windowSeconds?: number): Promise<ObjectStorageOperationRecord[]>;
}

export function createRedisObjectStorageOperationRecorder(
  config: RuntimeConfig,
): RedisObjectStorageOperationRecorder {
  return new RedisObjectStorageOperationRecorderImpl(config);
}

class RedisObjectStorageOperationRecorderImpl implements RedisObjectStorageOperationRecorder {
  readonly backend = "redis";

  private readonly connection: RedisConnection;

  constructor(config: RuntimeConfig) {
    this.connection = new RedisConnection({
      url: config.redis.url,
    });
  }

  record(record: ObjectStorageOperationRecord): void {
    void this.recordAsync(record);
  }

  snapshot(_windowSeconds?: number): ObjectStorageOperationRecord[] {
    void _windowSeconds;

    return [];
  }

  async snapshotAsync(windowSeconds?: number): Promise<ObjectStorageOperationRecord[]> {
    const client = await this.connection.client;
    const values = await client.runCommand("lrange", [objectStorageMetricsKey, "0", "-1"]);
    const cutoffMs =
      windowSeconds === undefined ? 0 : Date.now() - Math.max(1, windowSeconds) * 1000;

    return readOperationRecords(values).filter((record) => Date.parse(record.at) >= cutoffMs);
  }

  reset(): void {
    void this.resetAsync();
  }

  async close(): Promise<void> {
    await this.connection.close();
  }

  private async recordAsync(record: ObjectStorageOperationRecord): Promise<void> {
    const client = await this.connection.client;

    await client.runCommand("rpush", [objectStorageMetricsKey, JSON.stringify(record)]);
    await client.runCommand("ltrim", [
      objectStorageMetricsKey,
      String(-objectStorageMetricsMaxRecords),
      "-1",
    ]);
    await client.runCommand("expire", [
      objectStorageMetricsKey,
      String(objectStorageMetricsTtlSeconds),
    ]);
  }

  private async resetAsync(): Promise<void> {
    const client = await this.connection.client;

    await client.runCommand("del", [objectStorageMetricsKey]);
  }
}

function readOperationRecords(value: unknown): ObjectStorageOperationRecord[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (typeof item !== "string") {
      return [];
    }

    try {
      const parsed = JSON.parse(item) as Partial<ObjectStorageOperationRecord>;

      if (
        typeof parsed.at !== "string" ||
        typeof parsed.operation !== "string" ||
        typeof parsed.caller !== "string" ||
        typeof parsed.scope !== "string" ||
        typeof parsed.status !== "string" ||
        typeof parsed.latencyMs !== "number" ||
        typeof parsed.retryCount !== "number"
      ) {
        return [];
      }

      return [
        {
          at: parsed.at,
          operation: parsed.operation,
          operationClass:
            parsed.operationClass === "class_a" ||
            parsed.operationClass === "class_b" ||
            parsed.operationClass === "free" ||
            parsed.operationClass === "unknown"
              ? parsed.operationClass
              : "unknown",
          caller: parsed.caller,
          scope: parsed.scope === "source_watch" ? "source_watch" : "system",
          status: parsed.status === "error" ? "error" : "success",
          latencyMs: parsed.latencyMs,
          retryCount: parsed.retryCount,
          ...(typeof parsed.contentLength === "number"
            ? { contentLength: parsed.contentLength }
            : {}),
          ...(typeof parsed.errorName === "string" ? { errorName: parsed.errorName } : {}),
          ...(typeof parsed.errorCode === "string" ? { errorCode: parsed.errorCode } : {}),
        },
      ];
    } catch {
      return [];
    }
  });
}
