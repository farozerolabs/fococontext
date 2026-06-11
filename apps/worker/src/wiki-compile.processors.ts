import { createHash } from "node:crypto";
import { sql, type Kysely, type Transaction } from "kysely";
import type { CompilePromptLimits, RuntimeConfig } from "@fococontext/core";
import type { CompileArtifactRepository, DatabaseSchema } from "@fococontext/db";
import type {
  ChatMessage,
  ChatProvider,
  ModelCallUsage,
  ResolvedDatasetPromptTemplate,
  StructuredOutputMode,
} from "@fococontext/llm";
import {
  analysisOutputContract,
  analysisStructuredOutputJsonSchema,
  completeStructuredJsonOutput,
  analysisOutputShape,
  generationDraftOutputContract,
  generationStructuredOutputJsonSchema,
  generationDraftOutputShape,
  readStructuredJsonOutputErrorMetadata,
  resolveChatModel,
  resolveDatasetPromptTemplateFromSnapshot,
} from "@fococontext/llm";
import {
  createGraphInsightsFromRecords,
  type GraphInsightsResponse,
  type RetrievalRelationType,
  type RetrievalVisibilityOrigin,
} from "@fococontext/retrieval";
import type { ObjectStorageAdapter } from "@fococontext/storage";

import type {
  WorkerJobProgressWriter,
  WorkerJobStateGuard,
} from "./job-progress.postgres-writer.js";
import {
  parseAnalysisOutput,
  parseGenerationOutput,
  StructuredOutputValidationError,
  type StructuredAnalysisOutput,
  type StructuredGeneratedDraft,
  type StructuredGenerationOutput,
} from "./structured-output.js";
import {
  sourceRefLocatorSummaryToMetadata,
  validateAnalysisSourceRefs,
  validateGenerationSourceRefsFromAnalysis,
  validatePersistedSourceRefs,
} from "./source-ref-locator.js";
import {
  wikiAnalyzeQueueName,
  wikiGenerateQueueName,
  wikiMergeQueueName,
  type DatasetConfigurationSnapshotPayload,
  type WikiAnalyzePayload,
  type WikiAnalyzeProcessor,
  type WikiAnalyzeProcessorResult,
  type WikiGeneratePayload,
  type WikiGenerateProcessor,
  type WikiGenerateProcessorResult,
  type WikiGenerateQueue,
  type WikiMergePayload,
  type WikiMergeProcessor,
  type WikiMergeProcessorResult,
  type WikiMergeQueue,
} from "./wiki-compile.worker.js";

const analysisStructuredOutputRepairAttempts = 2;
const generationStructuredOutputRepairAttempts = 3;
const sourceFrontmatterMetadataKey = "source_frontmatter";
const sourceDocumentMetadataKey = "source_document_metadata";
const systemPageLogMaxEntries = 200;

export interface WikiAnalyzeContext {
  currentKnowledgeVersionId: string;
  datasetConfigurationSnapshot: DatasetConfigurationSnapshotPayload | null;
  documentName: string;
  sourceDocumentMetadata: Record<string, unknown>;
  purpose: string;
  schema: Record<string, unknown>;
}

export interface WikiCompileContextReader {
  getAnalyzeContext(payload: WikiAnalyzePayload): Promise<WikiAnalyzeContext>;
}

export interface WikiAnalyzeProcessorServiceOptions {
  artifactRepository: CompileArtifactRepository;
  chatProvider: ChatProvider;
  contextReader: WikiCompileContextReader;
  generateQueue: WikiGenerateQueue;
  jobProgress?: WorkerJobProgressWriter;
  jobGuard?: WorkerJobStateGuard;
  maxParsedMarkdownBytes?: number;
  objectStorage: ObjectStorageAdapter;
  promptLimits: CompilePromptLimits;
  idFactory?: (scope: string) => string;
  now?: () => string;
}

export interface WikiGenerateProcessorServiceOptions {
  artifactRepository: CompileArtifactRepository;
  chatProvider: ChatProvider;
  mergeQueue: WikiMergeQueue;
  jobProgress?: WorkerJobProgressWriter;
  jobGuard?: WorkerJobStateGuard;
  promptLimits: CompilePromptLimits;
  idFactory?: (scope: string) => string;
  now?: () => string;
}

export interface WikiMergeApplyInput {
  assertCanContinue?: () => Promise<void>;
  draft: Awaited<ReturnType<CompileArtifactRepository["findDraftCandidateById"]>> & {};
  currentKnowledgeVersionId: string;
  targetPageId: string | null;
}

export interface WikiMergeApplyResult {
  pageMergeRecordId: string;
  changeSetId: string;
  knowledgeVersionId: string;
  indexedEmbeddingCount: number;
  updatedSystemPageCount?: number;
  mergeSummary: string;
}

export interface WikiMergeApplier {
  applyDraft(input: WikiMergeApplyInput): Promise<WikiMergeApplyResult>;
}

export interface IngestSystemLogRenderInput {
  changeSetId: string;
  draftCandidateId: string;
  draftTitle: string;
  existingMarkdown?: string | null;
  knowledgeVersionId: string;
  maxEntries?: number;
  now: string;
  sourceDocumentIds: readonly string[];
}

export function renderIngestSystemLogMarkdown(input: IngestSystemLogRenderInput): string {
  const maxEntries = input.maxEntries ?? systemPageLogMaxEntries;
  const existingEntries = readExistingSystemLogEntries(input.existingMarkdown);
  const nextEntry = renderIngestSystemLogEntry(input);
  const entries = [
    ...existingEntries.filter((entry) => !entry.includes(`Change Set ${input.changeSetId} `)),
    nextEntry,
  ];
  const omittedCount = Math.max(0, entries.length - maxEntries);
  const visibleEntries = entries.slice(omittedCount);
  const lines = ["# Log", ""];

  if (omittedCount > 0) {
    lines.push(`- Earlier entries omitted: ${omittedCount}.`);
  }

  lines.push(...visibleEntries);

  return `${lines.join("\n")}\n`;
}

function readExistingSystemLogEntries(markdown: string | null | undefined): string[] {
  if (markdown === null || markdown === undefined) {
    return [];
  }

  return markdown
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .filter((line) => !line.startsWith("- Earlier entries omitted:"));
}

function renderIngestSystemLogEntry(input: IngestSystemLogRenderInput): string {
  const sourceDocumentIds =
    input.sourceDocumentIds.length === 0 ? "none" : input.sourceDocumentIds.join(", ");

  return [
    `- ${sanitizeSystemLogValue(input.now)}:`,
    `Applied Change Set ${sanitizeSystemLogValue(input.changeSetId)}`,
    `for Knowledge Version ${sanitizeSystemLogValue(input.knowledgeVersionId)}`,
    `from Draft ${sanitizeSystemLogValue(input.draftCandidateId)}.`,
    `Source Documents: ${sanitizeSystemLogValue(sourceDocumentIds)}.`,
    `Draft Title: ${sanitizeSystemLogValue(input.draftTitle)}.`,
  ].join(" ");
}

