import { randomUUID } from "node:crypto";
import { createResourceId } from "@fococontext/contracts";

export const wikiPageTypes = [
  "source",
  "entity",
  "concept",
  "synthesis",
  "comparison",
  "query",
  "system",
] as const;

export const systemPageKeys = ["index", "overview", "log", "purpose", "schema"] as const;

export type WikiPageType = (typeof wikiPageTypes)[number];
export type SystemPageKey = (typeof systemPageKeys)[number];
export type WikiPageIdScope = "wikiPage" | "pageVersion";

export const wikiRelationTypes = [
  "wikilink",
  "shared_source",
  "common_neighbor",
  "type_affinity",
  "generated_relationship",
  "evidence_relationship",
  "manual",
] as const;

export type WikiRelationType = (typeof wikiRelationTypes)[number];
export type WikiRelationshipIdScope = "graphEdge";

export const changeSetStatuses = ["pending", "applied", "discarded", "canceled"] as const;
export const changeSetTriggers = [
  "ingest",
  "manual_edit",
  "knowledge_check",
  "rollback",
  "source_delete",
  "page_merge",
  "dedup",
] as const;
export const changeSetItemObjectTypes = [
  "wiki_page",
  "system_page",
  "relationship_edge",
  "source_document",
  "knowledge_version",
] as const;
export const changeSetItemOperations = ["create", "update", "delete", "archive", "merge"] as const;

export type ChangeSetStatus = (typeof changeSetStatuses)[number];
export type ChangeSetTrigger = (typeof changeSetTriggers)[number];
export type ChangeSetItemObjectType = (typeof changeSetItemObjectTypes)[number];
export type ChangeSetItemOperation = (typeof changeSetItemOperations)[number];
export type ChangeSetIdScope = "changeSet";
export type ChangeSetDiffPayload = Record<string, unknown>;
export type KnowledgeVersionIdScope = "knowledgeVersion";
export type RollbackIdScope = "rollback";
export type PageMergeIdScope = "pageMerge";
export type DedupIdScope = "duplicateCandidate" | "duplicateDecision";

export interface WikiPageSourceRef {
  document_id: string;
  locator: string;
}

export interface WikiPageWikilink {
  target_title: string;
  target_page_id: string;
}

export type WikiPageFrontmatter = Record<string, unknown> & {
  sources?: string[];
  related?: string[];
  type?: string;
};

export interface WikiPageCurrentState {
  id: string;
  knowledge_base_id: string;
  title: string;
  type: WikiPageType;
  system_page_key?: SystemPageKey;
  current_version_id: string;
  markdown: string;
  frontmatter: WikiPageFrontmatter;
  sources: WikiPageSourceRef[];
  related: string[];
  wikilinks: WikiPageWikilink[];
  created_at: string;
  updated_at: string;
}

export interface WikiPageVersionSnapshot {
  id: string;
  page_id: string;
  knowledge_base_id: string;
  knowledge_version_id: string;
  change_set_id: string;
  title: string;
  type: WikiPageType;
  system_page_key?: SystemPageKey;
  markdown: string;
  frontmatter: WikiPageFrontmatter;
  sources: WikiPageSourceRef[];
  related: string[];
  wikilinks: WikiPageWikilink[];
  summary: string;
  created_at: string;
  created_by: string;
}

export interface CreateWikiPageInput {
  knowledge_base_id: string;
  knowledge_version_id: string;
  change_set_id: string;
  title: string;
  type: WikiPageType;
  system_page_key?: SystemPageKey;
  markdown: string;
  frontmatter: WikiPageFrontmatter;
  sources: readonly WikiPageSourceRef[];
  related: readonly string[];
  wikilinks: readonly WikiPageWikilink[];
  summary: string;
  created_by: string;
}

export interface UpdateWikiPageInput {
  page_id: string;
  knowledge_version_id: string;
  change_set_id: string;
  title: string;
  markdown: string;
  frontmatter: WikiPageFrontmatter;
  sources: readonly WikiPageSourceRef[];
  related: readonly string[];
  wikilinks: readonly WikiPageWikilink[];
  summary: string;
  created_by: string;
}

export interface CreateSystemPageInput {
  knowledge_base_id: string;
  knowledge_version_id: string;
  change_set_id: string;
  system_page_key: SystemPageKey;
  title: string;
  markdown: string;
  frontmatter: WikiPageFrontmatter;
  summary: string;
  created_by: string;
}

export interface WikiPagePersistenceResult {
  page: WikiPageCurrentState;
  version: WikiPageVersionSnapshot;
}

export interface WikiPageRepository {
  savePage(page: WikiPageCurrentState): void;
  savePageVersion(version: WikiPageVersionSnapshot): void;
  findPageById(pageId: string): WikiPageCurrentState | undefined;
  findSystemPageByKey(
    knowledgeBaseId: string,
    systemPageKey: SystemPageKey,
  ): WikiPageCurrentState | undefined;
  findPageVersionById(pageVersionId: string): WikiPageVersionSnapshot | undefined;
  listPageVersions(pageId: string): WikiPageVersionSnapshot[];
}

export interface WikiPagePersistenceServiceOptions {
  idFactory?: (scope: WikiPageIdScope) => string;
  now?: () => string;
}

export interface WikiRelationshipSourceEvidence {
  document_id: string;
  locator: string;
  note?: string;
}

export interface WikiRelationshipEdgeSourceRecord extends WikiRelationshipSourceEvidence {
  edge_id: string;
}

export interface WikiRelationshipEdgeRecord {
  id: string;
  knowledge_base_id: string;
  from_page_id: string;
  to_page_id: string;
  relation_type: WikiRelationType;
  weight: number;
  explanation: string;
  source_document_ids: string[];
  created_by_change_set_id: string;
  knowledge_version_id: string;
  created_at: string;
}

export interface CreateWikiRelationshipEdgeInput {
  knowledge_base_id: string;
  from_page_id: string;
  to_page_id: string;
  relation_type: WikiRelationType;
  weight: number;
  explanation: string;
  source_evidence: readonly WikiRelationshipSourceEvidence[];
  created_by_change_set_id: string;
  knowledge_version_id: string;
}

export interface WikiRelationshipRepository {
  saveEdge(edge: WikiRelationshipEdgeRecord): void;
  saveEdgeSources(edgeId: string, sources: readonly WikiRelationshipEdgeSourceRecord[]): void;
  findEdgeById(edgeId: string): WikiRelationshipEdgeRecord | undefined;
  listEdgesForPage(pageId: string): WikiRelationshipEdgeRecord[];
  listEdgeSources(edgeId: string): WikiRelationshipEdgeSourceRecord[];
}

export interface WikiRelationshipPersistenceServiceOptions {
  idFactory?: (scope: WikiRelationshipIdScope) => string;
  now?: () => string;
}

export interface ChangeSetRecord {
  id: string;
  knowledge_base_id: string;
  base_knowledge_version_id: string;
  target_knowledge_version_id: string | null;
  status: ChangeSetStatus;
  trigger: ChangeSetTrigger;
  title: string;
  summary: string;
  created_by: string;
  created_at: string;
  applied_by?: string;
  applied_at?: string;
  discarded_by?: string;
  discarded_at?: string;
  discard_reason?: string;
}

export interface ChangeSetItemInput {
  object_type: ChangeSetItemObjectType;
  object_id: string;
  operation: ChangeSetItemOperation;
  diff: ChangeSetDiffPayload;
}

export interface ChangeSetItemRecord extends ChangeSetItemInput {
  id: string;
  change_set_id: string;
}

export interface CreateChangeSetInput {
  knowledge_base_id: string;
  base_knowledge_version_id: string;
  trigger: ChangeSetTrigger;
  title: string;
  summary: string;
  created_by: string;
  items: readonly ChangeSetItemInput[];
}

export interface ApplyChangeSetInput {
  target_knowledge_version_id: string;
  applied_by: string;
}

export interface DiscardChangeSetInput {
  discarded_by: string;
  reason: string;
}

export interface ChangeSetRepository {
  saveChangeSet(changeSet: ChangeSetRecord): void;
  saveChangeSetItems(changeSetId: string, items: readonly ChangeSetItemRecord[]): void;
  findChangeSetById(changeSetId: string): ChangeSetRecord | undefined;
  listChangeSetItems(changeSetId: string): ChangeSetItemRecord[];
}

export interface ChangeSetApplyLock {
  runWithKnowledgeBaseApplyLock<TResult>(
    knowledgeBaseId: string,
    operation: () => TResult,
  ): TResult;
}

export interface ChangeSetPersistenceServiceOptions {
  idFactory?: (scope: ChangeSetIdScope) => string;
  now?: () => string;
  applyLock?: ChangeSetApplyLock;
}

export interface KnowledgeVersionRecord {
  id: string;
  knowledge_base_id: string;
  previous_knowledge_version_id: string;
  change_set_id: string;
  page_version_ids: string[];
  created_at: string;
  created_by: string;
}

