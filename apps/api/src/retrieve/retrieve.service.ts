import { Inject, Injectable, Optional } from "@nestjs/common";
import { ApiError } from "@fococontext/contracts";
import type { RuntimeCache, RuntimeConfig } from "@fococontext/core";
import {
  BoundedGraphQueryService,
  BoundedRetrieveExpandEngine,
  RetrieveEngine,
  type GraphQueryInput,
  type GraphInsightsResponse,
  type GraphInsightStatus,
  type GraphQueryResponse,
  type ExpandableGraphNode,
  type RetrieveExpandInput,
  type RetrieveInput,
  type RetrieveResponse,
  type BoundedRetrievalRepository,
} from "@fococontext/retrieval";

import {
  operationalReadStoreToken,
  type OperationalReadStore,
} from "../database/operational-read-store.js";
import { DocumentService } from "../documents/document.service.js";
import type {
  SourceEvidenceBatchItemResultResponse,
  SourceEvidenceBatchResponse,
} from "../documents/document.types.js";
import type { KnowledgeBaseResponse } from "../knowledge-bases/knowledge-base.types.js";
import { wikiStoreToken, type WikiPageApiRecord, type WikiStore } from "../wiki/wiki-store.js";
import {
  boundedRetrievalRepositoryToken,
  retrievalEmbeddingProviderToken,
  retrievalRerankProviderToken,
  type ApiRetrievalEmbeddingProvider,
  type ApiRetrievalRerankProvider,
} from "./retrieve.provider.js";
import { runtimeConfigToken } from "../runtime-config.provider.js";
import { runtimeCacheToken } from "../runtime/redis-runtime-cache.js";
import { defaultApiResourceScope, type ApiResourceScope } from "../auth/api-key.guard.js";
import {
  createRetrievalQualityMetricRecord,
  retrievalQualityMetricsStoreToken,
  type RetrievalQualityMetricsStore,
} from "./retrieve-quality-metrics.js";

@Injectable()
export class RetrieveService {
  constructor(
    @Inject(operationalReadStoreToken)
    private readonly operationalReadStore: OperationalReadStore,
    @Inject(wikiStoreToken) private readonly wikiStore: WikiStore,
    @Inject(retrievalEmbeddingProviderToken)
    private readonly embeddingProvider: ApiRetrievalEmbeddingProvider,
    @Inject(runtimeConfigToken) private readonly runtimeConfig: RuntimeConfig,
    private readonly documentService: DocumentService,
    @Optional()
    @Inject(retrievalRerankProviderToken)
    private readonly rerankProvider?: ApiRetrievalRerankProvider,
    @Optional()
    @Inject(boundedRetrievalRepositoryToken)
    private readonly boundedRetrievalRepository?: BoundedRetrievalRepository,
    @Optional()
    @Inject(retrievalQualityMetricsStoreToken)
    private readonly retrievalQualityMetricsStore?: RetrievalQualityMetricsStore,
    @Optional()
    @Inject(runtimeCacheToken)
    private readonly runtimeCache?: RuntimeCache,
  ) {}

  async retrieve(
    knowledgeBaseId: string,
    input: Omit<RetrieveInput, "knowledge_base_id">,
    scope?: ApiResourceScope,
  ) {
    const knowledgeBase = await this.getReadableKnowledgeBase(knowledgeBaseId, scope);

    validateRetrieveAnswerabilityOptions(input);
    await this.ensureIndexedPagesAvailable(knowledgeBaseId);

    const boundedRepository = this.requireBoundedRetrievalRepository();
    const engineOptions = {
      ...(this.rerankProvider === undefined ? {} : { rerankProvider: this.rerankProvider }),
      boundedRepository,
      limits: createRetrievalLimits(this.runtimeConfig),
    };
    const engine = new RetrieveEngine(undefined, this.embeddingProvider, engineOptions);
    const startedAt = Date.now();
    const response = await engine.retrieve({
      ...applyDatasetRetrievePreferences(knowledgeBase.retrieval, input),
      knowledge_base_id: knowledgeBaseId,
    });
    await this.retrievalQualityMetricsStore?.record(
      createRetrievalQualityMetricRecord({
        latencyMs: Date.now() - startedAt,
        response,
      }),
    );

    if (response.trace !== null) {
      await this.wikiStore.saveRetrievalTrace(response.trace);
    }

    const responseWithReadiness = await this.attachGraphReadiness(knowledgeBaseId, response);

    return this.attachResolvedEvidence(knowledgeBaseId, responseWithReadiness, input, scope);
  }

