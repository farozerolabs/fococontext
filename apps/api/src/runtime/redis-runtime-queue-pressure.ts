import { RedisConnection } from "bullmq";
import {
  applyQueuePressureEvent,
  classifyRuntimeQueuePressure,
  createRuntimeQueuePressureKey,
  runtimeQueueWorkKinds,
  sumQueuePressureCounters,
  type RuntimeConfig,
  type RuntimeQueuePressureCounter,
  type RuntimeQueuePressureRecordInput,
  type RuntimeQueuePressureRecorder,
  type RuntimeQueuePressureSnapshotInput,
  type RuntimeQueuePressureSummary,
  type RuntimeQueuePressureThresholds,
  type RuntimeQueueWorkKind,
} from "@fococontext/core";

const queuePressureCounterTtlSeconds = 24 * 60 * 60;

export function createRedisRuntimeQueuePressureRecorder(
  config: RuntimeConfig,
): RuntimeQueuePressureRecorder {
  return new RedisRuntimeQueuePressureRecorder(config);
}

export const runtimeQueuePressureRecorderToken = Symbol("runtimeQueuePressureRecorder");

export class RedisRuntimeQueuePressureRecorder implements RuntimeQueuePressureRecorder {
  private readonly connection: RedisConnection;

  constructor(config: RuntimeConfig) {
    this.connection = new RedisConnection({
      url: config.redis.url,
    });
  }

  async record(input: RuntimeQueuePressureRecordInput): Promise<void> {
    const client = await this.connection.client;
    const key = createRuntimeQueuePressureKey(input);
    const counter = await this.readCounter(input.scopeId, input.workKind);

    applyQueuePressureEvent(counter, input.event, input.count ?? 1);

    await client.runCommand("hmset", [
      key,
      "active",
      String(counter.active),
      "backpressureCount",
      String(counter.backpressureCount),
      "completed",
      String(counter.completed),
      "failed",
      String(counter.failed),
      "lastEventAt",
      (input.now ?? new Date()).toISOString(),
      "queued",
      String(counter.queued),
      "retried",
      String(counter.retried),
      "workKind",
      input.workKind,
    ]);
    await client.runCommand("expire", [key, String(queuePressureCounterTtlSeconds)]);
  }

  async snapshot(
    input: RuntimeQueuePressureSnapshotInput,
    thresholds: Partial<RuntimeQueuePressureThresholds> = {},
  ): Promise<RuntimeQueuePressureSummary> {
    const workKinds = input.workKinds ?? runtimeQueueWorkKinds;
    const counters = await Promise.all(
      workKinds.map((workKind) => this.readCounter(input.scopeId, workKind)),
    );
    const totals = sumQueuePressureCounters(counters);

    return {
      counters,
      pressure: classifyRuntimeQueuePressure(totals, thresholds),
      scopeId: input.scopeId,
      totals,
    };
  }

  async close(): Promise<void> {
    await this.connection.close();
  }

  private async readCounter(
    scopeId: string,
    workKind: RuntimeQueueWorkKind,
  ): Promise<RuntimeQueuePressureCounter> {
    const client = await this.connection.client;
    const value = await client.runCommand("hgetall", [
      createRuntimeQueuePressureKey({
        scopeId,
        workKind,
      }),
    ]);
    const record = readRedisHash(value);

    return {
      active: readNumber(record.active),
      backpressureCount: readNumber(record.backpressureCount),
      completed: readNumber(record.completed),
      failed: readNumber(record.failed),
      lastEventAt: typeof record.lastEventAt === "string" ? record.lastEventAt : null,
      queued: readNumber(record.queued),
      retried: readNumber(record.retried),
      workKind,
    };
  }
}

function readRedisHash(value: unknown): Record<string, unknown> {
  if (Array.isArray(value)) {
    const record: Record<string, unknown> = {};

    for (let index = 0; index < value.length; index += 2) {
      const key = value[index];

      if (typeof key === "string") {
        record[key] = value[index + 1];
      }
    }

    return record;
  }
  if (typeof value === "object" && value !== null) {
    return value as Record<string, unknown>;
  }

  return {};
}

function readNumber(value: unknown): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }
  if (typeof value === "string") {
    const parsed = Number(value);

    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}
