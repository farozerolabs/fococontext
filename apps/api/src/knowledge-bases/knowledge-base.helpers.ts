import { ApiError, createResourceId } from "@fococontext/contracts";
import { PromptTemplateValidationError, normalizeDatasetPromptTemplates } from "@fococontext/llm";

import type { JobDetailResponse, JobEventRecord, JobRecord } from "../documents/document.types.js";
import type {
  DatasetConfigurationRecord,
  DatasetConfigurationResponse,
  DatasetConfigurationValues,
  DatasetOcrMode,
  DatasetOcrPolicy,
  ForkOwnerRecord,
  JsonObject,
  KnowledgeBaseOutputLanguage,
  KnowledgeBaseRecord,
  KnowledgeBaseResponse,
  KnowledgeBaseStatus,
  KnowledgeBaseTemplate,
  ResolveKnowledgeBaseForkInput,
  SystemPageRecord,
  SystemPageResponse,
  SystemPageType,
  UpdateKnowledgeBaseInput,
} from "./knowledge-base.types.js";
import type { KnowledgeBaseTemplateDefinition } from "./knowledge-base.templates.js";

export function createRetentionTimestamp(now: string, days: number | null): string | null {
  if (days === null) {
    return null;
  }

  const timestamp = new Date(now);
  timestamp.setUTCDate(timestamp.getUTCDate() + days);

  return timestamp.toISOString();
}

export function toDocumentKnowledgeBaseScope(record: KnowledgeBaseRecord) {
  return {
    knowledgeBaseId: record.id,
    knowledgeBaseType: record.knowledgeBaseType,
    upstreamKnowledgeBaseId: record.upstreamKnowledgeBaseId,
    upstreamSyncedVersionId: record.upstreamSyncedVersionId,
  };
}

export function toKnowledgeBaseResponse(record: KnowledgeBaseRecord): KnowledgeBaseResponse {
  if (record.status === "deleted") {
    throw new ApiError("knowledge_base_not_found");
  }

  const response: KnowledgeBaseResponse = {
    id: record.id,
    name: record.name,
    slug: record.slug,
    knowledge_base_type: record.knowledgeBaseType,
    upstream_knowledge_base_id: record.upstreamKnowledgeBaseId,
    upstream_base_version_id: record.upstreamBaseVersionId,
    upstream_synced_version_id: record.upstreamSyncedVersionId,
    fork_owner:
      record.forkOwner === null
        ? null
        : {
            owner_type: record.forkOwner.ownerType,
            external_owner_id: record.forkOwner.externalOwnerId,
            display_name: record.forkOwner.displayName,
          },
    sync_status: record.syncStatus,
    template: record.template,
    output_language: record.outputLanguage,
    status: record.status,
    current_version_id: record.currentVersionId,
    purpose: record.purpose,
    schema: cloneJsonObject(record.schema),
    retrieval: cloneJsonObject(record.retrieval),
    created_at: record.createdAt,
    updated_at: record.updatedAt,
  };

  if (record.description !== undefined) {
    response.description = record.description;
  }

  return response;
}

export function toDatasetConfigurationResponse(
  record: DatasetConfigurationRecord,
): DatasetConfigurationResponse {
  return {
    id: record.id,
    knowledge_base_id: record.knowledgeBaseId,
    preset_id: record.presetId,
    status: record.status,
    version: record.version,
    values: cloneDatasetConfigurationValues(record.values),
    latest_snapshot_id: record.latestSnapshotId,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
    updated_by: record.updatedBy,
    metadata: cloneJsonObject(record.metadata),
  };
}

