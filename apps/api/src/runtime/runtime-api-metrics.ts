import {
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";
import { catchError, tap, throwError, type Observable } from "rxjs";

type RuntimeApiOutcome = "success" | "error";

interface RuntimeApiMetricRecord {
  endpointGroup: string;
  graphReadinessState: string | null;
  hasMore: boolean | null;
  latencyBucket: string;
  latencyMs: number;
  method: string;
  outcome: RuntimeApiOutcome;
  pageSize: number | null;
  pageSizeBucket: string | null;
  returnedCount: number | null;
  returnedCountBucket: string | null;
  statusCode: number;
  timestampMs: number;
  total: number | null;
  warningCodes: readonly string[];
}

export interface RuntimeApiMetricEndpointSummary {
  graphReadinessStates: Record<string, number>;
  hasMoreCount: number;
  latencyBuckets: Record<string, number>;
  listLatencyBuckets: Record<string, number>;
  outcomeCounts: Record<RuntimeApiOutcome, number>;
  pageSizeBuckets: Record<string, number>;
  queryDurationBuckets: Record<string, number>;
  returnedCountBuckets: Record<string, number>;
  statusCodes: Record<string, number>;
  total: number;
  totalReturned: number;
  warningCounts: Record<string, number>;
}

export interface RuntimeApiMetricSummary {
  endpointGroups: Record<string, RuntimeApiMetricEndpointSummary>;
  listLatencyBuckets: Record<string, number>;
  queryDurationBuckets: Record<string, number>;
  returnedCountBuckets: Record<string, number>;
  statusCodes: Record<string, number>;
  total: number;
  warningCounts: Record<string, number>;
  windowSeconds: number;
}

const defaultWindowSeconds = 300;
const maxRecords = 2_000;
const runtimeApiMetricRecords: RuntimeApiMetricRecord[] = [];

@Injectable()
export class RuntimeApiMetricsInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const response = context.switchToHttp().getResponse<FastifyReply>();
    const startedAt = Date.now();

    return next.handle().pipe(
      tap((body: unknown) => {
        recordRuntimeApiMetricFromHttp({
          body,
          method: request.method,
          outcome: "success",
          route: readRoutePattern(request),
          statusCode: response.statusCode,
          startedAt,
        });
      }),
      catchError((error: unknown) => {
        recordRuntimeApiMetricFromHttp({
          body: undefined,
          method: request.method,
          outcome: "error",
          route: readRoutePattern(request),
          statusCode: readErrorStatusCode(error),
          startedAt,
        });

        return throwError(() => error);
      }),
    );
  }
}

export function recordRuntimeApiMetricFromHttp(input: {
  body: unknown;
  method: string | undefined;
  outcome: RuntimeApiOutcome;
  route: string | undefined;
  statusCode: number | undefined;
  startedAt: number;
}): void {
  const latencyMs = Math.max(0, Date.now() - input.startedAt);
  const responseDetails = readResponseMetricDetails(input.body);
  const returnedCount = responseDetails.returnedCount;
  const pageSize = responseDetails.pageSize;

  runtimeApiMetricRecords.push({
    endpointGroup: toEndpointGroup(input.route),
    graphReadinessState: responseDetails.graphReadinessState,
    hasMore: responseDetails.hasMore,
    latencyBucket: toDurationBucket(latencyMs),
    latencyMs,
    method: normalizeMethod(input.method),
    outcome: input.outcome,
    pageSize,
    pageSizeBucket: pageSize === null ? null : toCountBucket(pageSize),
    returnedCount,
    returnedCountBucket: returnedCount === null ? null : toCountBucket(returnedCount),
    statusCode: normalizeStatusCode(input.statusCode, input.outcome),
    timestampMs: Date.now(),
    total: responseDetails.total,
    warningCodes: responseDetails.warningCodes,
  });

  if (runtimeApiMetricRecords.length > maxRecords) {
    runtimeApiMetricRecords.splice(0, runtimeApiMetricRecords.length - maxRecords);
  }
}

export function snapshotRuntimeApiMetrics(
  windowSeconds = defaultWindowSeconds,
  nowMs = Date.now(),
): RuntimeApiMetricSummary {
  const cutoffMs = nowMs - windowSeconds * 1000;
  const records = runtimeApiMetricRecords.filter((record) => record.timestampMs >= cutoffMs);
  const summary: RuntimeApiMetricSummary = {
    endpointGroups: {},
    listLatencyBuckets: {},
    queryDurationBuckets: {},
    returnedCountBuckets: {},
    statusCodes: {},
    total: records.length,
    warningCounts: {},
    windowSeconds,
  };

  for (const record of records) {
    const endpointSummary =
      summary.endpointGroups[record.endpointGroup] ?? createEmptyEndpointSummary();

    summary.endpointGroups[record.endpointGroup] = endpointSummary;
    endpointSummary.total += 1;
    increment(summary.queryDurationBuckets, record.latencyBucket);
    increment(endpointSummary.queryDurationBuckets, record.latencyBucket);
    increment(endpointSummary.latencyBuckets, record.latencyBucket);
    increment(summary.statusCodes, String(record.statusCode));
    increment(endpointSummary.statusCodes, String(record.statusCode));
    increment(endpointSummary.outcomeCounts, record.outcome);

    if (record.returnedCount !== null && record.returnedCountBucket !== null) {
      endpointSummary.totalReturned += record.returnedCount;
      increment(summary.returnedCountBuckets, record.returnedCountBucket);
      increment(endpointSummary.returnedCountBuckets, record.returnedCountBucket);
    }
    if (record.pageSizeBucket !== null) {
      increment(endpointSummary.pageSizeBuckets, record.pageSizeBucket);
    }
    if (record.hasMore === true) {
      endpointSummary.hasMoreCount += 1;
    }
    if (record.pageSize !== null || record.hasMore !== null) {
      increment(summary.listLatencyBuckets, record.latencyBucket);
      increment(endpointSummary.listLatencyBuckets, record.latencyBucket);
    }
    if (record.graphReadinessState !== null) {
      increment(endpointSummary.graphReadinessStates, record.graphReadinessState);
    }
    for (const warningCode of record.warningCodes) {
      increment(summary.warningCounts, warningCode);
      increment(endpointSummary.warningCounts, warningCode);
    }
  }

  return summary;
}

