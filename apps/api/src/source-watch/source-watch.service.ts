import { Inject, Injectable } from "@nestjs/common";
import { ApiError, createResourceId } from "@fococontext/contracts";
import type { RuntimeConfig } from "@fococontext/core";
import { rm } from "node:fs/promises";

import type { ApiResourceScope } from "../auth/api-key.guard.js";
import { DocumentService } from "../documents/document.service.js";
import { KnowledgeBaseService } from "../knowledge-bases/knowledge-base.service.js";
import {
  apiDatabaseHydratorToken,
  type ApiDatabaseHydrator,
} from "../database/api-database-hydrator.js";
import { apiDatabaseMirrorToken, type ApiDatabaseMirror } from "../database/api-database-mirror.js";
import { runtimeConfigToken } from "../runtime-config.provider.js";
import { mapWithConcurrency } from "../utils/bounded-concurrency.js";
import { SourceWatchRuleRepository } from "./source-watch.repository.js";
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
  private readonly activeScans = new Set<string>();

  constructor(
    private readonly knowledgeBaseService: KnowledgeBaseService,
    private readonly repository: SourceWatchRuleRepository,
    private readonly documentService: DocumentService,
    @Inject(sourceWatchScannerToken) private readonly scanner: SourceWatchScanner,
    @Inject(apiDatabaseMirrorToken) private readonly databaseMirror: ApiDatabaseMirror,
    @Inject(apiDatabaseHydratorToken) private readonly databaseHydrator: ApiDatabaseHydrator,
    @Inject(runtimeConfigToken) private readonly config: RuntimeConfig,
  ) {}

  async create(
    knowledgeBaseId: string,
    input: CreateSourceWatchRuleInput,
    scope?: ApiResourceScope,
  ): Promise<SourceWatchRuleEnvelope> {
    this.getKnowledgeBase(knowledgeBaseId, scope);
    const sourceKind = readSourceKind(input.source_kind);
    const location = readRequiredString(input.location, "location");

    assertSupportedRuntimeSourceKind(sourceKind, this.config);
    assertDatasetSupportsSourceKind(
      sourceKind,
      this.knowledgeBaseService.getDatasetConfiguration(knowledgeBaseId, scope).values.source_watch,
    );
    validateSourceWatchLocation(sourceKind, location, this.config);

    const now = new Date().toISOString();
    const record = this.repository.create({
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
    });
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
    await this.databaseHydrator.refresh();
    this.getKnowledgeBase(knowledgeBaseId, scope);

    const records = this.repository
      .listByKnowledgeBaseId(knowledgeBaseId)
      .sort((left, right) =>
        compareUpdatedAtDesc(left.updatedAt, left.id, right.updatedAt, right.id),
      );
    const start = (input.page - 1) * input.pageSize;
    const items = records
      .slice(start, start + input.pageSize)
      .map((record) => toSourceWatchRuleResponse(record, this.config));

    return {
      items,
      page: input.page,
      pageSize: input.pageSize,
      total: records.length,
      hasMore: start + input.pageSize < records.length,
    };
  }

  async get(ruleId: string, scope?: ApiResourceScope): Promise<SourceWatchRuleEnvelope> {
    await this.databaseHydrator.refresh();
    const record = this.repository.findById(ruleId);

    if (record === undefined) {
      throw createSourceWatchRuleNotFoundError(ruleId);
    }
    this.assertRuleKnowledgeBaseVisible(record, scope);

    return {
      rule: toSourceWatchRuleResponse(record, this.config),
    };
  }

  async update(
    ruleId: string,
    input: UpdateSourceWatchRuleInput,
    scope?: ApiResourceScope,
  ): Promise<SourceWatchRuleEnvelope> {
    await this.databaseHydrator.refresh();
    const record = this.requireRule(ruleId, scope);
    const now = new Date().toISOString();
    const updatedRecord = this.repository.update({
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
    });
    await this.databaseMirror.updateSourceWatchRule(updatedRecord);

    return {
      rule: toSourceWatchRuleResponse(updatedRecord, this.config),
    };
  }

  async getScheduledImportJob(
    jobId: string,
    scope?: ApiResourceScope,
  ): Promise<ScheduledImportJobEnvelope> {
    await this.databaseHydrator.refresh();
    const record = this.repository.findScheduledImportJobById(jobId);

    if (record === undefined) {
      throw createScheduledImportJobNotFoundError(jobId);
    }
    this.assertReadableKnowledgeBase(record.knowledgeBaseId, scope, () =>
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
    await this.databaseHydrator.refresh();
    this.requireRule(ruleId, scope);
    const records = this.repository.listScheduledImportJobsByRuleId(ruleId);
    const start = (input.page - 1) * input.pageSize;
    const items = records
      .slice(start, start + input.pageSize)
      .map((item) => toScheduledImportJobResponse(item));

    return {
      items,
      page: input.page,
      pageSize: input.pageSize,
      total: records.length,
      hasMore: start + input.pageSize < records.length,
    };
  }

  async disable(ruleId: string, scope?: ApiResourceScope): Promise<SourceWatchRuleEnvelope> {
    await this.databaseHydrator.refresh();
    const record = this.requireRule(ruleId, scope);
    const updatedRecord = this.repository.update({
      ...record,
      status: "disabled",
      schedule: pauseSourceWatchSchedule(record.schedule),
      updatedAt: new Date().toISOString(),
    });
    await this.databaseMirror.updateSourceWatchRule(updatedRecord);

    return {
      rule: toSourceWatchRuleResponse(updatedRecord, this.config),
    };
  }

  async enable(ruleId: string, scope?: ApiResourceScope): Promise<SourceWatchRuleEnvelope> {
    await this.databaseHydrator.refresh();
    const record = this.requireRule(ruleId, scope);
    const now = new Date().toISOString();
    const updatedRecord = this.repository.update({
      ...record,
      status: "enabled",
      schedule: resumeSourceWatchSchedule(record.schedule, now),
      updatedAt: now,
    });
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

    await this.databaseHydrator.refresh();
    const nowIso = now.toISOString();
    const dueRules = this.repository
      .listAll()
      .filter((rule) => rule.status === "enabled")
      .filter((rule) => rule.schedule.enabled)
      .filter(
        (rule) =>
          rule.schedule.nextRunAt !== null &&
          new Date(rule.schedule.nextRunAt).getTime() <= now.getTime(),
      );
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
    await this.databaseHydrator.refresh();
    const record = this.requireRule(ruleId, scope);

    if (this.activeScans.has(record.id)) {
      return this.createCoalescedScanResponse(record);
    }

    this.activeScans.add(record.id);
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
      const scheduledImportJob = this.repository.createScheduledImportJob({
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
      });
      const latestScan = createLatestScan(scheduledImportJob);
      const updatedRecord = {
        ...record,
        latestScan,
        schedule: completeSourceWatchSchedule(record.schedule, scheduledImportJob, now),
        updatedAt: now,
      };

      this.repository.update(updatedRecord);
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
    } finally {
      this.activeScans.delete(record.id);
    }
  }

  private createCoalescedScanResponse(record: SourceWatchRuleRecord): SourceWatchScanEnvelope {
    const latestScan = record.latestScan;

    if (latestScan === null) {
      throw new ApiError("invalid_request", {
        message: "Source watch scan is already running.",
      });
    }

    const scheduledImportJob = this.repository.findScheduledImportJobById(
      latestScan.scheduled_import_job_id,
    );

    if (scheduledImportJob === undefined) {
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
    const scheduledImportJob = this.repository.createScheduledImportJob({
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
    });
    const latestScan = createLatestScan(scheduledImportJob);
    const updatedRecord = {
      ...record,
      latestScan,
      schedule: completeSourceWatchSchedule(record.schedule, scheduledImportJob, now),
      updatedAt: now,
    };

    this.repository.update(updatedRecord);
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

  private requireRule(ruleId: string, scope?: ApiResourceScope): SourceWatchRuleRecord {
    const record = this.repository.findById(ruleId);

    if (record === undefined) {
      throw createSourceWatchRuleNotFoundError(ruleId);
    }
    this.assertRuleKnowledgeBaseVisible(record, scope);

    return record;
  }

  private getKnowledgeBase(knowledgeBaseId: string, scope?: ApiResourceScope) {
    return scope === undefined
      ? this.knowledgeBaseService.get(knowledgeBaseId)
      : this.knowledgeBaseService.get(knowledgeBaseId, scope);
  }

  private assertRuleKnowledgeBaseVisible(
    record: SourceWatchRuleRecord,
    scope?: ApiResourceScope,
  ): void {
    this.assertReadableKnowledgeBase(record.knowledgeBaseId, scope, () =>
      createSourceWatchRuleNotFoundError(record.id),
    );
  }

  private assertReadableKnowledgeBase(
    knowledgeBaseId: string,
    scope: ApiResourceScope | undefined,
    notFoundFactory: () => ApiError,
  ): void {
    try {
      if (scope === undefined) {
        this.knowledgeBaseService.assertReadableKnowledgeBase(knowledgeBaseId);
      } else {
        this.knowledgeBaseService.assertReadableKnowledgeBase(knowledgeBaseId, scope);
      }
    } catch (error) {
      if (error instanceof ApiError && error.code === "knowledge_base_not_found") {
        throw notFoundFactory();
      }

      throw error;
    }
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

function compareUpdatedAtDesc(
  leftUpdatedAt: string,
  leftId: string,
  rightUpdatedAt: string,
  rightId: string,
): number {
  const updatedAtOrder = rightUpdatedAt.localeCompare(leftUpdatedAt);

  return updatedAtOrder === 0 ? rightId.localeCompare(leftId) : updatedAtOrder;
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
