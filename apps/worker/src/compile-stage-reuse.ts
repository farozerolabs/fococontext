import { createHash } from "node:crypto";

export type CompileStageReuseStage = "analysis" | "generation";

export interface CompileStageReuseKeyInput {
  contentHash: string;
  datasetConfigurationSnapshotId: string | null;
  datasetConfigurationSnapshotVersion: number | null;
  knowledgeBaseId: string;
  model: string;
  normalizedContentHash: string;
  parsedContentId: string | null;
  promptHash: string;
  promptVersionId: string;
  providerName: string;
  runtimeConfigHash: string;
  sourceDocumentId: string | null;
  stage: CompileStageReuseStage;
  stageImplementationVersion: string;
  tenantId: string;
}

export interface StageTimingMetadataInput {
  now: string;
  previousEventAt: Date | string | null | undefined;
  queuedAt: Date | string | null | undefined;
  stageStartedAt: Date | string | null | undefined;
}

export function createCompileStageReuseKey(input: CompileStageReuseKeyInput): string {
  return `sha256:${sha256(stableJsonStringify(normalizeCompileStageReuseInput(input)))}`;
}

export function createContentHash(value: string): string {
  return `sha256:${sha256(value)}`;
}

export function createRuntimeConfigHash(input: Record<string, unknown>): string {
  return `sha256:${sha256(stableJsonStringify(input))}`;
}

export function createStableJsonHash(input: unknown): string {
  return `sha256:${sha256(stableJsonStringify(input))}`;
}

export function createStageTimingMetadata(
  input: StageTimingMetadataInput,
): Record<string, unknown> {
  const nowMs = readTimestampMs(input.now) ?? Date.now();
  const previousEventMs = readTimestampMs(input.previousEventAt);
  const queuedMs = readTimestampMs(input.queuedAt);
  const stageStartedMs = readTimestampMs(input.stageStartedAt) ?? nowMs;

  return {
    duration_since_previous_event_ms:
      previousEventMs === null ? 0 : Math.max(0, nowMs - previousEventMs),
    stage_duration_ms: Math.max(0, nowMs - stageStartedMs),
    stage_finished_at: input.now,
    stage_started_at: new Date(stageStartedMs).toISOString(),
    ...(queuedMs === null ? {} : { stage_queue_wait_ms: Math.max(0, stageStartedMs - queuedMs) }),
    ...(previousEventMs === null
      ? {}
      : { previous_event_at: new Date(previousEventMs).toISOString() }),
  };
}

function normalizeCompileStageReuseInput(
  input: CompileStageReuseKeyInput,
): CompileStageReuseKeyInput {
  return {
    contentHash: input.contentHash,
    datasetConfigurationSnapshotId: input.datasetConfigurationSnapshotId,
    datasetConfigurationSnapshotVersion: input.datasetConfigurationSnapshotVersion,
    knowledgeBaseId: input.knowledgeBaseId,
    model: input.model,
    normalizedContentHash: input.normalizedContentHash,
    parsedContentId: input.parsedContentId,
    promptHash: input.promptHash,
    promptVersionId: input.promptVersionId,
    providerName: input.providerName,
    runtimeConfigHash: input.runtimeConfigHash,
    sourceDocumentId: input.sourceDocumentId,
    stage: input.stage,
    stageImplementationVersion: input.stageImplementationVersion,
    tenantId: input.tenantId,
  };
}

export function stableJsonStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJsonStringify).join(",")}]`;
  }
  if (typeof value === "object" && value !== null) {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJsonStringify(item)}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function readTimestampMs(value: Date | string | null | undefined): number | null {
  if (value === undefined || value === null) {
    return null;
  }

  const timestamp = value instanceof Date ? value.getTime() : new Date(value).getTime();

  return Number.isFinite(timestamp) ? timestamp : null;
}