export type KnowledgeVersionPageChange =
  | {
      action: "create";
      title: string;
      type: WikiPageType;
      markdown: string;
      frontmatter: WikiPageFrontmatter;
      sources: readonly WikiPageSourceRef[];
      related: readonly string[];
      wikilinks: readonly WikiPageWikilink[];
      summary: string;
    }
  | {
      action: "update";
      page_id: string;
      title: string;
      markdown: string;
      frontmatter: WikiPageFrontmatter;
      sources: readonly WikiPageSourceRef[];
      related: readonly string[];
      wikilinks: readonly WikiPageWikilink[];
      summary: string;
    };

export interface ApplyKnowledgeVersionChangeSetInput {
  change_set_id: string;
  applied_by: string;
  page_changes: readonly KnowledgeVersionPageChange[];
}

export interface KnowledgeVersionApplicationResult {
  knowledgeVersion: KnowledgeVersionRecord;
  pageVersions: WikiPageVersionSnapshot[];
  changeSet: ChangeSetRecord;
}

export interface KnowledgeVersionRepository {
  saveKnowledgeVersion(knowledgeVersion: KnowledgeVersionRecord): void;
  findKnowledgeVersionById(knowledgeVersionId: string): KnowledgeVersionRecord | undefined;
}

export interface KnowledgeVersionApplicationServiceOptions {
  idFactory?: (scope: KnowledgeVersionIdScope) => string;
  now?: () => string;
}

export type RollbackScope = "knowledge_base" | "page";

export interface RollbackRecord {
  id: string;
  scope: RollbackScope;
  knowledge_base_id: string;
  page_id?: string;
  source_knowledge_version_id: string;
  target_knowledge_version_id?: string;
  source_page_version_id?: string;
  target_page_version_id?: string;
  created_change_set_id: string;
  created_knowledge_version_id: string;
  reason: string | null;
  requested_by: string;
  created_at: string;
}

export interface RollbackKnowledgeBaseInput {
  knowledge_base_id: string;
  current_knowledge_version_id: string;
  target_knowledge_version_id: string;
  reason?: string;
  requested_by: string;
}

export interface RollbackPageInput {
  page_id: string;
  current_knowledge_version_id: string;
  target_page_version_id: string;
  reason?: string;
  requested_by: string;
}

export interface RollbackResult {
  rollbackRecord: RollbackRecord;
  changeSet: ChangeSetRecord;
  knowledgeVersion: KnowledgeVersionRecord;
  pageVersions: WikiPageVersionSnapshot[];
  indexUpdateJob: IndexUpdateJob;
}

export type PageUpdateApplyMode = "apply_now";

export interface PageUpdateInput {
  page_id: string;
  current_knowledge_version_id: string;
  title: string;
  markdown: string;
  frontmatter: WikiPageFrontmatter;
  sources: readonly WikiPageSourceRef[];
  related: readonly string[];
  wikilinks: readonly WikiPageWikilink[];
  apply_mode: PageUpdateApplyMode;
  requested_by: string;
  summary: string;
}

export interface PageUpdateResult {
  mode: PageUpdateApplyMode;
  changeSet: ChangeSetRecord;
  knowledgeVersion: KnowledgeVersionRecord | null;
  pageVersions: WikiPageVersionSnapshot[];
  indexUpdateJob: IndexUpdateJob | null;
}

export interface ParsedContentIngestInput {
  knowledge_base_id: string;
  current_knowledge_version_id: string;
  parsed_content_id: string;
  document_id: string;
  title: string;
  markdown: string;
  source_locator: string;
  requested_by: string;
  summary: string;
}

export interface ParsedContentIngestResult {
  changeSet: ChangeSetRecord;
  knowledgeVersion: KnowledgeVersionRecord;
  pageVersions: WikiPageVersionSnapshot[];
  indexUpdateJob: IndexUpdateJob;
}

export interface SourceDeleteInput {
  knowledge_base_id: string;
  current_knowledge_version_id: string;
  document_id: string;
  affected_page_ids: readonly string[];
  requested_by: string;
  summary: string;
}

export interface SourceDeleteResult {
  changeSet: ChangeSetRecord;
  knowledgeVersion: KnowledgeVersionRecord;
  pageVersions: WikiPageVersionSnapshot[];
  indexUpdateJob: IndexUpdateJob;
  affected_edge_ids: string[];
  updated_system_page_keys: SystemPageKey[];
}

export interface PageMergeRecord {
  id: string;
  knowledge_base_id: string;
  page_id: string;
  wiki_draft_id: string;
  change_set_id: string;
  previous_page_version_id: string;
  created_page_version_id: string;
  merge_summary: string;
  preserved_fields: string[];
  requested_by: string;
  created_at: string;
}

export interface PageMergeInput {
  page_id: string;
  wiki_draft_id: string;
  current_knowledge_version_id: string;
  title: string;
  type: WikiPageType;
  markdown: string;
  frontmatter: WikiPageFrontmatter;
  sources: readonly WikiPageSourceRef[];
  related: readonly string[];
  wikilinks: readonly WikiPageWikilink[];
  merged_markdown: string;
  requested_by: string;
  summary: string;
}

export interface PageMergeResult {
  pageMergeRecord: PageMergeRecord;
  changeSet: ChangeSetRecord;
  knowledgeVersion: KnowledgeVersionRecord;
  pageVersions: WikiPageVersionSnapshot[];
}

export interface PageMergeRepository {
  savePageMergeRecord(record: PageMergeRecord): void;
  findPageMergeRecordById(pageMergeRecordId: string): PageMergeRecord | undefined;
}

export interface PageMergeServiceOptions {
  idFactory?: (scope: PageMergeIdScope) => string;
  now?: () => string;
}

export type DuplicateCandidateStatus = "pending" | "not_duplicate" | "merged";

export interface DuplicateCandidatePageInput {
  page_id: string;
  title: string;
  type: WikiPageType;
  aliases: readonly string[];
  source_document_ids: readonly string[];
}

export interface DuplicateCandidateEvidence {
  kind: "alias_overlap" | "title_match";
  value: string;
}

export interface DuplicateCandidateRecord {
  id: string;
  knowledge_base_id: string;
  left_page_id: string;
  right_page_id: string;
  status: DuplicateCandidateStatus;
  confidence: number;
  reason: string;
  evidence: readonly DuplicateCandidateEvidence[];
  created_at: string;
  decision_id?: string;
}

export interface DuplicateDecisionRecord {
  id: string;
  candidate_id: string;
  decision: "not_duplicate";
  decided_by: string;
  reason: string;
  created_at: string;
}

export interface DetectDuplicateCandidatesInput {
  knowledge_base_id: string;
  pages: readonly DuplicateCandidatePageInput[];
}

export interface DetectDuplicateCandidatesResult {
  candidates: DuplicateCandidateRecord[];
  skipped_decision_ids: string[];
}

export interface RecordNotDuplicateDecisionInput {
  candidate_id: string;
  decided_by: string;
  reason: string;
}

export interface DedupRepository {
  saveDuplicateCandidate(record: DuplicateCandidateRecord): void;
  findDuplicateCandidateById(candidateId: string): DuplicateCandidateRecord | undefined;
  findDuplicateCandidateByPagePair(
    knowledgeBaseId: string,
    leftPageId: string,
    rightPageId: string,
  ): DuplicateCandidateRecord | undefined;
  saveDuplicateDecision(record: DuplicateDecisionRecord): void;
  findDuplicateDecisionById(decisionId: string): DuplicateDecisionRecord | undefined;
}

export interface DedupServiceOptions {
  idFactory?: (scope: DedupIdScope) => string;
  now?: () => string;
}

export interface RollbackRepository {
  saveRollbackRecord(record: RollbackRecord): void;
  findRollbackRecordById(rollbackRecordId: string): RollbackRecord | undefined;
}

export interface RollbackServiceOptions {
  idFactory?: (scope: RollbackIdScope) => string;
  now?: () => string;
}

export interface IndexUpdateJob {
  job_id: string;
  knowledge_base_id: string;
  knowledge_version_id: string;
  change_set_id: string;
  reason: "rollback" | "change_set_apply";
}

export interface IndexUpdateQueue {
  enqueueIndexUpdate(input: Omit<IndexUpdateJob, "job_id">): IndexUpdateJob;
}

export class WikiPagePersistenceService {
  private readonly repository: WikiPageRepository;
  private readonly idFactory: (scope: WikiPageIdScope) => string;
  private readonly now: () => string;

  constructor(repository: WikiPageRepository, options: WikiPagePersistenceServiceOptions = {}) {
    this.repository = repository;
    this.idFactory = options.idFactory ?? createWikiPageResourceId;
    this.now = options.now ?? createTimestamp;
  }

  createPage(input: CreateWikiPageInput): WikiPagePersistenceResult {
    const pageId = this.idFactory("wikiPage");
    const versionId = this.idFactory("pageVersion");
    const createdAt = this.now();
    const page: WikiPageCurrentState = {
      id: pageId,
      knowledge_base_id: input.knowledge_base_id,
      title: input.title,
      type: input.type,
      ...(input.system_page_key === undefined ? {} : { system_page_key: input.system_page_key }),
      current_version_id: versionId,
      markdown: input.markdown,
      frontmatter: cloneFrontmatter(input.frontmatter),
      sources: cloneSources(input.sources),
      related: [...input.related],
      wikilinks: cloneWikilinks(input.wikilinks),
      created_at: createdAt,
      updated_at: createdAt,
    };
    const version = createVersionSnapshot({
      id: versionId,
      page,
      knowledgeVersionId: input.knowledge_version_id,
      changeSetId: input.change_set_id,
      summary: input.summary,
      createdAt,
      createdBy: input.created_by,
    });

    this.repository.savePage(page);
    this.repository.savePageVersion(version);

    return {
      page: clonePage(page),
      version: clonePageVersion(version),
    };
  }

