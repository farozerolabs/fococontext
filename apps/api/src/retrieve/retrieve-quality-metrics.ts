import type {
  RetrieveAnswerabilityStatus,
  RetrieveEvidenceSufficiency,
  RetrieveResponse,
} from "@fococontext/retrieval";
import { RedisConnection } from "bullmq";
import type { RuntimeConfig } from "@fococontext/core";

type RetrieveQualityRerankStatus =
  | "disabled"
  | "skipped"
  | "applied"
  | "failed"
  | "timed_out"
  | "unknown";

interface RetrieveQualityMetricRecord {
  timestampMs: number;
  mode: string;
  resultCount: number;
  warningCodes: readonly string[];
  rerankStatus: RetrieveQualityRerankStatus;
  latencyMs: number;
  latencyBucket: string;
  duplicateCandidatesPruned: number;
  contextBudgetExceeded: number;
  duplicateContextPruned: number;
  citationUnresolved: number;
  graphExpansionLimited: number;
  fallbackEvidenceRequested: number;
  answerabilityStatus: RetrieveAnswerabilityStatus;
  answerabilityConfidenceBucket: string;
  evidenceSufficiency: RetrieveEvidenceSufficiency;
  answerabilityReasonCodes: readonly string[];
  traceStageNames: readonly string[];
}

export interface RetrieveQualityMetricSummary {
  answerabilityReasonCounts: Record<string, number>;
  answerabilityStatusCounts: Record<RetrieveAnswerabilityStatus, number>;
  confidenceBuckets: Record<string, number>;
  evidenceSufficiencyCounts: Record<RetrieveEvidenceSufficiency, number>;
  eventCounts: {
    budgetExceeded: number;
    citationUnresolved: number;
    duplicateCandidatesPruned: number;
    duplicateContextPruned: number;
    fallbackEvidenceRequested: number;
    graphExpansionLimited: number;
    insufficientEvidence: number;
    lowConfidence: number;
    noAnswer: number;
    partialAnswerability: number;
    skippedRerank: number;
    unreadyIndex: number;
  };
  latencyBuckets: Record<string, number>;
  modeCounts: Record<string, number>;
  resultCountBuckets: Record<string, number>;
  rerankStatusCounts: Record<RetrieveQualityRerankStatus, number>;
  traceStageCounts: Record<string, number>;
  warningCounts: Record<string, number>;
  total: number;
  windowSeconds: number;
}

const defaultWindowSeconds = 300;
const maxRecords = 1000;
const retrievalQualityMetricsKey = "fococontext:retrieval-quality-metrics";
const retrievalQualityMetricsTtlSeconds = 24 * 60 * 60;

export interface RetrievalQualityMetricsStore {
  readonly backend: "redis";
  close?(): Promise<void>;
  record(record: RetrieveQualityMetricRecord): Promise<void>;
  reset?(): Promise<void>;
  snapshot(windowSeconds?: number, nowMs?: number): Promise<RetrieveQualityMetricSummary>;
}

export const retrievalQualityMetricsStoreToken = Symbol("retrievalQualityMetricsStore");

export function createRedisRetrievalQualityMetricsStore(
  config: RuntimeConfig,
): RetrievalQualityMetricsStore {
  return new RedisRetrievalQualityMetricsStore(config);
}

