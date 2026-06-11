import { Inject, Injectable } from "@nestjs/common";
import { ApiError, createResourceId } from "@fococontext/contracts";
import type { RuntimeConfig } from "@fococontext/core";

import { apiDatabaseMirrorToken, type ApiDatabaseMirror } from "../database/api-database-mirror.js";
import {
  operationalReadStoreToken,
  type OperationalReadStore,
} from "../database/operational-read-store.js";
import { defaultApiResourceScope, type ApiResourceScope } from "../auth/api-key.guard.js";
import { isApiResourceInScope } from "../auth/resource-scope.js";
import {
  createQueuedDeletionCleanupOperation,
  toDeletionCleanupOperationSummaryResponse,
} from "../deletion-cleanup/deletion-cleanup.response.js";
import type { DeletionCleanupOperationRecord } from "../deletion-cleanup/deletion-cleanup.types.js";
import { runtimeConfigToken } from "../runtime-config.provider.js";
import {
  deletionCleanupQueueToken,
  type DeletionCleanupQueue,
} from "../queues/deletion-cleanup.queue.js";
import type { JobDetailResponse, JobEventRecord, JobRecord } from "../documents/document.types.js";
import { reindexQueueToken, type ReindexQueue } from "../queues/reindex.queue.js";
import { wikiStoreToken, type WikiPageApiRecord, type WikiStore } from "../wiki/wiki-store.js";
import {
  findKnowledgeBaseTemplate,
  listKnowledgeBaseTemplates,
} from "./knowledge-base.templates.js";
import {
  toDatasetConfigurationRecordFromResponse,
  toKnowledgeBaseRecordFromResponse,
  toOperationalListError,
} from "./knowledge-base.operational-read.js";
import {
  cloneJsonObject,
  createDatasetConfigurationRecord,
  createDatasetConfigurationValues,
  createInitialSystemPages,
  createRetentionTimestamp,
  normalizeSlug,
  readForkOwner,
  readOptionalString,
  readRequiredName,
  readResetToTemplateFields,
  refreshSystemPages,
  renderMarkdownExportFile,
  systemPageOrder,
  throwForkTargetInvalid,
  throwValidationError,
  toDatasetConfigurationResponse,
  toJobDetailResponse,
  toKnowledgeBaseResponse,
  toSystemPageResponse,
  validateDatasetConfigurationValues,
  validatePurpose,
  validateWikiSchema,
} from "./knowledge-base.helpers.js";
import type {
  CreateKnowledgeBaseInput,
  DatasetConfigurationPresetResponse,
  DatasetConfigurationRecord,
  DatasetConfigurationResponse,
  DatasetConfigurationValues,
  DeletedForkResponse,
  DeletedKnowledgeBaseResponse,
  ForkSyncConflictResponse,
  ForkSyncResponse,
  KnowledgeBaseOutputLanguage,
  KnowledgeBaseRecord,
  KnowledgeBaseResponse,
  KnowledgeBaseTemplate,
  ListKnowledgeBaseForksResult,
  ListKnowledgeBaseInput,
  ListKnowledgeBaseResult,
  MarkdownContractValidationResponse,
  MarkdownExportResponse,
  ResolveKnowledgeBaseForkInput,
  ResolveKnowledgeBaseForkResponse,
  SyncKnowledgeBaseForkInput,
  SystemPageResponse,
  SystemPageRecord,
  UpdateDatasetConfigurationInput,
  UpdateKnowledgeBaseInput,
} from "./knowledge-base.types.js";

const defaultTemplate: KnowledgeBaseTemplate = "general";
const defaultOutputLanguage: KnowledgeBaseOutputLanguage = "auto";
const reindexJobType = "retrieval.reindex";
const queuedReindexMessage = "Queued retrieval index rebuild.";
const failedReindexMessage = "Retrieval index rebuild could not be queued.";

@Injectable()
export class KnowledgeBaseService {
  constructor(
    @Inject(apiDatabaseMirrorToken) private readonly databaseMirror: ApiDatabaseMirror,
    @Inject(operationalReadStoreToken) private readonly operationalReadStore: OperationalReadStore,
    @Inject(wikiStoreToken) private readonly wikiStore: WikiStore,
    @Inject(runtimeConfigToken) private readonly runtimeConfig: RuntimeConfig,
    @Inject(deletionCleanupQueueToken)
    private readonly deletionCleanupQueue: DeletionCleanupQueue,
    @Inject(reindexQueueToken)
    private readonly reindexQueue: ReindexQueue,
  ) {}