  createSystemPage(input: CreateSystemPageInput): WikiPagePersistenceResult {
    return this.createPage({
      knowledge_base_id: input.knowledge_base_id,
      knowledge_version_id: input.knowledge_version_id,
      change_set_id: input.change_set_id,
      title: input.title,
      type: "system",
      system_page_key: input.system_page_key,
      markdown: input.markdown,
      frontmatter: input.frontmatter,
      sources: [],
      related: [],
      wikilinks: [],
      summary: input.summary,
      created_by: input.created_by,
    });
  }

  updatePage(input: UpdateWikiPageInput): WikiPagePersistenceResult {
    const current = this.repository.findPageById(input.page_id);

    if (current === undefined) {
      throw new Error(`Wiki Page not found: ${input.page_id}`);
    }

    const versionId = this.idFactory("pageVersion");
    const updatedAt = this.now();
    const page: WikiPageCurrentState = {
      id: current.id,
      knowledge_base_id: current.knowledge_base_id,
      title: input.title,
      type: current.type,
      ...(current.system_page_key === undefined
        ? {}
        : { system_page_key: current.system_page_key }),
      current_version_id: versionId,
      markdown: input.markdown,
      frontmatter: cloneFrontmatter(input.frontmatter),
      sources: cloneSources(input.sources),
      related: [...input.related],
      wikilinks: cloneWikilinks(input.wikilinks),
      created_at: current.created_at,
      updated_at: updatedAt,
    };
    const version = createVersionSnapshot({
      id: versionId,
      page,
      knowledgeVersionId: input.knowledge_version_id,
      changeSetId: input.change_set_id,
      summary: input.summary,
      createdAt: updatedAt,
      createdBy: input.created_by,
    });

    this.repository.savePage(page);
    this.repository.savePageVersion(version);

    return {
      page: clonePage(page),
      version: clonePageVersion(version),
    };
  }

  getCurrentPage(pageId: string): WikiPageCurrentState | undefined {
    return this.repository.findPageById(pageId);
  }

  getSystemPage(
    knowledgeBaseId: string,
    systemPageKey: SystemPageKey,
  ): WikiPageCurrentState | undefined {
    return this.repository.findSystemPageByKey(knowledgeBaseId, systemPageKey);
  }

  getPageVersion(pageVersionId: string): WikiPageVersionSnapshot | undefined {
    return this.repository.findPageVersionById(pageVersionId);
  }

  listPageVersions(pageId: string): WikiPageVersionSnapshot[] {
    return this.repository.listPageVersions(pageId);
  }
}

export function createInMemoryWikiPageRepository(): WikiPageRepository {
  return new InMemoryWikiPageRepository();
}

export class WikiRelationshipPersistenceService {
  private readonly repository: WikiRelationshipRepository;
  private readonly idFactory: (scope: WikiRelationshipIdScope) => string;
  private readonly now: () => string;

  constructor(
    repository: WikiRelationshipRepository,
    options: WikiRelationshipPersistenceServiceOptions = {},
  ) {
    this.repository = repository;
    this.idFactory = options.idFactory ?? createWikiRelationshipResourceId;
    this.now = options.now ?? createTimestamp;
  }

  createEdge(input: CreateWikiRelationshipEdgeInput): WikiRelationshipEdgeRecord {
    const edgeId = this.idFactory("graphEdge");
    const edge: WikiRelationshipEdgeRecord = {
      id: edgeId,
      knowledge_base_id: input.knowledge_base_id,
      from_page_id: input.from_page_id,
      to_page_id: input.to_page_id,
      relation_type: input.relation_type,
      weight: input.weight,
      explanation: input.explanation,
      source_document_ids: getUniqueSourceDocumentIds(input.source_evidence),
      created_by_change_set_id: input.created_by_change_set_id,
      knowledge_version_id: input.knowledge_version_id,
      created_at: this.now(),
    };
    const sources = input.source_evidence.map((source) => createEdgeSource(edgeId, source));

    this.repository.saveEdge(edge);
    this.repository.saveEdgeSources(edgeId, sources);

    return cloneEdge(edge);
  }

  getEdge(edgeId: string): WikiRelationshipEdgeRecord | undefined {
    return this.repository.findEdgeById(edgeId);
  }

  listEdgesForPage(pageId: string): WikiRelationshipEdgeRecord[] {
    return this.repository.listEdgesForPage(pageId);
  }

  listEdgeSources(edgeId: string): WikiRelationshipEdgeSourceRecord[] {
    return this.repository.listEdgeSources(edgeId);
  }
}

export function createInMemoryWikiRelationshipRepository(): WikiRelationshipRepository {
  return new InMemoryWikiRelationshipRepository();
}

export class ChangeSetPersistenceService {
  private readonly repository: ChangeSetRepository;
  private readonly idFactory: (scope: ChangeSetIdScope) => string;
  private readonly now: () => string;
  private readonly applyLock: ChangeSetApplyLock;

  constructor(repository: ChangeSetRepository, options: ChangeSetPersistenceServiceOptions = {}) {
    this.repository = repository;
    this.idFactory = options.idFactory ?? createChangeSetResourceId;
    this.now = options.now ?? createTimestamp;
    this.applyLock = options.applyLock ?? createInMemoryChangeSetApplyLock();
  }

  createChangeSet(input: CreateChangeSetInput): ChangeSetRecord {
    const changeSetId = this.idFactory("changeSet");
    const changeSet: ChangeSetRecord = {
      id: changeSetId,
      knowledge_base_id: input.knowledge_base_id,
      base_knowledge_version_id: input.base_knowledge_version_id,
      target_knowledge_version_id: null,
      status: "pending",
      trigger: input.trigger,
      title: input.title,
      summary: input.summary,
      created_by: input.created_by,
      created_at: this.now(),
    };
    const items = input.items.map((item, index) =>
      createChangeSetItem(changeSetId, index + 1, item),
    );

    this.repository.saveChangeSet(changeSet);
    this.repository.saveChangeSetItems(changeSetId, items);

    return cloneChangeSet(changeSet);
  }

  applyChangeSet(changeSetId: string, input: ApplyChangeSetInput): ChangeSetRecord {
    const current = this.requireChangeSet(changeSetId);

    return this.applyLock.runWithKnowledgeBaseApplyLock(current.knowledge_base_id, () => {
      const lockedCurrent = this.requireChangeSet(changeSetId);

      if (lockedCurrent.status !== "pending") {
        throw new Error(`Cannot apply Change Set from status ${lockedCurrent.status}.`);
      }

      const applied: ChangeSetRecord = {
        ...lockedCurrent,
        status: "applied",
        target_knowledge_version_id: input.target_knowledge_version_id,
        applied_by: input.applied_by,
        applied_at: this.now(),
      };

      this.repository.saveChangeSet(applied);

      return cloneChangeSet(applied);
    });
  }

  discardChangeSet(changeSetId: string, input: DiscardChangeSetInput): ChangeSetRecord {
    const current = this.requireChangeSet(changeSetId);

    if (current.status !== "pending") {
      throw new Error(`Cannot discard Change Set from status ${current.status}.`);
    }

    const discarded: ChangeSetRecord = {
      ...current,
      status: "discarded",
      discarded_by: input.discarded_by,
      discarded_at: this.now(),
      discard_reason: input.reason,
    };

    this.repository.saveChangeSet(discarded);

    return cloneChangeSet(discarded);
  }

  getChangeSet(changeSetId: string): ChangeSetRecord | undefined {
    return this.repository.findChangeSetById(changeSetId);
  }

  listChangeSetItems(changeSetId: string): ChangeSetItemRecord[] {
    return this.repository.listChangeSetItems(changeSetId);
  }

  private requireChangeSet(changeSetId: string): ChangeSetRecord {
    const changeSet = this.repository.findChangeSetById(changeSetId);

    if (changeSet === undefined) {
      throw new Error(`Change Set not found: ${changeSetId}`);
    }

    return changeSet;
  }
}

export function createInMemoryChangeSetRepository(): ChangeSetRepository {
  return new InMemoryChangeSetRepository();
}

export function createInMemoryChangeSetApplyLock(): ChangeSetApplyLock {
  return new InMemoryChangeSetApplyLock();
}

export class KnowledgeVersionApplicationService {
  private readonly repository: KnowledgeVersionRepository;
  private readonly changeSetService: ChangeSetPersistenceService;
  private readonly pageService: WikiPagePersistenceService;
  private readonly idFactory: (scope: KnowledgeVersionIdScope) => string;
  private readonly now: () => string;

  constructor(
    repository: KnowledgeVersionRepository,
    changeSetService: ChangeSetPersistenceService,
    pageService: WikiPagePersistenceService,
    options: KnowledgeVersionApplicationServiceOptions = {},
  ) {
    this.repository = repository;
    this.changeSetService = changeSetService;
    this.pageService = pageService;
    this.idFactory = options.idFactory ?? createKnowledgeVersionResourceId;
    this.now = options.now ?? createTimestamp;
  }

