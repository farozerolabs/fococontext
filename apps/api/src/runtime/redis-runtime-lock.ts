import { randomUUID } from "node:crypto";
import { RedisConnection } from "bullmq";
import {
  createRuntimeLockKey,
  normalizeTtlMs,
  type RuntimeConfig,
  type RuntimeLock,
  type RuntimeLockAcquireInput,
  type RuntimeLockLease,
} from "@fococontext/core";

export function createRedisRuntimeLock(config: RuntimeConfig): RuntimeLock {
  return new RedisRuntimeLock(config);
}

export class RedisRuntimeLock implements RuntimeLock {
  private readonly connection: RedisConnection;
  private scriptsDefined = false;

  constructor(config: RuntimeConfig) {
    this.connection = new RedisConnection({
      url: config.redis.url,
    });
  }

  async acquire(input: RuntimeLockAcquireInput): Promise<RuntimeLockLease | null> {
    const ttlMs = normalizeTtlMs(input.ttlMs);
    const key = createRuntimeLockKey(input);
    const token = randomUUID();
    const client = await this.connection.client;

    this.defineCommands(client);
    const result = await client.runCommand("fococontextAcquireRuntimeLock", [
      key,
      token,
      String(ttlMs),
    ]);

    if (Number(result) !== 1) {
      return null;
    }

    return {
      expiresAt: new Date(Date.now() + ttlMs),
      key,
      token,
    };
  }

  async refresh(lease: RuntimeLockLease, ttlMs?: number): Promise<boolean> {
    const normalizedTtlMs = normalizeTtlMs(ttlMs);
    const client = await this.connection.client;

    this.defineCommands(client);
    const result = await client.runCommand("fococontextRefreshRuntimeLock", [
      lease.key,
      lease.token,
      String(normalizedTtlMs),
    ]);

    if (Number(result) !== 1) {
      return false;
    }

    lease.expiresAt = new Date(Date.now() + normalizedTtlMs);

    return true;
  }

  async release(lease: RuntimeLockLease): Promise<boolean> {
    const client = await this.connection.client;

    this.defineCommands(client);
    const result = await client.runCommand("fococontextReleaseRuntimeLock", [
      lease.key,
      lease.token,
    ]);

    return Number(result) === 1;
  }

  async close(): Promise<void> {
    await this.connection.close();
  }

  private defineCommands(client: Awaited<RedisConnection["client"]>): void {
    if (this.scriptsDefined) {
      return;
    }

    client.defineCommand("fococontextAcquireRuntimeLock", {
      numberOfKeys: 1,
      lua: "if redis.call('set', KEYS[1], ARGV[1], 'PX', ARGV[2], 'NX') then return 1 else return 0 end",
    });
    client.defineCommand("fococontextRefreshRuntimeLock", {
      numberOfKeys: 1,
      lua: "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('pexpire', KEYS[1], ARGV[2]) else return 0 end",
    });
    client.defineCommand("fococontextReleaseRuntimeLock", {
      numberOfKeys: 1,
      lua: "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
    });

    this.scriptsDefined = true;
  }
}
