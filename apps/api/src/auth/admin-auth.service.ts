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
  clearLoginFailure(scope: string): Promise<void>;
  close?(): Promise<void>;
  deleteSession(token: string): Promise<void>;
  getSession(token: string): Promise<AdminSession | undefined>;
  getLoginFailureLock(scope: string): Promise<LoginFailureLock | undefined>;
  recordLoginFailure(
    scope: string,
    input: LoginFailureRecordInput,
  ): Promise<LoginFailureLock | undefined>;
  saveSession(session: AdminSession, ttlSeconds: number): Promise<void>;
}

export interface LoginFailureLock {
  retryAfterSeconds: number;
}

export interface LoginFailureRecordInput {
  failureLimit: number;
  lockoutSeconds: number;
  windowSeconds: number;
}

export interface AdminSessionCookieOptions {
  sameSite: "lax" | "none" | "strict";
  secure: boolean;
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

  getLoginFailureScope(username: string, clientAddress: string | undefined): string {
    const normalizedUsername = normalizeLoginScopePart(username);
    const normalizedAddress = normalizeLoginScopePart(clientAddress ?? "unknown");

    return `${normalizedAddress}:${normalizedUsername}`;
  }

  async getLoginFailureLock(scope: string): Promise<LoginFailureLock | undefined> {
    return this.sessionStore.getLoginFailureLock(scope);
  }

  async recordLoginFailure(scope: string): Promise<LoginFailureLock | undefined> {
    return this.sessionStore.recordLoginFailure(scope, {
      failureLimit: this.config.admin.loginFailureLimit,
      lockoutSeconds: this.config.admin.loginLockoutSeconds,
      windowSeconds: this.config.admin.loginFailureWindowSeconds,
    });
  }

  async clearLoginFailure(scope: string): Promise<void> {
    await this.sessionStore.clearLoginFailure(scope);
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

  getSessionCookieOptions(): AdminSessionCookieOptions {
    return {
      sameSite: this.config.admin.cookieSameSite,
      secure: this.config.admin.cookieSecure,
    };
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

  async getLoginFailureLock(scope: string): Promise<LoginFailureLock | undefined> {
    const client = await this.connection.client;
    const ttlMs = await client.runCommand("pttl", [createAdminLoginLockKey(scope)]);

    if (typeof ttlMs !== "number" || ttlMs <= 0) {
      return undefined;
    }

    return { retryAfterSeconds: Math.ceil(ttlMs / 1000) };
  }

  async recordLoginFailure(
    scope: string,
    input: LoginFailureRecordInput,
  ): Promise<LoginFailureLock | undefined> {
    const existingLock = await this.getLoginFailureLock(scope);

    if (existingLock !== undefined) {
      return existingLock;
    }

    const client = await this.connection.client;
    const failureKey = createAdminLoginFailureKey(scope);
    const count = await client.runCommand("incr", [failureKey]);

    if (count === 1) {
      await client.runCommand("expire", [failureKey, String(input.windowSeconds)]);
    }

    if (typeof count === "number" && count >= input.failureLimit) {
      await client.runCommand("set", [
        createAdminLoginLockKey(scope),
        "1",
        "EX",
        String(input.lockoutSeconds),
      ]);
      await client.runCommand("del", [failureKey]);

      return { retryAfterSeconds: input.lockoutSeconds };
    }

    return undefined;
  }

  async clearLoginFailure(scope: string): Promise<void> {
    const client = await this.connection.client;

    await client.runCommand("del", [
      createAdminLoginFailureKey(scope),
      createAdminLoginLockKey(scope),
    ]);
  }
}

export function serializeAdminSessionCookie(
  token: string,
  options: AdminSessionCookieOptions = { sameSite: "lax", secure: false },
): string {
  return [
    `${adminSessionCookieName}=${encodeURIComponent(token)}`,
    ...createAdminSessionCookieAttributes(options),
  ].join("; ");
}

export function expireAdminSessionCookie(
  options: AdminSessionCookieOptions = { sameSite: "lax", secure: false },
): string {
  return [
    `${adminSessionCookieName}=`,
    ...createAdminSessionCookieAttributes(options),
    "Max-Age=0",
  ].join("; ");
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

function createAdminLoginFailureKey(scope: string): string {
  return `fococontext:admin-login-failure:${encodeURIComponent(scope)}`;
}

function createAdminLoginLockKey(scope: string): string {
  return `fococontext:admin-login-lock:${encodeURIComponent(scope)}`;
}

function normalizeLoginScopePart(value: string): string {
  const normalized = value.trim().toLowerCase();

  return normalized.length === 0 ? "unknown" : normalized;
}

function createAdminSessionCookieAttributes(options: AdminSessionCookieOptions): string[] {
  return [
    "Path=/",
    "HttpOnly",
    `SameSite=${formatCookieSameSite(options.sameSite)}`,
    ...(options.secure ? ["Secure"] : []),
  ];
}

function formatCookieSameSite(value: AdminSessionCookieOptions["sameSite"]): string {
  if (value === "none") {
    return "None";
  }

  if (value === "strict") {
    return "Strict";
  }

  return "Lax";
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
