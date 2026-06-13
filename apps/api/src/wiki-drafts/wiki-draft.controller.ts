import { Controller, HttpCode, Param, Post, Req } from "@nestjs/common";
import { createRequestId, createSuccessEnvelope } from "@fococontext/contracts";

import { requireApiKeyScope, type ApiKeyRequest } from "../auth/api-key.guard.js";
import { KnowledgeBaseService } from "../knowledge-bases/knowledge-base.service.js";
import { WikiDraftService } from "./wiki-draft.service.js";
import type { SubmitWikiDraftInput } from "./wiki-draft.types.js";

@Controller("v1/knowledge-bases/:knowledgeBaseId/wiki-drafts")
export class WikiDraftController {
  constructor(
    private readonly wikiDraftService: WikiDraftService,
    private readonly knowledgeBaseService: KnowledgeBaseService,
  ) {}

  @Post()
  @HttpCode(200)
  async submit(
    @Param("knowledgeBaseId") knowledgeBaseId: string,
    @Req() request: ApiKeyRequest & { body: SubmitWikiDraftInput },
  ) {
    const scope = requireApiKeyScope(request);

    await this.knowledgeBaseService.assertReadableKnowledgeBase(knowledgeBaseId, scope);
    return createSuccessEnvelope(
      await this.wikiDraftService.submit(knowledgeBaseId, request.body, scope),
      createRequestId(),
    );
  }
}