  applyChangeSet(input: ApplyKnowledgeVersionChangeSetInput): KnowledgeVersionApplicationResult {
    const changeSet = this.requirePendingChangeSet(input.change_set_id);
    const knowledgeVersionId = this.idFactory("knowledgeVersion");
    const pageVersions = input.page_changes.map((pageChange) =>
      this.applyPageChange(changeSet, knowledgeVersionId, input.applied_by, pageChange),
    );
    const knowledgeVersion: KnowledgeVersionRecord = {
      id: knowledgeVersionId,
      knowledge_base_id: changeSet.knowledge_base_id,
      previous_knowledge_version_id: changeSet.base_knowledge_version_id,
      change_set_id: changeSet.id,
      page_version_ids: pageVersions.map((version) => version.id),
      created_at: this.now(),
      created_by: input.applied_by,
    };

    this.repository.saveKnowledgeVersion(knowledgeVersion);

    const appliedChangeSet = this.changeSetService.applyChangeSet(changeSet.id, {
      target_knowledge_version_id: knowledgeVersionId,
      applied_by: input.applied_by,
    });

    return {
      knowledgeVersion: cloneKnowledgeVersion(knowledgeVersion),
      pageVersions: pageVersions.map(clonePageVersion),
      changeSet: appliedChangeSet,
    };
  }

  getKnowledgeVersion(knowledgeVersionId: string): KnowledgeVersionRecord | undefined {
    return this.repository.findKnowledgeVersionById(knowledgeVersionId);
  }

  private requirePendingChangeSet(changeSetId: string): ChangeSetRecord {
    const changeSet = this.changeSetService.getChangeSet(changeSetId);

    if (changeSet === undefined) {
      throw new Error(`Change Set not found: ${changeSetId}`);
    }

    if (changeSet.status !== "pending") {
      throw new Error(`Cannot apply Change Set from status ${changeSet.status}.`);
    }

    return changeSet;
  }

  private applyPageChange(
    changeSet: ChangeSetRecord,
    knowledgeVersionId: string,
    appliedBy: string,
    pageChange: KnowledgeVersionPageChange,
  ): WikiPageVersionSnapshot {
    const result =
      pageChange.action === "create"
        ? this.pageService.createPage({
            knowledge_base_id: changeSet.knowledge_base_id,
            knowledge_version_id: knowledgeVersionId,
            change_set_id: changeSet.id,
            title: pageChange.title,
            type: pageChange.type,
            markdown: pageChange.markdown,
            frontmatter: pageChange.frontmatter,
            sources: pageChange.sources,
            related: pageChange.related,
            wikilinks: pageChange.wikilinks,
            summary: pageChange.summary,
            created_by: appliedBy,
          })
        : this.pageService.updatePage({
            page_id: pageChange.page_id,
            knowledge_version_id: knowledgeVersionId,
            change_set_id: changeSet.id,
            title: pageChange.title,
            markdown: pageChange.markdown,
            frontmatter: pageChange.frontmatter,
            sources: pageChange.sources,
            related: pageChange.related,
            wikilinks: pageChange.wikilinks,
            summary: pageChange.summary,
            created_by: appliedBy,
          });

    return result.version;
  }
}

export function createInMemoryKnowledgeVersionRepository(): KnowledgeVersionRepository {
  return new InMemoryKnowledgeVersionRepository();
}

export class PageMergeService {
  private readonly repository: PageMergeRepository;
  private readonly changeSetService: ChangeSetPersistenceService;
  private readonly pageService: WikiPagePersistenceService;
  private readonly applicationService: KnowledgeVersionApplicationService;
  private readonly idFactory: (scope: PageMergeIdScope) => string;
  private readonly now: () => string;

  constructor(
    repository: PageMergeRepository,
    changeSetService: ChangeSetPersistenceService,
    pageService: WikiPagePersistenceService,
    applicationService: KnowledgeVersionApplicationService,
    options: PageMergeServiceOptions = {},
  ) {
    this.repository = repository;
    this.changeSetService = changeSetService;
    this.pageService = pageService;
    this.applicationService = applicationService;
    this.idFactory = options.idFactory ?? createPageMergeRecordId;
    this.now = options.now ?? createTimestamp;
  }

  mergePage(input: PageMergeInput): PageMergeResult {
    const currentPage = this.pageService.getCurrentPage(input.page_id);

    if (currentPage === undefined) {
      throw new Error(`Wiki Page not found: ${input.page_id}`);
    }

    const preservedFields = ["title", "type", "created"];
    const mergedFrontmatter = mergePageFrontmatter(currentPage, input);
    const mergedSources = mergeSourceRefs(currentPage.sources, input.sources);
    const mergedRelated = mergeStringValues(currentPage.related, input.related);
    const mergedWikilinks = mergeWikilinks(currentPage.wikilinks, input.wikilinks);

    validatePageMergeSafety(currentPage, input);

    const changeSet = this.changeSetService.createChangeSet({
      knowledge_base_id: currentPage.knowledge_base_id,
      base_knowledge_version_id: input.current_knowledge_version_id,
      trigger: "page_merge",
      title: "Merge Page",
      summary: input.summary,
      created_by: input.requested_by,
      items: [
        {
          object_type: "wiki_page",
          object_id: input.page_id,
          operation: "merge",
          diff: {
            preserved_fields: preservedFields,
            before: {
              title: currentPage.title,
              type: currentPage.type,
              markdown: currentPage.markdown,
              frontmatter: currentPage.frontmatter,
              sources: currentPage.sources,
              related: currentPage.related,
              wikilinks: currentPage.wikilinks,
            },
            after: {
              title: currentPage.title,
              type: currentPage.type,
              markdown: input.merged_markdown,
              frontmatter: mergedFrontmatter,
              sources: mergedSources,
              related: mergedRelated,
              wikilinks: mergedWikilinks,
            },
          },
        },
      ],
    });
    const applied = this.applicationService.applyChangeSet({
      change_set_id: changeSet.id,
      applied_by: input.requested_by,
      page_changes: [
        {
          action: "update",
          page_id: input.page_id,
          title: currentPage.title,
          markdown: input.merged_markdown,
          frontmatter: mergedFrontmatter,
          sources: mergedSources,
          related: mergedRelated,
          wikilinks: mergedWikilinks,
          summary: input.summary,
        },
      ],
    });
    const pageMergeRecord: PageMergeRecord = {
      id: this.idFactory("pageMerge"),
      knowledge_base_id: currentPage.knowledge_base_id,
      page_id: input.page_id,
      wiki_draft_id: input.wiki_draft_id,
      change_set_id: applied.changeSet.id,
      previous_page_version_id: currentPage.current_version_id,
      created_page_version_id: requireSinglePageVersion(applied.pageVersions).id,
      merge_summary: input.summary,
      preserved_fields: preservedFields,
      requested_by: input.requested_by,
      created_at: this.now(),
    };

    this.repository.savePageMergeRecord(pageMergeRecord);

    return {
      pageMergeRecord: clonePageMergeRecord(pageMergeRecord),
      changeSet: applied.changeSet,
      knowledgeVersion: applied.knowledgeVersion,
      pageVersions: applied.pageVersions,
    };
  }

  getPageMergeRecord(pageMergeRecordId: string): PageMergeRecord | undefined {
    return this.repository.findPageMergeRecordById(pageMergeRecordId);
  }
}

export function createInMemoryPageMergeRepository(): PageMergeRepository {
  return new InMemoryPageMergeRepository();
}

export class DedupService {
  private readonly repository: DedupRepository;
  private readonly idFactory: (scope: DedupIdScope) => string;
  private readonly now: () => string;

  constructor(repository: DedupRepository, options: DedupServiceOptions = {}) {
    this.repository = repository;
    this.idFactory = options.idFactory ?? createDedupRecordId;
    this.now = options.now ?? createTimestamp;
  }

  detectDuplicateCandidates(
    input: DetectDuplicateCandidatesInput,
  ): DetectDuplicateCandidatesResult {
    const candidates: DuplicateCandidateRecord[] = [];
    const skippedDecisionIds: string[] = [];

    for (let leftIndex = 0; leftIndex < input.pages.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < input.pages.length; rightIndex += 1) {
        const leftPage = input.pages[leftIndex];
        const rightPage = input.pages[rightIndex];

        if (leftPage === undefined || rightPage === undefined) {
          continue;
        }

        const evidence = detectDuplicateEvidence(leftPage, rightPage);

        if (evidence.length === 0) {
          continue;
        }

        const existing = this.repository.findDuplicateCandidateByPagePair(
          input.knowledge_base_id,
          leftPage.page_id,
          rightPage.page_id,
        );

        if (existing?.status === "not_duplicate" && existing.decision_id !== undefined) {
          skippedDecisionIds.push(existing.decision_id);
          continue;
        }

        if (existing !== undefined) {
          candidates.push(existing);
          continue;
        }

        const candidate: DuplicateCandidateRecord = {
          id: this.idFactory("duplicateCandidate"),
          knowledge_base_id: input.knowledge_base_id,
          left_page_id: leftPage.page_id,
          right_page_id: rightPage.page_id,
          status: "pending",
          confidence: 0.9,
          reason: "Title or alias overlap detected.",
          evidence,
          created_at: this.now(),
        };

        this.repository.saveDuplicateCandidate(candidate);
        candidates.push(cloneDuplicateCandidate(candidate));
      }
    }

