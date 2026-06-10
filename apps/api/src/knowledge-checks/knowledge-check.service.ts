import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { ApiError, createResourceId } from "@fococontext/contracts";
import {
  completeStructuredJsonOutput,
  readStructuredJsonOutputErrorMetadata,
  resolveDatasetPromptTemplateFromSnapshot,
  resolveChatModel,
  semanticKnowledgeCheckOutputContract,
  semanticKnowledgeCheckOutputShape,
  semanticKnowledgeCheckStructuredOutputJsonSchema,
  type ChatProvider,
  type ModelCallUsage,
  type ResolvedDatasetPromptTemplate,
  type StructuredOutputMode,
} from "@fococontext/llm";

import {
  apiDatabaseHydratorToken,
  type ApiDatabaseHydrator,
} from "../database/api-database-hydrator.js";
import { apiDatabaseMirrorToken, type ApiDatabaseMirror } from "../database/api-database-mirror.js";
import type { ApiResourceScope } from "../auth/api-key.guard.js";
import { KnowledgeBaseService } from "../knowledge-bases/knowledge-base.service.js";
import type { KnowledgeBaseResponse } from "../knowledge-bases/knowledge-base.types.js";
import { WebhookService } from "../webhooks/webhook.service.js";
import { wikiStoreToken, type WikiPageApiRecord, type WikiStore } from "../wiki/wiki-store.js";
import {
  knowledgeCheckQueueToken,
  type KnowledgeCheckQueue,
} from "../queues/knowledge-check.queue.js";
import { KnowledgeCheckRepository } from "./knowledge-check.repository.js";
import {
  knowledgeCheckTypes,
  type CreateKnowledgeCheckInput,
  type KnowledgeCheckFinding,
  type KnowledgeCheckRecord,
  type KnowledgeCheckResponse,
  type KnowledgeCheckSemanticRun,
  type KnowledgeCheckType,
} from "./knowledge-check.types.js";

const defaultChecks: KnowledgeCheckType[] = ["missing_sources"];
const semanticCheckTypes = new Set<KnowledgeCheckType>(["semantic_consistency"]);
const semanticStructuredOutputRepairAttempts = 3;
const knowledgeCheckPageSize = 250;
const largeKnowledgeCheckScopePageThreshold = 100;
const knowledgeCheckRelatedPageConcurrency = 8;

export const knowledgeCheckChatProviderToken = Symbol("knowledgeCheckChatProvider");

@Injectable()
export class KnowledgeCheckService {
  constructor(
    private readonly knowledgeBaseService: KnowledgeBaseService,
    private readonly repository: KnowledgeCheckRepository,
    @Inject(apiDatabaseMirrorToken) private readonly databaseMirror: ApiDatabaseMirror,
    @Inject(apiDatabaseHydratorToken) private readonly databaseHydrator: ApiDatabaseHydrator,
    @Inject(wikiStoreToken) private readonly wikiStore: WikiStore,
    @Inject(knowledgeCheckQueueToken) private readonly knowledgeCheckQueue: KnowledgeCheckQueue,
    @Inject(knowledgeCheckChatProviderToken) private readonly chatProvider: ChatProvider,
    private readonly webhookService: WebhookService,
  ) {}

  async create(
    knowledgeBaseId: string,
    input: CreateKnowledgeCheckInput,
    scope?: ApiResourceScope,
  ): Promise<KnowledgeCheckResponse> {
    await this.databaseHydrator.refresh();
    const knowledgeBase = this.knowledgeBaseService.get(knowledgeBaseId, scope);
    const datasetConfiguration = this.knowledgeBaseService.getDatasetConfiguration(
      knowledgeBaseId,
      scope,
    );
    const knowledgeCheckConfig = normalizeRecord(datasetConfiguration.values.knowledge_check);
    const checks = readChecks(input.checks, knowledgeCheckConfig);
    const pageIds = readPageIds(input.page_ids);
    const sourceDocumentIds = readPageIds(input.source_document_ids);
    const shouldQueue = await shouldQueueKnowledgeCheck({
      knowledgeBaseId: knowledgeBase.id,
      pageIds,
      sourceDocumentIds,
      wikiStore: this.wikiStore,
    });

    if (shouldQueue) {
      return this.enqueueKnowledgeCheck({
        checks,
        datasetConfigurationSnapshot: {
          id: datasetConfiguration.latest_snapshot_id,
          preset_id: datasetConfiguration.preset_id,
          version: datasetConfiguration.version,
          values: {
            knowledge_check: knowledgeCheckConfig,
            prompt_templates: datasetConfiguration.values.prompt_templates,
          },
        },
        knowledgeBaseId: knowledgeBase.id,
        pageIds,
        ...(scope === undefined ? {} : { scope }),
        sourceDocumentIds,
      });
    }

    const result = await createFindings({
      chatProvider: this.chatProvider,
      checks,
      datasetConfigurationSnapshot: {
        id: datasetConfiguration.latest_snapshot_id,
        preset_id: datasetConfiguration.preset_id,
        values: datasetConfiguration.values,
        version: datasetConfiguration.version,
      },
      knowledgeBase,
      knowledgeBaseId: knowledgeBase.id,
      pageIds,
      sourceDocumentIds,
      wikiStore: this.wikiStore,
    });
    const now = new Date().toISOString();
    const record: KnowledgeCheckRecord = {
      id: createResourceId("knowledgeCheck"),
      knowledgeBaseId: knowledgeBase.id,
      status: "completed",
      progress: 100,
      checks,
      pageIds,
      sourceDocumentIds,
      findings: result.findings,
      semanticRun: result.semanticRun,
      configurationSnapshot: {
        id: datasetConfiguration.latest_snapshot_id,
        preset_id: datasetConfiguration.preset_id,
        version: datasetConfiguration.version,
        values: {
          knowledge_check: knowledgeCheckConfig,
          prompt_templates: datasetConfiguration.values.prompt_templates,
        },
      },
      createdAt: now,
      updatedAt: now,
    };
    const created = this.repository.create(record);
    await this.databaseMirror.saveKnowledgeCheck(created);
    await this.webhookService.emit({
      eventType: "knowledge_check.completed",
      knowledgeBaseId: knowledgeBase.id,
      payload: {
        check_id: created.id,
        finding_count: created.findings.length,
        semantic_status: created.semanticRun.status,
        status: created.status,
      },
      requestTrace: {
        event_source: "knowledge_check.create",
      },
      ...(scope === undefined ? {} : { scope }),
    });

    return toKnowledgeCheckResponse(created);
  }

