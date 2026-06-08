import { Inject, Injectable } from "@nestjs/common";
import { ApiError, createResourceId } from "@fococontext/contracts";
import type { RuntimeConfig } from "@fococontext/core";

import { apiDatabaseMirrorToken, type ApiDatabaseMirror } from "../database/api-database-mirror.js";
import { defaultApiResourceScope, type ApiResourceScope } from "../auth/api-key.guard.js";
import { isApiResourceInScope, requireScopedKnowledgeBase } from "../auth/resource-scope.js";
import {
  createQueuedDeletionCleanupOperation,
  toDeletionCleanupOperationSummaryResponse,
} from "../deletion-cleanup/deletion-cleanup.response.js";
import {
  applyManifestToOperation,
  DeletionCleanupManifestCollector,
} from "../deletion-cleanup/deletion-cleanup.manifest.js";
import { DeletionCleanupRepository } from "../deletion-cleanup/deletion-cleanup.repository.js";
import { DocumentRepository } from "../documents/document.repository.js";
import { runtimeConfigToken } from "../runtime-config.provider.js";
import {
  deletionCleanupQueueToken,
  type DeletionCleanupQueue,
} from "../queues/deletion-cleanup.queue.js";
import type { JobDetailResponse } from "../documents/document.types.js";
import {
  retrievalEmbeddingProviderToken,
  type ApiRetrievalEmbeddingProvider,
} from "../retrieve/retrieve.provider.js";
import { wikiStoreToken, type WikiPageApiRecord, type WikiStore } from "../wiki/wiki-store.js";
import { KnowledgeBaseRepository } from "./knowledge-base.repository.js";
import {
  findKnowledgeBaseTemplate,
  listKnowledgeBaseTemplates,
} from "./knowledge-base.templates.js";
import {
  cloneJsonObject,
  createCompletedIndexJobEvent,
  createDatasetConfigurationRecord,
  createDatasetConfigurationValues,
  createInitialSystemPages,
  createRetentionTimestamp,
  filterByKeyword,
  filterByStatus,
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
  toDocumentKnowledgeBaseScope,
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
  UpdateDatasetConfigurationInput,
  UpdateKnowledgeBaseInput,
} from "./knowledge-base.types.js";

const defaultTemplate: KnowledgeBaseTemplate = "general";
const defaultOutputLanguage: KnowledgeBaseOutputLanguage = "auto";

@Injectable()
export class KnowledgeBaseService {
  constructor(
    private readonly repository: KnowledgeBaseRepository,
    private readonly documentRepository: DocumentRepository,
    private readonly deletionCleanupRepository: DeletionCleanupRepository,
    private readonly deletionCleanupManifestCollector: DeletionCleanupManifestCollector,
    @Inject(apiDatabaseMirrorToken) private readonly databaseMirror: ApiDatabaseMirror,
    @Inject(wikiStoreToken) private readonly wikiStore: WikiStore,
    @Inject(retrievalEmbeddingProviderToken)
    private readonly embeddingProvider: ApiRetrievalEmbeddingProvider,
    @Inject(runtimeConfigToken) private readonly runtimeConfig: RuntimeConfig,
    @Inject(deletionCleanupQueueToken)
    private readonly deletionCleanupQueue: DeletionCleanupQueue,
  ) {}

  async create(
    input: CreateKnowledgeBaseInput,
    scope: ApiResourceScope = defaultApiResourceScope,
  ): Promise<KnowledgeBaseResponse> {
    const now = new Date().toISOString();
    const name = readRequiredName(input.name);
    const templateId = input.template ?? defaultTemplate;
    const template = findKnowledgeBaseTemplate(templateId);
    const id = this.createUniqueKnowledgeBaseId();
    const slug = input.slug === undefined ? normalizeSlug(name, id) : normalizeSlug(input.slug);

    if (template === undefined) {
      throw new ApiError("invalid_request", {
        messageKey: "api.validation.knowledge_base_template_invalid",
        details: {
          fields: ["template"],
        },
      });
    }

    this.ensureSlugAvailable(slug, scope);

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

    const created = this.repository.create(record);

    this.documentRepository.upsertKnowledgeBaseScope(toDocumentKnowledgeBaseScope(created));
    await this.databaseMirror.saveKnowledgeBase(created);

    return toKnowledgeBaseResponse(created);
  }