  async create(
    input: CreateKnowledgeBaseInput,
    scope: ApiResourceScope = defaultApiResourceScope,
  ): Promise<KnowledgeBaseResponse> {
    const now = new Date().toISOString();
    const name = readRequiredName(input.name);
    const templateId = input.template ?? defaultTemplate;
    const template = findKnowledgeBaseTemplate(templateId);
    const id = await this.createUniqueKnowledgeBaseId();
    const slug = input.slug === undefined ? normalizeSlug(name, id) : normalizeSlug(input.slug);

    if (template === undefined) {
      throw new ApiError("invalid_request", {
        messageKey: "api.validation.knowledge_base_template_invalid",
        details: {
          fields: ["template"],
        },
      });
    }

    await this.ensureSlugAvailable(slug, scope);

    const record: KnowledgeBaseRecord = {
      id,
      tenantId: scope.tenantId,
      projectId: scope.projectId,
      name,
      slug,
      knowledgeBaseType: "canonical",
      upstreamKnowledgeBaseId: null,
      upstreamBaseVersionId: null,
      upstreamSyncedVersionId: null,
      forkOwner: null,
      syncStatus: "not_applicable",
      template: template.id,
      outputLanguage: input.output_language ?? defaultOutputLanguage,
      status: "ready",
      currentVersionId: createResourceId("knowledgeVersion"),
      purpose: input.purpose === undefined ? template.purpose : validatePurpose(input.purpose),
      schema:
        input.schema === undefined
          ? cloneJsonObject(template.schema)
          : validateWikiSchema(input.schema),
      retrieval: cloneJsonObject(input.retrieval ?? template.retrieval),
      datasetConfiguration: createDatasetConfigurationRecord({
        knowledgeBaseId: id,
        presetId: template.id,
        values: createDatasetConfigurationValues(template, {
          ...(input.purpose === undefined ? {} : { purpose: validatePurpose(input.purpose) }),
          ...(input.schema === undefined ? {} : { schema: validateWikiSchema(input.schema) }),
          ...(input.retrieval === undefined ? {} : { retrieval: cloneJsonObject(input.retrieval) }),
          ...(input.output_language === undefined
            ? {}
            : { output_language: input.output_language }),
        }),
        timestamp: now,
      }),
      createdAt: now,
      updatedAt: now,
      systemPages: [],
    };

    if (input.description !== undefined) {
      record.description = input.description;
    }

    record.systemPages = createInitialSystemPages(record, now);

    const created = record;

    await this.databaseMirror.saveKnowledgeBase(created);

    return toKnowledgeBaseResponse(created);
  }

  async list(
    input: ListKnowledgeBaseInput,
    scope: ApiResourceScope = defaultApiResourceScope,
  ): Promise<ListKnowledgeBaseResult> {
    try {
      const dbResult = await this.operationalReadStore.listKnowledgeBases(scope, input);

      if (dbResult !== null) {
        return {
          items: dbResult.items,
          page: input.page,
          pageSize: input.pageSize,
          total: dbResult.total,
          hasMore: dbResult.hasMore,
        };
      }
    } catch (error) {
      throw toOperationalListError(error);
    }

    throw new ApiError("internal_error");
  }

  async get(
    id: string,
    scope: ApiResourceScope = defaultApiResourceScope,
  ): Promise<KnowledgeBaseResponse> {
    return toKnowledgeBaseResponse(await this.requireActiveRecord(id, scope));
  }

  async getFork(
    id: string,
    scope: ApiResourceScope = defaultApiResourceScope,
  ): Promise<KnowledgeBaseResponse> {
    return toKnowledgeBaseResponse(await this.requireForkRecord(id, scope));
  }

  async listForks(
    upstreamKnowledgeBaseId: string,
    input: ListKnowledgeBaseInput,
    scope: ApiResourceScope = defaultApiResourceScope,
  ): Promise<ListKnowledgeBaseForksResult> {
    const upstream = await this.requireForkableUpstreamResponse(upstreamKnowledgeBaseId, scope);

    try {
      const dbResult = await this.operationalReadStore.listKnowledgeBaseForks(scope, {
        ...input,
        upstreamKnowledgeBaseId: upstream.id,
      });

      if (dbResult !== null) {
        return {
          items: dbResult.items,
          page: input.page,
          pageSize: input.pageSize,
          total: dbResult.total,
          hasMore: dbResult.hasMore,
        };
      }
    } catch (error) {
      throw toOperationalListError(error);
    }

    throw new ApiError("internal_error");
  }

  async resolveFork(
    upstreamKnowledgeBaseId: string,
    input: ResolveKnowledgeBaseForkInput,
    scope: ApiResourceScope = defaultApiResourceScope,
  ): Promise<ResolveKnowledgeBaseForkResponse> {
    return this.resolveForkInternal(upstreamKnowledgeBaseId, input, scope);
  }