    return {
      candidates,
      skipped_decision_ids: [...new Set(skippedDecisionIds)],
    };
  }

  recordNotDuplicateDecision(input: RecordNotDuplicateDecisionInput): DuplicateDecisionRecord {
    const candidate = this.repository.findDuplicateCandidateById(input.candidate_id);

    if (candidate === undefined) {
      throw new Error(`Duplicate Candidate not found: ${input.candidate_id}`);
    }

    const decision: DuplicateDecisionRecord = {
      id: this.idFactory("duplicateDecision"),
      candidate_id: input.candidate_id,
      decision: "not_duplicate",
      decided_by: input.decided_by,
      reason: input.reason,
      created_at: this.now(),
    };
    const updatedCandidate: DuplicateCandidateRecord = {
      ...candidate,
      status: "not_duplicate",
      decision_id: decision.id,
    };

    this.repository.saveDuplicateDecision(decision);
    this.repository.saveDuplicateCandidate(updatedCandidate);

    return cloneDuplicateDecision(decision);
  }

  getDuplicateCandidate(candidateId: string): DuplicateCandidateRecord | undefined {
    return this.repository.findDuplicateCandidateById(candidateId);
  }

  getDuplicateDecision(decisionId: string): DuplicateDecisionRecord | undefined {
    return this.repository.findDuplicateDecisionById(decisionId);
  }
}

export function createInMemoryDedupRepository(): DedupRepository {
  return new InMemoryDedupRepository();
}

export class ParsedContentIngestService {
  private readonly changeSetService: ChangeSetPersistenceService;
  private readonly applicationService: KnowledgeVersionApplicationService;
  private readonly indexUpdateQueue: IndexUpdateQueue;

  constructor(
    changeSetService: ChangeSetPersistenceService,
    applicationService: KnowledgeVersionApplicationService,
    indexUpdateQueue: IndexUpdateQueue,
  ) {
    this.changeSetService = changeSetService;
    this.applicationService = applicationService;
    this.indexUpdateQueue = indexUpdateQueue;
  }

  ingestParsedContent(input: ParsedContentIngestInput): ParsedContentIngestResult {
    const changeSet = this.changeSetService.createChangeSet({
      knowledge_base_id: input.knowledge_base_id,
      base_knowledge_version_id: input.current_knowledge_version_id,
      trigger: "ingest",
      title: "Ingest Parsed Content",
      summary: input.summary,
      created_by: input.requested_by,
      items: [
        {
          object_type: "wiki_page",
          object_id: input.parsed_content_id,
          operation: "create",
          diff: {
            after: {
              document_id: input.document_id,
              parsed_content_id: input.parsed_content_id,
              title: input.title,
              markdown: input.markdown,
            },
          },
        },
      ],
    });
    const applied = this.applicationService.applyChangeSet({
      change_set_id: changeSet.id,
      applied_by: input.requested_by,
      page_changes: [
        {
          action: "create",
          title: input.title,
          type: "source",
          markdown: input.markdown,
          frontmatter: {
            type: "source",
            parsed_content_id: input.parsed_content_id,
            sources: [input.document_id],
          },
          sources: [
            {
              document_id: input.document_id,
              locator: input.source_locator,
            },
          ],
          related: [],
          wikilinks: [],
          summary: input.summary,
        },
      ],
    });
    const indexUpdateJob = this.indexUpdateQueue.enqueueIndexUpdate({
      knowledge_base_id: applied.knowledgeVersion.knowledge_base_id,
      knowledge_version_id: applied.knowledgeVersion.id,
      change_set_id: applied.changeSet.id,
      reason: "change_set_apply",
    });

    return {
      changeSet: applied.changeSet,
      knowledgeVersion: applied.knowledgeVersion,
      pageVersions: applied.pageVersions,
      indexUpdateJob,
    };
  }
}

export class SourceDeleteService {
  private readonly changeSetService: ChangeSetPersistenceService;
  private readonly pageService: WikiPagePersistenceService;
  private readonly applicationService: KnowledgeVersionApplicationService;
  private readonly indexUpdateQueue: IndexUpdateQueue;

  constructor(
    changeSetService: ChangeSetPersistenceService,
    pageService: WikiPagePersistenceService,
    applicationService: KnowledgeVersionApplicationService,
    indexUpdateQueue: IndexUpdateQueue,
  ) {
    this.changeSetService = changeSetService;
    this.pageService = pageService;
    this.applicationService = applicationService;
    this.indexUpdateQueue = indexUpdateQueue;
  }

  deleteSource(input: SourceDeleteInput): SourceDeleteResult {
    const affectedPages = input.affected_page_ids.map((pageId) => {
      const page = this.pageService.getCurrentPage(pageId);

      if (page === undefined) {
        throw new Error(`Wiki Page not found: ${pageId}`);
      }

      return page;
    });
    const pageChanges = affectedPages.map((page) => ({
      action: "update" as const,
      page_id: page.id,
      title: page.title,
      markdown: page.markdown,
      frontmatter: removeSourceFromFrontmatter(page.frontmatter, input.document_id),
      sources: page.sources.filter((source) => source.document_id !== input.document_id),
      related: page.related,
      wikilinks: page.wikilinks,
      summary: input.summary,
    }));
    const changeSet = this.changeSetService.createChangeSet({
      knowledge_base_id: input.knowledge_base_id,
      base_knowledge_version_id: input.current_knowledge_version_id,
      trigger: "source_delete",
      title: "Delete Source",
      summary: input.summary,
      created_by: input.requested_by,
      items: affectedPages.map((page) => ({
        object_type: "wiki_page",
        object_id: page.id,
        operation: "update",
        diff: {
          before: {
            sources: page.sources,
            frontmatter: page.frontmatter,
          },
          after: {
            sources: page.sources.filter((source) => source.document_id !== input.document_id),
            frontmatter: removeSourceFromFrontmatter(page.frontmatter, input.document_id),
          },
        },
      })),
    });
    const applied = this.applicationService.applyChangeSet({
      change_set_id: changeSet.id,
      applied_by: input.requested_by,
      page_changes: pageChanges,
    });
    const indexUpdateJob = this.indexUpdateQueue.enqueueIndexUpdate({
      knowledge_base_id: applied.knowledgeVersion.knowledge_base_id,
      knowledge_version_id: applied.knowledgeVersion.id,
      change_set_id: applied.changeSet.id,
      reason: "change_set_apply",
    });

    return {
      changeSet: applied.changeSet,
      knowledgeVersion: applied.knowledgeVersion,
      pageVersions: applied.pageVersions,
      indexUpdateJob,
      affected_edge_ids: [],
      updated_system_page_keys: ["index", "overview", "log"],
    };
  }
}

export class PageUpdateService {
  private readonly changeSetService: ChangeSetPersistenceService;
  private readonly pageService: WikiPagePersistenceService;
  private readonly applicationService: KnowledgeVersionApplicationService;
  private readonly indexUpdateQueue: IndexUpdateQueue;

  constructor(
    changeSetService: ChangeSetPersistenceService,
    pageService: WikiPagePersistenceService,
    applicationService: KnowledgeVersionApplicationService,
    indexUpdateQueue: IndexUpdateQueue,
  ) {
    this.changeSetService = changeSetService;
    this.pageService = pageService;
    this.applicationService = applicationService;
    this.indexUpdateQueue = indexUpdateQueue;
  }

  updatePage(input: PageUpdateInput): PageUpdateResult {
    const currentPage = this.pageService.getCurrentPage(input.page_id);

    if (currentPage === undefined) {
      throw new Error(`Wiki Page not found: ${input.page_id}`);
    }

    const changeSet = this.changeSetService.createChangeSet({
      knowledge_base_id: currentPage.knowledge_base_id,
      base_knowledge_version_id: input.current_knowledge_version_id,
      trigger: "manual_edit",
      title: "Update Page",
      summary: input.summary,
      created_by: input.requested_by,
      items: [
        {
          object_type: "wiki_page",
          object_id: input.page_id,
          operation: "update",
          diff: {
            before: {
              title: currentPage.title,
              markdown: currentPage.markdown,
            },
            after: {
              title: input.title,
              markdown: input.markdown,
            },
          },
        },
      ],
    });

    const applied = this.applicationService.applyChangeSet({
      change_set_id: changeSet.id,
      applied_by: input.requested_by,
      page_changes: [
        {
          action: "update",
          page_id: input.page_id,
          title: input.title,
          markdown: input.markdown,
          frontmatter: input.frontmatter,
          sources: input.sources,
          related: input.related,
          wikilinks: input.wikilinks,
          summary: input.summary,
        },
      ],
    });
    const indexUpdateJob = this.indexUpdateQueue.enqueueIndexUpdate({
      knowledge_base_id: applied.knowledgeVersion.knowledge_base_id,
      knowledge_version_id: applied.knowledgeVersion.id,
      change_set_id: applied.changeSet.id,
      reason: "change_set_apply",
    });

    return {
      mode: input.apply_mode,
      changeSet: applied.changeSet,
      knowledgeVersion: applied.knowledgeVersion,
      pageVersions: applied.pageVersions,
      indexUpdateJob,
    };
  }
}