export function createRetrievalQualityMetricRecord(input: {
  latencyMs: number;
  response: RetrieveResponse;
}): RetrieveQualityMetricRecord {
  const response = input.response;
  const traceStageNames = response.trace?.stages.map((stage) => stage.name) ?? [];
  const rerankStageOutput = response.trace?.stages.find((stage) => stage.name === "rerank")?.output;
  const contextPruningOutput = response.trace?.stages.find(
    (stage) => stage.name === "context_pruning",
  )?.output;
  const rankFusionOutput = response.trace?.stages.find(
    (stage) => stage.name === "rank_fusion",
  )?.output;
  const graphExpansionOutput = response.trace?.stages.find(
    (stage) => stage.name === "graph_expansion",
  )?.output;
  const contextReasonCounts = readRecord(contextPruningOutput?.omitted_reason_counts);
  const duplicateControl = readRecord(readRecord(rankFusionOutput?.diagnostics).duplicate_control);
  const warningCodes = [...new Set(response.warnings)];

  return {
    timestampMs: Date.now(),
    mode: response.mode,
    resultCount: response.results.length,
    warningCodes,
    rerankStatus: readRerankStatus(rerankStageOutput?.status),
    latencyMs: input.latencyMs,
    latencyBucket: toLatencyBucket(input.latencyMs),
    duplicateCandidatesPruned: readNonNegativeInteger(duplicateControl.pruned_count),
    contextBudgetExceeded:
      readNonNegativeInteger(contextReasonCounts.budget_exceeded) +
      readNonNegativeInteger(contextReasonCounts.budget_exhausted) +
      readNonNegativeInteger(contextReasonCounts.graph_neighbor_after_source_evidence) +
      readNonNegativeInteger(contextReasonCounts.lower_source_match) +
      readNonNegativeInteger(contextReasonCounts.missing_locator_evidence),
    duplicateContextPruned: readNonNegativeInteger(contextReasonCounts.duplicate_context),
    citationUnresolved: countUnresolvedCitations(response),
    graphExpansionLimited:
      graphExpansionOutput?.limited === true ||
      warningCodes.includes("retrieve.graph_expansion_limited")
        ? 1
        : 0,
    fallbackEvidenceRequested: warningCodes.includes("retrieve.source_evidence_fallback_requested")
      ? 1
      : 0,
    answerabilityStatus: response.answerability.status,
    answerabilityConfidenceBucket: toConfidenceBucket(response.answerability.confidence),
    evidenceSufficiency: response.answerability.evidence_sufficiency,
    answerabilityReasonCodes: response.answerability.reason_codes,
    traceStageNames,
  };
}

