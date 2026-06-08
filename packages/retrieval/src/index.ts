import { createHash, randomUUID } from "node:crypto";

export type RetrievalRelationType =
  | "wikilink"
  | "shared_source"
  | "common_neighbor"
  | "type_affinity"
  | "generated_relationship"
  | "evidence_relationship"
  | "manual";

export interface RetrievalSourceRef {
  document_id: string;
  parsed_content_id?: string;
  source_anchor_id?: string;
  name?: string;
  locator?: string;
  locator_status?: RetrievalCitationLocatorStatus;
  warning_codes?: readonly string[];
  summary?: string;
  virtual_path?: string;
  media_asset_id?: string;
  evidence_kind?: "text" | "image_caption" | "ocr";
  visibility_origin?: RetrievalVisibilityOrigin;
}

export type RetrievalCitationLocatorStatus =
  | "resolved"
  | "not_provided"
  | "not_found"
  | "ambiguous"
  | "unsupported";

export type RetrievalVisibilityOrigin = "canonical" | "upstream_inherited" | "fork_owned";

export interface RetrievalVisibilitySummary {
  canonical: number;
  upstream_inherited: number;
  fork_owned: number;
}

export interface RetrievalVisibilityMetadata {
  visibility_origin?: RetrievalVisibilityOrigin;
  owner_knowledge_base_id?: string | null;
  upstream_resource_id?: string | null;
  fork_tombstoned_at?: string | null;
}

export interface RetrievalKnowledgeBaseScopeRecord {
  knowledge_base_id: string;
  knowledge_base_type: "canonical" | "fork";
  upstream_knowledge_base_id: string | null;
  upstream_synced_version_id: string | null;
}

export interface RetrievalPageRecord extends RetrievalVisibilityMetadata {
  knowledge_base_id: string;
  page_id: string;
  page_version_id: string;
  title: string;
  type: string;
  markdown: string;
  frontmatter?: Record<string, unknown>;
  is_system_page: boolean;
  system_page_key: string | null;
  source_refs: readonly RetrievalSourceRef[];
  metadata: Record<string, unknown>;
}

export interface RetrievalEdgeRecord extends RetrievalVisibilityMetadata {
  knowledge_base_id: string;
  edge_id: string;
  from_page_id: string;
  to_page_id: string;
  relation_type: RetrievalRelationType;
  weight: number;
  explanation: string;
  source_document_ids: readonly string[];
}

export type RetrievalEmbeddingObjectType = "page" | "page_section" | "system_page";

export interface RetrievalEmbeddingRecord extends RetrievalVisibilityMetadata {
  id: string;
  knowledge_base_id: string;
  page_id: string;
  page_version_id: string;
  object_type: RetrievalEmbeddingObjectType;
  object_id: string;
  text: string;
  model: string;
  dimensions: number;
  vector: readonly number[];
  metadata: Record<string, unknown>;
}

export interface RetrievalTraceStage {
  name: string;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
}

export interface RetrievalTraceRecord {
  id: string;
  knowledge_base_id: string;
  query: string;
  request: Record<string, unknown>;
  answerability: RetrieveAnswerability;
  results: readonly RetrievalResult[];
  graph_expansions: readonly GraphExpansion[];
  context_pack: ContextPack | null;
  warnings: readonly string[];
  stages: readonly RetrievalTraceStage[];
  created_at: string;
}

export interface RetrievalEmbeddingProvider {
  model: string;
  dimensions: number;
  embed(input: { texts: readonly string[] }): Promise<{
    vectors: number[][];
  }>;
}

export interface RetrievalRerankProvider {
  model: string;
  rerank(input: { query: string; documents: readonly string[] }): Promise<{
    rankedDocuments: Array<{
      index: number;
      score: number;
    }>;
  }>;
}

export interface RetrievalCitation {
  document_id: string;
  parsed_content_id?: string;
  source_anchor_id?: string;
  locator?: string;
  locator_status?: RetrievalCitationLocatorStatus;
  warning_codes?: readonly string[];
  media_asset_id?: string;
  evidence_kind?: "text" | "image_caption" | "ocr";
  visibility_origin?: RetrievalVisibilityOrigin;
}

export interface RetrievalMediaEvidence {
  document_id: string;
  parsed_content_id?: string;
  source_anchor_id?: string;
  locator?: string;
  locator_status?: RetrievalCitationLocatorStatus;
  warning_codes?: readonly string[];
  media_asset_id: string;
  evidence_kind: "image_caption";
  caption?: string;
  visibility_origin?: RetrievalVisibilityOrigin;
  preview: {
    available: boolean;
    endpoint: string;
  };
}

export interface RetrievalMatchReason {
  field:
    | "title"
    | "title_phrase"
    | "markdown"
    | "markdown_phrase"
    | "page_section"
    | "source_name"
    | "source_virtual_path"
    | "source_locator"
    | "source_summary"
    | "page_slug"
    | "metadata";
  term: string;
}

export interface RetrievalScore {
  keyword: number;
  semantic: number | null;
  graph: number | null;
  rerank: number | null;
  fusion?: number | null;
}

export type RetrievalDisplayMetadataValue = string | number | boolean | readonly string[];

export type RetrievalDisplayMetadata = Record<string, RetrievalDisplayMetadataValue>;

export interface RetrievalScoreContribution {
  lexical?: number;
  semantic?: number;
  metadata?: number;
  graph: number;
  relation_weight: number;
  rerank?: number;
  fusion?: number;
  source_evidence?: number;
  version?: number;
}

export interface RetrievalResult {
  result_id: string;
  page_id: string;
  page_version_id: string;
  section_id?: string;
  title: string;
  type: string;
  section: string;
  score: RetrievalScore;
  retrieval_reason: string;
  lexical_rank: number | null;
  semantic_rank: number | null;
  expanded_from_page_id: string | null;
  expand_depth: number;
  graph_signals: readonly RetrievalGraphSignal[];
  match_reasons: readonly RetrievalMatchReason[];
  citations: readonly RetrievalCitation[];
  media_evidence: readonly RetrievalMediaEvidence[];
  source_document_ids: readonly string[];
  display_metadata?: RetrievalDisplayMetadata;
  relation_reason?: string;
  score_contribution?: RetrievalScoreContribution;
  source_refs?: readonly RetrievalExpandedSourceRef[];
  traversal?: RetrievalTraversalMetadata;
  visibility_origin?: RetrievalVisibilityOrigin;
}

export interface RetrievalGraphSignal {
  type: RetrievalRelationType;
  weight: number;
  edge_id: string;
  reason_codes?: readonly string[];
  signal_contributions?: readonly GraphSignalContribution[];
}

export interface RetrievalExpandedSourceRef {
  document_id: string;
  edge_id: string;
  relation_type: RetrievalRelationType;
}

export interface RetrievalTraversalMetadata {
  depth: number;
  path: readonly string[];
  seed_edge_id: string;
  seed_page_id: string;
}

export interface LexicalSearchInput {
  knowledge_base_id: string;
  query: string;
  top_k?: number;
  page_types?: readonly string[];
  source_ids?: readonly string[];
}

export interface RetrievalRepository {
  upsertKnowledgeBaseScope(scope: RetrievalKnowledgeBaseScopeRecord): void;
  findKnowledgeBaseScope(knowledgeBaseId: string): RetrievalKnowledgeBaseScopeRecord | undefined;
  upsertPage(page: RetrievalPageRecord): void;
  listPages(knowledgeBaseId: string): RetrievalPageRecord[];
  findPageById(pageId: string): RetrievalPageRecord | undefined;
  upsertEdge(edge: RetrievalEdgeRecord): void;
  findEdgeById(edgeId: string): RetrievalEdgeRecord | undefined;
  listEdgesForPage(pageId: string): RetrievalEdgeRecord[];
  listEdges(knowledgeBaseId: string): RetrievalEdgeRecord[];
  saveEmbedding(record: RetrievalEmbeddingRecord): void;
  listEmbeddings(knowledgeBaseId: string): RetrievalEmbeddingRecord[];
  saveTrace(record: RetrievalTraceRecord): void;
  listTraces(knowledgeBaseId: string): RetrievalTraceRecord[];
}

export class LexicalRetrievalService {
  constructor(private readonly repository: RetrievalRepository) {}

  search(input: LexicalSearchInput): RetrievalResult[] {
    const query = createLexicalQuery(input.query);
    const terms = query.tokens;

    if (terms.length === 0) {
      return [];
    }

    const pageTypeSet = new Set(input.page_types ?? []);
    const sourceIdSet = new Set(input.source_ids ?? []);
    const scored = this.repository
      .listPages(input.knowledge_base_id)
      .filter((page) => pageTypeSet.size === 0 || pageTypeSet.has(page.type))
      .filter(
        (page) =>
          sourceIdSet.size === 0 ||
          page.source_refs.some((source) => sourceIdSet.has(source.document_id)),
      )
      .map((page) => scoreLexicalPage(page, query))
      .filter((candidate) => candidate.keywordScore > 0)
      .sort((left, right) => {
        if (right.keywordScore !== left.keywordScore) {
          return right.keywordScore - left.keywordScore;
        }

        return left.page.title.localeCompare(right.page.title);
      })
      .slice(0, input.top_k ?? 10);

    return scored.map((candidate, index) =>
      toRetrievalResult(
        candidate.page,
        candidate.keywordScore,
        candidate.matchReasons,
        index + 1,
        query,
      ),
    );
  }
}

export class EmbeddingIndexService {
  constructor(
    private readonly repository: RetrievalRepository,
    private readonly provider: RetrievalEmbeddingProvider,
  ) {}

  async indexKnowledgeBase(knowledgeBaseId: string): Promise<RetrievalEmbeddingRecord[]> {
    const pages = this.repository.listPages(knowledgeBaseId);
    const records: RetrievalEmbeddingRecord[] = [];

    for (const page of pages) {
      const units = createEmbeddingUnits(page);
      const embeddingResult = await this.provider.embed({
        texts: units.map((unit) => unit.text),
      });

      units.forEach((unit, index) => {
        const vector = embeddingResult.vectors[index] ?? [];
        const record: RetrievalEmbeddingRecord = {
          id: `emb:${unit.objectType}:${unit.objectId}`,
          knowledge_base_id: page.knowledge_base_id,
          page_id: page.page_id,
          page_version_id: page.page_version_id,
          object_type: unit.objectType,
          object_id: unit.objectId,
          text: unit.text,
          model: this.provider.model,
          dimensions: this.provider.dimensions,
          vector,
          metadata: {
            title: page.title,
            type: page.type,
            ...(page.system_page_key === null ? {} : { system_page_key: page.system_page_key }),
          },
        };

        this.repository.saveEmbedding(record);
        records.push(record);
      });
    }

    return records;
  }
}

export interface SemanticSearchInput {
  knowledge_base_id: string;
  query: string;
  top_k?: number;
  page_types?: readonly string[];
  source_ids?: readonly string[];
}

export class SemanticRetrievalService {
  constructor(
    private readonly repository: RetrievalRepository,
    private readonly provider: RetrievalEmbeddingProvider,
  ) {}

  async search(input: SemanticSearchInput): Promise<RetrievalResult[]> {
    const queryEmbedding = await this.provider.embed({
      texts: [input.query],
    });
    const queryVector = queryEmbedding.vectors[0] ?? [];
    const pages = new Map(
      this.repository.listPages(input.knowledge_base_id).map((page) => [page.page_id, page]),
    );
    const pageTypeSet = new Set(input.page_types ?? []);
    const sourceIdSet = new Set(input.source_ids ?? []);
    const bestByPage = new Map<
      string,
      {
        embedding: RetrievalEmbeddingRecord;
        score: number;
      }
    >();

    for (const embedding of this.repository.listEmbeddings(input.knowledge_base_id)) {
      const page = pages.get(embedding.page_id);

      if (
        page === undefined ||
        (pageTypeSet.size > 0 && !pageTypeSet.has(page.type)) ||
        (sourceIdSet.size > 0 &&
          !page.source_refs.some((source) => sourceIdSet.has(source.document_id)))
      ) {
        continue;
      }

      const score = cosineSimilarity(queryVector, embedding.vector) * objectTypeWeight(embedding);
      const previous = bestByPage.get(embedding.page_id);

      if (score > 0 && (previous === undefined || score > previous.score)) {
        bestByPage.set(embedding.page_id, {
          embedding,
          score,
        });
      }
    }

    return [...bestByPage.values()]
      .sort((left, right) => right.score - left.score)
      .slice(0, input.top_k ?? 10)
      .map((candidate, index) => {
        const page = pages.get(candidate.embedding.page_id);

        if (page === undefined) {
          throw new Error("Semantic retrieval page record is missing.");
        }

        return toSemanticRetrievalResult(page, candidate.embedding, candidate.score, index + 1);
      });
  }
}

export interface RankFusionInput {
  query: string;
  lexical_results: readonly RetrievalResult[];
  semantic_results: readonly RetrievalResult[];
  candidate_text_by_page_id?: ReadonlyMap<string, string>;
  top_k?: number;
}

export interface RankFusionServiceOptions {
  rerankProvider?: RetrievalRerankProvider;
  rerankTimeoutMs?: number;
}

export type RankFusionRerankStatus = "disabled" | "skipped" | "applied" | "failed" | "timed_out";

export interface RankFusionDiagnostics {
  lexical_count: number;
  semantic_count: number;
  fused_count: number;
  duplicate_control: {
    pruned_count: number;
    pruned_page_ids: readonly string[];
  };
  precision_control: SourcePrecisionControlDiagnostics;
  rerank: {
    status: RankFusionRerankStatus;
    candidate_count: number;
    candidate_summaries: readonly RetrievalCandidateTraceSummary[];
    model?: string;
    reason?: string;
    duration_ms?: number;
  };
}

export type SourcePrecisionControlStatus = "skipped" | "applied";

export interface SourcePrecisionControlDiagnostics {
  status: SourcePrecisionControlStatus;
  anchor_source_document_ids: readonly string[];
  boosted_page_ids: readonly string[];
  demoted_page_ids: readonly string[];
  top_five_source_aligned_count: number;
  reason?: string;
}

export interface RetrievalCandidateTraceSummary {
  display_metadata_keys: readonly string[];
  match_fields: readonly RetrievalMatchReason["field"][];
  page_id: string;
  score_contribution?: RetrievalScoreContribution;
  title: string;
}

export interface RankFusionOutput {
  results: RetrievalResult[];
  diagnostics: RankFusionDiagnostics;
  warnings: string[];
}

export class RankFusionService {
  private readonly rerankProvider: RetrievalRerankProvider | undefined;
  private readonly rerankTimeoutMs: number;

  constructor(options: RankFusionServiceOptions = {}) {
    this.rerankProvider = options.rerankProvider;
    this.rerankTimeoutMs = options.rerankTimeoutMs ?? 5000;
  }

  async fuse(input: RankFusionInput): Promise<RetrievalResult[]> {
    return (await this.fuseWithDiagnostics(input)).results;
  }

  async fuseWithDiagnostics(input: RankFusionInput): Promise<RankFusionOutput> {
    const topK = input.top_k ?? 10;
    const lexicalQuery = createLexicalQuery(input.query);
    const preserveSectionCandidates = isSourcePrecisionQuerySpecific(lexicalQuery);
    const precisionControlledFusion = applySourcePrecisionControl({
      query: input.query,
      results: fuseByReciprocalRank(input.lexical_results, input.semantic_results, {
        preserveSectionCandidates,
      }),
      topK,
    });
    let precisionControlDiagnostics = precisionControlledFusion.diagnostics;
    const fusedBeforeDuplicateControl = precisionControlledFusion.results;
    const duplicateControl = pruneDuplicateFusionCandidates(fusedBeforeDuplicateControl);
    const fused = duplicateControl.results.slice(0, topK);
    const diagnostics: RankFusionDiagnostics = {
      lexical_count: input.lexical_results.length,
      semantic_count: input.semantic_results.length,
      fused_count: fused.length,
      duplicate_control: {
        pruned_count: duplicateControl.prunedPageIds.length,
        pruned_page_ids: duplicateControl.prunedPageIds,
      },
      precision_control: precisionControlDiagnostics,
      rerank: {
        status: this.rerankProvider === undefined ? "disabled" : "skipped",
        candidate_count: fused.length,
        candidate_summaries: createCandidateTraceSummaries(fused),
        ...(this.rerankProvider === undefined ? {} : { model: this.rerankProvider.model }),
      },
    };

    if (this.rerankProvider === undefined || fused.length === 0) {
      if (this.rerankProvider !== undefined && fused.length === 0) {
        diagnostics.rerank = {
          ...diagnostics.rerank,
          status: "skipped",
          reason: "no_candidates",
        };
      }

      return {
        results: fused,
        diagnostics,
        warnings: [],
      };
    }

    const startedAt = Date.now();

    try {
      const rerank = await withTimeout(
        this.rerankProvider.rerank({
          query: input.query,
          documents: fused.map(
            (result) =>
              (result.section_id === undefined
                ? input.candidate_text_by_page_id?.get(result.page_id)
                : undefined) ?? createRerankCandidateText(result),
          ),
        }),
        this.rerankTimeoutMs,
      );
      const scoreByIndex = new Map(
        rerank.rankedDocuments.map((item) => [item.index, item.score] as const),
      );
      const rerankScoredCandidates = fused.map((result, index) => ({
        result,
        rerankScore: scoreByIndex.get(index) ?? 0,
      }));
      const maxRerankScore = Math.max(
        0,
        ...rerankScoredCandidates.map((candidate) => positiveNumber(candidate.rerankScore)),
      );
      const maxDisambiguationScore = Math.max(
        0,
        ...rerankScoredCandidates.map((candidate) =>
          calculateRerankDisambiguationScore(candidate.result),
        ),
      );
      const results = fused
        .map((result, index) => {
          const rerankScore = scoreByIndex.get(index) ?? 0;

          return {
            result,
            rerankScore,
            blendedScore: calculateBlendedRerankScore(
              result,
              rerankScore,
              maxRerankScore,
              maxDisambiguationScore,
            ),
          };
        })
        .sort(
          (left, right) =>
            right.blendedScore - left.blendedScore ||
            right.rerankScore - left.rerankScore ||
            compareFusionResults(left.result, right.result),
        )
        .map(({ result, rerankScore }) => {
          const scoreContribution = mergeScoreContribution(result.score_contribution, {
            graph: 0,
            relation_weight: 0,
            rerank: rerankScore,
          });

          return {
            ...result,
            score: {
              ...result.score,
              rerank: rerankScore,
            },
            ...(scoreContribution === undefined ? {} : { score_contribution: scoreContribution }),
            retrieval_reason: `${result.retrieval_reason} Reranked by optional provider ${this.rerankProvider?.model}.`,
          };
        });
      const finalPrecision = applySourcePrecisionControl({
        query: input.query,
        results,
        topK,
        ...(precisionControlDiagnostics.anchor_source_document_ids.length === 0
          ? {}
          : {
              preferredAnchorSourceDocumentIds:
                precisionControlDiagnostics.anchor_source_document_ids,
            }),
      });
      precisionControlDiagnostics = mergeSourcePrecisionControlDiagnostics(
        precisionControlDiagnostics,
        finalPrecision.diagnostics,
      );

      return {
        results: finalPrecision.results.slice(0, topK),
        diagnostics: {
          ...diagnostics,
          precision_control: precisionControlDiagnostics,
          rerank: {
            status: "applied",
            candidate_count: fused.length,
            candidate_summaries: createCandidateTraceSummaries(
              finalPrecision.results.slice(0, topK),
            ),
            model: this.rerankProvider.model,
            duration_ms: Date.now() - startedAt,
          },
        },
        warnings: [],
      };
    } catch (error) {
      const timedOut = error instanceof Error && error.message === "Rerank timed out.";
      const reason = error instanceof Error ? error.message : "Unknown rerank failure.";

      return {
        results: fused,
        diagnostics: {
          ...diagnostics,
          rerank: {
            status: timedOut ? "timed_out" : "failed",
            candidate_count: fused.length,
            candidate_summaries: createCandidateTraceSummaries(fused),
            model: this.rerankProvider.model,
            reason,
            duration_ms: Date.now() - startedAt,
          },
        },
        warnings: [timedOut ? "retrieve.rerank_timed_out" : "retrieve.rerank_failed"],
      };
    }
  }
}

const RERANK_PROVIDER_WEIGHT = 0.4;
const RERANK_DISAMBIGUATION_WEIGHT = 0.6;

function calculateBlendedRerankScore(
  result: RetrievalResult,
  rerankScore: number,
  maxRerankScore: number,
  maxDisambiguationScore: number,
): number {
  if (maxDisambiguationScore <= 0) {
    return rerankScore;
  }

  return (
    normalizeScore(rerankScore, maxRerankScore) * RERANK_PROVIDER_WEIGHT +
    normalizeScore(calculateRerankDisambiguationScore(result), maxDisambiguationScore) *
      RERANK_DISAMBIGUATION_WEIGHT
  );
}

function calculateRerankDisambiguationScore(result: RetrievalResult): number {
  const contribution = result.score_contribution;

  return (
    Math.min(positiveNumber(contribution?.metadata ?? 0), 6) * 0.6 +
    Math.min(positiveNumber(contribution?.version ?? 0), 3) * 0.3 +
    Math.min(positiveNumber(contribution?.source_evidence ?? 0), 3) * 0.1
  );
}

function createRerankCandidateText(result: RetrievalResult): string {
  const displayMetadata =
    result.display_metadata === undefined
      ? ""
      : `Display metadata: ${JSON.stringify(result.display_metadata)}`;
  const matchReasons =
    result.match_reasons.length === 0
      ? ""
      : `Match reasons: ${result.match_reasons
          .map((reason) => `${reason.field}=${reason.term}`)
          .join(", ")}`;
  const citations =
    result.citations.length === 0
      ? ""
      : `Citations: ${result.citations
          .map((citation) => `${citation.document_id}:${citation.locator ?? "document"}`)
          .join(", ")}`;

  return [result.title, result.type, result.section, displayMetadata, matchReasons, citations]
    .filter((value) => value.trim().length > 0)
    .join("\n")
    .slice(0, 6000);
}

function createCandidateTraceSummaries(
  results: readonly RetrievalResult[],
): RetrievalCandidateTraceSummary[] {
  return results.slice(0, 10).map((result) => {
    const summary: RetrievalCandidateTraceSummary = {
      display_metadata_keys: Object.keys(result.display_metadata ?? {}).sort(),
      match_fields: [...new Set(result.match_reasons.map((reason) => reason.field))].sort(),
      page_id: result.page_id,
      title: result.title,
    };

    if (result.score_contribution !== undefined) {
      summary.score_contribution = { ...result.score_contribution };
    }

    return summary;
  });
}

function createRerankCandidateTextByPageId(
  repository: RetrievalRepository,
  knowledgeBaseId: string,
): Map<string, string> {
  return new Map(
    repository.listPages(knowledgeBaseId).map((page) => [
      page.page_id,
      [
        page.title,
        page.type,
        page.markdown.slice(0, 2400),
        ...page.source_refs.flatMap((source) => [
          source.source_anchor_id === undefined ? "" : `Source anchor: ${source.source_anchor_id}`,
          source.parsed_content_id === undefined
            ? ""
            : `Parsed content: ${source.parsed_content_id}`,
          source.name === undefined ? "" : `Source name: ${source.name}`,
          source.virtual_path === undefined ? "" : `Source path: ${source.virtual_path}`,
          source.summary === undefined ? "" : `Source summary: ${source.summary}`,
        ]),
        `Display metadata: ${JSON.stringify(createDisplayMetadata(page) ?? {})}`,
      ]
        .filter((value) => value.trim().length > 0)
        .join("\n")
        .slice(0, 6000),
    ]),
  );
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(() => {
          reject(new Error("Rerank timed out."));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeout !== undefined) {
      clearTimeout(timeout);
    }
  }
}

export interface GraphExpansionInput {
  knowledge_base_id: string;
  seed_results: readonly RetrievalResult[];
  depth?: number;
  relation_types?: readonly RetrievalRelationType[];
  limit_per_result?: number;
}

export interface GraphExpansion {
  from_page_id: string;
  to_page_id: string;
  to_page_version_id: string;
  edge_id: string;
  visibility_origin?: RetrievalVisibilityOrigin;
  edge_visibility_origin?: RetrievalVisibilityOrigin;
  relation_type: RetrievalRelationType;
  weight: number;
  explanation: string;
  signal_breakdown: Record<RetrievalRelationType, number>;
  source_document_ids: readonly string[];
  can_expand: boolean;
  graph_score: number;
  expand_depth: number;
  insight_refs?: readonly GraphInsightReference[];
  signal_contributions?: readonly GraphSignalContribution[];
}

export class GraphExpansionService {
  constructor(private readonly repository: RetrievalRepository) {}

  expand(input: GraphExpansionInput): GraphExpansion[] {
    const relationTypes = new Set(input.relation_types ?? relationTypeOrder);
    const depth = input.depth ?? 1;
    const limitPerResult = input.limit_per_result ?? 5;
    const expansions: GraphExpansion[] = [];
    const seenEdges = new Set<string>();
    const pages = this.repository.listPages(input.knowledge_base_id);
    const pagesById = new Map(pages.map((page) => [page.page_id, page]));
    const edgesForKnowledgeBase = this.repository.listEdges(input.knowledge_base_id);
    const insightRefsByPageId = createGraphInsightRefsByPageId(
      new GraphQueryService(this.repository).insights(input.knowledge_base_id),
    );
    const signalContext = createGraphSignalContributionContext(pages, edgesForKnowledgeBase);

    for (const seed of input.seed_results) {
      const edges = edgesForKnowledgeBase
        .filter((edge) => edge.from_page_id === seed.page_id)
        .filter((edge) => relationTypes.has(edge.relation_type))
        .sort((left, right) => right.weight - left.weight)
        .slice(0, limitPerResult);

      for (const edge of edges) {
        if (seenEdges.has(edge.edge_id)) {
          continue;
        }

        const targetPage = pagesById.get(edge.to_page_id);

        if (targetPage === undefined) {
          continue;
        }

        seenEdges.add(edge.edge_id);
        expansions.push(
          toGraphExpansion(
            edge,
            targetPage,
            depth,
            pages,
            edgesForKnowledgeBase,
            insightRefsByPageId,
            signalContext,
          ),
        );
      }
    }

    return expansions.sort((left, right) => right.graph_score - left.graph_score);
  }
}

export type RetrieveMode = "keyword" | "semantic" | "graph" | "hybrid";

export type RetrieveAnswerabilityStatus = "answerable" | "partial" | "not_answerable";

export type RetrieveEvidenceSufficiency = "sufficient" | "partial" | "insufficient";

export type RetrieveRecommendedAction =
  | "answer_with_citations"
  | "answer_with_caveat"
  | "ask_clarifying_question"
  | "refuse_or_escalate"
  | "relax_filters"
  | "retry_after_ingest";

export type RetrieveAnswerabilityReasonCode =
  | "sufficient_evidence"
  | "partial_evidence"
  | "low_confidence"
  | "low_score_margin"
  | "insufficient_citations"
  | "no_relevant_candidate"
  | "over_filtered"
  | "index_not_ready"
  | "ambiguous_intent"
  | "context_pack_diagnostic_only"
  | "strict_evidence_required";

export type RetrieveNoAnswerBehavior = "diagnostic_results" | "empty_results";

export interface RetrieveAnswerabilityThresholds {
  answerable: number;
  partial: number;
  min_citations: number;
  strict_evidence: boolean;
  no_answer_behavior: RetrieveNoAnswerBehavior;
}