  async expand(
    knowledgeBaseId: string,
    input: Omit<RetrieveExpandInput, "knowledge_base_id">,
    scope?: ApiResourceScope,
  ) {
    const knowledgeBase = await this.getReadableKnowledgeBase(knowledgeBaseId, scope);
    const retrievalPreferences = createDatasetRetrievePreferences(knowledgeBase.retrieval);
    const expandInput: RetrieveExpandInput = {
      ...input,
      knowledge_base_id: knowledgeBaseId,
    };

    if (
      expandInput.context_budget_tokens === undefined &&
      retrievalPreferences.context_budget_tokens !== undefined
    ) {
      expandInput.context_budget_tokens = retrievalPreferences.context_budget_tokens;
    }

    if (expandInput.depth === undefined && retrievalPreferences.graph_depth !== undefined) {
      expandInput.depth = retrievalPreferences.graph_depth;
    }

    const response = await new BoundedRetrieveExpandEngine(
      this.requireBoundedRetrievalRepository(),
    ).expand(expandInput);

    return this.attachResolvedEvidence(knowledgeBaseId, response, input, scope);
  }

  async graph(
    knowledgeBaseId: string,
    input: Omit<GraphQueryInput, "knowledge_base_id">,
    scope?: ApiResourceScope,
  ) {
    await this.getReadableKnowledgeBase(knowledgeBaseId, scope);
    const graph = await new BoundedGraphQueryService(
      this.requireBoundedRetrievalRepository(),
    ).query({
      ...input,
      knowledge_base_id: knowledgeBaseId,
    });

    return this.attachGraphReadiness(
      knowledgeBaseId,
      await this.attachSeedPageGraphNode(knowledgeBaseId, input, graph),
    );
  }

  async graphInsights(knowledgeBaseId: string, scope?: ApiResourceScope) {
    await this.getReadableKnowledgeBase(knowledgeBaseId, scope);
    const [status, materializedInsights] = await Promise.all([
      this.getCachedGraphInsightStatus(knowledgeBaseId),
      this.getCachedGraphInsightsSnapshot(knowledgeBaseId),
    ]);

    return materializedInsights === null
      ? createEmptyGraphInsightsResponse(knowledgeBaseId, status)
      : { ...materializedInsights, status };
  }

  private async getReadableKnowledgeBase(
    knowledgeBaseId: string,
    scope: ApiResourceScope = defaultApiResourceScope,
  ): Promise<KnowledgeBaseResponse> {
    const knowledgeBase = await this.operationalReadStore.getKnowledgeBaseById(
      scope,
      knowledgeBaseId,
    );

    if (knowledgeBase === null) {
      throw new ApiError("knowledge_base_not_found", {
        messageKey: "api.error.knowledge_base_not_found",
        details: {
          knowledge_base_id: knowledgeBaseId,
        },
      });
    }

    return knowledgeBase;
  }

  private requireBoundedRetrievalRepository(): BoundedRetrievalRepository {
    if (this.boundedRetrievalRepository === undefined) {
      throw new ApiError("bounded_retrieval_unavailable", {
        messageKey: "api.error.bounded_retrieval_unavailable",
        details: {
          backend: "bounded_retrieval_repository",
        },
      });
    }

    return this.boundedRetrievalRepository;
  }

  private async attachSeedPageGraphNode(
    knowledgeBaseId: string,
    input: Omit<GraphQueryInput, "knowledge_base_id">,
    graph: GraphQueryResponse,
  ): Promise<GraphQueryResponse> {
    if (input.page_id === undefined) {
      if (graph.nodes.length > 0) {
        return graph;
      }

      const pages = await this.wikiStore.listPages(knowledgeBaseId);

      return {
        ...graph,
        nodes: pages
          .filter((page) => input.page_type === undefined || page.type === input.page_type)
          .filter(
            (page) =>
              input.version_id === undefined || page.current_version_id === input.version_id,
          )
          .map(toSeedGraphNode),
      };
    }

    if (graph.nodes.some((node) => node.page_id === input.page_id)) {
      return graph;
    }

    const page = await this.findWikiPage(input.page_id);

    if (
      page === null ||
      page.knowledge_base_id !== knowledgeBaseId ||
      (input.page_type !== undefined && page.type !== input.page_type) ||
      (input.version_id !== undefined && page.current_version_id !== input.version_id)
    ) {
      return graph;
    }

    return {
      ...graph,
      nodes: [...graph.nodes, toSeedGraphNode(page)],
    };
  }