  list(
    input: ListKnowledgeBaseInput,
    scope: ApiResourceScope = defaultApiResourceScope,
  ): ListKnowledgeBaseResult {
    const keyword = input.keyword?.trim().toLowerCase();
    const filtered = this.repository
      .list()
      .filter((record) => isApiResourceInScope(record, scope))
      .filter((record) => record.deletedAt === undefined)
      .filter((record) => filterByStatus(record, input.status))
      .filter((record) => filterByKeyword(record, keyword))
      .sort((left, right) =>
        compareUpdatedAtDesc(left.updatedAt, left.id, right.updatedAt, right.id),
      );
    const start = (input.page - 1) * input.pageSize;
    const end = start + input.pageSize;
    const items = filtered.slice(start, end).map(toKnowledgeBaseResponse);

    return {
      items,
      page: input.page,
      pageSize: input.pageSize,
      total: filtered.length,
      hasMore: end < filtered.length,
    };
  }

  get(id: string, scope: ApiResourceScope = defaultApiResourceScope): KnowledgeBaseResponse {
    return toKnowledgeBaseResponse(this.requireActiveRecord(id, scope));
  }

  getFork(id: string, scope: ApiResourceScope = defaultApiResourceScope): KnowledgeBaseResponse {
    return toKnowledgeBaseResponse(this.requireForkRecord(id, scope));
  }

  listForks(
    upstreamKnowledgeBaseId: string,
    input: ListKnowledgeBaseInput,
    scope: ApiResourceScope = defaultApiResourceScope,
  ): ListKnowledgeBaseForksResult {
    const upstream = this.requireForkableUpstream(upstreamKnowledgeBaseId, scope);

    const keyword = input.keyword?.trim().toLowerCase();
    const filtered = this.repository
      .list()
      .filter((record) => isApiResourceInScope(record, scope))
      .filter((record) => record.deletedAt === undefined)
      .filter((record) => record.status !== "deleted")
      .filter((record) => record.knowledgeBaseType === "fork")
      .filter((record) => record.upstreamKnowledgeBaseId === upstream.id)
      .filter((record) => filterByStatus(record, input.status))
      .filter((record) => filterByKeyword(record, keyword))
      .sort((left, right) =>
        compareUpdatedAtDesc(left.updatedAt, left.id, right.updatedAt, right.id),
      );
    const start = (input.page - 1) * input.pageSize;
    const end = start + input.pageSize;

    return {
      items: filtered.slice(start, end).map(toKnowledgeBaseResponse),
      page: input.page,
      pageSize: input.pageSize,
      total: filtered.length,
      hasMore: end < filtered.length,
    };
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
    const upstream = this.requireForkableUpstream(upstreamKnowledgeBaseId, scope);

    const owner = readForkOwner(input);
    const existing = this.findActiveForkForOwner(scope, upstream.id, owner);

    if (existing !== undefined) {
      return {
        created: false,
        fork: toKnowledgeBaseResponse(existing),
      };
    }

    const now = new Date().toISOString();
    const forkId = this.createUniqueKnowledgeBaseId();
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
      created = this.repository.create(forkRecord);
    } catch (error) {
      const conflict = this.findActiveForkForOwner(scope, upstream.id, owner);

      if (
        error instanceof ApiError &&
        error.code === "resource_conflict" &&
        conflict !== undefined
      ) {
        return {
          created: false,
          fork: toKnowledgeBaseResponse(conflict),
        };
      }

      throw error;
    }

    this.documentRepository.upsertKnowledgeBaseScope(toDocumentKnowledgeBaseScope(created));
    await this.databaseMirror.saveKnowledgeBase(created);

