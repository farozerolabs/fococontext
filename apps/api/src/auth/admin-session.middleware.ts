import { Injectable, NestMiddleware } from "@nestjs/common";
import type { IncomingMessage } from "node:http";
import { ApiError } from "@fococontext/contracts";
import type { FastifyReply, FastifyRequest } from "fastify";

import {
  adminSessionCookieName,
  type AdminSession,
  AdminAuthService,
} from "./admin-auth.service.js";
import { SecurityAuditService } from "../security/security-audit.js";

export type AdminSessionCarrier = IncomingMessage & {
  adminSession?: AdminSession;
  adminSessionToken?: string;
};

export type AdminSessionRequest = FastifyRequest & {
  raw: AdminSessionCarrier;
};

export const adminCsrfHeaderName = "x-fococontext-csrf";
export const adminCsrfHeaderValue = "1";

@Injectable()
export class AdminSessionMiddleware implements NestMiddleware {
  constructor(
    private readonly authService: AdminAuthService,
    private readonly auditService: SecurityAuditService,
  ) {}

  async use(
    request: AdminSessionCarrier,
    _reply: FastifyReply,
    next: (error?: unknown) => void,
  ): Promise<void> {
    try {
      const token = parseCookieHeader(request.headers.cookie)[adminSessionCookieName];

      if (token !== undefined) {
        const session = await this.authService.getSession(token);

        if (session !== undefined) {
          request.adminSession = session;
          request.adminSessionToken = token;
        }
      }

      if (request.adminSession !== undefined && requiresAdminCsrfProof(request)) {
        await this.auditService.record({
          actor: {
            type: "admin_session",
            username: request.adminSession.username,
          },
          eventType: "admin_csrf_failed",
          outcome: "blocked",
          reasonCode: "missing_csrf_proof",
          requestId: null,
          routeGroup: "admin_session",
        });
        throw new ApiError("forbidden", {
          messageKey: "api.validation.admin_csrf_required",
        });
      }

      next();
    } catch (error) {
      next(error);
    }
  }
}

function parseCookieHeader(cookieHeader: string | undefined): Record<string, string> {
  if (cookieHeader === undefined) {
    return {};
  }

  return Object.fromEntries(
    cookieHeader
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const separatorIndex = part.indexOf("=");

        if (separatorIndex === -1) {
          return [part, ""];
        }

        return [part.slice(0, separatorIndex), decodeURIComponent(part.slice(separatorIndex + 1))];
      }),
  );
}

function requiresAdminCsrfProof(request: AdminSessionCarrier): boolean {
  if (isSafeMethod(request.method)) {
    return false;
  }

  return readHeaderValue(request.headers[adminCsrfHeaderName]) !== adminCsrfHeaderValue;
}

function isSafeMethod(method: string | undefined): boolean {
  return method === undefined || ["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase());
}

function readHeaderValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