export class RollbackService {
  private readonly repository: RollbackRepository;
  private readonly changeSetService: ChangeSetPersistenceService;
  private readonly pageService: WikiPagePersistenceService;
  private readonly applicationService: KnowledgeVersionApplicationService;
  private readonly indexUpdateQueue: IndexUpdateQueue;
  private readonly idFactory: (scope: RollbackIdScope) => string;
  private readonly now: () => string;

  constructor(
    repository: RollbackRepository,
    changeSetService: ChangeSetPersistenceService,
    pageService: WikiPagePersistenceService,
    applicationService: KnowledgeVersionApplicationService,
    indexUpdateQueue: IndexUpdateQueue,
    options: RollbackServiceOptions = {},
  ) {
    this.repository = repository;
    this.changeSetService = changeSetService;
    this.pageService = pageService;
    this.applicationService = applicationService;
    this.indexUpdateQueue = indexUpdateQueue;
    this.idFactory = options.idFactory ?? createRollbackRecordId;
    this.now = options.now ?? createTimestamp;
  }

  rollbackKnowledgeBase(input: RollbackKnowledgeBaseInput): RollbackResult {
    const changeSet = this.changeSetService.createChangeSet({
      knowledge_base_id: input.knowledge_base_id,
      base_knowledge_version_id: input.current_knowledge_version_id,
      trigger: "rollback",
      title: "Rollback Knowledge Base",
      summary: input.reason ?? `Rollback to ${input.target_knowledge_version_id}.`,
      created_by: input.requested_by,
      items: [
        {
          object_type: "knowledge_version",
          object_id: input.knowledge_base_id,
          operation: "update",
          diff: {
            before: {
              knowledge_version_id: input.current_knowledge_version_id,
            },
            after: {
              knowledge_version_id: input.target_knowledge_version_id,
            },
          },
        },
      ],
    });
    const applied = this.applicationService.applyChangeSet({
      change_set_id: changeSet.id,
      applied_by: input.requested_by,
      page_changes: [],
    });
    const rollbackRecord: RollbackRecord = {
      id: this.idFactory("rollback"),
      scope: "knowledge_base",
      knowledge_base_id: input.knowledge_base_id,
      source_knowledge_version_id: input.current_knowledge_version_id,
      target_knowledge_version_id: input.target_knowledge_version_id,
      created_change_set_id: applied.changeSet.id,
      created_knowledge_version_id: applied.knowledgeVersion.id,
      reason: input.reason ?? null,
      requested_by: input.requested_by,
      created_at: this.now(),
    };
    const indexUpdateJob = this.indexUpdateQueue.enqueueIndexUpdate({
      knowledge_base_id: input.knowledge_base_id,
      knowledge_version_id: applied.knowledgeVersion.id,
      change_set_id: applied.changeSet.id,
      reason: "rollback",
    });

    this.repository.saveRollbackRecord(rollbackRecord);

    return {
      rollbackRecord: cloneRollbackRecord(rollbackRecord),
      changeSet: applied.changeSet,
      knowledgeVersion: applied.knowledgeVersion,
      pageVersions: applied.pageVersions,
      indexUpdateJob,
    };
  }

  rollbackPage(input: RollbackPageInput): RollbackResult {
    const currentPage = this.pageService.getCurrentPage(input.page_id);

    if (currentPage === undefined) {
      throw new Error(`Wiki Page not found: ${input.page_id}`);
    }

    const targetPageVersion = this.pageService.getPageVersion(input.target_page_version_id);

    if (targetPageVersion === undefined) {
      throw new Error(`Page Version not found: ${input.target_page_version_id}`);
    }

    if (targetPageVersion.page_id !== input.page_id) {
      throw new Error(
        `Page Version ${input.target_page_version_id} does not belong to ${input.page_id}.`,
      );
    }

    const changeSet = this.changeSetService.createChangeSet({
      knowledge_base_id: currentPage.knowledge_base_id,
      base_knowledge_version_id: input.current_knowledge_version_id,
      trigger: "rollback",
      title: "Rollback Page",
      summary: input.reason ?? `Rollback page to ${input.target_page_version_id}.`,
      created_by: input.requested_by,
      items: [
        {
          object_type: "wiki_page",
          object_id: input.page_id,
          operation: "update",
          diff: {
            before: {
              page_version_id: currentPage.current_version_id,
              markdown: currentPage.markdown,
            },
            after: {
              page_version_id: input.target_page_version_id,
              markdown: targetPageVersion.markdown,
            },
          },
        },
      ],
    });
    const applied = this.applicationService.applyChangeSet({
      change_set_id: changeSet.id,
      applied_by: input.requested_by,
      page_changes: [
        {
          action: "update",
          page_id: input.page_id,
          title: targetPageVersion.title,
          markdown: targetPageVersion.markdown,
          frontmatter: targetPageVersion.frontmatter,
          sources: targetPageVersion.sources,
          related: targetPageVersion.related,
          wikilinks: targetPageVersion.wikilinks,
          summary: input.reason ?? `Rollback to ${input.target_page_version_id}.`,
        },
      ],
    });
    const rollbackRecord: RollbackRecord = {
      id: this.idFactory("rollback"),
      scope: "page",
      knowledge_base_id: currentPage.knowledge_base_id,
      page_id: input.page_id,
      source_knowledge_version_id: input.current_knowledge_version_id,
      source_page_version_id: currentPage.current_version_id,
      target_page_version_id: input.target_page_version_id,
      created_change_set_id: applied.changeSet.id,
      created_knowledge_version_id: applied.knowledgeVersion.id,
      reason: input.reason ?? null,
      requested_by: input.requested_by,
      created_at: this.now(),
    };
    const indexUpdateJob = this.indexUpdateQueue.enqueueIndexUpdate({
      knowledge_base_id: currentPage.knowledge_base_id,
      knowledge_version_id: applied.knowledgeVersion.id,
      change_set_id: applied.changeSet.id,
      reason: "rollback",
    });

    this.repository.saveRollbackRecord(rollbackRecord);

    return {
      rollbackRecord: cloneRollbackRecord(rollbackRecord),
      changeSet: applied.changeSet,
      knowledgeVersion: applied.knowledgeVersion,
      pageVersions: applied.pageVersions,
      indexUpdateJob,
    };
  }

  getRollbackRecord(rollbackRecordId: string): RollbackRecord | undefined {
    return this.repository.findRollbackRecordById(rollbackRecordId);
  }
}

export function createInMemoryRollbackRepository(): RollbackRepository {
  return new InMemoryRollbackRepository();
}

export function createInMemoryIndexUpdateQueue(): IndexUpdateQueue {
  return new InMemoryIndexUpdateQueue();
}

function createVersionSnapshot(input: {
  id: string;
  page: WikiPageCurrentState;
  knowledgeVersionId: string;
  changeSetId: string;
  summary: string;
  createdAt: string;
  createdBy: string;
}): WikiPageVersionSnapshot {
  return {
    id: input.id,
    page_id: input.page.id,
    knowledge_base_id: input.page.knowledge_base_id,
    knowledge_version_id: input.knowledgeVersionId,
    change_set_id: input.changeSetId,
    title: input.page.title,
    type: input.page.type,
    ...(input.page.system_page_key === undefined
      ? {}
      : { system_page_key: input.page.system_page_key }),
    markdown: input.page.markdown,
    frontmatter: cloneFrontmatter(input.page.frontmatter),
    sources: cloneSources(input.page.sources),
    related: [...input.page.related],
    wikilinks: cloneWikilinks(input.page.wikilinks),
    summary: input.summary,
    created_at: input.createdAt,
    created_by: input.createdBy,
  };
}

class InMemoryWikiPageRepository implements WikiPageRepository {
  private readonly pages = new Map<string, WikiPageCurrentState>();
  private readonly versions = new Map<string, WikiPageVersionSnapshot>();
  private readonly versionIdsByPage = new Map<string, string[]>();
  private readonly systemPageIdsByKey = new Map<string, string>();

  savePage(page: WikiPageCurrentState): void {
    this.pages.set(page.id, clonePage(page));

    if (page.system_page_key !== undefined) {
      this.systemPageIdsByKey.set(createSystemPageStorageKey(page), page.id);
    }
  }

  savePageVersion(version: WikiPageVersionSnapshot): void {
    this.versions.set(version.id, clonePageVersion(version));

    const versionIds = this.versionIdsByPage.get(version.page_id) ?? [];

    if (!versionIds.includes(version.id)) {
      versionIds.push(version.id);
      this.versionIdsByPage.set(version.page_id, versionIds);
    }
  }

  findPageById(pageId: string): WikiPageCurrentState | undefined {
    const page = this.pages.get(pageId);

    return page === undefined ? undefined : clonePage(page);
  }

