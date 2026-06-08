import { Queue, Worker } from "bullmq";
import type { RuntimeConfig } from "@fococontext/core";

export const wikiAnalyzeQueueName = "wiki.analyze";
export const wikiAnalyzeJobName = "wiki.analyze.parsed_content";
export const wikiGenerateQueueName = "wiki.generate";
export const wikiGenerateJobName = "wiki.generate.drafts";
export const wikiMergeQueueName = "wiki.merge";
export const wikiMergeJobName = "wiki.merge.page";

export interface WikiAnalyzePayload {
  job_id: string;
  knowledge_base_id: string;
  document_id: string;
  parsed_content_id: string;
  normalized_markdown_object_key: string;
  content_hash: string;
  dataset_configuration_snapshot?: DatasetConfigurationSnapshotPayload | null;
  purpose?: string;
  schema?: Record<string, unknown>;
  input_snapshot_id: string;
}

export interface DatasetConfigurationSnapshotPayload {
  id: string;
  preset_id: string;
  values: Record<string, unknown>;
  version: number;
}

export interface WikiGeneratePayload {
  job_id: string;
  knowledge_base_id: string;
  analysis_result_id: string;
  source_document_ids: readonly string[];
  current_knowledge_version_id: string;
  dataset_configuration_snapshot?: DatasetConfigurationSnapshotPayload | null;
  purpose: string;
  schema: Record<string, unknown>;
  input_snapshot_id: string;
}

export interface WikiMergePayload {
  job_id: string;
  knowledge_base_id: string;
  wiki_draft_id: string;
  target_page_id: string | null;
  current_knowledge_version_id: string;
  dataset_configuration_snapshot?: DatasetConfigurationSnapshotPayload | null;
  input_snapshot_id: string;
  merge_candidate_count?: number;
  merge_candidate_index?: number;
}

export interface WikiAnalysisEntity {
  title: string;
  evidence_locator: string;
}

export interface WikiAnalysisRelationship {
  from_title: string;
  to_title: string;
  relation_type: string;
  evidence_locator: string;
}

export interface WikiAnalyzeProcessorResult {
  status: "completed" | "failed";
  should_continue: boolean;
  knowledge_base_id: string;
  document_id: string;
  parsed_content_id: string;
  analysis_result_id: string | null;
  prompt_version_id: string | null;
  model_call_id: string | null;
  entities: readonly WikiAnalysisEntity[];
  concepts: readonly WikiAnalysisEntity[];
  contradictions: readonly Record<string, unknown>[];
  relationships: readonly WikiAnalysisRelationship[];
}

export interface WikiGenerateProcessorResult {
  status: "completed" | "failed";
  should_continue: boolean;
  knowledge_base_id: string;
  analysis_result_id: string;
  wiki_draft_ids: readonly string[];
  prompt_version_id: string | null;
  model_call_id: string | null;
}

export interface WikiMergeProcessorResult {
  status: "completed" | "failed";
  should_continue: boolean;
  knowledge_base_id: string;
  wiki_draft_id: string;
  page_merge_record_id: string | null;
  change_set_id: string | null;
  prompt_version_id: string | null;
  model_call_id: string | null;
  merge_summary: string;
}

export interface WikiAnalyzeProcessor {
  process(payload: WikiAnalyzePayload): Promise<WikiAnalyzeProcessorResult>;
}

export interface WikiGenerateProcessor {
  process(payload: WikiGeneratePayload): Promise<WikiGenerateProcessorResult>;
}

export interface WikiMergeProcessor {
  process(payload: WikiMergePayload): Promise<WikiMergeProcessorResult>;
}

export interface EnqueuedWikiCompileJob {
  queue_name: string;
  job_name: string;
  job_id: string;
}

export interface WikiAnalyzeQueue {
  enqueueWikiAnalyzeJob(payload: WikiAnalyzePayload): Promise<EnqueuedWikiCompileJob>;
  close?(): Promise<void>;
}

export interface WikiGenerateQueue {
  enqueueWikiGenerateJob(payload: WikiGeneratePayload): Promise<EnqueuedWikiCompileJob>;
  close?(): Promise<void>;
}

export interface WikiMergeQueue {
  enqueueWikiMergeJob(payload: WikiMergePayload): Promise<EnqueuedWikiCompileJob>;
  close?(): Promise<void>;
}

export interface WikiAnalyzeQueueJob {
  name: string;
  data: WikiAnalyzePayload;
}

export interface WikiGenerateQueueJob {
  name: string;
  data: WikiGeneratePayload;
}

export interface WikiMergeQueueJob {
  name: string;
  data: WikiMergePayload;
}

export class BullMqWikiAnalyzeQueue implements WikiAnalyzeQueue {
  private readonly queue: Queue<WikiAnalyzePayload>;

  constructor(config: RuntimeConfig) {
    this.queue = new Queue<WikiAnalyzePayload>(wikiAnalyzeQueueName, {
      connection: {
        url: config.redis.url,
      },
      defaultJobOptions: {
        attempts: 3,
        removeOnComplete: 1000,
        removeOnFail: 1000,
      },
    });
  }

  async enqueueWikiAnalyzeJob(payload: WikiAnalyzePayload): Promise<EnqueuedWikiCompileJob> {
    await this.queue.add(wikiAnalyzeJobName, payload, {
      jobId: createBullMqCompileJobId(payload.job_id, "analyze"),
    });

    return {
      queue_name: wikiAnalyzeQueueName,
      job_name: wikiAnalyzeJobName,
      job_id: payload.job_id,
    };
  }