export function summarizeRetrievalQualityMetrics(
  records: readonly RetrieveQualityMetricRecord[],
  windowSeconds = defaultWindowSeconds,
  nowMs = Date.now(),
): RetrieveQualityMetricSummary {
  const cutoffMs = nowMs - windowSeconds * 1000;
  const windowRecords = records.filter((record) => record.timestampMs >= cutoffMs);
  const summary: RetrieveQualityMetricSummary = {
    answerabilityReasonCounts: {},
    answerabilityStatusCounts: {
      answerable: 0,
      not_answerable: 0,
      partial: 0,
    },
    confidenceBuckets: {},
    evidenceSufficiencyCounts: {
      insufficient: 0,
      partial: 0,
      sufficient: 0,
    },
    eventCounts: {
      budgetExceeded: 0,
      citationUnresolved: 0,
      duplicateCandidatesPruned: 0,
      duplicateContextPruned: 0,
      fallbackEvidenceRequested: 0,
      graphExpansionLimited: 0,
      insufficientEvidence: 0,
      lowConfidence: 0,
      noAnswer: 0,
      partialAnswerability: 0,
      skippedRerank: 0,
      unreadyIndex: 0,
    },
    latencyBuckets: {},
    modeCounts: {},
    resultCountBuckets: {},
    rerankStatusCounts: {
      applied: 0,
      disabled: 0,
      failed: 0,
      skipped: 0,
      timed_out: 0,
      unknown: 0,
    },
    traceStageCounts: {},
    warningCounts: {},
    total: windowRecords.length,
    windowSeconds,
  };

  for (const record of windowRecords) {
    increment(summary.modeCounts, record.mode);
    increment(summary.latencyBuckets, record.latencyBucket);
    increment(summary.resultCountBuckets, toResultCountBucket(record.resultCount));
    increment(summary.confidenceBuckets, record.answerabilityConfidenceBucket);
    summary.answerabilityStatusCounts[record.answerabilityStatus] += 1;
    summary.evidenceSufficiencyCounts[record.evidenceSufficiency] += 1;
    summary.rerankStatusCounts[record.rerankStatus] += 1;

    if (record.answerabilityStatus === "not_answerable") {
      summary.eventCounts.noAnswer += 1;
    }
    if (record.answerabilityStatus === "partial") {
      summary.eventCounts.partialAnswerability += 1;
    }
    if (record.evidenceSufficiency !== "sufficient") {
      summary.eventCounts.insufficientEvidence += 1;
    }
    if (record.answerabilityReasonCodes.includes("low_confidence")) {
      summary.eventCounts.lowConfidence += 1;
    }

    for (const reasonCode of record.answerabilityReasonCodes) {
      increment(summary.answerabilityReasonCounts, reasonCode);
    }

    if (record.rerankStatus === "skipped") {
      summary.eventCounts.skippedRerank += 1;
    }
    if (record.duplicateCandidatesPruned > 0) {
      summary.eventCounts.duplicateCandidatesPruned += record.duplicateCandidatesPruned;
    }
    if (record.contextBudgetExceeded > 0) {
      summary.eventCounts.budgetExceeded += record.contextBudgetExceeded;
    }
    if (record.duplicateContextPruned > 0) {
      summary.eventCounts.duplicateContextPruned += record.duplicateContextPruned;
    }
    if (record.citationUnresolved > 0) {
      summary.eventCounts.citationUnresolved += record.citationUnresolved;
    }
    if (record.graphExpansionLimited > 0) {
      summary.eventCounts.graphExpansionLimited += record.graphExpansionLimited;
    }
    if (record.fallbackEvidenceRequested > 0) {
      summary.eventCounts.fallbackEvidenceRequested += record.fallbackEvidenceRequested;
    }

    for (const warningCode of record.warningCodes) {
      increment(summary.warningCounts, warningCode);

      if (warningCode === "retrieve.index.semantic_not_ready") {
        summary.eventCounts.unreadyIndex += 1;
      }
    }

    for (const stageName of record.traceStageNames) {
      increment(summary.traceStageCounts, stageName);
    }
  }

  return summary;
}

class RedisRetrievalQualityMetricsStore implements RetrievalQualityMetricsStore {
  readonly backend = "redis";

  private readonly connection: RedisConnection;

  constructor(config: RuntimeConfig) {
    this.connection = new RedisConnection({
      url: config.redis.url,
    });
  }

  async record(record: RetrieveQualityMetricRecord): Promise<void> {
    const client = await this.connection.client;

    await client.runCommand("rpush", [retrievalQualityMetricsKey, JSON.stringify(record)]);
    await client.runCommand("ltrim", [retrievalQualityMetricsKey, String(-maxRecords), "-1"]);
    await client.runCommand("expire", [
      retrievalQualityMetricsKey,
      String(retrievalQualityMetricsTtlSeconds),
    ]);
  }

  async snapshot(
    windowSeconds = defaultWindowSeconds,
    nowMs = Date.now(),
  ): Promise<RetrieveQualityMetricSummary> {
    const client = await this.connection.client;
    const values = await client.runCommand("lrange", [retrievalQualityMetricsKey, "0", "-1"]);

    return summarizeRetrievalQualityMetrics(
      readRetrievalQualityMetricRecords(values),
      windowSeconds,
      nowMs,
    );
  }

  async reset(): Promise<void> {
    const client = await this.connection.client;

    await client.runCommand("del", [retrievalQualityMetricsKey]);
  }

  async close(): Promise<void> {
    await this.connection.close();
  }
}