  findSystemPageByKey(
    knowledgeBaseId: string,
    systemPageKey: SystemPageKey,
  ): WikiPageCurrentState | undefined {
    const pageId = this.systemPageIdsByKey.get(
      createSystemPageLookupKey(knowledgeBaseId, systemPageKey),
    );

    return pageId === undefined ? undefined : this.findPageById(pageId);
  }

  findPageVersionById(pageVersionId: string): WikiPageVersionSnapshot | undefined {
    const version = this.versions.get(pageVersionId);

    return version === undefined ? undefined : clonePageVersion(version);
  }

  listPageVersions(pageId: string): WikiPageVersionSnapshot[] {
    return (this.versionIdsByPage.get(pageId) ?? [])
      .map((versionId) => this.versions.get(versionId))
      .filter((version): version is WikiPageVersionSnapshot => version !== undefined)
      .map(clonePageVersion);
  }
}

class InMemoryWikiRelationshipRepository implements WikiRelationshipRepository {
  private readonly edges = new Map<string, WikiRelationshipEdgeRecord>();
  private readonly edgeSources = new Map<string, WikiRelationshipEdgeSourceRecord[]>();
  private readonly edgeIdsByPage = new Map<string, string[]>();

  saveEdge(edge: WikiRelationshipEdgeRecord): void {
    this.edges.set(edge.id, cloneEdge(edge));
    this.indexEdgeForPage(edge.from_page_id, edge.id);
    this.indexEdgeForPage(edge.to_page_id, edge.id);
  }

  saveEdgeSources(edgeId: string, sources: readonly WikiRelationshipEdgeSourceRecord[]): void {
    this.edgeSources.set(edgeId, sources.map(cloneEdgeSource));
  }

  findEdgeById(edgeId: string): WikiRelationshipEdgeRecord | undefined {
    const edge = this.edges.get(edgeId);

    return edge === undefined ? undefined : cloneEdge(edge);
  }

  listEdgesForPage(pageId: string): WikiRelationshipEdgeRecord[] {
    return (this.edgeIdsByPage.get(pageId) ?? [])
      .map((edgeId) => this.edges.get(edgeId))
      .filter((edge): edge is WikiRelationshipEdgeRecord => edge !== undefined)
      .map(cloneEdge);
  }

  listEdgeSources(edgeId: string): WikiRelationshipEdgeSourceRecord[] {
    return (this.edgeSources.get(edgeId) ?? []).map(cloneEdgeSource);
  }

  private indexEdgeForPage(pageId: string, edgeId: string): void {
    const edgeIds = this.edgeIdsByPage.get(pageId) ?? [];

    if (!edgeIds.includes(edgeId)) {
      edgeIds.push(edgeId);
      this.edgeIdsByPage.set(pageId, edgeIds);
    }
  }
}

class InMemoryChangeSetRepository implements ChangeSetRepository {
  private readonly changeSets = new Map<string, ChangeSetRecord>();
  private readonly itemsByChangeSet = new Map<string, ChangeSetItemRecord[]>();

  saveChangeSet(changeSet: ChangeSetRecord): void {
    this.changeSets.set(changeSet.id, cloneChangeSet(changeSet));
  }

  saveChangeSetItems(changeSetId: string, items: readonly ChangeSetItemRecord[]): void {
    this.itemsByChangeSet.set(changeSetId, items.map(cloneChangeSetItem));
  }

  findChangeSetById(changeSetId: string): ChangeSetRecord | undefined {
    const changeSet = this.changeSets.get(changeSetId);

    return changeSet === undefined ? undefined : cloneChangeSet(changeSet);
  }

  listChangeSetItems(changeSetId: string): ChangeSetItemRecord[] {
    return (this.itemsByChangeSet.get(changeSetId) ?? []).map(cloneChangeSetItem);
  }
}

class InMemoryChangeSetApplyLock implements ChangeSetApplyLock {
  private readonly lockedKnowledgeBaseIds = new Set<string>();

  runWithKnowledgeBaseApplyLock<TResult>(
    knowledgeBaseId: string,
    operation: () => TResult,
  ): TResult {
    if (this.lockedKnowledgeBaseIds.has(knowledgeBaseId)) {
      throw new Error(
        `Change Set apply lock is already held for Knowledge Base ${knowledgeBaseId}.`,
      );
    }

    this.lockedKnowledgeBaseIds.add(knowledgeBaseId);

    try {
      return operation();
    } finally {
      this.lockedKnowledgeBaseIds.delete(knowledgeBaseId);
    }
  }
}

class InMemoryKnowledgeVersionRepository implements KnowledgeVersionRepository {
  private readonly knowledgeVersions = new Map<string, KnowledgeVersionRecord>();

  saveKnowledgeVersion(knowledgeVersion: KnowledgeVersionRecord): void {
    this.knowledgeVersions.set(knowledgeVersion.id, cloneKnowledgeVersion(knowledgeVersion));
  }

  findKnowledgeVersionById(knowledgeVersionId: string): KnowledgeVersionRecord | undefined {
    const knowledgeVersion = this.knowledgeVersions.get(knowledgeVersionId);

    return knowledgeVersion === undefined ? undefined : cloneKnowledgeVersion(knowledgeVersion);
  }
}

class InMemoryPageMergeRepository implements PageMergeRepository {
  private readonly pageMergeRecords = new Map<string, PageMergeRecord>();

  savePageMergeRecord(record: PageMergeRecord): void {
    this.pageMergeRecords.set(record.id, clonePageMergeRecord(record));
  }

  findPageMergeRecordById(pageMergeRecordId: string): PageMergeRecord | undefined {
    const record = this.pageMergeRecords.get(pageMergeRecordId);

    return record === undefined ? undefined : clonePageMergeRecord(record);
  }
}

class InMemoryDedupRepository implements DedupRepository {
  private readonly duplicateCandidates = new Map<string, DuplicateCandidateRecord>();
  private readonly duplicateDecisions = new Map<string, DuplicateDecisionRecord>();
  private readonly candidateIdsByPagePair = new Map<string, string>();

  saveDuplicateCandidate(record: DuplicateCandidateRecord): void {
    this.duplicateCandidates.set(record.id, cloneDuplicateCandidate(record));
    this.candidateIdsByPagePair.set(createDuplicateCandidatePairKey(record), record.id);
  }

  findDuplicateCandidateById(candidateId: string): DuplicateCandidateRecord | undefined {
    const record = this.duplicateCandidates.get(candidateId);

    return record === undefined ? undefined : cloneDuplicateCandidate(record);
  }

  findDuplicateCandidateByPagePair(
    knowledgeBaseId: string,
    leftPageId: string,
    rightPageId: string,
  ): DuplicateCandidateRecord | undefined {
    const candidateId = this.candidateIdsByPagePair.get(
      createDuplicatePagePairLookupKey(knowledgeBaseId, leftPageId, rightPageId),
    );

    return candidateId === undefined ? undefined : this.findDuplicateCandidateById(candidateId);
  }

  saveDuplicateDecision(record: DuplicateDecisionRecord): void {
    this.duplicateDecisions.set(record.id, cloneDuplicateDecision(record));
  }

  findDuplicateDecisionById(decisionId: string): DuplicateDecisionRecord | undefined {
    const record = this.duplicateDecisions.get(decisionId);

    return record === undefined ? undefined : cloneDuplicateDecision(record);
  }
}

class InMemoryRollbackRepository implements RollbackRepository {
  private readonly rollbackRecords = new Map<string, RollbackRecord>();

  saveRollbackRecord(record: RollbackRecord): void {
    this.rollbackRecords.set(record.id, cloneRollbackRecord(record));
  }

  findRollbackRecordById(rollbackRecordId: string): RollbackRecord | undefined {
    const record = this.rollbackRecords.get(rollbackRecordId);

    return record === undefined ? undefined : cloneRollbackRecord(record);
  }
}

class InMemoryIndexUpdateQueue implements IndexUpdateQueue {
  readonly jobs: IndexUpdateJob[] = [];

  enqueueIndexUpdate(input: Omit<IndexUpdateJob, "job_id">): IndexUpdateJob {
    const job: IndexUpdateJob = {
      job_id: `index_update_${input.knowledge_version_id}`,
      ...input,
    };

    this.jobs.push({ ...job });

    return { ...job };
  }
}

function createSystemPageStorageKey(page: WikiPageCurrentState): string {
  if (page.system_page_key === undefined) {
    throw new Error(`Wiki Page is not a System Page: ${page.id}`);
  }

  return createSystemPageLookupKey(page.knowledge_base_id, page.system_page_key);
}

function createSystemPageLookupKey(knowledgeBaseId: string, systemPageKey: SystemPageKey): string {
  return `${knowledgeBaseId}:${systemPageKey}`;
}

function createWikiPageResourceId(scope: WikiPageIdScope): string {
  return scope === "wikiPage" ? createResourceId("wikiPage") : createResourceId("pageVersion");
}

function createWikiRelationshipResourceId(): string {
  return createResourceId("graphEdge");
}

function createChangeSetResourceId(): string {
  return createResourceId("changeSet");
}

function createKnowledgeVersionResourceId(): string {
  return createResourceId("knowledgeVersion");
}

function createRollbackRecordId(): string {
  return `rb_${randomUUID().replaceAll("-", "")}`;
}