export interface RetrieveAnswerability {
  status: RetrieveAnswerabilityStatus;
  confidence: number;
  evidence_sufficiency: RetrieveEvidenceSufficiency;
  no_answer: boolean;
  reason_codes: readonly RetrieveAnswerabilityReasonCode[];
  recommended_action: RetrieveRecommendedAction;
  thresholds: RetrieveAnswerabilityThresholds;
}

export interface RetrieveInput {
  knowledge_base_id: string;
  query: string;
  mode?: RetrieveMode;
  top_k?: number;
  include_graph?: boolean;
  graph_depth?: number;
  graph_limit_per_result?: number;
  relation_types?: readonly RetrievalRelationType[];
  page_types?: readonly string[];
  source_ids?: readonly string[];
  include_expand_hints?: boolean;
  include_context_pack?: boolean;
  context_budget_tokens?: number;
  include_resolved_evidence?: boolean;
  resolved_evidence?: RetrieveResolvedEvidenceOptions;
  include_trace?: boolean;
  min_answer_confidence?: number;
  strict_evidence?: boolean;
  no_answer_behavior?: RetrieveNoAnswerBehavior;
  version_id?: string;
}

export interface RetrieveResolvedEvidenceOptions {
  allow_fallback?: boolean;
  context_chars?: number;
  max_chars?: number;
  max_items?: number;
}

export interface ExpandableGraphNode {
  page_id: string;
  page_version_id: string;
  source_refs: readonly RetrievalSourceRef[];
  title: string;
  type: string;
  display_metadata?: RetrievalDisplayMetadata;
  visibility_origin?: RetrievalVisibilityOrigin;
}

export interface ExpandableGraphEdge {
  edge_id: string;
  from_page_id: string;
  source_document_ids: readonly string[];
  to_page_id: string;
  relation_type: RetrievalRelationType;
  visibility_origin?: RetrievalVisibilityOrigin;
}

export interface ExpandableGraph {
  seed_page_ids: readonly string[];
  nodes: readonly ExpandableGraphNode[];
  edges: readonly ExpandableGraphEdge[];
  next_expansion: {
    seed_page_ids: readonly string[];
    relation_types: readonly RetrievalRelationType[];
    depth: number;
    exclude_page_ids: readonly string[];
  };
}

export interface RetrieveResponse {
  knowledge_base_id: string;
  target_knowledge_base_type: RetrievalKnowledgeBaseScopeRecord["knowledge_base_type"];
  visibility_summary: RetrievalVisibilitySummary;
  query: string;
  mode: RetrieveMode;
  results: readonly RetrievalResult[];
  graph_expansions: readonly GraphExpansion[];
  expandable_graph: ExpandableGraph | null;
  citations: readonly RetrievalCitation[];
  media_evidence: readonly RetrievalMediaEvidence[];
  context_pack: ContextPack | null;
  context_budget: ContextBudget | null;
  answerability: RetrieveAnswerability;
  warnings: readonly string[];
  resolved_evidence?: unknown;
  trace: RetrievalTraceRecord | null;
}

export interface RetrievalRuntimeLimits {
  defaultTopK: number;
  maxTopK: number;
  defaultGraphDepth: number;
  maxGraphDepth: number;
  defaultGraphLimitPerResult: number;
  maxGraphLimitPerResult: number;
  defaultContextBudgetTokens: number;
  maxContextBudgetTokens: number;
}

export interface RetrieveEngineOptions {
  rerankProvider?: RetrievalRerankProvider;
  limits?: Partial<RetrievalRuntimeLimits>;
}

const defaultRetrievalRuntimeLimits: RetrievalRuntimeLimits = {
  defaultTopK: 10,
  maxTopK: 20,
  defaultGraphDepth: 1,
  maxGraphDepth: 3,
  defaultGraphLimitPerResult: 5,
  maxGraphLimitPerResult: 10,
  defaultContextBudgetTokens: 4000,
  maxContextBudgetTokens: 12000,
};

const defaultAnswerableConfidenceThreshold = 0.6;
const defaultPartialConfidenceThreshold = 0.35;
const defaultAnswerabilityMinCitations = 1;

const graphInsightResponseCache = new Map<string, GraphInsightsResponse>();

interface NormalizedRetrieveInput {
  top_k: number;
  graph_depth: number;
  graph_limit_per_result: number;
  context_budget_tokens: number;
  min_answer_confidence: number;
  partial_answer_confidence: number;
  strict_evidence: boolean;
  no_answer_behavior: RetrieveNoAnswerBehavior;
  warnings: string[];
}

export class RetrieveEngine {
  private readonly lexicalService: LexicalRetrievalService;
  private readonly semanticService: SemanticRetrievalService;
  private readonly rankFusionService: RankFusionService;
  private readonly graphExpansionService: GraphExpansionService;
  private readonly limits: RetrievalRuntimeLimits;

  constructor(
    private readonly repository: RetrievalRepository,
    embeddingProvider: RetrievalEmbeddingProvider,
    options: RetrieveEngineOptions = {},
  ) {
    this.lexicalService = new LexicalRetrievalService(repository);
    this.semanticService = new SemanticRetrievalService(repository, embeddingProvider);
    this.rankFusionService = new RankFusionService(
      options.rerankProvider === undefined ? {} : { rerankProvider: options.rerankProvider },
    );
    this.graphExpansionService = new GraphExpansionService(repository);
    this.limits = {
      ...defaultRetrievalRuntimeLimits,
      ...options.limits,
    };
  }

  async retrieve(input: RetrieveInput): Promise<RetrieveResponse> {
    const mode = input.mode ?? "hybrid";
    const normalizedInput = normalizeRetrieveInput(input, this.limits);
    const topK = normalizedInput.top_k;
    const targetKnowledgeBaseType =
      this.repository.findKnowledgeBaseScope(input.knowledge_base_id)?.knowledge_base_type ??
      "canonical";
    const stages: RetrievalTraceStage[] = [];
    const lexicalQuery = createLexicalQuery(input.query);
    const requestWarnings: string[] = [];

    stages.push({
      name: "query_normalization",
      input: {
        query: input.query,
      },
      output: {
        phrase: lexicalQuery.phrase,
        identity_terms: lexicalQuery.identityTerms,
        tokens: lexicalQuery.tokens,
        warnings: normalizedInput.warnings,
      },
    });

    const lexicalInput: LexicalSearchInput = {
      knowledge_base_id: input.knowledge_base_id,
      query: input.query,
      top_k: topK,
    };
    const semanticInput: SemanticSearchInput = {
      knowledge_base_id: input.knowledge_base_id,
      query: input.query,
      top_k: topK,
    };

    if (input.page_types !== undefined) {
      lexicalInput.page_types = input.page_types;
      semanticInput.page_types = input.page_types;
    }

    if (input.source_ids !== undefined) {
      lexicalInput.source_ids = input.source_ids;
      semanticInput.source_ids = input.source_ids;
    }

    const lexicalResults =
      mode === "keyword" || mode === "hybrid" ? this.lexicalService.search(lexicalInput) : [];

    stages.push({
      name: "keyword_retrieval",
      input: {
        query: input.query,
      },
      output: {
        result_count: lexicalResults.length,
      },
    });
    stages.push({
      name: "metadata_matching",
      input: {
        lexical_result_count: lexicalResults.length,
      },
      output: summarizeMetadataMatches(lexicalResults),
    });

    const semanticIndexRecordCount = this.repository.listEmbeddings(input.knowledge_base_id).length;
    const semanticRequested = mode === "semantic" || mode === "hybrid";
    if (semanticRequested && semanticIndexRecordCount === 0) {
      requestWarnings.push("retrieve.index.semantic_not_ready");
    }

    const semanticResults =
      mode === "semantic" || mode === "hybrid"
        ? await this.semanticService.search(semanticInput)
        : [];

    stages.push({
      name: "semantic_retrieval",
      input: {
        query: input.query,
      },
      output: {
        result_count: semanticResults.length,
        index_record_count: semanticIndexRecordCount,
        ready: !semanticRequested || semanticIndexRecordCount > 0,
      },
    });

    const rankFusion = await this.rankFusionService.fuseWithDiagnostics({
      query: input.query,
      lexical_results: mode === "semantic" ? [] : lexicalResults,
      semantic_results: mode === "keyword" ? [] : semanticResults,
      candidate_text_by_page_id: createRerankCandidateTextByPageId(
        this.repository,
        input.knowledge_base_id,
      ),
      top_k: topK,
    });
    const results = rankFusion.results;

    stages.push({
      name: "rank_fusion",
      input: {
        lexical_count: lexicalResults.length,
        semantic_count: semanticResults.length,
      },
      output: {
        result_count: results.length,
        diagnostics: {
          lexical_count: rankFusion.diagnostics.lexical_count,
          semantic_count: rankFusion.diagnostics.semantic_count,
          fused_count: rankFusion.diagnostics.fused_count,
          duplicate_control: rankFusion.diagnostics.duplicate_control,
          precision_control: rankFusion.diagnostics.precision_control,
        },
      },
    });
    stages.push({
      name: "rerank",
      input: {
        candidate_count: rankFusion.diagnostics.rerank.candidate_count,
      },
      output: {
        ...rankFusion.diagnostics.rerank,
      },
    });

    const graphSeedResults = uniqueResultsByPage(results);
    const graphInput: GraphExpansionInput = {
      knowledge_base_id: input.knowledge_base_id,
      seed_results: graphSeedResults,
      depth: normalizedInput.graph_depth,
      limit_per_result: normalizedInput.graph_limit_per_result,
    };

    if (input.relation_types !== undefined) {
      graphInput.relation_types = input.relation_types;
    }

    const graphExpansions =
      input.include_graph === false ? [] : this.graphExpansionService.expand(graphInput);

    stages.push({
      name: "graph_expansion",
      input: {
        seed_page_ids: graphSeedResults.map((result) => result.page_id),
      },
      output: {
        expansion_count: graphExpansions.length,
      },
    });

    const expandableGraph =
      input.include_expand_hints === false
        ? null
        : buildExpandableGraph(this.repository, results, graphExpansions, input);
    const contextPack =
      input.include_context_pack === true
        ? new ContextPackBuilder(this.repository).build({
            knowledge_base_id: input.knowledge_base_id,
            results,
            graph_expansions: graphExpansions,
            budget_tokens: normalizedInput.context_budget_tokens,
          })
        : null;
    stages.push({
      name: "context_budget",
      input: {
        enabled: input.include_context_pack === true,
        requested_budget_tokens:
          input.context_budget_tokens ?? this.limits.defaultContextBudgetTokens,
      },
      output:
        contextPack === null
          ? {
              enabled: false,
            }
          : {
              enabled: true,
              budget_tokens: contextPack.budget_tokens,
              used_tokens: contextPack.used_tokens,
              truncated: contextPack.context_budget.truncated,
              truncated_categories: contextPack.context_budget.truncated_categories,
              omitted_item_count: contextPack.context_budget.omitted_items.length,
              media_evidence_count: contextPack.media_evidence.length,
              omitted_media_evidence_count: contextPack.context_budget.omitted_items.filter(
                (item) => item.category === "media_evidence",
              ).length,
            },
    });
    stages.push({
      name: "context_pruning",
      input: {
        enabled: contextPack !== null,
      },
      output:
        contextPack === null
          ? {
              enabled: false,
            }
          : {
              enabled: true,
              omitted_item_count: contextPack.context_budget.omitted_items.length,
              omitted_reason_counts: countOmittedContextReasons(
                contextPack.context_budget.omitted_items,
              ),
              truncated_categories: contextPack.context_budget.truncated_categories,
            },
    });

    const citations = dedupeCitations(results.flatMap((result) => result.citations));
    const mediaEvidence = dedupeMediaEvidence(results.flatMap((result) => result.media_evidence));
    stages.push({
      name: "citation_selection",
      input: {
        result_count: results.length,
      },
      output: {
        citation_count: citations.length,
        media_evidence_count: mediaEvidence.length,
      },
    });

    const baseWarnings: string[] = [
      ...normalizedInput.warnings,
      ...requestWarnings,
      ...rankFusion.warnings,
    ];
    const answerabilityAssessment = assessRetrieveAnswerability({
      query: input.query,
      mode,
      results,
      graph_expansions: graphExpansions,
      citations,
      context_pack: contextPack,
      warnings: baseWarnings,
      normalized_input: normalizedInput,
      semantic_requested: semanticRequested,
      semantic_index_record_count: semanticIndexRecordCount,
      duplicate_pruned_count: rankFusion.diagnostics.duplicate_control.pruned_count,
      has_filters: hasRetrieveFilters(input),
    });
    const answerability = answerabilityAssessment.answerability;
    const warnings = dedupeWarningCodes([...baseWarnings, ...answerabilityAssessment.warnings]);
    stages.push({
      name: "answerability",
      input: {
        result_count: results.length,
        graph_expansion_count: graphExpansions.length,
        citation_count: citations.length,
        context_pack_enabled: contextPack !== null,
        semantic_requested: semanticRequested,
        semantic_index_record_count: semanticIndexRecordCount,
      },
      output: answerabilityAssessment.trace_output,
    });

    const shouldEmptyNoAnswerDiagnostics =
      answerability.no_answer && normalizedInput.no_answer_behavior === "empty_results";
    const responseResults = shouldEmptyNoAnswerDiagnostics ? [] : results;
    const responseGraphExpansions = shouldEmptyNoAnswerDiagnostics ? [] : graphExpansions;
    const responseExpandableGraph = shouldEmptyNoAnswerDiagnostics ? null : expandableGraph;
    const responseCitations = shouldEmptyNoAnswerDiagnostics ? [] : citations;
    const responseMediaEvidence = shouldEmptyNoAnswerDiagnostics ? [] : mediaEvidence;
    const responseContextPack =
      shouldEmptyNoAnswerDiagnostics || contextPack === null
        ? null
        : attachContextPackAnswerability(contextPack, answerability);
    const visibilitySummary = summarizeRetrieveVisibility({
      context_pack: responseContextPack,
      expandable_graph: responseExpandableGraph,
      graph_expansions: responseGraphExpansions,
      results: responseResults,
    });
    stages.push({
      name: "final_packing",
      input: {
        result_count: responseResults.length,
        graph_expansion_count: responseGraphExpansions.length,
        context_pack_enabled: responseContextPack !== null,
      },
      output: {
        warning_count: warnings.length,
        citation_count: responseCitations.length,
        media_evidence_count: responseMediaEvidence.length,
        answerability_status: answerability.status,
        no_answer: answerability.no_answer,
      },
    });

    const responseWithoutTrace = {
      knowledge_base_id: input.knowledge_base_id,
      target_knowledge_base_type: targetKnowledgeBaseType,
      visibility_summary: visibilitySummary,
      query: input.query,
      mode,
      results: responseResults,
      graph_expansions: responseGraphExpansions,
      expandable_graph: responseExpandableGraph,
      citations: responseCitations,
      media_evidence: responseMediaEvidence,
      context_pack: responseContextPack,
      context_budget: responseContextPack?.context_budget ?? null,
      answerability,
      warnings,
    };
    const trace =
      input.include_trace === true
        ? this.createTrace(input, responseWithoutTrace, stages, normalizedInput)
        : null;

    return {
      ...responseWithoutTrace,
      trace,
    };
  }

  private createTrace(
    input: RetrieveInput,
    response: Omit<RetrieveResponse, "trace">,
    stages: readonly RetrievalTraceStage[],
    normalizedInput: NormalizedRetrieveInput,
  ): RetrievalTraceRecord {
    const trace: RetrievalTraceRecord = {
      id: createRetrievalTraceId(),
      knowledge_base_id: input.knowledge_base_id,
      query: input.query,
      request: {
        mode: input.mode ?? "hybrid",
        top_k: normalizedInput.top_k,
        graph_depth: normalizedInput.graph_depth,
        graph_limit_per_result: normalizedInput.graph_limit_per_result,
        context_budget_tokens: normalizedInput.context_budget_tokens,
        min_answer_confidence: normalizedInput.min_answer_confidence,
        strict_evidence: normalizedInput.strict_evidence,
        no_answer_behavior: normalizedInput.no_answer_behavior,
      },
      answerability: response.answerability,
      results: response.results.map(cloneRetrievalResult),
      graph_expansions: response.graph_expansions.map(cloneGraphExpansion),
      context_pack: response.context_pack,
      warnings: [...response.warnings],
      stages: stages.map((stage) => ({
        name: stage.name,
        input: { ...stage.input },
        output: { ...stage.output },
      })),
      created_at: new Date().toISOString(),
    };

    this.repository.saveTrace(trace);

    return trace;
  }
}

export interface RetrieveExpandInput {
  knowledge_base_id: string;
  seed_page_ids: readonly string[];
  seed_edge_ids?: readonly string[];
  depth?: number;
  relation_types?: readonly RetrievalRelationType[];
  exclude_page_ids?: readonly string[];
  include_context_pack?: boolean;
  context_budget_tokens?: number;
  include_resolved_evidence?: boolean;
  resolved_evidence?: RetrieveResolvedEvidenceOptions;
  version_id?: string;
}

export interface RetrieveExpandResponse {
  knowledge_base_id: string;
  expanded_results: readonly RetrievalResult[];
  nodes: readonly ExpandableGraphNode[];
  edges: readonly ExpandableGraphEdge[];
  context_pack_delta: ContextPack | null;
  answerability: RetrieveAnswerability;
  resolved_evidence?: unknown;
  next_expansion: {
    seed_page_ids: readonly string[];
    relation_types: readonly RetrievalRelationType[];
    depth: number;
    exclude_page_ids: readonly string[];
  };
}

export class RetrieveExpandEngine {
  constructor(private readonly repository: RetrievalRepository) {}

  expand(input: RetrieveExpandInput): RetrieveExpandResponse {
    const relationTypes = new Set(input.relation_types ?? relationTypeOrder);
    const excludePageIds = new Set(input.exclude_page_ids ?? []);
    const seedPageIds = [...new Set(input.seed_page_ids)];
    const pages = this.repository.listPages(input.knowledge_base_id);
    const pagesById = new Map(pages.map((page) => [page.page_id, page]));
    const edgesForKnowledgeBase = this.repository.listEdges(input.knowledge_base_id);
    const insightRefsByPageId = createGraphInsightRefsByPageId(
      new GraphQueryService(this.repository).insights(input.knowledge_base_id),
    );
    const signalContext = createGraphSignalContributionContext(pages, edgesForKnowledgeBase);
    const expansionEdges = this.collectExpansionEdges(
      input.knowledge_base_id,
      seedPageIds,
      input.seed_edge_ids ?? [],
    )
      .filter((edge) => edge.knowledge_base_id === input.knowledge_base_id)
      .filter((edge) => relationTypes.has(edge.relation_type))
      .filter((edge) => !excludePageIds.has(edge.to_page_id));
    const graphExpansions = expansionEdges.flatMap((edge) => {
      const targetPage = pagesById.get(edge.to_page_id);

      return targetPage === undefined
        ? []
        : [
            toGraphExpansion(
              edge,
              targetPage,
              input.depth ?? 1,
              pages,
              edgesForKnowledgeBase,
              insightRefsByPageId,
              signalContext,
            ),
          ];
    });
    const expandedResults = graphExpansions.flatMap((expansion) => {
      const page = pagesById.get(expansion.to_page_id);

      return page === undefined ? [] : [toExpandedRetrievalResult(page, expansion)];
    });
    const contextPackDelta =
      input.include_context_pack === true
        ? new ContextPackBuilder(this.repository).build({
            knowledge_base_id: input.knowledge_base_id,
            results: expandedResults,
            graph_expansions: [],
            budget_tokens: input.context_budget_tokens ?? 4000,
          })
        : null;
    const expandedPageIds = [...new Set(expandedResults.map((result) => result.page_id))];
    const allNodeIds = [...new Set([...seedPageIds, ...expandedPageIds])];
    const answerability = assessRetrieveAnswerability({
      query: "",
      mode: "graph",
      results: expandedResults,
      graph_expansions: graphExpansions,
      citations: dedupeCitations(expandedResults.flatMap((result) => result.citations)),
      context_pack: contextPackDelta,
      warnings: [],
      normalized_input: {
        top_k: expandedResults.length,
        graph_depth: input.depth ?? 1,
        graph_limit_per_result: graphExpansions.length,
        context_budget_tokens: input.context_budget_tokens ?? 4000,
        min_answer_confidence: defaultAnswerableConfidenceThreshold,
        partial_answer_confidence: defaultPartialConfidenceThreshold,
        strict_evidence: false,
        no_answer_behavior: "diagnostic_results",
        warnings: [],
      },
      semantic_requested: false,
      semantic_index_record_count: 0,
      duplicate_pruned_count: 0,
      has_filters:
        (input.relation_types?.length ?? 0) > 0 || (input.exclude_page_ids?.length ?? 0) > 0,
    }).answerability;
    const annotatedContextPackDelta =
      contextPackDelta === null
        ? null
        : attachContextPackAnswerability(contextPackDelta, answerability);

    return {
      knowledge_base_id: input.knowledge_base_id,
      expanded_results: expandedResults,
      nodes: allNodeIds.flatMap((pageId) => {
        const page = pagesById.get(pageId);

        return page === undefined
          ? []
          : [
              {
                page_id: page.page_id,
                page_version_id: page.page_version_id,
                source_refs: page.source_refs.map((source) => ({ ...source })),
                title: page.title,
                type: page.type,
                visibility_origin: page.visibility_origin ?? "canonical",
              },
            ];
      }),
      edges: graphExpansions.map((item) => ({
        edge_id: item.edge_id,
        from_page_id: item.from_page_id,
        source_document_ids: [...item.source_document_ids],
        to_page_id: item.to_page_id,
        relation_type: item.relation_type,
        visibility_origin: item.edge_visibility_origin ?? "canonical",
      })),
      context_pack_delta: annotatedContextPackDelta,
      answerability,
      next_expansion: {
        seed_page_ids: expandedPageIds,
        relation_types: [...new Set(graphExpansions.map((item) => item.relation_type))],
        depth: 1,
        exclude_page_ids: [...new Set([...excludePageIds, ...seedPageIds, ...expandedPageIds])],
      },
    };
  }

  private collectExpansionEdges(
    knowledgeBaseId: string,
    seedPageIds: readonly string[],
    seedEdgeIds: readonly string[],
  ): RetrievalEdgeRecord[] {
    const edgesById = new Map<string, RetrievalEdgeRecord>();
    const visibleEdges = this.repository.listEdges(knowledgeBaseId);
    const visibleEdgesById = new Map(visibleEdges.map((edge) => [edge.edge_id, edge] as const));

    for (const pageId of seedPageIds) {
      for (const edge of visibleEdges) {
        if (edge.from_page_id === pageId) {
          edgesById.set(edge.edge_id, edge);
        }
      }
    }

    for (const edgeId of seedEdgeIds) {
      const edge = visibleEdgesById.get(edgeId);

      if (edge !== undefined) {
        edgesById.set(edge.edge_id, edge);
      }
    }

    return [...edgesById.values()].sort((left, right) => right.weight - left.weight);
  }
}

export interface GraphQueryInput {
  knowledge_base_id: string;
  page_id?: string;
  depth?: number;
  edge_reason?: RetrievalRelationType;
  page_type?: string;
}

export interface GraphQueryResponse {
  knowledge_base_id: string;
  version_id: string | null;
  nodes: readonly ExpandableGraphNode[];
  edges: ReadonlyArray<
    ExpandableGraphEdge & {
      algorithm: GraphAlgorithmMetadata;
      explanation: string;
      signal_contributions: readonly GraphSignalContribution[];
      weight: number;
    }
  >;
}

export interface GraphAlgorithmMetadata {
  community_algorithm?: {
    name: string;
    resolution?: number;
    version: string;
    weighted: boolean;
  };
  name: string;
  version: string;
  weights?: Record<string, number>;
}

export interface GraphSignalContribution {
  evidence_refs?: readonly Record<string, unknown>[];
  reason_codes: readonly string[];
  score: number;
  type: RetrievalRelationType;
  weight: number;
}

export interface GraphInsightReference {
  insight_id: string;
  insight_type: GraphInsightItem["insight_type"];
  reason_codes: readonly string[];
  score?: number;
}

export interface GraphCommunityMetadata {
  algorithm?: GraphAlgorithmMetadata["community_algorithm"];
  cohesion: number;
  confidence?: number;
  id: string;
  member_count: number;
  representative_page_ids: readonly string[];
  representative_titles?: readonly string[];
}

export interface GraphInsightSnapshotMetadata {
  algorithm: GraphAlgorithmMetadata;
  edge_count: number;
  graph_hash: string;
  node_count: number;
}

export interface GraphInsightItem {
  community?: GraphCommunityMetadata;
  evidence_refs?: readonly Record<string, unknown>[];
  id?: string;
  metadata?: Record<string, unknown>;
  page_id?: string;
  page_ids?: readonly string[];
  reason?: string;
  reason_codes?: readonly string[];
  reasons?: readonly GraphInsightReason[];
  score?: number;
  severity?: "low" | "medium" | "high";
  signal_contributions?: readonly GraphSignalContribution[];
  title?: string;
  insight_type:
    | "isolated_page"
    | "sparse_page"
    | "bridge_page"
    | "knowledge_gap"
    | "community"
    | "surprising_connection";
}

export interface GraphInsightReason {
  edge_id: string;
  explanation: string;
  relation_type: RetrievalRelationType;
}

export type GraphInsightStatusState =
  | "queued"
  | "updating"
  | "ready"
  | "failed"
  | "partial"
  | "stale";

export interface GraphInsightStatus {
  failure_reason: string | null;
  source_job_id: string | null;
  started_at: string | null;
  state: GraphInsightStatusState;
  updated_at: string | null;
}

export interface GraphInsightsResponse {
  knowledge_base_id: string;
  status: GraphInsightStatus;
  snapshot: GraphInsightSnapshotMetadata;
  empty_reasons: Record<string, string>;
  isolated_pages: readonly GraphInsightItem[];
  sparse_pages?: readonly GraphInsightItem[];
  bridge_pages: readonly GraphInsightItem[];
  knowledge_gaps: readonly GraphInsightItem[];
  communities: readonly GraphInsightItem[];
  surprising_connections: readonly GraphInsightItem[];
}

export class GraphQueryService {
  constructor(private readonly repository: RetrievalRepository) {}