function sanitizeSystemLogValue(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

export interface WikiPageEmbeddingIndexer {
  indexPage(input: {
    knowledgeBaseId: string;
    pageId: string;
    pageVersionId: string;
    objectType: "page";
    title: string;
    markdown: string;
    pageType: string;
  }): Promise<number>;
}

export interface RelationshipPageRecord {
  id: string;
  slug: string;
  title: string;
}

export interface GraphSignalPageRecord extends RelationshipPageRecord {
  markdown: string;
  pageType: string;
  sourceDocumentIds: readonly string[];
}

export interface GraphSignalDerivationLimits {
  maxCommonNeighborIdsPerPair?: number;
  maxCommonNeighborPairs?: number;
  maxPairsPerGroupWindow?: number;
  maxSharedSourcePairs?: number;
  maxTypeAffinityPairs?: number;
}

export interface ResolvedRelationshipEdgeWrite {
  edgeId: string;
  explanation: string;
  fromPageId: string;
  metadata: Record<string, unknown>;
  relationType: string;
  sourceDocumentIds: string[];
  sourceRefs: Record<string, unknown>[];
  toPageId: string;
  weight: number;
}

const defaultGraphSignalDerivationLimits = {
  maxCommonNeighborIdsPerPair: 16,
  maxCommonNeighborPairs: 20_000,
  maxPairsPerGroupWindow: 16,
  maxSharedSourcePairs: 30_000,
  maxTypeAffinityPairs: 20_000,
} satisfies Required<GraphSignalDerivationLimits>;

export function resolveRelationshipEdgesForPages(input: {
  knowledgeBaseId: string;
  pages: readonly RelationshipPageRecord[];
  relationships: readonly Record<string, unknown>[];
}): ResolvedRelationshipEdgeWrite[] {
  const pageLookup = createRelationshipPageLookup(input.pages);
  const edgesByKey = new Map<string, ResolvedRelationshipEdgeWrite>();

  for (const relationship of input.relationships) {
    const fromPage = resolveRelationshipPage(pageLookup, {
      pageId: readString(relationship.from_page_id),
      slug: readString(relationship.from_slug) ?? readString(relationship.source_slug),
      title: readString(relationship.from_title) ?? readString(relationship.source_title),
    });
    const toPage = resolveRelationshipPage(pageLookup, {
      pageId: readString(relationship.to_page_id) ?? readString(relationship.target_page_id),
      slug: readString(relationship.to_slug) ?? readString(relationship.target_slug),
      title: readString(relationship.to_title) ?? readString(relationship.target_title),
    });

    if (fromPage === null || toPage === null || fromPage.id === toPage.id) {
      continue;
    }

    const relationType =
      readString(relationship.relation_type) ?? readString(relationship.relation) ?? "manual";
    const sourceRefs = readRecordArray(relationship.source_refs);
    const sourceDocumentIds = [
      ...new Set(sourceRefs.map((sourceRef) => readString(sourceRef.document_id)).filter(isString)),
    ];
    const explanation =
      readString(relationship.evidence) ?? readString(relationship.explanation) ?? relationType;
    const edgeKey = `${fromPage.id}\u0000${toPage.id}\u0000${relationType}`;

    if (edgesByKey.has(edgeKey)) {
      continue;
    }

    edgesByKey.set(edgeKey, {
      edgeId: createStableRelationshipId("edge_", input.knowledgeBaseId, edgeKey),
      explanation,
      fromPageId: fromPage.id,
      metadata: {
        relationship: JSON.parse(JSON.stringify(relationship)) as Record<string, unknown>,
      },
      relationType,
      sourceDocumentIds,
      sourceRefs,
      toPageId: toPage.id,
      weight: readPositiveNumber(relationship.weight) ?? 1,
    });
  }

  return [...edgesByKey.values()];
}

export function deriveGraphSignalEdgesForPages(input: {
  existingEdges?: readonly ResolvedRelationshipEdgeWrite[];
  knowledgeBaseId: string;
  limits?: GraphSignalDerivationLimits;
  pages: readonly GraphSignalPageRecord[];
}): ResolvedRelationshipEdgeWrite[] {
  const pageLookup = createRelationshipPageLookup(input.pages);
  const pagesById = new Map(input.pages.map((page) => [page.id, page]));
  const sourceIdsByPageId = createSourceIdsByPageId(input.pages);
  const pagesBySourceDocumentId = createPagesBySourceDocumentId(input.pages);
  const pagesByType = createPagesByType(input.pages);
  const limits = normalizeGraphSignalDerivationLimits(input.limits);
  const edgesByKey = new Map<string, ResolvedRelationshipEdgeWrite>();

  for (const page of input.pages) {
    for (const targetTitle of extractWikiLinkTitles(page.markdown)) {
      const target = resolveRelationshipPage(pageLookup, {
        pageId: null,
        slug: null,
        title: targetTitle,
      });

      if (target === null || target.id === page.id) {
        continue;
      }

      upsertDerivedEdge(edgesByKey, {
        explanation: `${page.title} links to ${target.title}.`,
        fromPage: page,
        knowledgeBaseId: input.knowledgeBaseId,
        metadata: {
          signal: "wikilink",
          target_title: targetTitle,
        },
        relationType: "wikilink",
        sourceDocumentIds: page.sourceDocumentIds,
        sourceRefs: page.sourceDocumentIds.map((documentId) => ({
          document_id: documentId,
          locator: "page.wikilinks",
        })),
        toPage: target,
        weight: 0.9,
      });
    }
  }

  const sharedSourcePairKeys = new Set<string>();
  let sharedSourcePairCount = 0;

  for (const pages of pagesBySourceDocumentId.values()) {
    if (sharedSourcePairCount >= limits.maxSharedSourcePairs) {
      break;
    }

    sharedSourcePairCount += visitBoundedPagePairs({
      limit: limits.maxSharedSourcePairs - sharedSourcePairCount,
      pages,
      pairKeys: sharedSourcePairKeys,
      windowSize: limits.maxPairsPerGroupWindow,
      visit: (leftPage, rightPage) => {
        const sharedSourceIds = intersectStringSets(
          sourceIdsByPageId.get(leftPage.id) ?? new Set(),
          sourceIdsByPageId.get(rightPage.id) ?? new Set(),
        );

        if (sharedSourceIds.length === 0) {
          return;
        }

        upsertBidirectionalDerivedEdges(edgesByKey, {
          explanation: `${leftPage.title} and ${rightPage.title} cite shared source documents.`,
          knowledgeBaseId: input.knowledgeBaseId,
          leftPage,
          metadata: {
            signal: "shared_source",
            shared_source_document_ids: sharedSourceIds,
          },
          relationType: "shared_source",
          rightPage,
          sourceDocumentIds: sharedSourceIds,
          sourceRefs: sharedSourceIds.map((documentId) => ({
            document_id: documentId,
            locator: "source_document_ids",
          })),
          weight: 0.82,
        });
      },
    });
  }

  let typeAffinityPairCount = 0;

  for (const pages of pagesByType.values()) {
    if (typeAffinityPairCount >= limits.maxTypeAffinityPairs) {
      break;
    }

    typeAffinityPairCount += visitBoundedPagePairs({
      limit: limits.maxTypeAffinityPairs - typeAffinityPairCount,
      pages,
      windowSize: limits.maxPairsPerGroupWindow,
      visit: (leftPage, rightPage) => {
        const sharedSourceIds = intersectStringSets(
          sourceIdsByPageId.get(leftPage.id) ?? new Set(),
          sourceIdsByPageId.get(rightPage.id) ?? new Set(),
        );

        upsertBidirectionalDerivedEdges(edgesByKey, {
          explanation: `${leftPage.title} and ${rightPage.title} share page type ${leftPage.pageType}.`,
          knowledgeBaseId: input.knowledgeBaseId,
          leftPage,
          metadata: {
            signal: "type_affinity",
            page_type: leftPage.pageType,
          },
          relationType: "type_affinity",
          rightPage,
          sourceDocumentIds: sharedSourceIds,
          sourceRefs: [],
          weight: 0.35,
        });
      },
    });
  }

  const baseEdges = [...(input.existingEdges ?? []), ...edgesByKey.values()].filter(
    (edge) => edge.relationType !== "common_neighbor",
  );
  const neighborIdsByPageId = new Map<string, Set<string>>();

  for (const edge of baseEdges) {
    neighborIdsByPageId.set(edge.fromPageId, neighborIdsByPageId.get(edge.fromPageId) ?? new Set());
    neighborIdsByPageId.set(edge.toPageId, neighborIdsByPageId.get(edge.toPageId) ?? new Set());
    neighborIdsByPageId.get(edge.fromPageId)?.add(edge.toPageId);
    neighborIdsByPageId.get(edge.toPageId)?.add(edge.fromPageId);
  }

  const commonNeighborIdsByPairKey = new Map<string, Set<string>>();
  let commonNeighborPairCount = 0;

  for (const [commonNeighborId, neighborIds] of neighborIdsByPageId.entries()) {
    if (commonNeighborPairCount >= limits.maxCommonNeighborPairs) {
      break;
    }

    const neighborPages = sortGraphSignalPages(
      [...neighborIds].flatMap((pageId) => {
        const page = pagesById.get(pageId);

        return page === undefined ? [] : [page];
      }),
    );

    commonNeighborPairCount += visitBoundedPagePairs({
      limit: limits.maxCommonNeighborPairs - commonNeighborPairCount,
      pages: neighborPages,
      windowSize: limits.maxPairsPerGroupWindow,
      visit: (leftPage, rightPage) => {
        if (leftPage.id === commonNeighborId || rightPage.id === commonNeighborId) {
          return;
        }

        const pairKey = createUndirectedPagePairKey(leftPage.id, rightPage.id);
        const commonNeighborIds = commonNeighborIdsByPairKey.get(pairKey) ?? new Set<string>();

        if (commonNeighborIds.size < limits.maxCommonNeighborIdsPerPair) {
          commonNeighborIds.add(commonNeighborId);
        }

        commonNeighborIdsByPairKey.set(pairKey, commonNeighborIds);
      },
    });
  }

  for (const [pairKey, commonNeighborIds] of commonNeighborIdsByPairKey.entries()) {
    const [leftPageId, rightPageId] = pairKey.split("\u0000");
    const leftPage = leftPageId === undefined ? undefined : pagesById.get(leftPageId);
    const rightPage = rightPageId === undefined ? undefined : pagesById.get(rightPageId);

    if (leftPage === undefined || rightPage === undefined || commonNeighborIds.size === 0) {
      continue;
    }

    upsertBidirectionalDerivedEdges(edgesByKey, {
      explanation: `${leftPage.title} and ${rightPage.title} share graph neighbors.`,
      knowledgeBaseId: input.knowledgeBaseId,
      leftPage,
      metadata: {
        signal: "common_neighbor",
        common_neighbor_page_ids: [...commonNeighborIds].sort(),
      },
      relationType: "common_neighbor",
      rightPage,
      sourceDocumentIds: [],
      sourceRefs: [],
      weight: 0.5,
    });
  }

  return [...edgesByKey.values()];
}

export function constrainResolvedEdgeSourcesToDocuments(
  edges: readonly ResolvedRelationshipEdgeWrite[],
  validSourceDocumentIds: ReadonlySet<string>,
): ResolvedRelationshipEdgeWrite[] {
  return edges.map((edge) => ({
    ...edge,
    sourceDocumentIds: edge.sourceDocumentIds.filter((documentId) =>
      validSourceDocumentIds.has(documentId),
    ),
    sourceRefs: edge.sourceRefs.filter((sourceRef) => {
      const documentId = readString(sourceRef.document_id);

      return documentId !== null && validSourceDocumentIds.has(documentId);
    }),
  }));
}

function upsertBidirectionalDerivedEdges(
  edgesByKey: Map<string, ResolvedRelationshipEdgeWrite>,
  input: {
    explanation: string;
    knowledgeBaseId: string;
    leftPage: GraphSignalPageRecord;
    metadata: Record<string, unknown>;
    relationType: string;
    rightPage: GraphSignalPageRecord;
    sourceDocumentIds: readonly string[];
    sourceRefs: readonly Record<string, unknown>[];
    weight: number;
  },
): void {
  upsertDerivedEdge(edgesByKey, {
    explanation: input.explanation,
    fromPage: input.leftPage,
    knowledgeBaseId: input.knowledgeBaseId,
    metadata: input.metadata,
    relationType: input.relationType,
    sourceDocumentIds: input.sourceDocumentIds,
    sourceRefs: input.sourceRefs,
    toPage: input.rightPage,
    weight: input.weight,
  });
  upsertDerivedEdge(edgesByKey, {
    explanation: input.explanation,
    fromPage: input.rightPage,
    knowledgeBaseId: input.knowledgeBaseId,
    metadata: input.metadata,
    relationType: input.relationType,
    sourceDocumentIds: input.sourceDocumentIds,
    sourceRefs: input.sourceRefs,
    toPage: input.leftPage,
    weight: input.weight,
  });
}

function upsertDerivedEdge(
  edgesByKey: Map<string, ResolvedRelationshipEdgeWrite>,
  input: {
    explanation: string;
    fromPage: RelationshipPageRecord;
    knowledgeBaseId: string;
    metadata: Record<string, unknown>;
    relationType: string;
    sourceDocumentIds: readonly string[];
    sourceRefs: readonly Record<string, unknown>[];
    toPage: RelationshipPageRecord;
    weight: number;
  },
): void {
  const edgeKey = `${input.fromPage.id}\u0000${input.toPage.id}\u0000${input.relationType}`;

  if (edgesByKey.has(edgeKey)) {
    return;
  }

  edgesByKey.set(edgeKey, {
    edgeId: createStableRelationshipId("edge_", input.knowledgeBaseId, edgeKey),
    explanation: input.explanation,
    fromPageId: input.fromPage.id,
    metadata: input.metadata,
    relationType: input.relationType,
    sourceDocumentIds: [...input.sourceDocumentIds],
    sourceRefs: input.sourceRefs.map((sourceRef) => ({ ...sourceRef })),
    toPageId: input.toPage.id,
    weight: input.weight,
  });
}

function extractWikiLinkTitles(markdown: string): string[] {
  const titles: string[] = [];
  const pattern = /\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/gu;
  let match = pattern.exec(markdown);

  while (match !== null) {
    const title = match[1]?.trim();

    if (title !== undefined && title.length > 0) {
      titles.push(title);
    }

    match = pattern.exec(markdown);
  }

  return [...new Set(titles)];
}

function intersectStringSets(
  leftValues: ReadonlySet<string>,
  rightValues: ReadonlySet<string>,
): string[] {
  const sharedValues: string[] = [];
  const smallerSet = leftValues.size <= rightValues.size ? leftValues : rightValues;
  const largerSet = leftValues.size <= rightValues.size ? rightValues : leftValues;

  for (const value of smallerSet) {
    if (largerSet.has(value)) {
      sharedValues.push(value);
    }
  }

  return sharedValues.sort();
}

function createSourceIdsByPageId(
  pages: readonly GraphSignalPageRecord[],
): Map<string, ReadonlySet<string>> {
  return new Map(
    pages.map((page) => [
      page.id,
      new Set(page.sourceDocumentIds.filter((sourceDocumentId) => sourceDocumentId.length > 0)),
    ]),
  );
}

function createPagesBySourceDocumentId(
  pages: readonly GraphSignalPageRecord[],
): Map<string, GraphSignalPageRecord[]> {
  const pagesBySourceDocumentId = new Map<string, GraphSignalPageRecord[]>();

  for (const page of pages) {
    for (const sourceDocumentId of new Set(page.sourceDocumentIds)) {
      if (sourceDocumentId.length === 0) {
        continue;
      }

      const sourcePages = pagesBySourceDocumentId.get(sourceDocumentId) ?? [];
      sourcePages.push(page);
      pagesBySourceDocumentId.set(sourceDocumentId, sourcePages);
    }
  }

  return sortGraphSignalPageGroups(pagesBySourceDocumentId);
}

function createPagesByType(
  pages: readonly GraphSignalPageRecord[],
): Map<string, GraphSignalPageRecord[]> {
  const pagesByType = new Map<string, GraphSignalPageRecord[]>();

  for (const page of pages) {
    const typePages = pagesByType.get(page.pageType) ?? [];
    typePages.push(page);
    pagesByType.set(page.pageType, typePages);
  }

  return sortGraphSignalPageGroups(pagesByType);
}

function sortGraphSignalPageGroups(
  groups: Map<string, GraphSignalPageRecord[]>,
): Map<string, GraphSignalPageRecord[]> {
  return new Map(
    [...groups.entries()]
      .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
      .map(([key, pages]) => [key, sortGraphSignalPages(pages)]),
  );
}

function sortGraphSignalPages(pages: readonly GraphSignalPageRecord[]): GraphSignalPageRecord[] {
  return [...pages].sort((leftPage, rightPage) => {
    const titleOrder = leftPage.title.localeCompare(rightPage.title);

    return titleOrder === 0 ? leftPage.id.localeCompare(rightPage.id) : titleOrder;
  });
}

function normalizeGraphSignalDerivationLimits(
  limits: GraphSignalDerivationLimits | undefined,
): Required<GraphSignalDerivationLimits> {
  return {
    maxCommonNeighborIdsPerPair: normalizePositiveIntegerLimit(
      limits?.maxCommonNeighborIdsPerPair,
      defaultGraphSignalDerivationLimits.maxCommonNeighborIdsPerPair,
    ),
    maxCommonNeighborPairs: normalizePositiveIntegerLimit(
      limits?.maxCommonNeighborPairs,
      defaultGraphSignalDerivationLimits.maxCommonNeighborPairs,
    ),
    maxPairsPerGroupWindow: normalizePositiveIntegerLimit(
      limits?.maxPairsPerGroupWindow,
      defaultGraphSignalDerivationLimits.maxPairsPerGroupWindow,
    ),
    maxSharedSourcePairs: normalizePositiveIntegerLimit(
      limits?.maxSharedSourcePairs,
      defaultGraphSignalDerivationLimits.maxSharedSourcePairs,
    ),
    maxTypeAffinityPairs: normalizePositiveIntegerLimit(
      limits?.maxTypeAffinityPairs,
      defaultGraphSignalDerivationLimits.maxTypeAffinityPairs,
    ),
  };
}

function normalizePositiveIntegerLimit(value: number | undefined, defaultValue: number): number {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : defaultValue;
}

function visitBoundedPagePairs(input: {
  limit: number;
  pages: readonly GraphSignalPageRecord[];
  pairKeys?: Set<string>;
  visit: (leftPage: GraphSignalPageRecord, rightPage: GraphSignalPageRecord) => void;
  windowSize: number;
}): number {
  let visitedPairCount = 0;

  for (let leftIndex = 0; leftIndex < input.pages.length; leftIndex += 1) {
    if (visitedPairCount >= input.limit) {
      break;
    }

    for (let offset = 1; offset <= input.windowSize; offset += 1) {
      if (visitedPairCount >= input.limit) {
        break;
      }

      const leftPage = input.pages[leftIndex];
      const rightPage = input.pages[leftIndex + offset];

      if (leftPage === undefined || rightPage === undefined) {
        break;
      }

      const pairKey = createUndirectedPagePairKey(leftPage.id, rightPage.id);

      if (input.pairKeys?.has(pairKey)) {
        continue;
      }

      input.pairKeys?.add(pairKey);
      input.visit(leftPage, rightPage);
      visitedPairCount += 1;
    }
  }

  return visitedPairCount;
}

function createUndirectedPagePairKey(leftPageId: string, rightPageId: string): string {
  return [leftPageId, rightPageId].sort().join("\u0000");
}

export interface WikiMergeProcessorServiceOptions {
  artifactRepository: CompileArtifactRepository;
  applier: WikiMergeApplier;
  jobProgress?: WorkerJobProgressWriter;
  jobGuard?: WorkerJobStateGuard;
  idFactory?: (scope: string) => string;
  now?: () => string;
}

export class WikiAnalyzeProcessorService implements WikiAnalyzeProcessor {
  private readonly artifactRepository: CompileArtifactRepository;
  private readonly chatProvider: ChatProvider;
  private readonly contextReader: WikiCompileContextReader;
  private readonly generateQueue: WikiGenerateQueue;
  private readonly jobProgress: WorkerJobProgressWriter | undefined;
  private readonly jobGuard: WorkerJobStateGuard | undefined;
  private readonly maxParsedMarkdownBytes: number;
  private readonly objectStorage: ObjectStorageAdapter;
  private readonly promptLimits: CompilePromptLimits;
  private readonly idFactory: (scope: string) => string;
  private readonly now: () => string;

  constructor(options: WikiAnalyzeProcessorServiceOptions) {
    this.artifactRepository = options.artifactRepository;
    this.chatProvider = options.chatProvider;
    this.contextReader = options.contextReader;
    this.generateQueue = options.generateQueue;
    this.jobProgress = options.jobProgress;
    this.jobGuard = options.jobGuard;
    this.maxParsedMarkdownBytes = options.maxParsedMarkdownBytes ?? Number.MAX_SAFE_INTEGER;
    this.objectStorage = options.objectStorage;
    this.promptLimits = options.promptLimits;
    this.idFactory = options.idFactory ?? createWorkerId;
    this.now = options.now ?? (() => new Date().toISOString());
  }

  async process(payload: WikiAnalyzePayload): Promise<WikiAnalyzeProcessorResult> {
    await assertJobCanContinue(this.jobGuard, {
      jobId: payload.job_id,
      knowledgeBaseId: payload.knowledge_base_id,
      inputSnapshotId: payload.input_snapshot_id,
      sourceDocumentId: payload.document_id,
    });

    const context = await this.contextReader.getAnalyzeContext(payload);
    const datasetConfigurationSnapshot =
      payload.dataset_configuration_snapshot ?? context.datasetConfigurationSnapshot;
    const promptContext: WikiAnalyzeContext = {
      ...context,
      datasetConfigurationSnapshot,
    };
    const resolvedPrompt = resolveDatasetPromptTemplateFromSnapshot({
      purpose: "analysis",
      datasetConfigurationSnapshot,
    });
    const prompt = resolvedPrompt.prompt;
    const stageExecutionId = this.idFactory("compile_stage");
    const startedAt = this.now();

    await this.artifactRepository.saveStageExecution({
      id: stageExecutionId,
      knowledgeBaseId: payload.knowledge_base_id,
      jobId: payload.job_id,
      stage: "analyzing",
      status: "running",
      queueName: wikiAnalyzeQueueName,
      queueJobId: `${payload.job_id}:analyze`,
      inputSnapshotId: payload.input_snapshot_id,
      sourceDocumentId: payload.document_id,
      parsedContentId: payload.parsed_content_id,
      analysisResultId: null,
      draftCandidateId: null,
      error: null,
      metadata: {},
      startedAt,
      finishedAt: null,
      createdAt: startedAt,
      updatedAt: startedAt,
    });
    await this.jobProgress?.updateJobProgress({
      jobId: payload.job_id,
      knowledgeBaseId: payload.knowledge_base_id,
      inputSnapshotId: payload.input_snapshot_id,
      stage: "analyzing",
      status: "running",
      progress: 35,
      message: "Analyzing content...",
      parsedContentId: payload.parsed_content_id,
      metadata: {
        parsed_content_id: payload.parsed_content_id,
      },
    });

    const markdownRead = await this.readParsedMarkdown(payload.normalized_markdown_object_key);

    if (markdownRead.kind === "fatal") {
      const failure = markdownRead.error;

      await this.artifactRepository.updateStageExecution(stageExecutionId, {
        status: "failed",
        error: failure,
        metadata: {
          normalized_markdown_object_key: payload.normalized_markdown_object_key,
        },
        finishedAt: this.now(),
      });
      await this.jobProgress?.updateJobProgress({
        jobId: payload.job_id,
        knowledgeBaseId: payload.knowledge_base_id,
        inputSnapshotId: payload.input_snapshot_id,
        stage: "analyzing",
        status: "failed",
        progress: 35,
        message: "Analysis failed.",
        parsedContentId: payload.parsed_content_id,
        error: failure,
        metadata: {
          normalized_markdown_object_key: payload.normalized_markdown_object_key,
        },
      });

      return {
        status: "failed",
        should_continue: false,
        knowledge_base_id: payload.knowledge_base_id,
        document_id: payload.document_id,
        parsed_content_id: payload.parsed_content_id,
        analysis_result_id: null,
        prompt_version_id: prompt.id,
        model_call_id: null,
        entities: [],
        concepts: [],
        contradictions: [],
        relationships: [],
      };
    }

    const markdown = markdownRead.text;
    const sourceMetadata = createAnalysisSourceMetadata(markdown, context.sourceDocumentMetadata);
    const messages = createAnalysisMessages(
      payload,
      promptContext,
      markdown,
      this.promptLimits,
      prompt.template,
    );
    const model = resolveChatModel(this.chatProvider.profile, prompt.modelPurpose);

    try {
      const analysis = await completeAnalysisWithStructuredOutputRepair({
        chatProvider: this.chatProvider,
        model,
        messages,
      });
      const sourceRefValidation = validateAnalysisSourceRefs(analysis.output, markdown);
      const output = sourceRefValidation.output;
      const sourceRefLocatorValidationMetadata = sourceRefLocatorSummaryToMetadata(
        sourceRefValidation.summary,
      );

      await assertJobCanContinue(this.jobGuard, {
        jobId: payload.job_id,
        knowledgeBaseId: payload.knowledge_base_id,
        inputSnapshotId: payload.input_snapshot_id,
        sourceDocumentId: payload.document_id,
      });

      const modelCall = await this.recordModelCall({
        payload,
        model,
        promptVersionId: prompt.id,
        promptMetadata: resolvedPrompt,
        status: "succeeded",
        inputSummary: createAnalysisInputSummary(payload, promptContext, markdown),
        outputSummary: createAnalysisOutputSummary(
          output,
          analysis.repairAttempts,
          sourceRefLocatorValidationMetadata,
        ),
        structuredOutputAttemptCount: analysis.attemptCount,
        structuredOutputFinalStatus: "succeeded",
        structuredOutputMode: analysis.structuredOutputMode,
        structuredOutputRepairAttempts: analysis.repairAttempts,
        structuredOutputValidationIssues: analysis.validationIssues,
        ...(analysis.completion.usage === undefined ? {} : { usage: analysis.completion.usage }),
      });
      const analysisResult = await this.artifactRepository.saveAnalysisResult({
        id: this.idFactory("analysis"),
        knowledgeBaseId: payload.knowledge_base_id,
        sourceDocumentId: payload.document_id,
        parsedContentId: payload.parsed_content_id,
        jobId: payload.job_id,
        modelCallId: modelCall.id,
        promptVersionId: prompt.id,
        inputSnapshotId: payload.input_snapshot_id,
        contentHash: payload.content_hash,
        entities: output.entities.map(toRecord),
        concepts: output.concepts.map(toRecord),
        claims: output.claims.map(toRecord),
        contradictions: output.contradictions.map(toRecord),
        relationships: output.relationships.map(toRecord),
        sourceRefs: collectAnalysisSourceRefs(output),
        locatorRefs: collectAnalysisLocatorRefs(output),
        metadata: {
          dataset_configuration_snapshot: datasetConfigurationSnapshot,
          document_name: context.documentName,
          prompt_template: resolvedPrompt.metadata,
          ...sourceMetadata,
          source_ref_locator_validation: sourceRefLocatorValidationMetadata,
        },
      });

      await this.artifactRepository.updateStageExecution(stageExecutionId, {
        status: "completed",
        analysisResultId: analysisResult.id,
        metadata: {
          analysis_result_id: analysisResult.id,
          model_call_id: modelCall.id,
          structured_output_attempt_count: analysis.attemptCount,
          structured_output_final_status: "succeeded",
          structured_output_mode: analysis.structuredOutputMode,
          structured_output_repair_attempts: analysis.repairAttempts,
          structured_output_validation_issues: analysis.validationIssues,
          prompt_template: resolvedPrompt.metadata,
          source_ref_locator_validation: sourceRefLocatorValidationMetadata,
        },
        finishedAt: this.now(),
      });
      await this.generateQueue.enqueueWikiGenerateJob({
        job_id: payload.job_id,
        knowledge_base_id: payload.knowledge_base_id,
        analysis_result_id: analysisResult.id,
        source_document_ids: [payload.document_id],
        current_knowledge_version_id: context.currentKnowledgeVersionId,
        dataset_configuration_snapshot: datasetConfigurationSnapshot,
        purpose: context.purpose,
        schema: context.schema,
        input_snapshot_id: payload.input_snapshot_id,
      });
      await this.jobProgress?.updateJobProgress({
        jobId: payload.job_id,
        knowledgeBaseId: payload.knowledge_base_id,
        inputSnapshotId: payload.input_snapshot_id,
        stage: "generating",
        status: "running",
        progress: 50,
        message: "Generating wiki drafts...",
        parsedContentId: payload.parsed_content_id,
        metadata: {
          analysis_result_id: analysisResult.id,
          model_call_id: modelCall.id,
          entity_count: output.entities.length,
          concept_count: output.concepts.length,
          relationship_count: output.relationships.length,
          structured_output_attempt_count: analysis.attemptCount,
          structured_output_final_status: "succeeded",
          structured_output_mode: analysis.structuredOutputMode,
          structured_output_repair_attempts: analysis.repairAttempts,
          structured_output_validation_issues: analysis.validationIssues,
          prompt_template: resolvedPrompt.metadata,
          source_ref_locator_validation: sourceRefLocatorValidationMetadata,
        },
      });

      return {
        status: "completed",
        should_continue: true,
        knowledge_base_id: payload.knowledge_base_id,
        document_id: payload.document_id,
        parsed_content_id: payload.parsed_content_id,
        analysis_result_id: analysisResult.id,
        prompt_version_id: prompt.id,
        model_call_id: modelCall.id,
        entities: output.entities.map((item) => ({
          title: item.title,
          evidence_locator: item.locator_refs[0] ?? item.source_refs[0]?.locator ?? "",
        })),
        concepts: output.concepts.map((item) => ({
          title: item.title,
          evidence_locator: item.locator_refs[0] ?? item.source_refs[0]?.locator ?? "",
        })),
        contradictions: output.contradictions.map(toRecord),
        relationships: output.relationships.map((item) => ({
          from_title: item.from_title,
          to_title: item.to_title,
          relation_type: item.relation_type,
          evidence_locator: item.locator_refs[0] ?? item.source_refs[0]?.locator ?? "",
        })),
      };
    } catch (error) {
      if (error instanceof StaleCompileJobError) {
        const failure = toStageError("analysis_stale_job", error);

        await this.artifactRepository.updateStageExecution(stageExecutionId, {
          status: "canceled",
          error: failure,
          metadata: {
            stale_reason: error.reason,
            prompt_template: resolvedPrompt.metadata,
          },
          finishedAt: this.now(),
        });
        await this.jobProgress?.updateJobProgress({
          jobId: payload.job_id,
          knowledgeBaseId: payload.knowledge_base_id,
          inputSnapshotId: payload.input_snapshot_id,
          stage: "analyzing",
          status: "canceled",
          progress: 100,
          message: "Analysis stopped because the ingest job is no longer runnable.",
          parsedContentId: payload.parsed_content_id,
          error: failure,
          metadata: {
            prompt_template: resolvedPrompt.metadata,
          },
        });

        return {
          status: "failed",
          should_continue: false,
          knowledge_base_id: payload.knowledge_base_id,
          document_id: payload.document_id,
          parsed_content_id: payload.parsed_content_id,
          analysis_result_id: null,
          prompt_version_id: prompt.id,
          model_call_id: null,
          entities: [],
          concepts: [],
          contradictions: [],
          relationships: [],
        };
      }

      const failureCategory = classifyStageFailure(error);
      const structuredOutputMetadata = readStructuredJsonOutputErrorMetadata(error);
      const structuredOutputAttemptCount = structuredOutputMetadata?.attemptCount ?? 1;
      const structuredOutputMode =
        structuredOutputMetadata?.structuredOutputMode ?? "strict_json_schema";
      const structuredOutputRepairAttempts = readStructuredOutputRepairAttempts(error);
      const structuredOutputValidationIssues = readStructuredOutputValidationIssues(error);
      const fallback =
        failureCategory === "output_validation_failed"
          ? createSourceBackedAnalysisFallbackOutput({
              context: promptContext,
              markdown,
              payload,
              structuredOutputAttemptCount,
              structuredOutputRepairAttempts,
              structuredOutputValidationIssues,
            })
          : null;

      if (fallback !== null && fallback.output !== null) {
        const sourceRefValidation = validateAnalysisSourceRefs(fallback.output, markdown);
        const output = sourceRefValidation.output;
        const sourceRefLocatorValidationMetadata = sourceRefLocatorSummaryToMetadata(
          sourceRefValidation.summary,
        );

        await assertJobCanContinue(this.jobGuard, {
          jobId: payload.job_id,
          knowledgeBaseId: payload.knowledge_base_id,
          inputSnapshotId: payload.input_snapshot_id,
          sourceDocumentId: payload.document_id,
        });

        const modelCall = await this.recordModelCall({
          payload,
          model,
          promptVersionId: prompt.id,
          promptMetadata: resolvedPrompt,
          status: "failed",
          inputSummary: createAnalysisInputSummary(payload, promptContext, markdown),
          outputSummary: createSourceBackedAnalysisFallbackOutputSummary(
            output,
            fallback.metadata,
            sourceRefLocatorValidationMetadata,
          ),
          failureCategory,
          structuredOutputAttemptCount,
          structuredOutputFinalStatus: "source_backed_fallback",
          structuredOutputMode,
          structuredOutputRepairAttempts,
          structuredOutputValidationIssues,
        });
        const analysisResult = await this.artifactRepository.saveAnalysisResult({
          id: this.idFactory("analysis"),
          knowledgeBaseId: payload.knowledge_base_id,
          sourceDocumentId: payload.document_id,
          parsedContentId: payload.parsed_content_id,
          jobId: payload.job_id,
          modelCallId: modelCall.id,
          promptVersionId: prompt.id,
          inputSnapshotId: payload.input_snapshot_id,
          contentHash: payload.content_hash,
          entities: output.entities.map(toRecord),
          concepts: output.concepts.map(toRecord),
          claims: output.claims.map(toRecord),
          contradictions: output.contradictions.map(toRecord),
          relationships: output.relationships.map(toRecord),
          sourceRefs: collectAnalysisSourceRefs(output),
          locatorRefs: collectAnalysisLocatorRefs(output),
          metadata: {
            dataset_configuration_snapshot: datasetConfigurationSnapshot,
            document_name: context.documentName,
            prompt_template: resolvedPrompt.metadata,
            ...sourceMetadata,
            source_ref_locator_validation: sourceRefLocatorValidationMetadata,
            ...fallback.metadata,
          },
        });

        await this.artifactRepository.updateStageExecution(stageExecutionId, {
          status: "completed",
          analysisResultId: analysisResult.id,
          metadata: {
            analysis_result_id: analysisResult.id,
            failure_category: failureCategory,
            model_call_id: modelCall.id,
            prompt_template: resolvedPrompt.metadata,
            source_ref_locator_validation: sourceRefLocatorValidationMetadata,
            structured_output_attempt_count: structuredOutputAttemptCount,
            structured_output_final_status: "source_backed_fallback",
            structured_output_mode: structuredOutputMode,
            structured_output_repair_attempts: structuredOutputRepairAttempts,
            structured_output_validation_issues: structuredOutputValidationIssues,
            ...fallback.metadata,
          },
          finishedAt: this.now(),
        });
        await this.generateQueue.enqueueWikiGenerateJob({
          job_id: payload.job_id,
          knowledge_base_id: payload.knowledge_base_id,
          analysis_result_id: analysisResult.id,
          source_document_ids: [payload.document_id],
          current_knowledge_version_id: context.currentKnowledgeVersionId,
          dataset_configuration_snapshot: datasetConfigurationSnapshot,
          purpose: context.purpose,
          schema: context.schema,
          input_snapshot_id: payload.input_snapshot_id,
        });
        await this.jobProgress?.updateJobProgress({
          jobId: payload.job_id,
          knowledgeBaseId: payload.knowledge_base_id,
          inputSnapshotId: payload.input_snapshot_id,
          stage: "generating",
          status: "running",
          progress: 50,
          message: "Generating wiki drafts from source-backed analysis fallback...",
          parsedContentId: payload.parsed_content_id,
          metadata: {
            analysis_result_id: analysisResult.id,
            entity_count: output.entities.length,
            concept_count: output.concepts.length,
            failure_category: failureCategory,
            model_call_id: modelCall.id,
            prompt_template: resolvedPrompt.metadata,
            relationship_count: output.relationships.length,
            source_ref_locator_validation: sourceRefLocatorValidationMetadata,
            structured_output_attempt_count: structuredOutputAttemptCount,
            structured_output_final_status: "source_backed_fallback",
            structured_output_mode: structuredOutputMode,
            structured_output_repair_attempts: structuredOutputRepairAttempts,
            structured_output_validation_issues: structuredOutputValidationIssues,
            ...fallback.metadata,
          },
        });

        return {
          status: "completed",
          should_continue: true,
          knowledge_base_id: payload.knowledge_base_id,
          document_id: payload.document_id,
          parsed_content_id: payload.parsed_content_id,
          analysis_result_id: analysisResult.id,
          prompt_version_id: prompt.id,
          model_call_id: modelCall.id,
          entities: output.entities.map((item) => ({
            title: item.title,
            evidence_locator: item.locator_refs[0] ?? item.source_refs[0]?.locator ?? "",
          })),
          concepts: output.concepts.map((item) => ({
            title: item.title,
            evidence_locator: item.locator_refs[0] ?? item.source_refs[0]?.locator ?? "",
          })),
          contradictions: output.contradictions.map(toRecord),
          relationships: output.relationships.map((item) => ({
            from_title: item.from_title,
            to_title: item.to_title,
            relation_type: item.relation_type,
            evidence_locator: item.locator_refs[0] ?? item.source_refs[0]?.locator ?? "",
          })),
        };
      }

      const modelCall = await this.recordModelCall({
        payload,
        model,
        promptVersionId: prompt.id,
        promptMetadata: resolvedPrompt,
        status: "failed",
        inputSummary: createAnalysisInputSummary(payload, promptContext, markdown),
        outputSummary: summarizeError(error),
        failureCategory,
        structuredOutputAttemptCount,
        structuredOutputFinalStatus: "failed",
        structuredOutputMode,
        structuredOutputRepairAttempts,
        structuredOutputValidationIssues,
      });
      const failure = toStageError("analysis_failed", error);

      await this.artifactRepository.updateStageExecution(stageExecutionId, {
        status: "failed",
        error: failure,
        metadata: {
          failure_category: failureCategory,
          model_call_id: modelCall.id,
          prompt_template: resolvedPrompt.metadata,
          structured_output_attempt_count: structuredOutputAttemptCount,
          structured_output_final_status: "failed",
          structured_output_mode: structuredOutputMode,
          structured_output_repair_attempts: structuredOutputRepairAttempts,
          structured_output_validation_issues: structuredOutputValidationIssues,
          ...(fallback === null ? {} : fallback.metadata),
        },
        finishedAt: this.now(),
      });
      await this.jobProgress?.updateJobProgress({
        jobId: payload.job_id,
        knowledgeBaseId: payload.knowledge_base_id,
        inputSnapshotId: payload.input_snapshot_id,
        stage: "analyzing",
        status: "failed",
        progress: 35,
        message: "Analysis failed.",
        parsedContentId: payload.parsed_content_id,
        error: failure,
        metadata: {
          failure_category: failureCategory,
          model_call_id: modelCall.id,
          prompt_template: resolvedPrompt.metadata,
          structured_output_attempt_count: structuredOutputAttemptCount,
          structured_output_final_status: "failed",
          structured_output_mode: structuredOutputMode,
          structured_output_repair_attempts: structuredOutputRepairAttempts,
          structured_output_validation_issues: structuredOutputValidationIssues,
          ...(fallback === null ? {} : fallback.metadata),
        },
      });

      return {
        status: "failed",
        should_continue: false,
        knowledge_base_id: payload.knowledge_base_id,
        document_id: payload.document_id,
        parsed_content_id: payload.parsed_content_id,
        analysis_result_id: null,
        prompt_version_id: prompt.id,
        model_call_id: modelCall.id,
        entities: [],
        concepts: [],
        contradictions: [],
        relationships: [],
      };
    }
  }

  private async readParsedMarkdown(
    objectKey: string,
  ): Promise<
    { kind: "success"; text: string } | { kind: "fatal"; error: Record<string, unknown> }
  > {
    const object = await this.objectStorage.getObject({
      key: objectKey,
    });
    const body = await readBodyAsStringWithinLimit(
      object.body,
      object.contentLength,
      this.maxParsedMarkdownBytes,
      objectKey,
    );

    if (body.kind === "fatal") {
      return {
        kind: "fatal",
        error: {
          code: "wiki_analyze_markdown_limit_exceeded",
          object_key: objectKey,
          actual_bytes: body.actualBytes,
          limit_bytes: body.limitBytes,
        },
      };
    }

    return {
      kind: "success",
      text: body.text,
    };
  }

  private async recordModelCall(input: {
    payload: WikiAnalyzePayload;
    model: string;
    promptVersionId: string;
    promptMetadata: ResolvedDatasetPromptTemplate;
    status: "succeeded" | "failed";
    inputSummary: string;
    outputSummary: string;
    usage?: ModelCallUsage;
    failureCategory?: string;
    structuredOutputAttemptCount?: number;
    structuredOutputFinalStatus?: "succeeded" | "failed" | "source_backed_fallback";
    structuredOutputMode?: StructuredOutputMode;
    structuredOutputRepairAttempts?: number;
    structuredOutputValidationIssues?: readonly string[];
  }) {
    return this.artifactRepository.recordModelCall({
      id: this.idFactory("model_call"),
      knowledgeBaseId: input.payload.knowledge_base_id,
      sourceDocumentId: input.payload.document_id,
      parsedContentId: input.payload.parsed_content_id,
      jobId: input.payload.job_id,
      changeSetId: null,
      providerName: this.chatProvider.profile.providerName,
      model: input.model,
      promptVersionId: input.promptVersionId,
      workflowKind: "analysis",
      outputStatus: input.status,
      inputSummary: input.inputSummary,
      outputSummary: input.outputSummary,
      usage: input.usage === undefined ? {} : { ...input.usage },
      costEstimateUsd: null,
      metadata: {
        ...(input.failureCategory === undefined ? {} : { failure_category: input.failureCategory }),
        prompt_template: input.promptMetadata.metadata,
        ...(input.structuredOutputAttemptCount === undefined
          ? {}
          : { structured_output_attempt_count: input.structuredOutputAttemptCount }),
        ...(input.structuredOutputFinalStatus === undefined
          ? {}
          : { structured_output_final_status: input.structuredOutputFinalStatus }),
        ...(input.structuredOutputMode === undefined
          ? {}
          : { structured_output_mode: input.structuredOutputMode }),
        ...(input.structuredOutputRepairAttempts === undefined
          ? {}
          : {
              structured_output_repair_attempts: input.structuredOutputRepairAttempts,
            }),
        ...(input.structuredOutputValidationIssues === undefined
          ? {}
          : {
              structured_output_validation_issues: [...input.structuredOutputValidationIssues],
            }),
      },
      createdAt: this.now(),
    });
  }
}

export class WikiGenerateProcessorService implements WikiGenerateProcessor {
  private readonly artifactRepository: CompileArtifactRepository;
  private readonly chatProvider: ChatProvider;
  private readonly mergeQueue: WikiMergeQueue;
  private readonly jobProgress: WorkerJobProgressWriter | undefined;
  private readonly jobGuard: WorkerJobStateGuard | undefined;
  private readonly promptLimits: CompilePromptLimits;
  private readonly idFactory: (scope: string) => string;
  private readonly now: () => string;

  constructor(options: WikiGenerateProcessorServiceOptions) {
    this.artifactRepository = options.artifactRepository;
    this.chatProvider = options.chatProvider;
    this.mergeQueue = options.mergeQueue;
    this.jobProgress = options.jobProgress;
    this.jobGuard = options.jobGuard;
    this.promptLimits = options.promptLimits;
    this.idFactory = options.idFactory ?? createWorkerId;
    this.now = options.now ?? (() => new Date().toISOString());
  }

  async process(payload: WikiGeneratePayload): Promise<WikiGenerateProcessorResult> {
    await assertJobCanContinue(this.jobGuard, {
      jobId: payload.job_id,
      knowledgeBaseId: payload.knowledge_base_id,
      inputSnapshotId: payload.input_snapshot_id,
      sourceDocumentId: payload.source_document_ids[0] ?? null,
    });

    const resolvedPrompt = resolveDatasetPromptTemplateFromSnapshot({
      purpose: "generation",
      datasetConfigurationSnapshot: payload.dataset_configuration_snapshot,
    });
    const prompt = resolvedPrompt.prompt;
    const analysis = await this.artifactRepository.findAnalysisResultById(
      payload.analysis_result_id,
    );

    if (analysis === null) {
      throw new Error(`Analysis Result not found for generation: ${payload.analysis_result_id}`);
    }

    const stageExecutionId = this.idFactory("compile_stage");
    const startedAt = this.now();

    await this.artifactRepository.saveStageExecution({
      id: stageExecutionId,
      knowledgeBaseId: payload.knowledge_base_id,
      jobId: payload.job_id,
      stage: "generating",
      status: "running",
      queueName: wikiGenerateQueueName,
      queueJobId: `${payload.job_id}:generate:${payload.analysis_result_id}`,
      inputSnapshotId: payload.input_snapshot_id,
      sourceDocumentId: analysis.sourceDocumentId,
      parsedContentId: analysis.parsedContentId,
      analysisResultId: payload.analysis_result_id,
      draftCandidateId: null,
      error: null,
      metadata: {},
      startedAt,
      finishedAt: null,
      createdAt: startedAt,
      updatedAt: startedAt,
    });
    await this.jobProgress?.updateJobProgress({
      jobId: payload.job_id,
      knowledgeBaseId: payload.knowledge_base_id,
      inputSnapshotId: payload.input_snapshot_id,
      stage: "generating",
      status: "running",
      progress: 55,
      message: "Generating wiki drafts...",
      parsedContentId: analysis.parsedContentId,
      metadata: {
        analysis_result_id: payload.analysis_result_id,
      },
    });

    const model = resolveChatModel(this.chatProvider.profile, prompt.modelPurpose);

    try {
      const generation = await completeGenerationWithStructuredOutputRepair({
        chatProvider: this.chatProvider,
        model,
        messages: createGenerationMessages(payload, analysis, this.promptLimits, prompt.template),
      });
      const sourceRefValidation = validateGenerationSourceRefsFromAnalysis(
        generation.output,
        enrichSourceRefsWithSourceAnchorIdentity(analysis.sourceRefs, analysis.parsedContentId),
      );
      const output = sourceRefValidation.output;
      const sourceRefLocatorValidationMetadata = sourceRefLocatorSummaryToMetadata(
        sourceRefValidation.summary,
      );

      await assertJobCanContinue(this.jobGuard, {
        jobId: payload.job_id,
        knowledgeBaseId: payload.knowledge_base_id,
        inputSnapshotId: payload.input_snapshot_id,
        sourceDocumentId: payload.source_document_ids[0] ?? null,
      });

      const modelCall = await this.recordModelCall({
        payload,
        model,
        promptVersionId: prompt.id,
        promptMetadata: resolvedPrompt,
        status: "succeeded",
        inputSummary: createGenerationInputSummary(payload, analysis),
        outputSummary: createGenerationOutputSummary(
          output,
          generation.repairAttempts,
          sourceRefLocatorValidationMetadata,
        ),
        structuredOutputRepairAttempts: generation.repairAttempts,
        structuredOutputAttemptCount: generation.attemptCount,
        structuredOutputMode: generation.structuredOutputMode,
        structuredOutputValidationIssues: generation.validationIssues,
        structuredOutputFinalStatus: "succeeded",
        ...(generation.completion.usage === undefined
          ? {}
          : { usage: generation.completion.usage }),
      });
      const savedDrafts = [];
      const sourceAnchorDraft = createSourceAnchorGenerationDraft(payload, analysis);
      const drafts =
        sourceAnchorDraft === null ? output.drafts : [sourceAnchorDraft, ...output.drafts];

      for (const draft of drafts) {
        const enrichedDraft = enrichGeneratedDraftWithSourceMetadata(draft, analysis.metadata);
        const saved = await this.artifactRepository.saveDraftCandidate({
          id: this.idFactory("draft"),
          knowledgeBaseId: payload.knowledge_base_id,
          analysisResultId: payload.analysis_result_id,
          jobId: payload.job_id,
          modelCallId: modelCall.id,
          promptVersionId: prompt.id,
          inputSnapshotId: payload.input_snapshot_id,
          sourceDocumentIds: payload.source_document_ids,
          pageType: enrichedDraft.page_type,
          title: enrichedDraft.title,
          slug: createGeneratedDraftSlug(enrichedDraft),
          markdown: enrichedDraft.markdown,
          frontmatter: enrichedDraft.frontmatter,
          sourceRefs: enrichedDraft.source_refs.map(toRecord),
          locatorRefs: enrichedDraft.locator_refs.map((locator) => ({ locator })),
          relationshipCandidates: enrichedDraft.relationship_candidates.map(toRecord),
          confidence: enrichedDraft.confidence,
          status: "ready_for_merge",
          targetPageId: null,
          changeSetId: null,
          metadata: {
            ...(enrichedDraft.page_type === "source"
              ? {
                  generation_mode: "source_anchor",
                  source_anchor_id: readString(
                    normalizeRecord(enrichedDraft.frontmatter.source_anchor)?.id,
                  ),
                }
              : {}),
            merge_risk: {
              confidence: enrichedDraft.confidence,
              low_confidence: enrichedDraft.confidence === null || enrichedDraft.confidence < 0.85,
            },
            prompt_template: resolvedPrompt.metadata,
            source_ref_locator_validation: sourceRefLocatorValidationMetadata,
          },
        });

        savedDrafts.push(saved);

        await this.mergeQueue.enqueueWikiMergeJob({
          job_id: payload.job_id,
          knowledge_base_id: payload.knowledge_base_id,
          wiki_draft_id: saved.id,
          target_page_id: null,
          current_knowledge_version_id: payload.current_knowledge_version_id,
          dataset_configuration_snapshot: payload.dataset_configuration_snapshot ?? null,
          input_snapshot_id: payload.input_snapshot_id,
          merge_candidate_count: drafts.length,
          merge_candidate_index: savedDrafts.length - 1,
        });
      }

      await this.artifactRepository.updateStageExecution(stageExecutionId, {
        status: "completed",
        draftCandidateId: savedDrafts[0]?.id ?? null,
        metadata: {
          draft_ids: savedDrafts.map((draft) => draft.id),
          source_anchor_created: sourceAnchorDraft !== null,
          model_call_id: modelCall.id,
          structured_output_attempt_count: generation.attemptCount,
          structured_output_final_status: "succeeded",
          structured_output_mode: generation.structuredOutputMode,
          structured_output_repair_attempts: generation.repairAttempts,
          structured_output_validation_issues: generation.validationIssues,
          prompt_template: resolvedPrompt.metadata,
          source_ref_locator_validation: sourceRefLocatorValidationMetadata,
        },
        finishedAt: this.now(),
      });
      await this.jobProgress?.updateJobProgress({
        jobId: payload.job_id,
        knowledgeBaseId: payload.knowledge_base_id,
        inputSnapshotId: payload.input_snapshot_id,
        stage: "merging",
        status: "running",
        progress: 70,
        message: "Merging generated wiki drafts...",
        metadata: {
          draft_count: savedDrafts.length,
          source_anchor_created: sourceAnchorDraft !== null,
          structured_output_attempt_count: generation.attemptCount,
          structured_output_final_status: "succeeded",
          structured_output_mode: generation.structuredOutputMode,
          structured_output_repair_attempts: generation.repairAttempts,
          structured_output_validation_issues: generation.validationIssues,
          prompt_template: resolvedPrompt.metadata,
          source_ref_locator_validation: sourceRefLocatorValidationMetadata,
        },
      });

      return {
        status: "completed",
        should_continue: savedDrafts.length > 0,
        knowledge_base_id: payload.knowledge_base_id,
        analysis_result_id: payload.analysis_result_id,
        wiki_draft_ids: savedDrafts.map((draft) => draft.id),
        prompt_version_id: prompt.id,
        model_call_id: modelCall.id,
      };
    } catch (error) {
      if (error instanceof StaleCompileJobError) {
        const failure = toStageError("generation_stale_job", error);

        await this.artifactRepository.updateStageExecution(stageExecutionId, {
          status: "canceled",
          error: failure,
          metadata: {
            stale_reason: error.reason,
          },
          finishedAt: this.now(),
        });
        await this.jobProgress?.updateJobProgress({
          jobId: payload.job_id,
          knowledgeBaseId: payload.knowledge_base_id,
          inputSnapshotId: payload.input_snapshot_id,
          stage: "generating",
          status: "canceled",
          progress: 100,
          message: "Generation stopped because the ingest job is no longer runnable.",
          error: failure,
        });

        return {
          status: "failed",
          should_continue: false,
          knowledge_base_id: payload.knowledge_base_id,
          analysis_result_id: payload.analysis_result_id,
          wiki_draft_ids: [],
          prompt_version_id: prompt.id,
          model_call_id: null,
        };
      }

      const failureCategory = classifyStageFailure(error);
      const structuredOutputMetadata = readStructuredJsonOutputErrorMetadata(error);
      const structuredOutputAttemptCount = structuredOutputMetadata?.attemptCount ?? 1;
      const structuredOutputMode =
        structuredOutputMetadata?.structuredOutputMode ?? "strict_json_schema";
      const structuredOutputRepairAttempts = readStructuredOutputRepairAttempts(error);
      const structuredOutputValidationIssues = readStructuredOutputValidationIssues(error);
      const fallbackResult = isGenerationStructuredOutputRepairExhausted(error)
        ? await this.createSourceBackedFallbackAfterRepairExhaustion({
            analysis,
            failureCategory,
            model,
            payload,
            promptMetadata: resolvedPrompt,
            promptVersionId: prompt.id,
            stageExecutionId,
            structuredOutputAttemptCount,
            structuredOutputMode,
            structuredOutputRepairAttempts,
            structuredOutputValidationIssues,
          })
        : null;

      if (fallbackResult !== null) {
        return fallbackResult;
      }

      const modelCall = await this.recordModelCall({
        payload,
        model,
        promptVersionId: prompt.id,
        promptMetadata: resolvedPrompt,
        status: "failed",
        inputSummary: createGenerationInputSummary(payload, analysis),
        outputSummary: summarizeError(error),
        failureCategory,
        structuredOutputAttemptCount,
        structuredOutputMode,
        structuredOutputRepairAttempts,
        structuredOutputValidationIssues,
        structuredOutputFinalStatus: "failed",
      });
      const failure = toStageError("generation_failed", error);

      await this.artifactRepository.updateStageExecution(stageExecutionId, {
        status: "failed",
        error: failure,
        metadata: {
          failure_category: failureCategory,
          model_call_id: modelCall.id,
          prompt_template: resolvedPrompt.metadata,
          structured_output_attempt_count: structuredOutputAttemptCount,
          structured_output_final_status: "failed",
          structured_output_mode: structuredOutputMode,
          structured_output_repair_attempts: structuredOutputRepairAttempts,
          structured_output_validation_issues: structuredOutputValidationIssues,
        },
        finishedAt: this.now(),
      });
      await this.jobProgress?.updateJobProgress({
        jobId: payload.job_id,
        knowledgeBaseId: payload.knowledge_base_id,
        inputSnapshotId: payload.input_snapshot_id,
        stage: "generating",
        status: "failed",
        progress: 55,
        message: "Generation failed.",
        error: failure,
        metadata: {
          failure_category: failureCategory,
          model_call_id: modelCall.id,
          prompt_template: resolvedPrompt.metadata,
          structured_output_attempt_count: structuredOutputAttemptCount,
          structured_output_final_status: "failed",
          structured_output_mode: structuredOutputMode,
          structured_output_repair_attempts: structuredOutputRepairAttempts,
          structured_output_validation_issues: structuredOutputValidationIssues,
        },
      });

      return {
        status: "failed",
        should_continue: false,
        knowledge_base_id: payload.knowledge_base_id,
        analysis_result_id: payload.analysis_result_id,
        wiki_draft_ids: [],
        prompt_version_id: prompt.id,
        model_call_id: modelCall.id,
      };
    }
  }

  private async createSourceBackedFallbackAfterRepairExhaustion(input: {
    analysis: Awaited<ReturnType<CompileArtifactRepository["findAnalysisResultById"]>> & {};
    failureCategory: string;
    model: string;
    payload: WikiGeneratePayload;
    promptMetadata: ResolvedDatasetPromptTemplate;
    promptVersionId: string;
    stageExecutionId: string;
    structuredOutputAttemptCount: number;
    structuredOutputMode: StructuredOutputMode;
    structuredOutputRepairAttempts: number;
    structuredOutputValidationIssues: readonly string[];
  }): Promise<WikiGenerateProcessorResult | null> {
    const sourceFallbackOutput = createSourceBackedFallbackGenerationOutput(
      input.payload,
      input.analysis,
    );

    if (sourceFallbackOutput === null) {
      return null;
    }

    const sourceRefValidation = validateGenerationSourceRefsFromAnalysis(
      sourceFallbackOutput,
      enrichSourceRefsWithSourceAnchorIdentity(
        input.analysis.sourceRefs,
        input.analysis.parsedContentId,
      ),
    );
    const fallbackDraft = sourceRefValidation.output.drafts[0];

    if (fallbackDraft === undefined) {
      return null;
    }

    const sourceRefLocatorValidationMetadata = sourceRefLocatorSummaryToMetadata(
      sourceRefValidation.summary,
    );
    const enrichedFallbackDraft = enrichGeneratedDraftWithSourceMetadata(
      fallbackDraft,
      input.analysis.metadata,
    );
    const modelCall = await this.recordModelCall({
      payload: input.payload,
      model: input.model,
      promptVersionId: input.promptVersionId,
      promptMetadata: input.promptMetadata,
      status: "failed",
      inputSummary: createGenerationInputSummary(input.payload, input.analysis),
      outputSummary:
        "Model generation output was skipped after structured-output repair exhaustion; a source-backed fallback draft was created.",
      failureCategory: input.failureCategory,
      structuredOutputAttemptCount: input.structuredOutputAttemptCount,
      structuredOutputMode: input.structuredOutputMode,
      structuredOutputRepairAttempts: input.structuredOutputRepairAttempts,
      structuredOutputValidationIssues: input.structuredOutputValidationIssues,
      structuredOutputFinalStatus: "skipped_with_fallback",
    });
    const saved = await this.artifactRepository.saveDraftCandidate({
      id: this.idFactory("draft"),
      knowledgeBaseId: input.payload.knowledge_base_id,
      analysisResultId: input.payload.analysis_result_id,
      jobId: input.payload.job_id,
      modelCallId: modelCall.id,
      promptVersionId: input.promptVersionId,
      inputSnapshotId: input.payload.input_snapshot_id,
      sourceDocumentIds: input.payload.source_document_ids,
      pageType: enrichedFallbackDraft.page_type,
      title: enrichedFallbackDraft.title,
      slug: createGeneratedDraftSlug(enrichedFallbackDraft),
      markdown: enrichedFallbackDraft.markdown,
      frontmatter: enrichedFallbackDraft.frontmatter,
      sourceRefs: enrichedFallbackDraft.source_refs.map(toRecord),
      locatorRefs: enrichedFallbackDraft.locator_refs.map((locator) => ({ locator })),
      relationshipCandidates: [],
      confidence: enrichedFallbackDraft.confidence,
      status: "ready_for_merge",
      targetPageId: null,
      changeSetId: null,
      metadata: {
        generation_mode: "source_fallback",
        merge_risk: {
          confidence: enrichedFallbackDraft.confidence,
          low_confidence: true,
        },
        prompt_template: input.promptMetadata.metadata,
        source_ref_locator_validation: sourceRefLocatorValidationMetadata,
        structured_output_final_status: "skipped_with_fallback",
      },
    });

    await this.mergeQueue.enqueueWikiMergeJob({
      job_id: input.payload.job_id,
      knowledge_base_id: input.payload.knowledge_base_id,
      wiki_draft_id: saved.id,
      target_page_id: null,
      current_knowledge_version_id: input.payload.current_knowledge_version_id,
      dataset_configuration_snapshot: input.payload.dataset_configuration_snapshot ?? null,
      input_snapshot_id: input.payload.input_snapshot_id,
      merge_candidate_count: 1,
      merge_candidate_index: 0,
    });

    await this.artifactRepository.updateStageExecution(input.stageExecutionId, {
      status: "completed",
      draftCandidateId: saved.id,
      metadata: {
        draft_ids: [saved.id],
        fallback_mode: "source_fallback",
        failure_category: input.failureCategory,
        model_call_id: modelCall.id,
        prompt_template: input.promptMetadata.metadata,
        structured_output_attempt_count: input.structuredOutputAttemptCount,
        structured_output_final_status: "skipped_with_fallback",
        structured_output_mode: input.structuredOutputMode,
        structured_output_repair_attempts: input.structuredOutputRepairAttempts,
        structured_output_validation_issues: [...input.structuredOutputValidationIssues],
        source_ref_locator_validation: sourceRefLocatorValidationMetadata,
      },
      finishedAt: this.now(),
    });
    await this.jobProgress?.updateJobProgress({
      jobId: input.payload.job_id,
      knowledgeBaseId: input.payload.knowledge_base_id,
      inputSnapshotId: input.payload.input_snapshot_id,
      stage: "merging",
      status: "running",
      progress: 70,
      message: "Merging source-backed fallback wiki draft...",
      metadata: {
        draft_count: 1,
        fallback_mode: "source_fallback",
        failure_category: input.failureCategory,
        model_call_id: modelCall.id,
        prompt_template: input.promptMetadata.metadata,
        structured_output_attempt_count: input.structuredOutputAttemptCount,
        structured_output_final_status: "skipped_with_fallback",
        structured_output_mode: input.structuredOutputMode,
        structured_output_repair_attempts: input.structuredOutputRepairAttempts,
        structured_output_validation_issues: [...input.structuredOutputValidationIssues],
        source_ref_locator_validation: sourceRefLocatorValidationMetadata,
      },
    });

    return {
      status: "completed",
      should_continue: true,
      knowledge_base_id: input.payload.knowledge_base_id,
      analysis_result_id: input.payload.analysis_result_id,
      wiki_draft_ids: [saved.id],
      prompt_version_id: input.promptVersionId,
      model_call_id: modelCall.id,
    };
  }

  private async recordModelCall(input: {
    payload: WikiGeneratePayload;
    model: string;
    promptVersionId: string;
    promptMetadata: ResolvedDatasetPromptTemplate;
    status: "succeeded" | "failed";
    inputSummary: string;
    outputSummary: string;
    usage?: ModelCallUsage;
    failureCategory?: string;
    structuredOutputAttemptCount?: number;
    structuredOutputMode?: StructuredOutputMode;
    structuredOutputRepairAttempts?: number;
    structuredOutputValidationIssues?: readonly string[];
    structuredOutputFinalStatus?: "succeeded" | "failed" | "skipped_with_fallback";
  }) {
    return this.artifactRepository.recordModelCall({
      id: this.idFactory("model_call"),
      knowledgeBaseId: input.payload.knowledge_base_id,
      sourceDocumentId: input.payload.source_document_ids[0] ?? null,
      parsedContentId: null,
      jobId: input.payload.job_id,
      changeSetId: null,
      providerName: this.chatProvider.profile.providerName,
      model: input.model,
      promptVersionId: input.promptVersionId,
      workflowKind: "generation",
      outputStatus: input.status,
      inputSummary: input.inputSummary,
      outputSummary: input.outputSummary,
      usage: input.usage === undefined ? {} : { ...input.usage },
      costEstimateUsd: null,
      metadata: {
        analysis_result_id: input.payload.analysis_result_id,
        dataset_configuration_snapshot: input.payload.dataset_configuration_snapshot ?? null,
        ...(input.failureCategory === undefined ? {} : { failure_category: input.failureCategory }),
        prompt_template: input.promptMetadata.metadata,
        ...(input.structuredOutputFinalStatus === undefined
          ? {}
          : { structured_output_final_status: input.structuredOutputFinalStatus }),
        ...(input.structuredOutputAttemptCount === undefined
          ? {}
          : { structured_output_attempt_count: input.structuredOutputAttemptCount }),
        ...(input.structuredOutputMode === undefined
          ? {}
          : { structured_output_mode: input.structuredOutputMode }),
        ...(input.structuredOutputRepairAttempts === undefined
          ? {}
          : {
              structured_output_repair_attempts: input.structuredOutputRepairAttempts,
            }),
        ...(input.structuredOutputValidationIssues === undefined
          ? {}
          : {
              structured_output_validation_issues: [...input.structuredOutputValidationIssues],
            }),
      },
      createdAt: this.now(),
    });
  }
}

export class WikiMergeProcessorService implements WikiMergeProcessor {
  private readonly artifactRepository: CompileArtifactRepository;
  private readonly applier: WikiMergeApplier;
  private readonly jobProgress: WorkerJobProgressWriter | undefined;
  private readonly jobGuard: WorkerJobStateGuard | undefined;
  private readonly idFactory: (scope: string) => string;
  private readonly now: () => string;

  constructor(options: WikiMergeProcessorServiceOptions) {
    this.artifactRepository = options.artifactRepository;
    this.applier = options.applier;
    this.jobProgress = options.jobProgress;
    this.jobGuard = options.jobGuard;
    this.idFactory = options.idFactory ?? createWorkerId;
    this.now = options.now ?? (() => new Date().toISOString());
  }

  async process(payload: WikiMergePayload): Promise<WikiMergeProcessorResult> {
    await assertJobCanContinue(this.jobGuard, {
      jobId: payload.job_id,
      knowledgeBaseId: payload.knowledge_base_id,
      inputSnapshotId: payload.input_snapshot_id,
    });
    const resolvedPrompt = resolveDatasetPromptTemplateFromSnapshot({
      purpose: "merge",
      datasetConfigurationSnapshot: payload.dataset_configuration_snapshot,
    });

    const draft = await this.artifactRepository.findDraftCandidateById(payload.wiki_draft_id);

    if (draft === null) {
      throw new Error(`Wiki Draft Candidate not found for merge: ${payload.wiki_draft_id}`);
    }
    if (draft.status !== "ready_for_merge") {
      throw new Error(`Wiki Draft Candidate is not ready for merge: ${payload.wiki_draft_id}`);
    }

    const sourceRefValidation = validatePersistedSourceRefs(draft.sourceRefs);
    const sourceRefLocatorValidationMetadata = sourceRefLocatorSummaryToMetadata(
      sourceRefValidation.summary,
    );
    const mergeDraft = {
      ...draft,
      sourceRefs: sourceRefValidation.sourceRefs.map(toRecord),
    };
    const stageExecutionId = this.idFactory("compile_stage");
    const startedAt = this.now();

    await this.artifactRepository.saveStageExecution({
      id: stageExecutionId,
      knowledgeBaseId: payload.knowledge_base_id,
      jobId: payload.job_id,
      stage: "merging",
      status: "running",
      queueName: wikiMergeQueueName,
      queueJobId: `${payload.job_id}:merge:${payload.wiki_draft_id}`,
      inputSnapshotId: payload.input_snapshot_id,
      sourceDocumentId: draft.sourceDocumentIds[0] ?? null,
      parsedContentId: null,
      analysisResultId: draft.analysisResultId,
      draftCandidateId: draft.id,
      error: null,
      metadata: {
        prompt_template: resolvedPrompt.metadata,
        source_ref_locator_validation: sourceRefLocatorValidationMetadata,
      },
      startedAt,
      finishedAt: null,
      createdAt: startedAt,
      updatedAt: startedAt,
    });
    await this.jobProgress?.updateJobProgress({
      jobId: payload.job_id,
      knowledgeBaseId: payload.knowledge_base_id,
      inputSnapshotId: payload.input_snapshot_id,
      stage: "merging",
      status: "running",
      progress: 80,
      message: "Applying generated wiki draft...",
      metadata: {
        draft_candidate_id: draft.id,
        prompt_template: resolvedPrompt.metadata,
        source_ref_locator_validation: sourceRefLocatorValidationMetadata,
      },
    });

    try {
      const assertMergeCanContinue = () =>
        assertJobCanContinue(this.jobGuard, {
          jobId: payload.job_id,
          knowledgeBaseId: payload.knowledge_base_id,
          inputSnapshotId: payload.input_snapshot_id,
          sourceDocumentId: draft.sourceDocumentIds[0] ?? null,
        });

      await assertMergeCanContinue();
      const applied = await this.applier.applyDraft({
        assertCanContinue: assertMergeCanContinue,
        draft: mergeDraft,
        currentKnowledgeVersionId: payload.current_knowledge_version_id,
        targetPageId: payload.target_page_id,
      });

      await this.artifactRepository.saveDraftCandidate({
        ...mergeDraft,
        status: "applied",
        changeSetId: applied.changeSetId,
        updatedAt: this.now(),
      });
      await this.artifactRepository.updateStageExecution(stageExecutionId, {
        status: "completed",
        metadata: {
          page_merge_record_id: applied.pageMergeRecordId,
          change_set_id: applied.changeSetId,
          knowledge_version_id: applied.knowledgeVersionId,
          prompt_template: resolvedPrompt.metadata,
          source_ref_locator_validation: sourceRefLocatorValidationMetadata,
        },
        finishedAt: this.now(),
      });
      const mergeCandidateCount = normalizeMergeCandidateCount(payload.merge_candidate_count);
      const mergeCandidateIndex = normalizeMergeCandidateIndex(
        payload.merge_candidate_index,
        mergeCandidateCount,
      );
      const isFinalMergeCandidate = mergeCandidateIndex >= mergeCandidateCount - 1;

      await this.jobProgress?.updateJobProgress({
        jobId: payload.job_id,
        knowledgeBaseId: payload.knowledge_base_id,
        inputSnapshotId: payload.input_snapshot_id,
        stage: "indexing",
        status: isFinalMergeCandidate ? "completed" : "running",
        progress: isFinalMergeCandidate ? 100 : 90,
        message: isFinalMergeCandidate
          ? "Compile pipeline completed."
          : "Indexing applied wiki draft...",
        changeSetId: applied.changeSetId,
        metadata: {
          draft_candidate_id: draft.id,
          merge_candidate_count: mergeCandidateCount,
          merge_candidate_index: mergeCandidateIndex,
          prompt_template: resolvedPrompt.metadata,
          source_ref_locator_validation: sourceRefLocatorValidationMetadata,
          page_merge_record_id: applied.pageMergeRecordId,
          knowledge_version_id: applied.knowledgeVersionId,
          indexed_embedding_count: applied.indexedEmbeddingCount,
          graph_index_status: "ready",
          retrieve_readiness: {
            ready: true,
            reason: "page_indexed",
          },
          system_page_updates: {
            status: "updated",
            updated_count: applied.updatedSystemPageCount ?? 1,
          },
        },
      });

      return {
        status: "completed",
        should_continue: true,
        knowledge_base_id: payload.knowledge_base_id,
        wiki_draft_id: payload.wiki_draft_id,
        page_merge_record_id: applied.pageMergeRecordId,
        change_set_id: applied.changeSetId,
        prompt_version_id: resolvedPrompt.prompt.id,
        model_call_id: null,
        merge_summary: applied.mergeSummary,
      };
    } catch (error) {
      if (error instanceof StaleCompileJobError) {
        const failure = toStageError("merge_stale_job", error);

        await this.artifactRepository.updateStageExecution(stageExecutionId, {
          status: "canceled",
          error: failure,
          metadata: {
            draft_candidate_id: draft.id,
            stale_reason: error.reason,
            prompt_template: resolvedPrompt.metadata,
          },
          finishedAt: this.now(),
        });
        await this.jobProgress?.updateJobProgress({
          jobId: payload.job_id,
          knowledgeBaseId: payload.knowledge_base_id,
          inputSnapshotId: payload.input_snapshot_id,
          stage: "merging",
          status: "canceled",
          progress: 100,
          message: "Merge stopped because the ingest job is no longer runnable.",
          error: failure,
          metadata: {
            draft_candidate_id: draft.id,
            prompt_template: resolvedPrompt.metadata,
          },
        });

        return {
          status: "failed",
          should_continue: false,
          knowledge_base_id: payload.knowledge_base_id,
          wiki_draft_id: payload.wiki_draft_id,
          page_merge_record_id: null,
          change_set_id: null,
          prompt_version_id: resolvedPrompt.prompt.id,
          model_call_id: null,
          merge_summary: String(failure.message ?? "Merge stopped."),
        };
      }

      const failure = toStageError("merge_failed", error);

      await this.artifactRepository.updateStageExecution(stageExecutionId, {
        status: "failed",
        error: failure,
        metadata: {
          prompt_template: resolvedPrompt.metadata,
        },
        finishedAt: this.now(),
      });
      await this.jobProgress?.updateJobProgress({
        jobId: payload.job_id,
        knowledgeBaseId: payload.knowledge_base_id,
        inputSnapshotId: payload.input_snapshot_id,
        stage: "merging",
        status: "failed",
        progress: 80,
        message: "Merge failed.",
        error: failure,
        metadata: {
          draft_candidate_id: draft.id,
          prompt_template: resolvedPrompt.metadata,
        },
      });

      return {
        status: "failed",
        should_continue: false,
        knowledge_base_id: payload.knowledge_base_id,
        wiki_draft_id: payload.wiki_draft_id,
        page_merge_record_id: null,
        change_set_id: null,
        prompt_version_id: resolvedPrompt.prompt.id,
        model_call_id: null,
        merge_summary: summarizeError(error),
      };
    }
  }
}

export class PostgresWikiMergeApplier implements WikiMergeApplier {
  constructor(
    private readonly db: Kysely<DatabaseSchema>,
    private readonly idFactory: (scope: string) => string = createWorkerId,
    private readonly embeddingIndexer?: WikiPageEmbeddingIndexer,
  ) {}

  async applyDraft(input: WikiMergeApplyInput): Promise<WikiMergeApplyResult> {
    await input.assertCanContinue?.();

    const applied = await this.db.transaction().execute(async (trx) => {
      await sql`
        select pg_advisory_xact_lock(hashtext(${`wiki.merge:${input.draft.knowledgeBaseId}`}))
      `.execute(trx);

      return this.applyDraftTransaction(input, trx);
    });

    await input.assertCanContinue?.();
    await this.refreshDerivedGraphSignalEdges(
      input.draft.knowledgeBaseId,
      applied.changeSetId,
      applied.knowledgeVersionId,
    );

    await input.assertCanContinue?.();

    const indexedEmbeddingCount =
      (await this.embeddingIndexer?.indexPage({
        knowledgeBaseId: input.draft.knowledgeBaseId,
        pageId: applied.pageId,
        pageVersionId: applied.pageVersionId,
        objectType: "page",
        title: input.draft.title,
        markdown: input.draft.markdown,
        pageType: input.draft.pageType,
      })) ?? 0;

    return {
      pageMergeRecordId: applied.pageMergeRecordId,
      changeSetId: applied.changeSetId,
      knowledgeVersionId: applied.knowledgeVersionId,
      indexedEmbeddingCount,
      updatedSystemPageCount: applied.updatedSystemPageCount,
      mergeSummary: applied.mergeSummary,
    };
  }

  private async applyDraftTransaction(
    input: WikiMergeApplyInput,
    db: Kysely<DatabaseSchema> | Transaction<DatabaseSchema>,
  ): Promise<{
    pageId: string;
    pageVersionId: string;
    pageMergeRecordId: string;
    changeSetId: string;
    knowledgeVersionId: string;
    updatedSystemPageCount: number;
    mergeSummary: string;
  }> {
    await input.assertCanContinue?.();

    const now = new Date().toISOString();
    const pageId = input.targetPageId ?? (await this.resolvePageId(input.draft, db));
    const pageVersionId = this.idFactory("page_version");
    const changeSetId = this.idFactory("change_set");
    const knowledgeVersionId = this.idFactory("knowledge_version");
    const pageMergeRecordId = this.idFactory("page_merge_record");
    const pageVersionNumber = await this.nextPageVersionNumber(pageId, db);
    const knowledgeVersionNumber = await this.nextKnowledgeVersionNumber(
      input.draft.knowledgeBaseId,
      db,
    );
    const operation = pageVersionNumber === 1 ? "create" : "update";
    const mergeSummary = `Applied draft ${input.draft.title}.`;
    const visibility = await this.createWriteVisibilityMetadata(input.draft.knowledgeBaseId, db);

    await sql`
      insert into change_sets (
        id,
        knowledge_base_id,
        base_version_id,
        status,
        trigger_type,
        title,
        description,
        diff,
        metadata,
        owner_knowledge_base_id,
        visibility_origin,
        upstream_resource_id,
        fork_tombstoned_at,
        created_at,
        applied_at
      )
      values (
        ${changeSetId},
        ${input.draft.knowledgeBaseId},
        ${input.currentKnowledgeVersionId},
        'applied',
        'ingest',
        ${`Apply ${input.draft.title}`},
        ${mergeSummary},
        ${JSON.stringify({
          draft_candidate_id: input.draft.id,
          input_snapshot_id: input.draft.inputSnapshotId,
          job_id: input.draft.jobId,
          source_document_ids: input.draft.sourceDocumentIds,
        })}::jsonb,
        ${JSON.stringify({
          draft_candidate_id: input.draft.id,
          input_snapshot_id: input.draft.inputSnapshotId,
          job_id: input.draft.jobId,
          job_stage: "wiki.merge",
          source_document_ids: input.draft.sourceDocumentIds,
        })}::jsonb,
        ${visibility.ownerKnowledgeBaseId},
        ${visibility.visibilityOrigin},
        null,
        null,
        ${now},
        ${now}
      )
    `.execute(db);
    await sql`
      insert into wiki_pages (
        id,
        knowledge_base_id,
        slug,
        title,
        page_type,
        status,
        current_version_id,
        markdown,
        frontmatter,
        source_document_ids,
        metadata,
        owner_knowledge_base_id,
        visibility_origin,
        upstream_resource_id,
        fork_tombstoned_at,
        created_at,
        updated_at
      )
      values (
        ${pageId},
        ${input.draft.knowledgeBaseId},
        ${input.draft.slug ?? createSlug(input.draft.title)},
        ${input.draft.title},
        ${input.draft.pageType},
        'ready',
        ${pageVersionId},
        ${input.draft.markdown},
        ${JSON.stringify(input.draft.frontmatter)}::jsonb,
        ${input.draft.sourceDocumentIds},
        ${JSON.stringify({
          draft_candidate_id: input.draft.id,
          analysis_result_id: input.draft.analysisResultId,
          input_snapshot_id: input.draft.inputSnapshotId,
          job_id: input.draft.jobId,
          source_document_ids: input.draft.sourceDocumentIds,
        })}::jsonb,
        ${visibility.ownerKnowledgeBaseId},
        ${visibility.visibilityOrigin},
        null,
        null,
        ${now},
        ${now}
      )
      on conflict (knowledge_base_id, slug) do update set
        status = excluded.status,
        current_version_id = excluded.current_version_id,
        markdown = excluded.markdown,
        frontmatter = excluded.frontmatter,
        source_document_ids = (
          select array_agg(distinct source_id)
          from unnest(wiki_pages.source_document_ids || excluded.source_document_ids) as merged_sources(source_id)
        ),
        metadata = wiki_pages.metadata || excluded.metadata,
        owner_knowledge_base_id = excluded.owner_knowledge_base_id,
        visibility_origin = excluded.visibility_origin,
        upstream_resource_id = excluded.upstream_resource_id,
        fork_tombstoned_at = excluded.fork_tombstoned_at,
        updated_at = excluded.updated_at
    `.execute(db);
    await sql`
      insert into wiki_page_versions (
        id,
        page_id,
        knowledge_version_id,
        version_number,
        title,
        markdown,
        frontmatter,
        source_snapshot,
        prompt_version,
        created_by,
        owner_knowledge_base_id,
        visibility_origin,
        upstream_resource_id,
        fork_tombstoned_at,
        created_at
      )
      values (
        ${pageVersionId},
        ${pageId},
        ${knowledgeVersionId},
        ${pageVersionNumber},
        ${input.draft.title},
        ${input.draft.markdown},
        ${JSON.stringify(input.draft.frontmatter)}::jsonb,
        ${JSON.stringify(input.draft.sourceRefs)}::jsonb,
        ${input.draft.promptVersionId},
        'wiki.merge',
        ${visibility.ownerKnowledgeBaseId},
        ${visibility.visibilityOrigin},
        null,
        null,
        ${now}
      )
    `.execute(db);
    await sql`
      insert into knowledge_versions (
        id,
        knowledge_base_id,
        version_number,
        status,
        summary,
        change_set_id,
        created_by,
        owner_knowledge_base_id,
        visibility_origin,
        upstream_resource_id,
        fork_tombstoned_at,
        created_at
      )
      values (
        ${knowledgeVersionId},
        ${input.draft.knowledgeBaseId},
        ${knowledgeVersionNumber},
        'active',
        ${mergeSummary},
        ${changeSetId},
        'wiki.merge',
        ${visibility.ownerKnowledgeBaseId},
        ${visibility.visibilityOrigin},
        null,
        null,
        ${now}
      )
    `.execute(db);
    await sql`
      update change_sets
      set target_version_id = ${knowledgeVersionId}
      where id = ${changeSetId}
    `.execute(db);
    await sql`
      insert into change_set_items (
        id,
        change_set_id,
        object_type,
        object_id,
        operation,
        before_data,
        after_data,
        diff,
        owner_knowledge_base_id,
        visibility_origin,
        upstream_resource_id,
        fork_tombstoned_at,
        created_at
      )
      values (
        ${`${changeSetId}:page`},
        ${changeSetId},
        'wiki_page',
        ${pageId},
        ${operation},
        null,
        ${JSON.stringify({
          page_id: pageId,
          page_version_id: pageVersionId,
          title: input.draft.title,
        })}::jsonb,
        ${JSON.stringify({
          source_refs: input.draft.sourceRefs,
          locator_refs: input.draft.locatorRefs,
        })}::jsonb,
        ${visibility.ownerKnowledgeBaseId},
        ${visibility.visibilityOrigin},
        null,
        null,
        ${now}
      )
      on conflict (id) do nothing
    `.execute(db);
    await sql`
      insert into page_merge_records (
        id,
        knowledge_base_id,
        change_set_id,
        source_page_id,
        target_page_id,
        result_page_id,
        merge_summary,
        metadata,
        owner_knowledge_base_id,
        visibility_origin,
        upstream_resource_id,
        fork_tombstoned_at,
        created_at
      )
      values (
        ${pageMergeRecordId},
        ${input.draft.knowledgeBaseId},
        ${changeSetId},
        null,
        ${input.targetPageId},
        ${pageId},
        ${mergeSummary},
        ${JSON.stringify({
          draft_candidate_id: input.draft.id,
          input_snapshot_id: input.draft.inputSnapshotId,
          job_id: input.draft.jobId,
          prompt_version_id: input.draft.promptVersionId,
          source_document_ids: input.draft.sourceDocumentIds,
        })}::jsonb,
        ${visibility.ownerKnowledgeBaseId},
        ${visibility.visibilityOrigin},
        null,
        null,
        ${now}
      )
    `.execute(db);
    await this.insertRelationshipCandidates(input, changeSetId, knowledgeVersionId, now, db);
    await input.assertCanContinue?.();
    await sql`
      update knowledge_bases
      set current_version_id = ${knowledgeVersionId}, updated_at = ${now}
      where id = ${input.draft.knowledgeBaseId}
    `.execute(db);
    await sql`
      update source_documents
      set status = 'ready', updated_at = ${now}
      where id = any(${input.draft.sourceDocumentIds})
    `.execute(db);
    const updatedSystemPageCount = await this.upsertIngestSystemPages(
      {
        changeSetId,
        draftCandidateId: input.draft.id,
        draftTitle: input.draft.title,
        knowledgeBaseId: input.draft.knowledgeBaseId,
        knowledgeVersionId,
        now,
        sourceDocumentIds: input.draft.sourceDocumentIds,
      },
      db,
    );
    await input.assertCanContinue?.();

    return {
      pageId,
      pageVersionId,
      pageMergeRecordId,
      changeSetId,
      knowledgeVersionId,
      updatedSystemPageCount,
      mergeSummary,
    };
  }

  private async upsertIngestSystemPages(
    input: {
      changeSetId: string;
      draftCandidateId: string;
      draftTitle: string;
      knowledgeBaseId: string;
      knowledgeVersionId: string;
      now: string;
      sourceDocumentIds: readonly string[];
    },
    db: Kysely<DatabaseSchema> | Transaction<DatabaseSchema> = this.db,
  ): Promise<number> {
    const existingLogMarkdown = await this.loadSystemPageMarkdown(input.knowledgeBaseId, "log", db);
    const pages = [
      {
        key: "index",
        title: "Index",
        markdown: [
          "# Index",
          "",
          `Knowledge Base: ${input.knowledgeBaseId}`,
          `Current version: ${input.knowledgeVersionId}`,
          `Latest Change Set: ${input.changeSetId}`,
        ].join("\n"),
      },
      {
        key: "overview",
        title: "Overview",
        markdown: [
          "# Overview",
          "",
          `Knowledge Base: ${input.knowledgeBaseId}`,
          `Latest ingest output: ${input.draftTitle}`,
          `Draft candidate: ${input.draftCandidateId}`,
          `Latest Change Set: ${input.changeSetId}`,
          `Current version: ${input.knowledgeVersionId}`,
        ].join("\n"),
      },
      {
        key: "log",
        title: "Log",
        markdown: renderIngestSystemLogMarkdown({
          changeSetId: input.changeSetId,
          draftCandidateId: input.draftCandidateId,
          draftTitle: input.draftTitle,
          existingMarkdown: existingLogMarkdown,
          knowledgeVersionId: input.knowledgeVersionId,
          now: input.now,
          sourceDocumentIds: input.sourceDocumentIds,
        }),
      },
    ];

    for (const page of pages) {
      await sql`
        insert into system_pages (
          id,
          knowledge_base_id,
          system_key,
          title,
          markdown,
          metadata,
          created_at,
          updated_at
        )
        values (
          ${this.idFactory("wiki_page")},
          ${input.knowledgeBaseId},
          ${page.key},
          ${page.title},
          ${page.markdown},
          ${JSON.stringify({
            change_set_id: input.changeSetId,
            draft_candidate_id: input.draftCandidateId,
            knowledge_version_id: input.knowledgeVersionId,
            source_document_ids: input.sourceDocumentIds,
          })}::jsonb,
          ${input.now},
          ${input.now}
        )
        on conflict (knowledge_base_id, system_key) do update set
          title = excluded.title,
          markdown = excluded.markdown,
          metadata = system_pages.metadata || excluded.metadata,
          updated_at = excluded.updated_at
      `.execute(db);
    }

    return pages.length;
  }

  private async refreshDerivedGraphSignalEdges(
    knowledgeBaseId: string,
    changeSetId: string,
    knowledgeVersionId: string,
  ): Promise<void> {
    const startedAt = new Date().toISOString();
    const jobId = await this.createGraphInsightRefreshJob(
      knowledgeBaseId,
      changeSetId,
      knowledgeVersionId,
      startedAt,
      this.db,
    );

    try {
      let graphInsights: GraphInsightsResponse | null = null;

      await this.db.transaction().execute(async (trx) => {
        await this.insertDerivedGraphSignalEdges(
          knowledgeBaseId,
          changeSetId,
          knowledgeVersionId,
          startedAt,
          trx,
        );
        graphInsights = await this.createGraphInsightsSnapshot(knowledgeBaseId, trx);
      });

      if (graphInsights === null) {
        throw new Error("Graph insight snapshot was not created.");
      }

      await this.completeGraphInsightRefreshJob(
        jobId,
        knowledgeBaseId,
        changeSetId,
        knowledgeVersionId,
        graphInsights,
        new Date().toISOString(),
        this.db,
      );
    } catch (error) {
      await this.failGraphInsightRefreshJob(
        jobId,
        changeSetId,
        knowledgeVersionId,
        error,
        new Date().toISOString(),
        this.db,
      );
    }
  }

  async refreshGraphInsightsForJob(input: {
    jobId: string;
    knowledgeBaseId: string;
    requestedKnowledgeVersionId: string | null;
  }): Promise<{ status: "completed" | "failed"; knowledge_base_id: string; job_id: string }> {
    let context: { changeSetId: string | null; knowledgeVersionId: string } | null = null;
    const startedAt = new Date().toISOString();

    try {
      context = await this.resolveGraphInsightRefreshContext(
        input.knowledgeBaseId,
        input.requestedKnowledgeVersionId,
      );

      await this.markGraphInsightRefreshJobRunning(
        input.jobId,
        input.knowledgeBaseId,
        context.changeSetId,
        context.knowledgeVersionId,
        startedAt,
        this.db,
      );

      let graphInsights: GraphInsightsResponse | null = null;
      const refreshContext = context;

      await this.db.transaction().execute(async (trx) => {
        await this.insertDerivedGraphSignalEdges(
          input.knowledgeBaseId,
          refreshContext.changeSetId,
          refreshContext.knowledgeVersionId,
          startedAt,
          trx,
        );
        graphInsights = await this.createGraphInsightsSnapshot(input.knowledgeBaseId, trx);
      });

      if (graphInsights === null) {
        throw new Error("Graph insight snapshot was not created.");
      }

      await this.completeGraphInsightRefreshJob(
        input.jobId,
        input.knowledgeBaseId,
        context.changeSetId,
        context.knowledgeVersionId,
        graphInsights,
        new Date().toISOString(),
        this.db,
      );

      return {
        job_id: input.jobId,
        knowledge_base_id: input.knowledgeBaseId,
        status: "completed",
      };
    } catch (error) {
      await this.failGraphInsightRefreshJob(
        input.jobId,
        context?.changeSetId ?? null,
        context?.knowledgeVersionId ?? input.requestedKnowledgeVersionId,
        error,
        new Date().toISOString(),
        this.db,
      );

      return {
        job_id: input.jobId,
        knowledge_base_id: input.knowledgeBaseId,
        status: "failed",
      };
    }
  }

  private async loadSystemPageMarkdown(
    knowledgeBaseId: string,
    systemKey: string,
    db: Kysely<DatabaseSchema> | Transaction<DatabaseSchema>,
  ): Promise<string | null> {
    const result = await sql<{ markdown: string }>`
      select markdown
      from system_pages
      where knowledge_base_id = ${knowledgeBaseId}
        and system_key = ${systemKey}
      limit 1
    `.execute(db);

    return result.rows[0]?.markdown ?? null;
  }

  private async insertRelationshipCandidates(
    input: WikiMergeApplyInput,
    changeSetId: string,
    knowledgeVersionId: string,
    now: string,
    db: Kysely<DatabaseSchema> | Transaction<DatabaseSchema> = this.db,
  ): Promise<void> {
    const relationships = await this.loadAnalysisRelationships(input.draft.analysisResultId, db);
    const pages = await this.listRelationshipPages(input.draft.knowledgeBaseId, db);
    const edges = resolveRelationshipEdgesForPages({
      knowledgeBaseId: input.draft.knowledgeBaseId,
      pages,
      relationships,
    });

    await this.insertResolvedEdges(
      input.draft.knowledgeBaseId,
      edges,
      changeSetId,
      knowledgeVersionId,
      now,
      db,
    );
  }

  private async insertDerivedGraphSignalEdges(
    knowledgeBaseId: string,
    changeSetId: string | null,
    knowledgeVersionId: string,
    now: string,
    db: Kysely<DatabaseSchema> | Transaction<DatabaseSchema> = this.db,
  ): Promise<void> {
    const pages = await this.listGraphSignalPages(knowledgeBaseId, db);
    const existingEdges = await this.listExistingGraphEdges(knowledgeBaseId, db);
    const edges = deriveGraphSignalEdgesForPages({
      knowledgeBaseId,
      pages,
      existingEdges,
    });

    await this.insertResolvedEdges(
      knowledgeBaseId,
      edges,
      changeSetId,
      knowledgeVersionId,
      now,
      db,
    );
  }

  private async createGraphInsightsSnapshot(
    knowledgeBaseId: string,
    db: Kysely<DatabaseSchema> | Transaction<DatabaseSchema> = this.db,
  ): Promise<GraphInsightsResponse> {
    const pages = await this.listGraphInsightPages(knowledgeBaseId, db);
    const edges = await this.listGraphInsightEdges(knowledgeBaseId, db);

    return createGraphInsightsFromRecords({
      knowledgeBaseId,
      pages,
      edges,
    });
  }

  private async listGraphInsightPages(
    knowledgeBaseId: string,
    db: Kysely<DatabaseSchema> | Transaction<DatabaseSchema> = this.db,
  ) {
    const result = await sql<{
      current_version_id: string | null;
      fork_tombstoned_at: string | null;
      frontmatter: Record<string, unknown> | null;
      id: string;
      markdown: string;
      metadata: Record<string, unknown> | null;
      owner_knowledge_base_id: string | null;
      page_type: string;
      slug: string;
      source_document_ids: string[] | null;
      system_page_key: string | null;
      title: string;
      upstream_resource_id: string | null;
      visibility_origin: string | null;
    }>`
      select
        wiki_pages.id,
        wiki_pages.current_version_id,
        wiki_pages.title,
        wiki_pages.page_type,
        wiki_pages.slug,
        wiki_pages.markdown,
        wiki_pages.frontmatter,
        wiki_pages.source_document_ids,
        wiki_pages.metadata,
        system_pages.system_key as system_page_key,
        wiki_pages.owner_knowledge_base_id,
        wiki_pages.visibility_origin,
        wiki_pages.upstream_resource_id,
        wiki_pages.fork_tombstoned_at
      from wiki_pages
      left join system_pages on system_pages.page_id = wiki_pages.id
        and system_pages.knowledge_base_id = wiki_pages.knowledge_base_id
      where wiki_pages.knowledge_base_id = ${knowledgeBaseId}
        and wiki_pages.deleted_at is null
        and wiki_pages.fork_tombstoned_at is null
      order by wiki_pages.updated_at desc, wiki_pages.id desc
    `.execute(db);

    return result.rows.map((row) => {
      const sourceDocumentIds = row.source_document_ids ?? [];

      return {
        fork_tombstoned_at: row.fork_tombstoned_at,
        frontmatter: row.frontmatter ?? {},
        is_system_page: row.system_page_key !== null,
        knowledge_base_id: knowledgeBaseId,
        markdown: row.markdown,
        metadata: {
          ...(row.metadata ?? {}),
          slug: row.slug,
        },
        owner_knowledge_base_id: row.owner_knowledge_base_id,
        page_id: row.id,
        page_version_id: row.current_version_id ?? row.id,
        source_refs: sourceDocumentIds.map((documentId) => ({ document_id: documentId })),
        system_page_key: row.system_page_key,
        title: row.title,
        type: row.page_type,
        upstream_resource_id: row.upstream_resource_id,
        visibility_origin: readRetrievalVisibilityOrigin(row.visibility_origin),
      };
    });
  }

  private async listGraphInsightEdges(
    knowledgeBaseId: string,
    db: Kysely<DatabaseSchema> | Transaction<DatabaseSchema> = this.db,
  ) {
    const result = await sql<{
      explanation: string | null;
      fork_tombstoned_at: string | null;
      from_page_id: string;
      id: string;
      owner_knowledge_base_id: string | null;
      relation_type: string;
      source_document_ids: string[] | null;
      to_page_id: string;
      upstream_resource_id: string | null;
      visibility_origin: string | null;
      weight: number | null;
    }>`
      select
        id,
        from_page_id,
        to_page_id,
        relation_type,
        weight,
        explanation,
        source_document_ids,
        owner_knowledge_base_id,
        visibility_origin,
        upstream_resource_id,
        fork_tombstoned_at
      from wiki_edges
      where knowledge_base_id = ${knowledgeBaseId}
        and fork_tombstoned_at is null
      order by updated_at desc, id desc
    `.execute(db);

    return result.rows.map((row) => ({
      edge_id: row.id,
      explanation: row.explanation ?? `${row.from_page_id} relates to ${row.to_page_id}.`,
      fork_tombstoned_at: row.fork_tombstoned_at,
      from_page_id: row.from_page_id,
      knowledge_base_id: knowledgeBaseId,
      owner_knowledge_base_id: row.owner_knowledge_base_id,
      relation_type: readRetrievalRelationType(row.relation_type),
      source_document_ids: row.source_document_ids ?? [],
      to_page_id: row.to_page_id,
      upstream_resource_id: row.upstream_resource_id,
      visibility_origin: readRetrievalVisibilityOrigin(row.visibility_origin),
      weight: row.weight ?? 1,
    }));
  }

  private async createGraphInsightRefreshJob(
    knowledgeBaseId: string,
    changeSetId: string,
    knowledgeVersionId: string,
    now: string,
    db: Kysely<DatabaseSchema> | Transaction<DatabaseSchema> = this.db,
  ): Promise<string> {
    const jobId = this.idFactory("ingest_job");

    await sql`
      insert into jobs (
        id,
        tenant_id,
        project_id,
        knowledge_base_id,
        source_document_id,
        job_type,
        status,
        stage,
        progress,
        progress_message,
        result,
        metadata,
        queued_at,
        started_at,
        finished_at,
        updated_at
      )
      values (
        ${jobId},
        (select tenant_id from knowledge_bases where id = ${knowledgeBaseId}),
        (select project_id from knowledge_bases where id = ${knowledgeBaseId}),
        ${knowledgeBaseId},
        null,
        'graph.insights.refresh',
        'running',
        'indexing',
        10,
        'Updating graph insights.',
        ${JSON.stringify({
          change_set_id: changeSetId,
          knowledge_version_id: knowledgeVersionId,
          retry_eligible: true,
          status: "updating",
        })}::jsonb,
        ${JSON.stringify({
          affected_knowledge_base_id: knowledgeBaseId,
          change_set_id: changeSetId,
          generated_at: now,
          knowledge_version_id: knowledgeVersionId,
          refresh_kind: "graph_insights",
          retry_eligible: true,
        })}::jsonb,
        ${now},
        ${now},
        null,
        ${now}
      )
    `.execute(db);

    await this.insertGraphInsightRefreshEvent(
      jobId,
      "job.running",
      "Updating graph insights.",
      {
        affected_knowledge_base_id: knowledgeBaseId,
        change_set_id: changeSetId,
        knowledge_version_id: knowledgeVersionId,
        retry_eligible: true,
        stage: "indexing",
        status: "updating",
      },
      now,
      db,
    );

    return jobId;
  }

  private async resolveGraphInsightRefreshContext(
    knowledgeBaseId: string,
    requestedKnowledgeVersionId: string | null,
  ): Promise<{ changeSetId: string | null; knowledgeVersionId: string }> {
    const result = await sql<{ change_set_id: string | null; knowledge_version_id: string | null }>`
      select
        knowledge_versions.change_set_id,
        coalesce(${requestedKnowledgeVersionId}, knowledge_bases.current_version_id) as knowledge_version_id
      from knowledge_bases
      left join knowledge_versions on knowledge_versions.id = coalesce(
        ${requestedKnowledgeVersionId},
        knowledge_bases.current_version_id
      )
      where knowledge_bases.id = ${knowledgeBaseId}
        and knowledge_bases.deleted_at is null
      limit 1
    `.execute(this.db);
    const knowledgeVersionId = result.rows[0]?.knowledge_version_id ?? null;

    if (knowledgeVersionId === null) {
      throw new Error("Graph insight refresh requires an active knowledge version.");
    }

    return {
      changeSetId: result.rows[0]?.change_set_id ?? null,
      knowledgeVersionId,
    };
  }

  private async markGraphInsightRefreshJobRunning(
    jobId: string,
    knowledgeBaseId: string,
    changeSetId: string | null,
    knowledgeVersionId: string,
    now: string,
    db: Kysely<DatabaseSchema> | Transaction<DatabaseSchema> = this.db,
  ): Promise<void> {
    await sql`
      update jobs
      set
        status = 'running',
        stage = 'indexing',
        progress = 10,
        progress_message = 'Updating graph insights.',
        result = ${JSON.stringify({
          change_set_id: changeSetId,
          knowledge_version_id: knowledgeVersionId,
          retry_eligible: true,
          status: "updating",
        })}::jsonb,
        metadata = metadata || ${JSON.stringify({
          affected_knowledge_base_id: knowledgeBaseId,
          change_set_id: changeSetId,
          generated_at: now,
          knowledge_version_id: knowledgeVersionId,
          refresh_kind: "graph_insights",
          retry_eligible: true,
        })}::jsonb,
        started_at = coalesce(started_at, ${now}),
        updated_at = ${now}
      where id = ${jobId}
    `.execute(db);

    await this.insertGraphInsightRefreshEvent(
      jobId,
      "job.running",
      "Updating graph insights.",
      {
        affected_knowledge_base_id: knowledgeBaseId,
        change_set_id: changeSetId,
        knowledge_version_id: knowledgeVersionId,
        retry_eligible: true,
        stage: "indexing",
        status: "updating",
      },
      now,
      db,
    );
  }

  private async completeGraphInsightRefreshJob(
    jobId: string,
    knowledgeBaseId: string,
    changeSetId: string | null,
    knowledgeVersionId: string,
    graphInsights: GraphInsightsResponse,
    now: string,
    db: Kysely<DatabaseSchema> | Transaction<DatabaseSchema> = this.db,
  ): Promise<void> {
    await sql`
      update jobs
      set
        status = 'completed',
        stage = 'indexing',
        progress = 100,
        progress_message = 'Graph insights ready.',
        result = ${JSON.stringify({
          change_set_id: changeSetId,
          graph_insights: graphInsights,
          knowledge_version_id: knowledgeVersionId,
          retry_eligible: false,
          status: "ready",
        })}::jsonb,
        metadata = metadata || ${JSON.stringify({
          affected_knowledge_base_id: knowledgeBaseId,
          change_set_id: changeSetId,
          generated_at: now,
          knowledge_version_id: knowledgeVersionId,
          refresh_kind: "graph_insights",
          retry_eligible: false,
        })}::jsonb,
        finished_at = ${now},
        updated_at = ${now}
      where id = ${jobId}
    `.execute(db);

    await this.insertGraphInsightRefreshEvent(
      jobId,
      "job.completed",
      "Graph insights ready.",
      {
        affected_knowledge_base_id: knowledgeBaseId,
        change_set_id: changeSetId,
        generated_at: now,
        knowledge_version_id: knowledgeVersionId,
        retry_eligible: false,
        stage: "indexing",
        status: "ready",
      },
      now,
      db,
    );
  }

  private async failGraphInsightRefreshJob(
    jobId: string,
    changeSetId: string | null,
    knowledgeVersionId: string | null,
    error: unknown,
    now: string,
    db: Kysely<DatabaseSchema> | Transaction<DatabaseSchema> = this.db,
  ): Promise<void> {
    const safeError = toGraphRefreshError(error);

    await sql`
      update jobs
      set
        status = 'failed',
        stage = 'indexing',
        progress = 0,
        progress_message = ${safeError.message},
        result = ${JSON.stringify({
          change_set_id: changeSetId,
          knowledge_version_id: knowledgeVersionId,
          retry_eligible: true,
          status: "failed",
        })}::jsonb,
        error = ${JSON.stringify(safeError)}::jsonb,
        metadata = metadata || ${JSON.stringify({
          change_set_id: changeSetId,
          failed_at: now,
          knowledge_version_id: knowledgeVersionId,
          refresh_kind: "graph_insights",
          retry_eligible: true,
        })}::jsonb,
        finished_at = ${now},
        updated_at = ${now}
      where id = ${jobId}
    `.execute(db);

    await this.insertGraphInsightRefreshEvent(
      jobId,
      "job.failed",
      safeError.message,
      {
        change_set_id: changeSetId,
        error_code: safeError.code,
        failed_at: now,
        knowledge_version_id: knowledgeVersionId,
        retry_eligible: true,
        stage: "indexing",
        status: "failed",
      },
      now,
      db,
    );
  }

  private async insertGraphInsightRefreshEvent(
    jobId: string,
    eventType: string,
    message: string,
    metadata: Record<string, unknown>,
    now: string,
    db: Kysely<DatabaseSchema> | Transaction<DatabaseSchema> = this.db,
  ): Promise<void> {
    await sql`
      insert into job_events (
        id,
        tenant_id,
        project_id,
        job_id,
        event_type,
        message,
        metadata,
        created_at
      )
      values (
        ${createStableRelationshipId("jobevt_", jobId, eventType, now)},
        (select tenant_id from jobs where id = ${jobId}),
        (select project_id from jobs where id = ${jobId}),
        ${jobId},
        ${eventType},
        ${message},
        ${JSON.stringify(metadata)}::jsonb,
        ${now}
      )
      on conflict (id) do nothing
    `.execute(db);
  }

  private async insertResolvedEdges(
    knowledgeBaseId: string,
    edges: readonly ResolvedRelationshipEdgeWrite[],
    changeSetId: string | null,
    knowledgeVersionId: string,
    now: string,
    db: Kysely<DatabaseSchema> | Transaction<DatabaseSchema> = this.db,
  ): Promise<void> {
    const validSourceDocumentIds = await this.loadValidSourceDocumentIds(
      knowledgeBaseId,
      edges.flatMap((edge) => [
        ...edge.sourceDocumentIds,
        ...edge.sourceRefs.map((sourceRef) => readString(sourceRef.document_id)).filter(isString),
      ]),
      db,
    );
    const constrainedEdges = constrainResolvedEdgeSourcesToDocuments(edges, validSourceDocumentIds);
    const visibility = await this.createWriteVisibilityMetadata(knowledgeBaseId, db);

    for (const edge of constrainedEdges) {
      await sql`
        insert into wiki_edges (
          id,
          knowledge_base_id,
          from_page_id,
          to_page_id,
          relation_type,
          weight,
          explanation,
          source_document_ids,
          change_set_id,
          knowledge_version_id,
          metadata,
          owner_knowledge_base_id,
          visibility_origin,
          upstream_resource_id,
          fork_tombstoned_at,
          created_at,
          updated_at
        )
        values (
          ${edge.edgeId},
          ${knowledgeBaseId},
          ${edge.fromPageId},
          ${edge.toPageId},
          ${edge.relationType},
          ${edge.weight},
          ${edge.explanation},
          ${edge.sourceDocumentIds},
          ${changeSetId},
          ${knowledgeVersionId},
          ${JSON.stringify(edge.metadata)}::jsonb,
          ${visibility.ownerKnowledgeBaseId},
          ${visibility.visibilityOrigin},
          null,
          null,
          ${now},
          ${now}
        )
        on conflict (id) do update set
          weight = excluded.weight,
          explanation = excluded.explanation,
          source_document_ids = excluded.source_document_ids,
          metadata = wiki_edges.metadata || excluded.metadata,
          owner_knowledge_base_id = excluded.owner_knowledge_base_id,
          visibility_origin = excluded.visibility_origin,
          upstream_resource_id = excluded.upstream_resource_id,
          fork_tombstoned_at = excluded.fork_tombstoned_at,
          updated_at = excluded.updated_at
      `.execute(db);

      for (const sourceRef of edge.sourceRefs) {
        const sourceDocumentId = readString(sourceRef.document_id);

        if (sourceDocumentId === null) {
          continue;
        }

        await sql`
          insert into wiki_edge_sources (
            id,
            edge_id,
            source_document_id,
            page_version_id,
            locator,
            evidence,
            owner_knowledge_base_id,
            visibility_origin,
            upstream_resource_id,
            fork_tombstoned_at,
            created_at
          )
          values (
            ${createStableRelationshipId("edgesrc_", edge.edgeId, JSON.stringify(sourceRef))},
            ${edge.edgeId},
            ${sourceDocumentId},
            null,
            ${JSON.stringify(sourceRef)}::jsonb,
            ${edge.explanation},
            ${visibility.ownerKnowledgeBaseId},
            ${visibility.visibilityOrigin},
            null,
            null,
            ${now}
          )
          on conflict (id) do nothing
        `.execute(db);
      }
    }
  }

  private async loadValidSourceDocumentIds(
    knowledgeBaseId: string,
    sourceDocumentIds: readonly string[],
    db: Kysely<DatabaseSchema> | Transaction<DatabaseSchema> = this.db,
  ): Promise<Set<string>> {
    const uniqueIds = [...new Set(sourceDocumentIds)].filter(isString);

    if (uniqueIds.length === 0) {
      return new Set();
    }

    const result = await sql<{ id: string }>`
      select id
      from source_documents
      where knowledge_base_id = ${knowledgeBaseId}
        and id = any(${uniqueIds})
    `.execute(db);

    return new Set(result.rows.map((row) => row.id));
  }

  private async listGraphSignalPages(
    knowledgeBaseId: string,
    db: Kysely<DatabaseSchema> | Transaction<DatabaseSchema> = this.db,
  ): Promise<GraphSignalPageRecord[]> {
    const result = await sql<{
      id: string;
      markdown: string;
      pageType: string;
      slug: string;
      sourceDocumentIds: string[];
      title: string;
    }>`
      select
        id,
        slug,
        title,
        page_type as "pageType",
        markdown,
        source_document_ids as "sourceDocumentIds"
      from wiki_pages
      where knowledge_base_id = ${knowledgeBaseId}
        and deleted_at is null
    `.execute(db);

    return result.rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      title: row.title,
      pageType: row.pageType,
      markdown: row.markdown,
      sourceDocumentIds: row.sourceDocumentIds ?? [],
    }));
  }

  private async listExistingGraphEdges(
    knowledgeBaseId: string,
    db: Kysely<DatabaseSchema> | Transaction<DatabaseSchema> = this.db,
  ): Promise<ResolvedRelationshipEdgeWrite[]> {
    const result = await sql<{
      explanation: string | null;
      fromPageId: string;
      id: string;
      metadata: Record<string, unknown> | null;
      relationType: string;
      sourceDocumentIds: string[];
      toPageId: string;
      weight: number;
    }>`
      select
        id,
        from_page_id as "fromPageId",
        to_page_id as "toPageId",
        relation_type as "relationType",
        weight::float as weight,
        explanation,
        source_document_ids as "sourceDocumentIds",
        metadata
      from wiki_edges
      where knowledge_base_id = ${knowledgeBaseId}
    `.execute(db);

    return result.rows.map((row) => ({
      edgeId: row.id,
      explanation: row.explanation ?? row.relationType,
      fromPageId: row.fromPageId,
      metadata: row.metadata ?? {},
      relationType: row.relationType,
      sourceDocumentIds: row.sourceDocumentIds ?? [],
      sourceRefs: [],
      toPageId: row.toPageId,
      weight: row.weight,
    }));
  }

  private async loadAnalysisRelationships(
    analysisResultId: string,
    db: Kysely<DatabaseSchema> | Transaction<DatabaseSchema> = this.db,
  ): Promise<Record<string, unknown>[]> {
    const result = await sql<{ relationships: unknown }>`
      select relationships
      from wiki_analysis_results
      where id = ${analysisResultId}
    `.execute(db);

    return readRecordArray(result.rows[0]?.relationships);
  }

  private async listRelationshipPages(
    knowledgeBaseId: string,
    db: Kysely<DatabaseSchema> | Transaction<DatabaseSchema> = this.db,
  ): Promise<RelationshipPageRecord[]> {
    const result = await sql<RelationshipPageRecord>`
      select id, slug, title
      from wiki_pages
      where knowledge_base_id = ${knowledgeBaseId}
        and deleted_at is null
    `.execute(db);

    return result.rows;
  }

  private async resolvePageId(
    draft: WikiMergeApplyInput["draft"],
    db: Kysely<DatabaseSchema> | Transaction<DatabaseSchema> = this.db,
  ): Promise<string> {
    const result = await sql<{ id: string }>`
      select id
      from wiki_pages
      where knowledge_base_id = ${draft.knowledgeBaseId}
        and slug = ${draft.slug ?? createSlug(draft.title)}
    `.execute(db);

    return result.rows[0]?.id ?? this.idFactory("wiki_page");
  }

  private async nextPageVersionNumber(
    pageId: string,
    db: Kysely<DatabaseSchema> | Transaction<DatabaseSchema> = this.db,
  ): Promise<number> {
    const result = await sql<{ nextVersion: number }>`
      select coalesce(max(version_number), 0) + 1 as "nextVersion"
      from wiki_page_versions
      where page_id = ${pageId}
    `.execute(db);

    return Number(result.rows[0]?.nextVersion ?? 1);
  }

  private async nextKnowledgeVersionNumber(
    knowledgeBaseId: string,
    db: Kysely<DatabaseSchema> | Transaction<DatabaseSchema> = this.db,
  ): Promise<number> {
    const result = await sql<{ nextVersion: number }>`
      select coalesce(max(version_number), 0) + 1 as "nextVersion"
      from knowledge_versions
      where knowledge_base_id = ${knowledgeBaseId}
    `.execute(db);

    return Number(result.rows[0]?.nextVersion ?? 1);
  }

  private async createWriteVisibilityMetadata(
    knowledgeBaseId: string,
    db: Kysely<DatabaseSchema> | Transaction<DatabaseSchema> = this.db,
  ): Promise<{ ownerKnowledgeBaseId: string | null; visibilityOrigin: string }> {
    const result = await sql<{ knowledge_base_type: string }>`
      select knowledge_base_type
      from knowledge_bases
      where id = ${knowledgeBaseId}
      limit 1
    `.execute(db);

    if (result.rows[0]?.knowledge_base_type === "fork") {
      return {
        ownerKnowledgeBaseId: knowledgeBaseId,
        visibilityOrigin: "fork_owned",
      };
    }

    return {
      ownerKnowledgeBaseId: null,
      visibilityOrigin: "canonical",
    };
  }
}

