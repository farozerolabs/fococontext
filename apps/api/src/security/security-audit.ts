import { randomUUID } from "node:crypto";
import { Inject, Injectable, Optional, type OnModuleDestroy } from "@nestjs/common";
import { RedisConnection } from "bullmq";
import { sql, type Kysely } from "kysely";
import type { RuntimeConfig } from "@fococontext/core";
import type { DatabaseSchema } from "@fococontext/db";

import { runtimeConfigToken } from "../runtime-config.provider.js";

export type SecurityAuditActorType = "admin_session" | "anonymous" | "api_key" | "system";
export type SecurityAuditOutcome = "blocked" | "failure" | "success";

export interface SecurityAuditActor {
  accountId?: string | null;
  apiKeyId?: string | null;
  projectId?: string | null;
  tenantId?: string | null;
  type: SecurityAuditActorType;
  username?: string | null;
}

export interface SecurityAuditRequestLike {
  apiKeyScope?: {
    accountId?: string | null;
    apiKeyId: string;
    projectId: string;
    tenantId: string;
  };
  raw?: {
    adminSession?: {
      username: string;
    };
  };
}

export interface SecurityAuditEventInput {
  actor: SecurityAuditActor;
  eventType: string;
  metadata?: Record<string, unknown>;
  outcome: SecurityAuditOutcome;
  reasonCode: string;
  requestId?: string | null;
  routeGroup: string;
}

export interface SecurityAuditCounterRecord {
  eventType: string;
  outcome: SecurityAuditOutcome;
  reasonCode: string;
  routeGroup: string;
  timestampMs: number;
}

export interface SecurityAuditCounterSnapshot {
  byEventType: Record<string, number>;
  byOutcome: Record<string, number>;
  byReasonCode: Record<string, number>;
  byRouteGroup: Record<string, number>;
  total: number;
  windowSeconds: number;
}

export interface SecurityAuditStore {
  readonly backend: "memory" | "postgres";
  close?(): Promise<void>;
  record(event: SecurityAuditEventInput): Promise<void>;
}

export interface SecurityAuditCounterStore {
  readonly backend: "memory" | "redis";
  close?(): Promise<void>;
  record(record: SecurityAuditCounterRecord): Promise<void>;
  reset?(): Promise<void>;
  snapshot(windowSeconds?: number, nowMs?: number): Promise<SecurityAuditCounterSnapshot>;
}

export const securityAuditStoreToken = Symbol("securityAuditStore");
export const securityAuditCounterStoreToken = Symbol("securityAuditCounterStore");

@Injectable()
export class SecurityAuditService implements OnModuleDestroy {
  constructor(
    @Inject(runtimeConfigToken) private readonly config: RuntimeConfig,
    @Inject(securityAuditStoreToken) private readonly store: SecurityAuditStore,
    @Optional()
    @Inject(securityAuditCounterStoreToken)
    private readonly counterStore?: SecurityAuditCounterStore,
  ) {}

  async onModuleDestroy(): Promise<void> {
    await this.store.close?.();
    await this.counterStore?.close?.();
  }

  async record(input: SecurityAuditEventInput): Promise<void> {
    if (!this.config.security.audit.enabled) {
      return;
    }

    const safeEvent = {
      ...input,
      metadata: sanitizeAuditMetadata(
        input.metadata ?? {},
        this.config.security.audit.maxMetadataBytes,
      ),
    };

    await this.store.record(safeEvent);
    await this.counterStore?.record({
      eventType: input.eventType,
      outcome: input.outcome,
      reasonCode: input.reasonCode,
      routeGroup: input.routeGroup,
      timestampMs: Date.now(),
    });
  }

  async snapshot(
    windowSeconds = this.config.security.audit.counterWindowSeconds,
  ): Promise<SecurityAuditCounterSnapshot | undefined> {
    return this.counterStore?.snapshot(windowSeconds);
  }
}

export function createPostgresSecurityAuditStore(db: Kysely<DatabaseSchema>): SecurityAuditStore {
  return new PostgresSecurityAuditStore(db);
}

class PostgresSecurityAuditStore implements SecurityAuditStore {
  readonly backend = "postgres";

  constructor(private readonly db: Kysely<DatabaseSchema>) {}

  async record(event: SecurityAuditEventInput): Promise<void> {
    await sql`
      insert into security_audit_events (
        id,
        tenant_id,
        project_id,
        account_id,
        api_key_id,
        actor_type,
        username,
        event_type,
        route_group,
        outcome,
        reason_code,
        request_id,
        metadata,
        created_at
      )
      values (
        ${createSecurityAuditEventId()},
        ${event.actor.tenantId ?? null},
        ${event.actor.projectId ?? null},
        ${event.actor.accountId ?? null},
        ${event.actor.apiKeyId ?? null},
        ${event.actor.type},
        ${event.actor.username ?? null},
        ${event.eventType},
        ${event.routeGroup},
        ${event.outcome},
        ${event.reasonCode},
        ${event.requestId ?? null},
        ${JSON.stringify(event.metadata ?? {})}::jsonb,
        now()
      )
    `.execute(this.db);
  }
}

export function createRedisSecurityAuditCounterStore(
  config: RuntimeConfig,
): SecurityAuditCounterStore {
  return new RedisSecurityAuditCounterStore(config);
}

class RedisSecurityAuditCounterStore implements SecurityAuditCounterStore {
  readonly backend = "redis";

  private readonly connection: RedisConnection;