  async close(): Promise<void> {
    await this.queue.close();
  }
}

export class BullMqWikiGenerateQueue implements WikiGenerateQueue {
  private readonly queue: Queue<WikiGeneratePayload>;

  constructor(config: RuntimeConfig) {
    this.queue = new Queue<WikiGeneratePayload>(wikiGenerateQueueName, {
      connection: {
        url: config.redis.url,
      },
      defaultJobOptions: {
        attempts: 3,
        removeOnComplete: 1000,
        removeOnFail: 1000,
      },
    });
  }

  async enqueueWikiGenerateJob(payload: WikiGeneratePayload): Promise<EnqueuedWikiCompileJob> {
    await this.queue.add(wikiGenerateJobName, payload, {
      jobId: createBullMqCompileJobId(payload.job_id, "generate", payload.analysis_result_id),
    });

    return {
      queue_name: wikiGenerateQueueName,
      job_name: wikiGenerateJobName,
      job_id: payload.job_id,
    };
  }

  async close(): Promise<void> {
    await this.queue.close();
  }
}

export class BullMqWikiMergeQueue implements WikiMergeQueue {
  private readonly queue: Queue<WikiMergePayload>;

  constructor(config: RuntimeConfig) {
    this.queue = new Queue<WikiMergePayload>(wikiMergeQueueName, {
      connection: {
        url: config.redis.url,
      },
      defaultJobOptions: {
        attempts: 3,
        removeOnComplete: 1000,
        removeOnFail: 1000,
      },
    });
  }

  async enqueueWikiMergeJob(payload: WikiMergePayload): Promise<EnqueuedWikiCompileJob> {
    await this.queue.add(wikiMergeJobName, payload, {
      jobId: createBullMqCompileJobId(payload.job_id, "merge", payload.wiki_draft_id),
    });

    return {
      queue_name: wikiMergeQueueName,
      job_name: wikiMergeJobName,
      job_id: payload.job_id,
    };
  }

  async close(): Promise<void> {
    await this.queue.close();
  }
}

export class BullMqWikiAnalyzeWorker {
  private readonly worker: Worker<WikiAnalyzePayload>;

  constructor(config: RuntimeConfig, processor: WikiAnalyzeProcessor) {
    this.worker = new Worker<WikiAnalyzePayload>(
      wikiAnalyzeQueueName,
      createWikiAnalyzeJobProcessor(processor),
      createWikiAnalyzeWorkerOptions(config),
    );
  }

  async close(): Promise<void> {
    await this.worker.close();
  }
}

export class BullMqWikiGenerateWorker {
  private readonly worker: Worker<WikiGeneratePayload>;

  constructor(config: RuntimeConfig, processor: WikiGenerateProcessor) {
    this.worker = new Worker<WikiGeneratePayload>(
      wikiGenerateQueueName,
      createWikiGenerateJobProcessor(processor),
      createWikiGenerateWorkerOptions(config),
    );
  }

  async close(): Promise<void> {
    await this.worker.close();
  }
}

export class BullMqWikiMergeWorker {
  private readonly worker: Worker<WikiMergePayload>;

  constructor(config: RuntimeConfig, processor: WikiMergeProcessor) {
    this.worker = new Worker<WikiMergePayload>(
      wikiMergeQueueName,
      createWikiMergeJobProcessor(processor),
      createWikiMergeWorkerOptions(config),
    );
  }

  async close(): Promise<void> {
    await this.worker.close();
  }
}

export function createWikiAnalyzeWorkerOptions(config: RuntimeConfig) {
  return {
    concurrency: config.limits.queue.wikiAnalyzeConcurrency,
    connection: {
      url: config.redis.url,
    },
  };
}

export function createWikiGenerateWorkerOptions(config: RuntimeConfig) {
  return {
    concurrency: config.limits.queue.wikiGenerateConcurrency,
    connection: {
      url: config.redis.url,
    },
  };
}

export function createWikiMergeWorkerOptions(config: RuntimeConfig) {
  return {
    concurrency: config.limits.queue.wikiMergeConcurrency,
    connection: {
      url: config.redis.url,
    },
  };
}

export function createWikiAnalyzeJobProcessor(
  processor: WikiAnalyzeProcessor,
): (job: WikiAnalyzeQueueJob) => Promise<WikiAnalyzeProcessorResult> {
  return async (job) => {
    if (job.name !== wikiAnalyzeJobName) {
      throw new Error(`Unsupported wiki.analyze job: ${job.name}`);
    }

    return processor.process(job.data);
  };
}

export function createBullMqCompileJobId(...parts: readonly string[]): string {
  return parts.map((part) => part.replaceAll(":", "_")).join("-");
}

export function createWikiGenerateJobProcessor(
  processor: WikiGenerateProcessor,
): (job: WikiGenerateQueueJob) => Promise<WikiGenerateProcessorResult> {
  return async (job) => {
    if (job.name !== wikiGenerateJobName) {
      throw new Error(`Unsupported wiki.generate job: ${job.name}`);
    }

    return processor.process(job.data);
  };
}

export function createWikiMergeJobProcessor(
  processor: WikiMergeProcessor,
): (job: WikiMergeQueueJob) => Promise<WikiMergeProcessorResult> {
  return async (job) => {
    if (job.name !== wikiMergeJobName) {
      throw new Error(`Unsupported wiki.merge job: ${job.name}`);
    }

    return processor.process(job.data);
  };
}