  query(input: GraphQueryInput): GraphQueryResponse {
    const pageType = input.page_type;
    const pages = this.repository.listPages(input.knowledge_base_id);
    const pageById = new Map(pages.map((page) => [page.page_id, page]));
    const edges = this.repository
      .listEdges(input.knowledge_base_id)
      .filter((edge) => input.edge_reason === undefined || edge.relation_type === input.edge_reason)
      .filter(
        (edge) =>
          input.page_id === undefined ||
          edge.from_page_id === input.page_id ||
          edge.to_page_id === input.page_id,
      );
    const nodeIds = new Set<string>();

    if (input.page_id === undefined) {
      for (const page of pages) {
        if (pageType === undefined || page.type === pageType) {
          nodeIds.add(page.page_id);
        }
      }
    }

    for (const edge of edges) {
      nodeIds.add(edge.from_page_id);
      nodeIds.add(edge.to_page_id);
    }

    if (input.page_id !== undefined) {
      nodeIds.add(input.page_id);
    }

    const nodes = [...nodeIds].flatMap((pageId) => {
      const page = pageById.get(pageId);

      if (page === undefined || (pageType !== undefined && page.type !== pageType)) {
        return [];
      }

      return [
        {
          page_id: page.page_id,
          page_version_id: page.page_version_id,
          source_refs: page.source_refs.map((source) => ({ ...source })),
          title: page.title,
          type: page.type,
          visibility_origin: page.visibility_origin ?? "canonical",
        },
      ];
    });
    const visibleNodeIds = new Set(nodes.map((node) => node.page_id));

    const graphAlgorithm = createGraphRelevanceAlgorithmMetadata();
    const signalContext = createGraphSignalContributionContext(pages, edges);

    return {
      knowledge_base_id: input.knowledge_base_id,
      version_id: null,
      nodes,
      edges: edges
        .filter(
          (edge) => visibleNodeIds.has(edge.from_page_id) && visibleNodeIds.has(edge.to_page_id),
        )
        .map((edge) => ({
          edge_id: edge.edge_id,
          from_page_id: edge.from_page_id,
          source_document_ids: [...edge.source_document_ids],
          to_page_id: edge.to_page_id,
          relation_type: edge.relation_type,
          visibility_origin: edge.visibility_origin ?? "canonical",
          algorithm: graphAlgorithm,
          explanation: edge.explanation,
          signal_contributions: calculateGraphSignalContributions(edge, signalContext),
          weight: edge.weight,
        })),
    };
  }

  insights(knowledgeBaseId: string): GraphInsightsResponse {
    const pages = this.repository.listPages(knowledgeBaseId);
    const pageIds = new Set(pages.map((page) => page.page_id));
    const pageById = new Map(pages.map((page) => [page.page_id, page]));
    const edges = this.repository
      .listEdges(knowledgeBaseId)
      .filter((edge) => pageIds.has(edge.from_page_id) && pageIds.has(edge.to_page_id));
    const signalContext = createGraphSignalContributionContext(pages, edges);
    const degreeByPageId = new Map<string, number>();
    const edgesByPageId = new Map<string, RetrievalEdgeRecord[]>();

    for (const edge of edges) {
      degreeByPageId.set(edge.from_page_id, (degreeByPageId.get(edge.from_page_id) ?? 0) + 1);
      degreeByPageId.set(edge.to_page_id, (degreeByPageId.get(edge.to_page_id) ?? 0) + 1);
      edgesByPageId.set(edge.from_page_id, [...(edgesByPageId.get(edge.from_page_id) ?? []), edge]);
      edgesByPageId.set(edge.to_page_id, [...(edgesByPageId.get(edge.to_page_id) ?? []), edge]);
    }

    const communityAnalysis = detectGraphCommunities(pages, edges);
    const isolatedPages = pages
      .filter((page) => isGraphInsightPage(page))
      .filter((page) => (degreeByPageId.get(page.page_id) ?? 0) === 0)
      .map((page) =>
        createGraphInsightItem({
          insight_type: "isolated_page",
          page_id: page.page_id,
          title: page.title,
          reason: "Page has no relationship evidence.",
          reason_codes: ["isolated_page"],
          severity: "medium",
          score: 1,
          evidence_refs: [
            {
              object_type: "wiki_page",
              page_id: page.page_id,
            },
          ],
        }),
      );
    const sparsePages = pages
      .filter((page) => isGraphInsightPage(page))
      .filter((page) => {
        const degree = degreeByPageId.get(page.page_id) ?? 0;

        return degree > 0 && degree < 2;
      })
      .map((page) => ({
        ...createGraphInsightItem({
          insight_type: "sparse_page" as const,
          page_id: page.page_id,
          title: page.title,
          reason_codes: ["sparse_page"],
          severity: "low",
          score: 0.5,
        }),
        reason: "Page has fewer than two graph relationships.",
      }));
    const bridgePages = pages
      .filter((page) => isGraphInsightPage(page))
      .filter((page) => isBridgePage(page, communityAnalysis.assignments, edgesByPageId))
      .map((page) => ({
        ...createGraphInsightItem({
          insight_type: "bridge_page",
          page_id: page.page_id,
          title: page.title,
          reason_codes: ["bridge_page"],
          severity: "low",
          score: countNeighborCommunities(
            page.page_id,
            communityAnalysis.assignments,
            edgesByPageId,
          ),
        }),
        reasons: (edgesByPageId.get(page.page_id) ?? [])
          .sort((left, right) => right.weight - left.weight)
          .slice(0, 1)
          .map(toGraphInsightReason),
      }));
    const sparseCommunityGaps = communityAnalysis.communities
      .filter((community) => community.cohesion < 0.15 && community.memberIds.length >= 3)
      .map((community) =>
        createGraphInsightItem({
          community: toGraphCommunityMetadata(community),
          insight_type: "knowledge_gap",
          page_ids: community.memberIds,
          reason: "Community has weak internal graph cohesion.",
          reason_codes: ["sparse_community"],
          severity: "low",
          score: Number((1 - community.cohesion).toFixed(4)),
          title: `Sparse community: ${community.topPageTitles[0] ?? community.id}`,
        }),
      );
    const bridgeGaps = bridgePages.map((item) => ({
      ...item,
      id: createStableGraphInsightId("knowledge_gap", item.page_id ?? "", "bridge"),
      insight_type: "knowledge_gap" as const,
      reason: "Page connects multiple graph communities.",
      reason_codes: ["bridge_page"],
    }));
    const knowledgeGaps = [
      ...isolatedPages.map((item) => ({
        ...item,
        id: createStableGraphInsightId("knowledge_gap", item.page_id ?? "", "isolated"),
        insight_type: "knowledge_gap" as const,
        reason: "Page has no relationship evidence.",
        reason_codes: ["isolated_page"],
      })),
      ...sparseCommunityGaps,
      ...bridgeGaps,
    ];
    const communities = communityAnalysis.communities
      .filter((community) => community.memberIds.length >= 2)
      .map((community) =>
        createGraphInsightItem({
          community: toGraphCommunityMetadata(community),
          insight_type: "community",
          page_ids: community.memberIds,
          reason: "Connected pages share graph relationships.",
          reason_codes: ["community"],
          score: community.cohesion,
          title: community.topPageTitles[0] ?? community.id,
        }),
      );
    const surprisingConnections = findSurprisingGraphConnections(
      edges,
      pageById,
      degreeByPageId,
      communityAnalysis.assignments,
      signalContext,
    );
    const snapshot = createGraphInsightSnapshot(pages, edges);
    const cacheKey = `${knowledgeBaseId}:${snapshot.graph_hash}`;
    const cached = graphInsightResponseCache.get(cacheKey);

    if (cached !== undefined) {
      return cloneGraphInsightsResponse(cached);
    }

    const response = {
      knowledge_base_id: knowledgeBaseId,
      status: createReadyGraphInsightStatus(),
      snapshot,
      empty_reasons: createGraphInsightEmptyReasons({
        bridge_pages: bridgePages,
        communities,
        isolated_pages: isolatedPages,
        knowledge_gaps: knowledgeGaps,
        sparse_pages: sparsePages,
        surprising_connections: surprisingConnections,
      }),
      isolated_pages: isolatedPages,
      sparse_pages: sparsePages,
      bridge_pages: bridgePages,
      knowledge_gaps: knowledgeGaps,
      communities,
      surprising_connections: surprisingConnections,
    };
    graphInsightResponseCache.set(cacheKey, cloneGraphInsightsResponse(response));

    return response;
  }
}

export function createZeroEmbeddingProvider(): RetrievalEmbeddingProvider {
  return {
    model: "zero-embedding",
    dimensions: 1,
    async embed(input) {
      return {
        vectors: input.texts.map(() => [0]),
      };
    },
  };
}

export type ContextBudgetCategory =
  | "system_pages"
  | "direct_hits"
  | "graph_expansions"
  | "citations"
  | "media_evidence"
  | "metadata";

export interface ContextBudgetCategoryUsage {
  allocated_tokens: number;
  estimated_tokens: number;
  used_tokens: number;
  omitted_item_count: number;
  truncated: boolean;
}

export interface ContextBudgetOmittedItem {
  category: ContextBudgetCategory;
  resource_type: "page" | "section" | "edge" | "citation" | "media_asset" | "metadata";
  resource_id: string;
  estimated_tokens: number;
  reason:
    | "budget_exceeded"
    | "budget_exhausted"
    | "duplicate_context"
    | "duplicate_source_noise"
    | "graph_neighbor_after_source_evidence"
    | "lower_source_match"
    | "missing_locator_evidence";
}

export interface ContextBudget {
  total_tokens_estimated: number;
  total_budget_tokens: number;
  used_tokens: number;
  categories: Record<ContextBudgetCategory, ContextBudgetCategoryUsage>;
  omitted_items: readonly ContextBudgetOmittedItem[];
  truncated_categories: readonly ContextBudgetCategory[];
  truncated: boolean;
  strategy_version: "llmwiki-aligned-v1";
  response_reserve_tokens: number;
  available_context_tokens: number;
  per_page_cap_tokens: number;
  system_pages_tokens: number;
  matched_pages_tokens: number;
  graph_expansion_tokens: number;
  citations_tokens: number;
  media_evidence_tokens: number;
}

export interface ContextPack {
  format: "markdown";
  content: string;
  entries: readonly ContextPackEntry[];
  included_page_ids: readonly string[];
  included_page_version_ids: readonly string[];
  included_section_ids: readonly string[];
  citations: readonly RetrievalCitation[];
  media_evidence: readonly RetrievalMediaEvidence[];
  budget_tokens: number;
  used_tokens: number;
  context_budget: ContextBudget;
  answerability?: RetrieveAnswerability;
}

export interface ContextPackEntry {
  section_id: string;
  category: ContextBudgetCategory;
  resource_type: ContextBudgetOmittedItem["resource_type"];
  resource_id: string;
  page_id?: string;
  page_version_id?: string;
  visibility_origin?: RetrievalVisibilityOrigin;
}

export interface BuildContextPackInput {
  knowledge_base_id: string;
  results: readonly RetrievalResult[];
  graph_expansions: readonly GraphExpansion[];
  budget_tokens: number;
}

export class ContextPackBuilder {
  constructor(private readonly repository: RetrievalRepository) {}

  build(input: BuildContextPackInput): ContextPack {
    const visiblePages = this.repository.listPages(input.knowledge_base_id);
    const visiblePagesById = new Map(visiblePages.map((page) => [page.page_id, page]));
    const systemPages = visiblePages.filter((page) => page.is_system_page);
    const sortedResults = sortResultsForContext(input.results);
    const rawMatchedPages = sortedResults.flatMap((result) => {
      const page = visiblePagesById.get(result.page_id);

      return page === undefined ? [] : [page];
    });
    const resultByPageId = new Map(sortedResults.map((result) => [result.page_id, result]));
    const matchedPagePruning = pruneDuplicateContextPages(rawMatchedPages, "direct_hits");
    const matchedPages = matchedPagePruning.pages;
    const matchedPageIds = new Set(matchedPages.map((page) => page.page_id));
    const rawGraphPages = input.graph_expansions.flatMap((expansion) => {
      if (matchedPageIds.has(expansion.to_page_id)) {
        return [];
      }

      const page = visiblePagesById.get(expansion.to_page_id);

      return page === undefined ? [] : [page];
    });
    const graphPagePruning = pruneDuplicateContextPages(rawGraphPages, "graph_expansions");
    const graphPages = graphPagePruning.pages;
    const citations = sortCitationsByEvidenceExactness(
      dedupeCitations(sortedResults.flatMap((result) => result.citations)),
    );
    const mediaEvidence = dedupeMediaEvidence(
      sortedResults.flatMap((result) => result.media_evidence),
    );
    const sections = [
      ...systemPages.map((page) => createContextSection(page, "system_pages")),
      ...matchedPages.map((page) =>
        createContextSection(page, "direct_hits", resultByPageId.get(page.page_id)),
      ),
      ...graphPages.map((page) => createContextSection(page, "graph_expansions")),
      ...citations.map((citation, index) => createCitationContextSection(citation, index)),
      ...mediaEvidence.map((item, index) => createMediaEvidenceContextSection(item, index)),
    ];
    const allocations = allocateContextBudget(input.budget_tokens);
    const usage = createContextBudgetUsage(allocations);
    for (const item of [...matchedPagePruning.omittedItems, ...graphPagePruning.omittedItems]) {
      usage[item.category].omitted_item_count += 1;
    }
    const systemPagesTokens = estimateCategoryTokens(sections, "system_pages");
    const matchedPagesTokens = estimateCategoryTokens(sections, "direct_hits");
    const graphExpansionTokens = estimateCategoryTokens(sections, "graph_expansions");
    const citationsTokens = estimateCategoryTokens(sections, "citations");
    const mediaEvidenceTokens = estimateCategoryTokens(sections, "media_evidence");
    const totalTokensEstimated =
      systemPagesTokens +
      matchedPagesTokens +
      graphExpansionTokens +
      citationsTokens +
      mediaEvidenceTokens;
    const includedPageIds: string[] = [];
    const includedPageVersionIds: string[] = [];
    const includedSectionIds: string[] = [];
    const entries: ContextPackEntry[] = [];
    const omittedItems: ContextBudgetOmittedItem[] = [
      ...matchedPagePruning.omittedItems,
      ...graphPagePruning.omittedItems,
    ];
    const contentParts: string[] = [];
    const usedByCategory = new Map<ContextBudgetCategory, number>();

    for (const category of contextBudgetCategoryOrder) {
      const allocatedTokens = allocations[category];
      let usedTokens = 0;

      for (const section of sections.filter((item) => item.category === category)) {
        usage[category].estimated_tokens += section.estimatedTokens;

        if (usedTokens >= allocatedTokens) {
          usage[category].omitted_item_count += 1;
          usage[category].truncated = true;
          omittedItems.push(toOmittedContextItem(section));
          continue;
        }

        const remaining = Math.min(
          allocatedTokens - usedTokens,
          section.resourceType === "page"
            ? calculatePerPageCapTokens(input.budget_tokens)
            : Number.MAX_SAFE_INTEGER,
        );
        const truncatedText = truncateToTokenBudget(section.content, remaining);

        if (truncatedText.length === 0) {
          usage[category].omitted_item_count += 1;
          usage[category].truncated = true;
          omittedItems.push(toOmittedContextItem(section));
          continue;
        }

        contentParts.push(truncatedText);
        const sectionUsedTokens = estimateTokens(truncatedText);
        usedTokens += sectionUsedTokens;
        usage[category].used_tokens += sectionUsedTokens;
        includedSectionIds.push(section.sectionId);
        entries.push(toContextPackEntry(section));

        if (section.page !== undefined) {
          includedPageIds.push(section.page.page_id);
          includedPageVersionIds.push(section.page.page_version_id);
        }

        if (sectionUsedTokens < section.estimatedTokens) {
          usage[category].omitted_item_count += 1;
          usage[category].truncated = true;
          omittedItems.push(toOmittedContextItem(section));
        }
      }

      usedByCategory.set(category, usedTokens);
    }

    const usedTokens = [...usedByCategory.values()].reduce((total, value) => total + value, 0);
    const truncatedCategories = contextBudgetCategoryOrder.filter(
      (category) => usage[category].truncated,
    );

    return {
      format: "markdown",
      content: contentParts.join("\n\n"),
      entries,
      included_page_ids: [...new Set(includedPageIds)],
      included_page_version_ids: [...new Set(includedPageVersionIds)],
      included_section_ids: [...new Set(includedSectionIds)],
      citations,
      media_evidence: mediaEvidence,
      budget_tokens: input.budget_tokens,
      used_tokens: usedTokens,
      context_budget: {
        total_tokens_estimated: totalTokensEstimated,
        total_budget_tokens: input.budget_tokens,
        used_tokens: usedTokens,
        categories: usage,
        omitted_items: omittedItems,
        truncated_categories: truncatedCategories,
        strategy_version: "llmwiki-aligned-v1",
        response_reserve_tokens: calculateResponseReserveTokens(input.budget_tokens),
        available_context_tokens: calculateAvailableContextTokens(input.budget_tokens),
        per_page_cap_tokens: calculatePerPageCapTokens(input.budget_tokens),
        system_pages_tokens: systemPagesTokens,
        matched_pages_tokens: matchedPagesTokens,
        graph_expansion_tokens: graphExpansionTokens,
        citations_tokens: citationsTokens,
        media_evidence_tokens: mediaEvidenceTokens,
        truncated: truncatedCategories.length > 0 || totalTokensEstimated > usedTokens,
      },
    };
  }
}

export function createInMemoryRetrievalRepository(): RetrievalRepository {
  return new InMemoryRetrievalRepository();
}

interface LexicalCandidate {
  page: RetrievalPageRecord;
  keywordScore: number;
  matchReasons: RetrievalMatchReason[];
}

function isCanonicalScopedRecord(
  record: RetrievalVisibilityMetadata & { knowledge_base_id: string },
  knowledgeBaseId: string,
): boolean {
  return (
    record.knowledge_base_id === knowledgeBaseId &&
    record.owner_knowledge_base_id == null &&
    record.fork_tombstoned_at == null &&
    (record.visibility_origin === undefined || record.visibility_origin === "canonical")
  );
}

function isForkOwnedRecord(record: RetrievalVisibilityMetadata, knowledgeBaseId: string): boolean {
  return record.owner_knowledge_base_id === knowledgeBaseId;
}

function endpointsVisible(edge: RetrievalEdgeRecord, visiblePageIds: ReadonlySet<string>): boolean {
  return visiblePageIds.has(edge.from_page_id) && visiblePageIds.has(edge.to_page_id);
}

function normalizeVisiblePage(
  page: RetrievalPageRecord,
  ownerKnowledgeBaseId: string,
  visibilityOrigin: RetrievalVisibilityOrigin,
  upstreamResourceId: string | null = page.upstream_resource_id ?? null,
): RetrievalPageRecord {
  return {
    ...page,
    knowledge_base_id: ownerKnowledgeBaseId,
    visibility_origin: visibilityOrigin,
    owner_knowledge_base_id: visibilityOrigin === "canonical" ? null : ownerKnowledgeBaseId,
    upstream_resource_id: upstreamResourceId,
    fork_tombstoned_at: null,
    source_refs: page.source_refs.map((source) => ({
      ...source,
      visibility_origin: source.visibility_origin ?? visibilityOrigin,
    })),
  };
}

function normalizeVisibleEdge(
  edge: RetrievalEdgeRecord,
  ownerKnowledgeBaseId: string,
  visibilityOrigin: RetrievalVisibilityOrigin,
  upstreamResourceId: string | null = edge.upstream_resource_id ?? null,
): RetrievalEdgeRecord {
  return {
    ...edge,
    knowledge_base_id: ownerKnowledgeBaseId,
    visibility_origin: visibilityOrigin,
    owner_knowledge_base_id: visibilityOrigin === "canonical" ? null : ownerKnowledgeBaseId,
    upstream_resource_id: upstreamResourceId,
    fork_tombstoned_at: null,
  };
}

function normalizeVisibleEmbedding(
  embedding: RetrievalEmbeddingRecord,
  ownerKnowledgeBaseId: string,
  visibilityOrigin: RetrievalVisibilityOrigin,
  upstreamResourceId: string | null = embedding.upstream_resource_id ?? null,
): RetrievalEmbeddingRecord {
  return {
    ...embedding,
    knowledge_base_id: ownerKnowledgeBaseId,
    visibility_origin: visibilityOrigin,
    owner_knowledge_base_id: visibilityOrigin === "canonical" ? null : ownerKnowledgeBaseId,
    upstream_resource_id: upstreamResourceId,
    fork_tombstoned_at: null,
  };
}

class InMemoryRetrievalRepository implements RetrievalRepository {
  private readonly scopes = new Map<string, RetrievalKnowledgeBaseScopeRecord>();
  private readonly pages = new Map<string, RetrievalPageRecord>();
  private readonly edges = new Map<string, RetrievalEdgeRecord>();
  private readonly edgeIdsByPageId = new Map<string, Set<string>>();
  private readonly embeddings = new Map<string, RetrievalEmbeddingRecord>();
  private readonly traces = new Map<string, RetrievalTraceRecord>();

  upsertKnowledgeBaseScope(scope: RetrievalKnowledgeBaseScopeRecord): void {
    this.scopes.set(scope.knowledge_base_id, { ...scope });
  }

  findKnowledgeBaseScope(knowledgeBaseId: string): RetrievalKnowledgeBaseScopeRecord | undefined {
    const scope = this.scopes.get(knowledgeBaseId);

    return scope === undefined ? undefined : { ...scope };
  }

  upsertPage(page: RetrievalPageRecord): void {
    this.pages.set(page.page_id, clonePage(page));
  }

  listPages(knowledgeBaseId: string): RetrievalPageRecord[] {
    return this.composeVisiblePages(knowledgeBaseId).map(clonePage);
  }

  findPageById(pageId: string): RetrievalPageRecord | undefined {
    const page = this.pages.get(pageId);

    return page === undefined ? undefined : clonePage(page);
  }

  upsertEdge(edge: RetrievalEdgeRecord): void {
    this.edges.set(edge.edge_id, cloneEdge(edge));
    this.indexEdge(edge.from_page_id, edge.edge_id);
    this.indexEdge(edge.to_page_id, edge.edge_id);
  }

  findEdgeById(edgeId: string): RetrievalEdgeRecord | undefined {
    const edge = this.edges.get(edgeId);

    return edge === undefined ? undefined : cloneEdge(edge);
  }

  listEdgesForPage(pageId: string): RetrievalEdgeRecord[] {
    return [...(this.edgeIdsByPageId.get(pageId) ?? [])]
      .map((edgeId) => this.edges.get(edgeId))
      .filter((edge): edge is RetrievalEdgeRecord => edge !== undefined)
      .map(cloneEdge);
  }

  listEdges(knowledgeBaseId: string): RetrievalEdgeRecord[] {
    return this.composeVisibleEdges(knowledgeBaseId).map(cloneEdge);
  }

  saveEmbedding(record: RetrievalEmbeddingRecord): void {
    this.embeddings.set(record.id, cloneEmbedding(record));
  }

  listEmbeddings(knowledgeBaseId: string): RetrievalEmbeddingRecord[] {
    return this.composeVisibleEmbeddings(knowledgeBaseId).map(cloneEmbedding);
  }

  saveTrace(record: RetrievalTraceRecord): void {
    this.traces.set(record.id, cloneTrace(record));
  }

  listTraces(knowledgeBaseId: string): RetrievalTraceRecord[] {
    return [...this.traces.values()]
      .filter((record) => record.knowledge_base_id === knowledgeBaseId)
      .map(cloneTrace);
  }

  private indexEdge(pageId: string, edgeId: string): void {
    const edgeIds = this.edgeIdsByPageId.get(pageId) ?? new Set<string>();

    edgeIds.add(edgeId);
    this.edgeIdsByPageId.set(pageId, edgeIds);
  }

  private composeVisiblePages(knowledgeBaseId: string): RetrievalPageRecord[] {
    const scope = this.resolveScope(knowledgeBaseId);

    if (scope.knowledge_base_type !== "fork" || scope.upstream_knowledge_base_id === null) {
      return [...this.pages.values()]
        .filter((page) => isCanonicalScopedRecord(page, knowledgeBaseId))
        .map((page) => normalizeVisiblePage(page, knowledgeBaseId, "canonical"));
    }

    const tombstonedUpstreamPageIds = this.collectTombstonedUpstreamIds(
      knowledgeBaseId,
      this.pages.values(),
    );
    const visibleByKey = new Map<string, RetrievalPageRecord>();

    for (const page of this.pages.values()) {
      if (
        isCanonicalScopedRecord(page, scope.upstream_knowledge_base_id) &&
        !tombstonedUpstreamPageIds.has(page.page_id)
      ) {
        visibleByKey.set(
          page.page_id,
          normalizeVisiblePage(page, knowledgeBaseId, "upstream_inherited", page.page_id),
        );
      }
    }

    for (const page of this.pages.values()) {
      if (isForkOwnedRecord(page, knowledgeBaseId) && page.fork_tombstoned_at == null) {
        visibleByKey.set(
          page.upstream_resource_id ?? page.page_id,
          normalizeVisiblePage(page, knowledgeBaseId, "fork_owned"),
        );
      }
    }

    return [...visibleByKey.values()];
  }

  private composeVisibleEdges(knowledgeBaseId: string): RetrievalEdgeRecord[] {
    const scope = this.resolveScope(knowledgeBaseId);
    const visiblePageIds = new Set(
      this.composeVisiblePages(knowledgeBaseId).map((page) => page.page_id),
    );

    if (scope.knowledge_base_type !== "fork" || scope.upstream_knowledge_base_id === null) {
      return [...this.edges.values()]
        .filter((edge) => isCanonicalScopedRecord(edge, knowledgeBaseId))
        .filter((edge) => endpointsVisible(edge, visiblePageIds))
        .map((edge) => normalizeVisibleEdge(edge, knowledgeBaseId, "canonical"));
    }

    const tombstonedUpstreamEdgeIds = this.collectTombstonedUpstreamIds(
      knowledgeBaseId,
      this.edges.values(),
    );
    const visibleByKey = new Map<string, RetrievalEdgeRecord>();

    for (const edge of this.edges.values()) {
      if (
        isCanonicalScopedRecord(edge, scope.upstream_knowledge_base_id) &&
        !tombstonedUpstreamEdgeIds.has(edge.edge_id) &&
        endpointsVisible(edge, visiblePageIds)
      ) {
        visibleByKey.set(
          edge.edge_id,
          normalizeVisibleEdge(edge, knowledgeBaseId, "upstream_inherited", edge.edge_id),
        );
      }
    }

    for (const edge of this.edges.values()) {
      if (
        isForkOwnedRecord(edge, knowledgeBaseId) &&
        edge.fork_tombstoned_at == null &&
        endpointsVisible(edge, visiblePageIds)
      ) {
        visibleByKey.set(
          edge.upstream_resource_id ?? edge.edge_id,
          normalizeVisibleEdge(edge, knowledgeBaseId, "fork_owned"),
        );
      }
    }

    return [...visibleByKey.values()];
  }

  private composeVisibleEmbeddings(knowledgeBaseId: string): RetrievalEmbeddingRecord[] {
    const scope = this.resolveScope(knowledgeBaseId);
    const visiblePagesById = new Map(
      this.composeVisiblePages(knowledgeBaseId).map((page) => [page.page_id, page]),
    );

    if (scope.knowledge_base_type !== "fork" || scope.upstream_knowledge_base_id === null) {
      return [...this.embeddings.values()]
        .filter((embedding) => isCanonicalScopedRecord(embedding, knowledgeBaseId))
        .filter((embedding) => visiblePagesById.has(embedding.page_id))
        .map((embedding) => normalizeVisibleEmbedding(embedding, knowledgeBaseId, "canonical"));
    }

    const tombstonedUpstreamEmbeddingIds = this.collectTombstonedUpstreamIds(
      knowledgeBaseId,
      this.embeddings.values(),
    );
    const visibleByKey = new Map<string, RetrievalEmbeddingRecord>();

    for (const embedding of this.embeddings.values()) {
      const page = visiblePagesById.get(embedding.page_id);

      if (
        page !== undefined &&
        isCanonicalScopedRecord(embedding, scope.upstream_knowledge_base_id) &&
        !tombstonedUpstreamEmbeddingIds.has(embedding.id)
      ) {
        visibleByKey.set(
          embedding.id,
          normalizeVisibleEmbedding(
            embedding,
            knowledgeBaseId,
            page.visibility_origin ?? "upstream_inherited",
            embedding.id,
          ),
        );
      }
    }

    for (const embedding of this.embeddings.values()) {
      const page = visiblePagesById.get(embedding.page_id);

      if (
        page !== undefined &&
        isForkOwnedRecord(embedding, knowledgeBaseId) &&
        embedding.fork_tombstoned_at == null
      ) {
        visibleByKey.set(
          embedding.upstream_resource_id ?? embedding.id,
          normalizeVisibleEmbedding(
            embedding,
            knowledgeBaseId,
            page.visibility_origin ?? "fork_owned",
          ),
        );
      }
    }

    return [...visibleByKey.values()];
  }

