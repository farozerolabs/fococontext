import { Injectable, NestMiddleware } from "@nestjs/common";
import type { IncomingMessage } from "node:http";
import type { FastifyReply, FastifyRequest } from "fastify";

import {
  adminSessionCookieName,
  type AdminSession,
  AdminAuthService,
} from "./admin-auth.service.js";

export type AdminSessionCarrier = IncomingMessage & {
  adminSession?: AdminSession;
  adminSessionToken?: string;
};

export type AdminSessionRequest = FastifyRequest & {
  raw: AdminSessionCarrier;
};

@Injectable()
export class AdminSessionMiddleware implements NestMiddleware {
  constructor(private readonly authService: AdminAuthService) {}

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