function readRetrievalQualityMetricRecords(value: unknown): RetrieveQualityMetricRecord[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (typeof item !== "string") {
      return [];
    }

    try {
      const parsed = JSON.parse(item) as Partial<RetrieveQualityMetricRecord>;

      if (
        typeof parsed.timestampMs !== "number" ||
        typeof parsed.mode !== "string" ||
        typeof parsed.resultCount !== "number" ||
        typeof parsed.latencyMs !== "number" ||
        typeof parsed.latencyBucket !== "string" ||
        parsed.answerabilityStatus === undefined ||
        parsed.evidenceSufficiency === undefined
      ) {
        return [];
      }

      return [
        {
          timestampMs: parsed.timestampMs,
          mode: parsed.mode,
          resultCount: parsed.resultCount,
          warningCodes: readStringList(parsed.warningCodes),
          rerankStatus: readRerankStatus(parsed.rerankStatus),
          latencyMs: parsed.latencyMs,
          latencyBucket: parsed.latencyBucket,
          duplicateCandidatesPruned: readNonNegativeInteger(parsed.duplicateCandidatesPruned),
          contextBudgetExceeded: readNonNegativeInteger(parsed.contextBudgetExceeded),
          duplicateContextPruned: readNonNegativeInteger(parsed.duplicateContextPruned),
          citationUnresolved: readNonNegativeInteger(parsed.citationUnresolved),
          graphExpansionLimited: readNonNegativeInteger(parsed.graphExpansionLimited),
          fallbackEvidenceRequested: readNonNegativeInteger(parsed.fallbackEvidenceRequested),
          answerabilityStatus: readAnswerabilityStatus(parsed.answerabilityStatus),
          answerabilityConfidenceBucket:
            typeof parsed.answerabilityConfidenceBucket === "string"
              ? parsed.answerabilityConfidenceBucket
              : "unknown",
          evidenceSufficiency: readEvidenceSufficiency(parsed.evidenceSufficiency),
          answerabilityReasonCodes: readStringList(parsed.answerabilityReasonCodes),
          traceStageNames: readStringList(parsed.traceStageNames),
        },
      ];
    } catch {
      return [];
    }
  });
}

function countUnresolvedCitations(response: RetrieveResponse): number {
  return response.citations.filter((citation) => {
    const status = citation.locator_status ?? "not_provided";

    return status !== "resolved";
  }).length;
}

function readRerankStatus(value: unknown): RetrieveQualityRerankStatus {
  if (
    value === "applied" ||
    value === "disabled" ||
    value === "failed" ||
    value === "skipped" ||
    value === "timed_out"
  ) {
    return value;
  }

  return "unknown";
}

function readAnswerabilityStatus(value: unknown): RetrieveAnswerabilityStatus {
  if (value === "answerable" || value === "not_answerable" || value === "partial") {
    return value;
  }

  return "partial";
}

function readEvidenceSufficiency(value: unknown): RetrieveEvidenceSufficiency {
  if (value === "insufficient" || value === "partial" || value === "sufficient") {
    return value;
  }

  return "partial";
}

function readStringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function readRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readNonNegativeInteger(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : 0;
}

function toLatencyBucket(latencyMs: number): string {
  if (latencyMs < 250) {
    return "lt_250ms";
  }
  if (latencyMs < 1000) {
    return "250ms_1s";
  }
  if (latencyMs < 3000) {
    return "1s_3s";
  }
  if (latencyMs < 15000) {
    return "3s_15s";
  }

  return "gte_15s";
}

function toResultCountBucket(resultCount: number): string {
  if (resultCount === 0) {
    return "0";
  }
  if (resultCount <= 3) {
    return "1_3";
  }
  if (resultCount <= 10) {
    return "4_10";
  }

  return "gt_10";
}

function toConfidenceBucket(confidence: number): string {
  if (confidence < 0.25) {
    return "lt_0_25";
  }
  if (confidence < 0.5) {
    return "0_25_0_5";
  }
  if (confidence < 0.75) {
    return "0_5_0_75";
  }

  return "gte_0_75";
}

function increment(record: Record<string, number>, key: string): void {
  record[key] = (record[key] ?? 0) + 1;
}