  private collectTombstonedUpstreamIds(
    knowledgeBaseId: string,
    records: Iterable<RetrievalVisibilityMetadata>,
  ): Set<string> {
    return new Set(
      [...records]
        .filter((record) => isForkOwnedRecord(record, knowledgeBaseId))
        .filter((record) => record.fork_tombstoned_at != null)
        .flatMap((record) =>
          record.upstream_resource_id === undefined || record.upstream_resource_id === null
            ? []
            : [record.upstream_resource_id],
        ),
    );
  }

  private resolveScope(knowledgeBaseId: string): RetrievalKnowledgeBaseScopeRecord {
    return (
      this.scopes.get(knowledgeBaseId) ?? {
        knowledge_base_id: knowledgeBaseId,
        knowledge_base_type: "canonical",
        upstream_knowledge_base_id: null,
        upstream_synced_version_id: null,
      }
    );
  }
}

function scoreLexicalPage(page: RetrievalPageRecord, query: LexicalQuery): LexicalCandidate {
  const terms = query.tokens;
  const matchReasons: RetrievalMatchReason[] = [];
  let keywordScore = 0;
  const sourceNameText = page.source_refs.map((source) => source.name ?? "").join(" ");
  const sourceLocatorText = page.source_refs.map((source) => source.locator ?? "").join(" ");
  const sourceVirtualPathText = [
    ...page.source_refs.map((source) => source.virtual_path ?? ""),
    ...readMetadataStrings(page.metadata, [
      "source_virtual_path",
      "virtual_path",
      "source_path",
      "path",
      "file_path",
    ]),
  ].join(" ");
  const sourceSummaryText = [
    ...page.source_refs.map((source) => source.summary ?? ""),
    ...readMetadataStrings(page.metadata, ["source_summary", "summary"]),
  ].join(" ");
  const pageSlugText = readMetadataStrings(page.metadata, ["page_slug", "slug"]).join(" ");
  const sectionHeadingText = extractMarkdownHeadings(page.markdown).join(" ");
  keywordScore += scoreExactSourceEquivalent(
    sourceVirtualPathText,
    query.phrase,
    "source_virtual_path",
    matchReasons,
  );
  keywordScore += scoreExactSourceEquivalent(
    sourceNameText,
    query.phrase,
    "source_name",
    matchReasons,
  );
  keywordScore += scoreExactSourceEquivalent(pageSlugText, query.phrase, "page_slug", matchReasons);
  keywordScore += scorePhraseField(
    sourceLocatorText,
    query.phrase,
    "source_locator",
    SECTION_HEADING_PHRASE_BONUS,
    MAX_PHRASE_OCC_COUNTED,
    matchReasons,
  );
  keywordScore += scorePhraseField(
    page.title,
    query.phrase,
    "title_phrase",
    PHRASE_IN_TITLE_BONUS,
    1,
    matchReasons,
  );
  keywordScore += scorePhraseField(
    page.markdown,
    query.phrase,
    "markdown_phrase",
    PHRASE_IN_CONTENT_PER_OCC,
    MAX_PHRASE_OCC_COUNTED,
    matchReasons,
  );
  keywordScore += scorePhraseField(
    sectionHeadingText,
    query.phrase,
    "page_section",
    SECTION_HEADING_PHRASE_BONUS,
    MAX_PHRASE_OCC_COUNTED,
    matchReasons,
  );
  keywordScore += scoreMetadataIdentityTerms(page, query.identityTerms, matchReasons);

  for (const term of terms) {
    keywordScore += scoreField(page.title, term, "title", TITLE_TOKEN_WEIGHT, matchReasons);
    keywordScore += scoreField(page.markdown, term, "markdown", CONTENT_TOKEN_WEIGHT, matchReasons);
    keywordScore += scoreField(
      sectionHeadingText,
      term,
      "page_section",
      SECTION_HEADING_TOKEN_WEIGHT,
      matchReasons,
    );
    keywordScore += scoreField(
      sourceNameText,
      term,
      "source_name",
      TITLE_TOKEN_WEIGHT,
      matchReasons,
    );
    keywordScore += scoreField(
      sourceVirtualPathText,
      term,
      "source_virtual_path",
      TITLE_TOKEN_WEIGHT,
      matchReasons,
    );
    keywordScore += scoreField(
      sourceLocatorText,
      term,
      "source_locator",
      SECTION_HEADING_TOKEN_WEIGHT,
      matchReasons,
    );
    keywordScore += scoreField(
      sourceSummaryText,
      term,
      "source_summary",
      CONTENT_TOKEN_WEIGHT,
      matchReasons,
    );
    keywordScore += scoreField(pageSlugText, term, "page_slug", TITLE_TOKEN_WEIGHT, matchReasons);
    keywordScore += scoreField(
      createMetadataSearchValues(page).join(" "),
      term,
      "metadata",
      1,
      matchReasons,
    );
  }

  if (keywordScore > 0 && pageSlugText.trim().length > 0) {
    matchReasons.push({
      field: "page_slug",
      term: normalizeFileStem(pageSlugText),
    });
  }

  return {
    page,
    keywordScore,
    matchReasons: dedupeMatchReasons(matchReasons),
  };
}

function summarizeMetadataMatches(results: readonly RetrievalResult[]): {
  display_metadata_keys: readonly string[];
  result_count: number;
  match_reason_count: number;
  fields: readonly string[];
  top_results: readonly RetrievalCandidateTraceSummary[];
} {
  const metadataFields = new Set<RetrievalMatchReason["field"]>([
    "source_name",
    "source_virtual_path",
    "source_summary",
    "page_slug",
    "metadata",
  ]);
  const reasons = results.flatMap((result) =>
    result.match_reasons.filter((reason) => metadataFields.has(reason.field)),
  );

  return {
    display_metadata_keys: [
      ...new Set(results.flatMap((result) => Object.keys(result.display_metadata ?? {}))),
    ].sort(),
    result_count: new Set(
      results
        .filter((result) => result.match_reasons.some((reason) => metadataFields.has(reason.field)))
        .map((result) => result.page_id),
    ).size,
    match_reason_count: reasons.length,
    fields: [...new Set(reasons.map((reason) => reason.field))].sort(),
    top_results: createCandidateTraceSummaries(results.slice(0, 5)),
  };
}

function calculateMetadataContribution(matchReasons: readonly RetrievalMatchReason[]): number {
  const metadataFields = new Set<RetrievalMatchReason["field"]>([
    "source_name",
    "source_virtual_path",
    "source_summary",
    "page_slug",
    "metadata",
  ]);

  return matchReasons.filter((reason) => metadataFields.has(reason.field)).length;
}

function calculateVersionContribution(matchReasons: readonly RetrievalMatchReason[]): number {
  const versionLikeReasons = matchReasons.filter(
    (reason) =>
      reason.field === "metadata" &&
      /(?:\bversion\b|\bv\d+\b|\d{4}(?:-\d{2}){0,2}|status|published|effective|updated|revised)/u.test(
        reason.term,
      ),
  );

  return Math.min(versionLikeReasons.length, 3);
}

const METADATA_IDENTITY_TOKEN_BONUS = 80;
const FILENAME_EXACT_BONUS = 200;
const PHRASE_IN_TITLE_BONUS = 220;
const PHRASE_IN_CONTENT_PER_OCC = 20;
const SECTION_HEADING_PHRASE_BONUS = 35;
const MAX_PHRASE_OCC_COUNTED = 10;
const TITLE_TOKEN_WEIGHT = 5;
const CONTENT_TOKEN_WEIGHT = 1;
const SECTION_HEADING_TOKEN_WEIGHT = 4;

function scoreField(
  value: string,
  term: string,
  field: RetrievalMatchReason["field"],
  weight: number,
  matchReasons: RetrievalMatchReason[],
): number {
  if (!normalized(value).includes(term)) {
    return 0;
  }

  matchReasons.push({
    field,
    term,
  });

  return weight;
}

function scorePhraseField(
  value: string,
  phrase: string,
  field: RetrievalMatchReason["field"],
  weight: number,
  maxOccurrences: number,
  matchReasons: RetrievalMatchReason[],
): number {
  if (phrase.length === 0) {
    return 0;
  }

  const occurrences = Math.min(countOccurrences(normalized(value), phrase), maxOccurrences);

  if (occurrences === 0) {
    return 0;
  }

  matchReasons.push({
    field,
    term: phrase,
  });

  return occurrences * weight;
}

function scoreExactSourceEquivalent(
  value: string,
  phrase: string,
  field: RetrievalMatchReason["field"],
  matchReasons: RetrievalMatchReason[],
): number {
  if (phrase.length === 0) {
    return 0;
  }

  const candidates = value
    .split(/\s+/u)
    .map((item) => normalizeFileStem(item))
    .filter(Boolean);

  if (!candidates.includes(phrase)) {
    return 0;
  }

  matchReasons.push({
    field,
    term: phrase,
  });

  return FILENAME_EXACT_BONUS;
}

function scoreMetadataIdentityTerms(
  page: RetrievalPageRecord,
  identityTerms: readonly string[],
  matchReasons: RetrievalMatchReason[],
): number {
  if (identityTerms.length === 0) {
    return 0;
  }

  const searchableValues = createMetadataSearchValues(page);
  let score = 0;

  for (const term of identityTerms) {
    if (searchableValues.some((value) => value.includes(term))) {
      matchReasons.push({
        field: "metadata",
        term,
      });
      score += METADATA_IDENTITY_TOKEN_BONUS;
    }
  }

  return score;
}

function createMetadataSearchValues(page: RetrievalPageRecord): string[] {
  const values = [
    page.page_id,
    page.page_version_id,
    page.title,
    page.type,
    ...page.source_refs.flatMap((source) => [
      source.document_id,
      source.source_anchor_id ?? "",
      source.parsed_content_id ?? "",
      source.name ?? "",
      source.locator ?? "",
      source.summary ?? "",
      source.virtual_path ?? "",
      source.media_asset_id ?? "",
      source.evidence_kind ?? "",
    ]),
    ...readSafeMetadataSearchStringValue(page.metadata),
    ...readSafeMetadataSearchStringValue(page.frontmatter ?? {}),
  ];

  return values.map(normalizeMetadataIdentityValue).filter(Boolean);
}

function normalizeMetadataIdentityValue(value: string): string {
  return normalized(value.trim()).replace(trimPunctuationPattern, "");
}

const DISPLAY_METADATA_MAX_ENTRIES = 16;
const DISPLAY_METADATA_MAX_STRING_LENGTH = 240;
const DISPLAY_METADATA_MAX_ARRAY_VALUES = 8;
const sensitiveMetadataKeyPattern =
  /(?:api[_-]?key|secret|token|password|credential|bearer|authorization|signed[_-]?url|signature|object[_-]?key|storage[_-]?key|internal|session|cookie|private[_-]?key|access[_-]?key|tenant[_-]?private)/iu;
const sensitiveMetadataValuePattern =
  /(?:bearer\s+|sk-[a-z0-9]|signature=|x-amz-signature|token=|api[_-]?key=|password=|secret=)/iu;

function createDisplayMetadata(page: RetrievalPageRecord): RetrievalDisplayMetadata | undefined {
  const metadata: RetrievalDisplayMetadata = {};
  const sourceDocumentIds = uniqueStrings(page.source_refs.map((source) => source.document_id));
  const sourceNames = uniqueStrings(
    page.source_refs
      .map((source) => source.name)
      .filter((value): value is string => value !== undefined)
      .map(readSafeDisplayString)
      .filter((value): value is string => value !== undefined),
  );
  const sourcePaths = uniqueStrings(
    page.source_refs
      .map((source) => source.virtual_path)
      .filter((value): value is string => value !== undefined)
      .map(readSafeDisplayString)
      .filter((value): value is string => value !== undefined),
  );
  const sourceAnchorIds = uniqueStrings(
    page.source_refs
      .map((source) => source.source_anchor_id)
      .filter((value): value is string => value !== undefined)
      .map(readSafeDisplayString)
      .filter((value): value is string => value !== undefined),
  );
  const parsedContentIds = uniqueStrings(
    page.source_refs
      .map((source) => source.parsed_content_id)
      .filter((value): value is string => value !== undefined)
      .map(readSafeDisplayString)
      .filter((value): value is string => value !== undefined),
  );

  if (sourceDocumentIds.length > 0) {
    metadata.source_document_ids = sourceDocumentIds.slice(0, DISPLAY_METADATA_MAX_ARRAY_VALUES);
  }
  if (sourceNames.length > 0) {
    metadata.source_names = sourceNames.slice(0, DISPLAY_METADATA_MAX_ARRAY_VALUES);
  }
  if (sourcePaths.length > 0) {
    metadata.source_paths = sourcePaths.slice(0, DISPLAY_METADATA_MAX_ARRAY_VALUES);
  }
  if (sourceAnchorIds.length > 0) {
    metadata.source_anchor_ids = sourceAnchorIds.slice(0, DISPLAY_METADATA_MAX_ARRAY_VALUES);
  }
  if (parsedContentIds.length > 0) {
    metadata.parsed_content_ids = parsedContentIds.slice(0, DISPLAY_METADATA_MAX_ARRAY_VALUES);
  }

  appendDisplayMetadataValues(metadata, page.frontmatter ?? {});
  appendDisplayMetadataValues(metadata, page.metadata);

  return Object.keys(metadata).length === 0 ? undefined : metadata;
}

function appendDisplayMetadataValues(
  target: RetrievalDisplayMetadata,
  value: unknown,
  keyPath: readonly string[] = [],
): void {
  if (Object.keys(target).length >= DISPLAY_METADATA_MAX_ENTRIES) {
    return;
  }

  if (keyPath.some((key) => !isSafeDisplayMetadataKey(key))) {
    return;
  }

  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    const key = keyPath.at(-1);

    if (key === undefined || target[key] !== undefined || !isSafeDisplayMetadataKey(key)) {
      return;
    }

    const displayValue = readDisplayMetadataValue(value);

    if (displayValue !== undefined) {
      target[key] = displayValue;
    }

    return;
  }

  for (const [key, item] of Object.entries(value)) {
    appendDisplayMetadataValues(target, item, [...keyPath, key]);
  }
}

function readDisplayMetadataValue(value: unknown): RetrievalDisplayMetadataValue | undefined {
  if (typeof value === "string") {
    return readSafeDisplayString(value);
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }

  if (typeof value === "boolean") {
    return value;
  }

  if (Array.isArray(value)) {
    const values = uniqueStrings(
      value
        .flatMap((item) =>
          typeof item === "string" || typeof item === "number" || typeof item === "boolean"
            ? [String(item)]
            : [],
        )
        .map(readSafeDisplayString)
        .filter((item): item is string => item !== undefined),
    ).slice(0, DISPLAY_METADATA_MAX_ARRAY_VALUES);

    return values.length === 0 ? undefined : values;
  }

  return undefined;
}

function readSafeDisplayString(value: string): string | undefined {
  const trimmed = value.trim();

  if (trimmed.length === 0 || sensitiveMetadataValuePattern.test(trimmed)) {
    return undefined;
  }

  return trimmed.slice(0, DISPLAY_METADATA_MAX_STRING_LENGTH);
}

function isSafeDisplayMetadataKey(key: string): boolean {
  return key.length > 0 && !sensitiveMetadataKeyPattern.test(key);
}

function readSafeMetadataSearchStringValue(
  value: unknown,
  keyPath: readonly string[] = [],
): string[] {
  if (keyPath.some((key) => sensitiveMetadataKeyPattern.test(key))) {
    return [];
  }

  if (typeof value === "string") {
    return sensitiveMetadataValuePattern.test(value) ? [] : [value];
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return [String(value)];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => readSafeMetadataSearchStringValue(item, keyPath));
  }

  if (typeof value === "object" && value !== null) {
    return Object.entries(value).flatMap(([key, item]) =>
      readSafeMetadataSearchStringValue(item, [...keyPath, key]),
    );
  }

  return [];
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function toRetrievalResult(
  page: RetrievalPageRecord,
  keywordScore: number,
  matchReasons: readonly RetrievalMatchReason[],
  rank: number,
  query?: LexicalQuery,
): RetrievalResult {
  const displayMetadata = createDisplayMetadata(page);
  const sourceRefs = createResultSourceRefs(page, query);

  return {
    result_id: `lexical:${page.page_id}`,
    page_id: page.page_id,
    page_version_id: page.page_version_id,
    title: page.title,
    type: page.type,
    section: createSection(page, matchReasons),
    score: {
      keyword: Number(keywordScore.toFixed(4)),
      semantic: null,
      graph: null,
      rerank: null,
    },
    retrieval_reason: createLexicalReason(matchReasons),
    lexical_rank: rank,
    semantic_rank: null,
    expanded_from_page_id: null,
    expand_depth: 0,
    graph_signals: [],
    match_reasons: matchReasons,
    citations: sourceRefs.map(toRetrievalCitation),
    media_evidence: createMediaEvidence(sourceRefs),
    source_document_ids: getPageSourceDocumentIds(page),
    ...(displayMetadata === undefined ? {} : { display_metadata: displayMetadata }),
    score_contribution: {
      lexical: Number(keywordScore.toFixed(4)),
      metadata: calculateMetadataContribution(matchReasons),
      graph: 0,
      relation_weight: 0,
      source_evidence: page.source_refs.length,
      version: calculateVersionContribution(matchReasons),
    },
    visibility_origin: page.visibility_origin ?? "canonical",
  };
}

function toSemanticRetrievalResult(
  page: RetrievalPageRecord,
  embedding: RetrievalEmbeddingRecord,
  semanticScore: number,
  rank: number,
): RetrievalResult {
  const displayMetadata = createDisplayMetadata(page);
  const sourceRefs = createResultSourceRefs(page);

  return {
    result_id: `semantic:${embedding.object_id}`,
    page_id: page.page_id,
    page_version_id: page.page_version_id,
    ...(embedding.object_type === "page_section" ? { section_id: embedding.object_id } : {}),
    title: page.title,
    type: page.type,
    section: embedding.text,
    score: {
      keyword: 0,
      semantic: Number(semanticScore.toFixed(4)),
      graph: null,
      rerank: null,
    },
    retrieval_reason: `Matched semantic embedding for ${embedding.object_type}.`,
    lexical_rank: null,
    semantic_rank: rank,
    expanded_from_page_id: null,
    expand_depth: 0,
    graph_signals: [],
    match_reasons: [],
    citations: sourceRefs.map(toRetrievalCitation),
    media_evidence: createMediaEvidence(sourceRefs),
    source_document_ids: getPageSourceDocumentIds(page),
    ...(displayMetadata === undefined ? {} : { display_metadata: displayMetadata }),
    score_contribution: {
      semantic: Number(semanticScore.toFixed(4)),
      graph: 0,
      relation_weight: 0,
      source_evidence: page.source_refs.length,
    },
    visibility_origin: page.visibility_origin ?? "canonical",
  };
}

function createResultSourceRefs(
  page: RetrievalPageRecord,
  query?: LexicalQuery,
): RetrievalSourceRef[] {
  const baseRefs =
    query === undefined ? [...page.source_refs] : sortSourceRefsForQuery(page.source_refs, query);
  const anchorBackedDocumentIds = new Set(
    baseRefs
      .filter(
        (sourceRef) =>
          sourceRef.source_anchor_id !== undefined || sourceRef.parsed_content_id !== undefined,
      )
      .map((sourceRef) => sourceRef.document_id),
  );
  const refs = baseRefs.map((sourceRef) => ({
    ...sourceRef,
    source_anchor_id: sourceRef.source_anchor_id ?? createSourceAnchorId(sourceRef.document_id),
  }));
  const resolvedSourceMarkdownDocumentIds = new Set(
    refs
      .filter(
        (sourceRef) =>
          sourceRef.locator_status === "resolved" &&
          sourceRef.locator !== undefined &&
          /^source_markdown:\d+(?:-\d+)?$/u.test(sourceRef.locator.trim()) &&
          sourceRef.evidence_kind !== "image_caption",
      )
      .map((sourceRef) => sourceRef.document_id),
  );
  const missingRefs = getPageSourceDocumentIds(page)
    .filter(
      (documentId) =>
        !resolvedSourceMarkdownDocumentIds.has(documentId) &&
        (baseRefs.length === 0 || anchorBackedDocumentIds.has(documentId)),
    )
    .map((documentId) => ({
      document_id: documentId,
      source_anchor_id: createSourceAnchorId(documentId),
      locator: "source_markdown:1",
      locator_status: "resolved" as const,
      warning_codes: ["source_ref_inferred_from_page_source_document"],
    }));

  return [...refs, ...missingRefs];
}

function createSourceAnchorId(sourceDocumentId: string): string {
  const normalizedSourceDocumentId = sourceDocumentId
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "_")
    .replace(/^_+|_+$/gu, "");

  return `src_anchor_${normalizedSourceDocumentId || hashStable(sourceDocumentId).slice(0, 16)}`;
}

function sortSourceRefsForQuery(
  sourceRefs: readonly RetrievalSourceRef[],
  query: LexicalQuery,
): RetrievalSourceRef[] {
  const indexed = sourceRefs.map((source, index) => ({
    index,
    source,
    score: scoreSourceRefForQuery(source, query),
  }));

  return indexed
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map((item) => item.source);
}

function scoreSourceRefForQuery(source: RetrievalSourceRef, query: LexicalQuery): number {
  const searchableValues = [
    source.document_id,
    source.source_anchor_id ?? "",
    source.parsed_content_id ?? "",
    source.name ?? "",
    source.locator ?? "",
    source.summary ?? "",
    source.virtual_path ?? "",
    source.media_asset_id ?? "",
    source.evidence_kind ?? "",
  ].map(normalizeMetadataIdentityValue);
  let score = 0;

  for (const term of query.identityTerms) {
    if (searchableValues.some((value) => value.includes(term))) {
      score += 10;
    }
  }

  for (const token of query.tokens) {
    if (searchableValues.some((value) => value.includes(token))) {
      score += 1;
    }
  }

  return score;
}

function toExpandedRetrievalResult(
  page: RetrievalPageRecord,
  expansion: GraphExpansion,
): RetrievalResult {
  const displayMetadata = createDisplayMetadata(page);
  const sourceRefs = createResultSourceRefs(page);

  return {
    result_id: `expand:${expansion.edge_id}:${page.page_id}`,
    page_id: page.page_id,
    page_version_id: page.page_version_id,
    title: page.title,
    type: page.type,
    section: page.markdown.slice(0, 280),
    score: {
      keyword: 0,
      semantic: null,
      graph: expansion.graph_score,
      rerank: null,
    },
    retrieval_reason: expansion.explanation,
    lexical_rank: null,
    semantic_rank: null,
    expanded_from_page_id: expansion.from_page_id,
    expand_depth: expansion.expand_depth,
    graph_signals: [
      {
        type: expansion.relation_type,
        weight: expansion.weight,
        edge_id: expansion.edge_id,
      },
    ],
    match_reasons: [],
    citations: sourceRefs.map(toRetrievalCitation),
    media_evidence: createMediaEvidence(sourceRefs),
    source_document_ids: uniqueStrings([
      ...getPageSourceDocumentIds(page),
      ...expansion.source_document_ids,
    ]),
    ...(displayMetadata === undefined ? {} : { display_metadata: displayMetadata }),
    relation_reason: expansion.explanation,
    score_contribution: {
      graph: expansion.graph_score,
      relation_weight: expansion.weight,
    },
    source_refs: expansion.source_document_ids.map((documentId) => ({
      document_id: documentId,
      edge_id: expansion.edge_id,
      relation_type: expansion.relation_type,
      visibility_origin: expansion.edge_visibility_origin ?? "canonical",
    })),
    traversal: {
      seed_page_id: expansion.from_page_id,
      seed_edge_id: expansion.edge_id,
      depth: expansion.expand_depth,
      path: [expansion.from_page_id, expansion.to_page_id],
    },
    visibility_origin: page.visibility_origin ?? "canonical",
  };
}

interface EmbeddingUnit {
  objectType: RetrievalEmbeddingObjectType;
  objectId: string;
  text: string;
}

function createEmbeddingUnits(page: RetrievalPageRecord): EmbeddingUnit[] {
  if (page.is_system_page) {
    return [
      {
        objectType: "system_page",
        objectId: page.page_id,
        text: `${page.title}\n${page.markdown}`,
      },
    ];
  }

  return [
    {
      objectType: "page",
      objectId: page.page_id,
      text: `${page.title}\n${page.markdown}`,
    },
    ...splitSections(page.markdown).map((section, index) => ({
      objectType: "page_section" as const,
      objectId: `${page.page_id}:section:${index + 1}`,
      text: section,
    })),
  ];
}

function splitSections(markdown: string): string[] {
  const sections = markdown
    .split(/\n(?=#{1,6}\s+)/u)
    .map((section) => section.trim())
    .filter(Boolean);

  return sections.length === 0 ? [markdown] : sections;
}

function cosineSimilarity(left: readonly number[], right: readonly number[]): number {
  const length = Math.min(left.length, right.length);
  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;

  for (let index = 0; index < length; index += 1) {
    const leftValue = left[index] ?? 0;
    const rightValue = right[index] ?? 0;

    dot += leftValue * rightValue;
    leftMagnitude += leftValue * leftValue;
    rightMagnitude += rightValue * rightValue;
  }

  if (leftMagnitude === 0 || rightMagnitude === 0) {
    return 0;
  }

  return dot / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude));
}

function objectTypeWeight(embedding: RetrievalEmbeddingRecord): number {
  if (embedding.object_type === "page_section") {
    return 1.05;
  }

  if (embedding.object_type === "system_page") {
    return 0.95;
  }

  return 1;
}

const relationTypeOrder: readonly RetrievalRelationType[] = [
  "wikilink",
  "shared_source",
  "common_neighbor",
  "type_affinity",
  "generated_relationship",
  "evidence_relationship",
  "manual",
];

function toGraphExpansion(
  edge: RetrievalEdgeRecord,
  targetPage: RetrievalPageRecord,
  depth: number,
  pages: readonly RetrievalPageRecord[],
  edges: readonly RetrievalEdgeRecord[],
  insightRefsByPageId: ReadonlyMap<string, readonly GraphInsightReference[]>,
  signalContext = createGraphSignalContributionContext(pages, edges),
): GraphExpansion {
  return {
    from_page_id: edge.from_page_id,
    to_page_id: edge.to_page_id,
    to_page_version_id: targetPage.page_version_id,
    edge_id: edge.edge_id,
    visibility_origin: targetPage.visibility_origin ?? "canonical",
    edge_visibility_origin: edge.visibility_origin ?? "canonical",
    relation_type: edge.relation_type,
    weight: edge.weight,
    explanation: edge.explanation,
    signal_breakdown: Object.fromEntries(
      relationTypeOrder.map((relationType) => [
        relationType,
        relationType === edge.relation_type ? edge.weight : 0,
      ]),
    ) as Record<RetrievalRelationType, number>,
    source_document_ids: [...edge.source_document_ids],
    can_expand: true,
    graph_score: Number((edge.weight / Math.max(depth, 1)).toFixed(4)),
    expand_depth: depth,
    insight_refs: insightRefsByPageId.get(edge.to_page_id) ?? [],
    signal_contributions: calculateGraphSignalContributions(edge, signalContext),
  };
}