  async createFork(
    upstreamKnowledgeBaseId: string,
    input: ResolveKnowledgeBaseForkInput,
    scope: ApiResourceScope = defaultApiResourceScope,
  ): Promise<ResolveKnowledgeBaseForkResponse> {
    return this.resolveForkInternal(upstreamKnowledgeBaseId, input, scope);
  }

  private async resolveForkInternal(
    upstreamKnowledgeBaseId: string,
    input: ResolveKnowledgeBaseForkInput,
    scope: ApiResourceScope,
  ): Promise<ResolveKnowledgeBaseForkResponse> {
    const upstream = await this.requireForkableUpstream(upstreamKnowledgeBaseId, scope);

    const owner = readForkOwner(input);
    const existing = await this.findActiveForkForOwner(scope, upstream.id, owner);

    if (existing !== undefined) {
      return {
        created: false,
        fork: toKnowledgeBaseResponse(existing),
      };
    }

    const now = new Date().toISOString();
    const forkId = await this.createUniqueKnowledgeBaseId();
    const forkRecord: KnowledgeBaseRecord = {
      id: forkId,
      tenantId: scope.tenantId,
      projectId: scope.projectId,
      name: `${upstream.name} Fork`,
      slug: normalizeSlug(`${upstream.slug}-${owner.ownerType}-${owner.externalOwnerId}`, forkId),
      ...(upstream.description === undefined ? {} : { description: upstream.description }),
      knowledgeBaseType: "fork",
      upstreamKnowledgeBaseId: upstream.id,
      upstreamBaseVersionId: upstream.currentVersionId,
      upstreamSyncedVersionId: upstream.currentVersionId,
      forkOwner: owner,
      syncStatus: "synced",
      template: upstream.template,
      outputLanguage: upstream.outputLanguage,
      status: "ready",
      currentVersionId: upstream.currentVersionId,
      purpose: upstream.purpose,
      schema: cloneJsonObject(upstream.schema),
      retrieval: cloneJsonObject(upstream.retrieval),
      datasetConfiguration: createDatasetConfigurationRecord({
        knowledgeBaseId: forkId,
        presetId: upstream.datasetConfiguration.presetId,
        values: {
          ...cloneJsonObject(upstream.datasetConfiguration.values),
          purpose: upstream.purpose,
          schema: cloneJsonObject(upstream.schema),
          retrieval: cloneJsonObject(upstream.retrieval),
          output_language: upstream.outputLanguage,
        } as DatasetConfigurationValues,
        timestamp: now,
      }),
      createdAt: now,
      updatedAt: now,
      systemPages: [],
    };

    forkRecord.systemPages = createInitialSystemPages(forkRecord, now);

    let created: KnowledgeBaseRecord;

    try {
      created = forkRecord;
      await this.databaseMirror.saveKnowledgeBase(created);
    } catch (error) {
      const conflict = await this.findActiveForkForOwner(scope, upstream.id, owner);

      if (conflict !== undefined) {
        return {
          created: false,
          fork: toKnowledgeBaseResponse(conflict),
        };
      }

      throw error;
    }

    return {
      created: true,
      fork: toKnowledgeBaseResponse(created),
    };
  }

  private async findActiveForkForOwner(
    scope: ApiResourceScope,
    upstreamKnowledgeBaseId: string,
    owner: NonNullable<KnowledgeBaseRecord["forkOwner"]>,
  ): Promise<KnowledgeBaseRecord | undefined> {
    const dbResult = await this.operationalReadStore.listKnowledgeBaseForks(scope, {
      upstreamKnowledgeBaseId,
      page: 1,
      pageSize: 100,
    });
    const match = dbResult?.items.find(
      (record) =>
        record.fork_owner?.owner_type === owner.ownerType &&
        record.fork_owner.external_owner_id === owner.externalOwnerId,
    );

    return match === undefined
      ? undefined
      : toKnowledgeBaseRecordFromResponse(match, {
          datasetConfiguration: await this.requireDatasetConfigurationRecord(match.id, scope),
          systemPages: await this.listSystemPageRecords(match.id),
          scope,
        });
  }

  listDatasetConfigurationPresets(): DatasetConfigurationPresetResponse[] {
    return listKnowledgeBaseTemplates().map((template) => ({
      id: template.id,
      name: template.name,
      description: template.description,
      version: "2026-05-19",
      default_values: createDatasetConfigurationValues(template),
      validation: cloneJsonObject(template.dataset_configuration.validation),
    }));
  }

  async assertReadableKnowledgeBase(
    id: string,
    scope: ApiResourceScope = defaultApiResourceScope,
  ): Promise<void> {
    await this.requireActiveResponse(id, scope);
  }

  async assertReadableFork(
    id: string,
    scope: ApiResourceScope = defaultApiResourceScope,
  ): Promise<void> {
    const response = await this.requireActiveResponse(id, scope);

    if (response.knowledge_base_type !== "fork") {
      throwValidationError(["fork_id"]);
    }
  }

