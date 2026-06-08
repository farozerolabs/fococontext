import { Controller, Get, Req } from "@nestjs/common";
import {
  ApiError,
  createRequestId,
  createSuccessEnvelope,
  openApiDocument,
} from "@fococontext/contracts";

import type { AdminSessionRequest } from "../auth/admin-session.middleware.js";
import { SystemStatusService } from "./system-status.service.js";

@Controller()
export class SystemStatusController {
  constructor(private readonly systemStatusService: SystemStatusService) {}

  @Get("health")
  async health() {
    return createSuccessEnvelope(
      await this.systemStatusService.getHealthStatus(),
      createRequestId(),
    );
  }

  @Get("openapi.json")
  openapi() {
    return openApiDocument;
  }

  @Get("v1/openapi.json")
  versionedOpenapi() {
    return openApiDocument;
  }

  @Get("admin/system/settings")
  async settings(@Req() request: AdminSessionRequest) {
    if (request.raw.adminSession === undefined) {
      throw new ApiError("forbidden", {
        messageKey: "api.validation.admin_session_required",
      });
    }

    return createSuccessEnvelope(
      await this.systemStatusService.getSettingsStatus(),
      createRequestId(),
    );
  }
}