  async get(checkId: string, scope?: ApiResourceScope): Promise<KnowledgeCheckResponse> {
    await this.databaseHydrator.refresh();
    const record = this.repository.findById(checkId);

    if (record === undefined) {
      throw createKnowledgeCheckNotFoundError();
    }

    try {
      this.knowledgeBaseService.assertReadableKnowledgeBase(record.knowledgeBaseId, scope);
    } catch (error) {
      if (error instanceof ApiError && error.code === "knowledge_base_not_found") {
        throw createKnowledgeCheckNotFoundError();
      }

      throw error;
    }

    return toKnowledgeCheckResponse(record);
  }

  private async enqueueKnowledgeCheck(input: {
    checks: KnowledgeCheckType[];
    datasetConfigurationSnapshot: Record<string, unknown>;
    knowledgeBaseId: string;
    pageIds: string[];
    scope?: ApiResourceScope;
    sourceDocumentIds: string[];
  }): Promise<KnowledgeCheckResponse> {
    const now = new Date().toISOString();
    const record: KnowledgeCheckRecord = {
      id: createResourceId("knowledgeCheck"),
      knowledgeBaseId: input.knowledgeBaseId,
      status: "queued",
      progress: 0,
      checks: input.checks,
      pageIds: input.pageIds,
      sourceDocumentIds: input.sourceDocumentIds,
      findings: [],
      semanticRun: {
        findings_count: 0,
        repair_attempts: 0,
        status: "skipped",
        trace: {
          queued: true,
          reason: "large_scope",
        },
      },
      configurationSnapshot: input.datasetConfigurationSnapshot,
      createdAt: now,
      updatedAt: now,
    };
    const created = this.repository.create(record);
    await this.databaseMirror.saveKnowledgeCheck(created);

    try {
      await this.knowledgeCheckQueue.enqueueKnowledgeCheckJob({
        check_id: created.id,
      });
    } catch (error) {
      const failed: KnowledgeCheckRecord = {
        ...created,
        status: "failed",
        progress: 100,
        semanticRun: {
          findings_count: 0,
          repair_attempts: 0,
          status: "failed",
          failure_reason: summarizeError(error),
          trace: {
            queued: true,
            queue_error: "enqueue_failed",
          },
        },
        updatedAt: new Date().toISOString(),
      };

      this.repository.create(failed);
      await this.databaseMirror.saveKnowledgeCheck(failed);
      throw error;
    }

    return toKnowledgeCheckResponse(created);
  }
}

function createKnowledgeCheckNotFoundError(): ApiError {
  return new ApiError("invalid_request", {
    messageKey: "api.validation.knowledge_check_not_found",
  });
}

function readChecks(
  value: string[] | undefined,
  knowledgeCheckConfig: Record<string, unknown>,
): KnowledgeCheckType[] {
  if (value === undefined || value.length === 0) {
    return normalizeConfiguredChecks(knowledgeCheckConfig.default_checks);
  }

  return value.map((check) => {
    if (knowledgeCheckTypes.includes(check as KnowledgeCheckType)) {
      return check as KnowledgeCheckType;
    }

    throw new ApiError("invalid_request", {
      messageKey: "api.validation.knowledge_check_type_invalid",
      details: {
        fields: ["checks"],
      },
    });
  });
}

function normalizeConfiguredChecks(value: unknown): KnowledgeCheckType[] {
  const configuredChecks = Array.isArray(value) ? value : defaultChecks;
  const normalized = configuredChecks.flatMap((item) => {
    if (typeof item !== "string") {
      return [];
    }

    return [normalizeCheckName(item)];
  });

  return normalized.length === 0 ? [...defaultChecks] : [...new Set(normalized)];
}

function normalizeCheckName(value: string): KnowledgeCheckType {
  if (value === "missing_source_refs") {
    return "missing_sources";
  }
  if (value === "dead_wikilinks") {
    return "broken_wikilinks";
  }
  if (knowledgeCheckTypes.includes(value as KnowledgeCheckType)) {
    return value as KnowledgeCheckType;
  }

  throw new ApiError("invalid_request", {
    messageKey: "api.validation.knowledge_check_type_invalid",
    details: {
      fields: ["checks"],
    },
  });
}

function normalizeRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function normalizeRecordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is Record<string, unknown> =>
          typeof item === "object" && item !== null && !Array.isArray(item),
      )
    : [];
}

function readPageIds(value: string[] | undefined): string[] {
  return [...new Set((value ?? []).map((pageId) => pageId.trim()).filter(Boolean))];
}

