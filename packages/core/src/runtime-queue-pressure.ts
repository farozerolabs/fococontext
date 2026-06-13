export const runtimeQueueWorkKinds = [
  "upload",
  "source-parse",
  "wiki-compile",
  "retrieval-reindex",
  "graph-refresh",
  "knowledge-check",
  "source-watch",
  "deletion-cleanup",
] as const;

export type RuntimeQueueWorkKind = (typeof runtimeQueueWorkKinds)[number];

export type RuntimeQueuePressureEvent =
  | "queued"
  | "started"
  | "completed"
  | "failed"
  | "retried"
  | "backpressure";

export type RuntimeQueuePressureState = "normal" | "degraded" | "saturated";

export interface RuntimeQueuePressureRecordInput {
  count?: number;
  scopeId: string;
  workKind: RuntimeQueueWorkKind;
  event: RuntimeQueuePressureEvent;
  now?: Date;
}

export interface RuntimeQueuePressureSnapshotInput {
  scopeId: string;
  workKinds?: readonly RuntimeQueueWorkKind[];
}

export interface RuntimeQueuePressureCounter {
  active: number;
  backpressureCount: number;
  completed: number;
  failed: number;
  lastEventAt: string | null;
  queued: number;
  retried: number;
  workKind: RuntimeQueueWorkKind;
}

export interface RuntimeQueuePressureSummary {
  counters: RuntimeQueuePressureCounter[];
  pressure: RuntimeQueuePressureState;
  scopeId: string;
  totals: Omit<RuntimeQueuePressureCounter, "lastEventAt" | "workKind">;
}

export interface RuntimeQueuePressureThresholds {
  degradedQueued: number;
  saturatedQueued: number;
  degradedBackpressure: number;
  saturatedBackpressure: number;
}

export interface RuntimeQueuePressureRecorder {
  close?(): Promise<void>;
  record(input: RuntimeQueuePressureRecordInput): Promise<void>;
  snapshot(
    input: RuntimeQueuePressureSnapshotInput,
    thresholds?: Partial<RuntimeQueuePressureThresholds>,
  ): Promise<RuntimeQueuePressureSummary>;
}

export const runtimeQueueGlobalScopeId = "system";

export const defaultRuntimeQueuePressureThresholds = {
  degradedBackpressure: 1,
  degradedQueued: 100,
  saturatedBackpressure: 10,
  saturatedQueued: 1000,
} as const satisfies RuntimeQueuePressureThresholds;

export function createRuntimeQueuePressureKey(input: {
  scopeId: string;
  workKind: RuntimeQueueWorkKind;
}): string {
  return `fococontext:queue-pressure:${encodeURIComponent(input.scopeId)}:${input.workKind}`;
}

export async function recordRuntimeQueuePressureEvent(
  recorder: RuntimeQueuePressureRecorder | undefined,
  input: RuntimeQueuePressureRecordInput,
): Promise<void> {
  if (recorder === undefined) {
    return;
  }

  await recorder.record(input);

  if (input.scopeId !== runtimeQueueGlobalScopeId) {
    await recorder.record({
      ...input,
      scopeId: runtimeQueueGlobalScopeId,
    });
  }
}

export function applyQueuePressureEvent(
  counter: RuntimeQueuePressureCounter,
  event: RuntimeQueuePressureEvent,
  count: number,
): void {
  if (event === "queued") {
    counter.queued += count;
    return;
  }
  if (event === "started") {
    counter.active += count;
    counter.queued = Math.max(0, counter.queued - count);
    return;
  }
  if (event === "completed") {
    counter.active = Math.max(0, counter.active - count);
    counter.completed += count;
    return;
  }
  if (event === "failed") {
    counter.active = Math.max(0, counter.active - count);
    counter.failed += count;
    return;
  }
  if (event === "retried") {
    counter.retried += count;
    return;
  }

  counter.backpressureCount += count;
}

export function sumQueuePressureCounters(
  counters: readonly RuntimeQueuePressureCounter[],
): Omit<RuntimeQueuePressureCounter, "lastEventAt" | "workKind"> {
  return counters.reduce(
    (totals, counter) => ({
      active: totals.active + counter.active,
      backpressureCount: totals.backpressureCount + counter.backpressureCount,
      completed: totals.completed + counter.completed,
      failed: totals.failed + counter.failed,
      queued: totals.queued + counter.queued,
      retried: totals.retried + counter.retried,
    }),
    {
      active: 0,
      backpressureCount: 0,
      completed: 0,
      failed: 0,
      queued: 0,
      retried: 0,
    },
  );
}

export function classifyRuntimeQueuePressure(
  totals: Pick<RuntimeQueuePressureCounter, "backpressureCount" | "queued">,
  thresholds: Partial<RuntimeQueuePressureThresholds> = {},
): RuntimeQueuePressureState {
  const resolved = {
    ...defaultRuntimeQueuePressureThresholds,
    ...thresholds,
  };

  if (
    totals.queued >= resolved.saturatedQueued ||
    totals.backpressureCount >= resolved.saturatedBackpressure
  ) {
    return "saturated";
  }
  if (
    totals.queued >= resolved.degradedQueued ||
    totals.backpressureCount >= resolved.degradedBackpressure
  ) {
    return "degraded";
  }

  return "normal";
}
