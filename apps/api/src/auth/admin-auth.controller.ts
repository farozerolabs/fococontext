import { Body, Controller, Get, HttpCode, Post, Req, Res } from "@nestjs/common";
import { ApiError, createRequestId, createSuccessEnvelope } from "@fococontext/contracts";
import type { FastifyReply } from "fastify";

import {
  adminSessionCookieName,
  AdminAuthService,
  expireAdminSessionCookie,
  serializeAdminSessionCookie,
} from "./admin-auth.service.js";
import type { AdminSessionRequest } from "./admin-session.middleware.js";
import { SecurityAuditService } from "../security/security-audit.js";

interface LoginBody {
  username?: string;
  password?: string;
}

@Controller("admin/auth")
export class AdminAuthController {
  constructor(
    private readonly authService: AdminAuthService,
    private readonly auditService: SecurityAuditService,
  ) {}

  @Post("login")
  @HttpCode(200)
  async login(
    @Req() request: AdminSessionRequest,
    @Body() body: LoginBody,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const username = body.username ?? "";
    const password = body.password ?? "";
    const loginFailureScope = this.authService.getLoginFailureScope(username, request.ip);
    const loginFailureLock = await this.authService.getLoginFailureLock(loginFailureScope);

    if (loginFailureLock !== undefined) {
      await this.auditService.record({
        actor: {
          type: "anonymous",
          username,
        },
        eventType: "admin_login_blocked",
        outcome: "blocked",
        reasonCode: "admin_login_rate_limited",
        requestId: null,
        routeGroup: "login",
      });
      throw new ApiError("rate_limited", {
        messageKey: "api.validation.admin_login_rate_limited",
        details: {
          retry_after_seconds: loginFailureLock.retryAfterSeconds,
        },
      });
    }

    if (!this.authService.verifyCredentials(username, password)) {
      await this.authService.recordLoginFailure(loginFailureScope);
      await this.auditService.record({
        actor: {
          type: "anonymous",
          username,
        },
        eventType: "admin_login_failed",
        outcome: "failure",
        reasonCode: "invalid_admin_credentials",
        requestId: null,
        routeGroup: "login",
      });
      throw new ApiError("forbidden", {
        messageKey: "api.validation.invalid_admin_credentials",
      });
    }

    await this.authService.clearLoginFailure(loginFailureScope);
    const session = await this.authService.createSession(username);
    const requestId = createRequestId();
    await this.auditService.record({
      actor: {
        type: "admin_session",
        username: session.username,
      },
      eventType: "admin_login_succeeded",
      outcome: "success",
      reasonCode: "authenticated",
      requestId,
      routeGroup: "login",
    });
    reply.header(
      "set-cookie",
      serializeAdminSessionCookie(session.token, this.authService.getSessionCookieOptions()),
    );

    return createSuccessEnvelope(
      {
        authenticated: true,
        username: session.username,
      },
      requestId,
    );
  }

  @Get("session")
  session(@Req() request: AdminSessionRequest) {
    if (request.raw.adminSession === undefined) {
      throw new ApiError("forbidden", {
        messageKey: "api.validation.admin_session_required",
      });
    }

    return createSuccessEnvelope(
      {
        authenticated: true,
        username: request.raw.adminSession.username,
      },
      createRequestId(),
    );
  }

  @Post("logout")
  @HttpCode(200)
  async logout(
    @Req() request: AdminSessionRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    if (request.raw.adminSessionToken !== undefined) {
      await this.authService.deleteSession(request.raw.adminSessionToken);
    }
    const requestId = createRequestId();
    await this.auditService.record({
      actor: {
        type: "admin_session",
        username: request.raw.adminSession?.username ?? null,
      },
      eventType: "admin_logout",
      outcome: "success",
      reasonCode: "logout_requested",
      requestId,
      routeGroup: "login",
    });

    reply.header(
      "set-cookie",
      expireAdminSessionCookie(this.authService.getSessionCookieOptions()),
    );

    return createSuccessEnvelope(
      {
        authenticated: false,
        cookie: adminSessionCookieName,
      },
      requestId,
    );
  }
}
