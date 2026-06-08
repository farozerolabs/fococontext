import { createHash } from "node:crypto";
import { sql, type Kysely } from "kysely";
import type { DatabaseSchema, DefaultIdentitySeed } from "@fococontext/db";

import {
  compareApiKeyConstantTime,
  type ApiKeyResolver,
  type ApiKeyScope,
} from "./api-key.guard.js";

export const envBootstrapApiKeyId = "api_key_env_default";

export interface PersistedApiKeyRow {
  id: string;
  tenantId: string;
  projectId: string;
  accountId: string | null;
  keyHash: string;
  permissions: string[] | string | null;
  status: string;
  expiresAt: Date | string | null;
}

export interface PersistedApiKeyResolution {
  rowId: string;
  scope: ApiKeyScope;
}

export function createApiKeyHash(secret: string): string {
  return `sha256:${createHash("sha256").update(secret, "utf8").digest("hex")}`;
}

export function createApiKeyPrefix(secret: string): string {
  return secret.slice(0, 12);
}

export function createPostgresApiKeyResolver(db: Kysely<DatabaseSchema>): ApiKeyResolver {
  return new PostgresApiKeyResolver(db);
}

export async function upsertEnvBootstrapApiKey(
  db: Kysely<DatabaseSchema>,
  apiKey: string,
  identity: DefaultIdentitySeed,
): Promise<void> {
  await sql`
    insert into api_keys (
      id,
      tenant_id,
      project_id,
      account_id,
      name,
      key_hash,
      key_prefix,
      permissions,
      status,
      expires_at,
      revoked_at,
      created_at,
      updated_at
    )
    values (
      ${envBootstrapApiKeyId},
      ${identity.tenant.id},
      ${identity.project.id},
      ${identity.account.id},
      'Environment bootstrap key',
      ${createApiKeyHash(apiKey)},
      ${createApiKeyPrefix(apiKey)},
      ${toPostgresTextArray(["*"])},
      'active',
      null,
      null,
      now(),
      now()
    )
    on conflict (id) do update set
      tenant_id = excluded.tenant_id,
      project_id = excluded.project_id,
      account_id = excluded.account_id,
      key_hash = excluded.key_hash,
      key_prefix = excluded.key_prefix,
      permissions = excluded.permissions,
      status = excluded.status,
      expires_at = excluded.expires_at,
      revoked_at = excluded.revoked_at,
      updated_at = now()
  `.execute(db);
}

class PostgresApiKeyResolver implements ApiKeyResolver {
  constructor(private readonly db: Kysely<DatabaseSchema>) {}

  async resolveApiKey(candidate: string): Promise<ApiKeyScope | undefined> {
    const rows = await this.loadCandidateRows(createApiKeyPrefix(candidate));
    const resolution = resolvePersistedApiKeyScope(candidate, rows);

    if (resolution !== undefined) {
      await sql`
        update api_keys
        set last_used_at = now()
        where id = ${resolution.rowId}
      `.execute(this.db);
    }

    return resolution?.scope;
  }

  private async loadCandidateRows(prefix: string): Promise<PersistedApiKeyRow[]> {
    const result = await sql<PersistedApiKeyRow>`
      select
        id,
        tenant_id as "tenantId",
        project_id as "projectId",
        account_id as "accountId",
        key_hash as "keyHash",
        permissions,
        status,
        expires_at as "expiresAt"
      from api_keys
      where key_prefix = ${prefix}
    `.execute(this.db);

    return result.rows;
  }
}

export function resolvePersistedApiKeyScope(
  candidate: string,
  rows: readonly PersistedApiKeyRow[],
  now: () => Date = () => new Date(),
): PersistedApiKeyResolution | undefined {
  const candidateHash = createApiKeyHash(candidate);

  for (const row of rows) {
    if (!compareApiKeyConstantTime(candidateHash, row.keyHash)) {
      continue;
    }

    if (!isActiveRow(row, now)) {
      return undefined;
    }

    return {
      rowId: row.id,
      scope: {
        accountId: row.accountId,
        apiKeyId: row.id,
        permissions: readPermissions(row.permissions),
        projectId: row.projectId,
        source: row.id === envBootstrapApiKeyId ? "env_bootstrap" : "persisted",
        tenantId: row.tenantId,
      },
    };
  }

  return undefined;
}

function isActiveRow(row: PersistedApiKeyRow, now: () => Date): boolean {
  if (row.status !== "active") {
    return false;
  }
  if (row.expiresAt === null) {
    return true;
  }

  return new Date(row.expiresAt).getTime() > now().getTime();
}

function readPermissions(value: PersistedApiKeyRow["permissions"]): string[] {
  if (Array.isArray(value)) {
    return value;
  }
  if (typeof value === "string" && value.length > 0) {
    return value
      .replace(/^\{/, "")
      .replace(/\}$/, "")
      .split(",")
      .map((permission) => permission.trim())
      .filter((permission) => permission.length > 0);
  }

  return [];
}

function toPostgresTextArray(values: readonly string[]) {
  return values.length === 0 ? sql`array[]::text[]` : sql`array[${sql.join(values)}]::text[]`;
}