function createGraphInsightRefsByPageId(
  insights: GraphInsightsResponse,
): Map<string, GraphInsightReference[]> {
  const refsByPageId = new Map<string, GraphInsightReference[]>();

  for (const insight of [
    ...insights.knowledge_gaps,
    ...insights.bridge_pages,
    ...insights.isolated_pages,
    ...(insights.sparse_pages ?? []),
    ...insights.communities,
    ...insights.surprising_connections,
  ]) {
    const insightId = insight.id;

    if (insightId === undefined) {
      continue;
    }

    for (const pageId of [insight.page_id, ...(insight.page_ids ?? [])]) {
      if (pageId === undefined) {
        continue;
      }

      const ref: GraphInsightReference = {
        insight_id: insightId,
        insight_type: insight.insight_type,
        reason_codes: [...(insight.reason_codes ?? [])],
        ...(insight.score === undefined ? {} : { score: insight.score }),
      };

      refsByPageId.set(pageId, [...(refsByPageId.get(pageId) ?? []), ref]);
    }
  }

  return refsByPageId;
}

function normalizeRetrieveInput(
  input: RetrieveInput,
  limits: RetrievalRuntimeLimits,
): NormalizedRetrieveInput {
  const warnings: string[] = [];
  const topK = clampPositiveInteger(
    input.top_k,
    limits.defaultTopK,
    limits.maxTopK,
    "retrieve.limit.top_k_clamped",
    warnings,
  );
  const graphDepth = clampPositiveInteger(
    input.graph_depth,
    limits.defaultGraphDepth,
    limits.maxGraphDepth,
    "retrieve.limit.graph_depth_clamped",
    warnings,
  );
  const graphLimitPerResult = clampPositiveInteger(
    input.graph_limit_per_result,
    limits.defaultGraphLimitPerResult,
    limits.maxGraphLimitPerResult,
    "retrieve.limit.graph_limit_per_result_clamped",
    warnings,
  );
  const contextBudgetTokens = clampPositiveInteger(
    input.context_budget_tokens,
    limits.defaultContextBudgetTokens,
    limits.maxContextBudgetTokens,
    "retrieve.limit.context_budget_tokens_clamped",
    warnings,
  );
  const minAnswerConfidence = clampConfidenceThreshold(
    input.min_answer_confidence,
    defaultAnswerableConfidenceThreshold,
    "retrieve.limit.min_answer_confidence_clamped",
    warnings,
  );
  const partialAnswerConfidence = Math.min(
    defaultPartialConfidenceThreshold,
    Math.max(0, minAnswerConfidence - 0.1),
  );
  const noAnswerBehavior =
    input.no_answer_behavior === "empty_results" ||
    input.no_answer_behavior === "diagnostic_results"
      ? input.no_answer_behavior
      : "diagnostic_results";

  if (
    input.no_answer_behavior !== undefined &&
    input.no_answer_behavior !== "empty_results" &&
    input.no_answer_behavior !== "diagnostic_results"
  ) {
    warnings.push("retrieve.limit.no_answer_behavior_defaulted");
  }

  return {
    top_k: topK,
    graph_depth: graphDepth,
    graph_limit_per_result: graphLimitPerResult,
    context_budget_tokens: contextBudgetTokens,
    min_answer_confidence: minAnswerConfidence,
    partial_answer_confidence: partialAnswerConfidence,
    strict_evidence: input.strict_evidence === true,
    no_answer_behavior: noAnswerBehavior,
    warnings,
  };
}

function clampConfidenceThreshold(
  value: number | undefined,
  defaultValue: number,
  warning: string,
  warnings: string[],
): number {
  if (value === undefined) {
    return defaultValue;
  }

  if (!Number.isFinite(value)) {
    warnings.push(warning);

    return defaultValue;
  }

  if (value < 0 || value > 1) {
    warnings.push(warning);
  }

  return clamp01(value);
}

interface RetrieveAnswerabilityAssessmentInput {
  query: string;
  mode: RetrieveMode;
  results: readonly RetrievalResult[];
  graph_expansions: readonly GraphExpansion[];
  citations: readonly RetrievalCitation[];
  context_pack: ContextPack | null;
  warnings: readonly string[];
  normalized_input: NormalizedRetrieveInput;
  semantic_requested: boolean;
  semantic_index_record_count: number;
  duplicate_pruned_count: number;
  has_filters: boolean;
}

interface RetrieveAnswerabilityAssessment {
  answerability: RetrieveAnswerability;
  warnings: readonly string[];
  trace_output: Record<string, unknown>;
}

function assessRetrieveAnswerability(
  input: RetrieveAnswerabilityAssessmentInput,
): RetrieveAnswerabilityAssessment {
  const resultScores = input.results.map(normalizeResultEvidenceScore);
  const topScore = resultScores[0] ?? 0;
  const secondScore = resultScores[1] ?? 0;
  const scoreMargin = clamp01(topScore - secondScore);
  const exactMatch = input.results.some(hasExactRetrievalEvidence);
  const resolvedCitationCount = input.citations.filter(isResolvedCitation).length;
  const citedResultCount = input.results.filter((result) => result.citations.length > 0).length;
  const citationCoverage =
    input.results.length === 0 ? 0 : clamp01(citedResultCount / input.results.length);
  const contextPackEvidenceCount =
    input.context_pack === null
      ? 0
      : input.context_pack.included_page_ids.length + input.context_pack.citations.length;
  const contextPackSufficiency =
    input.context_pack === null
      ? input.results.length > 0
        ? 0.5
        : 0
      : contextPackEvidenceCount > 0
        ? 1
        : 0;
  const graphSupport = input.graph_expansions.length > 0 || input.results.some(hasGraphSupport);
  const indexNotReady = input.semantic_requested && input.semantic_index_record_count === 0;
  const ambiguousIntent = isAmbiguousRetrieveQuery(input.query);
  const unsupportedFactIntent = hasUnsupportedFactIntent(input.query);
  const queryCoverage = calculateQueryEvidenceCoverage(input.query, input.results);
  const lowQueryCoverage =
    queryCoverage.significant_token_count > 0 && queryCoverage.coverage < 0.35;
  const noRelevantCandidate =
    input.results.length === 0 ||
    lowQueryCoverage ||
    (topScore < 0.15 && !exactMatch && resolvedCitationCount === 0);
  const overFiltered = input.has_filters && input.results.length === 0;
  const warningPenalty = Math.min(0.25, input.warnings.length * 0.03 + (indexNotReady ? 0.08 : 0));
  const duplicatePenalty = Math.min(0.1, input.duplicate_pruned_count * 0.02);
  const thresholds: RetrieveAnswerabilityThresholds = {
    answerable: input.normalized_input.min_answer_confidence,
    partial: input.normalized_input.partial_answer_confidence,
    min_citations: defaultAnswerabilityMinCitations,
    strict_evidence: input.normalized_input.strict_evidence,
    no_answer_behavior: input.normalized_input.no_answer_behavior,
  };
  const contributionSummary = {
    top_score: roundConfidence(topScore * 0.38),
    score_margin: roundConfidence(scoreMargin * 0.1),
    exact_match: exactMatch ? 0.18 : 0,
    citation_coverage: roundConfidence(citationCoverage * 0.16),
    context_pack_sufficiency: roundConfidence(contextPackSufficiency * 0.1),
    graph_support: graphSupport ? 0.05 : 0,
    warning_penalty: roundConfidence(warningPenalty),
    duplicate_penalty: roundConfidence(duplicatePenalty),
  };
  const confidenceCap =
    ambiguousIntent || unsupportedFactIntent
      ? Math.max(thresholds.partial, thresholds.answerable - 0.01)
      : 1;
  const confidence = noRelevantCandidate
    ? 0
    : roundConfidence(
        Math.min(
          confidenceCap,
          clamp01(
            contributionSummary.top_score +
              contributionSummary.score_margin +
              contributionSummary.exact_match +
              contributionSummary.citation_coverage +
              contributionSummary.context_pack_sufficiency +
              contributionSummary.graph_support -
              contributionSummary.warning_penalty -
              contributionSummary.duplicate_penalty,
          ),
        ),
      );
  const evidenceSufficiency = classifyEvidenceSufficiency({
    confidence,
    context_pack_evidence_count: contextPackEvidenceCount,
    resolved_citation_count: resolvedCitationCount,
    result_count: input.results.length,
    strict_evidence: thresholds.strict_evidence,
    min_citations: thresholds.min_citations,
    no_relevant_candidate: noRelevantCandidate,
    ambiguous_intent: ambiguousIntent,
    unsupported_fact_intent: unsupportedFactIntent,
  });
  const status = classifyAnswerabilityStatus({
    confidence,
    evidence_sufficiency: evidenceSufficiency,
    no_relevant_candidate: noRelevantCandidate,
    threshold_answerable: thresholds.answerable,
    threshold_partial: thresholds.partial,
    ambiguous_intent: ambiguousIntent,
    unsupported_fact_intent: unsupportedFactIntent,
  });
  const reasonCodes = buildAnswerabilityReasonCodes({
    status,
    evidence_sufficiency: evidenceSufficiency,
    confidence,
    thresholds,
    score_margin: scoreMargin,
    no_relevant_candidate: noRelevantCandidate,
    over_filtered: overFiltered,
    index_not_ready: indexNotReady,
    ambiguous_intent: ambiguousIntent,
    resolved_citation_count: resolvedCitationCount,
    context_pack_evidence_count: contextPackEvidenceCount,
  });
  const recommendedAction = chooseRecommendedAction({
    status,
    reason_codes: reasonCodes,
  });
  const answerability: RetrieveAnswerability = {
    status,
    confidence,
    evidence_sufficiency: evidenceSufficiency,
    no_answer: status === "not_answerable",
    reason_codes: reasonCodes,
    recommended_action: recommendedAction,
    thresholds,
  };
  const warnings = buildAnswerabilityWarnings(answerability);

  return {
    answerability,
    warnings,
    trace_output: {
      status,
      confidence,
      evidence_sufficiency: evidenceSufficiency,
      no_answer: answerability.no_answer,
      reason_codes: reasonCodes,
      recommended_action: recommendedAction,
      thresholds,
      candidate_count: input.results.length,
      graph_expansion_count: input.graph_expansions.length,
      citation_count: input.citations.length,
      resolved_citation_count: resolvedCitationCount,
      context_pack_entry_count: input.context_pack?.entries.length ?? 0,
      context_pack_evidence_count: contextPackEvidenceCount,
      query_term_coverage: queryCoverage,
      ambiguous_intent: ambiguousIntent,
      unsupported_fact_intent: unsupportedFactIntent,
      confidence_contributions: contributionSummary,
    },
  };
}

function classifyEvidenceSufficiency(input: {
  confidence: number;
  context_pack_evidence_count: number;
  resolved_citation_count: number;
  result_count: number;
  strict_evidence: boolean;
  min_citations: number;
  no_relevant_candidate: boolean;
  ambiguous_intent: boolean;
  unsupported_fact_intent: boolean;
}): RetrieveEvidenceSufficiency {
  if (input.result_count === 0 || input.no_relevant_candidate) {
    return "insufficient";
  }

  if (input.ambiguous_intent || input.unsupported_fact_intent) {
    return "partial";
  }

  const hasCitationEvidence = input.resolved_citation_count >= input.min_citations;
  const hasContextEvidence = input.context_pack_evidence_count > 0;

  if (hasCitationEvidence && (hasContextEvidence || !input.strict_evidence)) {
    return "sufficient";
  }

  if (input.confidence >= defaultPartialConfidenceThreshold) {
    return "partial";
  }

  return "insufficient";
}

function classifyAnswerabilityStatus(input: {
  confidence: number;
  evidence_sufficiency: RetrieveEvidenceSufficiency;
  no_relevant_candidate: boolean;
  threshold_answerable: number;
  threshold_partial: number;
  ambiguous_intent: boolean;
  unsupported_fact_intent: boolean;
}): RetrieveAnswerabilityStatus {
  if (input.no_relevant_candidate || input.confidence < input.threshold_partial) {
    return "not_answerable";
  }

  if (input.ambiguous_intent || input.unsupported_fact_intent) {
    return "partial";
  }

  if (
    input.confidence >= input.threshold_answerable &&
    input.evidence_sufficiency === "sufficient"
  ) {
    return "answerable";
  }

  return "partial";
}

function buildAnswerabilityReasonCodes(input: {
  status: RetrieveAnswerabilityStatus;
  evidence_sufficiency: RetrieveEvidenceSufficiency;
  confidence: number;
  thresholds: RetrieveAnswerabilityThresholds;
  score_margin: number;
  no_relevant_candidate: boolean;
  over_filtered: boolean;
  index_not_ready: boolean;
  ambiguous_intent: boolean;
  resolved_citation_count: number;
  context_pack_evidence_count: number;
}): readonly RetrieveAnswerabilityReasonCode[] {
  const reasons: RetrieveAnswerabilityReasonCode[] = [];

  if (input.status === "answerable") {
    reasons.push("sufficient_evidence");
  }

  if (input.status === "partial") {
    reasons.push("partial_evidence");
  }

  if (input.confidence < input.thresholds.answerable) {
    reasons.push("low_confidence");
  }

  if (input.score_margin < 0.05 && input.status !== "not_answerable") {
    reasons.push("low_score_margin");
  }

  if (input.resolved_citation_count < input.thresholds.min_citations) {
    reasons.push("insufficient_citations");
  }

  if (input.no_relevant_candidate) {
    reasons.push("no_relevant_candidate");
  }

  if (input.over_filtered) {
    reasons.push("over_filtered");
  }

  if (input.index_not_ready) {
    reasons.push("index_not_ready");
  }

  if (input.ambiguous_intent) {
    reasons.push("ambiguous_intent");
  }

  if (input.status === "not_answerable" && input.context_pack_evidence_count > 0) {
    reasons.push("context_pack_diagnostic_only");
  }

  if (
    input.thresholds.strict_evidence &&
    input.resolved_citation_count < input.thresholds.min_citations
  ) {
    reasons.push("strict_evidence_required");
  }

  return [...new Set(reasons)];
}

function chooseRecommendedAction(input: {
  status: RetrieveAnswerabilityStatus;
  reason_codes: readonly RetrieveAnswerabilityReasonCode[];
}): RetrieveRecommendedAction {
  if (input.status === "answerable") {
    return "answer_with_citations";
  }

  if (input.reason_codes.includes("index_not_ready")) {
    return "retry_after_ingest";
  }

  if (input.reason_codes.includes("over_filtered")) {
    return "relax_filters";
  }

  if (input.reason_codes.includes("ambiguous_intent")) {
    return "ask_clarifying_question";
  }

  if (input.status === "partial") {
    return "answer_with_caveat";
  }

  return "ask_clarifying_question";
}

function buildAnswerabilityWarnings(answerability: RetrieveAnswerability): readonly string[] {
  const warnings: string[] = [];

  if (answerability.reason_codes.includes("low_confidence")) {
    warnings.push("retrieve.answerability.low_confidence");
  }

  if (answerability.evidence_sufficiency !== "sufficient") {
    warnings.push("retrieve.answerability.insufficient_evidence");
  }

  if (answerability.reason_codes.includes("no_relevant_candidate")) {
    warnings.push("retrieve.answerability.no_relevant_candidate");
  }

  if (answerability.reason_codes.includes("over_filtered")) {
    warnings.push("retrieve.answerability.over_filtered");
  }

  if (answerability.reason_codes.includes("insufficient_citations")) {
    warnings.push("retrieve.answerability.no_citation_support");
  }

  if (answerability.reason_codes.includes("ambiguous_intent")) {
    warnings.push("retrieve.answerability.ambiguous_intent");
  }

  if (answerability.reason_codes.includes("index_not_ready")) {
    warnings.push("retrieve.answerability.index_not_ready");
  }

  return warnings;
}

function normalizeResultEvidenceScore(result: RetrievalResult): number {
  const keywordScore = Math.log1p(Math.max(0, result.score.keyword)) / Math.log1p(12);
  const scores = [
    keywordScore,
    result.score.semantic ?? 0,
    result.score.graph ?? 0,
    result.score.rerank ?? 0,
    result.score.fusion ?? 0,
  ].filter((value) => Number.isFinite(value));

  return clamp01(Math.max(0, ...scores));
}

function hasExactRetrievalEvidence(result: RetrievalResult): boolean {
  return result.match_reasons.some((reason) =>
    [
      "title",
      "title_phrase",
      "page_section",
      "markdown_phrase",
      "source_name",
      "source_virtual_path",
      "source_locator",
      "source_summary",
      "page_slug",
    ].includes(reason.field),
  );
}

function hasGraphSupport(result: RetrievalResult): boolean {
  return (
    (result.score.graph ?? 0) > 0 ||
    result.graph_signals.length > 0 ||
    result.expanded_from_page_id !== null
  );
}

function isResolvedCitation(citation: RetrievalCitation): boolean {
  return citation.locator_status === "resolved";
}

function isAmbiguousRetrieveQuery(query: string): boolean {
  const lexicalQuery = createLexicalQuery(query);

  return lexicalQuery.tokens.length > 0 && lexicalQuery.tokens.length <= 1;
}

function hasUnsupportedFactIntent(query: string): boolean {
  const value = normalized(query);

  return [
    "not explicitly stated",
    "not stated",
    "unstated",
    "not covered",
    "not documented",
    "missing",
    "unknown",
    "\u672a\u660e\u786e",
    "\u6ca1\u6709\u660e\u786e",
    "\u672a\u8bf4\u660e",
    "\u4e0d\u5b58\u5728",
  ].some((phrase) => value.includes(phrase));
}

function calculateQueryEvidenceCoverage(
  query: string,
  results: readonly RetrievalResult[],
): {
  coverage: number;
  matched_token_count: number;
  significant_token_count: number;
} {
  const tokens = createAnswerabilityCoverageTokens(query);

  if (tokens.length === 0) {
    return {
      coverage: results.length > 0 ? 1 : 0,
      matched_token_count: 0,
      significant_token_count: 0,
    };
  }

  const evidenceText = normalized(
    results
      .slice(0, 3)
      .map((result) => buildAnswerabilityEvidenceText(result))
      .join("\n"),
  );
  const matchedTokenCount = tokens.filter((token) => evidenceText.includes(token)).length;

  return {
    coverage: roundConfidence(matchedTokenCount / tokens.length),
    matched_token_count: matchedTokenCount,
    significant_token_count: tokens.length,
  };
}

function createAnswerabilityCoverageTokens(query: string): readonly string[] {
  return createLexicalQuery(query).tokens.filter(
    (token) => !answerabilityCoverageStopWords.has(token),
  );
}

function buildAnswerabilityEvidenceText(result: RetrievalResult): string {
  return [
    result.title,
    result.section,
    result.retrieval_reason,
    ...result.match_reasons.map((reason) => reason.term),
    ...result.citations.map((citation) => citation.locator),
  ].join("\n");
}

const answerabilityCoverageStopWords = new Set([
  "find",
  "show",
  "list",
  "get",
  "return",
  "include",
  "cite",
  "cites",
  "citation",
  "citations",
  "source",
  "sources",
  "file",
  "type",
  "path",
  "relevant",
  "evidence",
  "suggest",
  "expand",
  "next",
  "compare",
  "related",
  "knowledge",
  "base",
  "from",
  "document",
  "documents",
  "explicitly",
  "stated",
  "not",
  "missing",
  "unknown",
]);

function attachContextPackAnswerability(
  contextPack: ContextPack,
  answerability: RetrieveAnswerability,
): ContextPack {
  return {
    ...contextPack,
    answerability,
  };
}

function hasRetrieveFilters(input: RetrieveInput): boolean {
  return (
    (input.page_types?.length ?? 0) > 0 ||
    (input.source_ids?.length ?? 0) > 0 ||
    (input.relation_types?.length ?? 0) > 0 ||
    input.version_id !== undefined
  );
}

function dedupeWarningCodes(warnings: readonly string[]): string[] {
  return [...new Set(warnings)];
}

function roundConfidence(value: number): number {
  return Number(clamp01(value).toFixed(4));
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(1, value));
}

function clampPositiveInteger(
  value: number | undefined,
  defaultValue: number,
  maximum: number,
  warning: string,
  warnings: string[],
): number {
  const normalizedValue =
    typeof value === "number" && Number.isFinite(value) ? Math.floor(value) : defaultValue;
  const safeValue = Math.max(1, normalizedValue);

  if (safeValue > maximum) {
    warnings.push(warning);

    return maximum;
  }

  return safeValue;
}

function buildExpandableGraph(
  repository: RetrievalRepository,
  results: readonly RetrievalResult[],
  graphExpansions: readonly GraphExpansion[],
  input: RetrieveInput,
): ExpandableGraph {
  const seedPageIds = uniqueStrings(results.map((result) => result.page_id));
  const nodePageIds = [
    ...new Set([...seedPageIds, ...graphExpansions.map((item) => item.to_page_id)]),
  ];
  const visiblePagesById = new Map(
    repository.listPages(input.knowledge_base_id).map((page) => [page.page_id, page]),
  );
  const nodes = nodePageIds.flatMap((pageId) => {
    const page = visiblePagesById.get(pageId);

    if (page === undefined) {
      return [];
    }

    const displayMetadata = createDisplayMetadata(page);

    return [
      {
        page_id: page.page_id,
        page_version_id: page.page_version_id,
        source_refs: page.source_refs.map((source) => ({ ...source })),
        title: page.title,
        type: page.type,
        ...(displayMetadata === undefined ? {} : { display_metadata: displayMetadata }),
        visibility_origin: page.visibility_origin ?? "canonical",
      },
    ];
  });
  const relationTypes = [
    ...new Set(graphExpansions.map((item) => item.relation_type)),
  ] as RetrievalRelationType[];

  return {
    seed_page_ids: seedPageIds,
    nodes,
    edges: graphExpansions.map((item) => ({
      edge_id: item.edge_id,
      from_page_id: item.from_page_id,
      source_document_ids: [...item.source_document_ids],
      to_page_id: item.to_page_id,
      relation_type: item.relation_type,
      visibility_origin: item.edge_visibility_origin ?? "canonical",
    })),
    next_expansion: {
      seed_page_ids: seedPageIds,
      relation_types: relationTypes.length > 0 ? relationTypes : [...(input.relation_types ?? [])],
      depth: 1,
      exclude_page_ids: nodePageIds,
    },
  };
}

function uniqueResultsByPage(results: readonly RetrievalResult[]): RetrievalResult[] {
  const seen = new Set<string>();
  const uniqueResults: RetrievalResult[] = [];

  for (const result of results) {
    if (seen.has(result.page_id)) {
      continue;
    }

    seen.add(result.page_id);
    uniqueResults.push(result);
  }

  return uniqueResults;
}

function summarizeRetrieveVisibility(input: {
  context_pack: ContextPack | null;
  expandable_graph: ExpandableGraph | null;
  graph_expansions: readonly GraphExpansion[];
  results: readonly RetrievalResult[];
}): RetrievalVisibilitySummary {
  const summary: RetrievalVisibilitySummary = {
    canonical: 0,
    upstream_inherited: 0,
    fork_owned: 0,
  };
  const seen = new Set<string>();
  const addPage = (
    pageId: string | undefined,
    visibilityOrigin: RetrievalVisibilityOrigin | undefined,
  ) => {
    if (pageId === undefined || pageId.length === 0) {
      return;
    }

    const origin = normalizeVisibilityOrigin(visibilityOrigin);
    const key = `${pageId}:${origin}`;

    if (seen.has(key)) {
      return;
    }

    seen.add(key);
    summary[origin] += 1;
  };

  for (const result of input.results) {
    addPage(result.page_id, result.visibility_origin);
  }

  for (const expansion of input.graph_expansions) {
    addPage(expansion.to_page_id, expansion.visibility_origin);
  }

  for (const node of input.expandable_graph?.nodes ?? []) {
    addPage(node.page_id, node.visibility_origin);
  }

  for (const entry of input.context_pack?.entries ?? []) {
    addPage(entry.page_id, entry.visibility_origin);
  }

  return summary;
}

function normalizeVisibilityOrigin(
  visibilityOrigin: RetrievalVisibilityOrigin | undefined,
): RetrievalVisibilityOrigin {
  if (visibilityOrigin !== undefined) {
    return visibilityOrigin;
  }

  return "canonical";
}

function createGraphRelevanceAlgorithmMetadata(): GraphAlgorithmMetadata {
  return {
    name: "fococontext-graph-relevance",
    version: "0.2.0",
    weights: {
      common_neighbor: graphSignalWeights.common_neighbor,
      shared_source: graphSignalWeights.shared_source,
      type_affinity: graphSignalWeights.type_affinity,
      wikilink: graphSignalWeights.wikilink,
    },
  };
}

function createGraphInsightAlgorithmMetadata(): GraphAlgorithmMetadata {
  return {
    community_algorithm: {
      ...graphCommunityAlgorithm,
    },
    name: "fococontext-graph-insights",
    version: "0.3.0",
  };
}

const graphCommunityAlgorithm = {
  name: "fococontext-modularity-louvain-compatible",
  resolution: 1,
  version: "0.1.0",
  weighted: true,
} as const;

const graphSignalWeights = {
  common_neighbor: 1.5,
  shared_source: 4,
  type_affinity: 1,
  wikilink: 3,
} as const;

const graphTypeAffinity: Record<string, Record<string, number>> = {
  concept: { concept: 0.8, entity: 1.2, query: 1, source: 1, synthesis: 1.2 },
  entity: { concept: 1.2, entity: 0.8, query: 0.8, source: 1, synthesis: 1 },
  query: { concept: 1, entity: 0.8, query: 0.5, source: 0.8, synthesis: 1 },
  source: { concept: 1, entity: 1, query: 0.8, source: 0.5, synthesis: 1 },
  synthesis: { concept: 1.2, entity: 1, query: 1, source: 1, synthesis: 0.8 },
};

interface GraphSignalContributionContext {
  degreeByPageId: ReadonlyMap<string, number>;
  neighborsByPageId: ReadonlyMap<string, ReadonlySet<string>>;
  pageById: ReadonlyMap<string, RetrievalPageRecord>;
  pageKeysByPageId: ReadonlyMap<string, ReadonlySet<string>>;
  wikilinksByPageId: ReadonlyMap<string, ReadonlySet<string>>;
}

function createGraphSignalContributionContext(
  pages: readonly RetrievalPageRecord[],
  edges: readonly RetrievalEdgeRecord[],
): GraphSignalContributionContext {
  const pageById = new Map(pages.map((page) => [page.page_id, page]));
  const pageKeysByPageId = new Map(
    pages.map((page) => [
      page.page_id,
      new Set([
        normalizeGraphPageKey(page.page_id),
        normalizeGraphPageKey(page.title),
        ...readMetadataStrings(page.metadata, ["slug", "page_slug"]).map(normalizeGraphPageKey),
      ]),
    ]),
  );
  const wikilinksByPageId = new Map(
    pages.map((page) => [
      page.page_id,
      new Set(extractGraphWikilinks(page.markdown).map(normalizeGraphPageKey)),
    ]),
  );
  const neighborsByPageId = new Map<string, Set<string>>();
  const degreeByPageId = new Map<string, number>();

  for (const edge of edges) {
    addGraphNeighbor(neighborsByPageId, edge.from_page_id, edge.to_page_id);
    addGraphNeighbor(neighborsByPageId, edge.to_page_id, edge.from_page_id);
  }

  for (const [pageId, neighbors] of neighborsByPageId) {
    degreeByPageId.set(pageId, neighbors.size);
  }

  return {
    degreeByPageId,
    neighborsByPageId,
    pageById,
    pageKeysByPageId,
    wikilinksByPageId,
  };
}

