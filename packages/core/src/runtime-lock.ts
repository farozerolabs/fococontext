import { randomUUID } from "node:crypto";

export const runtimeLockResourceKinds = [
  "source-watch-scan",
  "graph-refresh",
  "knowledge-check-run",
  "deletion-cleanup-operation",
  "migration-one-shot",
] as const;

export type RuntimeLockResourceKind = (typeof runtimeLockResourceKinds)[number];

export interface RuntimeLockKeyInput {
  resourceKind: RuntimeLockResourceKind;
  resourceId: string;
}

export interface RuntimeLockAcquireInput extends RuntimeLockKeyInput {
  ttlMs?: number;
}

export interface RuntimeLockLease {
  key: string;
  token: string;
  expiresAt: Date;
}

export interface RuntimeLock {
  acquire(input: RuntimeLockAcquireInput): Promise<RuntimeLockLease | null>;
  refresh(lease: RuntimeLockLease, ttlMs?: number): Promise<boolean>;
  release(lease: RuntimeLockLease): Promise<boolean>;
  close?(): Promise<void>;
}

export interface RunWithRuntimeLockInput<T> extends RuntimeLockAcquireInput {
  lock: RuntimeLock;
  onConflict: () => Promise<T> | T;
  run: (lease: RuntimeLockLease) => Promise<T> | T;
}

export function createRuntimeLockKey(input: RuntimeLockKeyInput): string {
  return `fococontext:runtime-lock:${input.resourceKind}:${encodeURIComponent(input.resourceId)}`;
}

export async function runWithRuntimeLock<T>(input: RunWithRuntimeLockInput<T>): Promise<T> {
  const lease = await input.lock.acquire(input);

  if (lease === null) {
    return input.onConflict();
  }

  try {
    return await input.run(lease);
  } finally {
    await input.lock.release(lease);
  }
}

export class InMemoryRuntimeLock implements RuntimeLock {
  private readonly entries = new Map<
    string,
    {
      expiresAtMs: number;
      token: string;
    }
  >();

  constructor(
    private readonly options: {
      now?: () => Date;
      tokenFactory?: () => string;
    } = {},
  ) {}

  async acquire(input: RuntimeLockAcquireInput): Promise<RuntimeLockLease | null> {
    const key = createRuntimeLockKey(input);
    const now = this.now().getTime();
    const existing = this.entries.get(key);

    if (existing !== undefined && existing.expiresAtMs > now) {
      return null;
    }

    const ttlMs = normalizeTtlMs(input.ttlMs);
    const token = this.options.tokenFactory?.() ?? randomUUID();
    const expiresAt = new Date(now + ttlMs);

    this.entries.set(key, {
      expiresAtMs: expiresAt.getTime(),
      token,
    });

    return {
      expiresAt,
      key,
      token,
    };
  }

  async refresh(lease: RuntimeLockLease, ttlMs?: number): Promise<boolean> {
    const existing = this.entries.get(lease.key);

    if (existing === undefined || existing.token !== lease.token) {
      return false;
    }

    const expiresAt = new Date(this.now().getTime() + normalizeTtlMs(ttlMs));

    this.entries.set(lease.key, {
      expiresAtMs: expiresAt.getTime(),
      token: lease.token,
    });
    lease.expiresAt = expiresAt;

    return true;
  }

  async release(lease: RuntimeLockLease): Promise<boolean> {
    const existing = this.entries.get(lease.key);

    if (existing === undefined || existing.token !== lease.token) {
      return false;
    }

    this.entries.delete(lease.key);

    return true;
  }

  private now(): Date {
    return this.options.now?.() ?? new Date();
  }
}

export function normalizeTtlMs(ttlMs: number | undefined): number {
  if (ttlMs === undefined || !Number.isFinite(ttlMs)) {
    return 30 * 60 * 1000;
  }

  return Math.max(1000, Math.floor(ttlMs));
}
