import { Controller, Get, Req } from "@nestjs/common";
import {
  ApiError,
  createRequestId,
  createSuccessEnvelope,
  openApiDocument,
} from "@fococontext/contracts";

import type { AdminSessionRequest } from "../auth/admin-session.middleware.js";
import {
  createSecurityAuditActorFromRequest,
  SecurityAuditService,
} from "../security/security-audit.js";
import { SystemStatusService } from "./system-status.service.js";

@Controller()
export class SystemStatusController {
  constructor(
    private readonly systemStatusService: SystemStatusService,
    private readonly auditService: SecurityAuditService,
  ) {}

  @Get("health")
  async health() {
    return createSuccessEnvelope(this.systemStatusService.getHealthStatus(), createRequestId());
  }

  @Get("v1/runtime/status")
  async runtimeStatus(@Req() request: AdminSessionRequest) {
    const requestId = createRequestId();
    await this.auditService.record({
      actor: createSecurityAuditActorFromRequest(request),
      eventType: "runtime_diagnostics_accessed",
      outcome: "success",
      reasonCode: "diagnostics_read",
      requestId,
      routeGroup: "diagnostics",
    });

    return createSuccessEnvelope(
      await this.systemStatusService.getRuntimeDiagnosticsStatus(),
      requestId,
    );
  }

  @Get("openapi.json")
  async openapi(@Req() request: AdminSessionRequest) {
    await this.auditService.record({
      actor: createSecurityAuditActorFromRequest(request),
      eventType: "openapi_document_accessed",
      outcome: "success",
      reasonCode: "openapi_read",
      requestId: null,
      routeGroup: "openapi",
    });

    return openApiDocument;
  }

  @Get("v1/openapi.json")
  async versionedOpenapi(@Req() request: AdminSessionRequest) {
    await this.auditService.record({
      actor: createSecurityAuditActorFromRequest(request),
      eventType: "openapi_document_accessed",
      outcome: "success",
      reasonCode: "openapi_read",
      requestId: null,
      routeGroup: "openapi",
    });

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
