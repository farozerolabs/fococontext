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

interface LoginBody {
  username?: string;
  password?: string;
}

@Controller("admin/auth")
export class AdminAuthController {
  constructor(private readonly authService: AdminAuthService) {}

  @Post("login")
  @HttpCode(200)
  login(@Body() body: LoginBody, @Res({ passthrough: true }) reply: FastifyReply) {
    const username = body.username ?? "";
    const password = body.password ?? "";

    if (!this.authService.verifyCredentials(username, password)) {
      throw new ApiError("forbidden", {
        messageKey: "api.validation.invalid_admin_credentials",
      });
    }

    const session = this.authService.createSession(username);
    reply.header("set-cookie", serializeAdminSessionCookie(session.token));

    return createSuccessEnvelope(
      {
        authenticated: true,
        username: session.username,
      },
      createRequestId(),
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
  logout(@Req() request: AdminSessionRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    if (request.raw.adminSessionToken !== undefined) {
      this.authService.deleteSession(request.raw.adminSessionToken);
    }

    reply.header("set-cookie", expireAdminSessionCookie());

    return createSuccessEnvelope(
      {
        authenticated: false,
        cookie: adminSessionCookieName,
      },
      createRequestId(),
    );
  }
}