export class OpenAICompatiblePageEmbeddingIndexer implements WikiPageEmbeddingIndexer {
  constructor(
    private readonly db: Kysely<DatabaseSchema>,
    private readonly config: RuntimeConfig["models"]["embedding"],
    private readonly fetchFn: (request: Request) => Promise<Response> = fetch,
  ) {}

  async indexPage(input: {
    knowledgeBaseId: string;
    pageId: string;
    pageVersionId: string;
    objectType: "page";
    title: string;
    markdown: string;
    pageType: string;
  }): Promise<number> {
    const text = `${input.title}\n\n${input.markdown}`.trim();
    const vector = await this.embedText(text);
    const now = new Date().toISOString();

    await sql`
      delete from page_embeddings
      where knowledge_base_id = ${input.knowledgeBaseId}
        and page_id = ${input.pageId}
    `.execute(this.db);
    await sql`
      insert into page_embeddings (
        id,
        knowledge_base_id,
        page_id,
        page_version_id,
        object_type,
        object_id,
        model,
        dimensions,
        embedding,
        metadata,
        created_at
      )
      values (
        ${createWorkerId("embedding")},
        ${input.knowledgeBaseId},
        ${input.pageId},
        ${input.pageVersionId},
        ${input.objectType},
        ${input.pageId},
        ${this.config.model},
        ${this.config.dimensions},
        ${formatPgVector(vector)}::vector,
        ${JSON.stringify({
          title: input.title,
          type: input.pageType,
          text,
        })}::jsonb,
        ${now}
      )
    `.execute(this.db);

    return 1;
  }

