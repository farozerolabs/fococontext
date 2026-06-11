import { Inject, Injectable } from "@nestjs/common";
import { ApiError, createResourceId } from "@fococontext/contracts";
import type { RuntimeConfig } from "@fococontext/core";
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
import { sourceWatchScannerToken, type SourceWatchScanner } from "./source-watch.scanner.js";
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
  type ListSourceWatchRulesInput,
  type ListSourceWatchRulesResult,
  type ScheduledImportJobRecord,
  type ScheduledImportJobEnvelope,
  type SourceWatchDiscoveredSource,
  type SourceWatchRuleEnvelope,
  type SourceWatchRuleRecord,
  type SourceWatchScanSource,
  type SourceWatchScanEnvelope,
  type SourceWatchScanResultResponse,
  type SourceWatchScanTriggerType,
  type UpdateSourceWatchRuleInput,
} from "./source-watch.types.js";

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
      run: () => this.executeScanWithTrigger(record, triggerType, scheduledFor, scope),
    });
  }

  private async executeScanWithTrigger(
    record: SourceWatchRuleRecord,
    triggerType: SourceWatchScanTriggerType,
    scheduledFor: string | null,
    scope?: ApiResourceScope,
  ): Promise<SourceWatchScanEnvelope> {
    const startedAt = new Date().toISOString();
    const startedMs = Date.now();

    try {
      const discovery = await this.scanner.scan(record);
      const now = new Date().toISOString();
      const newSources = await this.autoIngestSources(record, discovery.newSources, scope);
      const changedSources = await this.autoIngestSources(record, discovery.changedSources, scope);
      const deleteCandidates = await mapWithConcurrency(
        discovery.deleteCandidates,
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
      const scanResult: SourceWatchScanResultResponse = {
        new_sources: newSources,
        changed_sources: changedSources,
        delete_candidates: deleteCandidates,
        skipped: discovery.skipped.map(cloneSkippedSource),
      };
      const scheduledImportJob: ScheduledImportJobRecord = {
        id: createResourceId("scheduledImportJob"),
        sourceWatchRuleId: record.id,
        knowledgeBaseId: record.knowledgeBaseId,
        status: discovery.status,
        triggerType,
        scanResult,
        startedAt,
        finishedAt: now,
        durationMs: Date.now() - startedMs,
        retryCount: 0,
        retryable: false,
        nextRetryAt: null,
        error: null,
        scheduledFor,
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
        error,
        scheduledFor,
        startedAt,
        startedMs,
        triggerType,
      });
    }
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
      error: unknown;
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
      id: createResourceId("scheduledImportJob"),
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