  async getResourceScope(id: string): Promise<ApiResourceScope | undefined> {
    return (await this.operationalReadStore.getKnowledgeBaseResourceScope(id)) ?? undefined;
  }

  async getDatasetConfiguration(
    id: string,
    scope: ApiResourceScope = defaultApiResourceScope,
  ): Promise<DatasetConfigurationResponse> {
    return toDatasetConfigurationResponse(
      (await this.requireActiveRecord(id, scope)).datasetConfiguration,
    );
  }

  async updateDatasetConfiguration(
    id: string,
    input: UpdateDatasetConfigurationInput,
    scope: ApiResourceScope = defaultApiResourceScope,
  ): Promise<DatasetConfigurationResponse> {
    const record = await this.requireLiveRecord(id, scope);
    const presetId = input.preset_id ?? record.datasetConfiguration.presetId;
    const template = findKnowledgeBaseTemplate(presetId);

    if (template === undefined) {
      throw new ApiError("invalid_request", {
        messageKey: "api.validation.dataset_configuration_preset_invalid",
        details: {
          fields: ["preset_id"],
        },
      });
    }

    const now = new Date().toISOString();
    const nextValues = validateDatasetConfigurationValues(
      {
        ...record.datasetConfiguration.values,
        ...(input.values ?? {}),
      },
      this.runtimeConfig.limits.ocr,
    );
    const nextConfiguration: DatasetConfigurationRecord = {
      ...record.datasetConfiguration,
      presetId,
      status: "active",
      version: record.datasetConfiguration.version + 1,
      values: nextValues,
      latestSnapshotId: createResourceId("datasetConfigurationSnapshot"),
      updatedAt: now,
      updatedBy: null,
      metadata: cloneJsonObject(input.metadata ?? record.datasetConfiguration.metadata),
    };

    record.purpose = nextValues.purpose;
    record.schema = cloneJsonObject(nextValues.schema);
    record.retrieval = cloneJsonObject(nextValues.retrieval);
    record.outputLanguage = nextValues.output_language;
    record.datasetConfiguration = nextConfiguration;
    record.updatedAt = now;
    record.systemPages = refreshSystemPages(record, now);

    const updated = record;

    await this.databaseMirror.updateKnowledgeBase(updated);

    return toDatasetConfigurationResponse(updated.datasetConfiguration);
  }

  async update(
    id: string,
    input: UpdateKnowledgeBaseInput,
    scope: ApiResourceScope = defaultApiResourceScope,
  ): Promise<KnowledgeBaseResponse> {
    const record = await this.requireLiveRecord(id, scope);
    const resetFields = readResetToTemplateFields(input.reset_to_template);
    const template = findKnowledgeBaseTemplate(record.template);
    let nextPurpose = record.purpose;
    let nextSchema = record.schema;

    if (template === undefined) {
      throw new ApiError("invalid_request", {
        messageKey: "api.validation.knowledge_base_template_invalid",
        details: {
          fields: ["template"],
        },
      });
    }

    if (input.name !== undefined) {
      record.name = readRequiredName(input.name);
    }
    if (input.description !== undefined) {
      record.description = input.description;
    }
    if (input.output_language !== undefined) {
      record.outputLanguage = input.output_language;
    }
    if (input.purpose !== undefined) {
      nextPurpose = validatePurpose(input.purpose);
    }
    if (input.schema !== undefined) {
      nextSchema = validateWikiSchema(input.schema);
    }
    if (resetFields.has("purpose")) {
      nextPurpose = template.purpose;
    }
    if (resetFields.has("schema")) {
      nextSchema = cloneJsonObject(template.schema);
    }
    if (input.retrieval !== undefined) {
      record.retrieval = cloneJsonObject(input.retrieval);
    }

    record.purpose = nextPurpose;
    record.schema = nextSchema;
    record.updatedAt = new Date().toISOString();
    record.systemPages = refreshSystemPages(record, record.updatedAt);

    const updated = record;

    await this.databaseMirror.updateKnowledgeBase(updated);

    return toKnowledgeBaseResponse(updated);
  }