  private async embedText(text: string): Promise<number[]> {
    const response = await this.fetchFn(
      new Request(joinUrlPath(this.config.baseUrl, "embeddings"), {
        body: JSON.stringify({
          input: [text],
          model: this.config.model,
        }),
        headers: {
          authorization: `Bearer ${this.config.apiKey}`,
          "content-type": "application/json",
        },
        method: "POST",
      }),
    );

    if (!response.ok) {
      throw new Error(`Embedding provider request failed with status ${response.status}.`);
    }

    const payload = (await response.json()) as { data?: Array<{ embedding?: unknown }> };
    const embedding = payload.data?.[0]?.embedding;

    if (!Array.isArray(embedding) || !embedding.every((value) => typeof value === "number")) {
      throw new Error("Embedding provider response did not include a valid vector.");
    }

    return [...embedding];
  }
}

export class PostgresWikiCompileContextReader implements WikiCompileContextReader {
  constructor(private readonly db: Kysely<DatabaseSchema>) {}

  async getAnalyzeContext(payload: WikiAnalyzePayload): Promise<WikiAnalyzeContext> {
    const result = await sql<{
      currentKnowledgeVersionId: string | null;
      datasetConfigurationPresetId: string | null;
      datasetConfigurationSnapshotId: string | null;
      datasetConfigurationSnapshotValues: unknown;
      datasetConfigurationSnapshotVersion: number | null;
      documentName: string;
      sourceDocumentMetadata: unknown;
      purpose: unknown;
      schema: unknown;
    }>`
      select
        knowledge_bases.current_version_id as "currentKnowledgeVersionId",
        knowledge_base_dataset_configuration_snapshots.id as "datasetConfigurationSnapshotId",
        knowledge_base_dataset_configuration_snapshots.preset_id as "datasetConfigurationPresetId",
        knowledge_base_dataset_configuration_snapshots.version as "datasetConfigurationSnapshotVersion",
        knowledge_base_dataset_configuration_snapshots.values as "datasetConfigurationSnapshotValues",
        source_documents.name as "documentName",
        source_documents.metadata as "sourceDocumentMetadata",
        knowledge_base_settings.purpose,
        knowledge_base_settings.wiki_schema as "schema"
      from source_documents
      join knowledge_bases on knowledge_bases.id = source_documents.knowledge_base_id
      left join knowledge_base_settings
        on knowledge_base_settings.knowledge_base_id = knowledge_bases.id
      left join knowledge_base_dataset_configurations
        on knowledge_base_dataset_configurations.knowledge_base_id = knowledge_bases.id
      left join knowledge_base_dataset_configuration_snapshots
        on knowledge_base_dataset_configuration_snapshots.id =
          knowledge_base_dataset_configurations.latest_snapshot_id
      where source_documents.id = ${payload.document_id}
        and source_documents.knowledge_base_id = ${payload.knowledge_base_id}
    `.execute(this.db);
    const row = result.rows[0];

    if (row === undefined) {
      throw new Error(`Source Document not found for analysis: ${payload.document_id}`);
    }

    return {
      currentKnowledgeVersionId: row.currentKnowledgeVersionId ?? "",
      datasetConfigurationSnapshot:
        row.datasetConfigurationSnapshotId === null ||
        row.datasetConfigurationPresetId === null ||
        row.datasetConfigurationSnapshotVersion === null
          ? null
          : {
              id: row.datasetConfigurationSnapshotId,
              preset_id: row.datasetConfigurationPresetId,
              values: normalizeRecord(row.datasetConfigurationSnapshotValues) ?? {},
              version: row.datasetConfigurationSnapshotVersion,
            },
      documentName: row.documentName,
      sourceDocumentMetadata: normalizeRecord(row.sourceDocumentMetadata) ?? {},
      purpose: readPurposeText(row.purpose) ?? payload.purpose ?? "",
      schema: normalizeRecord(row.schema) ?? payload.schema ?? {},
    };
  }
}