  private async findWikiPage(pageId: string): Promise<WikiPageApiRecord | null> {
    try {
      return await this.wikiStore.getPage(pageId);
    } catch {
      return null;
    }
  }

  private async ensureIndexedPagesAvailable(knowledgeBaseId: string): Promise<void> {
    const pages = await this.wikiStore.listPagesPaginated(knowledgeBaseId, {
      page: 1,
      pageSize: 1,
    });

    if (pages.total > 0 || pages.items.length > 0) {
      return;
    }

    throw new ApiError("retrieve_index_not_ready", {
      messageKey: "api.error.retrieve_index_not_ready",
      details: {
        knowledge_base_id: knowledgeBaseId,
      },
    });
  }

  private async attachResolvedEvidence<TResponse extends object>(
    knowledgeBaseId: string,
    response: TResponse,
    input: RetrieveResolvedEvidenceInput,
    scope?: ApiResourceScope,
  ): Promise<TResponse> {
    if (input.include_resolved_evidence !== true) {
      return response;
    }

    const output = JSON.parse(JSON.stringify(response)) as TResponse;
    const outputRecord = output as Record<string, unknown>;
    const evidenceOptions = normalizeRetrieveResolvedEvidenceOptions(input.resolved_evidence);
    const targets = collectEvidenceTargets(outputRecord, evidenceOptions.maxItems);
    const items = targets.map((target) => ({
      knowledge_base_id: knowledgeBaseId,
      document_id: target.documentId,
      ...(target.locator === undefined ? {} : { locator: target.locator }),
      ...(target.mediaAssetId === undefined ? {} : { media_asset_id: target.mediaAssetId }),
      ...(target.parsedContentId === undefined
        ? {}
        : { parsed_content_id: target.parsedContentId }),
      ...(target.sourceAnchorId === undefined ? {} : { source_anchor_id: target.sourceAnchorId }),
      evidence_kind: target.evidenceKind,
      allow_fallback: evidenceOptions.allowFallback,
      max_chars: evidenceOptions.maxChars,
      context_chars: evidenceOptions.contextChars,
    }));
    const sourceEvidenceLimits = this.runtimeConfig.limits.sourceEvidence;
    const resolved =
      items.length === 0
        ? createEmptyResolvedEvidencePayload(
            sourceEvidenceLimits.batchMaxItems,
            sourceEvidenceLimits.batchTotalOutputMaxChars,
          )
        : await this.documentService.resolveSourceEvidenceBatch({ items }, scope);

    attachResolvedEvidenceItems(outputRecord, targets, resolved);
    outputRecord.resolved_evidence = resolved;

    return output;
  }

  private async attachGraphReadiness<TResponse extends { warnings?: readonly string[] }>(
    knowledgeBaseId: string,
    response: TResponse,
  ): Promise<TResponse & { graph_readiness: GraphInsightStatus }> {
    const graphReadiness = await this.getCachedGraphInsightStatus(knowledgeBaseId);
    const warning = toGraphReadinessWarning(graphReadiness.state);
    const warnings =
      warning === null ? response.warnings : [...new Set([...(response.warnings ?? []), warning])];

    return {
      ...response,
      graph_readiness: graphReadiness,
      ...(warnings === undefined ? {} : { warnings }),
    };
  }

  private async getCachedGraphInsightStatus(knowledgeBaseId: string): Promise<GraphInsightStatus> {
    const cacheKey = {
      resourceKind: "graph-readiness" as const,
      scopeId: knowledgeBaseId,
      variant: "status",
    };
    const cached = await this.runtimeCache?.get<GraphInsightStatus>(cacheKey);

    if (cached !== undefined && cached !== null) {
      return cached;
    }

    const status = await this.wikiStore.getGraphInsightStatus(knowledgeBaseId);

    if (!isActiveGraphInsightStatus(status)) {
      await this.runtimeCache?.set({
        ...cacheKey,
        value: status,
      });
    }

    return status;
  }

