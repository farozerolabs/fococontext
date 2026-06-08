import type { CompileArtifactRepository, CompileWorkflowKind } from "@fococontext/db";
import type {
  ModelCallMetadataInput,
  ModelCallMetadataRecord,
  ModelCallRecorder,
} from "@fococontext/llm";

export interface PostgresModelCallRecorderOptions {
  idFactory?: () => string;
  now?: () => Date;
}

const workflowKinds = [
  "analysis",
  "generation",
  "merge",
  "vision_caption",
  "knowledge_check",
  "wiki_draft",
] as const satisfies readonly CompileWorkflowKind[];

export class PostgresModelCallRecorder implements ModelCallRecorder {
  private readonly repository: Pick<CompileArtifactRepository, "recordModelCall">;
  private readonly idFactory: () => string;
  private readonly now: () => Date;

  constructor(
    repository: Pick<CompileArtifactRepository, "recordModelCall">,
    options: PostgresModelCallRecorderOptions = {},
  ) {
    this.repository = repository;
    this.idFactory = options.idFactory ?? createModelCallId;
    this.now = options.now ?? (() => new Date());
  }

  async record(input: ModelCallMetadataInput): Promise<ModelCallMetadataRecord> {
    const createdAt = this.now();
    const persisted = await this.repository.recordModelCall({
      id: this.idFactory(),
      knowledgeBaseId: input.knowledgeBaseId ?? null,
      sourceDocumentId: input.sourceDocumentId ?? null,
      parsedContentId: input.parsedContentId ?? null,
      jobId: input.jobId ?? null,
      changeSetId: input.changeSetId ?? null,
      providerName: input.providerName,
      model: input.model,
      promptVersionId: input.promptVersion,
      workflowKind: readWorkflowKind(input.promptVersion),
      outputStatus: input.outputStatus,
      inputSummary: sanitizeModelCallSummary(input.inputSummary),
      outputSummary:
        input.outputSummary === undefined || input.outputSummary === null
          ? null
          : sanitizeModelCallSummary(input.outputSummary),
      usage: input.usage === undefined ? {} : { ...input.usage },
      costEstimateUsd: input.costEstimateUsd ?? null,
      metadata:
        input.metadata === undefined
          ? {}
          : (JSON.parse(JSON.stringify(input.metadata)) as Record<string, unknown>),
      createdAt: createdAt.toISOString(),
    });

    return toModelCallMetadataRecord(persisted);
  }
}

function toModelCallMetadataRecord(
  input: Awaited<ReturnType<CompileArtifactRepository["recordModelCall"]>>,
): ModelCallMetadataRecord {
  const record: ModelCallMetadataRecord = {
    id: input.id,
    createdAt: new Date(input.createdAt),
    providerName: input.providerName,
    model: input.model,
    promptVersion: input.promptVersionId,
    inputSummary: input.inputSummary,
    outputStatus: input.outputStatus,
  };

  if (input.jobId !== null) {
    record.jobId = input.jobId;
  }
  if (input.knowledgeBaseId !== null) {
    record.knowledgeBaseId = input.knowledgeBaseId;
  }
  if (input.sourceDocumentId !== null) {
    record.sourceDocumentId = input.sourceDocumentId;
  }
  if (input.parsedContentId !== null) {
    record.parsedContentId = input.parsedContentId;
  }
  if (input.changeSetId !== null) {
    record.changeSetId = input.changeSetId;
  }
  if (input.outputSummary !== null) {
    record.outputSummary = input.outputSummary;
  }
  if (Object.keys(input.usage).length > 0) {
    record.usage = { ...input.usage };
  }
  if (input.costEstimateUsd !== null) {
    record.costEstimateUsd = input.costEstimateUsd;
  }
  if (Object.keys(input.metadata).length > 0) {
    record.metadata = { ...input.metadata };
  }

  return record;
}

function readWorkflowKind(promptVersion: string): CompileWorkflowKind {
  const purpose = promptVersion.split("@")[0];

  if (workflowKinds.includes(purpose as CompileWorkflowKind)) {
    return purpose as CompileWorkflowKind;
  }

  throw new Error(`Unsupported Prompt Version for model call recording: ${promptVersion}`);
}

function sanitizeModelCallSummary(value: string): string {
  return value
    .replace(/authorization\s*:\s*bearer\s+[^\s,;]+/giu, "Authorization: Bearer [redacted]")
    .replace(/bearer\s+[A-Za-z0-9._~+/=-]+/giu, "Bearer [redacted]")
    .replace(/api[_-]?key\s*[:=]\s*[^\s,;]+/giu, "api_key=[redacted]");
}

function createModelCallId(): string {
  return `llm_call_${crypto.randomUUID().replaceAll("-", "")}`;
}