function createAnalysisMessages(
  payload: WikiAnalyzePayload,
  context: WikiAnalyzeContext,
  markdown: string,
  promptLimits: CompilePromptLimits,
  resolvedPromptTemplate: string,
) {
  const sourceMarkdown = createPromptTextExcerpt(markdown, promptLimits.analysisSourceMaxChars);

  return [
    {
      role: "system" as const,
      content: [
        resolvedPromptTemplate,
        "Analyze source material for a Wiki-first knowledge base.",
        analysisOutputContract,
        "Return only the most important items: at most 5 entities, 5 concepts, 8 claims, 5 contradictions, and 8 relationships.",
        "When source_markdown contains an Image evidence marker, preserve the captioned image reference as evidence by setting evidence_kind to image_caption, copying the exact med_... value after media_asset_id, and using a locator_refs entry such as image:<media_asset_id>. Never use object_key, source_locator, or line locators as media_asset_id.",
        "When source_markdown contains an OCR evidence marker, preserve the OCR page/block reference by setting evidence_kind to ocr and using a locator_refs entry such as ocr:page:<page_number>:block:<block_index>.",
        "Use the document_id from the user payload exactly. Use empty arrays when a category has no items. Do not return arrays of strings.",
      ].join(" "),
    },
    {
      role: "user" as const,
      content: JSON.stringify({
        job_id: payload.job_id,
        knowledge_base_id: payload.knowledge_base_id,
        document_id: payload.document_id,
        parsed_content_id: payload.parsed_content_id,
        document_name: context.documentName,
        dataset_configuration_snapshot: context.datasetConfigurationSnapshot,
        purpose: context.purpose,
        schema: context.schema,
        source_markdown: sourceMarkdown.text,
        source_markdown_original_chars: markdown.length,
        source_markdown_truncated: sourceMarkdown.truncated,
        prompt_budget: {
          max_context_chars: promptLimits.maxContextChars,
          response_reserve_chars: promptLimits.responseReserveChars,
          source_markdown_max_chars: promptLimits.analysisSourceMaxChars,
        },
      }),
    },
  ];
}