async function shouldQueueKnowledgeCheck(input: {
  knowledgeBaseId: string;
  pageIds: readonly string[];
  sourceDocumentIds: readonly string[];
  wikiStore: WikiStore;
}): Promise<boolean> {
  if (
    input.pageIds.length > largeKnowledgeCheckScopePageThreshold ||
    input.sourceDocumentIds.length > largeKnowledgeCheckScopePageThreshold
  ) {
    return true;
  }

  if (input.wikiStore.countKnowledgeCheckPages !== undefined) {
    const targetCount = await input.wikiStore.countKnowledgeCheckPages(input.knowledgeBaseId, {
      page: 1,
      pageIds: input.pageIds,
      pageSize: 1,
      sourceDocumentIds: input.sourceDocumentIds,
    });

    return targetCount > largeKnowledgeCheckScopePageThreshold;
  }

  if (input.pageIds.length > 0 || input.sourceDocumentIds.length > 0) {
    return false;
  }

  const page = await input.wikiStore.listPagesPaginated(input.knowledgeBaseId, {
    page: 1,
    pageSize: 1,
  });

  return page.total > largeKnowledgeCheckScopePageThreshold;
}

interface CreateFindingsInput {
  chatProvider: ChatProvider;
  checks: readonly KnowledgeCheckType[];
  datasetConfigurationSnapshot: Record<string, unknown>;
  knowledgeBase: KnowledgeBaseResponse;
  knowledgeBaseId: string;
  pageIds: readonly string[];
  sourceDocumentIds: readonly string[];
  wikiStore: WikiStore;
}

interface KnowledgeCheckExecutionResult {
  findings: KnowledgeCheckFinding[];
  semanticRun: KnowledgeCheckSemanticRun;
}

async function createFindings(input: CreateFindingsInput): Promise<KnowledgeCheckExecutionResult> {
  const {
    chatProvider,
    checks,
    datasetConfigurationSnapshot,
    knowledgeBase,
    knowledgeBaseId,
    pageIds,
    sourceDocumentIds,
    wikiStore,
  } = input;
  const sourceScopedPages = await listKnowledgeCheckPages(wikiStore, knowledgeBaseId, {
    pageIds,
    sourceDocumentIds,
  });
  const pageIndex = await listKnowledgeCheckPageKeyIndex(
    wikiStore,
    knowledgeBaseId,
    sourceScopedPages,
  );
  const relatedByPageId =
    needsGraphData(checks) || checks.includes("orphan_pages")
      ? await listRelatedPages(wikiStore, sourceScopedPages)
      : new Map<string, Record<string, unknown>[]>();
  const incomingPageIds = createIncomingPageIds(relatedByPageId);
  const findings: KnowledgeCheckFinding[] = [];

  if (checks.includes("missing_sources")) {
    findings.push(...createMissingSourceFindings(sourceScopedPages));
  }
  if (checks.includes("broken_wikilinks")) {
    findings.push(...createBrokenWikilinkFindings(sourceScopedPages, pageIndex));
  }
  if (checks.includes("missing_pages")) {
    findings.push(...createMissingPageFindings(sourceScopedPages, pageIndex));
  }
  if (checks.includes("orphan_pages")) {
    findings.push(...createOrphanPageFindings(sourceScopedPages, relatedByPageId, incomingPageIds));
  }
  if (checks.includes("duplicate_candidates")) {
    findings.push(...createDuplicateCandidateFindings(sourceScopedPages));
  }
  if (checks.includes("contradiction_candidates")) {
    findings.push(...createContradictionCandidateFindings(sourceScopedPages));
  }
  if (checks.includes("sparse_communities")) {
    findings.push(...createSparseCommunityFindings(sourceScopedPages, relatedByPageId));
  }
  if (checks.includes("bridge_pages")) {
    findings.push(...createBridgePageFindings(sourceScopedPages, relatedByPageId));
  }
  if (checks.includes("weak_evidence")) {
    findings.push(...createWeakEvidenceFindings(sourceScopedPages));
  }
  if (checks.includes("missing_context")) {
    findings.push(
      ...createMissingContextFindings(sourceScopedPages, relatedByPageId, incomingPageIds),
    );
  }
  findings.push(...createForkScopedFindings(knowledgeBase, checks, sourceScopedPages));

  const semanticRun = await createSemanticFindings({
    chatProvider,
    checks,
    datasetConfigurationSnapshot,
    findings,
    pages: sourceScopedPages,
  });

  return {
    findings,
    semanticRun,
  };
}

function createMissingSourceFindings(
  targetPages: readonly WikiPageApiRecord[],
): KnowledgeCheckFinding[] {
  return targetPages
    .filter((page) => page.source_document_ids.length === 0)
    .map((page) =>
      createFinding({
        type: "missing_sources",
        severity: "medium",
        page_id: page.id,
        message: "api.knowledge_check.finding.missing_source_evidence",
        evidence: [
          {
            object_type: "wiki_page",
            object_id: page.id,
          },
        ],
        suggested_action: {
          action: "add_source_evidence",
        },
      }),
    );
}

function createBrokenWikilinkFindings(
  targetPages: readonly WikiPageApiRecord[],
  pageIndex: ReadonlySet<string>,
): KnowledgeCheckFinding[] {
  return targetPages.flatMap((page) =>
    extractWikilinks(page.markdown)
      .filter((target) => !pageIndex.has(normalizePageKey(target)))
      .map((target) =>
        createFinding({
          type: "broken_wikilinks" as const,
          severity: "medium" as const,
          page_id: page.id,
          message: "api.knowledge_check.finding.broken_wikilink",
          evidence: [
            {
              object_type: "wikilink",
              source_page_id: page.id,
              target_title: target,
            },
          ],
          suggested_action: {
            action: "create_missing_page_or_remove_link",
          },
        }),
      ),
  );
}

