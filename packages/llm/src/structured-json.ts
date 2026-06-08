import type { ChatCompletionResult, ChatMessage, ChatProvider } from "./index.js";

export type JsonSchemaValue =
  | null
  | boolean
  | number
  | string
  | JsonSchemaValue[]
  | { [key: string]: JsonSchemaValue };

export type ChatCompletionResponseFormat =
  | {
      type: "json_object";
    }
  | {
      type: "json_schema";
      jsonSchema: {
        name: string;
        schema: JsonSchemaValue;
        strict?: boolean;
      };
    };

export type StructuredOutputMode = "strict_json_schema" | "json_object_fallback";
export type StructuredOutputFinalStatus =
  | "succeeded"
  | "failed"
  | "skipped_with_fallback"
  | "source_backed_fallback";

export interface StructuredJsonOutputResult<TOutput> {
  completion: ChatCompletionResult;
  output: TOutput;
  attemptCount: number;
  repairAttempts: number;
  structuredOutputMode: StructuredOutputMode;
  providerFallbackReason?: string;
  validationIssues: string[];
}

export interface StructuredJsonOutputFailureMetadata {
  attemptCount: number;
  providerFallbackReason?: string;
  repairAttempts: number;
  structuredOutputMode: StructuredOutputMode;
  validationIssues: string[];
}

export interface StructuredJsonOutputSchema {
  name: string;
  schema: JsonSchemaValue;
  strict?: boolean;
}

export interface CompleteStructuredJsonOutputInput<TOutput> {
  chatProvider: ChatProvider;
  model: string;
  messages: readonly ChatMessage[];
  jsonSchema: StructuredJsonOutputSchema;
  outputContract: string;
  outputShape: string;
  maxRepairAttempts: number;
  parse: (content: string) => TOutput;
  getValidationIssues: (error: unknown) => readonly string[] | null;
  maxInvalidOutputChars?: number;
  maxRepairHistoryChars?: number;
  temperature?: number;
  timeoutMs?: number;
}

interface StructuredOutputRepairFailure {
  invalidContent: string;
  issues: readonly string[];
}

export const analysisOutputShape =
  '{"entities":[{"title":"string","summary":"string or null","source_refs":[{"document_id":"string","locator":"string","media_asset_id":"string or null","evidence_kind":"text or image_caption or ocr"}],"locator_refs":["string"],"metadata":{}}],"concepts":[{"title":"string","summary":"string or null","source_refs":[{"document_id":"string","locator":"string","media_asset_id":"string or null","evidence_kind":"text or image_caption or ocr"}],"locator_refs":["string"],"metadata":{}}],"claims":[{"title":"string","summary":"string or null","source_refs":[{"document_id":"string","locator":"string","media_asset_id":"string or null","evidence_kind":"text or image_caption or ocr"}],"locator_refs":["string"],"metadata":{}}],"contradictions":[{"title":"string","summary":"string or null","source_refs":[{"document_id":"string","locator":"string","media_asset_id":"string or null","evidence_kind":"text or image_caption or ocr"}],"locator_refs":["string"],"metadata":{}}],"relationships":[{"from_title":"string","to_title":"string","relation_type":"wikilink or shared_source or type_affinity","evidence":"string or null","source_refs":[{"document_id":"string","locator":"string","media_asset_id":"string or null","evidence_kind":"text or image_caption or ocr"}],"locator_refs":["string"]}]}';

export const analysisOutputContract = [
  "Analysis contract: return only a strict JSON object with top-level arrays entities, concepts, claims, contradictions, and relationships.",
  "Return raw JSON only. Do not include Markdown code fences, comments, prose, or wrapper text.",
  "The exact canonical shape is:",
  analysisOutputShape,
  "Every entities, concepts, claims, and contradictions item must include title, summary, source_refs, locator_refs, and metadata.",
  "Every relationships item must include from_title, to_title, relation_type, evidence, source_refs, and locator_refs.",
  "Each top-level key must be an array. Use empty arrays when a category has no valid items. Do not return arrays of strings.",
  "Do not wrap the object in data, result, response, analysis, Markdown fences, prose, or any other envelope.",
].join(" ");

export const generationDraftOutputShape =
  '{"drafts":[{"title":"string","page_type":"source or concept","markdown":"string","frontmatter":{},"source_refs":[{"document_id":"string","locator":"string","media_asset_id":"string or null","evidence_kind":"text or image_caption or ocr"}],"locator_refs":["string"],"relationship_candidates":[],"confidence":0.9}]}';