function createAnalysisInputSummary(
  payload: WikiAnalyzePayload,
  context: WikiAnalyzeContext,
  markdown: string,
): string {
  return JSON.stringify({
    workflow: "wiki.analyze",
    knowledge_base_id: payload.knowledge_base_id,
    document_id: payload.document_id,
    parsed_content_id: payload.parsed_content_id,
    document_name: context.documentName,
    source_markdown_chars: markdown.length,
  });
}

function createAnalysisOutputSummary(
  output: StructuredAnalysisOutput,
  repairAttempts = 0,
  sourceRefLocatorValidation?: Record<string, unknown>,
): string {
  return JSON.stringify(
    createAnalysisOutputSummaryObject(output, repairAttempts, sourceRefLocatorValidation),
  );
}

function createAnalysisOutputSummaryObject(
  output: StructuredAnalysisOutput,
  repairAttempts = 0,
  sourceRefLocatorValidation?: Record<string, unknown>,
): Record<string, unknown> {
  return {
    entities: output.entities.length,
    concepts: output.concepts.length,
    claims: output.claims.length,
    contradictions: output.contradictions.length,
    relationships: output.relationships.length,
    structured_output_repair_attempts: repairAttempts,
    ...(sourceRefLocatorValidation === undefined
      ? {}
      : { source_ref_locator_validation: sourceRefLocatorValidation }),
  };
}