function addGraphNeighbor(
  neighborsByPageId: Map<string, Set<string>>,
  pageId: string,
  neighborPageId: string,
): void {
  const neighbors = neighborsByPageId.get(pageId) ?? new Set<string>();

  neighbors.add(neighborPageId);
  neighborsByPageId.set(pageId, neighbors);
}

function calculateGraphSignalContributions(
  edge: RetrievalEdgeRecord,
  context: GraphSignalContributionContext,
): GraphSignalContribution[] {
  const source = context.pageById.get(edge.from_page_id);
  const target = context.pageById.get(edge.to_page_id);

  if (source === undefined || target === undefined) {
    return [];
  }

  const contributions: GraphSignalContribution[] = [];
  const hasExplicitLink =
    edge.relation_type === "wikilink" ||
    graphLinksToPage(source.page_id, target.page_id, context) ||
    graphLinksToPage(target.page_id, source.page_id, context);

  if (hasExplicitLink) {
    contributions.push({
      evidence_refs: [{ edge_id: edge.edge_id }],
      reason_codes: ["explicit_wikilink"],
      score: graphSignalWeights.wikilink,
      type: "wikilink",
      weight: graphSignalWeights.wikilink,
    });
  }

  const sharedSourceIds = findSharedSourceIds(source, target, edge);

  if (sharedSourceIds.length > 0) {
    contributions.push({
      evidence_refs: sharedSourceIds.map((documentId) => ({ document_id: documentId })),
      reason_codes: ["shared_source_overlap"],
      score: Number((sharedSourceIds.length * graphSignalWeights.shared_source).toFixed(4)),
      type: "shared_source",
      weight: graphSignalWeights.shared_source,
    });
  }

  const commonNeighborScore = calculateCommonNeighborScore(source.page_id, target.page_id, context);

  if (commonNeighborScore > 0) {
    contributions.push({
      evidence_refs: findCommonNeighborPageIds(source.page_id, target.page_id, context).map(
        (pageId) => ({
          page_id: pageId,
        }),
      ),
      reason_codes: ["common_neighbor_support"],
      score: commonNeighborScore,
      type: "common_neighbor",
      weight: graphSignalWeights.common_neighbor,
    });
  }

  const affinityScore = calculateTypeAffinityScore(source.type, target.type);

  if (affinityScore > 0) {
    contributions.push({
      reason_codes: ["type_affinity"],
      score: affinityScore,
      type: "type_affinity",
      weight: graphSignalWeights.type_affinity,
    });
  }

  return contributions.sort((left, right) => right.score - left.score);
}

function graphLinksToPage(
  sourcePageId: string,
  targetPageId: string,
  context: GraphSignalContributionContext,
): boolean {
  const sourceLinks = context.wikilinksByPageId.get(sourcePageId);
  const targetKeys = context.pageKeysByPageId.get(targetPageId);

  if (sourceLinks === undefined || targetKeys === undefined) {
    return false;
  }

  for (const key of targetKeys) {
    if (sourceLinks.has(key)) {
      return true;
    }
  }

  return false;
}

function extractGraphWikilinks(markdown: string): string[] {
  return [...markdown.matchAll(/\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]/gu)]
    .map((match) => match[1]?.trim() ?? "")
    .filter(Boolean);
}

function findSharedSourceIds(
  source: RetrievalPageRecord,
  target: RetrievalPageRecord,
  edge: RetrievalEdgeRecord,
): string[] {
  const sourceIds = new Set([...getPageSourceDocumentIds(source), ...edge.source_document_ids]);
  const targetIds = new Set([...getPageSourceDocumentIds(target), ...edge.source_document_ids]);

  return [...sourceIds].filter((documentId) => targetIds.has(documentId)).sort();
}

function getPageSourceDocumentIds(page: RetrievalPageRecord): string[] {
  return [
    ...page.source_refs.map((source) => source.document_id),
    ...readMetadataStrings(page.metadata, [
      "source_document_id",
      "source_document_ids",
      "document_id",
    ]),
    ...readMetadataStrings(page.frontmatter ?? {}, [
      "source_document_id",
      "source_document_ids",
      "document_id",
    ]),
  ].filter((value, index, values) => value.length > 0 && values.indexOf(value) === index);
}

function calculateCommonNeighborScore(
  sourcePageId: string,
  targetPageId: string,
  context: GraphSignalContributionContext,
): number {
  const commonNeighborIds = findCommonNeighborPageIds(sourcePageId, targetPageId, context);
  let score = 0;

  for (const pageId of commonNeighborIds) {
    const degree = context.degreeByPageId.get(pageId) ?? 0;
    score += 1 / Math.log(Math.max(degree, 2));
  }

  return Number((score * graphSignalWeights.common_neighbor).toFixed(4));
}

function findCommonNeighborPageIds(
  sourcePageId: string,
  targetPageId: string,
  context: GraphSignalContributionContext,
): string[] {
  const sourceNeighbors = context.neighborsByPageId.get(sourcePageId) ?? new Set<string>();
  const targetNeighbors = context.neighborsByPageId.get(targetPageId) ?? new Set<string>();

  return [...sourceNeighbors]
    .filter((pageId) => pageId !== targetPageId && targetNeighbors.has(pageId))
    .sort();
}

function calculateTypeAffinityScore(sourceType: string, targetType: string): number {
  const affinity = graphTypeAffinity[sourceType]?.[targetType] ?? 0.5;

  return Number((affinity * graphSignalWeights.type_affinity).toFixed(4));
}

interface GraphCommunityInternal {
  cohesion: number;
  confidence: number;
  id: string;
  memberIds: string[];
  topPageTitles: string[];
}

function detectGraphCommunities(
  pages: readonly RetrievalPageRecord[],
  edges: readonly RetrievalEdgeRecord[],
): {
  assignments: Map<string, string>;
  communities: GraphCommunityInternal[];
} {
  const structuralEdges = edges.filter(
    (edge) => edge.relation_type !== "manual" && edge.weight > 0,
  );
  const detectedCommunities = detectModularityCommunities(pages, structuralEdges);
  const pageById = new Map(pages.map((page) => [page.page_id, page]));
  const degreeByPageId = new Map<string, number>();
  const weightedDegreeByPageId = new Map<string, number>();
  const assignments = new Map<string, string>();
  const communities: GraphCommunityInternal[] = [];

  for (const edge of structuralEdges) {
    degreeByPageId.set(edge.from_page_id, (degreeByPageId.get(edge.from_page_id) ?? 0) + 1);
    degreeByPageId.set(edge.to_page_id, (degreeByPageId.get(edge.to_page_id) ?? 0) + 1);
    weightedDegreeByPageId.set(
      edge.from_page_id,
      (weightedDegreeByPageId.get(edge.from_page_id) ?? 0) + edge.weight,
    );
    weightedDegreeByPageId.set(
      edge.to_page_id,
      (weightedDegreeByPageId.get(edge.to_page_id) ?? 0) + edge.weight,
    );
  }

  detectedCommunities.forEach((memberIds, index) => {
    const id = `community_${index + 1}`;

    for (const memberId of memberIds) {
      assignments.set(memberId, id);
    }

    const possibleEdges =
      memberIds.length > 1 ? (memberIds.length * (memberIds.length - 1)) / 2 : 1;
    const memberSet = new Set(memberIds);
    let intraEdgeCount = 0;
    let intraEdgeWeight = 0;
    let incidentEdgeWeight = 0;

    for (const edge of structuralEdges) {
      const fromInCommunity = memberSet.has(edge.from_page_id);
      const toInCommunity = memberSet.has(edge.to_page_id);

      if (fromInCommunity && toInCommunity) {
        intraEdgeCount += 1;
        intraEdgeWeight += edge.weight;
      }
      if (fromInCommunity || toInCommunity) {
        incidentEdgeWeight += edge.weight;
      }
    }

    const sortedMemberIds = [...memberIds].sort((left, right) => {
      const degreeDiff =
        (weightedDegreeByPageId.get(right) ?? degreeByPageId.get(right) ?? 0) -
        (weightedDegreeByPageId.get(left) ?? degreeByPageId.get(left) ?? 0);

      return degreeDiff === 0
        ? (pageById.get(left)?.title ?? left).localeCompare(pageById.get(right)?.title ?? right)
        : degreeDiff;
    });

    communities.push({
      cohesion: Number((intraEdgeCount / possibleEdges).toFixed(4)),
      confidence:
        incidentEdgeWeight <= 0
          ? 0
          : Number(Math.min(1, intraEdgeWeight / incidentEdgeWeight).toFixed(4)),
      id,
      memberIds,
      topPageTitles: sortedMemberIds
        .slice(0, 5)
        .map((pageId) => pageById.get(pageId)?.title ?? pageId),
    });
  });

  return {
    assignments,
    communities: communities.sort((left, right) => right.memberIds.length - left.memberIds.length),
  };
}

function detectModularityCommunities(
  pages: readonly RetrievalPageRecord[],
  edges: readonly RetrievalEdgeRecord[],
): string[][] {
  const pageIds = pages.map((page) => page.page_id);

  if (pageIds.length === 0) {
    return [];
  }
  if (edges.length === 0) {
    return pageIds.map((pageId) => [pageId]);
  }

  const adjacency = normalizeUndirectedEdgeWeights(pageIds, edges);
  const communityByPageId = new Map(pageIds.map((pageId) => [pageId, pageId] as const));
  let bestModularity = calculateModularity(pageIds, adjacency, communityByPageId);

  for (let pass = 0; pass < 25; pass += 1) {
    let moved = false;

    for (const pageId of pageIds) {
      const originalCommunityId = communityByPageId.get(pageId) ?? pageId;
      let selectedCommunityId = originalCommunityId;
      let selectedModularity = bestModularity;

      for (const candidateCommunityId of getCandidateCommunityIds(
        pageId,
        adjacency,
        communityByPageId,
      )) {
        if (candidateCommunityId === originalCommunityId) {
          continue;
        }

        communityByPageId.set(pageId, candidateCommunityId);
        const candidateModularity = calculateModularity(pageIds, adjacency, communityByPageId);

        if (
          candidateModularity > selectedModularity + Number.EPSILON ||
          (Math.abs(candidateModularity - selectedModularity) <= Number.EPSILON &&
            candidateCommunityId.localeCompare(selectedCommunityId) < 0)
        ) {
          selectedCommunityId = candidateCommunityId;
          selectedModularity = candidateModularity;
        }
      }

      communityByPageId.set(pageId, selectedCommunityId);

      if (selectedCommunityId !== originalCommunityId) {
        moved = true;
        bestModularity = selectedModularity;
      }
    }

    if (!moved) {
      break;
    }
  }

  const groups = new Map<string, string[]>();
  const pageOrder = new Map(pageIds.map((pageId, index) => [pageId, index]));

  for (const pageId of pageIds) {
    const communityId = communityByPageId.get(pageId) ?? pageId;
    groups.set(communityId, [...(groups.get(communityId) ?? []), pageId]);
  }

  return [...groups.values()]
    .map((memberIds) =>
      memberIds.sort(
        (left, right) =>
          (pageOrder.get(left) ?? Number.MAX_SAFE_INTEGER) -
          (pageOrder.get(right) ?? Number.MAX_SAFE_INTEGER),
      ),
    )
    .sort((left, right) => {
      if (right.length !== left.length) {
        return right.length - left.length;
      }

      return (left[0] ?? "").localeCompare(right[0] ?? "");
    });
}

function normalizeUndirectedEdgeWeights(
  pageIds: readonly string[],
  edges: readonly RetrievalEdgeRecord[],
): Map<string, Map<string, number>> {
  const adjacency = new Map<string, Map<string, number>>();
  const knownPageIds = new Set(pageIds);

  for (const pageId of pageIds) {
    adjacency.set(pageId, new Map());
  }

  for (const edge of edges) {
    if (!knownPageIds.has(edge.from_page_id) || !knownPageIds.has(edge.to_page_id)) {
      continue;
    }
    if (edge.from_page_id === edge.to_page_id) {
      continue;
    }

    addUndirectedEdgeWeight(adjacency, edge.from_page_id, edge.to_page_id, edge.weight);
  }

  return adjacency;
}

function addUndirectedEdgeWeight(
  adjacency: Map<string, Map<string, number>>,
  leftPageId: string,
  rightPageId: string,
  weight: number,
): void {
  adjacency
    .get(leftPageId)
    ?.set(rightPageId, (adjacency.get(leftPageId)?.get(rightPageId) ?? 0) + weight);
  adjacency
    .get(rightPageId)
    ?.set(leftPageId, (adjacency.get(rightPageId)?.get(leftPageId) ?? 0) + weight);
}

function getCandidateCommunityIds(
  pageId: string,
  adjacency: ReadonlyMap<string, ReadonlyMap<string, number>>,
  communityByPageId: ReadonlyMap<string, string>,
): string[] {
  const candidates = new Set<string>([communityByPageId.get(pageId) ?? pageId]);

  for (const neighborPageId of adjacency.get(pageId)?.keys() ?? []) {
    candidates.add(communityByPageId.get(neighborPageId) ?? neighborPageId);
  }

  return [...candidates].sort();
}

function calculateModularity(
  pageIds: readonly string[],
  adjacency: ReadonlyMap<string, ReadonlyMap<string, number>>,
  communityByPageId: ReadonlyMap<string, string>,
): number {
  const totalEdgeWeight = calculateTotalUndirectedEdgeWeight(adjacency);

  if (totalEdgeWeight <= 0) {
    return 0;
  }

  const degreeByPageId = new Map(
    pageIds.map((pageId) => [pageId, sumWeights(adjacency.get(pageId) ?? new Map())] as const),
  );
  const communityPageIds = new Map<string, string[]>();

  for (const pageId of pageIds) {
    const communityId = communityByPageId.get(pageId) ?? pageId;
    communityPageIds.set(communityId, [...(communityPageIds.get(communityId) ?? []), pageId]);
  }

  let modularity = 0;

  for (const members of communityPageIds.values()) {
    const memberSet = new Set(members);
    let internalWeight = 0;
    let degreeWeight = 0;

    for (const pageId of members) {
      degreeWeight += degreeByPageId.get(pageId) ?? 0;

      for (const [neighborPageId, weight] of adjacency.get(pageId) ?? []) {
        if (memberSet.has(neighborPageId) && pageId.localeCompare(neighborPageId) < 0) {
          internalWeight += weight;
        }
      }
    }

    modularity +=
      internalWeight / totalEdgeWeight -
      graphCommunityAlgorithm.resolution * Math.pow(degreeWeight / (2 * totalEdgeWeight), 2);
  }

  return Number(modularity.toFixed(12));
}

function calculateTotalUndirectedEdgeWeight(
  adjacency: ReadonlyMap<string, ReadonlyMap<string, number>>,
): number {
  let totalWeight = 0;

  for (const [pageId, neighbors] of adjacency) {
    for (const [neighborPageId, weight] of neighbors) {
      if (pageId.localeCompare(neighborPageId) < 0) {
        totalWeight += weight;
      }
    }
  }

  return totalWeight;
}

function sumWeights(weights: ReadonlyMap<string, number>): number {
  let total = 0;

  for (const weight of weights.values()) {
    total += weight;
  }

  return total;
}

function toGraphCommunityMetadata(community: GraphCommunityInternal): GraphCommunityMetadata {
  return {
    algorithm: {
      ...graphCommunityAlgorithm,
    },
    cohesion: community.cohesion,
    confidence: community.confidence,
    id: community.id,
    member_count: community.memberIds.length,
    representative_page_ids: community.memberIds.slice(0, 5),
    representative_titles: community.topPageTitles.slice(0, 5),
  };
}

function isBridgePage(
  page: RetrievalPageRecord,
  assignments: ReadonlyMap<string, string>,
  edgesByPageId: ReadonlyMap<string, readonly RetrievalEdgeRecord[]>,
): boolean {
  return countNeighborCommunities(page.page_id, assignments, edgesByPageId) >= 2;
}

function countNeighborCommunities(
  pageId: string,
  assignments: ReadonlyMap<string, string>,
  edgesByPageId: ReadonlyMap<string, readonly RetrievalEdgeRecord[]>,
): number {
  const communities = new Set<string>();

  for (const edge of edgesByPageId.get(pageId) ?? []) {
    const otherPageId = edge.from_page_id === pageId ? edge.to_page_id : edge.from_page_id;
    const communityId = assignments.get(otherPageId);

    if (communityId !== undefined) {
      communities.add(communityId);
    }
  }

  return communities.size;
}

function findSurprisingGraphConnections(
  edges: readonly RetrievalEdgeRecord[],
  pageById: ReadonlyMap<string, RetrievalPageRecord>,
  degreeByPageId: ReadonlyMap<string, number>,
  assignments: ReadonlyMap<string, string>,
  signalContext: GraphSignalContributionContext,
): GraphInsightItem[] {
  const maxDegree = Math.max(...[...degreeByPageId.values(), 1]);

  return edges
    .flatMap((edge) => {
      const source = pageById.get(edge.from_page_id);
      const target = pageById.get(edge.to_page_id);

      if (source === undefined || target === undefined) {
        return [];
      }
      if (!isGraphInsightPage(source) || !isGraphInsightPage(target)) {
        return [];
      }

      const reasonCodes: string[] = [];
      let score = 0;

      if (assignments.get(source.page_id) !== assignments.get(target.page_id)) {
        score += 3;
        reasonCodes.push("cross_community");
      }
      if (source.type !== target.type) {
        score += isDistantGraphTypePair(source.type, target.type) ? 2 : 1;
        reasonCodes.push("cross_type");
      }
      if (edge.relation_type === "manual") {
        score += 3;
        reasonCodes.push("manual_connection");
      }

      const minDegree = Math.min(
        degreeByPageId.get(source.page_id) ?? 0,
        degreeByPageId.get(target.page_id) ?? 0,
      );
      const highDegree = Math.max(
        degreeByPageId.get(source.page_id) ?? 0,
        degreeByPageId.get(target.page_id) ?? 0,
      );

      if (minDegree <= 1 && highDegree >= maxDegree * 0.5) {
        score += 2;
        reasonCodes.push("peripheral_to_hub");
      }
      if (edge.weight > 0 && edge.weight < 1) {
        score += 1;
        reasonCodes.push("weak_supported_edge");
      }

      if (score < 3 || reasonCodes.length === 0) {
        return [];
      }

      return [
        createGraphInsightItem({
          insight_type: "surprising_connection",
          page_ids: [edge.from_page_id, edge.to_page_id],
          reason: "Edge connects pages through an unexpected graph pattern.",
          reason_codes: reasonCodes,
          reasons: [toGraphInsightReason(edge)],
          score,
          severity: score >= 5 ? "medium" : "low",
          signal_contributions: calculateGraphSignalContributions(edge, signalContext),
          title: `${source.title} <-> ${target.title}`,
        }),
      ];
    })
    .sort((left, right) => (right.score ?? 0) - (left.score ?? 0))
    .slice(0, 10);
}

function isDistantGraphTypePair(sourceType: string, targetType: string): boolean {
  return new Set([
    "concept-source",
    "entity-query",
    "query-entity",
    "source-concept",
    "source-synthesis",
    "synthesis-source",
  ]).has(`${sourceType}-${targetType}`);
}

function isGraphInsightPage(page: RetrievalPageRecord): boolean {
  return !page.is_system_page && !["index", "log", "overview"].includes(page.system_page_key ?? "");
}

function createGraphInsightItem(
  input: Omit<GraphInsightItem, "id"> & { id?: string },
): GraphInsightItem {
  const identity = [
    input.insight_type,
    input.page_id ?? "",
    ...(input.page_ids ?? []),
    ...(input.reason_codes ?? []),
  ].join(":");

  return {
    ...input,
    id: input.id ?? createStableGraphInsightId(identity),
  };
}

function createStableGraphInsightId(...parts: readonly string[]): string {
  return `gins_${hashStable(parts.join(":")).slice(0, 24)}`;
}

function createGraphInsightSnapshot(
  pages: readonly RetrievalPageRecord[],
  edges: readonly RetrievalEdgeRecord[],
): GraphInsightSnapshotMetadata {
  return {
    algorithm: createGraphInsightAlgorithmMetadata(),
    edge_count: edges.length,
    graph_hash: hashStable(
      JSON.stringify({
        edges: edges.map((edge) => [
          edge.edge_id,
          edge.from_page_id,
          edge.to_page_id,
          edge.relation_type,
          edge.weight,
        ]),
        pages: pages.map((page) => [page.page_id, page.page_version_id, page.title, page.type]),
      }),
    ),
    node_count: pages.length,
  };
}

function normalizeGraphPageKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/gu, "-");
}

