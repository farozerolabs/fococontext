import { createHash } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { ApiError, createResourceId } from "@fococontext/contracts";
import { createBackgroundOperationDedupeKey, type RuntimeConfig } from "@fococontext/core";
import {
  backgroundOperationIdPrefix,
  type BackgroundOperationCheckpointRecord,
} from "@fococontext/db";
import { rm } from "node:fs/promises";

import { defaultApiResourceScope, type ApiResourceScope } from "../auth/api-key.guard.js";
import { DocumentService } from "../documents/document.service.js";
import { apiDatabaseMirrorToken, type ApiDatabaseMirror } from "../database/api-database-mirror.js";
import {
  operationalReadStoreToken,
  type OperationalReadStore,
} from "../database/operational-read-store.js";
import { runtimeConfigToken } from "../runtime-config.provider.js";
import { mapWithConcurrency } from "../utils/bounded-concurrency.js";
import {
  sourceWatchScanCoordinatorToken,
  type SourceWatchScanCoordinator,
} from "./source-watch.coordinator.js";
import {
  sourceWatchScannerToken,
  type SourceWatchScanner,
  type SourceWatchScannerProgress,
} from "./source-watch.scanner.js";
import {
  assertDatasetSupportsSourceKind,
  assertSupportedRuntimeSourceKind,
  calculateRetryAt,
  cloneDeleteCandidate,
  cloneSkippedSource,
  completeSourceWatchSchedule,
  createLatestScan,
  createSourceWatchIdempotencyKey,
  createSourceWatchSchedule,
  getSourceWatchRuleExecution,
  isRetryableSourceWatchError,
  pauseSourceWatchSchedule,
  readOptionalObject,
  readOptionalPositiveNumber,
  readOptionalString,
  readRequiredString,
  readSourceKind,
  readStringArray,
  resumeSourceWatchSchedule,
  toErrorRecord,
  toScanSourceResponse,
  toScheduledImportJobResponse,
  toSourceWatchRuleResponse,
  updateSourceWatchSchedule,
  validateSourceWatchLocation,
} from "./source-watch.helpers.js";
import {
  type CreateSourceWatchRuleInput,
  type ListScheduledImportJobsInput,
  type ListScheduledImportJobsResult,
  type ListSourceWatchScanItemsInput,
  type ListSourceWatchScanItemsResult,
  type ListSourceWatchRulesInput,
  type ListSourceWatchRulesResult,
  type ScheduledImportJobRecord,
  type ScheduledImportJobEnvelope,
  type SourceWatchDiscoveredSource,
  type SourceWatchDeleteCandidate,
  type SourceWatchLatestScanResponse,
  type SourceWatchRuleEnvelope,
  type SourceWatchRuleRecord,
  type SourceWatchScanItemKind,
  type SourceWatchScanSource,
  type SourceWatchScanEnvelope,
  type SourceWatchScanResultResponse,
  type SourceWatchScanStageItem,
  type SourceWatchScanTriggerType,
  type SourceWatchSkippedSource,
  type UpdateSourceWatchRuleInput,
} from "./source-watch.types.js";

const sourceWatchScanPreviewLimit = 20;

interface SourceWatchPersistedScanCounts {
  changedCount: number;
  deleteCandidateCount: number;
  discoveredCount: number;
  failedCount: number;
  newCount: number;
  skippedCount: number;
  unchangedCount: number;
}

interface SourceWatchScanExecutionTarget {
  checkpoint: BackgroundOperationCheckpointRecord;
  createdAt: string;
  scheduledFor: string | null;
  scheduledImportJobId: string;
  startedAt: string;
  startedMs: number;
  triggerType: SourceWatchScanTriggerType;
}

@Injectable()
export class SourceWatchService {
  constructor(
    private readonly documentService: DocumentService,
    @Inject(sourceWatchScannerToken) private readonly scanner: SourceWatchScanner,
    @Inject(sourceWatchScanCoordinatorToken)
    private readonly scanCoordinator: SourceWatchScanCoordinator,
    @Inject(apiDatabaseMirrorToken) private readonly databaseMirror: ApiDatabaseMirror,
    @Inject(operationalReadStoreToken) private readonly operationalReadStore: OperationalReadStore,
    @Inject(runtimeConfigToken) private readonly config: RuntimeConfig,
  ) {}

  async create(
    knowledgeBaseId: string,
    input: CreateSourceWatchRuleInput,
    scope?: ApiResourceScope,
  ): Promise<SourceWatchRuleEnvelope> {
    await this.getReadableKnowledgeBase(knowledgeBaseId, scope);
    const sourceKind = readSourceKind(input.source_kind);
    const location = readRequiredString(input.location, "location");
    const datasetConfiguration = await this.requireDatasetConfiguration(knowledgeBaseId, scope);

    assertSupportedRuntimeSourceKind(sourceKind, this.config);
    assertDatasetSupportsSourceKind(sourceKind, datasetConfiguration.values.source_watch);
    validateSourceWatchLocation(sourceKind, location, this.config);

    const now = new Date().toISOString();
    const record: SourceWatchRuleRecord = {
      id: createResourceId("sourceWatchRule"),
      knowledgeBaseId,
      name: readRequiredString(input.name, "name"),
      sourceKind,
      location,
      credentialProfile: readOptionalString(input.credential_profile),
      adapterOptions: readOptionalObject(input.adapter_options, "adapter_options"),
      includeExtensions: readStringArray(input.include_extensions, "include_extensions"),
      excludeDirs: readStringArray(input.exclude_dirs, "exclude_dirs"),
      excludeGlobs: readStringArray(input.exclude_globs, "exclude_globs"),
      maxFileSizeMb: readOptionalPositiveNumber(input.max_file_size_mb, "max_file_size_mb"),
      autoIngest: input.auto_ingest ?? false,
      status: "enabled",
      schedule: createSourceWatchSchedule(input.schedule, now, this.config),
      latestScan: null,
      createdAt: now,
      updatedAt: now,
    };
    await this.databaseMirror.saveSourceWatchRule(record);

    return {
      rule: toSourceWatchRuleResponse(record, this.config),
    };
  }

