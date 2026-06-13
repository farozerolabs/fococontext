import type { WorkerJobProgressWriter } from "./job-progress.postgres-writer.js";
import type { SourceParsePayload } from "./source-parse.worker.js";
import type { WikiAnalyzeQueue } from "./wiki-compile.worker.js";

export async function resumeSourceParseCheckpoint(input: {
  checkpointSummary: Record<string, unknown>;
  compileQueue: WikiAnalyzeQueue | undefined;
  jobProgress: WorkerJobProgressWriter | undefined;
  parsedContentId: string;
  payload: SourceParsePayload;
}): Promise<void> {
  const normalizedMarkdownObjectKey = readString(
    input.checkpointSummary.normalized_markdown_object_key,
  );
  const downstreamStage = readString(input.checkpointSummary.downstream_stage);
  const parserCache = normalizeRecord(input.checkpointSummary.parser_cache);

  if (downstreamStage !== "analyzing" || normalizedMarkdownObjectKey === null) {
    return;
  }

  await input.compileQueue?.enqueueWikiAnalyzeJob({
    job_id: input.payload.job_id,
    tenant_id: input.payload.tenant_id,
    project_id: input.payload.project_id,
    knowledge_base_id: input.payload.knowledge_base_id,
    document_id: input.payload.document_id,
    parsed_content_id: input.parsedContentId,
    normalized_markdown_object_key: normalizedMarkdownObjectKey,
    content_hash: input.payload.content_hash,
    ...(input.payload.dataset_configuration_snapshot === undefined
      ? {}
      : { dataset_configuration_snapshot: input.payload.dataset_configuration_snapshot }),
    input_snapshot_id: input.payload.input_snapshot_id,
  });
  await input.jobProgress?.updateJobProgress({
    jobId: input.payload.job_id,
    knowledgeBaseId: input.payload.knowledge_base_id,
    inputSnapshotId: input.payload.input_snapshot_id,
    stage: "analyzing",
    status: "running",
    progress: 30,
    message: "Analyzing content from parser checkpoint...",
    parsedContentId: input.parsedContentId,
    metadata: {
      parser_cache: parserCache ?? {},
      parser_checkpoint: {
        downstream_stage: downstreamStage,
        status: "hit",
      },
    },
  });
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function normalizeRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }

  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}