function hashStable(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function cloneGraphInsightsResponse(response: GraphInsightsResponse): GraphInsightsResponse {
  return JSON.parse(JSON.stringify(response)) as GraphInsightsResponse;
}

function toGraphInsightReason(edge: RetrievalEdgeRecord): GraphInsightReason {
  return {
    edge_id: edge.edge_id,
    relation_type: edge.relation_type,
    explanation: edge.explanation,
  };
}

function createReadyGraphInsightStatus(): GraphInsightStatus {
  return {
    failure_reason: null,
    source_job_id: null,
    started_at: null,
    state: "ready",
    updated_at: null,
  };
}

function createGraphInsightEmptyReasons(
  collections: Record<string, readonly GraphInsightItem[]>,
): Record<string, string> {
  const reasons: Record<string, string> = {};
  const defaults: Record<string, string> = {
    bridge_pages: "No bridge pages were detected.",
    communities: "The graph does not contain a connected community large enough to report.",
    isolated_pages: "No isolated pages were detected.",
    knowledge_gaps: "No knowledge gaps were detected.",
    sparse_pages: "No sparse pages were detected.",
    surprising_connections: "No surprising connections were detected.",
  };

  for (const [key, items] of Object.entries(collections)) {
    if (items.length === 0) {
      reasons[key] = defaults[key] ?? "No graph insight data was detected.";
    }
  }

  return reasons;
}

const contextBudgetCategoryOrder: readonly ContextBudgetCategory[] = [
  "system_pages",
  "direct_hits",
  "graph_expansions",
  "citations",
  "media_evidence",
  "metadata",
];

interface ContextSection {
  category: ContextBudgetCategory;
  content: string;
  estimatedTokens: number;
  page?: RetrievalPageRecord;
  resourceId: string;
  resourceType: ContextBudgetOmittedItem["resource_type"];
  sectionId: string;
  visibilityOrigin?: RetrievalVisibilityOrigin;
}

function createContextSection(
  page: RetrievalPageRecord,
  category: Extract<ContextBudgetCategory, "system_pages" | "direct_hits" | "graph_expansions">,
  result?: RetrievalResult,
): ContextSection {
  const targetedSection = selectTargetedContextSection(page, result);
  const content =
    targetedSection === null
      ? `# ${page.title}\n\n${page.markdown}`
      : `# ${page.title}\n\n${targetedSection}\n\n${page.markdown}`;

  return {
    category,
    page,
    content,
    estimatedTokens: estimateTokens(content),
    resourceId: page.page_id,
    resourceType: "page",
    sectionId: `${category}:${page.page_id}`,
    visibilityOrigin: page.visibility_origin ?? "canonical",
  };
}

function selectTargetedContextSection(
  page: RetrievalPageRecord,
  result: RetrievalResult | undefined,
): string | null {
  if (result === undefined) {
    return null;
  }

  const section = result.section.trim();
  const markdown = page.markdown.trim();

  if (section.length === 0 || section === markdown) {
    return null;
  }

  return section;
}

function pruneDuplicateContextPages(
  pages: readonly RetrievalPageRecord[],
  category: Extract<ContextBudgetCategory, "direct_hits" | "graph_expansions">,
): {
  pages: RetrievalPageRecord[];
  omittedItems: ContextBudgetOmittedItem[];
} {
  const seenPageIds = new Set<string>();
  const seenContextKeys = new Set<string>();
  const kept: RetrievalPageRecord[] = [];
  const omittedItems: ContextBudgetOmittedItem[] = [];

  for (const page of pages) {
    const key = createContextDuplicateKey(page);
    const duplicate = seenPageIds.has(page.page_id) || (key !== null && seenContextKeys.has(key));

    if (duplicate) {
      omittedItems.push({
        category,
        resource_type: "page",
        resource_id: page.page_id,
        estimated_tokens: estimateTokens(`# ${page.title}\n\n${page.markdown}`),
        reason: key === null ? "duplicate_context" : "duplicate_source_noise",
      });
      continue;
    }

    seenPageIds.add(page.page_id);
    if (key !== null) {
      seenContextKeys.add(key);
    }
    kept.push(page);
  }

  return {
    pages: kept,
    omittedItems,
  };
}

function createContextDuplicateKey(page: RetrievalPageRecord): string | null {
  const primaryDocumentId = page.source_refs[0]?.document_id;

  if (primaryDocumentId === undefined) {
    return null;
  }

  const titleKey = normalized(page.title);

  if (titleKey.length === 0) {
    return null;
  }

  return `${titleKey}:${primaryDocumentId}`;
}

function createCitationContextSection(citation: RetrievalCitation, index: number): ContextSection {
  const resourceId = `${citation.document_id}:${citation.locator ?? index}`;
  const content = `Citation: ${JSON.stringify(citation)}`;

  return {
    category: "citations",
    content,
    estimatedTokens: estimateTokens(content),
    resourceId,
    resourceType: "citation",
    sectionId: `citations:${resourceId}`,
    ...(citation.visibility_origin === undefined
      ? {}
      : { visibilityOrigin: citation.visibility_origin }),
  };
}

function createMediaEvidenceContextSection(
  evidence: RetrievalMediaEvidence,
  index: number,
): ContextSection {
  const resourceId = evidence.media_asset_id;
  const content = [
    "Image evidence:",
    `media_asset_id=${evidence.media_asset_id}`,
    `document_id=${evidence.document_id}`,
    evidence.locator === undefined ? null : `locator=${evidence.locator}`,
    evidence.caption === undefined ? null : `caption=${evidence.caption}`,
    `preview=${evidence.preview.endpoint}`,
  ]
    .filter((item): item is string => item !== null)
    .join("\n");

  return {
    category: "media_evidence",
    content,
    estimatedTokens: estimateTokens(content),
    resourceId,
    resourceType: "media_asset",
    sectionId: `media_evidence:${resourceId}:${index}`,
    ...(evidence.visibility_origin === undefined
      ? {}
      : { visibilityOrigin: evidence.visibility_origin }),
  };
}

function toContextPackEntry(section: ContextSection): ContextPackEntry {
  return {
    section_id: section.sectionId,
    category: section.category,
    resource_type: section.resourceType,
    resource_id: section.resourceId,
    ...(section.page === undefined
      ? {}
      : {
          page_id: section.page.page_id,
          page_version_id: section.page.page_version_id,
        }),
    ...(section.visibilityOrigin === undefined || section.visibilityOrigin === "canonical"
      ? {}
      : { visibility_origin: section.visibilityOrigin }),
  };
}

function estimateCategoryTokens(
  sections: readonly ContextSection[],
  category: ContextBudgetCategory,
): number {
  return sections
    .filter((section) => section.category === category)
    .reduce((total, section) => total + section.estimatedTokens, 0);
}

function allocateContextBudget(budgetTokens: number): Record<ContextBudgetCategory, number> {
  const safeBudget = calculateAvailableContextTokens(budgetTokens);
  const system = Math.floor(safeBudget * 0.12);
  const direct = Math.floor(safeBudget * 0.52);
  const graph = Math.floor(safeBudget * 0.21);
  const citations = Math.floor(safeBudget * 0.1);
  const mediaEvidence = Math.floor(safeBudget * 0.05);
  const allocated = system + direct + graph + citations + mediaEvidence;

  return {
    system_pages: system,
    direct_hits: direct + Math.max(0, safeBudget - allocated),
    graph_expansions: graph,
    citations,
    media_evidence: mediaEvidence,
    metadata: 0,
  };
}

function calculateResponseReserveTokens(budgetTokens: number): number {
  return Math.floor(Math.max(0, budgetTokens) * 0.15);
}

function calculateAvailableContextTokens(budgetTokens: number): number {
  const safeBudget = Math.max(0, Math.floor(budgetTokens));

  return Math.max(0, safeBudget - calculateResponseReserveTokens(safeBudget));
}

function calculatePerPageCapTokens(budgetTokens: number): number {
  const available = calculateAvailableContextTokens(budgetTokens);

  return Math.max(1, Math.min(available, Math.floor(available * 0.35)));
}

function createContextBudgetUsage(
  allocations: Record<ContextBudgetCategory, number>,
): Record<ContextBudgetCategory, ContextBudgetCategoryUsage> {
  return Object.fromEntries(
    contextBudgetCategoryOrder.map((category) => [
      category,
      {
        allocated_tokens: allocations[category],
        estimated_tokens: 0,
        used_tokens: 0,
        omitted_item_count: 0,
        truncated: false,
      },
    ]),
  ) as Record<ContextBudgetCategory, ContextBudgetCategoryUsage>;
}

function toOmittedContextItem(section: ContextSection): ContextBudgetOmittedItem {
  return {
    category: section.category,
    resource_type: section.resourceType,
    resource_id: section.resourceId,
    estimated_tokens: section.estimatedTokens,
    reason: contextOmissionReason(section),
  };
}

function contextOmissionReason(section: ContextSection): ContextBudgetOmittedItem["reason"] {
  if (section.category === "graph_expansions") {
    return "graph_neighbor_after_source_evidence";
  }

  if (section.category === "direct_hits") {
    return "lower_source_match";
  }

  if (section.category === "citations" || section.category === "media_evidence") {
    return "missing_locator_evidence";
  }

  return "budget_exhausted";
}

function sortCitationsByEvidenceExactness(
  citations: readonly RetrievalCitation[],
): RetrievalCitation[] {
  return [...citations].sort(
    (left, right) =>
      citationExactnessRank(left.locator_status) - citationExactnessRank(right.locator_status),
  );
}

function citationExactnessRank(status: RetrievalCitationLocatorStatus | undefined): number {
  switch (status) {
    case "resolved":
      return 0;
    case "ambiguous":
      return 1;
    case "not_provided":
      return 2;
    case "not_found":
      return 3;
    case "unsupported":
      return 4;
    default:
      return 5;
  }
}

function countOmittedContextReasons(
  items: readonly ContextBudgetOmittedItem[],
): Record<ContextBudgetOmittedItem["reason"], number> {
  return {
    budget_exceeded: items.filter((item) => item.reason === "budget_exceeded").length,
    budget_exhausted: items.filter((item) => item.reason === "budget_exhausted").length,
    duplicate_context: items.filter((item) => item.reason === "duplicate_context").length,
    duplicate_source_noise: items.filter((item) => item.reason === "duplicate_source_noise").length,
    graph_neighbor_after_source_evidence: items.filter(
      (item) => item.reason === "graph_neighbor_after_source_evidence",
    ).length,
    lower_source_match: items.filter((item) => item.reason === "lower_source_match").length,
    missing_locator_evidence: items.filter((item) => item.reason === "missing_locator_evidence")
      .length,
  };
}

function estimateTokens(value: string): number {
  return value.split(/\s+/u).filter(Boolean).length;
}

function truncateToTokenBudget(value: string, budgetTokens: number): string {
  if (budgetTokens <= 0) {
    return "";
  }

  const tokens = value.split(/\s+/u).filter(Boolean);

  return tokens.slice(0, budgetTokens).join(" ");
}

function pruneDuplicateFusionCandidates(results: readonly RetrievalResult[]): {
  results: RetrievalResult[];
  prunedPageIds: string[];
} {
  const seen = new Set<string>();
  const prunedPageIds: string[] = [];
  const kept: RetrievalResult[] = [];

  for (const result of results) {
    const key = createDuplicateCandidateKey(result);

    if (key !== null && seen.has(key)) {
      prunedPageIds.push(result.page_id);
      continue;
    }

    if (key !== null) {
      seen.add(key);
    }

    kept.push(result);
  }

  return {
    results: kept,
    prunedPageIds,
  };
}

function createDuplicateCandidateKey(result: RetrievalResult): string | null {
  const primaryDocumentId = result.citations[0]?.document_id;

  if (primaryDocumentId === undefined) {
    return null;
  }

  const titleKey = normalized(result.title);

  if (titleKey.length === 0) {
    return null;
  }

  return `${titleKey}:${primaryDocumentId}:${result.section_id ?? "page"}`;
}

function fuseByReciprocalRank(
  lexicalResults: readonly RetrievalResult[],
  semanticResults: readonly RetrievalResult[],
  options: { preserveSectionCandidates?: boolean } = {},
): RetrievalResult[] {
  const byCandidateKey = new Map<string, RetrievalResult>();
  const rankScoreByCandidateKey = new Map<string, number>();

  for (const result of lexicalResults) {
    mergeFusionCandidate(byCandidateKey, rankScoreByCandidateKey, result, result.lexical_rank, {
      preserveSectionCandidates: options.preserveSectionCandidates === true,
    });
  }

  for (const result of semanticResults) {
    mergeFusionCandidate(byCandidateKey, rankScoreByCandidateKey, result, result.semantic_rank, {
      preserveSectionCandidates: options.preserveSectionCandidates === true,
    });
  }

  const candidates = [...byCandidateKey.values()];
  const signalByCandidateKey = new Map(
    candidates.map((result) => [
      createFusionCandidateKey(result, options.preserveSectionCandidates === true),
      createFusionSignals(
        result,
        rankScoreByCandidateKey.get(
          createFusionCandidateKey(result, options.preserveSectionCandidates === true),
        ) ?? 0,
      ),
    ]),
  );
  const maxSignals = createMaxFusionSignals([...signalByCandidateKey.values()]);

  return candidates
    .map((result) => {
      const fusionScore = calculateFusionScore(
        signalByCandidateKey.get(
          createFusionCandidateKey(result, options.preserveSectionCandidates === true),
        ) ?? createEmptyFusionSignals(),
        maxSignals,
      );
      const scoreContribution = mergeScoreContribution(result.score_contribution, {
        graph: 0,
        relation_weight: 0,
        fusion: fusionScore,
      });

      return {
        ...result,
        score: {
          ...result.score,
          rerank: fusionScore,
          fusion: fusionScore,
        },
        ...(scoreContribution === undefined ? {} : { score_contribution: scoreContribution }),
        retrieval_reason: `${result.retrieval_reason} Fused lexical and semantic ranks with normalized metadata, graph, version, and source evidence signals.`,
      };
    })
    .sort(compareFusionResults);
}

interface SourcePrecisionControlInput {
  query: string;
  results: readonly RetrievalResult[];
  topK: number;
  preferredAnchorSourceDocumentIds?: readonly string[];
}

interface SourcePrecisionControlOutput {
  results: RetrievalResult[];
  diagnostics: SourcePrecisionControlDiagnostics;
}

interface SourcePrecisionAnchor {
  documentId: string;
  hasStrongEvidence: boolean;
  identityCoverage: number;
  score: number;
  sourceAlignedCount: number;
}

const SOURCE_PRECISION_FUSION_BOOST = 1.25;
const SOURCE_PRECISION_SOURCE_EVIDENCE_BOOST = 4;
const SOURCE_PRECISION_CROSS_SOURCE_DEMOTION = 0.25;
const SOURCE_PRECISION_MIN_ANCHOR_SCORE = 5;
const SOURCE_PRECISION_MIN_SOURCE_ALIGNED_COUNT = 2;
const SOURCE_PRECISION_STRONG_ANCHOR_FUSION_BOOST = 8;
const SOURCE_PRECISION_TOP_FIVE_LIMIT = 5;
const SOURCE_PRECISION_LONG_PHRASE_MIN_LENGTH = 8;
const SOURCE_PRECISION_STRONG_TITLE_COVERAGE = 0.85;
const SOURCE_PRECISION_STRONG_IDENTITY_COVERAGE = 0.5;
const SOURCE_PRECISION_IDENTITY_ANCHOR_SCORE_WEIGHT = 14;
const SOURCE_PRECISION_IDENTITY_FUSION_BOOST = 8;

function applySourcePrecisionControl(
  input: SourcePrecisionControlInput,
): SourcePrecisionControlOutput {
  if (input.results.length <= 1) {
    return {
      results: [...input.results],
      diagnostics: createSkippedSourcePrecisionDiagnostics("not_enough_candidates"),
    };
  }

  const query = createLexicalQuery(input.query);
  if (!isSourcePrecisionQuerySpecific(query)) {
    return {
      results: [...input.results],
      diagnostics: createSkippedSourcePrecisionDiagnostics("query_not_specific"),
    };
  }

  const anchor =
    input.preferredAnchorSourceDocumentIds === undefined
      ? selectSourcePrecisionAnchor(input.results, query)
      : selectPreferredSourcePrecisionAnchor(input.results, input.preferredAnchorSourceDocumentIds);

  if (anchor === null) {
    return {
      results: [...input.results],
      diagnostics: createSkippedSourcePrecisionDiagnostics("no_source_identity_anchor"),
    };
  }

  const anchorDocumentIds = new Set([anchor.documentId]);
  const sourceAlignedResults = input.results.filter((result) =>
    resultSharesSourceDocument(result, anchorDocumentIds),
  );

  if (sourceAlignedResults.length < SOURCE_PRECISION_MIN_SOURCE_ALIGNED_COUNT) {
    if (anchor.hasStrongEvidence) {
      return applySourcePrecisionBoostToAnchorOnly(input, anchorDocumentIds);
    }

    return {
      results: [...input.results],
      diagnostics: createSkippedSourcePrecisionDiagnostics("not_enough_source_aligned_candidates"),
    };
  }

  const originalIndexByPageId = new Map(
    input.results.map((result, index) => [result.page_id, index]),
  );
  const boostedPageIds: string[] = [];
  const demotedPageIds: string[] = [];
  const precisionResults = input.results.map((result) => {
    const sharesAnchorSource = resultSharesSourceDocument(result, anchorDocumentIds);

    if (sharesAnchorSource) {
      boostedPageIds.push(result.page_id);
      return applySourcePrecisionBoost(
        result,
        query,
        anchor.hasStrongEvidence ? SOURCE_PRECISION_STRONG_ANCHOR_FUSION_BOOST : 0,
      );
    }

    const demoted = applyCrossSourcePrecisionDemotion(result);
    if (demoted !== result) {
      demotedPageIds.push(result.page_id);
    }

    return demoted;
  });
  const sortedResults = precisionResults.sort(
    (left, right) =>
      compareSourceAlignedResults(left, right, anchorDocumentIds) ||
      compareFusionResults(left, right) ||
      (originalIndexByPageId.get(left.page_id) ?? 0) -
        (originalIndexByPageId.get(right.page_id) ?? 0),
  );
  const topFiveLimit = Math.min(input.topK, SOURCE_PRECISION_TOP_FIVE_LIMIT);
  const topFiveSourceAlignedCount = sortedResults
    .slice(0, topFiveLimit)
    .filter((result) => resultSharesSourceDocument(result, anchorDocumentIds)).length;

  return {
    results: sortedResults,
    diagnostics: {
      status: "applied",
      anchor_source_document_ids: [anchor.documentId],
      boosted_page_ids: boostedPageIds,
      demoted_page_ids: demotedPageIds,
      top_five_source_aligned_count: topFiveSourceAlignedCount,
    },
  };
}

function applySourcePrecisionBoostToAnchorOnly(
  input: SourcePrecisionControlInput,
  anchorDocumentIds: ReadonlySet<string>,
): SourcePrecisionControlOutput {
  const query = createLexicalQuery(input.query);
  const originalIndexByPageId = new Map(
    input.results.map((result, index) => [result.page_id, index]),
  );
  const boostedPageIds: string[] = [];
  const precisionResults = input.results.map((result) => {
    if (!resultSharesSourceDocument(result, anchorDocumentIds)) {
      return result;
    }

    boostedPageIds.push(result.page_id);

    return applySourcePrecisionBoost(result, query, SOURCE_PRECISION_STRONG_ANCHOR_FUSION_BOOST);
  });
  const sortedResults = precisionResults.sort(
    (left, right) =>
      compareSourceAlignedResults(left, right, anchorDocumentIds) ||
      compareFusionResults(left, right) ||
      (originalIndexByPageId.get(left.page_id) ?? 0) -
        (originalIndexByPageId.get(right.page_id) ?? 0),
  );
  const topFiveLimit = Math.min(input.topK, SOURCE_PRECISION_TOP_FIVE_LIMIT);
  const topFiveSourceAlignedCount = sortedResults
    .slice(0, topFiveLimit)
    .filter((result) => resultSharesSourceDocument(result, anchorDocumentIds)).length;

  return {
    results: sortedResults,
    diagnostics: {
      status: "applied",
      anchor_source_document_ids: [...anchorDocumentIds],
      boosted_page_ids: boostedPageIds,
      demoted_page_ids: [],
      top_five_source_aligned_count: topFiveSourceAlignedCount,
    },
  };
}

function selectSourcePrecisionAnchor(
  results: readonly RetrievalResult[],
  query: LexicalQuery,
): SourcePrecisionAnchor | null {
  const groupByDocumentId = new Map<string, SourcePrecisionAnchor>();
  const queryHasIdentityTerms = hasSourceIdentityTerms(query);

  for (const result of results) {
    const sourceDocumentIds = getResultSourceDocumentIds(result);
    if (sourceDocumentIds.length === 0) {
      continue;
    }

    const anchorScore = calculateSourcePrecisionAnchorScore(result, query);
    const hasStrongEvidence = hasStrongSourcePrecisionAnchorEvidence(result, query);
    const identityCoverage = calculateIdentityTermCoverage(result, query);

    for (const documentId of sourceDocumentIds) {
      const previous = groupByDocumentId.get(documentId);
      groupByDocumentId.set(documentId, {
        documentId,
        hasStrongEvidence: (previous?.hasStrongEvidence ?? false) || hasStrongEvidence,
        identityCoverage: Math.max(previous?.identityCoverage ?? 0, identityCoverage),
        score: Math.max(previous?.score ?? 0, anchorScore),
        sourceAlignedCount: (previous?.sourceAlignedCount ?? 0) + 1,
      });
    }
  }

  const scoredAnchors = [...groupByDocumentId.values()]
    .filter((anchor) => anchor.score >= SOURCE_PRECISION_MIN_ANCHOR_SCORE)
    .sort(
      (left, right) =>
        (queryHasIdentityTerms ? right.identityCoverage - left.identityCoverage : 0) ||
        right.score - left.score ||
        right.sourceAlignedCount - left.sourceAlignedCount ||
        left.documentId.localeCompare(right.documentId),
    );
  const strongAnchors = scoredAnchors.filter((anchor) => anchor.hasStrongEvidence);
  const strongestStrongAnchor = strongAnchors[0] ?? null;
  const eligibleAnchors = scoredAnchors
    .filter((anchor) => anchor.sourceAlignedCount >= SOURCE_PRECISION_MIN_SOURCE_ALIGNED_COUNT)
    .slice();
  const eligibleStrongAnchor = strongAnchors.find(
    (anchor) => anchor.sourceAlignedCount >= SOURCE_PRECISION_MIN_SOURCE_ALIGNED_COUNT,
  );

  if (eligibleStrongAnchor !== undefined) {
    return eligibleStrongAnchor;
  }

  if (strongestStrongAnchor !== null) {
    return strongestStrongAnchor;
  }

  return eligibleAnchors[0] ?? null;
}

function selectPreferredSourcePrecisionAnchor(
  results: readonly RetrievalResult[],
  sourceDocumentIds: readonly string[],
): SourcePrecisionAnchor | null {
  const availableSourceDocumentIds = new Set(
    results.flatMap((result) => getResultSourceDocumentIds(result)),
  );
  const documentId = sourceDocumentIds.find((item) => availableSourceDocumentIds.has(item));

  if (documentId === undefined) {
    return null;
  }

  return {
    documentId,
    hasStrongEvidence: true,
    identityCoverage: 1,
    score: SOURCE_PRECISION_MIN_ANCHOR_SCORE,
    sourceAlignedCount: results.filter((result) =>
      getResultSourceDocumentIds(result).includes(documentId),
    ).length,
  };
}

function calculateSourcePrecisionAnchorScore(result: RetrievalResult, query: LexicalQuery): number {
  const coverage = calculateResultQueryCoverage(result, query);
  const titleCoverage = calculateTextQueryCoverage(result.title, query);
  const phraseOverlap = hasMeaningfulPhraseOverlap(result, query) ? 1 : 0;
  const identityCoverage = calculateIdentityTermCoverage(result, query);
  const contribution = result.score_contribution;

  return (
    coverage * 8 +
    titleCoverage * 4 +
    phraseOverlap * 6 +
    identityCoverage * SOURCE_PRECISION_IDENTITY_ANCHOR_SCORE_WEIGHT +
    Math.min(positiveNumber(contribution?.metadata ?? 0), 6) * 0.25 +
    Math.min(positiveNumber(contribution?.version ?? 0), 3) * 0.5 +
    Math.min(positiveNumber(contribution?.source_evidence ?? result.citations.length), 3) * 0.25 +
    Math.min(positiveNumber(contribution?.lexical ?? result.score.keyword), 20) / 20
  );
}

function hasStrongSourcePrecisionAnchorEvidence(
  result: RetrievalResult,
  query: LexicalQuery,
): boolean {
  if (hasSourceIdentityTerms(query)) {
    return (
      calculateIdentityTermCoverage(result, query) >= SOURCE_PRECISION_STRONG_IDENTITY_COVERAGE
    );
  }

  if (hasMeaningfulPhraseOverlap(result, query)) {
    return true;
  }

  const searchable = normalized(createSourcePrecisionSearchText(result));
  const hasLongMatchedPhrase = query.phraseCandidates
    .filter((phrase) => Array.from(phrase).length >= SOURCE_PRECISION_LONG_PHRASE_MIN_LENGTH)
    .some((phrase) => searchable.includes(phrase));

  if (hasLongMatchedPhrase) {
    return true;
  }

  if (hasCjkText(result.title) || hasCjkText(query.phrase)) {
    return false;
  }

  return calculateTextQueryCoverage(result.title, query) >= SOURCE_PRECISION_STRONG_TITLE_COVERAGE;
}

function applySourcePrecisionBoost(
  result: RetrievalResult,
  query: LexicalQuery,
  extraFusionBoost = 0,
): RetrievalResult {
  const coverageBoost = calculateResultQueryCoverage(result, query) * 0.35;
  const identityBoost =
    calculateIdentityTermCoverage(result, query) * SOURCE_PRECISION_IDENTITY_FUSION_BOOST;
  const fusionBoost =
    SOURCE_PRECISION_FUSION_BOOST + coverageBoost + identityBoost + extraFusionBoost;
  const existingSourceEvidence = positiveNumber(
    result.score_contribution?.source_evidence ?? result.citations.length,
  );
  const scoreContribution = mergeScoreContribution(result.score_contribution, {
    graph: 0,
    relation_weight: 0,
    source_evidence: existingSourceEvidence + SOURCE_PRECISION_SOURCE_EVIDENCE_BOOST,
    fusion: (result.score_contribution?.fusion ?? result.score.fusion ?? 0) + fusionBoost,
  });

  return {
    ...result,
    score: {
      ...result.score,
      fusion: (result.score.fusion ?? 0) + fusionBoost,
      rerank:
        result.score.rerank === null ? result.score.rerank : result.score.rerank + fusionBoost,
    },
    ...(scoreContribution === undefined ? {} : { score_contribution: scoreContribution }),
    retrieval_reason: `${result.retrieval_reason} Boosted by shared source document precision control.`,
  };
}

function applyCrossSourcePrecisionDemotion(result: RetrievalResult): RetrievalResult {
  if (getResultSourceDocumentIds(result).length === 0) {
    return result;
  }

  const scoreContribution = mergeScoreContribution(result.score_contribution, {
    graph: 0,
    relation_weight: 0,
    fusion: Math.max(
      0,
      (result.score_contribution?.fusion ?? result.score.fusion ?? 0) -
        SOURCE_PRECISION_CROSS_SOURCE_DEMOTION,
    ),
  });

  return {
    ...result,
    score: {
      ...result.score,
      fusion: Math.max(0, (result.score.fusion ?? 0) - SOURCE_PRECISION_CROSS_SOURCE_DEMOTION),
      rerank:
        result.score.rerank === null
          ? result.score.rerank
          : Math.max(0, result.score.rerank - SOURCE_PRECISION_CROSS_SOURCE_DEMOTION),
    },
    ...(scoreContribution === undefined ? {} : { score_contribution: scoreContribution }),
    retrieval_reason: `${result.retrieval_reason} Demoted below stronger source identity evidence.`,
  };
}

function mergeSourcePrecisionControlDiagnostics(
  left: SourcePrecisionControlDiagnostics,
  right: SourcePrecisionControlDiagnostics,
): SourcePrecisionControlDiagnostics {
  if (left.status === "skipped") {
    return right;
  }

  if (right.status === "skipped") {
    return left;
  }

  return {
    status: "applied",
    anchor_source_document_ids: uniqueStrings([
      ...left.anchor_source_document_ids,
      ...right.anchor_source_document_ids,
    ]),
    boosted_page_ids: uniqueStrings([...left.boosted_page_ids, ...right.boosted_page_ids]),
    demoted_page_ids: uniqueStrings([...left.demoted_page_ids, ...right.demoted_page_ids]),
    top_five_source_aligned_count: right.top_five_source_aligned_count,
  };
}

function createSkippedSourcePrecisionDiagnostics(
  reason: string,
): SourcePrecisionControlDiagnostics {
  return {
    status: "skipped",
    anchor_source_document_ids: [],
    boosted_page_ids: [],
    demoted_page_ids: [],
    top_five_source_aligned_count: 0,
    reason,
  };
}

function isSourcePrecisionQuerySpecific(query: LexicalQuery): boolean {
  const specificTokenCount = query.tokens.filter(
    (term) => !isGenericStructuralHeadingTerm(term),
  ).length;

  if (hasSourceIdentityTerms(query)) {
    return true;
  }

  if (hasCjkText(query.phrase)) {
    return Array.from(query.phrase).length >= 4;
  }

  return (
    specificTokenCount >= 4 ||
    Array.from(query.phrase).length >= SOURCE_PRECISION_LONG_PHRASE_MIN_LENGTH * 2
  );
}

function resultSharesSourceDocument(
  result: RetrievalResult,
  sourceDocumentIds: ReadonlySet<string>,
): boolean {
  return getResultSourceDocumentIds(result).some((documentId) => sourceDocumentIds.has(documentId));
}

function compareSourceAlignedResults(
  left: RetrievalResult,
  right: RetrievalResult,
  sourceDocumentIds: ReadonlySet<string>,
): number {
  const leftSharesSource = resultSharesSourceDocument(left, sourceDocumentIds);
  const rightSharesSource = resultSharesSourceDocument(right, sourceDocumentIds);

  if (leftSharesSource === rightSharesSource) {
    return 0;
  }

  return leftSharesSource ? -1 : 1;
}

function calculateResultQueryCoverage(result: RetrievalResult, query: LexicalQuery): number {
  return calculateTextQueryCoverage(createSourcePrecisionSearchText(result), query);
}

function hasSourceIdentityTerms(query: LexicalQuery): boolean {
  return query.identityTerms.some((term) => !isGenericStructuralHeadingTerm(term));
}

function calculateIdentityTermCoverage(result: RetrievalResult, query: LexicalQuery): number {
  const searchable = normalized(createSourcePrecisionSearchText(result));
  const identityTerms = query.identityTerms.filter((term) => !isGenericStructuralHeadingTerm(term));

  if (identityTerms.length === 0) {
    return 0;
  }

  const matchedTermCount = identityTerms.filter((term) => searchable.includes(term)).length;

  return matchedTermCount / identityTerms.length;
}

function hasCjkText(value: string): boolean {
  return /[\u3400-\u9fff]/u.test(value);
}

function calculateTextQueryCoverage(value: string, query: LexicalQuery): number {
  const searchable = normalized(value);
  const terms = query.tokens.filter((term) => !isGenericStructuralHeadingTerm(term));

  if (terms.length === 0) {
    return query.phrase.length > 0 && searchable.includes(query.phrase) ? 1 : 0;
  }

  const matchedTermCount = terms.filter((term) => searchable.includes(term)).length;

  return matchedTermCount / terms.length;
}

function hasMeaningfulPhraseOverlap(result: RetrievalResult, query: LexicalQuery): boolean {
  if (query.phrase.length === 0) {
    return false;
  }

  const searchable = normalized(createSourcePrecisionSearchText(result));
  const normalizedTitle = normalized(result.title.trim()).replace(trimPunctuationPattern, "");

  if (searchable.includes(query.phrase)) {
    return true;
  }

  if (hasCjkText(result.title) || hasCjkText(query.phrase)) {
    return false;
  }

  return (
    Array.from(normalizedTitle).length >= SOURCE_PRECISION_LONG_PHRASE_MIN_LENGTH &&
    query.phrase.includes(normalizedTitle)
  );
}

function createSourcePrecisionSearchText(result: RetrievalResult): string {
  const displayMetadata =
    result.display_metadata === undefined ? "" : JSON.stringify(result.display_metadata);

  return [
    result.title,
    result.type,
    result.section,
    displayMetadata,
    ...result.match_reasons.flatMap((reason) => [reason.field, reason.term]),
    ...result.citations.flatMap((citation) => [
      citation.document_id,
      citation.source_anchor_id ?? "",
      citation.parsed_content_id ?? "",
      citation.locator ?? "",
      citation.evidence_kind ?? "",
    ]),
    ...(result.source_refs ?? []).map((sourceRef) => sourceRef.document_id),
  ].join(" ");
}

function getResultSourceDocumentIds(result: RetrievalResult): string[] {
  const values = new Set<string>();

  for (const documentId of result.source_document_ids) {
    values.add(documentId);
  }

  for (const citation of result.citations) {
    values.add(citation.document_id);
  }

  for (const sourceRef of result.source_refs ?? []) {
    values.add(sourceRef.document_id);
  }

  const displaySourceIds = result.display_metadata?.source_document_ids;

  if (typeof displaySourceIds === "string") {
    values.add(displaySourceIds);
  } else if (Array.isArray(displaySourceIds)) {
    for (const sourceId of displaySourceIds) {
      values.add(sourceId);
    }
  }

  return [...values];
}

function mergeFusionCandidate(
  byCandidateKey: Map<string, RetrievalResult>,
  rankScoreByCandidateKey: Map<string, number>,
  result: RetrievalResult,
  rank: number | null,
  options: { preserveSectionCandidates?: boolean } = {},
): void {
  const candidateKey = createFusionCandidateKey(result, options.preserveSectionCandidates === true);
  const previous = byCandidateKey.get(candidateKey);
  const score = rank === null ? 0 : 1 / (60 + rank);

  rankScoreByCandidateKey.set(
    candidateKey,
    (rankScoreByCandidateKey.get(candidateKey) ?? 0) + score,
  );

  if (previous === undefined) {
    byCandidateKey.set(candidateKey, cloneRetrievalResult(result));
    return;
  }

  const scoreContribution = mergeScoreContribution(
    previous.score_contribution,
    result.score_contribution,
  );

  byCandidateKey.set(candidateKey, {
    ...previous,
    lexical_rank: previous.lexical_rank ?? result.lexical_rank,
    semantic_rank: previous.semantic_rank ?? result.semantic_rank,
    score: {
      keyword: Math.max(previous.score.keyword, result.score.keyword),
      semantic: maxNullable(previous.score.semantic, result.score.semantic),
      graph: maxNullable(previous.score.graph, result.score.graph),
      rerank: previous.score.rerank,
    },
    graph_signals: [...previous.graph_signals, ...result.graph_signals],
    match_reasons: [...previous.match_reasons, ...result.match_reasons],
    citations: dedupeCitations([...previous.citations, ...result.citations]),
    media_evidence: dedupeMediaEvidence([...previous.media_evidence, ...result.media_evidence]),
    source_document_ids: uniqueStrings([
      ...previous.source_document_ids,
      ...result.source_document_ids,
    ]),
    ...((previous.display_metadata ?? result.display_metadata) === undefined
      ? {}
      : { display_metadata: previous.display_metadata ?? result.display_metadata }),
    ...(scoreContribution === undefined ? {} : { score_contribution: scoreContribution }),
  });
}

function createFusionCandidateKey(
  result: RetrievalResult,
  preserveSectionCandidates: boolean,
): string {
  return preserveSectionCandidates ? (result.section_id ?? result.page_id) : result.page_id;
}

interface FusionSignals {
  rank: number;
  lexical: number;
  semantic: number;
  metadata: number;
  graph: number;
  sourceEvidence: number;
  version: number;
}

const fusionSignalWeights: FusionSignals = {
  rank: 0.34,
  lexical: 0.22,
  semantic: 0.18,
  metadata: 0.12,
  graph: 0.06,
  sourceEvidence: 0.04,
  version: 0.04,
};

function createFusionSignals(result: RetrievalResult, rankScore: number): FusionSignals {
  const contribution = result.score_contribution;

  return {
    rank: rankScore,
    lexical: positiveNumber(contribution?.lexical ?? result.score.keyword),
    semantic: positiveNumber(contribution?.semantic ?? result.score.semantic ?? 0),
    metadata: Math.min(
      positiveNumber(contribution?.metadata ?? calculateMetadataContribution(result.match_reasons)),
      6,
    ),
    graph: positiveNumber(contribution?.graph ?? result.score.graph ?? 0),
    sourceEvidence: Math.min(
      positiveNumber(contribution?.source_evidence ?? result.citations.length),
      3,
    ),
    version: Math.min(positiveNumber(contribution?.version ?? 0), 1),
  };
}

function createEmptyFusionSignals(): FusionSignals {
  return {
    rank: 0,
    lexical: 0,
    semantic: 0,
    metadata: 0,
    graph: 0,
    sourceEvidence: 0,
    version: 0,
  };
}

function createMaxFusionSignals(signals: readonly FusionSignals[]): FusionSignals {
  return signals.reduce<FusionSignals>(
    (maxSignals, signal) => ({
      rank: Math.max(maxSignals.rank, signal.rank),
      lexical: Math.max(maxSignals.lexical, signal.lexical),
      semantic: Math.max(maxSignals.semantic, signal.semantic),
      metadata: Math.max(maxSignals.metadata, signal.metadata),
      graph: Math.max(maxSignals.graph, signal.graph),
      sourceEvidence: Math.max(maxSignals.sourceEvidence, signal.sourceEvidence),
      version: Math.max(maxSignals.version, signal.version),
    }),
    createEmptyFusionSignals(),
  );
}

function calculateFusionScore(signal: FusionSignals, maxSignals: FusionSignals): number {
  const weightedSignals = [
    ["rank", signal.rank, maxSignals.rank, fusionSignalWeights.rank],
    ["lexical", signal.lexical, maxSignals.lexical, fusionSignalWeights.lexical],
    ["semantic", signal.semantic, maxSignals.semantic, fusionSignalWeights.semantic],
    ["metadata", signal.metadata, maxSignals.metadata, fusionSignalWeights.metadata],
    ["graph", signal.graph, maxSignals.graph, fusionSignalWeights.graph],
    [
      "sourceEvidence",
      signal.sourceEvidence,
      maxSignals.sourceEvidence,
      fusionSignalWeights.sourceEvidence,
    ],
    ["version", signal.version, maxSignals.version, fusionSignalWeights.version],
  ] as const;
  let score = 0;
  let activeWeight = 0;

  for (const [, value, maxValue, weight] of weightedSignals) {
    if (maxValue <= 0) {
      continue;
    }

    activeWeight += weight;
    score += normalizeScore(value, maxValue) * weight;
  }

  if (activeWeight <= 0) {
    return 0;
  }

  return Number((score / activeWeight).toFixed(6));
}

function normalizeScore(value: number, maxValue: number): number {
  if (maxValue <= 0) {
    return 0;
  }

  return Math.min(Math.max(value / maxValue, 0), 1);
}

function positiveNumber(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }

  return value;
}