function createPageMergeRecordId(): string {
  return `merge_${randomUUID().replaceAll("-", "")}`;
}

function createDedupRecordId(scope: DedupIdScope): string {
  const prefix = scope === "duplicateCandidate" ? "dup_" : "dup_decision_";

  return `${prefix}${randomUUID().replaceAll("-", "")}`;
}

function createTimestamp(): string {
  return new Date().toISOString();
}

function requireSinglePageVersion(
  pageVersions: readonly WikiPageVersionSnapshot[],
): WikiPageVersionSnapshot {
  const pageVersion = pageVersions[0];

  if (pageVersion === undefined) {
    throw new Error("Page Merge did not create a Page Version.");
  }

  return pageVersion;
}

function mergePageFrontmatter(
  currentPage: WikiPageCurrentState,
  input: PageMergeInput,
): WikiPageFrontmatter {
  const merged: WikiPageFrontmatter = {
    ...cloneFrontmatter(currentPage.frontmatter),
    ...cloneFrontmatter(input.frontmatter),
    type: currentPage.type,
  };

  if (currentPage.frontmatter.created !== undefined) {
    merged.created = currentPage.frontmatter.created;
  }

  merged.tags = mergeStringValues(
    readStringArray(currentPage.frontmatter.tags),
    readStringArray(input.frontmatter.tags),
  );
  merged.sources = mergeStringValues(
    readStringArray(currentPage.frontmatter.sources),
    readStringArray(input.frontmatter.sources),
  );

  return merged;
}

function validatePageMergeSafety(currentPage: WikiPageCurrentState, input: PageMergeInput): void {
  if (
    input.sources.length === 0 ||
    readStringArray(input.frontmatter.sources).length === 0 ||
    !mergedMarkdownPreservesCurrentBody(currentPage.markdown, input.merged_markdown)
  ) {
    throw new Error("Page merge is unsafe to apply automatically.");
  }
}

function mergedMarkdownPreservesCurrentBody(
  currentMarkdown: string,
  mergedMarkdown: string,
): boolean {
  const currentBody = normalizeMarkdownForSafety(currentMarkdown);
  const mergedBody = normalizeMarkdownForSafety(mergedMarkdown);

  if (currentBody.length === 0) {
    return true;
  }

  return mergedBody.includes(currentBody);
}

function normalizeMarkdownForSafety(value: string): string {
  return value
    .replace(/^# .+$/mu, "")
    .replace(/\s+/gu, " ")
    .trim()
    .toLowerCase();
}

function removeSourceFromFrontmatter(
  frontmatter: WikiPageFrontmatter,
  documentId: string,
): WikiPageFrontmatter {
  const next = cloneFrontmatter(frontmatter);

  next.sources = readStringArray(next.sources).filter((sourceId) => sourceId !== documentId);

  return next;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function mergeStringValues(left: readonly string[], right: readonly string[]): string[] {
  return [...new Set([...left, ...right])];
}

function mergeSourceRefs(
  left: readonly WikiPageSourceRef[],
  right: readonly WikiPageSourceRef[],
): WikiPageSourceRef[] {
  const seen = new Set<string>();
  const merged: WikiPageSourceRef[] = [];

  for (const source of [...left, ...right]) {
    const key = `${source.document_id}:${source.locator}`;

    if (!seen.has(key)) {
      seen.add(key);
      merged.push({ ...source });
    }
  }

  return merged;
}

function mergeWikilinks(
  left: readonly WikiPageWikilink[],
  right: readonly WikiPageWikilink[],
): WikiPageWikilink[] {
  const seen = new Set<string>();
  const merged: WikiPageWikilink[] = [];

  for (const wikilink of [...left, ...right]) {
    const key = `${wikilink.target_title}:${wikilink.target_page_id}`;

    if (!seen.has(key)) {
      seen.add(key);
      merged.push({ ...wikilink });
    }
  }

  return merged;
}

function detectDuplicateEvidence(
  leftPage: DuplicateCandidatePageInput,
  rightPage: DuplicateCandidatePageInput,
): DuplicateCandidateEvidence[] {
  const leftTerms = createDuplicateCandidateTerms(leftPage);
  const rightTerms = new Set(createDuplicateCandidateTerms(rightPage));
  const overlap = leftTerms.find((term) => rightTerms.has(term));

  if (overlap === undefined) {
    return [];
  }

  return [
    {
      kind:
        normalizeDuplicateTerm(leftPage.title) === overlap &&
        normalizeDuplicateTerm(rightPage.title) === overlap
          ? "title_match"
          : "alias_overlap",
      value: overlap,
    },
  ];
}

function createDuplicateCandidateTerms(page: DuplicateCandidatePageInput): string[] {
  return [page.title, ...page.aliases]
    .map(normalizeDuplicateTerm)
    .filter((term) => term.length > 0);
}

function normalizeDuplicateTerm(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function createDuplicateCandidatePairKey(record: DuplicateCandidateRecord): string {
  return createDuplicatePagePairLookupKey(
    record.knowledge_base_id,
    record.left_page_id,
    record.right_page_id,
  );
}

function createDuplicatePagePairLookupKey(
  knowledgeBaseId: string,
  leftPageId: string,
  rightPageId: string,
): string {
  const [firstPageId, secondPageId] = [leftPageId, rightPageId].sort();

  return `${knowledgeBaseId}:${firstPageId}:${secondPageId}`;
}

function clonePage(page: WikiPageCurrentState): WikiPageCurrentState {
  return {
    ...page,
    frontmatter: cloneFrontmatter(page.frontmatter),
    sources: cloneSources(page.sources),
    related: [...page.related],
    wikilinks: cloneWikilinks(page.wikilinks),
  };
}

function clonePageVersion(version: WikiPageVersionSnapshot): WikiPageVersionSnapshot {
  return {
    ...version,
    frontmatter: cloneFrontmatter(version.frontmatter),
    sources: cloneSources(version.sources),
    related: [...version.related],
    wikilinks: cloneWikilinks(version.wikilinks),
  };
}

function cloneFrontmatter(frontmatter: WikiPageFrontmatter): WikiPageFrontmatter {
  return JSON.parse(JSON.stringify(frontmatter)) as WikiPageFrontmatter;
}

function cloneSources(sources: readonly WikiPageSourceRef[]): WikiPageSourceRef[] {
  return sources.map((source) => ({ ...source }));
}

function cloneWikilinks(wikilinks: readonly WikiPageWikilink[]): WikiPageWikilink[] {
  return wikilinks.map((wikilink) => ({ ...wikilink }));
}

function getUniqueSourceDocumentIds(
  sourceEvidence: readonly WikiRelationshipSourceEvidence[],
): string[] {
  return [...new Set(sourceEvidence.map((source) => source.document_id))];
}

function createEdgeSource(
  edgeId: string,
  source: WikiRelationshipSourceEvidence,
): WikiRelationshipEdgeSourceRecord {
  return source.note === undefined
    ? {
        edge_id: edgeId,
        document_id: source.document_id,
        locator: source.locator,
      }
    : {
        edge_id: edgeId,
        document_id: source.document_id,
        locator: source.locator,
        note: source.note,
      };
}

function cloneEdge(edge: WikiRelationshipEdgeRecord): WikiRelationshipEdgeRecord {
  return {
    ...edge,
    source_document_ids: [...edge.source_document_ids],
  };
}

function cloneEdgeSource(
  source: WikiRelationshipEdgeSourceRecord,
): WikiRelationshipEdgeSourceRecord {
  return source.note === undefined
    ? {
        edge_id: source.edge_id,
        document_id: source.document_id,
        locator: source.locator,
      }
    : {
        edge_id: source.edge_id,
        document_id: source.document_id,
        locator: source.locator,
        note: source.note,
      };
}

function createChangeSetItem(
  changeSetId: string,
  index: number,
  item: ChangeSetItemInput,
): ChangeSetItemRecord {
  return {
    id: `${changeSetId}_item_${index}`,
    change_set_id: changeSetId,
    object_type: item.object_type,
    object_id: item.object_id,
    operation: item.operation,
    diff: cloneJson(item.diff),
  };
}

function cloneChangeSet(changeSet: ChangeSetRecord): ChangeSetRecord {
  return cloneJson(changeSet);
}

function cloneChangeSetItem(item: ChangeSetItemRecord): ChangeSetItemRecord {
  return {
    ...item,
    diff: cloneJson(item.diff),
  };
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function cloneKnowledgeVersion(knowledgeVersion: KnowledgeVersionRecord): KnowledgeVersionRecord {
  return {
    ...knowledgeVersion,
    page_version_ids: [...knowledgeVersion.page_version_ids],
  };
}

function cloneRollbackRecord(record: RollbackRecord): RollbackRecord {
  return { ...record };
}

function clonePageMergeRecord(record: PageMergeRecord): PageMergeRecord {
  return {
    ...record,
    preserved_fields: [...record.preserved_fields],
  };
}

function cloneDuplicateCandidate(record: DuplicateCandidateRecord): DuplicateCandidateRecord {
  return {
    ...record,
    evidence: record.evidence.map((entry) => ({ ...entry })),
  };
}

function cloneDuplicateDecision(record: DuplicateDecisionRecord): DuplicateDecisionRecord {
  return { ...record };
}