function createSourceBackedAnalysisFallbackOutput(input: {
  context: WikiAnalyzeContext;
  markdown: string;
  payload: WikiAnalyzePayload;
  structuredOutputAttemptCount: number;
  structuredOutputRepairAttempts: number;
  structuredOutputValidationIssues: readonly string[];
}):
  | { output: StructuredAnalysisOutput; metadata: Record<string, unknown> }
  | { output: null; metadata: Record<string, unknown> } {
  const traceLine = findFirstTraceableMarkdownLine(input.markdown);

  if (traceLine === null) {
    return {
      output: null,
      metadata: {
        fallback_reason: "parsed_content_empty",
        fallback_status: "unavailable",
      },
    };
  }

  const heading = findFirstMarkdownHeading(input.markdown);
  const title =
    heading?.title ??
    stripCommonMarkdownExtension(input.context.documentName) ??
    `Source Document ${input.payload.document_id}`;
  const titleLocator = heading?.locator ?? traceLine.locator;
  const sourceRef = {
    document_id: input.payload.document_id,
    evidence_kind: "text" as const,
    locator: titleLocator,
  };
  const claimLine = findFirstClaimMarkdownLine(input.markdown, heading?.lineNumber ?? null);
  const claimSourceRef =
    claimLine === null
      ? null
      : {
          document_id: input.payload.document_id,
          evidence_kind: "text" as const,
          locator: claimLine.locator,
        };
  const output: StructuredAnalysisOutput = {
    entities: [],
    concepts: [
      {
        locator_refs: [titleLocator],
        metadata: {
          analysis_mode: "source_backed_fallback",
          fallback_source: "parsed_content_heading",
          parsed_content_id: input.payload.parsed_content_id,
        },
        source_refs: [sourceRef],
        summary: createSourceBackedConceptSummary(title),
        title,
      },
    ],
    claims:
      claimLine === null || claimSourceRef === null
        ? []
        : [
            {
              locator_refs: [claimLine.locator],
              metadata: {
                analysis_mode: "source_backed_fallback",
                fallback_source: "parsed_content_excerpt",
                parsed_content_id: input.payload.parsed_content_id,
              },
              source_refs: [claimSourceRef],
              summary: claimLine.text,
              title: createSourceBackedClaimTitle(claimLine.text),
            },
          ],
    contradictions: [],
    relationships: [],
  };

  return {
    output,
    metadata: {
      analysis_mode: "source_backed_fallback",
      fallback_limitations: [
        "no_model_inferred_relationships",
        "no_model_inferred_contradictions",
        "source_metadata_and_exact_text_only",
      ],
      fallback_mode: "source_backed_analysis",
      fallback_reason: "structured_output_repair_exhausted",
      fallback_source: {
        document_id: input.payload.document_id,
        parsed_content_id: input.payload.parsed_content_id,
        title_locator: titleLocator,
      },
      fallback_status: "used",
      structured_output_attempt_count: input.structuredOutputAttemptCount,
      structured_output_final_status: "source_backed_fallback",
      structured_output_repair_attempts: input.structuredOutputRepairAttempts,
      structured_output_validation_issues: [...input.structuredOutputValidationIssues],
    },
  };
}

function createSourceBackedAnalysisFallbackOutputSummary(
  output: StructuredAnalysisOutput,
  fallbackMetadata: Record<string, unknown>,
  sourceRefLocatorValidation?: Record<string, unknown>,
): string {
  return JSON.stringify({
    ...createAnalysisOutputSummaryObject(output, 0, sourceRefLocatorValidation),
    analysis_mode: "source_backed_fallback",
    fallback_limitations: fallbackMetadata.fallback_limitations,
    fallback_reason: fallbackMetadata.fallback_reason,
    structured_output_final_status: "source_backed_fallback",
  });
}

function findFirstMarkdownHeading(markdown: string): {
  lineNumber: number;
  locator: string;
  title: string;
} | null {
  const lines = markdown.split("\n");

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]?.trim() ?? "";
    const match = /^(#{1,6})\s+(.+)$/u.exec(line);
    const title = match?.[2]?.trim();

    if (title !== undefined && title.length > 0) {
      const lineNumber = index + 1;

      return {
        lineNumber,
        locator: `line:${lineNumber}`,
        title,
      };
    }
  }

  return null;
}

function findFirstTraceableMarkdownLine(markdown: string): {
  lineNumber: number;
  locator: string;
  text: string;
} | null {
  const lines = markdown.split("\n");

  for (let index = 0; index < lines.length; index += 1) {
    const text = lines[index]?.trim() ?? "";

    if (isFallbackTraceableMarkdownLine(text)) {
      const lineNumber = index + 1;

      return {
        lineNumber,
        locator: `line:${lineNumber}`,
        text,
      };
    }
  }

  return null;
}

function findFirstClaimMarkdownLine(
  markdown: string,
  headingLineNumber: number | null,
): { lineNumber: number; locator: string; text: string } | null {
  const lines = markdown.split("\n");

  for (let index = 0; index < lines.length; index += 1) {
    const lineNumber = index + 1;
    const text = lines[index]?.trim() ?? "";

    if (headingLineNumber !== null && lineNumber === headingLineNumber) {
      continue;
    }

    if (!isFallbackTraceableMarkdownLine(text) || /^#{1,6}\s+/u.test(text)) {
      continue;
    }

    return {
      lineNumber,
      locator: `line:${lineNumber}`,
      text: createBoundedFallbackText(text, 280),
    };
  }

  return null;
}

function isFallbackTraceableMarkdownLine(text: string): boolean {
  return text.length > 0 && text !== "---";
}

function stripCommonMarkdownExtension(value: string): string | null {
  const normalized = value.trim().replace(/\.(?:md|markdown|txt)$/iu, "");

  return normalized.length > 0 ? normalized : null;
}

function createSourceBackedConceptSummary(title: string): string {
  return `Source-backed fallback concept derived from parsed content heading: ${title}`;
}

function createSourceBackedClaimTitle(text: string): string {
  return `Source excerpt: ${createBoundedFallbackText(text, 80)}`;
}

function createBoundedFallbackText(text: string, maxChars: number): string {
  const normalized = text.replace(/\s+/gu, " ").trim();

  return normalized.length <= maxChars ? normalized : `${normalized.slice(0, maxChars - 3)}...`;
}

function createAnalysisSourceMetadata(
  markdown: string,
  sourceDocumentMetadata: Record<string, unknown>,
): Record<string, unknown> {
  const sourceFrontmatter = extractMarkdownFrontmatter(markdown);
  const metadata: Record<string, unknown> = {};

  if (Object.keys(sourceFrontmatter).length > 0) {
    metadata[sourceFrontmatterMetadataKey] = sourceFrontmatter;
  }
  if (Object.keys(sourceDocumentMetadata).length > 0) {
    metadata[sourceDocumentMetadataKey] = sourceDocumentMetadata;
  }

  return metadata;
}

function extractMarkdownFrontmatter(markdown: string): Record<string, unknown> {
  const match = markdown.match(/^\uFEFF?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u);
  const frontmatterText = match?.[1];

  return frontmatterText === undefined ? {} : parseFlatFrontmatter(frontmatterText);
}

function parseFlatFrontmatter(frontmatterText: string): Record<string, unknown> {
  const record: Record<string, unknown> = {};

  for (const line of frontmatterText.split(/\r?\n/u)) {
    const match = line.match(/^\s*([A-Za-z0-9_.-]+)\s*:\s*(.*?)\s*$/u);

    if (match === null || match[1] === undefined || match[2] === undefined) {
      continue;
    }

    record[match[1]] = parseFrontmatterScalar(match[2]);
  }

  return record;
}

function parseFrontmatterScalar(value: string): unknown {
  const trimmed = value.trim();

  if (trimmed.length === 0) {
    return "";
  }
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  if (/^(?:true|false)$/iu.test(trimmed)) {
    return trimmed.toLowerCase() === "true";
  }
  if (/^(?:null|~)$/iu.test(trimmed)) {
    return null;
  }
  if (/^-?\d+(?:\.\d+)?$/u.test(trimmed)) {
    const numberValue = Number(trimmed);

    return Number.isFinite(numberValue) ? numberValue : trimmed;
  }

  return trimmed;
}

function enrichGeneratedDraftWithSourceMetadata(
  draft: StructuredGeneratedDraft,
  analysisMetadata: Record<string, unknown>,
): StructuredGeneratedDraft {
  const sourceFrontmatter = normalizeRecord(analysisMetadata[sourceFrontmatterMetadataKey]);
  const sourceDocumentMetadata = normalizeRecord(analysisMetadata[sourceDocumentMetadataKey]);
  const frontmatter = { ...draft.frontmatter };

  if (sourceFrontmatter !== null) {
    const existing = normalizeRecord(frontmatter[sourceFrontmatterMetadataKey]) ?? {};
    frontmatter[sourceFrontmatterMetadataKey] = {
      ...existing,
      ...sourceFrontmatter,
    };
  }
  if (sourceDocumentMetadata !== null) {
    const existing = normalizeRecord(frontmatter[sourceDocumentMetadataKey]) ?? {};
    frontmatter[sourceDocumentMetadataKey] = {
      ...existing,
      ...sourceDocumentMetadata,
    };
  }

  return {
    ...draft,
    frontmatter,
  };
}

function collectAnalysisSourceRefs(output: StructuredAnalysisOutput): Record<string, unknown>[] {
  return [
    ...output.entities.flatMap((item) => item.source_refs),
    ...output.concepts.flatMap((item) => item.source_refs),
    ...output.claims.flatMap((item) => item.source_refs),
    ...output.contradictions.flatMap((item) => item.source_refs),
    ...output.relationships.flatMap((item) => item.source_refs),
  ].map(toRecord);
}

function collectAnalysisLocatorRefs(output: StructuredAnalysisOutput): Record<string, unknown>[] {
  return [
    ...output.entities.flatMap((item) => item.locator_refs),
    ...output.concepts.flatMap((item) => item.locator_refs),
    ...output.claims.flatMap((item) => item.locator_refs),
    ...output.contradictions.flatMap((item) => item.locator_refs),
    ...output.relationships.flatMap((item) => item.locator_refs),
  ].map((locator) => ({ locator }));
}

function createGenerationMessages(
  payload: WikiGeneratePayload,
  analysis: Awaited<ReturnType<CompileArtifactRepository["findAnalysisResultById"]>> & {},
  promptLimits: CompilePromptLimits,
  resolvedPromptTemplate: string,
): ChatMessage[] {
  return [
    {
      role: "system" as const,
      content: [
        resolvedPromptTemplate,
        "Generate traceable Wiki draft candidates from structured source analysis.",
        generationDraftOutputContract,
        "Use source_refs from the analysis result exactly. Encode low confidence or conflict signals in draft metadata/frontmatter when useful. Do not return arrays of strings.",
      ].join(" "),
    },
    {
      role: "user" as const,
      content: JSON.stringify({
        job_id: payload.job_id,
        knowledge_base_id: payload.knowledge_base_id,
        analysis_result_id: payload.analysis_result_id,
        current_knowledge_version_id: payload.current_knowledge_version_id,
        dataset_configuration_snapshot: payload.dataset_configuration_snapshot ?? null,
        purpose: payload.purpose,
        schema: payload.schema,
        source_document_ids: payload.source_document_ids,
        analysis: createGenerationPromptAnalysisView(analysis, promptLimits),
        prompt_budget: {
          max_context_chars: promptLimits.maxContextChars,
          response_reserve_chars: promptLimits.responseReserveChars,
          analysis_item_limit: promptLimits.generationAnalysisItemLimit,
          string_max_chars: promptLimits.generationPromptStringMaxChars,
          array_limit: promptLimits.generationPromptArrayLimit,
          object_key_limit: promptLimits.generationPromptObjectKeyLimit,
        },
      }),
    },
  ];
}

async function completeAnalysisWithStructuredOutputRepair(options: {
  chatProvider: ChatProvider;
  model: string;
  messages: ChatMessage[];
}): Promise<{
  completion: Awaited<ReturnType<ChatProvider["complete"]>>;
  output: StructuredAnalysisOutput;
  attemptCount: number;
  repairAttempts: number;
  structuredOutputMode: StructuredOutputMode;
  validationIssues: string[];
}> {
  return completeStructuredJsonOutput({
    chatProvider: options.chatProvider,
    getValidationIssues: readStructuredOutputIssues,
    jsonSchema: analysisStructuredOutputJsonSchema,
    maxRepairAttempts: analysisStructuredOutputRepairAttempts,
    messages: options.messages,
    model: options.model,
    outputContract: analysisOutputContract,
    outputShape: analysisOutputShape,
    parse: parseAnalysisOutput,
    temperature: 0,
  });
}

async function completeGenerationWithStructuredOutputRepair(options: {
  chatProvider: ChatProvider;
  model: string;
  messages: ChatMessage[];
}): Promise<{
  completion: Awaited<ReturnType<ChatProvider["complete"]>>;
  output: StructuredGenerationOutput;
  attemptCount: number;
  repairAttempts: number;
  structuredOutputMode: StructuredOutputMode;
  validationIssues: string[];
}> {
  return completeStructuredJsonOutput({
    chatProvider: options.chatProvider,
    getValidationIssues: readStructuredOutputIssues,
    jsonSchema: generationStructuredOutputJsonSchema,
    maxRepairAttempts: generationStructuredOutputRepairAttempts,
    messages: options.messages,
    model: options.model,
    outputContract: generationDraftOutputContract,
    outputShape: generationDraftOutputShape,
    parse: parseGenerationOutput,
    temperature: 0,
  });
}

function readStructuredOutputIssues(error: unknown): readonly string[] | null {
  return error instanceof StructuredOutputValidationError ? error.issues : null;
}

function createGenerationInputSummary(
  payload: WikiGeneratePayload,
  analysis: Awaited<ReturnType<CompileArtifactRepository["findAnalysisResultById"]>> & {},
): string {
  return JSON.stringify({
    workflow: "wiki.generate",
    knowledge_base_id: payload.knowledge_base_id,
    analysis_result_id: payload.analysis_result_id,
    source_document_count: payload.source_document_ids.length,
    entity_count: analysis.entities.length,
    concept_count: analysis.concepts.length,
    relationship_count: analysis.relationships.length,
  });
}

function createGenerationOutputSummary(
  output: StructuredGenerationOutput,
  repairAttempts = 0,
  sourceRefLocatorValidation?: Record<string, unknown>,
): string {
  return JSON.stringify({
    drafts: output.drafts.length,
    structured_output_repair_attempts: repairAttempts,
    ...(sourceRefLocatorValidation === undefined
      ? {}
      : { source_ref_locator_validation: sourceRefLocatorValidation }),
  });
}

function createSourceAnchorGenerationDraft(
  payload: WikiGeneratePayload,
  analysis: Awaited<ReturnType<CompileArtifactRepository["findAnalysisResultById"]>> & {},
): StructuredGeneratedDraft | null {
  return createSourceBackedDraft({
    analysis,
    mode: "source_anchor",
    payload,
  });
}

function createSourceBackedFallbackGenerationOutput(
  payload: WikiGeneratePayload,
  analysis: Awaited<ReturnType<CompileArtifactRepository["findAnalysisResultById"]>> & {},
): StructuredGenerationOutput | null {
  const draft = createSourceBackedDraft({
    analysis,
    mode: "source_fallback",
    payload,
  });

  return draft === null ? null : { drafts: [draft] };
}

function createSourceBackedDraft(input: {
  analysis: Awaited<ReturnType<CompileArtifactRepository["findAnalysisResultById"]>> & {};
  mode: "source_anchor" | "source_fallback";
  payload: WikiGeneratePayload;
}): StructuredGeneratedDraft | null {
  const { analysis, payload } = input;
  const sourceDocumentId = payload.source_document_ids[0] ?? analysis.sourceDocumentId;

  if (sourceDocumentId.length === 0) {
    return null;
  }

  const sourceRefs = normalizeFallbackSourceRefs(analysis.sourceRefs, sourceDocumentId);

  if (sourceRefs.length === 0) {
    return null;
  }

  const locatorRefs = normalizeFallbackLocatorRefs(analysis.locatorRefs, sourceRefs);
  const title = createSourceFallbackTitle(analysis, sourceDocumentId);
  const sourceAnchorId = createSourceAnchorId(sourceDocumentId);
  const sourceRefsWithAnchor = sourceRefs.map((sourceRef) => ({
    ...sourceRef,
    ...(input.mode === "source_anchor"
      ? {
          locator: resolveSourceAnchorLocator(sourceRef),
          locator_status: "resolved" as const,
          warning_codes: [],
        }
      : {}),
    parsed_content_id: analysis.parsedContentId,
    source_anchor_id: sourceAnchorId,
  }));
  const draft: StructuredGeneratedDraft = {
    confidence: input.mode === "source_anchor" ? 1 : 0.1,
    frontmatter: {
      generation_mode: input.mode,
      source_anchor: {
        id: sourceAnchorId,
        parsed_content_id: analysis.parsedContentId,
        source_document_id: sourceDocumentId,
      },
      source_document_ids: payload.source_document_ids,
      source_traceable: true,
      type: "source",
    },
    locator_refs: locatorRefs,
    markdown:
      input.mode === "source_anchor"
        ? createSourceAnchorMarkdown(
            title,
            analysis,
            sourceDocumentId,
            sourceAnchorId,
            sourceRefsWithAnchor,
          )
        : createSourceFallbackMarkdown(title, analysis, sourceRefsWithAnchor),
    page_type: "source",
    relationship_candidates: [],
    source_refs: sourceRefsWithAnchor,
    title,
  };

  return draft;
}