  async delete(
    id: string,
    scope: ApiResourceScope = defaultApiResourceScope,
  ): Promise<DeletedKnowledgeBaseResponse> {
    const record = await this.requireActiveRecord(id, scope);
    const now = new Date().toISOString();

    await this.cancelOpenJobsForDeletedKnowledgeBase(id, now);
    record.status = "deleted";
    record.deletedAt = now;
    record.updatedAt = now;
    const updated = record;
    const createdCleanupOperation = createQueuedDeletionCleanupOperation({
      targetType: "knowledge_base",
      targetId: id,
      knowledgeBaseId: id,
      now,
      maxAttempts: this.runtimeConfig.limits.deletionCleanup.maxRetries + 1,
      retentionExpiresAt: createRetentionTimestamp(
        now,
        this.runtimeConfig.limits.deletionCleanup.operationRetentionDays,
      ),
      itemRetentionExpiresAt: createRetentionTimestamp(
        now,
        this.runtimeConfig.limits.deletionCleanup.itemRetentionDays,
      ),
    });

    await this.databaseMirror.updateKnowledgeBase(updated);
    await this.databaseMirror.markSourceDocumentsDeletedForKnowledgeBase(id, now);
    await this.databaseMirror.saveDeletionCleanupOperation(createdCleanupOperation);
    const queuedCleanupOperation =
      await this.enqueueDeletionCleanupOperation(createdCleanupOperation);

    return {
      id,
      status: "deleted",
      cleanup_operation: toDeletionCleanupOperationSummaryResponse(queuedCleanupOperation),
    };
  }

  async deleteFork(
    id: string,
    scope: ApiResourceScope = defaultApiResourceScope,
  ): Promise<DeletedForkResponse> {
    const record = await this.requireForkRecord(id, scope);
    const deleted = await this.delete(record.id, scope);

    return {
      id: deleted.id,
      status: deleted.status,
      cleanup: deleted.cleanup_operation,
    };
  }

  async syncFork(
    id: string,
    input: SyncKnowledgeBaseForkInput = {},
    scope: ApiResourceScope = defaultApiResourceScope,
  ): Promise<ForkSyncResponse> {
    const fork = await this.requireForkRecord(id, scope);
    const upstream =
      fork.upstreamKnowledgeBaseId === null
        ? undefined
        : await this.requireActiveRecord(fork.upstreamKnowledgeBaseId, scope).catch(
            () => undefined,
          );

    if (
      upstream === undefined ||
      !isApiResourceInScope(upstream, scope) ||
      upstream.deletedAt !== undefined ||
      upstream.status === "deleted" ||
      upstream.knowledgeBaseType !== "canonical"
    ) {
      throwForkTargetInvalid(fork.upstreamKnowledgeBaseId ?? id);
    }

    const sourceUpstreamVersionId = fork.upstreamSyncedVersionId;
    const targetUpstreamVersionId =
      input.target_upstream_version_id === undefined || input.target_upstream_version_id === null
        ? upstream.currentVersionId
        : input.target_upstream_version_id;
    const knownVersionIds = await this.listKnownUpstreamVersionIds(upstream.id);

    knownVersionIds.add(upstream.currentVersionId);
    if (sourceUpstreamVersionId !== null) {
      knownVersionIds.add(sourceUpstreamVersionId);
    }
    if (!knownVersionIds.has(targetUpstreamVersionId)) {
      throw new ApiError("version_not_found", {
        details: {
          target_upstream_version_id: targetUpstreamVersionId,
        },
      });
    }

    if (sourceUpstreamVersionId === targetUpstreamVersionId) {
      return {
        fork_id: fork.id,
        sync_status: "synced",
        operation_id: null,
        change_set_id: null,
        source_upstream_version_id: sourceUpstreamVersionId,
        target_upstream_version_id: targetUpstreamVersionId,
        current_fork_version_id: fork.currentVersionId,
        conflicts: [],
      };
    }

    const conflicts = await this.detectForkSyncConflicts(upstream.id, fork.id);
    const syncResult = await this.wikiStore.syncForkFromUpstream({
      forkId: fork.id,
      upstreamKnowledgeBaseId: upstream.id,
      sourceUpstreamVersionId,
      targetUpstreamVersionId,
      baseForkVersionId: fork.currentVersionId,
      conflicts,
    });
    const now = new Date().toISOString();
    const updated: KnowledgeBaseRecord = {
      ...fork,
      upstreamSyncedVersionId: targetUpstreamVersionId,
      syncStatus: "synced",
      currentVersionId: syncResult.knowledgeVersionId,
      updatedAt: now,
    };

    await this.databaseMirror.updateKnowledgeBase(updated);

    return {
      fork_id: updated.id,
      sync_status: updated.syncStatus === "not_applicable" ? "synced" : updated.syncStatus,
      operation_id: null,
      change_set_id: syncResult.changeSetId,
      source_upstream_version_id: sourceUpstreamVersionId,
      target_upstream_version_id: targetUpstreamVersionId,
      current_fork_version_id: updated.currentVersionId,
      conflicts,
    };
  }

  private async listKnownUpstreamVersionIds(knowledgeBaseId: string): Promise<Set<string>> {
    const versions = await this.wikiStore.listKnowledgeVersions(knowledgeBaseId);
    const ids = new Set<string>();

    for (const version of versions) {
      const versionId =
        readOptionalString(version.version_id) ??
        readOptionalString(version.id) ??
        readOptionalString(version.knowledge_version_id);

      if (versionId !== undefined) {
        ids.add(versionId);
      }
    }

    return ids;
  }