  private async getCachedGraphInsightsSnapshot(
    knowledgeBaseId: string,
  ): Promise<GraphInsightsResponse | null> {
    const cacheKey = {
      resourceKind: "graph-readiness" as const,
      scopeId: knowledgeBaseId,
      variant: "insights",
    };
    const cached = await this.runtimeCache?.get<GraphInsightsResponse>(cacheKey);

    if (cached !== undefined && cached !== null) {
      return cached;
    }

    const snapshot = await this.wikiStore.getGraphInsightsSnapshot(knowledgeBaseId);

    if (snapshot !== null) {
      await this.runtimeCache?.set({
        ...cacheKey,
        value: snapshot,
      });
    }

    return snapshot;
  }
}

export type RetrieveApiResponse = RetrieveResponse;

type RetrieveResolvedEvidenceInput = {
  include_resolved_evidence?: unknown;
  resolved_evidence?: unknown;
};

interface NormalizedRetrieveResolvedEvidenceOptions {
  allowFallback: boolean;
  contextChars: number | undefined;
  maxChars: number | undefined;
  maxItems: number;
}

interface EvidenceTarget {
  key: string;
  documentId: string;
  evidenceKind: "text" | "image_caption" | "ocr";
  priority: number;
  locator?: string;
  mediaAssetId?: string;
  parsedContentId?: string;
  sourceAnchorId?: string;
  refs: Record<string, unknown>[];
}

function normalizeRetrieveResolvedEvidenceOptions(
  input: unknown,
): NormalizedRetrieveResolvedEvidenceOptions {
  const record = readRecord(input);
  const maxItems = readBoundedInteger(record.max_items, 20, 1, 20);

  return {
    allowFallback: record.allow_fallback === true,
    contextChars:
      record.context_chars === undefined
        ? undefined
        : readBoundedInteger(record.context_chars, undefined, 0, 2000),
    maxChars:
      record.max_chars === undefined
        ? undefined
        : readBoundedInteger(record.max_chars, undefined, 1, 12000),
    maxItems,
  };
}

function collectEvidenceTargets(
  response: Record<string, unknown>,
  maxItems: number,
): EvidenceTarget[] {
  const targets = new Map<string, EvidenceTarget>();
  let order = 0;

  visitEvidenceRefs(response, (ref, path) => {
    const target = toEvidenceTarget(ref);

    if (target === null) {
      return;
    }
    const priority = scoreEvidenceTarget(path, ref, target, order);
    order += 1;

    addEvidenceTarget(targets, target, priority);
  });

  for (const target of collectResultSourceMarkdownTargets(response)) {
    addEvidenceTarget(targets, target, target.priority);
  }

  return [...targets.values()]
    .sort((left, right) => right.priority - left.priority)
    .slice(0, maxItems);
}

function addEvidenceTarget(
  targets: Map<string, EvidenceTarget>,
  target: EvidenceTarget,
  priority: number,
): void {
  const existing = targets.get(target.key);

  if (existing === undefined) {
    targets.set(target.key, {
      ...target,
      priority,
    });
    return;
  }

  existing.refs.push(...target.refs);
  existing.priority = Math.max(existing.priority, priority);
  if (existing.parsedContentId === undefined && target.parsedContentId !== undefined) {
    existing.parsedContentId = target.parsedContentId;
  }
  if (existing.sourceAnchorId === undefined && target.sourceAnchorId !== undefined) {
    existing.sourceAnchorId = target.sourceAnchorId;
  }
  if (existing.mediaAssetId === undefined && target.mediaAssetId !== undefined) {
    existing.mediaAssetId = target.mediaAssetId;
  }
}