  async list(
    knowledgeBaseId: string,
    input: ListSourceWatchRulesInput,
    scope?: ApiResourceScope,
  ): Promise<ListSourceWatchRulesResult> {
    await this.getReadableKnowledgeBase(knowledgeBaseId, scope);
    try {
      const dbResult = await this.operationalReadStore.listSourceWatchRules({
        knowledgeBaseId,
        page: input.page,
        pageSize: input.pageSize,
      });

      if (dbResult !== null) {
        return {
          items: dbResult.items.map((record) => toSourceWatchRuleResponse(record, this.config)),
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

  async get(ruleId: string, scope?: ApiResourceScope): Promise<SourceWatchRuleEnvelope> {
    const record = await this.operationalReadStore.getSourceWatchRuleById(ruleId);

    if (record === undefined || record === null) {
      throw createSourceWatchRuleNotFoundError(ruleId);
    }
    await this.assertRuleKnowledgeBaseVisible(record, scope);

    return {
      rule: toSourceWatchRuleResponse(record, this.config),
    };
  }

  async update(
    ruleId: string,
    input: UpdateSourceWatchRuleInput,
    scope?: ApiResourceScope,
  ): Promise<SourceWatchRuleEnvelope> {
    const record = await this.requireRule(ruleId, scope);
    const now = new Date().toISOString();
    const updatedRecord: SourceWatchRuleRecord = {
      ...record,
      ...(input.name === undefined ? {} : { name: readRequiredString(input.name, "name") }),
      ...(input.include_extensions === undefined
        ? {}
        : { includeExtensions: readStringArray(input.include_extensions, "include_extensions") }),
      ...(input.exclude_dirs === undefined
        ? {}
        : { excludeDirs: readStringArray(input.exclude_dirs, "exclude_dirs") }),
      ...(input.exclude_globs === undefined
        ? {}
        : { excludeGlobs: readStringArray(input.exclude_globs, "exclude_globs") }),
      ...(input.max_file_size_mb === undefined
        ? {}
        : {
            maxFileSizeMb:
              input.max_file_size_mb === null
                ? null
                : readOptionalPositiveNumber(input.max_file_size_mb, "max_file_size_mb"),
          }),
      ...(input.auto_ingest === undefined ? {} : { autoIngest: input.auto_ingest }),
      ...(input.schedule === undefined
        ? {}
        : {
            schedule: updateSourceWatchSchedule(record.schedule, input.schedule, now, this.config),
          }),
      updatedAt: now,
    };
    await this.databaseMirror.updateSourceWatchRule(updatedRecord);

    return {
      rule: toSourceWatchRuleResponse(updatedRecord, this.config),
    };
  }

  async getScheduledImportJob(
    jobId: string,
    scope?: ApiResourceScope,
  ): Promise<ScheduledImportJobEnvelope> {
    const record = await this.operationalReadStore.getScheduledImportJobById(jobId);

    if (record === undefined || record === null) {
      throw createScheduledImportJobNotFoundError(jobId);
    }
    await this.assertReadableKnowledgeBase(record.knowledgeBaseId, scope, () =>
      createScheduledImportJobNotFoundError(jobId),
    );

    return {
      scheduled_import_job: toScheduledImportJobResponse(record),
    };
  }

  async listSourceWatchScanItems(
    jobId: string,
    input: ListSourceWatchScanItemsInput,
    scope?: ApiResourceScope,
  ): Promise<ListSourceWatchScanItemsResult> {
    const record = await this.operationalReadStore.getScheduledImportJobById(jobId);

    if (record === undefined || record === null) {
      throw createScheduledImportJobNotFoundError(jobId);
    }
    await this.assertReadableKnowledgeBase(record.knowledgeBaseId, scope, () =>
      createScheduledImportJobNotFoundError(jobId),
    );

    const result = await this.operationalReadStore.listSourceWatchScanItems({
      scheduledImportJobId: record.id,
      ...(input.itemKind === undefined ? {} : { itemKind: input.itemKind }),
      page: input.page,
      pageSize: input.pageSize,
    });

    if (result === null) {
      throw new ApiError("internal_error");
    }

    return {
      items: result.items,
      page: input.page,
      pageSize: input.pageSize,
      total: result.total,
      hasMore: result.hasMore,
    };
  }

  async listScheduledImportJobs(
    ruleId: string,
    input: ListScheduledImportJobsInput,
    scope?: ApiResourceScope,
  ): Promise<ListScheduledImportJobsResult> {
    try {
      const dbRule = await this.operationalReadStore.getSourceWatchRuleById(ruleId);

      if (dbRule !== null) {
        await this.assertRuleKnowledgeBaseVisible(dbRule, scope);
        const dbResult = await this.operationalReadStore.listScheduledImportJobsByRuleId(
          dbRule.id,
          {
            page: input.page,
            pageSize: input.pageSize,
          },
        );

        if (dbResult !== null) {
          return {
            items: dbResult.items.map((item) => toScheduledImportJobResponse(item)),
            page: input.page,
            pageSize: input.pageSize,
            total: dbResult.total,
            hasMore: dbResult.hasMore,
          };
        }
      }
    } catch (error) {
      throw toOperationalListError(error);
    }

    throw new ApiError("internal_error");
  }

  async disable(ruleId: string, scope?: ApiResourceScope): Promise<SourceWatchRuleEnvelope> {
    const record = await this.requireRule(ruleId, scope);
    const updatedRecord: SourceWatchRuleRecord = {
      ...record,
      status: "disabled",
      schedule: pauseSourceWatchSchedule(record.schedule),
      updatedAt: new Date().toISOString(),
    };
    await this.databaseMirror.updateSourceWatchRule(updatedRecord);

    return {
      rule: toSourceWatchRuleResponse(updatedRecord, this.config),
    };
  }

  async enable(ruleId: string, scope?: ApiResourceScope): Promise<SourceWatchRuleEnvelope> {
    const record = await this.requireRule(ruleId, scope);
    const now = new Date().toISOString();
    const updatedRecord: SourceWatchRuleRecord = {
      ...record,
      status: "enabled",
      schedule: resumeSourceWatchSchedule(record.schedule, now),
      updatedAt: now,
    };
    await this.databaseMirror.updateSourceWatchRule(updatedRecord);

    return {
      rule: toSourceWatchRuleResponse(updatedRecord, this.config),
    };
  }

  async scan(ruleId: string, scope?: ApiResourceScope): Promise<SourceWatchScanEnvelope> {
    return this.scanWithTrigger(ruleId, "manual", null, scope);
  }

  async runDueScheduledScans(now: Date = new Date()): Promise<SourceWatchScanEnvelope[]> {
    if (!this.config.sourceWatch.scheduler.enabled) {
      return [];
    }

    const nowIso = now.toISOString();
    const dueRules = await this.operationalReadStore.listDueSourceWatchRules(nowIso, 1000);
    const results: SourceWatchScanEnvelope[] = [];

    for (const rule of dueRules) {
      results.push(await this.scanWithTrigger(rule.id, "scheduled", nowIso));
    }

    return results;
  }

  async scanWithTrigger(
    ruleId: string,
    triggerType: SourceWatchScanTriggerType,
    scheduledFor: string | null = null,
    scope?: ApiResourceScope,
  ): Promise<SourceWatchScanEnvelope> {
    const record = await this.requireRule(ruleId, scope);

    return this.scanCoordinator.runExclusive({
      ruleId: record.id,
      onConflict: () => this.createCoalescedScanResponse(record),
      run: async () => {
        const resumableJob = await this.findInterruptedSourceWatchJob(record);

        return this.executeScanWithTrigger(record, triggerType, scheduledFor, scope, resumableJob);
      },
    });
  }

  private async executeScanWithTrigger(
    record: SourceWatchRuleRecord,
    triggerType: SourceWatchScanTriggerType,
    scheduledFor: string | null,
    scope?: ApiResourceScope,
    resumableJob: ScheduledImportJobRecord | null = null,
  ): Promise<SourceWatchScanEnvelope> {
    const executionTarget = await this.prepareSourceWatchScanExecution({
      record,
      resumableJob,
      scheduledFor,
      triggerType,
    });
    const {
      checkpoint,
      createdAt,
      scheduledImportJobId,
      startedAt,
      startedMs,
      triggerType: executionTriggerType,
    } = executionTarget;
    const shouldRunAdapter = shouldRunSourceWatchAdapterStage(checkpoint);

    if (shouldRunAdapter) {
      await this.databaseMirror.markBackgroundOperationCheckpointRunning({
        id: checkpoint.id,
        now: new Date().toISOString(),
        stage: "scanning",
      });
    }

    try {
      const discovery = shouldRunAdapter
        ? await this.scanner.scan(record, {
            onProgress: (progress) =>
              this.saveSourceWatchCheckpointProgress(checkpoint.id, progress),
            resumeCursor: checkpoint.cursor,
            scanRunId: scheduledImportJobId,
          })
        : {
            status: "completed" as const,
            newSources: [],
            changedSources: [],
            deleteCandidates: [],
            skipped: [],
            execution: getSourceWatchRuleExecution(record, this.config),
          };

      if (discovery.status === "failed") {
        await this.databaseMirror.saveSourceWatchScanItems({
          items: discovery.skipped.map((item): SourceWatchScanStageItem => {
            const sourceIdentity = item.source_path ?? item.reason;

            return {
              comparison_status: "failed",
              item_kind: "failed",
              payload: { ...item },
              safe_error: {
                reason: item.reason,
                ...(item.metadata === undefined ? {} : { metadata: item.metadata }),
              },
              source_identity: sourceIdentity,
              ...(item.source_path === undefined ? {} : { source_path: item.source_path }),
            };
          }),
          knowledgeBaseId: record.knowledgeBaseId,
          now: new Date().toISOString(),
          scheduledImportJobId,
          sourceKind: record.sourceKind,
          sourceWatchRuleId: record.id,
        });
      }
      const scanCounts =
        discovery.status === "failed"
          ? await this.readPersistedSourceWatchScanCounts(scheduledImportJobId)
          : await this.classifyPersistedSourceWatchScanItems(
              record,
              scheduledImportJobId,
              checkpoint,
            );
      const now = new Date().toISOString();
      const newSources = await this.autoIngestPersistedSources(
        record,
        scheduledImportJobId,
        "new",
        scanCounts.newCount,
        scope,
      );
      const changedSources = await this.autoIngestPersistedSources(
        record,
        scheduledImportJobId,
        "changed",
        scanCounts.changedCount,
        scope,
      );
      await this.databaseMirror.saveBackgroundOperationCheckpointProgress({
        id: checkpoint.id,
        metadata: {
          changed_count: scanCounts.changedCount,
          new_count: scanCounts.newCount,
        },
        now: new Date().toISOString(),
        processedCount: scanCounts.newCount + scanCounts.changedCount,
        stage: "auto_ingest",
      });
      const deleteCandidates = await this.previewPersistedDeleteCandidates(scheduledImportJobId);
      const skippedSources = await this.previewPersistedSkippedSources(scheduledImportJobId);
      const failedSources = await this.previewPersistedFailedSources(scheduledImportJobId);
      const skippedPreview =
        discovery.status === "failed" && skippedSources.length === 0
          ? failedSources
          : skippedSources;
      const scanResult: SourceWatchScanResultResponse = {
        new_sources: newSources,
        changed_sources: changedSources,
        delete_candidates: deleteCandidates,
        skipped: skippedPreview,
      };
      const scheduledImportJob: ScheduledImportJobRecord = {
        id: scheduledImportJobId,
        sourceWatchRuleId: record.id,
        knowledgeBaseId: record.knowledgeBaseId,
        status: discovery.status,
        triggerType: executionTriggerType,
        scanResult,
        startedAt,
        finishedAt: now,
        durationMs: Date.now() - startedMs,
        retryCount: resumableJob?.retryCount ?? 0,
        retryable: false,
        nextRetryAt: null,
        error: null,
        scheduledFor: executionTarget.scheduledFor,
        createdAt,
        updatedAt: now,
      };
      const latestScan = createPersistedLatestScan({
        changedCount: scanCounts.changedCount,
        deleteCandidateCount: scanCounts.deleteCandidateCount,
        newCount: scanCounts.newCount,
        recordId: scheduledImportJob.id,
        scannedAt: scheduledImportJob.createdAt,
        skippedCount: scanCounts.skippedCount + scanCounts.failedCount,
        status: scheduledImportJob.status,
      });
      const updatedRecord = {
        ...record,
        latestScan,
        schedule: completeSourceWatchSchedule(record.schedule, scheduledImportJob, now),
        updatedAt: now,
      };

      await this.databaseMirror.saveScheduledImportJob(scheduledImportJob);
      await this.databaseMirror.updateSourceWatchRule(updatedRecord);
      await this.databaseMirror.completeBackgroundOperationCheckpoint({
        id: checkpoint.id,
        metadata: {
          changed_count: scanCounts.changedCount,
          delete_candidate_count: scanCounts.deleteCandidateCount,
          failed_count: scanCounts.failedCount,
          new_count: scanCounts.newCount,
          resumed: resumableJob !== null,
          scheduled_import_job_id: scheduledImportJob.id,
          skipped_count: scanCounts.skippedCount,
          status: discovery.status,
          unchanged_count: scanCounts.unchangedCount,
        },
        now,
        processedCount:
          scanCounts.newCount +
          scanCounts.changedCount +
          scanCounts.deleteCandidateCount +
          scanCounts.skippedCount +
          scanCounts.failedCount,
        stage: "completed",
        totalCount:
          scanCounts.discoveredCount +
          scanCounts.deleteCandidateCount +
          scanCounts.skippedCount +
          scanCounts.failedCount,
      });

      return {
        scan: {
          source_watch_rule_id: record.id,
          knowledge_base_id: record.knowledgeBaseId,
          scheduled_import_job_id: scheduledImportJob.id,
          status: discovery.status,
          new_sources: scanResult.new_sources,
          changed_sources: scanResult.changed_sources,
          delete_candidates: scanResult.delete_candidates,
          skipped: scanResult.skipped,
          execution: discovery.execution,
          scheduled_import_job: toScheduledImportJobResponse(scheduledImportJob),
          created_at: now,
        },
      };
    } catch (error) {
      return this.recordFailedScan(record, {
        checkpointId: checkpoint.id,
        error,
        scheduledImportJobId,
        scheduledFor: executionTarget.scheduledFor,
        startedAt,
        startedMs,
        triggerType: executionTriggerType,
      });
    }
  }

  private async prepareSourceWatchScanExecution(input: {
    record: SourceWatchRuleRecord;
    resumableJob: ScheduledImportJobRecord | null;
    scheduledFor: string | null;
    triggerType: SourceWatchScanTriggerType;
  }): Promise<SourceWatchScanExecutionTarget> {
    if (input.resumableJob !== null) {
      const checkpoint = await this.createSourceWatchCheckpoint({
        record: input.record,
        scheduledImportJobId: input.resumableJob.id,
        startedAt: input.resumableJob.startedAt,
        triggerType: input.resumableJob.triggerType,
      });

      return {
        checkpoint,
        createdAt: input.resumableJob.createdAt,
        scheduledFor: input.resumableJob.scheduledFor,
        scheduledImportJobId: input.resumableJob.id,
        startedAt: input.resumableJob.startedAt,
        startedMs: readTimestampMs(input.resumableJob.startedAt),
        triggerType: input.resumableJob.triggerType,
      };
    }

    const startedAt = new Date().toISOString();
    const scheduledImportJobId = createResourceId("scheduledImportJob");
    const checkpoint = await this.createSourceWatchCheckpoint({
      record: input.record,
      scheduledImportJobId,
      startedAt,
      triggerType: input.triggerType,
    });
    const pendingScanResult: SourceWatchScanResultResponse = {
      changed_sources: [],
      delete_candidates: [],
      new_sources: [],
      skipped: [],
    };
    const pendingScheduledImportJob: ScheduledImportJobRecord = {
      id: scheduledImportJobId,
      sourceWatchRuleId: input.record.id,
      knowledgeBaseId: input.record.knowledgeBaseId,
      status: "completed",
      triggerType: input.triggerType,
      scanResult: pendingScanResult,
      startedAt,
      finishedAt: null,
      durationMs: null,
      retryCount: 0,
      retryable: false,
      nextRetryAt: null,
      error: null,
      scheduledFor: input.scheduledFor,
      createdAt: startedAt,
      updatedAt: startedAt,
    };
    await this.databaseMirror.saveScheduledImportJob(pendingScheduledImportJob);

    return {
      checkpoint,
      createdAt: startedAt,
      scheduledFor: input.scheduledFor,
      scheduledImportJobId,
      startedAt,
      startedMs: Date.now(),
      triggerType: input.triggerType,
    };
  }

  private async createSourceWatchCheckpoint(input: {
    record: SourceWatchRuleRecord;
    scheduledImportJobId: string;
    startedAt: string;
    triggerType: SourceWatchScanTriggerType;
  }) {
    const scope =
      (await this.operationalReadStore.getKnowledgeBaseResourceScope(
        input.record.knowledgeBaseId,
      )) ?? defaultApiResourceScope;
    const operationId = createStableSourceWatchOperationId(
      input.record.id,
      input.scheduledImportJobId,
    );
    const existingCheckpoint =
      await this.databaseMirror.getBackgroundOperationCheckpointById(operationId);

    if (
      existingCheckpoint !== null &&
      !isTerminalBackgroundOperationStatus(existingCheckpoint.status)
    ) {
      return existingCheckpoint;
    }

    return this.databaseMirror.createOrReuseBackgroundOperationCheckpoint({
      id: operationId,
      tenantId: scope.tenantId,
      projectId: scope.projectId,
      knowledgeBaseId: input.record.knowledgeBaseId,
      jobId: input.scheduledImportJobId,
      operationKind: "source_watch_scan",
      stage: "queued",
      cursor: {},
      lockKey: createBackgroundOperationDedupeKey({
        operationId,
        operationKind: "source_watch_scan",
        scopeId: input.record.id,
      }),
      metadata: {
        source_watch_rule_id: input.record.id,
        source_watch_source_kind: input.record.sourceKind,
        trigger_type: input.triggerType,
      },
      now: input.startedAt,
      totalCount: null,
    });
  }

  private async findInterruptedSourceWatchJob(
    record: SourceWatchRuleRecord,
  ): Promise<ScheduledImportJobRecord | null> {
    const result = await this.operationalReadStore.listScheduledImportJobsByRuleId(record.id, {
      page: 1,
      pageSize: 10,
    });

    if (result === null) {
      return null;
    }

    for (const job of result.items) {
      if (job.finishedAt !== null) {
        continue;
      }

      const checkpoint = await this.databaseMirror.getBackgroundOperationCheckpointById(
        createStableSourceWatchOperationId(record.id, job.id),
      );

      if (checkpoint !== null && !isTerminalBackgroundOperationStatus(checkpoint.status)) {
        return job;
      }
    }

    return null;
  }

  private async saveSourceWatchCheckpointProgress(
    checkpointId: string,
    progress: SourceWatchScannerProgress,
  ): Promise<void> {
    await this.databaseMirror.saveBackgroundOperationCheckpointProgress({
      id: checkpointId,
      ...(progress.cursor === undefined ? {} : { cursor: progress.cursor }),
      ...(progress.metadata === undefined ? {} : { metadata: progress.metadata }),
      now: new Date().toISOString(),
      processedCount: progress.processedCount,
      stage: progress.stage,
      ...(progress.totalCount === undefined ? {} : { totalCount: progress.totalCount }),
    });
  }

  private async createCoalescedScanResponse(
    record: SourceWatchRuleRecord,
  ): Promise<SourceWatchScanEnvelope> {
    const latestScan = record.latestScan;

    if (latestScan === null) {
      throw new ApiError("invalid_request", {
        message: "Source watch scan is already running.",
      });
    }

    const scheduledImportJob = await this.operationalReadStore.getScheduledImportJobById(
      latestScan.scheduled_import_job_id,
    );

    if (scheduledImportJob === null) {
      throw new ApiError("invalid_request", {
        message: "Source watch scan is already running.",
      });
    }

    return {
      scan: {
        source_watch_rule_id: record.id,
        knowledge_base_id: record.knowledgeBaseId,
        scheduled_import_job_id: scheduledImportJob.id,
        status: scheduledImportJob.status,
        new_sources: scheduledImportJob.scanResult.new_sources,
        changed_sources: scheduledImportJob.scanResult.changed_sources,
        delete_candidates: scheduledImportJob.scanResult.delete_candidates,
        skipped: scheduledImportJob.scanResult.skipped,
        execution: getSourceWatchRuleExecution(record, this.config),
        scheduled_import_job: toScheduledImportJobResponse(scheduledImportJob),
        created_at: scheduledImportJob.createdAt,
      },
    };
  }

  private async recordFailedScan(
    record: SourceWatchRuleRecord,
    input: {
      checkpointId: string;
      error: unknown;
      scheduledImportJobId: string;
      scheduledFor: string | null;
      startedAt: string;
      startedMs: number;
      triggerType: SourceWatchScanTriggerType;
    },
  ): Promise<SourceWatchScanEnvelope> {
    const now = new Date().toISOString();
    const scanResult: SourceWatchScanResultResponse = {
      changed_sources: [],
      delete_candidates: [],
      new_sources: [],
      skipped: [],
    };
    const retryable = isRetryableSourceWatchError(input.error);
    const scheduledImportJob: ScheduledImportJobRecord = {
      id: input.scheduledImportJobId,
      sourceWatchRuleId: record.id,
      knowledgeBaseId: record.knowledgeBaseId,
      status: "failed",
      triggerType: input.triggerType,
      scanResult,
      startedAt: input.startedAt,
      finishedAt: now,
      durationMs: Date.now() - input.startedMs,
      retryCount: 0,
      retryable,
      nextRetryAt: retryable
        ? calculateRetryAt(now, this.config.sourceWatch.scheduler.retryBaseDelayMs)
        : null,
      error: toErrorRecord(input.error),
      scheduledFor: input.scheduledFor,
      createdAt: now,
      updatedAt: now,
    };
    const latestScan = createLatestScan(scheduledImportJob);
    const updatedRecord = {
      ...record,
      latestScan,
      schedule: completeSourceWatchSchedule(record.schedule, scheduledImportJob, now),
      updatedAt: now,
    };

    await this.databaseMirror.saveScheduledImportJob(scheduledImportJob);
    await this.databaseMirror.updateSourceWatchRule(updatedRecord);
    await this.databaseMirror.failBackgroundOperationCheckpoint({
      id: input.checkpointId,
      failedCount: 1,
      metadata: {
        retryable,
        scheduled_import_job_id: scheduledImportJob.id,
      },
      now,
      processedCount: 0,
      safeError: toErrorRecord(input.error),
      stage: "failed",
      totalCount: null,
    });

    return {
      scan: {
        source_watch_rule_id: record.id,
        knowledge_base_id: record.knowledgeBaseId,
        scheduled_import_job_id: scheduledImportJob.id,
        status: "failed",
        new_sources: [],
        changed_sources: [],
        delete_candidates: [],
        skipped: [],
        execution: getSourceWatchRuleExecution(record, this.config),
        scheduled_import_job: toScheduledImportJobResponse(scheduledImportJob),
        created_at: now,
      },
    };
  }

  private async requireRule(
    ruleId: string,
    scope?: ApiResourceScope,
  ): Promise<SourceWatchRuleRecord> {
    const record = await this.operationalReadStore.getSourceWatchRuleById(ruleId);

    if (record === undefined || record === null) {
      throw createSourceWatchRuleNotFoundError(ruleId);
    }
    await this.assertRuleKnowledgeBaseVisible(record, scope);

    return record;
  }

  private async getReadableKnowledgeBase(
    knowledgeBaseId: string,
    scope?: ApiResourceScope,
    notFoundFactory: () => ApiError = () => new ApiError("knowledge_base_not_found"),
  ) {
    const knowledgeBase = await this.operationalReadStore.getKnowledgeBaseById(
      scope ?? defaultApiResourceScope,
      knowledgeBaseId,
    );

    if (knowledgeBase === null) {
      throw notFoundFactory();
    }

    return knowledgeBase;
  }

  private async assertRuleKnowledgeBaseVisible(
    record: SourceWatchRuleRecord,
    scope?: ApiResourceScope,
  ): Promise<void> {
    await this.assertReadableKnowledgeBase(record.knowledgeBaseId, scope, () =>
      createSourceWatchRuleNotFoundError(record.id),
    );
  }

  private async assertReadableKnowledgeBase(
    knowledgeBaseId: string,
    scope: ApiResourceScope | undefined,
    notFoundFactory: () => ApiError,
  ): Promise<void> {
    await this.getReadableKnowledgeBase(knowledgeBaseId, scope, notFoundFactory);
  }

  private async requireDatasetConfiguration(knowledgeBaseId: string, scope?: ApiResourceScope) {
    const datasetConfiguration =
      await this.operationalReadStore.getDatasetConfigurationByKnowledgeBaseId(
        scope ?? defaultApiResourceScope,
        knowledgeBaseId,
      );

    if (datasetConfiguration === null) {
      throw new ApiError("internal_error");
    }

    return datasetConfiguration;
  }

  private async classifyPersistedSourceWatchScanItems(
    record: SourceWatchRuleRecord,
    scheduledImportJobId: string,
    checkpoint: BackgroundOperationCheckpointRecord,
  ): Promise<SourceWatchPersistedScanCounts> {
    const pageSize = Math.max(1, this.config.limits.residualMemory.sourceWatch.windowSize);
    const counts = await this.readPersistedSourceWatchScanCounts(scheduledImportJobId);
    let page = readCompletedSourceWatchCursorPage(checkpoint.cursor, "comparison_source_page") + 1;
    const deleteCandidateStartPage =
      readCompletedSourceWatchCursorPage(checkpoint.cursor, "delete_candidate_page") + 1;

    if (deleteCandidateStartPage === 1) {
      for (;;) {
        const staged = await this.readPersistedSourceWatchScanItems(
          scheduledImportJobId,
          "discovered",
          page,
          pageSize,
        );
        const discoveredSources = staged.items.map(readSourceWatchDiscoveredSourceFromStageItem);

        if (discoveredSources.length > 0) {
          const comparison =
            await this.operationalReadStore.compareSourceWatchDiscoveredSourceWindow({
              comparisonWindowSize: pageSize,
              rule: record,
              scannedSources: discoveredSources,
            });

          if (comparison === null) {
            throw new ApiError("internal_error");
          }

          const unchangedSources = createUnchangedSourceWatchSources(discoveredSources, [
            ...comparison.newSources,
            ...comparison.changedSources,
          ]);

          await this.databaseMirror.saveSourceWatchScanItems({
            items: [
              ...toSourceWatchStageItems("new", comparison.newSources),
              ...toSourceWatchStageItems("changed", comparison.changedSources),
              ...toSourceWatchStageItems("unchanged", unchangedSources),
            ],
            knowledgeBaseId: record.knowledgeBaseId,
            now: new Date().toISOString(),
            scheduledImportJobId,
            sourceKind: record.sourceKind,
            sourceWatchRuleId: record.id,
          });
          counts.newCount += comparison.newSources.length;
          counts.changedCount += comparison.changedSources.length;
          counts.unchangedCount += unchangedSources.length;
        }

        await this.databaseMirror.saveBackgroundOperationCheckpointProgress({
          id: checkpoint.id,
          cursor: {
            comparison_source_page: page,
            source_watch_rule_id: record.id,
          },
          metadata: {
            changed_count: counts.changedCount,
            comparison_window_size: pageSize,
            new_count: counts.newCount,
            processed_source_count: Math.min(page * pageSize, staged.total),
            skipped_count: counts.skippedCount,
            unchanged_count: counts.unchangedCount,
          },
          now: new Date().toISOString(),
          processedCount: Math.min(page * pageSize, staged.total),
          stage: "compare",
          totalCount: staged.total,
        });

        if (!staged.hasMore) {
          counts.discoveredCount = staged.total;
          break;
        }

        page += 1;
      }
    }

    let deletePage = deleteCandidateStartPage;

    for (;;) {
      const deleteCandidates =
        await this.operationalReadStore.listSourceWatchDeleteCandidatesMissingFromScan({
          page: deletePage,
          pageSize,
          rule: record,
          scheduledImportJobId,
        });

      if (deleteCandidates === null) {
        throw new ApiError("internal_error");
      }

      await this.databaseMirror.saveSourceWatchScanItems({
        items: toSourceWatchDeleteCandidateStageItems(deleteCandidates.items),
        knowledgeBaseId: record.knowledgeBaseId,
        now: new Date().toISOString(),
        scheduledImportJobId,
        sourceKind: record.sourceKind,
        sourceWatchRuleId: record.id,
      });
      counts.deleteCandidateCount += deleteCandidates.items.length;

      await this.databaseMirror.saveBackgroundOperationCheckpointProgress({
        id: checkpoint.id,
        cursor: {
          delete_candidate_page: deletePage,
          source_watch_rule_id: record.id,
        },
        metadata: {
          delete_candidate_count: counts.deleteCandidateCount,
        },
        now: new Date().toISOString(),
        processedCount: counts.deleteCandidateCount,
        stage: "compare",
        totalCount: deleteCandidates.total,
      });

      if (!deleteCandidates.hasMore) {
        break;
      }

      deletePage += 1;
    }

    return this.readPersistedSourceWatchScanCounts(scheduledImportJobId);
  }

  private async autoIngestPersistedSources(
    record: SourceWatchRuleRecord,
    scheduledImportJobId: string,
    itemKind: Extract<SourceWatchScanItemKind, "new" | "changed">,
    itemCount: number,
    scope?: ApiResourceScope,
  ): Promise<SourceWatchScanSource[]> {
    if (itemCount === 0) {
      return [];
    }

    const pageSize = Math.max(1, this.config.limits.residualMemory.sourceWatch.windowSize);

    if (!record.autoIngest) {
      const preview = await this.readPersistedSourceWatchScanItems(
        scheduledImportJobId,
        itemKind,
        1,
        sourceWatchScanPreviewLimit,
      );

      return preview.items
        .map(readSourceWatchDiscoveredSourceFromStageItem)
        .map(toScanSourceResponse);
    }

    const preview: SourceWatchScanSource[] = [];
    let page = 1;

    for (;;) {
      const staged = await this.readPersistedSourceWatchScanItems(
        scheduledImportJobId,
        itemKind,
        page,
        pageSize,
      );
      const ingested = await this.autoIngestSources(
        record,
        staged.items.map(readSourceWatchDiscoveredSourceFromStageItem),
        scope,
      );

      for (const source of ingested) {
        if (preview.length < sourceWatchScanPreviewLimit) {
          preview.push(source);
        }
      }

      if (!staged.hasMore) {
        return preview;
      }

      page += 1;
    }
  }

  private async previewPersistedDeleteCandidates(
    scheduledImportJobId: string,
  ): Promise<SourceWatchDeleteCandidate[]> {
    const staged = await this.readPersistedSourceWatchScanItems(
      scheduledImportJobId,
      "delete_candidate",
      1,
      sourceWatchScanPreviewLimit,
    );
    const candidates = staged.items.map(readSourceWatchDeleteCandidateFromStageItem);

    return mapWithConcurrency(
      candidates,
      this.config.limits.apiFanOut.sourceWatchConcurrency,
      async (candidate) => ({
        ...cloneDeleteCandidate(candidate),
        ...(candidate.document_id === undefined
          ? {}
          : {
              delete_preview: await this.documentService.previewDelete(candidate.document_id),
            }),
      }),
    );
  }

  private async previewPersistedSkippedSources(
    scheduledImportJobId: string,
  ): Promise<SourceWatchSkippedSource[]> {
    const staged = await this.readPersistedSourceWatchScanItems(
      scheduledImportJobId,
      "skipped",
      1,
      sourceWatchScanPreviewLimit,
    );

    return staged.items.map(readSourceWatchSkippedSourceFromStageItem).map(cloneSkippedSource);
  }

  private async previewPersistedFailedSources(
    scheduledImportJobId: string,
  ): Promise<SourceWatchSkippedSource[]> {
    const staged = await this.readPersistedSourceWatchScanItems(
      scheduledImportJobId,
      "failed",
      1,
      sourceWatchScanPreviewLimit,
    );

    return staged.items.map(readSourceWatchSkippedSourceFromStageItem).map(cloneSkippedSource);
  }

  private async readPersistedSourceWatchScanCounts(
    scheduledImportJobId: string,
  ): Promise<SourceWatchPersistedScanCounts> {
    const [changed, deleteCandidate, discovered, failed, next, skipped, unchanged] =
      await Promise.all([
        this.readPersistedSourceWatchScanItems(scheduledImportJobId, "changed", 1, 1),
        this.readPersistedSourceWatchScanItems(scheduledImportJobId, "delete_candidate", 1, 1),
        this.readPersistedSourceWatchScanItems(scheduledImportJobId, "discovered", 1, 1),
        this.readPersistedSourceWatchScanItems(scheduledImportJobId, "failed", 1, 1),
        this.readPersistedSourceWatchScanItems(scheduledImportJobId, "new", 1, 1),
        this.readPersistedSourceWatchScanItems(scheduledImportJobId, "skipped", 1, 1),
        this.readPersistedSourceWatchScanItems(scheduledImportJobId, "unchanged", 1, 1),
      ]);

    return {
      changedCount: changed.total,
      deleteCandidateCount: deleteCandidate.total,
      discoveredCount: discovered.total,
      failedCount: failed.total,
      newCount: next.total,
      skippedCount: skipped.total,
      unchangedCount: unchanged.total,
    };
  }

  private async readPersistedSourceWatchScanItems(
    scheduledImportJobId: string,
    itemKind: SourceWatchScanItemKind,
    page: number,
    pageSize: number,
  ): Promise<ListSourceWatchScanItemsResult> {
    const result = await this.operationalReadStore.listSourceWatchScanItems({
      itemKind,
      page,
      pageSize,
      scheduledImportJobId,
    });

    if (result === null) {
      throw new ApiError("internal_error");
    }

    return {
      items: result.items,
      page,
      pageSize,
      total: result.total,
      hasMore: result.hasMore,
    };
  }

  private async autoIngestSources(
    record: SourceWatchRuleRecord,
    sources: readonly SourceWatchDiscoveredSource[],
    scope?: ApiResourceScope,
  ): Promise<SourceWatchScanSource[]> {
    if (!record.autoIngest) {
      return sources.map(toScanSourceResponse);
    }

    return mapWithConcurrency(
      sources,
      this.config.limits.apiFanOut.sourceWatchConcurrency,
      async (source) => {
        if (source.ingest?.kind === "url" || source.source_url !== undefined) {
          const sourceUrl = source.ingest?.kind === "url" ? source.ingest.url : source.source_url;

          if (sourceUrl === undefined) {
            return toScanSourceResponse(source);
          }

          const metadata = {
            ...(source.metadata ?? {}),
            source_watch_rule_id: record.id,
            source_watch_source_kind: record.sourceKind,
            source_watch_location: record.location,
          };
          const uploadResult = await this.documentService.createUrlSource(
            record.knowledgeBaseId,
            {
              metadata,
              name: source.name,
              source_path: source.source_path ?? sourceUrl,
              url: sourceUrl,
            },
            createSourceWatchIdempotencyKey(record, source),
            scope,
          );

          return {
            ...toScanSourceResponse(source),
            metadata: {
              ...metadata,
              auto_ingest_document_id: uploadResult.document.id,
              auto_ingest_job_id: uploadResult.job.id,
            },
          };
        }

        if (source.ingest?.kind !== "file") {
          return toScanSourceResponse(source);
        }

        const metadata = {
          ...(source.metadata ?? {}),
          source_watch_rule_id: record.id,
          source_watch_source_kind: record.sourceKind,
          source_watch_location: record.location,
        };

        try {
          const uploadResult = await this.documentService.createFileSource(
            record.knowledgeBaseId,
            {
              file_path: source.ingest.file_path,
              metadata,
              mime_type: source.ingest.mime_type,
              name: source.name,
              ...(source.source_path === undefined ? {} : { source_path: source.source_path }),
            },
            createSourceWatchIdempotencyKey(record, source),
            scope,
          );

          return {
            ...toScanSourceResponse(source),
            metadata: {
              ...metadata,
              auto_ingest_document_id: uploadResult.document.id,
              auto_ingest_job_id: uploadResult.job.id,
            },
          };
        } finally {
          if (source.ingest.cleanup_path !== undefined) {
            await rm(source.ingest.cleanup_path, { force: true, recursive: true });
          }
        }
      },
    );
  }
}

function toOperationalListError(error: unknown): ApiError {
  return error instanceof ApiError ? error : new ApiError("internal_error");
}

function createSourceWatchRuleNotFoundError(ruleId: string): ApiError {
  return new ApiError("invalid_request", {
    messageKey: "api.validation.source_watch_rule_not_found",
    details: {
      rule_id: ruleId,
    },
  });
}

function createScheduledImportJobNotFoundError(jobId: string): ApiError {
  return new ApiError("invalid_request", {
    messageKey: "api.validation.scheduled_import_job_not_found",
    details: {
      scheduled_import_job_id: jobId,
    },
  });
}

function createPersistedLatestScan(input: {
  changedCount: number;
  deleteCandidateCount: number;
  newCount: number;
  recordId: string;
  scannedAt: string;
  skippedCount: number;
  status: ScheduledImportJobRecord["status"];
}): SourceWatchLatestScanResponse {
  return {
    scheduled_import_job_id: input.recordId,
    status: input.status,
    scanned_at: input.scannedAt,
    new_source_count: input.newCount,
    changed_source_count: input.changedCount,
    delete_candidate_count: input.deleteCandidateCount,
    skipped_count: input.skippedCount,
  };
}

function readSourceWatchDiscoveredSourceFromStageItem(
  item: SourceWatchScanStageItem,
): SourceWatchDiscoveredSource {
  const payload = item.payload;
  const name =
    readOptionalPayloadString(payload.name) ??
    item.source_path ??
    item.source_url ??
    item.source_identity;
  const metadata = readOptionalPayloadObject(payload.metadata);
  const ingest = readSourceWatchDiscoveredIngest(payload.ingest);
  const size = readOptionalPayloadNumber(payload.size);

  return {
    name,
    ...(item.source_path === undefined ? {} : { source_path: item.source_path }),
    ...(item.source_url === undefined ? {} : { source_url: item.source_url }),
    ...(item.content_hash === undefined ? {} : { content_hash: item.content_hash }),
    ...(size === undefined ? {} : { size }),
    ...(metadata === undefined ? {} : { metadata }),
    ...(ingest === undefined ? {} : { ingest }),
  };
}

function readSourceWatchDeleteCandidateFromStageItem(
  item: SourceWatchScanStageItem,
): SourceWatchDeleteCandidate {
  const payload = item.payload;
  const documentId = readOptionalPayloadString(payload.document_id);
  const metadata = readOptionalPayloadObject(payload.metadata);

  return {
    ...(documentId === undefined ? {} : { document_id: documentId }),
    ...(item.source_path === undefined ? {} : { source_path: item.source_path }),
    reason: readOptionalPayloadString(payload.reason) ?? "missing_from_source",
    ...(metadata === undefined ? {} : { metadata }),
  };
}

function readSourceWatchSkippedSourceFromStageItem(
  item: SourceWatchScanStageItem,
): SourceWatchSkippedSource {
  const payload = item.payload;
  const metadata = readOptionalPayloadObject(payload.metadata);

  return {
    ...(item.source_path === undefined ? {} : { source_path: item.source_path }),
    reason: readOptionalPayloadString(payload.reason) ?? "source_watch_skipped",
    ...(metadata === undefined ? {} : { metadata }),
  };
}

function readSourceWatchDiscoveredIngest(
  value: unknown,
): SourceWatchDiscoveredSource["ingest"] | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }

  const payload = value as Record<string, unknown>;
  const kind = readOptionalPayloadString(payload.kind);

  if (kind === "url") {
    const url = readOptionalPayloadString(payload.url);

    return url === undefined ? undefined : { kind: "url", url };
  }

  if (kind === "file") {
    const filePath = readOptionalPayloadString(payload.file_path);
    const mimeType = readOptionalPayloadString(payload.mime_type);
    const cleanupPath = readOptionalPayloadString(payload.cleanup_path);

    if (filePath === undefined || mimeType === undefined) {
      return undefined;
    }

    return {
      kind: "file",
      file_path: filePath,
      mime_type: mimeType,
      ...(cleanupPath === undefined ? {} : { cleanup_path: cleanupPath }),
    };
  }

  return undefined;
}

function toSourceWatchStageItems(
  itemKind: Extract<SourceWatchScanItemKind, "new" | "changed" | "unchanged">,
  sources: readonly SourceWatchDiscoveredSource[],
): SourceWatchScanStageItem[] {
  return sources.map((source) => ({
    comparison_status: itemKind,
    item_kind: itemKind,
    payload: { ...source },
    source_identity: createSourceWatchSourceIdentity(source),
    ...(source.content_hash === undefined ? {} : { content_hash: source.content_hash }),
    ...(source.source_path === undefined ? {} : { source_path: source.source_path }),
    ...(source.source_url === undefined ? {} : { source_url: source.source_url }),
  }));
}

function toSourceWatchDeleteCandidateStageItems(
  candidates: readonly SourceWatchDeleteCandidate[],
): SourceWatchScanStageItem[] {
  return candidates.map((candidate) => ({
    comparison_status: "delete_candidate",
    item_kind: "delete_candidate",
    payload: { ...candidate },
    source_identity: candidate.source_path ?? candidate.document_id ?? candidate.reason,
    ...(candidate.source_path === undefined ? {} : { source_path: candidate.source_path }),
  }));
}

function createUnchangedSourceWatchSources(
  scannedSources: readonly SourceWatchDiscoveredSource[],
  changedOrNewSources: readonly SourceWatchDiscoveredSource[],
): SourceWatchDiscoveredSource[] {
  const changedOrNewIdentities = new Set(changedOrNewSources.map(createSourceWatchSourceIdentity));

  return scannedSources.filter(
    (source) => !changedOrNewIdentities.has(createSourceWatchSourceIdentity(source)),
  );
}

function createSourceWatchSourceIdentity(source: SourceWatchDiscoveredSource): string {
  return source.source_path ?? source.source_url ?? source.name;
}

function readOptionalPayloadString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readOptionalPayloadNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readOptionalPayloadObject(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }

  return { ...(value as Record<string, unknown>) };
}

export function readOptionalSourceWatchScanItemKind(
  value: unknown,
): SourceWatchScanItemKind | undefined {
  if (
    value === "discovered" ||
    value === "skipped" ||
    value === "new" ||
    value === "changed" ||
    value === "unchanged" ||
    value === "delete_candidate" ||
    value === "failed"
  ) {
    return value;
  }

  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  throw new ApiError("invalid_request", {
    message: "Invalid source watch scan item kind.",
  });
}

function createStableSourceWatchOperationId(ruleId: string, scheduledImportJobId: string): string {
  const digest = createHash("sha256")
    .update(`${ruleId}:${scheduledImportJobId}`)
    .digest("hex")
    .slice(0, 32);

  return `${backgroundOperationIdPrefix}source_watch_${digest}`;
}

function isTerminalBackgroundOperationStatus(status: string): boolean {
  return status === "completed" || status === "failed" || status === "canceled";
}

function shouldRunSourceWatchAdapterStage(
  checkpoint: BackgroundOperationCheckpointRecord,
): boolean {
  return checkpoint.stage !== "compare" && checkpoint.stage !== "auto_ingest";
}

function readCompletedSourceWatchCursorPage(
  cursor: Record<string, unknown>,
  field: "comparison_source_page" | "delete_candidate_page",
): number {
  const value = cursor[field];

  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    return 0;
  }

  return value;
}

function readTimestampMs(value: string): number {
  const parsed = Date.parse(value);

  return Number.isFinite(parsed) ? parsed : Date.now();
}