function normalizeFallbackSourceRefs(
  refs: readonly Record<string, unknown>[],
  sourceDocumentId: string,
): StructuredGeneratedDraft["source_refs"] {
  const normalized = refs.flatMap((ref) => {
    const documentId = readString(ref.document_id);

    if (documentId === null) {
      return [];
    }
    const locator = readString(ref.locator);
    const mediaAssetId = readString(ref.media_asset_id);
    const evidenceKind =
      ref.evidence_kind === "image_caption" ||
      ref.evidence_kind === "ocr" ||
      ref.evidence_kind === "text"
        ? ref.evidence_kind
        : null;
    const sourceRef: StructuredGeneratedDraft["source_refs"][number] = {
      document_id: documentId,
      ...(locator === null ? {} : { locator }),
      ...(mediaAssetId === null ? {} : { media_asset_id: mediaAssetId }),
      ...(evidenceKind === null ? {} : { evidence_kind: evidenceKind }),
    };

    return [sourceRef];
  });

  return normalized.length > 0
    ? normalized
    : [
        {
          document_id: sourceDocumentId,
          locator_status: "not_provided",
          warning_codes: ["source_fallback_without_locator"],
        },
      ];
}

function normalizeFallbackLocatorRefs(
  locatorRefs: readonly Record<string, unknown>[],
  sourceRefs: readonly StructuredGeneratedDraft["source_refs"][number][],
): string[] {
  const fromLocatorRefs = locatorRefs.flatMap((ref) => {
    const locator = readString(ref.locator);

    return locator === null ? [] : [locator];
  });
  const fromSourceRefs = sourceRefs.flatMap((ref) => {
    const locator = readString(ref.locator);

    return locator === null ? [] : [locator];
  });
  const uniqueLocators = [...new Set([...fromLocatorRefs, ...fromSourceRefs])];

  return uniqueLocators;
}

function enrichSourceRefsWithSourceAnchorIdentity(
  refs: readonly Record<string, unknown>[],
  parsedContentId: string,
): Record<string, unknown>[] {
  return refs.map((ref) => {
    const documentId = readString(ref.document_id);

    if (documentId === null) {
      return ref;
    }

    return {
      ...ref,
      parsed_content_id: readString(ref.parsed_content_id) ?? parsedContentId,
      source_anchor_id: readString(ref.source_anchor_id) ?? createSourceAnchorId(documentId),
    };
  });
}

function resolveSourceAnchorLocator(sourceRef: StructuredGeneratedDraft["source_refs"][number]) {
  const locator = readString(sourceRef.locator);

  return locator === null || locator === "source_markdown" ? "source_markdown:1" : locator;
}

function createSourceFallbackTitle(
  analysis: Awaited<ReturnType<CompileArtifactRepository["findAnalysisResultById"]>> & {},
  sourceDocumentId: string,
): string {
  const sourceTitle = resolveSourceAnchorDisplayTitle(analysis.metadata);

  if (sourceTitle !== null) {
    return `Source: ${sourceTitle}`;
  }

  for (const collection of [analysis.entities, analysis.concepts, analysis.claims]) {
    for (const item of collection) {
      const title = readString(item.title);

      if (title !== null) {
        return `Source: ${title}`;
      }
    }
  }

  return `Source: ${sourceDocumentId}`;
}

function resolveSourceAnchorDisplayTitle(metadata: Record<string, unknown>): string | null {
  const sourceFrontmatter = normalizeRecord(metadata[sourceFrontmatterMetadataKey]);
  const sourceDocumentMetadata = normalizeRecord(metadata[sourceDocumentMetadataKey]);
  const candidates = [
    readString(sourceFrontmatter?.title),
    readString(sourceFrontmatter?.document_title),
    readString(sourceFrontmatter?.source_title),
    readString(sourceDocumentMetadata?.title),
    readString(sourceDocumentMetadata?.display_name),
    readString(sourceDocumentMetadata?.file_name),
    readString(sourceDocumentMetadata?.filename),
    readString(sourceDocumentMetadata?.name),
    readString(metadata.document_name),
    basenameFromPath(readString(sourceDocumentMetadata?.source_path)),
  ];

  for (const candidate of candidates) {
    const normalized = normalizeSourceAnchorTitle(candidate);

    if (normalized !== null) {
      return normalized;
    }
  }

  return null;
}

function basenameFromPath(value: string | null): string | null {
  if (value === null) {
    return null;
  }

  const parts = value.split(/[\\/]+/u).filter((part) => part.length > 0);

  return parts.at(-1) ?? null;
}

function normalizeSourceAnchorTitle(value: string | null): string | null {
  if (value === null) {
    return null;
  }

  const trimmed = value.replace(/\s+/gu, " ").trim();

  if (trimmed.length === 0 || /^https?:\/\//iu.test(trimmed)) {
    return null;
  }

  const withoutExtension = trimmed.replace(/\.(?:md|markdown|txt|docx?|pdf|html?|rtf|odt)$/iu, "");

  return createBoundedFallbackText(withoutExtension, 160);
}

function createSourceFallbackMarkdown(
  title: string,
  analysis: Awaited<ReturnType<CompileArtifactRepository["findAnalysisResultById"]>> & {},
  sourceRefs: readonly StructuredGeneratedDraft["source_refs"][number][],
): string {
  const signalLines = [
    ...createFallbackSignalLines("Entities", analysis.entities),
    ...createFallbackSignalLines("Concepts", analysis.concepts),
    ...createFallbackSignalLines("Claims", analysis.claims),
  ];
  const sourceRefLines = sourceRefs.map((ref) => {
    const locator = readString(ref.locator);

    return `- ${ref.document_id}${locator === null ? "" : ` (${locator})`}`;
  });

  return [
    `# ${title}`,
    "",
    "This page was created as a source-backed fallback after model-generated Wiki drafts could not be validated as structured JSON.",
    "",
    "## Source References",
    "",
    ...sourceRefLines,
    "",
    "## Extracted Signals",
    "",
    ...(signalLines.length > 0
      ? signalLines
      : ["- No structured analysis signals were available."]),
  ].join("\n");
}

function createSourceAnchorMarkdown(
  title: string,
  analysis: Awaited<ReturnType<CompileArtifactRepository["findAnalysisResultById"]>> & {},
  sourceDocumentId: string,
  sourceAnchorId: string,
  sourceRefs: readonly StructuredGeneratedDraft["source_refs"][number][],
): string {
  const signalLines = [
    ...createFallbackSignalLines("Entities", analysis.entities),
    ...createFallbackSignalLines("Concepts", analysis.concepts),
    ...createFallbackSignalLines("Claims", analysis.claims),
  ];
  const sourceRefLines = sourceRefs.map((ref) => {
    const locator = readString(ref.locator);

    return [
      `- document_id: ${ref.document_id}`,
      `source_anchor_id: ${ref.source_anchor_id ?? sourceAnchorId}`,
      `parsed_content_id: ${ref.parsed_content_id ?? analysis.parsedContentId}`,
      locator === null ? null : `locator: ${locator}`,
    ]
      .filter((item): item is string => item !== null)
      .join("; ");
  });

  return [
    `# ${title}`,
    "",
    "This page is the deterministic source anchor for one uploaded Source Document.",
    "",
    "## Source Identity",
    "",
    `- source_anchor_id: ${sourceAnchorId}`,
    `- source_document_id: ${sourceDocumentId}`,
    `- parsed_content_id: ${analysis.parsedContentId}`,
    "",
    "## Source References",
    "",
    ...sourceRefLines,
    "",
    "## Extracted Signals",
    "",
    ...(signalLines.length > 0
      ? signalLines
      : ["- No structured analysis signals were available."]),
  ].join("\n");
}

function createSourceAnchorId(sourceDocumentId: string): string {
  const normalizedSourceDocumentId = sourceDocumentId
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "_")
    .replace(/^_+|_+$/gu, "");

  return `src_anchor_${normalizedSourceDocumentId || createStableHash(sourceDocumentId).slice(0, 16)}`;
}

function createFallbackSignalLines(
  label: string,
  items: readonly Record<string, unknown>[],
): string[] {
  return items.flatMap((item) => {
    const title = readString(item.title);

    if (title === null) {
      return [];
    }

    const summary = readString(item.summary);

    return [`- ${label}: ${title}${summary === null ? "" : ` - ${summary}`}`];
  });
}

export function createSlug(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "");

  return slug.length > 0 ? slug : `page-${createStableHash(value).slice(0, 12)}`;
}

function createGeneratedDraftSlug(draft: StructuredGeneratedDraft): string {
  if (draft.page_type !== "source") {
    return createSlug(draft.title);
  }

  const sourceAnchor = normalizeRecord(draft.frontmatter.source_anchor);
  const sourceDocumentId = readString(sourceAnchor?.source_document_id);

  return sourceDocumentId === null
    ? createSlug(draft.title)
    : `source-${createSlug(sourceDocumentId)}`;
}

function createRelationshipPageLookup(pages: readonly RelationshipPageRecord[]) {
  const byId = new Map<string, RelationshipPageRecord>();
  const byKey = new Map<string, RelationshipPageRecord>();

  for (const page of pages) {
    byId.set(page.id, page);
    addRelationshipPageKey(byKey, page.slug, page);
    addRelationshipPageKey(byKey, page.title, page);
    addRelationshipPageKey(byKey, createSlug(page.title), page);
  }

  return { byId, byKey };
}

function addRelationshipPageKey(
  lookup: Map<string, RelationshipPageRecord>,
  value: string,
  page: RelationshipPageRecord,
): void {
  const key = normalizeRelationshipLookupKey(value);

  if (key !== null && !lookup.has(key)) {
    lookup.set(key, page);
  }
}

function resolveRelationshipPage(
  lookup: ReturnType<typeof createRelationshipPageLookup>,
  reference: { pageId: string | null; slug: string | null; title: string | null },
): RelationshipPageRecord | null {
  if (reference.pageId !== null) {
    const page = lookup.byId.get(reference.pageId);

    if (page !== undefined) {
      return page;
    }
  }

  for (const value of [reference.slug, readSlugTail(reference.slug), reference.title]) {
    const key = normalizeRelationshipLookupKey(value);
    const page = key === null ? undefined : lookup.byKey.get(key);

    if (page !== undefined) {
      return page;
    }
  }

  return null;
}

function readSlugTail(value: string | null): string | null {
  if (value === null) {
    return null;
  }

  return value.split("/").filter(Boolean).at(-1) ?? null;
}

function normalizeRelationshipLookupKey(value: string | null): string | null {
  const normalized = value?.trim().toLowerCase();

  return normalized === undefined || normalized.length === 0 ? null : normalized;
}

function readRecordArray(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    const record = normalizeRecord(item);

    return record === null ? [] : [record];
  });
}

function readPositiveNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return null;
  }

  return value;
}

function createStableRelationshipId(prefix: string, ...parts: readonly string[]): string {
  return `${prefix}${createStableHash(parts.join("\u0000")).slice(0, 32)}`;
}

function createStableHash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function createGenerationPromptAnalysisView(
  analysis: Awaited<ReturnType<CompileArtifactRepository["findAnalysisResultById"]>> & {},
  promptLimits: CompilePromptLimits,
): Record<string, unknown> {
  return {
    id: analysis.id,
    knowledgeBaseId: analysis.knowledgeBaseId,
    sourceDocumentId: analysis.sourceDocumentId,
    parsedContentId: analysis.parsedContentId,
    promptVersionId: analysis.promptVersionId,
    inputSnapshotId: analysis.inputSnapshotId,
    contentHash: analysis.contentHash,
    counts: {
      entities: analysis.entities.length,
      concepts: analysis.concepts.length,
      claims: analysis.claims.length,
      contradictions: analysis.contradictions.length,
      relationships: analysis.relationships.length,
    },
    omitted_counts: {
      entities: Math.max(0, analysis.entities.length - promptLimits.generationAnalysisItemLimit),
      concepts: Math.max(0, analysis.concepts.length - promptLimits.generationAnalysisItemLimit),
      claims: Math.max(0, analysis.claims.length - promptLimits.generationAnalysisItemLimit),
      contradictions: Math.max(
        0,
        analysis.contradictions.length - promptLimits.generationAnalysisItemLimit,
      ),
      relationships: Math.max(
        0,
        analysis.relationships.length - promptLimits.generationAnalysisItemLimit,
      ),
    },
    entities: compactPromptRecords(
      analysis.entities,
      promptLimits.generationAnalysisItemLimit,
      promptLimits,
    ),
    concepts: compactPromptRecords(
      analysis.concepts,
      promptLimits.generationAnalysisItemLimit,
      promptLimits,
    ),
    claims: compactPromptRecords(
      analysis.claims,
      promptLimits.generationAnalysisItemLimit,
      promptLimits,
    ),
    contradictions: compactPromptRecords(
      analysis.contradictions,
      promptLimits.generationAnalysisItemLimit,
      promptLimits,
    ),
    relationships: compactPromptRecords(
      analysis.relationships,
      promptLimits.generationAnalysisItemLimit,
      promptLimits,
    ),
    sourceRefs: compactPromptRecords(
      analysis.sourceRefs,
      promptLimits.generationPromptArrayLimit,
      promptLimits,
    ),
    locatorRefs: compactPromptRecords(
      analysis.locatorRefs,
      promptLimits.generationPromptArrayLimit,
      promptLimits,
    ),
    metadata: compactPromptJsonValue(analysis.metadata, promptLimits),
  };
}

function compactPromptRecords(
  records: readonly Record<string, unknown>[],
  limit: number,
  promptLimits: CompilePromptLimits,
): Record<string, unknown>[] {
  return records
    .slice(0, limit)
    .map((record) => compactPromptJsonValue(record, promptLimits) as Record<string, unknown>);
}

function compactPromptJsonValue(
  value: unknown,
  promptLimits: CompilePromptLimits,
  depth = 0,
): unknown {
  if (typeof value === "string") {
    return createPromptTextExcerpt(value, promptLimits.generationPromptStringMaxChars).text;
  }
  if (typeof value !== "object" || value === null) {
    return value;
  }
  if (Array.isArray(value)) {
    return value
      .slice(0, promptLimits.generationPromptArrayLimit)
      .map((item) => compactPromptJsonValue(item, promptLimits, depth + 1));
  }
  if (depth >= 4) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value)
      .slice(0, promptLimits.generationPromptObjectKeyLimit)
      .map(([key, item]) => [key, compactPromptJsonValue(item, promptLimits, depth + 1)]),
  );
}

function createPromptTextExcerpt(
  text: string,
  maxChars: number,
): { text: string; truncated: boolean } {
  if (text.length <= maxChars) {
    return {
      text,
      truncated: false,
    };
  }

  return {
    text: `${text.slice(0, maxChars)}\n\n[Content truncated for compile prompt budget.]`,
    truncated: true,
  };
}

async function assertJobCanContinue(
  guard: WorkerJobStateGuard | undefined,
  input: Parameters<WorkerJobStateGuard["canContinueJob"]>[0],
): Promise<void> {
  const result = await guard?.canContinueJob(input);

  if (result?.canContinue === false) {
    throw new StaleCompileJobError(result.reason ?? "unknown");
  }
}

class StaleCompileJobError extends Error {
  constructor(readonly reason: string) {
    super(`Compile stage skipped because the ingest job is not runnable: ${reason}.`);
  }
}

function toStageError(code: string, error: unknown): Record<string, unknown> {
  return {
    category: classifyStageFailure(error),
    code,
    message: summarizeError(error),
    retryable: !(error instanceof StructuredOutputValidationError),
  };
}

function toGraphRefreshError(error: unknown): {
  code: string;
  message: string;
  retryable: boolean;
} {
  const message = error instanceof Error ? error.message : "Unknown graph refresh failure.";

  return {
    code: "graph_refresh_failed",
    message: message.slice(0, 500),
    retryable: true,
  };
}

function readRetrievalRelationType(value: string): RetrievalRelationType {
  if (
    value === "wikilink" ||
    value === "shared_source" ||
    value === "common_neighbor" ||
    value === "type_affinity" ||
    value === "generated_relationship" ||
    value === "evidence_relationship" ||
    value === "manual"
  ) {
    return value;
  }

  return "generated_relationship";
}

function readRetrievalVisibilityOrigin(value: string | null): RetrievalVisibilityOrigin {
  if (value === "fork_owned" || value === "upstream_inherited" || value === "canonical") {
    return value;
  }

  return "canonical";
}

function summarizeError(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown analysis failure.";
}

function classifyStageFailure(error: unknown): string {
  if (error instanceof StructuredOutputValidationError) {
    return "output_validation_failed";
  }

  const message = summarizeError(error).toLowerCase();

  if (message.includes("rate limit") || message.includes("rate_limit") || message.includes("429")) {
    return "rate_limited";
  }
  if (message.includes("timeout") || message.includes("timed out")) {
    return "timeout";
  }
  if (
    message.includes("unavailable") ||
    message.includes("network") ||
    message.includes("econnrefused") ||
    message.includes("enotfound")
  ) {
    return "unavailable";
  }

  return "invalid_response";
}

function readStructuredOutputRepairAttempts(error: unknown): number {
  const metadata = readStructuredJsonOutputErrorMetadata(error);

  if (metadata !== null) {
    return metadata.repairAttempts;
  }

  const value = (error as { repairAttempts?: unknown } | null)?.repairAttempts;

  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function readStructuredOutputValidationIssues(error: unknown): string[] {
  const metadata = readStructuredJsonOutputErrorMetadata(error);

  if (metadata !== null) {
    return metadata.validationIssues;
  }

  if (error instanceof StructuredOutputValidationError) {
    return [...error.issues];
  }

  return [];
}

function isGenerationStructuredOutputRepairExhausted(error: unknown): boolean {
  return (
    error instanceof StructuredOutputValidationError &&
    readStructuredOutputRepairAttempts(error) >= generationStructuredOutputRepairAttempts
  );
}

function readPurposeText(value: unknown): string | null {
  const record = normalizeRecord(value);
  const text = record?.text;

  return typeof text === "string" && text.trim().length > 0 ? text.trim() : null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function isString(value: string | null): value is string {
  return value !== null;
}

function normalizeRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }

  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

function toRecord(value: object): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

function createWorkerId(scope: string): string {
  const prefixes: Record<string, string> = {
    analysis: "analysis_",
    change_set: "cs_",
    compile_stage: "stage_",
    draft: "draft_",
    edge_source: "edgesrc_",
    embedding: "emb_",
    graph_edge: "edge_",
    knowledge_version: "kbv_",
    model_call: "llm_call_",
    page_merge_record: "pmr_",
    page_version: "pgv_",
    wiki_page: "page_",
  };
  const prefix = prefixes[scope] ?? `${scope}_`;

  return `${prefix}${crypto.randomUUID().replaceAll("-", "")}`;
}

function normalizeMergeCandidateCount(value: number | undefined): number {
  return value === undefined || !Number.isInteger(value) || value < 1 ? 1 : value;
}

function normalizeMergeCandidateIndex(value: number | undefined, count: number): number {
  if (value === undefined || !Number.isInteger(value) || value < 0) {
    return 0;
  }

  return Math.min(value, count - 1);
}

function formatPgVector(vector: readonly number[]): string {
  return `[${vector.map((value) => (Number.isFinite(value) ? value : 0)).join(",")}]`;
}

function joinUrlPath(baseUrl: string, path: string): string {
  const trimmedBase = baseUrl.replace(/\/+$/u, "");
  const trimmedPath = path.replace(/^\/+/u, "");

  return trimmedBase.endsWith(`/${trimmedPath}`) ? trimmedBase : `${trimmedBase}/${trimmedPath}`;
}

async function readBodyAsStringWithinLimit(
  body: unknown,
  contentLength: number | undefined,
  maxBytes: number,
  objectKey: string,
): Promise<
  | { kind: "success"; text: string }
  | { kind: "fatal"; objectKey: string; actualBytes: number; limitBytes: number }
> {
  if (contentLength !== undefined && contentLength > maxBytes) {
    return {
      kind: "fatal",
      objectKey,
      actualBytes: contentLength,
      limitBytes: maxBytes,
    };
  }

  const chunks: Buffer[] = [];
  let totalBytes = 0;

  for await (const chunk of body as AsyncIterable<Buffer | string>) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buffer.byteLength;

    if (totalBytes > maxBytes) {
      return {
        kind: "fatal",
        objectKey,
        actualBytes: totalBytes,
        limitBytes: maxBytes,
      };
    }

    chunks.push(buffer);
  }

  return {
    kind: "success",
    text: Buffer.concat(chunks, totalBytes).toString("utf8"),
  };
}