export function createDatasetConfigurationValues(
  template: KnowledgeBaseTemplateDefinition,
  overrides: Partial<DatasetConfigurationValues> = {},
): DatasetConfigurationValues {
  return validateDatasetConfigurationValues({
    purpose: template.dataset_configuration.purpose,
    schema: cloneJsonObject(template.dataset_configuration.schema),
    markdown_contract: cloneJsonObject(template.dataset_configuration.markdown_contract),
    output_language: template.dataset_configuration.output_language,
    retrieval: cloneJsonObject(template.dataset_configuration.retrieval),
    source_lifecycle: cloneJsonObject(template.dataset_configuration.source_lifecycle),
    knowledge_check: cloneJsonObject(template.dataset_configuration.knowledge_check),
    source_watch: cloneJsonObject(template.dataset_configuration.source_watch),
    ocr_policy: cloneJsonObject(template.dataset_configuration.ocr_policy) as DatasetOcrPolicy,
    prompt_templates: normalizePromptTemplatesForDatasetConfiguration(
      overrides.prompt_templates ?? template.dataset_configuration.prompt_templates,
    ),
    ...overrides,
  });
}

export function createDatasetConfigurationRecord(input: {
  knowledgeBaseId: string;
  presetId: KnowledgeBaseTemplate;
  values: DatasetConfigurationValues;
  timestamp: string;
}): DatasetConfigurationRecord {
  return {
    id: createResourceId("datasetConfiguration"),
    knowledgeBaseId: input.knowledgeBaseId,
    presetId: input.presetId,
    status: "active",
    version: 1,
    values: cloneDatasetConfigurationValues(input.values),
    latestSnapshotId: createResourceId("datasetConfigurationSnapshot"),
    createdAt: input.timestamp,
    updatedAt: input.timestamp,
    updatedBy: null,
    metadata: {},
  };
}

export function toSystemPageResponse(record: SystemPageRecord): SystemPageResponse {
  return {
    id: record.id,
    knowledge_base_id: record.knowledgeBaseId,
    type: record.type,
    title: record.title,
    markdown: record.markdown,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
  };
}

export function createCompletedIndexJobEvent(
  job: JobRecord,
  indexStats: {
    indexedEdgeCount: number;
    indexedEmbeddingCount: number;
    indexedPageCount: number;
  },
): JobEventRecord {
  return {
    jobId: job.id,
    type: "job.completed",
    stage: job.stage,
    status: job.status,
    message: job.progressMessage,
    metadata: {
      indexed_page_count: indexStats.indexedPageCount,
      indexed_edge_count: indexStats.indexedEdgeCount,
      indexed_embedding_count: indexStats.indexedEmbeddingCount,
    },
    createdAt: job.createdAt,
  };
}

export function toJobDetailResponse(
  record: JobRecord,
  events: readonly JobEventRecord[],
): JobDetailResponse {
  return {
    id: record.id,
    knowledge_base_id: record.knowledgeBaseId,
    document_id: record.documentId,
    stage: record.stage,
    status: record.status,
    progress: record.progress,
    progress_message: record.progressMessage,
    content_hash: record.contentHash,
    idempotency_key: record.idempotencyKey,
    deduped: record.deduped,
    locked_by_knowledge_base_id: record.lockedByKnowledgeBaseId,
    input_snapshot_id: record.inputSnapshotId,
    retry_of_job_id: record.retryOfJobId,
    parsed_content_id: record.parsedContentId,
    change_set_id: record.changeSetId,
    error:
      record.error === null
        ? null
        : (JSON.parse(JSON.stringify(record.error)) as Record<string, unknown>),
    created_at: record.createdAt,
    updated_at: record.updatedAt,
    background_operations: [],
    events: events.map((event) => ({
      type: event.type,
      stage: event.stage,
      status: event.status,
      message: event.message,
      metadata: JSON.parse(JSON.stringify(event.metadata)) as Record<string, unknown>,
      created_at: event.createdAt,
    })),
  };
}

export function readRequiredName(value: string | undefined): string {
  const name = value?.trim() ?? "";

  if (name.length === 0) {
    throw new ApiError("invalid_request", {
      messageKey: "api.validation.knowledge_base_name_required",
      details: {
        fields: ["name"],
      },
    });
  }

  return name;
}

