import { Controller, Post } from "@nestjs/common";
import { ApiError } from "@fococontext/contracts";

@Controller("v1/api-keys")
export class ApiKeyBoundaryController {
  @Post()
  create() {
    throw new ApiError("invalid_request", {
      messageKey: "api.validation.api_key_v02_boundary",
      details: {
        capability: "api_key_management",
        auth_mode: "env_api_key",
        supported_in: "v0.2",
        supported_operations: [],
      },
    });
  }
}