function createMissingPageFindings(
  targetPages: readonly WikiPageApiRecord[],
  pageIndex: ReadonlySet<string>,
): KnowledgeCheckFinding[] {
  return targetPages.flatMap((page) =>
    readStringArray(page.metadata.missing_pages)
      .filter((target) => !pageIndex.has(normalizePageKey(target)))
      .map((target) =>
        createFinding({
          type: "missing_pages" as const,
          severity: "medium" as const,
          page_id: page.id,
          message: "api.knowledge_check.finding.missing_page",
          evidence: [
            {
              object_type: "missing_page_candidate",
              source_page_id: page.id,
              target_title: target,
            },
          ],
          suggested_action: {
            action: "create_missing_page_or_mark_not_needed",
          },
        }),
      ),
  );
}

function createOrphanPageFindings(
  targetPages: readonly WikiPageApiRecord[],
  relatedByPageId: ReadonlyMap<string, readonly Record<string, unknown>[]>,
  incomingPageIds: ReadonlySet<string>,
): KnowledgeCheckFinding[] {
  return targetPages
    .filter(
      (page) => (relatedByPageId.get(page.id)?.length ?? 0) === 0 && !incomingPageIds.has(page.id),
    )
    .map((page) =>
      createFinding({
        type: "orphan_pages",
        severity: "low",
        page_id: page.id,
        message: "api.knowledge_check.finding.orphan_page",
        evidence: [
          {
            object_type: "wiki_page",
            object_id: page.id,
            graph_degree: 0,
          },
        ],
        suggested_action: {
          action: "link_or_confirm_isolated_page",
        },
      }),
    );
}

function createDuplicateCandidateFindings(
  targetPages: readonly WikiPageApiRecord[],
): KnowledgeCheckFinding[] {
  const pagesByTitle = new Map<string, WikiPageApiRecord[]>();

  for (const page of targetPages) {
    const key = normalizePageKey(page.title);
    pagesByTitle.set(key, [...(pagesByTitle.get(key) ?? []), page]);
  }

  return [...pagesByTitle.values()]
    .filter((pages) => pages.length > 1)
    .flatMap((pages) =>
      pages.map((page) =>
        createFinding({
          type: "duplicate_candidates" as const,
          severity: "medium" as const,
          page_id: page.id,
          message: "api.knowledge_check.finding.duplicate_title",
          evidence: pages.map((candidate) => ({
            object_type: "wiki_page",
            object_id: candidate.id,
            title: candidate.title,
          })),
          suggested_action: {
            action: "merge_or_mark_not_duplicate",
          },
        }),
      ),
    );
}

function createContradictionCandidateFindings(
  targetPages: readonly WikiPageApiRecord[],
): KnowledgeCheckFinding[] {
  return targetPages.flatMap((page) =>
    readStringArray(page.metadata.contradiction_candidates)
      .map((candidate) => candidate.trim())
      .filter(Boolean)
      .map((candidate) =>
        createFinding({
          type: "contradiction_candidates" as const,
          severity: "high" as const,
          page_id: page.id,
          message: "api.knowledge_check.finding.contradiction_candidate",
          evidence: [
            {
              object_type: "wiki_page",
              object_id: page.id,
              candidate,
            },
          ],
          suggested_action: {
            action: "add_source_evidence",
          },
        }),
      ),
  );
}

function createSparseCommunityFindings(
  targetPages: readonly WikiPageApiRecord[],
  relatedByPageId: ReadonlyMap<string, readonly Record<string, unknown>[]>,
): KnowledgeCheckFinding[] {
  return targetPages
    .filter((page) => (relatedByPageId.get(page.id)?.length ?? 0) === 0)
    .map((page) =>
      createFinding({
        type: "sparse_communities",
        severity: "low",
        page_id: page.id,
        message: "api.knowledge_check.finding.sparse_community",
        evidence: [
          {
            object_type: "graph_scope",
            page_id: page.id,
            relationship_count: relatedByPageId.get(page.id)?.length ?? 0,
          },
        ],
        suggested_action: {
          action: "inspect_graph_neighbors",
        },
      }),
    );
}

function createBridgePageFindings(
  targetPages: readonly WikiPageApiRecord[],
  relatedByPageId: ReadonlyMap<string, readonly Record<string, unknown>[]>,
): KnowledgeCheckFinding[] {
  return targetPages
    .filter((page) => {
      const relationTypes = new Set(
        (relatedByPageId.get(page.id) ?? [])
          .map((related) => related.relation_type)
          .filter((value): value is string => typeof value === "string"),
      );

      return relationTypes.size > 1;
    })
    .map((page) =>
      createFinding({
        type: "bridge_pages",
        severity: "low",
        page_id: page.id,
        message: "api.knowledge_check.finding.bridge_page",
        evidence: [
          {
            object_type: "graph_scope",
            page_id: page.id,
            relationship_types: [
              ...new Set(
                (relatedByPageId.get(page.id) ?? [])
                  .map((related) => related.relation_type)
                  .filter((value): value is string => typeof value === "string"),
              ),
            ],
          },
        ],
        suggested_action: {
          action: "inspect_bridge_page",
        },
      }),
    );
}

function createWeakEvidenceFindings(
  targetPages: readonly WikiPageApiRecord[],
): KnowledgeCheckFinding[] {
  return targetPages
    .filter((page) => page.source_document_ids.length > 0)
    .filter((page) => normalizeRecordArray(page.source_refs).length === 0)
    .map((page) =>
      createFinding({
        type: "weak_evidence",
        severity: "medium",
        page_id: page.id,
        message: "api.knowledge_check.finding.weak_evidence",
        evidence: [
          {
            object_type: "wiki_page",
            object_id: page.id,
            source_document_ids: [...page.source_document_ids],
            reason: "document_level_source_only",
          },
        ],
        suggested_action: {
          action: "add_locator_level_source_refs",
        },
      }),
    );
}

