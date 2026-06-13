import {
  normalizeTtlMs,
  type RuntimeConfig,
  type RuntimeLock,
  type RuntimeLockLease,
} from "@fococontext/core";
import { createRedisRuntimeLock } from "../runtime/redis-runtime-lock.js";

export const sourceWatchScanCoordinatorToken = Symbol("sourceWatchScanCoordinator");

export interface SourceWatchScanCoordinator {
  runExclusive<T>(input: SourceWatchScanCoordinatorRunInput<T>): Promise<T>;
  close?(): Promise<void>;
}

export interface SourceWatchScanCoordinatorRunInput<T> {
  ruleId: string;
  onConflict: () => Promise<T> | T;
  run: () => Promise<T>;
}

export function createRedisSourceWatchScanCoordinator(
  config: RuntimeConfig,
): SourceWatchScanCoordinator {
  return new RuntimeLockSourceWatchScanCoordinator(createRedisRuntimeLock(config));
}

class RuntimeLockSourceWatchScanCoordinator implements SourceWatchScanCoordinator {
  private readonly ttlMs = 30 * 60 * 1000;

  constructor(private readonly lock: RuntimeLock) {}

  async runExclusive<T>(input: SourceWatchScanCoordinatorRunInput<T>): Promise<T> {
    const lease = await this.lock.acquire({
      resourceId: input.ruleId,
      resourceKind: "source-watch-scan",
      ttlMs: this.ttlMs,
    });

    if (lease === null) {
      return input.onConflict();
    }

    const heartbeat = this.startHeartbeat(lease);

    try {
      return await input.run();
    } finally {
      clearInterval(heartbeat);
      await this.lock.release(lease);
    }
  }

  async close(): Promise<void> {
    await this.lock.close?.();
  }

  private startHeartbeat(lease: RuntimeLockLease): NodeJS.Timeout {
    const intervalMs = Math.max(1000, Math.floor(normalizeTtlMs(this.ttlMs) / 3));
    const heartbeat = setInterval(() => {
      void this.lock.refresh(lease, this.ttlMs);
    }, intervalMs);

    heartbeat.unref();

    return heartbeat;
  }
}