function sortResultsForContext(results: readonly RetrievalResult[]): RetrievalResult[] {
  const originalIndexByPageId = new Map(results.map((result, index) => [result.page_id, index]));

  return [...results].sort((left, right) => {
    const priorityDifference =
      calculateContextSourceVersionPriority(right) - calculateContextSourceVersionPriority(left);

    if (priorityDifference !== 0) {
      return priorityDifference;
    }

    const scoreDifference = calculateContextResultScore(right) - calculateContextResultScore(left);

    if (scoreDifference !== 0) {
      return scoreDifference;
    }

    return (
      (originalIndexByPageId.get(left.page_id) ?? 0) -
      (originalIndexByPageId.get(right.page_id) ?? 0)
    );
  });
}

function calculateContextSourceVersionPriority(result: RetrievalResult): number {
  const contribution = result.score_contribution;

  return (
    Math.min(positiveNumber(contribution?.metadata ?? 0), 8) * 3 +
    Math.min(positiveNumber(contribution?.version ?? 0), 3) * 4 +
    Math.min(positiveNumber(contribution?.source_evidence ?? result.citations.length), 3)
  );
}

function calculateContextResultScore(result: RetrievalResult): number {
  return Math.max(
    positiveNumber(result.score.fusion ?? 0),
    positiveNumber(result.score.rerank ?? 0),
    positiveNumber(result.score.keyword),
    positiveNumber(result.score.semantic ?? 0),
    positiveNumber(result.score.graph ?? 0),
  );
}

function compareFusionResults(left: RetrievalResult, right: RetrievalResult): number {
  const fusionDifference = (right.score.fusion ?? 0) - (left.score.fusion ?? 0);

  if (fusionDifference !== 0) {
    return fusionDifference;
  }

  return (
    compareNullableRanks(left.lexical_rank, right.lexical_rank) ||
    compareNullableRanks(left.semantic_rank, right.semantic_rank) ||
    left.title.localeCompare(right.title) ||
    left.page_id.localeCompare(right.page_id)
  );
}

function compareNullableRanks(left: number | null, right: number | null): number {
  if (left === null && right === null) {
    return 0;
  }

  if (left === null) {
    return 1;
  }

  if (right === null) {
    return -1;
  }

  return left - right;
}

function mergeScoreContribution(
  left: RetrievalScoreContribution | undefined,
  right: RetrievalScoreContribution | undefined,
): RetrievalScoreContribution | undefined {
  if (left === undefined) {
    return right === undefined ? undefined : { ...right };
  }

  if (right === undefined) {
    return { ...left };
  }

  const merged: RetrievalScoreContribution = {
    graph: Math.max(left.graph, right.graph),
    relation_weight: Math.max(left.relation_weight, right.relation_weight),
  };
  const lexical = maxOptional(left.lexical, right.lexical);
  const semantic = maxOptional(left.semantic, right.semantic);
  const metadata = maxOptional(left.metadata, right.metadata);
  const rerank = maxOptional(left.rerank, right.rerank);
  const fusion = maxOptional(left.fusion, right.fusion);
  const sourceEvidence = maxOptional(left.source_evidence, right.source_evidence);
  const version = maxOptional(left.version, right.version);

  if (lexical !== undefined) {
    merged.lexical = lexical;
  }
  if (semantic !== undefined) {
    merged.semantic = semantic;
  }
  if (metadata !== undefined) {
    merged.metadata = metadata;
  }
  if (rerank !== undefined) {
    merged.rerank = rerank;
  }
  if (fusion !== undefined) {
    merged.fusion = fusion;
  }
  if (sourceEvidence !== undefined) {
    merged.source_evidence = sourceEvidence;
  }
  if (version !== undefined) {
    merged.version = version;
  }

  return merged;
}

function maxOptional(left: number | undefined, right: number | undefined): number | undefined {
  if (left === undefined) {
    return right;
  }

  if (right === undefined) {
    return left;
  }

  return Math.max(left, right);
}

function maxNullable(left: number | null, right: number | null): number | null {
  if (left === null) {
    return right;
  }

  if (right === null) {
    return left;
  }

  return Math.max(left, right);
}

function cloneRetrievalResult(result: RetrievalResult): RetrievalResult {
  const cloned: RetrievalResult = {
    ...result,
    score: { ...result.score },
    graph_signals: result.graph_signals.map((signal) => ({ ...signal })),
    match_reasons: result.match_reasons.map((reason) => ({ ...reason })),
    citations: result.citations.map((citation) => ({ ...citation })),
    media_evidence: result.media_evidence.map((item) => ({
      ...item,
      preview: { ...item.preview },
    })),
    source_document_ids: [...result.source_document_ids],
  };

  if (result.score_contribution !== undefined) {
    cloned.score_contribution = { ...result.score_contribution };
  }
  if (result.display_metadata !== undefined) {
    cloned.display_metadata = cloneDisplayMetadata(result.display_metadata);
  }
  if (result.source_refs !== undefined) {
    cloned.source_refs = result.source_refs.map((source) => ({ ...source }));
  }
  if (result.traversal !== undefined) {
    cloned.traversal = {
      ...result.traversal,
      path: [...result.traversal.path],
    };
  }

  return cloned;
}

function cloneDisplayMetadata(metadata: RetrievalDisplayMetadata): RetrievalDisplayMetadata {
  return Object.fromEntries(
    Object.entries(metadata).map(([key, value]) => [
      key,
      Array.isArray(value) ? [...value] : value,
    ]),
  );
}

function dedupeCitations(citations: readonly RetrievalCitation[]): RetrievalCitation[] {
  const seen = new Set<string>();
  const deduped: RetrievalCitation[] = [];

  for (const citation of citations) {
    const key = [
      citation.document_id,
      citation.source_anchor_id ?? "",
      citation.parsed_content_id ?? "",
      citation.locator ?? "",
      citation.media_asset_id ?? "",
      citation.evidence_kind ?? "",
    ].join(":");

    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(citation);
    }
  }

  return deduped;
}

function toRetrievalCitation(source: RetrievalSourceRef): RetrievalCitation {
  const locatorStatus = normalizeCitationLocatorStatus(source);

  return {
    document_id: source.document_id,
    ...(source.parsed_content_id === undefined
      ? {}
      : { parsed_content_id: source.parsed_content_id }),
    ...(source.source_anchor_id === undefined ? {} : { source_anchor_id: source.source_anchor_id }),
    ...(source.locator === undefined ? {} : { locator: source.locator }),
    locator_status: locatorStatus,
    warning_codes: normalizeCitationWarningCodes(source, locatorStatus),
    ...(source.media_asset_id === undefined ? {} : { media_asset_id: source.media_asset_id }),
    ...(source.evidence_kind === undefined ? {} : { evidence_kind: source.evidence_kind }),
    ...(source.visibility_origin === undefined || source.visibility_origin === "canonical"
      ? {}
      : { visibility_origin: source.visibility_origin }),
  };
}

function toRetrievalMediaEvidence(source: RetrievalSourceRef): RetrievalMediaEvidence | null {
  if (source.media_asset_id === undefined || source.evidence_kind !== "image_caption") {
    return null;
  }

  const locatorStatus = normalizeCitationLocatorStatus(source);

  return {
    document_id: source.document_id,
    ...(source.parsed_content_id === undefined
      ? {}
      : { parsed_content_id: source.parsed_content_id }),
    ...(source.source_anchor_id === undefined ? {} : { source_anchor_id: source.source_anchor_id }),
    ...(source.locator === undefined ? {} : { locator: source.locator }),
    locator_status: locatorStatus,
    warning_codes: normalizeCitationWarningCodes(source, locatorStatus),
    media_asset_id: source.media_asset_id,
    evidence_kind: "image_caption",
    ...(source.summary === undefined ? {} : { caption: source.summary }),
    ...(source.visibility_origin === undefined || source.visibility_origin === "canonical"
      ? {}
      : { visibility_origin: source.visibility_origin }),
    preview: {
      available: true,
      endpoint: `/v1/media-assets/${source.media_asset_id}/preview`,
    },
  };
}

function normalizeCitationLocatorStatus(
  source: RetrievalSourceRef,
): RetrievalCitationLocatorStatus {
  if (source.locator_status !== undefined) {
    return source.locator_status;
  }

  if (source.locator === undefined || source.locator.trim().length === 0) {
    return "not_provided";
  }

  return "not_found";
}

function normalizeCitationWarningCodes(
  source: RetrievalSourceRef,
  locatorStatus: RetrievalCitationLocatorStatus,
): readonly string[] {
  if (source.warning_codes !== undefined && source.warning_codes.length > 0) {
    return [...new Set(source.warning_codes)];
  }

  if (locatorStatus === "resolved") {
    return [];
  }

  if (source.locator === undefined || source.locator.trim().length === 0) {
    return ["source_ref_locator_not_specific"];
  }

  return ["source_ref_locator_status_missing"];
}

function createMediaEvidence(sourceRefs: readonly RetrievalSourceRef[]): RetrievalMediaEvidence[] {
  return sourceRefs.flatMap((source) => {
    const evidence = toRetrievalMediaEvidence(source);

    return evidence === null ? [] : [evidence];
  });
}

function dedupeMediaEvidence(items: readonly RetrievalMediaEvidence[]): RetrievalMediaEvidence[] {
  const seen = new Set<string>();
  const deduped: RetrievalMediaEvidence[] = [];

  for (const item of items) {
    const key = [
      item.media_asset_id,
      item.source_anchor_id ?? "",
      item.parsed_content_id ?? "",
      item.locator ?? "",
    ].join(":");

    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(item);
    }
  }

  return deduped;
}

function createSection(
  page: RetrievalPageRecord,
  matchReasons: readonly RetrievalMatchReason[],
): string {
  const firstSectionTerm = matchReasons.find((reason) => reason.field === "page_section")?.term;
  const targetedMarkdownTerm = findTargetedMarkdownTerm(matchReasons);

  if (firstSectionTerm !== undefined) {
    if (targetedMarkdownTerm !== undefined && isGenericStructuralHeadingTerm(firstSectionTerm)) {
      const targetedBlock = extractMarkdownBlockAroundTerm(page.markdown, targetedMarkdownTerm);

      if (targetedBlock.length > 0) {
        return targetedBlock.slice(0, 280);
      }
    }

    const headingSection = extractMarkdownSection(page.markdown, firstSectionTerm);

    if (headingSection.length > 0) {
      return headingSection.slice(0, 280);
    }
  }

  if (targetedMarkdownTerm !== undefined) {
    const targetedBlock = extractMarkdownBlockAroundTerm(page.markdown, targetedMarkdownTerm);

    if (targetedBlock.length > 0) {
      return targetedBlock.slice(0, 280);
    }
  }

  const firstMarkdownTerm = matchReasons.find((reason) => reason.field === "markdown")?.term;

  if (firstMarkdownTerm === undefined) {
    return page.markdown.slice(0, 280);
  }

  const markdown = page.markdown;
  const index = normalized(markdown).indexOf(firstMarkdownTerm);
  const start = Math.max(0, index - 80);

  return markdown.slice(start, start + 280);
}

function findTargetedMarkdownTerm(
  matchReasons: readonly RetrievalMatchReason[],
): string | undefined {
  const markdownReasons = matchReasons.filter(
    (reason) => reason.field === "markdown" || reason.field === "markdown_phrase",
  );
  const specificStructuralTerm = markdownReasons.find((reason) =>
    isSpecificStructuralTargetTerm(reason.term),
  )?.term;

  if (specificStructuralTerm !== undefined) {
    return specificStructuralTerm;
  }

  const nonGenericMarkdownReasons = markdownReasons.filter(
    (reason) => !isGenericStructuralHeadingTerm(reason.term),
  );

  return nonGenericMarkdownReasons[nonGenericMarkdownReasons.length - 1]?.term;
}

function extractMarkdownSection(markdown: string, normalizedHeadingTerm: string): string {
  const lines = markdown.split("\n");
  const startIndex = lines.findIndex((line) => {
    const heading = line.match(/^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/u)?.[1] ?? "";

    return normalized(heading).includes(normalizedHeadingTerm);
  });

  if (startIndex === -1) {
    return "";
  }

  const followingHeadingIndex = lines.findIndex(
    (line, index) => index > startIndex && /^\s{0,3}#{1,6}\s+/u.test(line),
  );
  const endIndex = followingHeadingIndex === -1 ? lines.length : followingHeadingIndex;

  return lines.slice(startIndex, endIndex).join("\n");
}

function extractMarkdownBlockAroundTerm(markdown: string, normalizedTerm: string): string {
  const lines = markdown.split("\n");
  const targetIndex = lines.findIndex((line) => normalized(line).includes(normalizedTerm));

  if (targetIndex === -1) {
    return "";
  }

  let previousHeadingIndex = -1;
  for (let index = targetIndex; index >= 0; index -= 1) {
    if (/^\s{0,3}#{1,6}\s+/u.test(lines[index] ?? "")) {
      previousHeadingIndex = index;
      break;
    }
  }
  const startIndex =
    previousHeadingIndex === -1 ? Math.max(0, targetIndex - 2) : previousHeadingIndex;
  const followingHeadingIndex = lines.findIndex(
    (line, index) => index > targetIndex && /^\s{0,3}#{1,6}\s+/u.test(line),
  );
  const endIndex =
    followingHeadingIndex === -1 ? Math.min(lines.length, targetIndex + 4) : followingHeadingIndex;

  return lines.slice(startIndex, endIndex).join("\n");
}

function isGenericStructuralHeadingTerm(term: string): boolean {
  return /^(?:article|section|chapter|part|paragraph|clause|row|line|anchor|appendix)$/iu.test(
    normalized(term),
  );
}

function isSpecificStructuralTargetTerm(term: string): boolean {
  return /(?:\b(?:article|section|chapter|part|paragraph|clause|row|line|anchor|appendix)[:\s-]*\d+\b|第[\p{N}一二三四五六七八九十百千万]+[章节条款项段])/iu.test(
    normalized(term),
  );
}

function createLexicalReason(matchReasons: readonly RetrievalMatchReason[]): string {
  const fields = [...new Set(matchReasons.map((reason) => reason.field))].join(", ");

  return `Matched query terms in ${fields}.`;
}

interface LexicalQuery {
  identityTerms: readonly string[];
  phrase: string;
  phraseCandidates: readonly string[];
  tokens: readonly string[];
}

const lexicalStopWords = new Set([
  "\u7684",
  "\u662f",
  "\u4e86",
  "\u4ec0\u4e48",
  "\u5728",
  "\u6709",
  "\u548c",
  "\u4e0e",
  "\u5bf9",
  "\u4ece",
  "the",
  "is",
  "a",
  "an",
  "what",
  "how",
  "are",
  "was",
  "were",
  "do",
  "does",
  "did",
  "be",
  "been",
  "being",
  "have",
  "has",
  "had",
  "it",
  "its",
  "in",
  "on",
  "at",
  "to",
  "for",
  "of",
  "with",
  "by",
  "this",
  "that",
  "these",
  "those",
]);

const lexicalSplitPattern = /[\s,，。！？、；：""''（）()\-_/\\·~～…]+/u;
const trimPunctuationPattern =
  /^[\s,，。！？、；：""''（）()\-_/\\·~～…]+|[\s,，。！？、；：""''（）()\-_/\\·~～…]+$/gu;
const LEXICAL_PHRASE_CANDIDATE_MIN_LENGTH = 4;

export function tokenizeLexicalQuery(query: string): string[] {
  return createLexicalQuery(query).tokens.slice();
}

function createLexicalQuery(query: string): LexicalQuery {
  const phrase = normalizeLexicalPhrase(query);
  const rawTokens = normalized(query)
    .split(lexicalSplitPattern)
    .map((term) => term.trim())
    .filter((term) => term.length > 1)
    .filter((term) => !lexicalStopWords.has(term));
  const tokens = rawTokens.flatMap(expandLexicalToken);

  return {
    identityTerms: extractLexicalIdentityTerms(query),
    phrase,
    phraseCandidates: createLexicalPhraseCandidates(rawTokens, phrase),
    tokens: [...new Set(tokens)],
  };
}

function createLexicalPhraseCandidates(rawTokens: readonly string[], phrase: string): string[] {
  return [
    ...new Set(
      [phrase, ...rawTokens]
        .map((term) => term.replace(trimPunctuationPattern, ""))
        .filter(
          (term) =>
            Array.from(term).length >= LEXICAL_PHRASE_CANDIDATE_MIN_LENGTH &&
            !lexicalStopWords.has(term),
        ),
    ),
  ];
}

const lexicalIdentityPattern = /[\p{L}\p{N}_./:-]+/gu;

function extractLexicalIdentityTerms(query: string): string[] {
  const terms = normalized(query)
    .match(lexicalIdentityPattern)
    ?.map((term) => term.trim())
    .map((term) => term.replace(trimPunctuationPattern, ""))
    .filter((term) => term.length > 1)
    .filter((term) => !lexicalStopWords.has(term))
    .filter((term) => /[_./:-]|\d/u.test(term));

  return [...new Set(terms ?? [])];
}

function normalizeLexicalPhrase(query: string): string {
  return normalized(query.trim()).replace(trimPunctuationPattern, "");
}

function expandLexicalToken(term: string): string[] {
  if (!/[\u4e00-\u9fff\u3400-\u4dbf]/u.test(term)) {
    return [term];
  }

  const characters = Array.from(term);

  if (characters.length <= 1) {
    return [term];
  }

  const bigrams = characters
    .slice(0, -1)
    .map((character, index) => `${character}${characters[index + 1]}`);
  const characterFallback = characters.filter((character) => !lexicalStopWords.has(character));

  return [...bigrams, ...characterFallback, term];
}

function dedupeMatchReasons(matchReasons: readonly RetrievalMatchReason[]): RetrievalMatchReason[] {
  const seen = new Set<string>();
  const deduped: RetrievalMatchReason[] = [];

  for (const reason of matchReasons) {
    const key = `${reason.field}:${reason.term}`;

    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(reason);
    }
  }

  return deduped;
}

function countOccurrences(haystack: string, needle: string): number {
  if (needle.length === 0) {
    return 0;
  }

  let count = 0;
  let position = 0;

  while (position < haystack.length) {
    const index = haystack.indexOf(needle, position);

    if (index === -1) {
      break;
    }

    count += 1;
    position = index + needle.length;
  }

  return count;
}

function readMetadataStrings(metadata: Record<string, unknown>, keys: readonly string[]): string[] {
  return keys.flatMap((key) => readMetadataStringValue(metadata[key]));
}

function extractMarkdownHeadings(markdown: string): string[] {
  return markdown
    .split("\n")
    .map((line) => line.match(/^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/u)?.[1]?.trim() ?? "")
    .filter(Boolean);
}

function readMetadataStringValue(value: unknown): string[] {
  if (typeof value === "string") {
    return [value];
  }

  if (Array.isArray(value)) {
    return value.flatMap(readMetadataStringValue);
  }

  if (typeof value === "object" && value !== null) {
    return Object.values(value).flatMap(readMetadataStringValue);
  }

  return [];
}

function normalizeFileStem(value: string): string {
  const trimmed = value.trim();

  if (trimmed.length === 0) {
    return "";
  }

  const withoutQuery = trimmed.split(/[?#]/u)[0] ?? trimmed;
  const lastPathSegment = withoutQuery.split(/[\\/]/u).at(-1) ?? withoutQuery;

  return normalized(lastPathSegment)
    .replace(/\.[a-z0-9]+$/u, "")
    .replace(trimPunctuationPattern, "");
}

function normalized(value: string): string {
  return value.toLowerCase();
}

function clonePage(page: RetrievalPageRecord): RetrievalPageRecord {
  return {
    ...page,
    source_refs: page.source_refs.map((source) => ({ ...source })),
    ...(page.frontmatter === undefined
      ? {}
      : { frontmatter: JSON.parse(JSON.stringify(page.frontmatter)) as Record<string, unknown> }),
    metadata: JSON.parse(JSON.stringify(page.metadata)) as Record<string, unknown>,
  };
}

function cloneEdge(edge: RetrievalEdgeRecord): RetrievalEdgeRecord {
  return {
    ...edge,
    source_document_ids: [...edge.source_document_ids],
  };
}

function cloneGraphExpansion(expansion: GraphExpansion): GraphExpansion {
  return {
    ...expansion,
    ...(expansion.insight_refs === undefined
      ? {}
      : {
          insight_refs: expansion.insight_refs.map((ref) => ({
            ...ref,
            reason_codes: [...ref.reason_codes],
          })),
        }),
    signal_breakdown: { ...expansion.signal_breakdown },
    ...(expansion.signal_contributions === undefined
      ? {}
      : {
          signal_contributions: expansion.signal_contributions.map((signal) => ({
            ...signal,
            ...(signal.evidence_refs === undefined
              ? {}
              : { evidence_refs: signal.evidence_refs.map((ref) => ({ ...ref })) }),
            reason_codes: [...signal.reason_codes],
          })),
        }),
    source_document_ids: [...expansion.source_document_ids],
  };
}

function cloneEmbedding(record: RetrievalEmbeddingRecord): RetrievalEmbeddingRecord {
  return {
    ...record,
    vector: [...record.vector],
    metadata: JSON.parse(JSON.stringify(record.metadata)) as Record<string, unknown>,
  };
}

function cloneTrace(record: RetrievalTraceRecord): RetrievalTraceRecord {
  return {
    ...record,
    request: { ...record.request },
    results: record.results.map(cloneRetrievalResult),
    graph_expansions: record.graph_expansions.map(cloneGraphExpansion),
    context_pack: record.context_pack === null ? null : { ...record.context_pack },
    warnings: [...record.warnings],
    stages: record.stages.map((stage) => ({
      name: stage.name,
      input: { ...stage.input },
      output: { ...stage.output },
    })),
  };
}

function createRetrievalTraceId(): string {
  return `trace_${randomUUID().replaceAll("-", "")}`;
}