export const generationDraftOutputContract = [
  "Generation contract: return only a strict JSON object with a top-level non-empty drafts array.",
  "Return raw JSON only. Do not include Markdown code fences, comments, prose, or wrapper text.",
  "The exact canonical shape is:",
  generationDraftOutputShape,
  "Every draft item must include title, page_type, markdown, frontmatter, source_refs, locator_refs, relationship_candidates, and confidence.",
  "Each source-backed draft must use source_refs or locator_refs from the validated analysis result.",
  "Do not wrap the object in data, result, response, analysis, Markdown fences, prose, or any other envelope.",
].join(" ");

export const structuredJsonOnlyInstruction =
  "Return raw JSON only. Do not include Markdown code fences, comments, prose, or wrapper text.";

const sourceRefSchema: JsonSchemaValue = {
  type: "object",
  required: ["document_id", "locator", "media_asset_id", "evidence_kind"],
  properties: {
    document_id: { type: "string" },
    locator: { type: "string" },
    media_asset_id: { type: ["string", "null"] },
    evidence_kind: {
      type: "string",
      enum: ["text", "image_caption", "ocr"],
    },
  },
  additionalProperties: false,
};

const analysisItemSchema: JsonSchemaValue = {
  type: "object",
  required: ["title", "summary", "source_refs", "locator_refs", "metadata"],
  properties: {
    title: { type: "string" },
    summary: { type: ["string", "null"] },
    source_refs: { type: "array", items: sourceRefSchema },
    locator_refs: { type: "array", items: { type: "string" } },
    metadata: { type: "object", properties: {}, additionalProperties: false },
  },
  additionalProperties: false,
};

const relationshipSchema: JsonSchemaValue = {
  type: "object",
  required: ["from_title", "to_title", "relation_type", "evidence", "source_refs", "locator_refs"],
  properties: {
    from_title: { type: "string" },
    to_title: { type: "string" },
    relation_type: {
      type: "string",
      enum: ["wikilink", "shared_source", "type_affinity"],
    },
    evidence: { type: ["string", "null"] },
    source_refs: { type: "array", items: sourceRefSchema },
    locator_refs: { type: "array", items: { type: "string" } },
  },
  additionalProperties: false,
};

export const analysisStructuredOutputJsonSchema: StructuredJsonOutputSchema = {
  name: "wiki_analysis",
  strict: true,
  schema: {
    type: "object",
    required: ["entities", "concepts", "claims", "contradictions", "relationships"],
    properties: {
      entities: { type: "array", items: analysisItemSchema },
      concepts: { type: "array", items: analysisItemSchema },
      claims: { type: "array", items: analysisItemSchema },
      contradictions: { type: "array", items: analysisItemSchema },
      relationships: { type: "array", items: relationshipSchema },
    },
    additionalProperties: false,
  },
};

const generationDraftSchema: JsonSchemaValue = {
  type: "object",
  required: [
    "title",
    "page_type",
    "markdown",
    "frontmatter",
    "source_refs",
    "locator_refs",
    "relationship_candidates",
    "confidence",
  ],
  properties: {
    title: { type: "string" },
    page_type: { type: "string", enum: ["source", "concept"] },
    markdown: { type: "string" },
    frontmatter: { type: "object", properties: {}, additionalProperties: false },
    source_refs: { type: "array", items: sourceRefSchema },
    locator_refs: { type: "array", items: { type: "string" } },
    relationship_candidates: {
      type: "array",
      items: { type: "object", properties: {}, additionalProperties: false },
    },
    confidence: { type: ["number", "null"] },
  },
  additionalProperties: false,
};

export const generationStructuredOutputJsonSchema: StructuredJsonOutputSchema = {
  name: "wiki_generation",
  strict: true,
  schema: {
    type: "object",
    required: ["drafts"],
    properties: {
      drafts: { type: "array", items: generationDraftSchema },
    },
    additionalProperties: false,
  },
};

export const semanticKnowledgeCheckOutputShape =
  '{"findings":[{"type":"semantic_consistency","severity":"low","page_id":"string or null","affected_object_ids":["string"],"evidence":[{}],"source_refs":[{}],"confidence":0.85,"message":"api.knowledge_check.finding.semantic_consistency","suggested_action":{}}]}';

export const semanticKnowledgeCheckOutputContract = [
  "Knowledge Check contract: return only a strict JSON object with a top-level findings array.",
  structuredJsonOnlyInstruction,
  "The exact canonical shape is:",
  semanticKnowledgeCheckOutputShape,
  "Every finding must include type, severity, page_id, affected_object_ids, evidence, source_refs, confidence, message, and suggested_action.",
].join(" ");