    return {
      created: true,
      fork: toKnowledgeBaseResponse(created),
    };
  }

  private findActiveForkForOwner(
    scope: ApiResourceScope,
    upstreamKnowledgeBaseId: string,
    owner: NonNullable<KnowledgeBaseRecord["forkOwner"]>,
  ): KnowledgeBaseRecord | undefined {
    return this.repository
      .list()
      .find(
        (record) =>
          isApiResourceInScope(record, scope) &&
          record.deletedAt === undefined &&
          record.status !== "deleted" &&
          record.knowledgeBaseType === "fork" &&
          record.upstreamKnowledgeBaseId === upstreamKnowledgeBaseId &&
          record.forkOwner?.ownerType === owner.ownerType &&
          record.forkOwner.externalOwnerId === owner.externalOwnerId,
      );
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

  assertReadableKnowledgeBase(id: string, scope: ApiResourceScope = defaultApiResourceScope): void {
    this.requireActiveRecord(id, scope);
  }

  assertReadableFork(id: string, scope: ApiResourceScope = defaultApiResourceScope): void {
    this.requireForkRecord(id, scope);
  }

  getResourceScope(id: string): ApiResourceScope | undefined {
    const record = this.repository.findById(id);

    if (record === undefined) {
      return undefined;
    }

    return {
      projectId: record.projectId,
      tenantId: record.tenantId,
    };
  }

  getDatasetConfiguration(
    id: string,
    scope: ApiResourceScope = defaultApiResourceScope,
  ): DatasetConfigurationResponse {
    return toDatasetConfigurationResponse(this.requireActiveRecord(id, scope).datasetConfiguration);
  }

  async updateDatasetConfiguration(
    id: string,
    input: UpdateDatasetConfigurationInput,
    scope: ApiResourceScope = defaultApiResourceScope,
  ): Promise<DatasetConfigurationResponse> {
    const record = this.requireLiveRecord(id, scope);
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

    const updated = this.repository.update(record);

    await this.databaseMirror.updateKnowledgeBase(updated);

    return toDatasetConfigurationResponse(updated.datasetConfiguration);
  }

  async update(
    id: string,
    input: UpdateKnowledgeBaseInput,
    scope: ApiResourceScope = defaultApiResourceScope,
  ): Promise<KnowledgeBaseResponse> {
    const record = this.requireLiveRecord(id, scope);
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

    const updated = this.repository.update(record);

    await this.databaseMirror.updateKnowledgeBase(updated);

    return toKnowledgeBaseResponse(updated);
  }

  async delete(
    id: string,
    scope: ApiResourceScope = defaultApiResourceScope,
  ): Promise<DeletedKnowledgeBaseResponse> {
    const record = this.requireActiveRecord(id, scope);
    const now = new Date().toISOString();

    await this.cancelOpenJobsForDeletedKnowledgeBase(id, now);
    record.status = "deleted";
    record.deletedAt = now;
    record.updatedAt = now;
    const updated = this.repository.update(record);
    const createdCleanupOperation = this.deletionCleanupRepository.createOperation(
      createQueuedDeletionCleanupOperation({
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
      }),
    );
    const manifest = this.deletionCleanupManifestCollector.collectKnowledgeBaseManifest({
      knowledgeBaseId: id,
      knowledgeBaseType: record.knowledgeBaseType,
      operationId: createdCleanupOperation.id,
      now,
      maxAttempts: createdCleanupOperation.maxAttempts,
      retainedUntil: createdCleanupOperation.itemRetentionExpiresAt,
    });
    const cleanupOperation = this.deletionCleanupRepository.updateOperation(
      applyManifestToOperation(createdCleanupOperation, manifest),
    );

    this.deletionCleanupRepository.replaceItemsForOperation(cleanupOperation.id, manifest.items);

    await this.databaseMirror.updateKnowledgeBase(updated);
    await this.databaseMirror.saveDeletionCleanupOperation(cleanupOperation);
    await this.databaseMirror.saveDeletionCleanupItems(manifest.items);
    const queuedCleanupOperation = await this.enqueueDeletionCleanupOperation(cleanupOperation);

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
    const record = this.requireForkRecord(id, scope);
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
    const fork = this.requireForkRecord(id, scope);
    const upstream =
      fork.upstreamKnowledgeBaseId === null
        ? undefined
        : this.repository.findById(fork.upstreamKnowledgeBaseId);

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
    const updated = this.repository.update({
      ...fork,
      upstreamSyncedVersionId: targetUpstreamVersionId,
      syncStatus: "synced",
      currentVersionId: syncResult.knowledgeVersionId,
      updatedAt: now,
    });

    this.documentRepository.upsertKnowledgeBaseScope(toDocumentKnowledgeBaseScope(updated));
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
    const openJobs = this.documentRepository
      .listJobs(knowledgeBaseId)
      .filter((job) => job.status === "queued" || job.status === "running");

    for (const job of openJobs) {
      const updated = this.documentRepository.updateJob({
        ...job,
        status: "canceled",
        progressMessage: message,
        updatedAt: now,
      });
      const event = this.documentRepository.appendJobEvent({
        jobId: updated.id,
        type: "job.canceled",
        stage: updated.stage,
        status: updated.status,
        message,
        metadata: {
          knowledge_base_deleted: true,
        },
        createdAt: now,
      });

      await this.databaseMirror.updateJob(updated);
      await this.databaseMirror.appendJobEvent(event);
    }
  }

  private async enqueueDeletionCleanupOperation(
    operation: ReturnType<DeletionCleanupRepository["updateOperation"]>,
  ): Promise<ReturnType<DeletionCleanupRepository["updateOperation"]>> {
    const now = new Date().toISOString();

    try {
      const enqueued = await this.deletionCleanupQueue.enqueueDeletionCleanupJob({
        operation_id: operation.id,
      });
      const updated = this.deletionCleanupRepository.updateOperation({
        ...operation,
        queueJobId: enqueued.job_id,
        lastError: null,
        updatedAt: now,
      });

      await this.databaseMirror.updateDeletionCleanupOperation(updated);

      return updated;
    } catch (error) {
      const updated = this.deletionCleanupRepository.updateOperation({
        ...operation,
        lastError: {
          message: "Cleanup queue enqueue failed.",
          detail: error instanceof Error ? error.message : "Unknown cleanup queue error.",
        },
        updatedAt: now,
      });

      await this.databaseMirror.updateDeletionCleanupOperation(updated);

      return updated;
    }
  }

  async rebuildIndexes(
    id: string,
    scope: ApiResourceScope = defaultApiResourceScope,
  ): Promise<JobDetailResponse> {
    const record = this.requireActiveRecord(id, scope);
    const now = new Date().toISOString();
    const indexStats = await this.wikiStore.rebuildRetrievalIndex(
      record.id,
      this.embeddingProvider,
    );
    const job = this.documentRepository.createJob({
      id: createResourceId("ingestJob"),
      knowledgeBaseId: record.id,
      documentId: null,
      stage: "indexing",
      status: "completed",
      progress: 100,
      progressMessage: "Indexes rebuilt.",
      contentHash: `reindex:${record.id}:${record.currentVersionId}`,
      idempotencyKey: null,
      deduped: false,
      lockedByKnowledgeBaseId: record.id,
      inputSnapshotId: record.currentVersionId,
      retryOfJobId: null,
      parsedContentId: null,
      changeSetId: null,
      error: null,
      createdAt: now,
      updatedAt: now,
    });
    const event = createCompletedIndexJobEvent(job, indexStats);
    const events = this.documentRepository.replaceJobEvents(job.id, [event]);

    await this.databaseMirror.saveJob(job);
    await this.databaseMirror.appendJobEvent(event);

    return toJobDetailResponse(job, events);
  }

  listSystemPages(
    id: string,
    scope: ApiResourceScope = defaultApiResourceScope,
  ): SystemPageResponse[] {
    return this.requireActiveRecord(id, scope).systemPages.map(toSystemPageResponse);
  }

  getSystemPage(
    id: string,
    type: string,
    scope: ApiResourceScope = defaultApiResourceScope,
  ): SystemPageResponse {
    const record = this.requireActiveRecord(id, scope);
    const systemPage = record.systemPages.find((page) => page.type === type);

    if (systemPage === undefined) {
      throw new ApiError("page_not_found");
    }

    return toSystemPageResponse(systemPage);
  }

  validateMarkdownContract(
    id: string,
    scope: ApiResourceScope = defaultApiResourceScope,
  ): MarkdownContractValidationResponse {
    const record = this.requireActiveRecord(id, scope);
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

  exportMarkdown(
    id: string,
    input: { format: "single_file" | "zip"; includeSources: boolean },
    scope: ApiResourceScope = defaultApiResourceScope,
  ): MarkdownExportResponse {
    const record = this.requireActiveRecord(id, scope);
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

  private createUniqueKnowledgeBaseId(): string {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const id = createResourceId("knowledgeBase");

      if (this.repository.findById(id) === undefined) {
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

  private ensureSlugAvailable(slug: string, scope: ApiResourceScope): void {
    const conflict = this.repository
      .list()
      .find(
        (record) =>
          isApiResourceInScope(record, scope) &&
          record.deletedAt === undefined &&
          record.status !== "deleted" &&
          record.slug === slug,
      );

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

  private requireActiveRecord(
    id: string,
    scope: ApiResourceScope = defaultApiResourceScope,
  ): KnowledgeBaseRecord {
    const record = this.repository.findById(id);
    const scopedRecord = requireScopedKnowledgeBase(record, scope);

    if (scopedRecord.deletedAt !== undefined || scopedRecord.status === "deleted") {
      const cleanupOperation = this.deletionCleanupRepository.findLatestOperationForTarget({
        targetType: "knowledge_base",
        targetId: id,
      });

      throw new ApiError("resource_deleted", {
        details: {
          target_type: "knowledge_base",
          target_id: id,
          cleanup_operation_id: cleanupOperation?.id ?? null,
          guidance: "Reload the resource list and select an active knowledge base.",
        },
      });
    }

    return scopedRecord;
  }

  private requireForkRecord(
    id: string,
    scope: ApiResourceScope = defaultApiResourceScope,
  ): KnowledgeBaseRecord {
    const record = this.requireActiveRecord(id, scope);

    if (record.knowledgeBaseType !== "fork") {
      throwValidationError(["fork_id"]);
    }

    return record;
  }

  private requireForkableUpstream(
    id: string,
    scope: ApiResourceScope = defaultApiResourceScope,
  ): KnowledgeBaseRecord {
    const record = this.requireActiveRecord(id, scope);

    if (record.knowledgeBaseType !== "canonical") {
      throwForkTargetInvalid(record.id);
    }

    const cleanupOperation = this.deletionCleanupRepository.findLatestOperationForTarget({
      targetType: "knowledge_base",
      targetId: id,
    });

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

  private requireLiveRecord(
    id: string,
    scope: ApiResourceScope = defaultApiResourceScope,
  ): KnowledgeBaseRecord {
    const record = this.repository.findById(id);
    const scopedRecord = requireScopedKnowledgeBase(record, scope);

    if (scopedRecord.deletedAt !== undefined || scopedRecord.status === "deleted") {
      const cleanupOperation = this.deletionCleanupRepository.findLatestOperationForTarget({
        targetType: "knowledge_base",
        targetId: id,
      });

      throw new ApiError("resource_deleted", {
        details: {
          target_type: "knowledge_base",
          target_id: id,
          cleanup_operation_id: cleanupOperation?.id ?? null,
          guidance: "Reload the resource list and select an active knowledge base.",
        },
      });
    }

    return scopedRecord;
  }
}

function compareUpdatedAtDesc(
  leftUpdatedAt: string,
  leftId: string,
  rightUpdatedAt: string,
  rightId: string,
): number {
  const updatedAtOrder = rightUpdatedAt.localeCompare(leftUpdatedAt);

  return updatedAtOrder === 0 ? rightId.localeCompare(leftId) : updatedAtOrder;
}