export function resetRuntimeApiMetrics(): void {
  runtimeApiMetricRecords.splice(0, runtimeApiMetricRecords.length);
}

function createEmptyEndpointSummary(): RuntimeApiMetricEndpointSummary {
  return {
    graphReadinessStates: {},
    hasMoreCount: 0,
    latencyBuckets: {},
    listLatencyBuckets: {},
    outcomeCounts: {
      error: 0,
      success: 0,
    },
    pageSizeBuckets: {},
    queryDurationBuckets: {},
    returnedCountBuckets: {},
    statusCodes: {},
    total: 0,
    totalReturned: 0,
    warningCounts: {},
  };
}

function readResponseMetricDetails(body: unknown): {
  graphReadinessState: string | null;
  hasMore: boolean | null;
  pageSize: number | null;
  returnedCount: number | null;
  total: number | null;
  warningCodes: string[];
} {
  const record = readRecord(body);
  const data = record === null ? undefined : record.data;
  const dataRecord = readRecord(data);
  const pagination = readRecord(record?.pagination);
  const warningCodes = readWarningCodes(dataRecord?.warnings ?? record?.warnings);
  const graphReadiness = readRecord(dataRecord?.graph_readiness ?? dataRecord?.status);
  const graphReadinessState = readString(graphReadiness?.state);

  return {
    graphReadinessState,
    hasMore: readBoolean(pagination?.has_more),
    pageSize: readNonNegativeInteger(pagination?.page_size),
    returnedCount: Array.isArray(data) ? data.length : null,
    total: readNonNegativeInteger(pagination?.total),
    warningCodes,
  };
}

function readRoutePattern(request: FastifyRequest): string | undefined {
  const routePattern = readRecord(request.routeOptions)?.url;

  return typeof routePattern === "string" ? routePattern : request.url;
}

function toEndpointGroup(route: string | undefined): string {
  const normalized = (route ?? "unknown").split("?")[0] ?? "unknown";

  if (normalized === "/health" || normalized.endsWith("/system/settings")) {
    return "runtime-status";
  }
  if (normalized.includes("/retrieve")) {
    return "retrieve";
  }
  if (normalized.includes("/graph")) {
    return "graph";
  }
  if (normalized.includes("/jobs") || normalized.includes("/ingest-progress")) {
    return "jobs";
  }
  if (normalized.includes("/documents") || normalized.includes("/media-assets")) {
    return "sources";
  }
  if (normalized.includes("/wiki") || normalized.includes("/pages")) {
    return "wiki";
  }
  if (normalized.includes("/cleanup")) {
    return "cleanup";
  }
  if (normalized.includes("/webhooks")) {
    return "webhooks";
  }
  if (normalized.includes("/knowledge-checks")) {
    return "knowledge-checks";
  }
  if (normalized.includes("/source-watch")) {
    return "source-watch";
  }

  return "other";
}

function toDurationBucket(value: number): string {
  if (value < 50) {
    return "lt_50ms";
  }
  if (value < 100) {
    return "50_99ms";
  }
  if (value < 250) {
    return "100_249ms";
  }
  if (value < 500) {
    return "250_499ms";
  }
  if (value < 1_000) {
    return "500_999ms";
  }
  if (value < 2_500) {
    return "1000_2499ms";
  }
  if (value < 5_000) {
    return "2500_4999ms";
  }

  return "gte_5000ms";
}

function toCountBucket(value: number): string {
  if (value === 0) {
    return "0";
  }
  if (value <= 10) {
    return "1_10";
  }
  if (value <= 50) {
    return "11_50";
  }
  if (value <= 100) {
    return "51_100";
  }
  if (value <= 500) {
    return "101_500";
  }

  return "gt_500";
}

function readErrorStatusCode(error: unknown): number {
  const record = readRecord(error);
  const statusCode =
    typeof record?.getStatus === "function"
      ? record.getStatus()
      : (record?.statusCode ?? record?.status);

  return normalizeStatusCode(statusCode, "error");
}

function normalizeStatusCode(value: unknown, outcome: RuntimeApiOutcome): number {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 100 && value <= 599) {
    return value;
  }

  return outcome === "success" ? 200 : 500;
}

function normalizeMethod(value: string | undefined): string {
  const method = value?.trim().toUpperCase();

  return method === undefined || method.length === 0 ? "UNKNOWN" : method;
}

function readWarningCodes(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return [...new Set(value.filter((item): item is string => typeof item === "string"))].slice(
    0,
    50,
  );
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function readBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function readNonNegativeInteger(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    return null;
  }

  return value;
}

function increment(record: Record<string, number>, key: string): void {
  record[key] = (record[key] ?? 0) + 1;
}