export function readForkOwner(input: ResolveKnowledgeBaseForkInput): ForkOwnerRecord {
  const ownerType = input.owner_type;
  const externalOwnerId = input.external_owner_id?.trim().toLowerCase() ?? "";

  if (
    ownerType !== "user" &&
    ownerType !== "workspace" &&
    ownerType !== "customer" &&
    ownerType !== "session" &&
    ownerType !== "custom"
  ) {
    throwForkOwnerInvalid(["owner_type"]);
  }

  if (externalOwnerId.length === 0) {
    throwForkOwnerInvalid(["external_owner_id"]);
  }

  return {
    ownerType,
    externalOwnerId,
    displayName: input.display_name?.trim() || null,
  };
}

export function throwForkTargetInvalid(targetId: string): never {
  throw new ApiError("fork_target_invalid", {
    details: {
      target_id: targetId,
      target_type: "knowledge_base",
    },
  });
}

function throwForkOwnerInvalid(fields: string[]): never {
  throw new ApiError("invalid_request", {
    messageKey: "api.validation.fork_owner_invalid",
    details: {
      fields,
      issues: fields.map((field) => ({
        field,
        message: "Invalid fork owner metadata.",
      })),
    },
  });
}

export function normalizeSlug(value: string, fallbackValue?: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (slug.length > 0) {
    return slug;
  }

  if (fallbackValue !== undefined) {
    return normalizeSlug(fallbackValue);
  }

  throw new ApiError("invalid_request", {
    messageKey: "api.validation.knowledge_base_slug_invalid",
    details: {
      fields: ["slug"],
    },
  });
}

export function cloneJsonObject(value: JsonObject | undefined): JsonObject {
  return value === undefined ? {} : (JSON.parse(JSON.stringify(value)) as JsonObject);
}

function cloneDatasetConfigurationValues(
  value: DatasetConfigurationValues,
): DatasetConfigurationValues {
  return JSON.parse(JSON.stringify(value)) as DatasetConfigurationValues;
}

export function validateDatasetConfigurationValues(
  value: Partial<DatasetConfigurationValues>,
  ocrCaps: {
    maxPagesPerDocument: number;
    minTextCharsPerPage: number;
  } = {
    maxPagesPerDocument: 200,
    minTextCharsPerPage: 80,
  },
): DatasetConfigurationValues {
  const purpose = validatePurpose(value.purpose);
  const schema = validateWikiSchema(value.schema ?? {});
  const outputLanguage = validateOutputLanguage(value.output_language);
  const markdownContract = validateJsonSection(value.markdown_contract, "markdown_contract");
  const retrieval = validateJsonSection(value.retrieval, "retrieval");
  const sourceLifecycle = validateJsonSection(value.source_lifecycle, "source_lifecycle");
  const knowledgeCheck = validateJsonSection(value.knowledge_check, "knowledge_check");
  const sourceWatch = validateJsonSection(value.source_watch, "source_watch");
  const ocrPolicy = validateOcrPolicy(value.ocr_policy, ocrCaps);
  const promptTemplates = normalizePromptTemplatesForDatasetConfiguration(value.prompt_templates);

  validateStringField(sourceLifecycle.delete_policy, "source_lifecycle.delete_policy");
  validateArrayField(knowledgeCheck.default_checks, "knowledge_check.default_checks");
  validateArrayField(sourceWatch.supported_kinds, "source_watch.supported_kinds");

  return {
    purpose,
    schema,
    markdown_contract: markdownContract,
    output_language: outputLanguage,
    retrieval,
    source_lifecycle: sourceLifecycle,
    knowledge_check: knowledgeCheck,
    source_watch: sourceWatch,
    ocr_policy: ocrPolicy,
    prompt_templates: promptTemplates,
  };
}

function normalizePromptTemplatesForDatasetConfiguration(value: unknown) {
  try {
    return normalizeDatasetPromptTemplates(value);
  } catch (error) {
    if (error instanceof PromptTemplateValidationError) {
      throwPromptTemplateValidationError(error.fields);
    }

    throw error;
  }
}

