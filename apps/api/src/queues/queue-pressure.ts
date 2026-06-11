import {
  recordRuntimeQueuePressureEvent,
  runtimeQueueGlobalScopeId,
  type RuntimeQueuePressureRecorder,
  type RuntimeQueueWorkKind,
} from "@fococontext/core";

export async function recordQueuePressureQueued(input: {
  recorder?: RuntimeQueuePressureRecorder | undefined;
  scopeId?: string | null;
  workKind: RuntimeQueueWorkKind;
}): Promise<void> {
  await recordQueuePressure(input, "queued");
}

export async function recordQueuePressureBackpressure(input: {
  recorder?: RuntimeQueuePressureRecorder | undefined;
  scopeId?: string | null;
  workKind: RuntimeQueueWorkKind;
}): Promise<void> {
  await recordQueuePressure(input, "backpressure");
}

async function recordQueuePressure(
  input: {
    recorder?: RuntimeQueuePressureRecorder | undefined;
    scopeId?: string | null;
    workKind: RuntimeQueueWorkKind;
  },
  event: "backpressure" | "queued",
): Promise<void> {
  if (input.recorder === undefined) {
    return;
  }

  await recordRuntimeQueuePressureEvent(input.recorder, {
    event,
    scopeId: input.scopeId ?? runtimeQueueGlobalScopeId,
    workKind: input.workKind,
  }).catch((error: unknown) => {
    console.warn("Runtime queue pressure recording failed.", error);
  });
}
