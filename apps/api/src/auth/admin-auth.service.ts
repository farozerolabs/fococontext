import { Inject, Injectable } from "@nestjs/common";
import { randomBytes, timingSafeEqual } from "node:crypto";
import type { RuntimeConfig } from "@fococontext/core";

import { runtimeConfigToken } from "../runtime-config.provider.js";

export const adminSessionCookieName = "fococontext_admin_session";

export interface AdminSession {
  token: string;
  username: string;
  createdAt: Date;
}

@Injectable()
export class AdminAuthService {
  private readonly sessions = new Map<string, AdminSession>();

  constructor(@Inject(runtimeConfigToken) private readonly config: RuntimeConfig) {}

  verifyCredentials(username: string, password: string): boolean {
    return (
      username === this.config.admin.username && safeEqual(password, this.config.admin.password)
    );
  }

  createSession(username: string): AdminSession {
    const session: AdminSession = {
      token: randomBytes(32).toString("base64url"),
      username,
      createdAt: new Date(),
    };

    this.sessions.set(session.token, session);

    return session;
  }

  getSession(token: string): AdminSession | undefined {
    return this.sessions.get(token);
  }

  deleteSession(token: string): void {
    this.sessions.delete(token);
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