function collectResultSourceMarkdownTargets(response: Record<string, unknown>): EvidenceTarget[] {
  const results = Array.isArray(response.results) ? response.results : [];
  const targets: EvidenceTarget[] = [];

  for (let resultIndex = 0; resultIndex < results.length; resultIndex += 1) {
    const result = results[resultIndex];

    if (!isRecord(result)) {
      continue;
    }

    const documentIds = collectResultSourceDocumentIds(result);

    for (const [documentIndex, documentId] of documentIds.entries()) {
      const locator = "source_markdown:1";
      const evidenceKind: EvidenceTarget["evidenceKind"] = "text";

      targets.push({
        key: createEvidenceTargetKey({
          documentId,
          evidenceKind,
          locator,
        }),
        documentId,
        evidenceKind,
        locator,
        priority: 3_500_000 - resultIndex * 1_000 - documentIndex,
        refs: [],
      });
    }
  }

  return targets;
}

function collectResultSourceDocumentIds(result: Record<string, unknown>): string[] {
  const displayMetadata = readRecord(result.display_metadata);

  return uniqueStrings([
    ...readStringArray(result.source_document_ids),
    ...readStringArray(result.source_document_id),
    ...readStringArray(displayMetadata.source_document_ids),
    ...readStringArray(displayMetadata.source_document_id),
  ]);
}

function visitEvidenceRefs(
  value: unknown,
  visitor: (ref: Record<string, unknown>, path: readonly string[]) => void,
  path: readonly string[] = [],
): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      visitEvidenceRefs(item, visitor, path);
    }
    return;
  }

  if (!isRecord(value)) {
    return;
  }

  if (typeof value.document_id === "string") {
    visitor(value, path);
  }

  for (const [key, nested] of Object.entries(value)) {
    if (nested !== value) {
      visitEvidenceRefs(nested, visitor, [...path, key]);
    }
  }
}

function toEvidenceTarget(ref: Record<string, unknown>): EvidenceTarget | null {
  const documentId = readString(ref.document_id);

  if (documentId === undefined) {
    return null;
  }

  const evidenceKind = readEvidenceKind(ref.evidence_kind);
  const mediaAssetId = readString(ref.media_asset_id);
  const parsedContentId = readString(ref.parsed_content_id);
  const sourceAnchorId = readString(ref.source_anchor_id);
  const explicitLocator = readString(ref.locator);
  const locator =
    sourceAnchorId !== undefined &&
    (explicitLocator === undefined || explicitLocator === "source_markdown")
      ? "source_markdown:1"
      : explicitLocator;

  if (locator === undefined && mediaAssetId === undefined) {
    return null;
  }

  const key = createEvidenceTargetKey({
    documentId,
    evidenceKind,
    ...(locator === undefined ? {} : { locator }),
    ...(mediaAssetId === undefined ? {} : { mediaAssetId }),
    ...(parsedContentId === undefined ? {} : { parsedContentId }),
    ...(sourceAnchorId === undefined ? {} : { sourceAnchorId }),
  });

  return {
    key,
    documentId,
    evidenceKind,
    priority: 0,
    ...(locator === undefined ? {} : { locator }),
    ...(mediaAssetId === undefined ? {} : { mediaAssetId }),
    ...(parsedContentId === undefined ? {} : { parsedContentId }),
    ...(sourceAnchorId === undefined ? {} : { sourceAnchorId }),
    refs: [ref],
  };
}

function createEvidenceTargetKey(input: {
  documentId: string;
  evidenceKind: EvidenceTarget["evidenceKind"];
  locator?: string;
  mediaAssetId?: string;
  parsedContentId?: string;
  sourceAnchorId?: string;
}): string {
  const isStableSourceMarkdownLocator =
    input.locator !== undefined && /^source_markdown:\d+(?:-\d+)?$/u.test(input.locator);

  return [
    input.documentId,
    input.evidenceKind,
    input.locator ?? "",
    input.mediaAssetId ?? "",
    isStableSourceMarkdownLocator ? "" : (input.parsedContentId ?? ""),
    isStableSourceMarkdownLocator ? "" : (input.sourceAnchorId ?? ""),
  ].join("\u001f");
}

