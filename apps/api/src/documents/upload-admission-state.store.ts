import { RedisConnection } from "bullmq";
import type { RuntimeConfig } from "@fococontext/core";

export const uploadAdmissionStateStoreToken = Symbol("uploadAdmissionStateStore");

const uploadAdmissionLeaseTtlSecondsFloor = 60;

export interface UploadAdmissionStateStore {
  acquireMultipartLease(input: UploadAdmissionStateLeaseInput): Promise<UploadAdmissionStateLease>;
  getMultipartSnapshot(
    input: UploadAdmissionStateSnapshotInput,
  ): Promise<UploadAdmissionStateSnapshot>;
  close?(): Promise<void>;
}

export interface UploadAdmissionStateLeaseInput {
  limit: number;
  leaseTtlSeconds: number;
}

export interface UploadAdmissionStateLease {
  active: number;
  release(): Promise<void>;
}

export interface UploadAdmissionStateSnapshotInput {
  limit: number;
}

export interface UploadAdmissionStateSnapshot {
  active: number;
  backend: "redis" | "local";
}

export function createRedisUploadAdmissionStateStore(
  config: RuntimeConfig,
): UploadAdmissionStateStore {
  return new RedisUploadAdmissionStateStore(config);
}

export class RedisUploadAdmissionStateStore implements UploadAdmissionStateStore {
  private readonly connection: RedisConnection;
  private readonly key = "fococontext:upload-admission:multipart:global";

  constructor(config: RuntimeConfig) {
    this.connection = new RedisConnection({
      url: config.redis.url,
    });
  }

  async acquireMultipartLease(
    input: UploadAdmissionStateLeaseInput,
  ): Promise<UploadAdmissionStateLease> {
    const client = await this.connection.client;
    const active = Number(await client.runCommand("incr", [this.key]));
    const leaseTtlSeconds = Math.max(
      uploadAdmissionLeaseTtlSecondsFloor,
      Math.ceil(input.leaseTtlSeconds),
    );

    await client.runCommand("expire", [this.key, String(leaseTtlSeconds)]);

    if (active > input.limit) {
      await this.releaseMultipartLease();
    }

    let released = false;

    return {
      active,
      release: async () => {
        if (released) {
          return;
        }

        released = true;
        await this.releaseMultipartLease();
      },
    };
  }

  async getMultipartSnapshot(): Promise<UploadAdmissionStateSnapshot> {
    const client = await this.connection.client;
    const value = await client.runCommand("get", [this.key]);

    return {
      active: readCounter(value),
      backend: "redis",
    };
  }

  async close(): Promise<void> {
    await this.connection.close();
  }

  private async releaseMultipartLease(): Promise<void> {
    const client = await this.connection.client;
    const nextValue = Number(await client.runCommand("decr", [this.key]));

    if (!Number.isFinite(nextValue) || nextValue < 0) {
      await client.runCommand("set", [this.key, "0"]);
    }
  }
}

export class LocalUploadAdmissionStateStore implements UploadAdmissionStateStore {
  private active = 0;

  async acquireMultipartLease(
    input: UploadAdmissionStateLeaseInput,
  ): Promise<UploadAdmissionStateLease> {
    this.active += 1;
    const active = this.active;
    let released = false;

    if (active > input.limit) {
      this.active = Math.max(0, this.active - 1);
    }

    return {
      active,
      release: async () => {
        if (released) {
          return;
        }

        released = true;
        this.active = Math.max(0, this.active - 1);
      },
    };
  }

  async getMultipartSnapshot(): Promise<UploadAdmissionStateSnapshot> {
    return {
      active: this.active,
      backend: "local",
    };
  }
}

function readCounter(value: unknown): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? Math.max(0, value) : 0;
  }
  if (typeof value === "string") {
    const parsed = Number(value);

    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
  }

  return 0;
}
