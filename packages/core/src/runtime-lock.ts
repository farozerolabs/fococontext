export const runtimeLockResourceKinds = [
  "source-watch-scan",
  "graph-refresh",
  "knowledge-check-run",
  "deletion-cleanup-operation",
  "background-operation",
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

export function normalizeTtlMs(ttlMs: number | undefined): number {
  if (ttlMs === undefined || !Number.isFinite(ttlMs)) {
    return 30 * 60 * 1000;
  }

  return Math.max(1000, Math.floor(ttlMs));
}
