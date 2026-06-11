import { Body, Controller, Headers, HttpCode, Param, Post, Req } from "@nestjs/common";
import { createRequestId, createSuccessEnvelope } from "@fococontext/contracts";

import { requireApiKeyScope, type ApiKeyRequest } from "../auth/api-key.guard.js";
import { KnowledgeBaseService } from "../knowledge-bases/knowledge-base.service.js";
import { ForkSubmissionService } from "./fork-submission.service.js";
import type { CreateForkSubmissionInput } from "./fork-submission.types.js";

@Controller("v1/forks/:forkId/submissions")
export class ForkSubmissionController {
  constructor(
    private readonly forkSubmissionService: ForkSubmissionService,
    private readonly knowledgeBaseService: KnowledgeBaseService,
  ) {}

  @Post()
  @HttpCode(201)
  async create(
    @Param("forkId") forkId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: CreateForkSubmissionInput,
    @Req() request: ApiKeyRequest,
  ) {
    const scope = requireApiKeyScope(request);

    await this.knowledgeBaseService.assertReadableKnowledgeBase(forkId, scope);
    return createSuccessEnvelope(
      await this.forkSubmissionService.create(forkId, body, idempotencyKey, scope),
      createRequestId(),
    );
  }
}
