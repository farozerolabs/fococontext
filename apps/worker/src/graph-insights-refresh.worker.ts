import { createHash } from "node:crypto";

import { Worker } from "bullmq";
import { createBackgroundOperationDedupeKey, type RuntimeConfig } from "@fococontext/core";
import {
  backgroundOperationIdPrefix,
  type BackgroundOperationCheckpointRecord,
  type BackgroundOperationCheckpointRepository,
  type TenantProjectScope,
} from "@fococontext/db";

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
  constructor(
    private readonly mergeApplier: PostgresWikiMergeApplier,
    private readonly options: {
      checkpointRepository?: BackgroundOperationCheckpointRepository;
      now?: () => string;
      resolveKnowledgeBaseScope?: (knowledgeBaseId: string) => Promise<TenantProjectScope>;
    } = {},
  ) {}

  async process(
    payload: GraphInsightsRefreshPayload,
  ): Promise<GraphInsightsRefreshProcessorResult> {
    const checkpointId = createStableGraphInsightsOperationId(payload);
    let checkpointCreated = false;

    try {
      const checkpoint = await this.createOrReuseCheckpoint(payload, checkpointId);

      checkpointCreated = checkpoint !== null;
      if (checkpoint?.status === "completed") {
        return {
          status: "completed",
          knowledge_base_id: payload.knowledge_base_id,
          job_id: payload.job_id,
        };
      }
      if (checkpointCreated) {
        await this.options.checkpointRepository?.markRunning({
          id: checkpointId,
          now: this.now(),
          stage: "refreshing",
        });
      }
      const result = await this.mergeApplier.refreshGraphInsightsForJob({
        jobId: payload.job_id,
        knowledgeBaseId: payload.knowledge_base_id,
        onProgress: async (progress) => {
          if (checkpointCreated) {
            await this.options.checkpointRepository?.saveProgress({
              id: checkpointId,
              metadata: progress.metadata,
              now: this.now(),
              processedCount: progress.processedCount,
              stage: progress.stage,
              totalCount: progress.totalCount,
            });
          }
        },
        requestedKnowledgeVersionId: payload.requested_knowledge_version_id,
        skipDerivedGraphSignals: checkpoint?.metadata.derived_graph_signals_completed === true,
      });
      if (checkpointCreated) {
        await this.options.checkpointRepository?.markCompleted({
          id: checkpointId,
          processedCount: 1,
          totalCount: 1,
          metadata: {
            job_id: result.job_id,
            status: result.status,
          },
          now: this.now(),
          stage: "ready",
        });
      }

      return result;
    } catch (error) {
      if (checkpointCreated) {
        await this.options.checkpointRepository?.markFailed({
          id: checkpointId,
          safeError: {
            message: error instanceof Error ? error.message : "Graph insights refresh failed.",
          },
          now: this.now(),
          stage: "failed",
        });
      }
      throw error;
    }
  }

  private async createOrReuseCheckpoint(
    payload: GraphInsightsRefreshPayload,
    checkpointId: string,
  ): Promise<BackgroundOperationCheckpointRecord | null> {
    if (
      this.options.checkpointRepository === undefined ||
      this.options.resolveKnowledgeBaseScope === undefined
    ) {
      return null;
    }
    const scope = await this.options.resolveKnowledgeBaseScope(payload.knowledge_base_id);

    return this.options.checkpointRepository.createOrReuse({
      id: checkpointId,
      tenantId: scope.tenantId,
      projectId: scope.projectId,
      knowledgeBaseId: payload.knowledge_base_id,
      jobId: payload.job_id,
      operationKind: "graph_insight_refresh",
      stage: "queued",
      lockKey: createBackgroundOperationDedupeKey({
        operationId: checkpointId,
        operationKind: "graph_insight_refresh",
        scopeId: payload.knowledge_base_id,
      }),
      totalCount: 1,
      metadata: {
        requested_knowledge_version_id: payload.requested_knowledge_version_id,
      },
      now: this.now(),
    });
  }

  private now(): string {
    return (this.options.now ?? (() => new Date().toISOString()))();
  }
}

export class BullMqGraphInsightsRefreshWorker {
  private readonly worker: Worker<GraphInsightsRefreshPayload>;

  constructor(config: RuntimeConfig, processor: GraphInsightsRefreshProcessor) {
    this.worker = new Worker<GraphInsightsRefreshPayload>(
      graphInsightsRefreshQueueName,
      createGraphInsightsRefreshJobProcessor(processor),
      {
        concurrency: config.limits.backgroundJobs.graphInsights.concurrency,
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

function createStableGraphInsightsOperationId(payload: GraphInsightsRefreshPayload): string {
  const digest = createHash("sha256")
    .update(`${payload.knowledge_base_id}:${payload.job_id}`)
    .digest("hex")
    .slice(0, 32);

  return `${backgroundOperationIdPrefix}graph_insights_${digest}`;
}
