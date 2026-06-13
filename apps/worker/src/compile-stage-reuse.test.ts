import { describe, expect, it } from "vitest";
import {
  createCompileStageReuseKey,
  createStageTimingMetadata,
  type CompileStageReuseKeyInput,
} from "./compile-stage-reuse.js";

const baseReuseInput = {
  contentHash: "sha256:content",
  datasetConfigurationSnapshotId: "dataset_snapshot_1",
  datasetConfigurationSnapshotVersion: 3,
  knowledgeBaseId: "kb_1",
  model: "model-a",
  normalizedContentHash: "sha256:normalized",
  parsedContentId: "parsed_1",
  promptHash: "sha256:prompt",
  promptVersionId: "prompt_1",
  providerName: "provider-a",
  runtimeConfigHash: "sha256:runtime",
  sourceDocumentId: "doc_1",
  stage: "analysis",
  stageImplementationVersion: "v1",
  tenantId: "tenant_1",
} satisfies CompileStageReuseKeyInput;

describe("compile stage reuse keys", () => {
  it("keeps the key stable for identical exact inputs", () => {
    expect(createCompileStageReuseKey(baseReuseInput)).toBe(
      createCompileStageReuseKey({ ...baseReuseInput }),
    );
  });

  it("changes when semantic prompt or content inputs change", () => {
    expect(
      createCompileStageReuseKey({
        ...baseReuseInput,
        promptHash: "sha256:prompt-new",
      }),
    ).not.toBe(createCompileStageReuseKey(baseReuseInput));
    expect(
      createCompileStageReuseKey({
        ...baseReuseInput,
        normalizedContentHash: "sha256:normalized-new",
      }),
    ).not.toBe(createCompileStageReuseKey(baseReuseInput));
  });

  it("does not accept filename, title, or source path as key inputs", () => {
    const key = createCompileStageReuseKey(baseReuseInput);
    const unsafeInput = {
      ...baseReuseInput,
      fileName: "same-title.md",
      sourcePath: "laws/same-title.md",
      title: "Same Title",
    } as CompileStageReuseKeyInput & {
      fileName: string;
      sourcePath: string;
      title: string;
    };

    expect(createCompileStageReuseKey(unsafeInput)).toBe(key);
  });
});

describe("stage timing metadata", () => {
  it("reports queue wait and stage duration from durable timestamps", () => {
    expect(
      createStageTimingMetadata({
        now: "2026-06-13T00:00:10.000Z",
        previousEventAt: "2026-06-13T00:00:01.000Z",
        queuedAt: "2026-06-13T00:00:00.000Z",
        stageStartedAt: "2026-06-13T00:00:04.000Z",
      }),
    ).toEqual({
      duration_since_previous_event_ms: 9_000,
      stage_duration_ms: 6_000,
      stage_finished_at: "2026-06-13T00:00:10.000Z",
      stage_started_at: "2026-06-13T00:00:04.000Z",
      stage_queue_wait_ms: 4_000,
      previous_event_at: "2026-06-13T00:00:01.000Z",
    });
  });
});