function validateOcrPolicy(
  value: unknown,
  caps: {
    maxPagesPerDocument: number;
    minTextCharsPerPage: number;
  },
): DatasetOcrPolicy {
  const policy: JsonObject =
    value === undefined
      ? {
          mode: "auto",
          max_pages_per_document: null,
          min_text_chars_per_page: null,
        }
      : validateJsonSection(value, "ocr_policy");
  const forbiddenFields = [
    "provider",
    "service_base_url",
    "service_endpoint",
    "service_api_key",
    "api_key",
    "secret",
  ].filter((field) => field in policy);

  if (forbiddenFields.length > 0) {
    throwValidationError(forbiddenFields.map((field) => `ocr_policy.${field}`));
  }

  const mode = readOcrMode(policy.mode);

  return {
    mode,
    max_pages_per_document: readOptionalCappedInteger(
      policy.max_pages_per_document,
      "ocr_policy.max_pages_per_document",
      caps.maxPagesPerDocument,
    ),
    min_text_chars_per_page: readOptionalCappedInteger(
      policy.min_text_chars_per_page,
      "ocr_policy.min_text_chars_per_page",
      caps.minTextCharsPerPage,
    ),
  };
}

function readOcrMode(value: unknown): DatasetOcrMode {
  if (value === "auto" || value === "disabled" || value === "force_for_pdf") {
    return value;
  }

  throwValidationError(["ocr_policy.mode"]);
}

function readOptionalCappedInteger(value: unknown, field: string, maxValue: number): number | null {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0 || value > maxValue) {
    throwValidationError([field]);
  }

  return value;
}

export function readOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function validateJsonSection(value: unknown, field: string): JsonObject {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throwValidationError([field]);
  }

  return cloneJsonObject(value as JsonObject);
}

function validateStringField(value: unknown, field: string): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    throwValidationError([field]);
  }
}

function validateArrayField(value: unknown, field: string): void {
  if (!Array.isArray(value)) {
    throwValidationError([field]);
  }
}

export function createInitialSystemPages(
  record: KnowledgeBaseRecord,
  timestamp: string,
): SystemPageRecord[] {
  return systemPageOrder.map((type) => createSystemPage(record, type, timestamp, timestamp));
}

export function refreshSystemPages(
  record: KnowledgeBaseRecord,
  timestamp: string,
): SystemPageRecord[] {
  const existingPages = new Map(record.systemPages.map((page) => [page.type, page]));

  return systemPageOrder.map((type) => {
    const existing = existingPages.get(type);

    return createSystemPage(
      record,
      type,
      existing?.createdAt ?? timestamp,
      timestamp,
      existing?.id,
    );
  });
}

function createSystemPage(
  record: KnowledgeBaseRecord,
  type: SystemPageType,
  createdAt: string,
  updatedAt: string,
  existingId?: string,
): SystemPageRecord {
  return {
    id: existingId ?? createResourceId("wikiPage"),
    knowledgeBaseId: record.id,
    type,
    title: systemPageTitles[type],
    markdown: renderSystemPageMarkdown(record, type),
    createdAt,
    updatedAt,
  };
}

function renderSystemPageMarkdown(record: KnowledgeBaseRecord, type: SystemPageType): string {
  if (type === "index") {
    return `# Index\n\nKnowledge base: ${record.name}\n\nStatus: ${record.status}\n`;
  }
  if (type === "overview") {
    return `# Overview\n\n${record.description ?? "No description provided."}\n`;
  }
  if (type === "log") {
    return `# Log\n\n- Created knowledge base ${record.id}.\n`;
  }
  if (type === "purpose") {
    return `# Purpose\n\n${record.purpose}\n`;
  }

  return `# Schema\n\n\`\`\`json\n${JSON.stringify(record.schema, null, 2)}\n\`\`\`\n`;
}