  private async detectForkSyncConflicts(
    upstreamKnowledgeBaseId: string,
    forkId: string,
  ): Promise<ForkSyncConflictResponse[]> {
    const [upstreamPages, forkPages] = await Promise.all([
      this.wikiStore.listPages(upstreamKnowledgeBaseId),
      this.wikiStore.listPages(forkId),
    ]);
    const upstreamBySlug = new Map(
      upstreamPages.map((page) => [page.slug, page] satisfies [string, WikiPageApiRecord]),
    );
    const conflicts: ForkSyncConflictResponse[] = [];

    for (const forkPage of forkPages) {
      if (forkPage.visibility_origin !== "fork_owned") {
        continue;
      }

      const upstreamPage = upstreamBySlug.get(forkPage.slug);

      if (upstreamPage === undefined) {
        continue;
      }

      conflicts.push({
        type: "fork_page_conflict",
        upstream_page_id: upstreamPage.id,
        fork_page_id: forkPage.id,
        slug: forkPage.slug,
        title: forkPage.title,
      });
    }

    return conflicts;
  }

  private async cancelOpenJobsForDeletedKnowledgeBase(
    knowledgeBaseId: string,
    now: string,
  ): Promise<void> {
    const message = "Canceled because the knowledge base was deleted.";
    const jobs: JobRecord[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const result = await this.operationalReadStore.listJobs({
        knowledgeBaseId,
        page,
        pageSize: 500,
      });

      if (result === null) {
        throw new ApiError("internal_error");
      }

      jobs.push(...result.items);
      hasMore = result.hasMore;
      page += 1;
    }

    const openJobs = jobs.filter((job) => job.status === "queued" || job.status === "running");

    for (const job of openJobs) {
      const updated: JobRecord = {
        ...job,
        status: "canceled",
        progressMessage: message,
        updatedAt: now,
      };
      const event: JobEventRecord = {
        jobId: updated.id,
        type: "job.canceled",
        stage: updated.stage,
        status: updated.status,
        message,
        metadata: {
          knowledge_base_deleted: true,
        },
        createdAt: now,
      };

      await this.databaseMirror.updateJob(updated);
      await this.databaseMirror.appendJobEvent(event);
    }
  }

  private async enqueueDeletionCleanupOperation(
    operation: DeletionCleanupOperationRecord,
  ): Promise<DeletionCleanupOperationRecord> {
    const now = new Date().toISOString();

    try {
      const enqueued = await this.deletionCleanupQueue.enqueueDeletionCleanupJob({
        operation_id: operation.id,
      });
      const updated: DeletionCleanupOperationRecord = {
        ...operation,
        queueJobId: enqueued.job_id,
        lastError: null,
        updatedAt: now,
      };

      await this.databaseMirror.updateDeletionCleanupOperation(updated);

      return updated;
    } catch (error) {
      const updated: DeletionCleanupOperationRecord = {
        ...operation,
        lastError: {
          message: "Cleanup queue enqueue failed.",
          detail: error instanceof Error ? error.message : "Unknown cleanup queue error.",
        },
        updatedAt: now,
      };

      await this.databaseMirror.updateDeletionCleanupOperation(updated);

      return updated;
    }
  }

  async rebuildIndexes(
    id: string,
    scope: ApiResourceScope = defaultApiResourceScope,
  ): Promise<JobDetailResponse> {
    const record = await this.requireActiveRecord(id, scope);
    const now = new Date().toISOString();
    const job: JobRecord = {
      id: createResourceId("ingestJob"),
      knowledgeBaseId: record.id,
      documentId: null,
      jobType: reindexJobType,
      stage: "indexing",
      status: "queued",
      progress: 5,
      progressMessage: queuedReindexMessage,
      contentHash: `reindex:${record.id}:${record.currentVersionId}`,
      idempotencyKey: null,
      deduped: false,
      lockedByKnowledgeBaseId: record.id,
      inputSnapshotId: record.currentVersionId ?? record.id,
      retryOfJobId: null,
      parsedContentId: null,
      changeSetId: null,
      error: null,
      createdAt: now,
      updatedAt: now,
    };
    const event = createReindexJobEvent(job, {
      requested_knowledge_version_id: record.currentVersionId,
    });
    const events = [event];

    await this.databaseMirror.saveJob(job);
    await this.databaseMirror.appendJobEvent(event);

    try {
      await this.reindexQueue.enqueueReindexJob({
        job_id: job.id,
        knowledge_base_id: record.id,
        requested_knowledge_version_id: record.currentVersionId,
      });
    } catch (error) {
      const failed: JobRecord = {
        ...job,
        status: "failed",
        progressMessage: failedReindexMessage,
        error: {
          code: "retrieval_reindex_enqueue_failed",
          message: error instanceof Error ? error.message : "Unknown queue enqueue error.",
          retryable: true,
        },
        updatedAt: new Date().toISOString(),
      };
      const failedEvent = createReindexJobEvent(failed, {
        requested_knowledge_version_id: record.currentVersionId,
      });

      await this.databaseMirror.updateJob(failed);
      await this.databaseMirror.appendJobEvent(failedEvent);

      return toJobDetailResponse(failed, [event, failedEvent]);
    }

    return toJobDetailResponse(job, events);
  }