function createForkScopedFindings(
  knowledgeBase: KnowledgeBaseResponse,
  checks: readonly KnowledgeCheckType[],
  targetPages: readonly WikiPageApiRecord[],
): KnowledgeCheckFinding[] {
  if (knowledgeBase.knowledge_base_type !== "fork") {
    return [];
  }

  const findings: KnowledgeCheckFinding[] = [];

  if (checks.includes("missing_context") && knowledgeBase.sync_status !== "synced") {
    findings.push(
      createFinding({
        type: "missing_context",
        severity: knowledgeBase.sync_status === "failed" ? "high" : "medium",
        page_id: null,
        message: "api.knowledge_check.finding.fork_sync_attention_required",
        affected_object_ids: [
          knowledgeBase.id,
          ...(knowledgeBase.upstream_knowledge_base_id === null
            ? []
            : [knowledgeBase.upstream_knowledge_base_id]),
        ],
        evidence: [
          {
            object_type: "knowledge_base_fork",
            fork_id: knowledgeBase.id,
            upstream_knowledge_base_id: knowledgeBase.upstream_knowledge_base_id,
            upstream_synced_version_id: knowledgeBase.upstream_synced_version_id,
            sync_status: knowledgeBase.sync_status,
          },
        ],
        suggested_action: {
          action: "sync_fork_from_upstream",
        },
      }),
    );
  }

  if (checks.includes("weak_evidence")) {
    findings.push(
      ...targetPages
        .filter((page) => page.visibility_origin === "fork_owned")
        .filter((page) => normalizeRecordArray(page.source_refs).length === 0)
        .map((page) =>
          createFinding({
            type: "weak_evidence",
            severity: "medium",
            page_id: page.id,
            message: "api.knowledge_check.finding.fork_owned_evidence_uncertainty",
            affected_object_ids: [page.id],
            evidence: [
              {
                object_type: "wiki_page",
                object_id: page.id,
                visibility_origin: page.visibility_origin,
                reason: "fork_owned_page_without_locator_evidence",
              },
            ],
            suggested_action: {
              action: "attach_submission_evidence",
            },
          }),
        ),
    );
  }

  return findings;
}

function createMissingContextFindings(
  targetPages: readonly WikiPageApiRecord[],
  relatedByPageId: ReadonlyMap<string, readonly Record<string, unknown>[]>,
  incomingPageIds: ReadonlySet<string>,
): KnowledgeCheckFinding[] {
  return targetPages
    .filter((page) => page.markdown.trim().length < 80)
    .filter(
      (page) => (relatedByPageId.get(page.id)?.length ?? 0) === 0 && !incomingPageIds.has(page.id),
    )
    .map((page) =>
      createFinding({
        type: "missing_context",
        severity: "low",
        page_id: page.id,
        message: "api.knowledge_check.finding.missing_context",
        evidence: [
          {
            object_type: "wiki_page",
            object_id: page.id,
            markdown_length: page.markdown.trim().length,
            graph_degree: 0,
          },
        ],
        suggested_action: {
          action: "expand_context_or_link_related_pages",
        },
      }),
    );
}

interface CreateSemanticFindingsInput {
  chatProvider: ChatProvider;
  checks: readonly KnowledgeCheckType[];
  datasetConfigurationSnapshot: Record<string, unknown>;
  findings: KnowledgeCheckFinding[];
  pages: readonly WikiPageApiRecord[];
}

async function createSemanticFindings(
  input: CreateSemanticFindingsInput,
): Promise<KnowledgeCheckSemanticRun> {
  const semanticChecks = input.checks.filter((check) => semanticCheckTypes.has(check));

  if (semanticChecks.length === 0) {
    return {
      findings_count: 0,
      repair_attempts: 0,
      status: "skipped",
    };
  }

  const resolvedPrompt = resolveDatasetPromptTemplateFromSnapshot({
    purpose: "knowledge_check",
    datasetConfigurationSnapshot: input.datasetConfigurationSnapshot,
  });
  const prompt = resolvedPrompt.prompt;
  const model = resolveChatModel(input.chatProvider.profile, prompt.modelPurpose);
  const modelCallId = `llm_call_${randomUUID().replaceAll("-", "")}`;
  const baseMessages = createSemanticKnowledgeCheckMessages(
    input.pages,
    semanticChecks,
    resolvedPrompt,
  );

  try {
    const structuredResult = await completeStructuredJsonOutput({
      chatProvider: input.chatProvider,
      getValidationIssues: readSemanticOutputIssues,
      jsonSchema: semanticKnowledgeCheckStructuredOutputJsonSchema,
      maxRepairAttempts: semanticStructuredOutputRepairAttempts,
      messages: baseMessages,
      model,
      outputContract: semanticKnowledgeCheckOutputContract,
      outputShape: semanticKnowledgeCheckOutputShape,
      parse: (content) => parseSemanticKnowledgeCheckOutput(content, semanticChecks),
      temperature: 0,
    });
    const semanticFindings = structuredResult.output.findings.map(createFinding);

    input.findings.push(...semanticFindings);

    return createCompletedSemanticRun({
      findingsCount: semanticFindings.length,
      model,
      modelCallId,
      promptMetadata: resolvedPrompt,
      promptVersionId: prompt.id,
      providerName: input.chatProvider.profile.providerName,
      repairAttempts: structuredResult.repairAttempts,
      structuredOutputAttemptCount: structuredResult.attemptCount,
      structuredOutputFinalStatus: "succeeded",
      structuredOutputMode: structuredResult.structuredOutputMode,
      structuredOutputValidationIssues: structuredResult.validationIssues,
      ...(structuredResult.completion.usage === undefined
        ? {}
        : { usage: structuredResult.completion.usage }),
    });
  } catch (error) {
    const structuredOutputMetadata = readStructuredJsonOutputErrorMetadata(error);

    return createFailedSemanticRun({
      error,
      model,
      modelCallId,
      promptMetadata: resolvedPrompt,
      promptVersionId: prompt.id,
      providerName: input.chatProvider.profile.providerName,
      repairAttempts: structuredOutputMetadata?.repairAttempts ?? 0,
      structuredOutputAttemptCount: structuredOutputMetadata?.attemptCount ?? 1,
      structuredOutputFinalStatus: "failed",
      structuredOutputMode: structuredOutputMetadata?.structuredOutputMode ?? "strict_json_schema",
      structuredOutputValidationIssues: structuredOutputMetadata?.validationIssues ?? [],
    });
  }
}

