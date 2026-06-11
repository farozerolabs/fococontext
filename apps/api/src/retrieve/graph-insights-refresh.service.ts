import { Inject, Injectable, Optional } from "@nestjs/common";
import { createResourceId } from "@fococontext/contracts";
import type { RuntimeCache } from "@fococontext/core";

import { type ApiResourceScope } from "../auth/api-key.guard.js";
import { apiDatabaseMirrorToken, type ApiDatabaseMirror } from "../database/api-database-mirror.js";
import type { JobDetailResponse, JobEventRecord, JobRecord } from "../documents/document.types.js";
import { toJobDetailResponse } from "../knowledge-bases/knowledge-base.helpers.js";
import { KnowledgeBaseService } from "../knowledge-bases/knowledge-base.service.js";
import {
  graphInsightsRefreshQueueToken,
  type GraphInsightsRefreshQueue,
} from "../queues/graph-insights-refresh.queue.js";
import { runtimeCacheToken } from "../runtime/redis-runtime-cache.js";

const graphInsightsRefreshJobType = "graph.insights.refresh";
const queuedGraphInsightsMessage = "Queued graph insight recomputation.";
const failedGraphInsightsMessage = "Graph insight recomputation could not be queued.";

@Injectable()
export class GraphInsightsRefreshService {
  constructor(
    private readonly knowledgeBaseService: KnowledgeBaseService,
    @Inject(apiDatabaseMirrorToken) private readonly databaseMirror: ApiDatabaseMirror,
    @Inject(graphInsightsRefreshQueueToken)
    private readonly graphInsightsRefreshQueue: GraphInsightsRefreshQueue,
    @Optional()
    @Inject(runtimeCacheToken)
    private readonly runtimeCache?: RuntimeCache,
  ) {}

  async refresh(knowledgeBaseId: string, scope?: ApiResourceScope): Promise<JobDetailResponse> {
    const knowledgeBase = await this.knowledgeBaseService.get(knowledgeBaseId, scope);
    const now = new Date().toISOString();
    const job = createGraphInsightsRefreshJob({
      knowledgeBaseId,
      knowledgeVersionId: knowledgeBase.current_version_id,
      now,
    });
    const event = createGraphInsightsRefreshEvent(job, {
      requested_knowledge_version_id: knowledgeBase.current_version_id,
    });

    await this.databaseMirror.saveJob(job);
    await this.databaseMirror.appendJobEvent(event);

    try {
      await this.graphInsightsRefreshQueue.enqueueGraphInsightsRefreshJob({
        job_id: job.id,
        knowledge_base_id: knowledgeBaseId,
        requested_knowledge_version_id: knowledgeBase.current_version_id,
      });
      await Promise.all([
        this.runtimeCache?.delete({
          resourceKind: "graph-readiness",
          scopeId: knowledgeBaseId,
          variant: "status",
        }),
        this.runtimeCache?.delete({
          resourceKind: "graph-readiness",
          scopeId: knowledgeBaseId,
          variant: "insights",
        }),
      ]);
    } catch (error) {
      const failed = {
        ...job,
        status: "failed" as const,
        progressMessage: failedGraphInsightsMessage,
        error: {
          code: "graph_insights_refresh_enqueue_failed",
          message: error instanceof Error ? error.message : "Unknown queue enqueue error.",
          retryable: true,
        },
        updatedAt: new Date().toISOString(),
      };
      const failedEvent = createGraphInsightsRefreshEvent(failed, {
        requested_knowledge_version_id: knowledgeBase.current_version_id,
      });

      await this.databaseMirror.updateJob(failed);
      await this.databaseMirror.appendJobEvent(failedEvent);

      return toJobDetailResponse(failed, [event, failedEvent]);
    }

    return toJobDetailResponse(job, [event]);
  }
}

function createGraphInsightsRefreshJob(input: {
  knowledgeBaseId: string;
  knowledgeVersionId: string;
  now: string;
}): JobRecord {
  return {
    id: createResourceId("ingestJob"),
    knowledgeBaseId: input.knowledgeBaseId,
    documentId: null,
    jobType: graphInsightsRefreshJobType,
    stage: "indexing",
    status: "queued",
    progress: 5,
    progressMessage: queuedGraphInsightsMessage,
    contentHash: `graph-insights:${input.knowledgeBaseId}:${input.knowledgeVersionId}`,
    idempotencyKey: null,
    deduped: false,
    lockedByKnowledgeBaseId: input.knowledgeBaseId,
    inputSnapshotId: input.knowledgeVersionId,
    retryOfJobId: null,
    parsedContentId: null,
    changeSetId: null,
    error: null,
    createdAt: input.now,
    updatedAt: input.now,
  };
}

function createGraphInsightsRefreshEvent(
  job: JobRecord,
  metadata: Record<string, unknown>,
): JobEventRecord {
  return {
    jobId: job.id,
    type: job.status === "failed" ? "job.failed" : "job.queued",
    stage: job.stage,
    status: job.status,
    message: job.progressMessage,
    metadata: {
      ...metadata,
      refresh_kind: "graph_insights",
      job_type: graphInsightsRefreshJobType,
    },
    createdAt: job.updatedAt,
  };
}