function scoreEvidenceTarget(
  path: readonly string[],
  ref: Record<string, unknown>,
  target: EvidenceTarget,
  order: number,
): number {
  let score = 10_000 - order;

  if (path[0] === "citations") {
    score += 1_000_000;
  }
  if (path[0] === "results") {
    score += 800_000;
  }
  if (path.includes("context_pack")) {
    score += 700_000;
  }
  if (path.includes("citations")) {
    score += 50_000;
  }
  if (path.includes("media_evidence")) {
    score += 20_000;
  }
  if (path.includes("graph_expansions") || path.includes("expandable_graph")) {
    score -= 100_000;
  }
  if (target.locator !== undefined) {
    score += 10_000;
  }
  if (target.sourceAnchorId !== undefined) {
    score += 5_000;
  }
  if (
    target.sourceAnchorId !== undefined &&
    target.locator !== undefined &&
    target.locator.startsWith("source_markdown:")
  ) {
    score += 2_000_000;
  }
  if (target.parsedContentId !== undefined) {
    score += 3_000;
  }

  const locatorStatus = readString(ref.locator_status);
  if (locatorStatus === "resolved") {
    score += 2_000;
  }
  if (locatorStatus === "not_found" || locatorStatus === "unsupported") {
    score -= 5_000;
  }

  return score;
}

function attachResolvedEvidenceItems(
  response: Record<string, unknown>,
  targets: readonly EvidenceTarget[],
  resolved: SourceEvidenceBatchResponse,
): void {
  const resolvedByKey = new Map<string, SourceEvidenceBatchItemResultResponse>();

  for (const item of resolved.items) {
    const target = targets[item.index];

    if (target !== undefined) {
      resolvedByKey.set(target.key, item);
    }
  }

  for (const target of targets) {
    const item = resolvedByKey.get(target.key);

    if (item === undefined) {
      continue;
    }

    for (const ref of target.refs) {
      ref.resolved_evidence = item;
    }
  }

  if (resolved.truncated) {
    const warnings = Array.isArray(response.warnings) ? response.warnings : [];
    response.warnings = [...warnings, "retrieve.resolved_evidence_truncated"];
  }
}

function createEmptyResolvedEvidencePayload(
  maxItems: number,
  totalOutputMaxChars: number,
): SourceEvidenceBatchResponse {
  return {
    items: [],
    limits: {
      max_items: maxItems,
      total_output_max_chars: totalOutputMaxChars,
    },
    total_text_chars: 0,
    truncated: false,
  };
}

function readRecord(input: unknown): Record<string, unknown> {
  return isRecord(input) ? input : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string" && item.length > 0);
  }

  const item = readString(value);

  return item === undefined ? [] : [item];
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readEvidenceKind(value: unknown): "text" | "image_caption" | "ocr" {
  if (value === "image_caption" || value === "ocr" || value === "text") {
    return value;
  }

  return "text";
}

function readBoundedInteger(
  value: unknown,
  defaultValue: number | undefined,
  minimum: number,
  maximum: number,
): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    if (defaultValue === undefined) {
      throw new ApiError("invalid_request", {
        details: {
          reason: "integer_required",
        },
      });
    }

    return defaultValue;
  }

  return Math.min(maximum, Math.max(minimum, value));
}

function validateRetrieveAnswerabilityOptions(
  input: Omit<RetrieveInput, "knowledge_base_id">,
): void {
  const fields: string[] = [];

  if (
    input.min_answer_confidence !== undefined &&
    (typeof input.min_answer_confidence !== "number" ||
      !Number.isFinite(input.min_answer_confidence) ||
      input.min_answer_confidence < 0 ||
      input.min_answer_confidence > 1)
  ) {
    fields.push("min_answer_confidence");
  }

  if (input.strict_evidence !== undefined && typeof input.strict_evidence !== "boolean") {
    fields.push("strict_evidence");
  }

  if (
    input.no_answer_behavior !== undefined &&
    input.no_answer_behavior !== "diagnostic_results" &&
    input.no_answer_behavior !== "empty_results"
  ) {
    fields.push("no_answer_behavior");
  }

  if (fields.length > 0) {
    throw new ApiError("invalid_request", {
      details: {
        fields,
        issues: fields.map((field) => ({
          field,
          reason: "invalid_retrieve_answerability_option",
        })),
      },
    });
  }
}

