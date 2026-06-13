import type { RuntimeCacheMetricSummary, RuntimeQueuePressureSummary } from "@fococontext/core";
import type {
  ObjectStorageOperationClass,
  ObjectStorageOperationStatus,
} from "@fococontext/storage";

import type { RuntimeSourceJobSummary } from "../database/operational-read-store.js";
import type { RetrieveQualityMetricSummary } from "../retrieve/retrieve-quality-metrics.js";
import type { RuntimeApiMetricSummary } from "../runtime/runtime-api-metrics.js";
import type { SecurityAuditCounterSnapshot } from "../security/security-audit.js";

export type PressureState = "normal" | "degraded" | "saturated";
export type ObjectStorageOperationPressureState = "normal" | "degraded" | "disabled";

export interface DurationSummary {
  count: number;
  avgMs: number;
  maxMs: number;
  minMs: number;
  latestMs: number;
}

export interface ObjectStorageOperationMetricSummary {
  countsByCaller: Record<string, number>;
  countsByClass: Record<ObjectStorageOperationClass, number>;
  countsByOperation: Record<string, number>;
  countsByStatus: Record<ObjectStorageOperationStatus, number>;
  enabled: boolean;
  hotCallers: Array<{ caller: string; count: number; classA: number; classB: number }>;
  hotOperations: Array<{
    operation: string;
    count: number;
    operationClass: ObjectStorageOperationClass;
  }>;
  latency: DurationSummary | null;
  retryCount: number;
  total: number;
  windowSeconds: number;
}

export interface RuntimeMetricsStatus {
  api: RuntimeApiMetricSummary;
  backends: {
    api: "redis" | "unavailable";
    cache: "redis" | "unavailable";
    objectStorageOperations: "redis" | "unavailable";
    queuePressure: "redis" | "unavailable";
    retrievalQuality: "redis" | "unavailable";
    securityAudit: "memory" | "redis" | "unavailable";
    sourceJobs: "postgresql";
  };
  cache: RuntimeCacheMetricSummary;
  compile: {
    activeJobs: number;
    depth: number;
    retryCount: number;
    stageDurations: Record<string, DurationSummary>;
  };
  objectStorageOperations: ObjectStorageOperationMetricSummary;
  queue: {
    activeJobs: number;
    depth: number;
    retryCount: number;
  };
  queuePressure: RuntimeQueuePressureSummary;
  retrievalQuality: RetrieveQualityMetricSummary;
  securityAudit: SecurityAuditCounterSnapshot;
  sourceJobs: RuntimeSourceJobSummary;
}