export function renderMarkdownExportFile(page: SystemPageRecord, includeSources: boolean): string {
  const related = page.type === "index" ? ["overview", "log", "purpose", "schema"] : [];
  const sources = includeSources ? [] : [];

  return `---
type: system
title: ${JSON.stringify(page.title)}
sources: ${JSON.stringify(sources)}
related: ${JSON.stringify(related)}
system_page: ${page.type}
knowledge_base_id: ${page.knowledgeBaseId}
---

${page.markdown}
${renderRelatedLinks(related)}
`;
}

function renderRelatedLinks(related: string[]): string {
  if (related.length === 0) {
    return "";
  }

  return `\n## Related\n\n${related.map((item) => `- [[${item}]]`).join("\n")}\n`;
}

export const systemPageOrder: readonly SystemPageType[] = [
  "index",
  "overview",
  "log",
  "purpose",
  "schema",
];

const systemPageTitles: Record<SystemPageType, string> = {
  index: "Index",
  overview: "Overview",
  log: "Log",
  purpose: "Purpose",
  schema: "Schema",
};

export function validatePurpose(value: string | undefined): string {
  const purpose = value?.trim() ?? "";

  if (purpose.length === 0) {
    throwValidationError(["purpose"]);
  }

  return purpose;
}

function validateOutputLanguage(
  value: KnowledgeBaseOutputLanguage | undefined,
): KnowledgeBaseOutputLanguage {
  if (value === "auto" || value === "zh-CN" || value === "en-US") {
    return value;
  }

  throwValidationError(["output_language"]);
}

export function validateWikiSchema(value: JsonObject): JsonObject {
  const pageTypes = value.page_types;

  if (!Array.isArray(pageTypes) || pageTypes.length === 0) {
    throwValidationError(["schema.page_types"]);
  }

  pageTypes.forEach((pageType, index) => {
    if (!isValidPageType(pageType)) {
      throwValidationError([`schema.page_types.${index}`]);
    }
  });

  return cloneJsonObject(value);
}

function isValidPageType(value: unknown): value is JsonObject {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  return (
    hasNonEmptyStringProperty(value, "type") &&
    hasNonEmptyStringProperty(value, "directory") &&
    hasNonEmptyStringProperty(value, "purpose")
  );
}

function hasNonEmptyStringProperty(value: object, key: string): boolean {
  if (!(key in value)) {
    return false;
  }

  const item = (value as Record<string, unknown>)[key];

  return typeof item === "string" && item.trim().length > 0;
}

export function readResetToTemplateFields(
  value: UpdateKnowledgeBaseInput["reset_to_template"],
): Set<"purpose" | "schema"> {
  if (value === undefined) {
    return new Set();
  }

  if (!Array.isArray(value) || value.some((item) => item !== "purpose" && item !== "schema")) {
    throwValidationError(["reset_to_template"]);
  }

  return new Set(value);
}

export function throwValidationError(fields: string[]): never {
  throw new ApiError("invalid_request", {
    messageKey: "api.validation.knowledge_base_settings_invalid",
    details: {
      fields,
      issues: fields.map((field) => ({
        field,
        message: "Invalid knowledge base setting.",
      })),
    },
  });
}

function throwPromptTemplateValidationError(fields: string[]): never {
  throw new ApiError("invalid_request", {
    messageKey: "api.validation.prompt_template_invalid",
    details: {
      fields,
      issues: fields.map((field) => ({
        field,
        message: "Prompt template validation failed.",
      })),
    },
  });
}

export function filterByStatus(record: KnowledgeBaseRecord, status: string | undefined): boolean {
  if (status === undefined || status.trim().length === 0) {
    return true;
  }

  return record.status === (status as KnowledgeBaseStatus);
}

export function filterByKeyword(record: KnowledgeBaseRecord, keyword: string | undefined): boolean {
  if (keyword === undefined || keyword.length === 0) {
    return true;
  }

  return (
    record.name.toLowerCase().includes(keyword) ||
    record.slug.toLowerCase().includes(keyword) ||
    record.id.toLowerCase().includes(keyword)
  );
}