  constructor(private readonly config: RuntimeConfig) {
    this.connection = new RedisConnection({
      url: config.redis.url,
    });
  }

  async record(record: SecurityAuditCounterRecord): Promise<void> {
    const client = await this.connection.client;
    const key = securityAuditCounterKey;

    await client.runCommand("rpush", [key, JSON.stringify(record)]);
    await client.runCommand("ltrim", [key, "-2000", "-1"]);
    await client.runCommand("expire", [key, String(this.config.security.audit.counterTtlSeconds)]);
  }

  async reset(): Promise<void> {
    const client = await this.connection.client;

    await client.runCommand("del", [securityAuditCounterKey]);
  }

  async snapshot(
    windowSeconds = this.config.security.audit.counterWindowSeconds,
    nowMs = Date.now(),
  ): Promise<SecurityAuditCounterSnapshot> {
    const client = await this.connection.client;
    const values = await client.runCommand("lrange", [securityAuditCounterKey, "0", "-1"]);

    return summarizeSecurityAuditCounters(readCounterRecords(values), windowSeconds, nowMs);
  }

  async close(): Promise<void> {
    await this.connection.close();
  }
}

export function createMemorySecurityAuditStore(): SecurityAuditStore & {
  readonly events: SecurityAuditEventInput[];
} {
  const events: SecurityAuditEventInput[] = [];

  return {
    backend: "memory",
    events,
    async record(event) {
      events.push(event);
    },
  };
}

export function createMemorySecurityAuditCounterStore(): SecurityAuditCounterStore & {
  readonly records: SecurityAuditCounterRecord[];
} {
  const records: SecurityAuditCounterRecord[] = [];

  return {
    backend: "memory",
    records,
    async record(record) {
      records.push(record);
    },
    async reset() {
      records.splice(0, records.length);
    },
    async snapshot(windowSeconds = 300, nowMs = Date.now()) {
      return summarizeSecurityAuditCounters(records, windowSeconds, nowMs);
    },
  };
}

export function summarizeSecurityAuditCounters(
  inputRecords: readonly SecurityAuditCounterRecord[],
  windowSeconds: number,
  nowMs = Date.now(),
): SecurityAuditCounterSnapshot {
  const cutoffMs = nowMs - windowSeconds * 1000;
  const records = inputRecords.filter((record) => record.timestampMs >= cutoffMs);
  const snapshot: SecurityAuditCounterSnapshot = {
    byEventType: {},
    byOutcome: {},
    byReasonCode: {},
    byRouteGroup: {},
    total: records.length,
    windowSeconds,
  };

  for (const record of records) {
    increment(snapshot.byEventType, record.eventType);
    increment(snapshot.byOutcome, record.outcome);
    increment(snapshot.byReasonCode, record.reasonCode);
    increment(snapshot.byRouteGroup, record.routeGroup);
  }

  return snapshot;
}

export function createSecurityAuditActorFromRequest(
  request: SecurityAuditRequestLike | undefined,
): SecurityAuditActor {
  if (request?.apiKeyScope !== undefined) {
    return {
      accountId: request.apiKeyScope.accountId ?? null,
      apiKeyId: request.apiKeyScope.apiKeyId,
      projectId: request.apiKeyScope.projectId,
      tenantId: request.apiKeyScope.tenantId,
      type: "api_key",
    };
  }

  if (request?.raw?.adminSession !== undefined) {
    return {
      type: "admin_session",
      username: request.raw.adminSession.username,
    };
  }

  return {
    type: "anonymous",
  };
}

const securityAuditCounterKey = "fococontext:security-audit-counters";

function createSecurityAuditEventId(): string {
  return `audit_${randomUUID().replaceAll("-", "")}`;
}

function sanitizeAuditMetadata(
  metadata: Record<string, unknown>,
  maxBytes: number,
): Record<string, unknown> {
  const safe: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(metadata)) {
    if (isSensitiveMetadataKey(key)) {
      safe[key] = "[redacted]";
      continue;
    }

    safe[key] = sanitizeAuditMetadataValue(value);
  }

  const encoded = JSON.stringify(safe);

  if (Buffer.byteLength(encoded, "utf8") <= maxBytes) {
    return safe;
  }

  return {
    truncated: true,
  };
}

function sanitizeAuditMetadataValue(value: unknown): unknown {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "string") {
    return value.length > 256 ? `${value.slice(0, 256)}...` : value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => sanitizeAuditMetadataValue(item));
  }
  if (typeof value === "object") {
    return sanitizeAuditMetadata(value as Record<string, unknown>, 1024);
  }

  return String(value);
}

function isSensitiveMetadataKey(key: string): boolean {
  return /api[_-]?key|authorization|cookie|credential|password|private[_-]?key|secret|session|token/iu.test(
    key,
  );
}

function readCounterRecords(value: unknown): SecurityAuditCounterRecord[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (typeof item !== "string") {
      return [];
    }

    try {
      const parsed = JSON.parse(item) as SecurityAuditCounterRecord;

      if (
        typeof parsed.eventType === "string" &&
        typeof parsed.routeGroup === "string" &&
        typeof parsed.reasonCode === "string" &&
        typeof parsed.timestampMs === "number" &&
        (parsed.outcome === "blocked" ||
          parsed.outcome === "failure" ||
          parsed.outcome === "success")
      ) {
        return [parsed];
      }
    } catch {
      return [];
    }

    return [];
  });
}

function increment(counters: Record<string, number>, key: string): void {
  counters[key] = (counters[key] ?? 0) + 1;
}