function createSemanticKnowledgeCheckMessages(
  pages: readonly WikiPageApiRecord[],
  checks: readonly KnowledgeCheckType[],
  resolvedPrompt: ResolvedDatasetPromptTemplate,
) {
  return [
    {
      role: "system" as const,
      content: [
        resolvedPrompt.prompt.template,
        "Return strict JSON for advisory Wiki semantic checks. Do not create approvals or review workflow records.",
        semanticKnowledgeCheckOutputContract,
      ].join("\n\n"),
    },
    {
      role: "user" as const,
      content: JSON.stringify({
        checks,
        output_schema: {
          findings: [
            {
              affected_object_ids: ["page_id"],
              confidence: 0.85,
              evidence: [{ object_type: "wiki_page", object_id: "page_id", quote: "short quote" }],
              message: "api.knowledge_check.finding.semantic_consistency",
              page_id: "page_id",
              severity: "low | medium | high",
              source_refs: [{ document_id: "source_document_id", locator: "optional locator" }],
              suggested_action: { action: "inspect_semantic_finding" },
              type: "semantic_consistency",
            },
          ],
        },
        pages: pages.map((page) => ({
          id: page.id,
          title: page.title,
          type: page.type,
          markdown_excerpt: page.markdown.slice(0, 2_000),
          source_document_ids: page.source_document_ids,
          source_refs: normalizeRecordArray(page.source_refs),
        })),
      }),
    },
  ];
}

interface ParsedSemanticKnowledgeCheckOutput {
  findings: KnowledgeCheckFinding[];
}

function parseSemanticKnowledgeCheckOutput(
  content: string,
  requestedChecks: readonly KnowledgeCheckType[],
): ParsedSemanticKnowledgeCheckOutput {
  const value = parseJsonObject(content);
  const findingValues = readRecordArrayFromValue(value.findings);
  const issues: string[] = [];

  if (!Array.isArray(value.findings)) {
    issues.push("findings must be an array");
  }

  const findings = findingValues.map((finding, index) =>
    readSemanticFinding(finding, index, requestedChecks, issues),
  );

  if (issues.length > 0) {
    throw new StructuredSemanticOutputError(issues);
  }

  return { findings };
}

function readSemanticFinding(
  value: Record<string, unknown>,
  index: number,
  requestedChecks: readonly KnowledgeCheckType[],
  issues: string[],
): KnowledgeCheckFinding {
  const type = readKnowledgeCheckType(value.type);
  const severity = readSeverity(value.severity);
  const pageId = readNullableString(value.page_id);
  const confidence = clampConfidence(value.confidence);

  if (type === null) {
    issues.push(`findings[${index}].type must be a supported knowledge check type`);
  } else if (!requestedChecks.includes(type)) {
    issues.push(`findings[${index}].type was not requested`);
  }
  if (severity === null) {
    issues.push(`findings[${index}].severity must be low, medium, or high`);
  }

  return {
    affected_object_ids: readStringArray(value.affected_object_ids),
    evidence: normalizeRecordArray(value.evidence),
    finding_id: `finding_${randomUUID().replaceAll("-", "")}`,
    message: readOptionalFindingMessage(value.message) ?? defaultFindingMessage(type),
    page_id: pageId,
    severity: severity ?? "medium",
    source_refs: normalizeRecordArray(value.source_refs),
    suggested_action: normalizeRecord(value.suggested_action),
    type: type ?? "semantic_consistency",
    ...(confidence === undefined ? {} : { confidence }),
  };
}

interface CompletedSemanticRunInput {
  findingsCount: number;
  model: string;
  modelCallId: string;
  promptMetadata: ResolvedDatasetPromptTemplate;
  promptVersionId: string;
  providerName: string;
  repairAttempts: number;
  structuredOutputAttemptCount: number;
  structuredOutputFinalStatus: "succeeded";
  structuredOutputMode: StructuredOutputMode;
  structuredOutputValidationIssues: readonly string[];
  usage?: ModelCallUsage;
}

function createCompletedSemanticRun(input: CompletedSemanticRunInput): KnowledgeCheckSemanticRun {
  return {
    findings_count: input.findingsCount,
    model: input.model,
    model_call_id: input.modelCallId,
    output_status: "succeeded",
    prompt_version_id: input.promptVersionId,
    provider_name: input.providerName,
    repair_attempts: input.repairAttempts,
    structured_output_attempt_count: input.structuredOutputAttemptCount,
    structured_output_final_status: input.structuredOutputFinalStatus,
    structured_output_mode: input.structuredOutputMode,
    structured_output_validation_issues: [...input.structuredOutputValidationIssues],
    status: "completed",
    trace: {
      prompt_template: input.promptMetadata.metadata,
      structured_output: "valid",
    },
    ...(input.usage === undefined ? {} : { usage: { ...input.usage } }),
  };
}