export const semanticKnowledgeCheckStructuredOutputJsonSchema: StructuredJsonOutputSchema = {
  name: "semantic_knowledge_check",
  strict: true,
  schema: {
    type: "object",
    required: ["findings"],
    properties: {
      findings: {
        type: "array",
        items: {
          type: "object",
          required: [
            "type",
            "severity",
            "page_id",
            "affected_object_ids",
            "evidence",
            "source_refs",
            "confidence",
            "message",
            "suggested_action",
          ],
          properties: {
            type: { type: "string" },
            severity: { type: "string", enum: ["low", "medium", "high"] },
            page_id: { type: ["string", "null"] },
            affected_object_ids: { type: "array", items: { type: "string" } },
            evidence: {
              type: "array",
              items: {
                type: "object",
                required: ["object_type", "object_id", "quote"],
                properties: {
                  object_type: { type: "string" },
                  object_id: { type: "string" },
                  quote: { type: "string" },
                },
                additionalProperties: false,
              },
            },
            source_refs: {
              type: "array",
              items: {
                type: "object",
                required: ["document_id", "locator"],
                properties: {
                  document_id: { type: "string" },
                  locator: { type: "string" },
                },
                additionalProperties: false,
              },
            },
            confidence: { type: ["number", "null"] },
            message: { type: "string" },
            suggested_action: {
              type: "object",
              required: ["action"],
              properties: {
                action: { type: "string" },
              },
              additionalProperties: false,
            },
          },
          additionalProperties: false,
        },
      },
    },
    additionalProperties: false,
  },
};

const structuredOutputErrorMetadataKey = "__fococontextStructuredOutputMetadata";
const defaultMaxInvalidOutputChars = 4000;
const defaultMaxRepairHistoryChars = 12000;

export async function completeStructuredJsonOutput<TOutput>(
  input: CompleteStructuredJsonOutputInput<TOutput>,
): Promise<StructuredJsonOutputResult<TOutput>> {
  const failures: StructuredOutputRepairFailure[] = [];
  let mode: StructuredOutputMode = "strict_json_schema";
  let providerFallbackReason: string | undefined;

  for (let repairAttempts = 0; repairAttempts <= input.maxRepairAttempts; repairAttempts += 1) {
    const messages =
      repairAttempts === 0
        ? [...input.messages]
        : createStructuredOutputRepairMessages({
            failures,
            maxInvalidOutputChars: input.maxInvalidOutputChars ?? defaultMaxInvalidOutputChars,
            maxRepairHistoryChars: input.maxRepairHistoryChars ?? defaultMaxRepairHistoryChars,
            messages: input.messages,
            outputContract: input.outputContract,
            outputShape: input.outputShape,
          });
    const completion = await completeStructuredProviderCall({
      chatProvider: input.chatProvider,
      jsonSchema: input.jsonSchema,
      messages,
      mode,
      model: input.model,
      onFallback: (reason) => {
        mode = "json_object_fallback";
        providerFallbackReason = reason;
      },
      ...(input.temperature === undefined ? {} : { temperature: input.temperature }),
      ...(input.timeoutMs === undefined ? {} : { timeoutMs: input.timeoutMs }),
    });

    try {
      return {
        attemptCount: repairAttempts + 1,
        completion,
        output: input.parse(completion.content),
        repairAttempts,
        structuredOutputMode: mode,
        validationIssues: failures.flatMap((failure) => [...failure.issues]),
        ...(providerFallbackReason === undefined ? {} : { providerFallbackReason }),
      };
    } catch (error) {
      const issues = input.getValidationIssues(error);

      if (issues === null) {
        throw error;
      }

      failures.push({
        invalidContent: completion.content,
        issues: [...issues],
      });

      if (repairAttempts >= input.maxRepairAttempts) {
        annotateStructuredJsonOutputError(error, {
          attemptCount: repairAttempts + 1,
          repairAttempts,
          structuredOutputMode: mode,
          validationIssues: [...issues],
          ...(providerFallbackReason === undefined ? {} : { providerFallbackReason }),
        });
        throw error;
      }
    }
  }

  throw new Error("Structured JSON output repair loop exited unexpectedly.");
}

export function readStructuredJsonOutputErrorMetadata(
  error: unknown,
): StructuredJsonOutputFailureMetadata | null {
  if (typeof error !== "object" || error === null) {
    return null;
  }

  const value = (error as Record<string, unknown>)[structuredOutputErrorMetadataKey];

  if (!isRecord(value)) {
    return null;
  }

  const mode = value.structuredOutputMode;
  const attemptCount = value.attemptCount;
  const repairAttempts = value.repairAttempts;
  const validationIssues = value.validationIssues;
  const providerFallbackReason = value.providerFallbackReason;

  if (
    (mode !== "strict_json_schema" && mode !== "json_object_fallback") ||
    typeof attemptCount !== "number" ||
    typeof repairAttempts !== "number" ||
    !Array.isArray(validationIssues) ||
    !validationIssues.every((issue) => typeof issue === "string")
  ) {
    return null;
  }

  return {
    attemptCount,
    repairAttempts,
    structuredOutputMode: mode,
    validationIssues,
    ...(typeof providerFallbackReason === "string" ? { providerFallbackReason } : {}),
  };
}