function createRetrievalLimits(config: RuntimeConfig) {
  return {
    defaultTopK: config.limits.retrieve.defaultTopK,
    maxTopK: config.limits.retrieve.maxTopK,
    defaultGraphDepth: config.limits.retrieve.defaultGraphDepth,
    maxGraphDepth: config.limits.retrieve.maxGraphDepth,
    defaultGraphLimitPerResult: config.limits.retrieve.defaultGraphLimitPerResult,
    maxGraphLimitPerResult: config.limits.retrieve.maxGraphLimitPerResult,
    defaultContextBudgetTokens: config.limits.retrieve.defaultContextBudgetTokens,
    maxContextBudgetTokens: config.limits.retrieve.maxContextBudgetTokens,
  };
}

function applyDatasetRetrievePreferences<TInput extends Partial<RetrieveInput>>(
  retrieval: Record<string, unknown>,
  input: TInput,
): TInput {
  const graphExpansion =
    typeof retrieval.graph_expansion === "object" &&
    retrieval.graph_expansion !== null &&
    !Array.isArray(retrieval.graph_expansion)
      ? (retrieval.graph_expansion as Record<string, unknown>)
      : {};
  const preferred: Partial<RetrieveInput> = {};
  const mode = readDatasetString(retrieval.mode) as RetrieveInput["mode"] | undefined;
  const topK = readDatasetNumber(retrieval.top_k);
  const graphDepth = readDatasetNumber(graphExpansion.depth);
  const graphLimitPerResult =
    readDatasetNumber(graphExpansion.limit_per_result) ??
    readDatasetNumber(retrieval.graph_limit_per_result);
  const contextBudgetTokens = readDatasetNumber(retrieval.context_budget_tokens);
  const includeTraceByDefault = readDatasetBoolean(retrieval.include_trace_by_default);

  if (mode !== undefined) {
    preferred.mode = mode;
  }

  if (topK !== undefined) {
    preferred.top_k = topK;
  }

  if (graphDepth !== undefined) {
    preferred.graph_depth = graphDepth;
  }

  if (graphLimitPerResult !== undefined) {
    preferred.graph_limit_per_result = graphLimitPerResult;
  }

  if (contextBudgetTokens !== undefined) {
    preferred.context_budget_tokens = contextBudgetTokens;
  }

  if (includeTraceByDefault !== undefined && input.include_trace === undefined) {
    preferred.include_trace = includeTraceByDefault;
  }

  return {
    ...preferred,
    ...input,
  } as TInput;
}

function createDatasetRetrievePreferences(
  retrieval: Record<string, unknown>,
): Partial<RetrieveInput> {
  return applyDatasetRetrievePreferences(retrieval, {});
}

function isActiveGraphInsightStatus(status: GraphInsightStatus): boolean {
  return status.state === "queued" || status.state === "updating";
}

function createEmptyGraphInsightsResponse(
  knowledgeBaseId: string,
  status: GraphInsightStatus,
): GraphInsightsResponse {
  return {
    knowledge_base_id: knowledgeBaseId,
    status,
    snapshot: {
      algorithm: {
        community_algorithm: {
          name: "materialized_graph_insights",
          resolution: 1,
          version: "1.0.0",
          weighted: true,
        },
        name: "fococontext-graph-insights",
        version: "materialized",
      },
      edge_count: 0,
      graph_hash: "unavailable",
      node_count: 0,
    },
    empty_reasons: {
      materialized_snapshot: "Graph insights have not been materialized yet.",
    },
    isolated_pages: [],
    sparse_pages: [],
    bridge_pages: [],
    knowledge_gaps: [],
    communities: [],
    surprising_connections: [],
  };
}

function toSeedGraphNode(page: WikiPageApiRecord): ExpandableGraphNode {
  return {
    page_id: page.id,
    page_version_id: page.current_version_id ?? page.id,
    source_refs: JSON.parse(
      JSON.stringify(page.source_refs ?? []),
    ) as unknown as ExpandableGraphNode["source_refs"],
    title: page.title,
    type: page.type,
    visibility_origin: page.visibility_origin ?? "canonical",
  };
}

function toGraphReadinessWarning(state: GraphInsightStatus["state"]): string | null {
  if (state === "ready") {
    return null;
  }

  return `graph.readiness.${state}`;
}

function readDatasetNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readDatasetString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readDatasetBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}