  async listSystemPages(
    id: string,
    scope: ApiResourceScope = defaultApiResourceScope,
  ): Promise<SystemPageResponse[]> {
    return (await this.requireActiveRecord(id, scope)).systemPages.map(toSystemPageResponse);
  }

  async getSystemPage(
    id: string,
    type: string,
    scope: ApiResourceScope = defaultApiResourceScope,
  ): Promise<SystemPageResponse> {
    const record = await this.requireActiveRecord(id, scope);
    const systemPage = record.systemPages.find((page) => page.type === type);

    if (systemPage === undefined) {
      throw new ApiError("page_not_found");
    }

    return toSystemPageResponse(systemPage);
  }

  async validateMarkdownContract(
    id: string,
    scope: ApiResourceScope = defaultApiResourceScope,
  ): Promise<MarkdownContractValidationResponse> {
    const record = await this.requireActiveRecord(id, scope);
    const systemPageTypes = new Set(record.systemPages.map((page) => page.type));
    const missingSystemPages = systemPageOrder.filter((type) => !systemPageTypes.has(type));
    const issues = missingSystemPages.map((type) => ({
      field: `system_pages.${type}`,
      message: "Required system page is missing.",
    }));
    const systemPagesPassed = issues.length === 0;

    return {
      valid: systemPagesPassed,
      issues,
      checks: {
        frontmatter: "passed",
        wikilinks: "passed",
        system_pages: systemPagesPassed ? "passed" : "failed",
        export: systemPagesPassed ? "passed" : "failed",
      },
    };
  }

  async exportMarkdown(
    id: string,
    input: { format: "single_file" | "zip"; includeSources: boolean },
    scope: ApiResourceScope = defaultApiResourceScope,
  ): Promise<MarkdownExportResponse> {
    const record = await this.requireActiveRecord(id, scope);
    const files = record.systemPages.map((page) => ({
      path: `${page.type}.md`,
      content: renderMarkdownExportFile(page, input.includeSources),
    }));

    return {
      knowledge_base_id: record.id,
      format: input.format,
      include_sources: input.includeSources,
      files,
      content: files.map((file) => file.content).join("\n\n"),
    };
  }

  private async createUniqueKnowledgeBaseId(): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const id = createResourceId("knowledgeBase");