interface FailedSemanticRunInput {
  error: unknown;
  model: string;
  modelCallId: string;
  promptMetadata: ResolvedDatasetPromptTemplate;
  promptVersionId: string;
  providerName: string;
  repairAttempts: number;
  structuredOutputAttemptCount: number;
  structuredOutputFinalStatus: "failed";
  structuredOutputMode: StructuredOutputMode;
  structuredOutputValidationIssues: readonly string[];
}

function createFailedSemanticRun(input: FailedSemanticRunInput): KnowledgeCheckSemanticRun {
  return {
    failure_reason: summarizeError(input.error),
    findings_count: 0,
    model: input.model,
    model_call_id: input.modelCallId,
    output_status: "failed",
    prompt_version_id: input.promptVersionId,
    provider_name: input.providerName,
    repair_attempts: input.repairAttempts,
    structured_output_attempt_count: input.structuredOutputAttemptCount,
    structured_output_final_status: input.structuredOutputFinalStatus,
    structured_output_mode: input.structuredOutputMode,
    structured_output_validation_issues: [...input.structuredOutputValidationIssues],
    status: "failed",
    trace: {
      prompt_template: input.promptMetadata.metadata,
      structured_output: "invalid_or_unavailable",
    },
  };
}

class StructuredSemanticOutputError extends Error {
  readonly issues: string[];

  constructor(issues: readonly string[]) {
    super(`Structured semantic output validation failed: ${issues.join("; ")}`);
    this.name = "StructuredSemanticOutputError";
    this.issues = [...issues];
  }
}

function isStructuredSemanticOutputError(error: unknown): error is StructuredSemanticOutputError {
  return error instanceof StructuredSemanticOutputError;
}

function readSemanticOutputIssues(error: unknown): readonly string[] | null {
  return isStructuredSemanticOutputError(error) ? error.issues : null;
}

function parseJsonObject(content: string): Record<string, unknown> {
  for (const candidate of extractJsonCandidates(content)) {
    try {
      const parsed = JSON.parse(candidate) as unknown;

      if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      continue;
    }
  }

  throw new StructuredSemanticOutputError(["output must be a JSON object"]);
}

function extractJsonCandidates(content: string): string[] {
  const trimmed = content.trim();
  const fenced = [...trimmed.matchAll(/```(?:json)?\s*([\s\S]*?)```/giu)]
    .map((match) => match[1]?.trim() ?? "")
    .filter(Boolean);

  return fenced.length > 0 ? fenced : [trimmed];
}

function readRecordArrayFromValue(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is Record<string, unknown> =>
          typeof item === "object" && item !== null && !Array.isArray(item),
      )
    : [];
}

function readKnowledgeCheckType(value: unknown): KnowledgeCheckType | null {
  return typeof value === "string" && knowledgeCheckTypes.includes(value as KnowledgeCheckType)
    ? (value as KnowledgeCheckType)
    : null;
}

function readSeverity(value: unknown): "low" | "medium" | "high" | null {
  return value === "low" || value === "medium" || value === "high" ? value : null;
}

function readNullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function clampConfidence(value: unknown): number | undefined {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return undefined;
  }

  return Math.max(0, Math.min(1, Number(value.toFixed(4))));
}

function readOptionalFindingMessage(value: unknown): string | undefined {
  return typeof value === "string" && value.startsWith("api.knowledge_check.finding.")
    ? value
    : undefined;
}

function defaultFindingMessage(type: KnowledgeCheckType | null): string {
  if (type === "weak_evidence") {
    return "api.knowledge_check.finding.weak_evidence";
  }
  if (type === "missing_context") {
    return "api.knowledge_check.finding.missing_context";
  }

  return "api.knowledge_check.finding.semantic_consistency";
}

function summarizeError(error: unknown): string {
  if (error instanceof StructuredSemanticOutputError) {
    return error.issues.join("; ");
  }

  return error instanceof Error ? error.message : "Semantic check failed.";
}

async function listRelatedPages(
  wikiStore: WikiStore,
  pages: readonly WikiPageApiRecord[],
): Promise<Map<string, Record<string, unknown>[]>> {
  if (wikiStore.listRelatedPagesByPageIds !== undefined) {
    const relatedByPageId = new Map<string, Record<string, unknown>[]>();

    for (let index = 0; index < pages.length; index += knowledgeCheckPageSize) {
      const batch = pages.slice(index, index + knowledgeCheckPageSize);
      const batchRelated = await wikiStore.listRelatedPagesByPageIds(batch.map((page) => page.id));

      for (const page of batch) {
        relatedByPageId.set(page.id, batchRelated.get(page.id) ?? []);
      }
    }

    return relatedByPageId;
  }

  const entries = await mapWithConcurrency(
    pages,
    knowledgeCheckRelatedPageConcurrency,
    async (page) => [page.id, await wikiStore.listRelatedPages(page.id)] as const,
  );

  return new Map(entries);
}

