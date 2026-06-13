import {
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from "@nestjs/common";
import { RedisConnection } from "bullmq";
import type { FastifyReply, FastifyRequest } from "fastify";
import { catchError, tap, throwError, type Observable } from "rxjs";
import type { RuntimeConfig } from "@fococontext/core";

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
const runtimeApiMetricsKey = "fococontext:runtime-api-metrics";
const runtimeApiMetricsKeyTtlSeconds = 24 * 60 * 60;

export interface RuntimeApiMetricsStore {
  readonly backend: "redis";
  close?(): Promise<void>;
  record(record: RuntimeApiMetricRecord): Promise<void>;
  reset?(): Promise<void>;
  snapshot(windowSeconds?: number, nowMs?: number): Promise<RuntimeApiMetricSummary>;
}

export const runtimeApiMetricsStoreToken = Symbol("runtimeApiMetricsStore");

export function createRedisRuntimeApiMetricsStore(config: RuntimeConfig): RuntimeApiMetricsStore {
  return new RedisRuntimeApiMetricsStore(config);
}

export class RedisRuntimeApiMetricsStore implements RuntimeApiMetricsStore {
  readonly backend = "redis";

  private readonly connection: RedisConnection;

  constructor(config: RuntimeConfig) {
    this.connection = new RedisConnection({
      url: config.redis.url,
    });
  }

  async record(record: RuntimeApiMetricRecord): Promise<void> {
    const client = await this.connection.client;

    await client.runCommand("rpush", [runtimeApiMetricsKey, JSON.stringify(record)]);
    await client.runCommand("ltrim", [runtimeApiMetricsKey, String(-maxRecords), "-1"]);
    await client.runCommand("expire", [
      runtimeApiMetricsKey,
      String(runtimeApiMetricsKeyTtlSeconds),
    ]);
  }

  async snapshot(
    windowSeconds = defaultWindowSeconds,
    nowMs = Date.now(),
  ): Promise<RuntimeApiMetricSummary> {
    const client = await this.connection.client;
    const values = await client.runCommand("lrange", [runtimeApiMetricsKey, "0", "-1"]);
    const records = readMetricRecords(values);

    return summarizeRuntimeApiMetrics(records, windowSeconds, nowMs);
  }

  async reset(): Promise<void> {
    const client = await this.connection.client;

    await client.runCommand("del", [runtimeApiMetricsKey]);
  }

  async close(): Promise<void> {
    await this.connection.close();
  }
}

@Injectable()
export class RuntimeApiMetricsInterceptor implements NestInterceptor {
  constructor(private readonly metricsStore: RuntimeApiMetricsStore) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const response = context.switchToHttp().getResponse<FastifyReply>();
    const startedAt = Date.now();

    return next.handle().pipe(
      tap((body: unknown) => {
        this.recordMetricFromHttp({
          body,
          method: request.method,
          outcome: "success",
          route: readRoutePattern(request),
          statusCode: response.statusCode,
          startedAt,
        });
      }),
      catchError((error: unknown) => {
        this.recordMetricFromHttp({
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

  private recordMetricFromHttp(input: {
    body: unknown;
    method: string | undefined;
    outcome: RuntimeApiOutcome;
    route: string | undefined;
    statusCode: number | undefined;
    startedAt: number;
  }): void {
    void this.metricsStore.record(createRuntimeApiMetricFromHttp(input)).catch((error: unknown) => {
      console.warn("Runtime API metrics recording failed.", error);
    });
  }
}

export function createRuntimeApiMetricFromHttp(input: {
  body: unknown;
  method: string | undefined;
  outcome: RuntimeApiOutcome;
  route: string | undefined;
  statusCode: number | undefined;
  startedAt: number;
}): RuntimeApiMetricRecord {
  const latencyMs = Math.max(0, Date.now() - input.startedAt);
  const responseDetails = readResponseMetricDetails(input.body);
  const returnedCount = responseDetails.returnedCount;
  const pageSize = responseDetails.pageSize;

  return {
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
  };
}

export function summarizeRuntimeApiMetrics(
  inputRecords: readonly RuntimeApiMetricRecord[],
  windowSeconds = defaultWindowSeconds,
  nowMs = Date.now(),
): RuntimeApiMetricSummary {
  const cutoffMs = nowMs - windowSeconds * 1000;
  const records = inputRecords.filter((record) => record.timestampMs >= cutoffMs);
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

function readMetricRecords(value: unknown): RuntimeApiMetricRecord[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => (typeof item === "string" ? safeParseMetricRecord(item) : null))
    .filter((item): item is RuntimeApiMetricRecord => item !== null);
}

function safeParseMetricRecord(value: string): RuntimeApiMetricRecord | null {
  try {
    const parsed = JSON.parse(value);

    return isRuntimeApiMetricRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function isRuntimeApiMetricRecord(value: unknown): value is RuntimeApiMetricRecord {
  const record = readRecord(value);

  return (
    record !== null &&
    typeof record.endpointGroup === "string" &&
    (typeof record.graphReadinessState === "string" || record.graphReadinessState === null) &&
    (typeof record.hasMore === "boolean" || record.hasMore === null) &&
    typeof record.latencyBucket === "string" &&
    typeof record.latencyMs === "number" &&
    typeof record.method === "string" &&
    (record.outcome === "success" || record.outcome === "error") &&
    (typeof record.pageSize === "number" || record.pageSize === null) &&
    (typeof record.pageSizeBucket === "string" || record.pageSizeBucket === null) &&
    (typeof record.returnedCount === "number" || record.returnedCount === null) &&
    (typeof record.returnedCountBucket === "string" || record.returnedCountBucket === null) &&
    typeof record.statusCode === "number" &&
    typeof record.timestampMs === "number" &&
    (typeof record.total === "number" || record.total === null) &&
    Array.isArray(record.warningCodes) &&
    record.warningCodes.every((item) => typeof item === "string")
  );
}