      if ((await this.operationalReadStore.getKnowledgeBaseResourceScope(id)) === null) {
        return id;
      }
    }

    throw new ApiError("resource_conflict", {
      details: {
        resource_type: "knowledge_base",
        field: "id",
      },
    });
  }

  private async ensureSlugAvailable(slug: string, scope: ApiResourceScope): Promise<void> {
    const result = await this.operationalReadStore.listKnowledgeBases(scope, {
      page: 1,
      pageSize: 100,
      keyword: slug,
    });
    const conflict = result?.items.find((record) => record.slug === slug);

    if (conflict !== undefined) {
      throw new ApiError("resource_conflict", {
        messageKey: "api.validation.knowledge_base_slug_conflict",
        details: {
          resource_type: "knowledge_base",
          field: "slug",
          value: slug,
        },
      });
    }
  }

  private async requireActiveRecord(
    id: string,
    scope: ApiResourceScope = defaultApiResourceScope,
  ): Promise<KnowledgeBaseRecord> {
    const response = await this.requireActiveResponse(id, scope);

    return toKnowledgeBaseRecordFromResponse(response, {
      datasetConfiguration: await this.requireDatasetConfigurationRecord(id, scope),
      systemPages: await this.listSystemPageRecords(id),
      scope,
    });
  }

  private async requireForkRecord(
    id: string,
    scope: ApiResourceScope = defaultApiResourceScope,
  ): Promise<KnowledgeBaseRecord> {
    const record = await this.requireActiveRecord(id, scope);

    if (record.knowledgeBaseType !== "fork") {
      throwValidationError(["fork_id"]);
    }

    return record;
  }

  private async requireForkableUpstream(
    id: string,
    scope: ApiResourceScope = defaultApiResourceScope,
  ): Promise<KnowledgeBaseRecord> {
    const record = await this.requireActiveRecord(id, scope);

    if (record.knowledgeBaseType !== "canonical") {
      throwForkTargetInvalid(record.id);
    }

    const cleanupOperation = await this.findLatestKnowledgeBaseCleanupOperation(id, scope);

    if (
      cleanupOperation !== undefined &&
      (cleanupOperation.status === "queued" || cleanupOperation.status === "running")
    ) {
      throw new ApiError("resource_cleanup_pending", {
        details: {
          target_type: "knowledge_base",
          target_id: id,
          cleanup_operation_id: cleanupOperation.id,
          guidance: "Wait for cleanup to complete before creating a fork.",
        },
      });
    }

    return record;
  }

  private async requireForkableUpstreamResponse(
    id: string,
    scope: ApiResourceScope = defaultApiResourceScope,
  ): Promise<KnowledgeBaseResponse> {
    const response = await this.requireActiveResponse(id, scope);

    if (response.knowledge_base_type !== "canonical") {
      throwForkTargetInvalid(response.id);
    }

    const cleanupOperation = await this.findLatestKnowledgeBaseCleanupOperation(id, scope);

    if (
      cleanupOperation !== undefined &&
      (cleanupOperation.status === "queued" || cleanupOperation.status === "running")
    ) {
      throw new ApiError("resource_cleanup_pending", {
        details: {
          target_type: "knowledge_base",
          target_id: id,
          cleanup_operation_id: cleanupOperation.id,
          guidance: "Wait for cleanup to complete before creating a fork.",
        },
      });
    }

    return response;
  }

  private async requireLiveRecord(
    id: string,
    scope: ApiResourceScope = defaultApiResourceScope,
  ): Promise<KnowledgeBaseRecord> {
    return this.requireActiveRecord(id, scope);
  }

  private async requireActiveResponse(
    id: string,
    scope: ApiResourceScope,
  ): Promise<KnowledgeBaseResponse> {
    const response = await this.operationalReadStore.getKnowledgeBaseById(scope, id);

    if (response === null) {
      await this.throwDeletedKnowledgeBaseIfPresent(id, scope);
      throw new ApiError("knowledge_base_not_found");
    }

    return response;
  }

  private async requireDatasetConfigurationRecord(
    id: string,
    scope: ApiResourceScope,
  ): Promise<DatasetConfigurationRecord> {
    const configuration = await this.operationalReadStore.getDatasetConfigurationByKnowledgeBaseId(
      scope,
      id,
    );

    if (configuration === null) {
      throw new ApiError("internal_error");
    }

    return toDatasetConfigurationRecordFromResponse(configuration);
  }

  private async listSystemPageRecords(id: string): Promise<SystemPageRecord[]> {
    const pagination = await this.wikiStore.listSystemPagesPaginated(id, {
      page: 1,
      pageSize: Math.max(systemPageOrder.length, 20),
    });
    const order = new Map(systemPageOrder.map((type, index) => [type, index]));

    return [...pagination.items].sort((left, right) => {
      const leftOrder = order.get(left.type) ?? systemPageOrder.length;
      const rightOrder = order.get(right.type) ?? systemPageOrder.length;

      return leftOrder - rightOrder || left.id.localeCompare(right.id);
    });
  }

  private async throwDeletedKnowledgeBaseIfPresent(
    id: string,
    scope: ApiResourceScope,
  ): Promise<never | void> {
    const cleanupOperation = await this.findLatestKnowledgeBaseCleanupOperation(id, scope);

    if (cleanupOperation !== undefined) {
      throw new ApiError("resource_deleted", {
        details: {
          target_type: "knowledge_base",
          target_id: id,
          cleanup_operation_id: cleanupOperation.id,
          guidance: "Reload the resource list and select an active knowledge base.",
        },
      });
    }
  }

  private async findLatestKnowledgeBaseCleanupOperation(
    id: string,
    scope: ApiResourceScope,
  ): Promise<DeletionCleanupOperationRecord | undefined> {
    const result = await this.operationalReadStore.listDeletionCleanupOperations(scope, {
      knowledgeBaseId: id,
      page: 1,
      pageSize: 50,
    });

    return result?.items.find(
      (operation) => operation.targetType === "knowledge_base" && operation.targetId === id,
    );
  }
}

function createReindexJobEvent(job: JobRecord, metadata: Record<string, unknown>): JobEventRecord {
  return {
    jobId: job.id,
    type: job.status === "failed" ? "job.failed" : "job.queued",
    stage: job.stage,
    status: job.status,
    message: job.progressMessage,
    metadata: {
      ...metadata,
      job_type: reindexJobType,
      rebuild_kind: "retrieval_index",
    },
    createdAt: job.updatedAt,
  };
}