async function listKnowledgeCheckPages(
  wikiStore: WikiStore,
  knowledgeBaseId: string,
  scope: {
    pageIds: readonly string[];
    sourceDocumentIds: readonly string[];
  },
): Promise<WikiPageApiRecord[]> {
  if (wikiStore.listKnowledgeCheckPages !== undefined) {
    const pages: WikiPageApiRecord[] = [];

    for (let page = 1; ; page += 1) {
      const result = await wikiStore.listKnowledgeCheckPages(knowledgeBaseId, {
        page,
        pageIds: scope.pageIds,
        pageSize: knowledgeCheckPageSize,
        sourceDocumentIds: scope.sourceDocumentIds,
      });

      pages.push(...result.items);

      if (!result.hasMore) {
        break;
      }
    }

    return pages;
  }

  if (typeof wikiStore.listPagesPaginated !== "function") {
    const pages = await wikiStore.listPages(knowledgeBaseId);

    return filterKnowledgeCheckPages(pages, scope);
  }

  const pages: WikiPageApiRecord[] = [];

  for (let page = 1; ; page += 1) {
    const result = await wikiStore.listPagesPaginated(knowledgeBaseId, {
      page,
      pageSize: knowledgeCheckPageSize,
    });

    pages.push(...result.items);

    if (!result.hasMore) {
      break;
    }
  }

  if (pages.length > 0) {
    return filterKnowledgeCheckPages(pages, scope);
  }

  return filterKnowledgeCheckPages(await wikiStore.listPages(knowledgeBaseId), scope);
}

async function listKnowledgeCheckPageKeyIndex(
  wikiStore: WikiStore,
  knowledgeBaseId: string,
  fallbackPages: readonly WikiPageApiRecord[],
): Promise<ReadonlySet<string>> {
  if (wikiStore.listKnowledgeCheckPageKeys !== undefined) {
    return wikiStore.listKnowledgeCheckPageKeys(knowledgeBaseId);
  }

  return createPageIndex(fallbackPages);
}

function filterKnowledgeCheckPages(
  pages: readonly WikiPageApiRecord[],
  scope: {
    pageIds: readonly string[];
    sourceDocumentIds: readonly string[];
  },
): WikiPageApiRecord[] {
  const targetPages =
    scope.pageIds.length === 0 ? pages : pages.filter((page) => scope.pageIds.includes(page.id));

  return scope.sourceDocumentIds.length === 0
    ? [...targetPages]
    : targetPages.filter((page) =>
        page.source_document_ids.some((documentId) => scope.sourceDocumentIds.includes(documentId)),
      );
}

async function mapWithConcurrency<TInput, TOutput>(
  items: readonly TInput[],
  concurrency: number,
  mapper: (item: TInput) => Promise<TOutput>,
): Promise<TOutput[]> {
  const output: TOutput[] = [];
  let nextIndex = 0;

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (nextIndex < items.length) {
        const index = nextIndex;
        nextIndex += 1;
        const item = items[index];

        if (item !== undefined) {
          output[index] = await mapper(item);
        }
      }
    }),
  );

  return output;
}

function createIncomingPageIds(
  relatedByPageId: ReadonlyMap<string, readonly Record<string, unknown>[]>,
): Set<string> {
  const incomingPageIds = new Set<string>();

  for (const relatedPages of relatedByPageId.values()) {
    for (const relatedPage of relatedPages) {
      if (typeof relatedPage.page_id === "string") {
        incomingPageIds.add(relatedPage.page_id);
      }
    }
  }

  return incomingPageIds;
}

function createPageIndex(pages: readonly WikiPageApiRecord[]): Set<string> {
  const keys = new Set<string>();

  for (const page of pages) {
    keys.add(normalizePageKey(page.id));
    keys.add(normalizePageKey(page.slug));
    keys.add(normalizePageKey(page.title));
  }

  return keys;
}

function extractWikilinks(markdown: string): string[] {
  return [...markdown.matchAll(/\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]/gu)]
    .map((match) => match[1]?.trim() ?? "")
    .filter(Boolean);
}

function normalizePageKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/gu, "-");
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function needsGraphData(checks: readonly KnowledgeCheckType[]): boolean {
  return (
    checks.includes("sparse_communities") ||
    checks.includes("bridge_pages") ||
    checks.includes("missing_context")
  );
}

function createFinding(input: KnowledgeCheckFinding): KnowledgeCheckFinding {
  return {
    ...input,
    affected_object_ids:
      input.affected_object_ids ?? (input.page_id === null ? [] : [input.page_id]),
    evidence: input.evidence ?? [toFindingEvidence(input)],
    source_refs: input.source_refs ?? [],
    suggested_action: input.suggested_action ?? { action: "inspect_finding" },
  };
}

function toFindingEvidence(finding: KnowledgeCheckFinding): Record<string, unknown> {
  return { ...finding };
}

function toKnowledgeCheckResponse(record: KnowledgeCheckRecord): KnowledgeCheckResponse {
  return {
    check_id: record.id,
    knowledge_base_id: record.knowledgeBaseId,
    status: record.status,
    progress: record.progress,
    checks: [...record.checks],
    page_ids: [...record.pageIds],
    findings: record.findings.map((finding) => ({
      ...finding,
      affected_object_ids: [...(finding.affected_object_ids ?? [])],
      evidence: JSON.parse(JSON.stringify(finding.evidence ?? [])) as Record<string, unknown>[],
      source_refs: JSON.parse(JSON.stringify(finding.source_refs ?? [])) as Record<
        string,
        unknown
      >[],
      suggested_action: JSON.parse(JSON.stringify(finding.suggested_action ?? {})) as Record<
        string,
        unknown
      >,
    })),
    semantic_run: JSON.parse(JSON.stringify(record.semanticRun)) as KnowledgeCheckSemanticRun,
    configuration_snapshot: JSON.parse(JSON.stringify(record.configurationSnapshot)) as Record<
      string,
      unknown
    >,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
  };
}
