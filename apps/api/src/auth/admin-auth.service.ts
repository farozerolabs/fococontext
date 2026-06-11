import { Inject, Injectable, type OnModuleDestroy } from "@nestjs/common";
import { RedisConnection } from "bullmq";
import { randomBytes, timingSafeEqual } from "node:crypto";
import type { RuntimeConfig } from "@fococontext/core";

import { runtimeConfigToken } from "../runtime-config.provider.js";

export const adminSessionCookieName = "fococontext_admin_session";

export interface AdminSession {
  token: string;
  username: string;
  createdAt: Date;
}

export interface AdminSessionStore {
  readonly backend: "redis";
  close?(): Promise<void>;
  deleteSession(token: string): Promise<void>;
  getSession(token: string): Promise<AdminSession | undefined>;
  saveSession(session: AdminSession, ttlSeconds: number): Promise<void>;
}

export const adminSessionStoreToken = Symbol("adminSessionStore");

@Injectable()
export class AdminAuthService implements OnModuleDestroy {
  constructor(
    @Inject(runtimeConfigToken) private readonly config: RuntimeConfig,
    @Inject(adminSessionStoreToken) private readonly sessionStore: AdminSessionStore,
  ) {}

  async onModuleDestroy(): Promise<void> {
    await this.sessionStore.close?.();
  }

  verifyCredentials(username: string, password: string): boolean {
    return (
      username === this.config.admin.username && safeEqual(password, this.config.admin.password)
    );
  }

  async createSession(username: string): Promise<AdminSession> {
    const session: AdminSession = {
      token: randomBytes(32).toString("base64url"),
      username,
      createdAt: new Date(),
    };
    await this.sessionStore.saveSession(session, this.config.admin.sessionTtlSeconds);

    return session;
  }

  async getSession(token: string): Promise<AdminSession | undefined> {
    return this.sessionStore.getSession(token);
  }

  async deleteSession(token: string): Promise<void> {
    await this.sessionStore.deleteSession(token);
  }
}

export function createRedisAdminSessionStore(config: RuntimeConfig): AdminSessionStore {
  return new RedisAdminSessionStore(config);
}

class RedisAdminSessionStore implements AdminSessionStore {
  readonly backend = "redis";

  private readonly connection: RedisConnection;

  constructor(config: RuntimeConfig) {
    this.connection = new RedisConnection({
      url: config.redis.url,
    });
  }

  async close(): Promise<void> {
    await this.connection.close();
  }

  async saveSession(session: AdminSession, ttlSeconds: number): Promise<void> {
    const client = await this.connection.client;

    await client.runCommand("set", [
      createAdminSessionKey(session.token),
      JSON.stringify({
        username: session.username,
        createdAt: session.createdAt.toISOString(),
      }),
      "EX",
      String(ttlSeconds),
    ]);
  }

  async getSession(token: string): Promise<AdminSession | undefined> {
    const client = await this.connection.client;
    const value = await client.runCommand("get", [createAdminSessionKey(token)]);

    if (typeof value !== "string") {
      return undefined;
    }

    return parseAdminSessionValue(token, value);
  }

  async deleteSession(token: string): Promise<void> {
    const client = await this.connection.client;

    await client.runCommand("del", [createAdminSessionKey(token)]);
  }
}

export function serializeAdminSessionCookie(token: string): string {
  return `${adminSessionCookieName}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax`;
}

export function expireAdminSessionCookie(): string {
  return `${adminSessionCookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

function safeEqual(left: string, right: string): boolean {
  const maxLength = Math.max(left.length, right.length);
  const leftBuffer = Buffer.from(left.padEnd(maxLength));
  const rightBuffer = Buffer.from(right.padEnd(maxLength));

  return timingSafeEqual(leftBuffer, rightBuffer) && left.length === right.length;
}

function createAdminSessionKey(token: string): string {
  return `fococontext:admin-session:${encodeURIComponent(token)}`;
}

function parseAdminSessionValue(token: string, value: string): AdminSession | undefined {
  const parsed = safeParseJson(value);

  if (
    parsed === null ||
    typeof parsed !== "object" ||
    typeof parsed.username !== "string" ||
    typeof parsed.createdAt !== "string"
  ) {
    return undefined;
  }

  const createdAt = new Date(parsed.createdAt);

  if (Number.isNaN(createdAt.getTime())) {
    return undefined;
  }

  return {
    token,
    username: parsed.username,
    createdAt,
  };
}

function safeParseJson(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value);

    return typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}
