import { Injectable } from "@nestjs/common";

import type { ScheduledImportJobRecord, SourceWatchRuleRecord } from "./source-watch.types.js";

@Injectable()
export class SourceWatchRuleRepository {
  private readonly records = new Map<string, SourceWatchRuleRecord>();
  private readonly scheduledImportJobs = new Map<string, ScheduledImportJobRecord>();

  create(record: SourceWatchRuleRecord): SourceWatchRuleRecord {
    this.records.set(record.id, cloneSourceWatchRuleRecord(record));

    return cloneSourceWatchRuleRecord(record);
  }

  replaceSnapshot(input: {
    rules: readonly SourceWatchRuleRecord[];
    scheduledImportJobs: readonly ScheduledImportJobRecord[];
  }): void {
    this.records.clear();
    this.scheduledImportJobs.clear();

    for (const rule of input.rules) {
      this.records.set(rule.id, cloneSourceWatchRuleRecord(rule));
    }
    for (const job of input.scheduledImportJobs) {
      this.scheduledImportJobs.set(job.id, cloneScheduledImportJobRecord(job));
    }
  }

  findById(id: string): SourceWatchRuleRecord | undefined {
    const record = this.records.get(id);

    return record === undefined ? undefined : cloneSourceWatchRuleRecord(record);
  }

  update(record: SourceWatchRuleRecord): SourceWatchRuleRecord {
    this.records.set(record.id, cloneSourceWatchRuleRecord(record));

    return cloneSourceWatchRuleRecord(record);
  }

  listByKnowledgeBaseId(knowledgeBaseId: string): SourceWatchRuleRecord[] {
    return [...this.records.values()]
      .filter((record) => record.knowledgeBaseId === knowledgeBaseId)
      .map((record) => cloneSourceWatchRuleRecord(record));
  }

  listAll(): SourceWatchRuleRecord[] {
    return [...this.records.values()].map((record) => cloneSourceWatchRuleRecord(record));
  }

  createScheduledImportJob(record: ScheduledImportJobRecord): ScheduledImportJobRecord {
    this.scheduledImportJobs.set(record.id, cloneScheduledImportJobRecord(record));

    return cloneScheduledImportJobRecord(record);
  }

  findScheduledImportJobById(id: string): ScheduledImportJobRecord | undefined {
    const record = this.scheduledImportJobs.get(id);

    return record === undefined ? undefined : cloneScheduledImportJobRecord(record);
  }

  listScheduledImportJobsByRuleId(ruleId: string): ScheduledImportJobRecord[] {
    return [...this.scheduledImportJobs.values()]
      .filter((record) => record.sourceWatchRuleId === ruleId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map((record) => cloneScheduledImportJobRecord(record));
  }
}

function cloneSourceWatchRuleRecord(record: SourceWatchRuleRecord): SourceWatchRuleRecord {
  return {
    ...record,
    adapterOptions: { ...record.adapterOptions },
    includeExtensions: [...record.includeExtensions],
    excludeDirs: [...record.excludeDirs],
    excludeGlobs: [...record.excludeGlobs],
    latestScan: record.latestScan === null ? null : { ...record.latestScan },
    schedule: {
      ...record.schedule,
      lastError:
        record.schedule.lastError === null
          ? null
          : (JSON.parse(JSON.stringify(record.schedule.lastError)) as Record<string, unknown>),
    },
  };
}

function cloneScheduledImportJobRecord(record: ScheduledImportJobRecord): ScheduledImportJobRecord {
  return {
    ...record,
    scanResult: {
      new_sources: record.scanResult.new_sources.map((item) => ({ ...item })),
      changed_sources: record.scanResult.changed_sources.map((item) => ({ ...item })),
      delete_candidates: record.scanResult.delete_candidates.map((item) => ({ ...item })),
      skipped: record.scanResult.skipped.map((item) => ({ ...item })),
    },
    error:
      record.error === null
        ? null
        : (JSON.parse(JSON.stringify(record.error)) as Record<string, unknown>),
  };
}
