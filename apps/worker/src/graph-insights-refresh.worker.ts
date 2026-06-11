import { Worker } from "bullmq";
import type { RuntimeConfig } from "@fococontext/core";

import type { PostgresWikiMergeApplier } from "./wiki-compile.processors.js";

export const graphInsightsRefreshQueueName = "graph.insights.refresh";
export const graphInsightsRefreshJobName = "graph.insights.refresh.run";

export interface GraphInsightsRefreshPayload {
  job_id: string;
  knowledge_base_id: string;
  requested_knowledge_version_id: string | null;
}

export interface GraphInsightsRefreshQueueJob {
  name: string;
  data: GraphInsightsRefreshPayload;
}

export interface GraphInsightsRefreshProcessorResult {
  status: "completed" | "failed";
  knowledge_base_id: string;
  job_id: string;
}

export interface GraphInsightsRefreshProcessor {
  process(payload: GraphInsightsRefreshPayload): Promise<GraphInsightsRefreshProcessorResult>;
}

export class PostgresGraphInsightsRefreshProcessor implements GraphInsightsRefreshProcessor {
  constructor(private readonly mergeApplier: PostgresWikiMergeApplier) {}

  process(payload: GraphInsightsRefreshPayload): Promise<GraphInsightsRefreshProcessorResult> {
    return this.mergeApplier.refreshGraphInsightsForJob({
      jobId: payload.job_id,
      knowledgeBaseId: payload.knowledge_base_id,
      requestedKnowledgeVersionId: payload.requested_knowledge_version_id,
    });
  }
}

export class BullMqGraphInsightsRefreshWorker {
  private readonly worker: Worker<GraphInsightsRefreshPayload>;

  constructor(config: RuntimeConfig, processor: GraphInsightsRefreshProcessor) {
    this.worker = new Worker<GraphInsightsRefreshPayload>(
      graphInsightsRefreshQueueName,
      createGraphInsightsRefreshJobProcessor(processor),
      {
        concurrency: config.limits.queue.wikiMergeConcurrency,
        connection: {
          url: config.redis.url,
        },
      },
    );
  }

  async close(): Promise<void> {
    await this.worker.close();
  }
}

export function createGraphInsightsRefreshJobProcessor(
  processor: GraphInsightsRefreshProcessor,
): (job: GraphInsightsRefreshQueueJob) => Promise<GraphInsightsRefreshProcessorResult> {
  return async (job) => {
    if (job.name !== graphInsightsRefreshJobName) {
      throw new Error(`Unsupported graph.insights.refresh job: ${job.name}`);
    }

    return processor.process(job.data);
  };
}