function annotateStructuredJsonOutputError(
  error: unknown,
  metadata: StructuredJsonOutputFailureMetadata,
): void {
  if (typeof error !== "object" || error === null) {
    return;
  }

  Object.defineProperty(error, structuredOutputErrorMetadataKey, {
    configurable: true,
    enumerable: false,
    value: metadata,
    writable: true,
  });
}

async function completeStructuredProviderCall(input: {
  chatProvider: ChatProvider;
  jsonSchema: StructuredJsonOutputSchema;
  messages: ChatMessage[];
  mode: StructuredOutputMode;
  model: string;
  onFallback: (reason: string) => void;
  temperature?: number;
  timeoutMs?: number;
}): Promise<ChatCompletionResult> {
  if (input.mode === "strict_json_schema") {
    try {
      return await input.chatProvider.complete({
        model: input.model,
        messages: input.messages,
        responseFormat: {
          type: "json_schema",
          jsonSchema: input.jsonSchema,
        },
        temperature: input.temperature ?? 0,
        ...(input.timeoutMs === undefined ? {} : { timeoutMs: input.timeoutMs }),
      });
    } catch (error) {
      if (!isStrictSchemaProviderRejection(error)) {
        throw error;
      }

      input.onFallback(summarizeProviderFallback(error));
    }
  }

  return input.chatProvider.complete({
    model: input.model,
    messages: input.messages,
    responseFormat: {
      type: "json_object",
    },
    temperature: input.temperature ?? 0,
    ...(input.timeoutMs === undefined ? {} : { timeoutMs: input.timeoutMs }),
  });
}

function createStructuredOutputRepairMessages(input: {
  failures: readonly StructuredOutputRepairFailure[];
  maxInvalidOutputChars: number;
  maxRepairHistoryChars: number;
  messages: readonly ChatMessage[];
  outputContract: string;
  outputShape: string;
}): ChatMessage[] {
  const repairMessages: ChatMessage[] = [];
  let repairHistoryChars = 0;

  for (const [index, failure] of input.failures.entries()) {
    const boundedOutput = truncateForStructuredRepairPrompt(
      failure.invalidContent,
      input.maxInvalidOutputChars,
    );
    const issueLines = failure.issues.map((issue) => `- ${issue}`);
    const repairInstruction = [
      `Repair attempt context ${index + 1}: the previous response failed structured output validation.`,
      "Validation issues:",
      ...issueLines,
      structuredJsonOnlyInstruction,
      input.outputContract,
      "The canonical JSON shape is:",
      input.outputShape,
    ].join("\n");
    const nextHistoryChars = repairHistoryChars + boundedOutput.length + repairInstruction.length;

    if (nextHistoryChars > input.maxRepairHistoryChars && repairMessages.length > 0) {
      repairMessages.unshift({
        role: "user",
        content:
          "Earlier invalid structured-output repair history was omitted because it exceeded the prompt budget.",
      });
      break;
    }

    repairMessages.push(
      {
        role: "assistant",
        content: boundedOutput,
      },
      {
        role: "user",
        content: repairInstruction,
      },
    );
    repairHistoryChars = nextHistoryChars;
  }

  return [...input.messages, ...repairMessages];
}

function truncateForStructuredRepairPrompt(value: string, maxChars: number): string {
  if (value.length <= maxChars) {
    return value;
  }

  return `${value.slice(0, maxChars)}\n[truncated]`;
}

function isStrictSchemaProviderRejection(error: unknown): boolean {
  if (typeof error === "object" && error !== null) {
    const status = (error as { status?: unknown }).status;

    if (status === 400 || status === 404 || status === 422) {
      return true;
    }
  }

  const message = error instanceof Error ? error.message.toLowerCase() : "";

  return (
    message.includes("json_schema") ||
    message.includes("response_format") ||
    message.includes("unsupported") ||
    message.includes("invalid schema")
  );
}

function summarizeProviderFallback(error: unknown): string {
  if (typeof error === "object" && error !== null) {
    const status = (error as { status?: unknown }).status;

    if (typeof status === "number") {
      return `strict_json_schema_rejected_status_${status}`;
    }
  }

  return "strict_json_schema_rejected";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
