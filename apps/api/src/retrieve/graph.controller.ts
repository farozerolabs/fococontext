import { Controller, Get, Param, Query, Req } from "@nestjs/common";
import { createRequestId, createSuccessEnvelope } from "@fococontext/contracts";
import type { RetrievalRelationType } from "@fococontext/retrieval";

import { requireApiKeyScope, type ApiKeyRequest } from "../auth/api-key.guard.js";
import { KnowledgeBaseService } from "../knowledge-bases/knowledge-base.service.js";
import { RetrieveService } from "./retrieve.service.js";

interface GraphQuery {
  page_id?: string;
  depth?: string;
  edge_reason?: RetrievalRelationType;
  page_type?: string;
}

@Controller("v1/knowledge-bases/:knowledgeBaseId/graph")
export class GraphController {
  constructor(
    private readonly retrieveService: RetrieveService,
    private readonly knowledgeBaseService: KnowledgeBaseService,
  ) {}

  @Get()
  async graph(
    @Param("knowledgeBaseId") knowledgeBaseId: string,
    @Query() query: GraphQuery,
    @Req() request: ApiKeyRequest,
  ) {
    const scope = requireApiKeyScope(request);

    this.knowledgeBaseService.assertReadableKnowledgeBase(knowledgeBaseId, scope);
    return createSuccessEnvelope(
      await this.retrieveService.graph(
        knowledgeBaseId,
        {
          ...(query.page_id === undefined ? {} : { page_id: query.page_id }),
          ...(query.depth === undefined ? {} : { depth: parsePositiveInteger(query.depth, 1) }),
          ...(query.edge_reason === undefined ? {} : { edge_reason: query.edge_reason }),
          ...(query.page_type === undefined ? {} : { page_type: query.page_type }),
        },
        scope,
      ),
      createRequestId(),
    );
  }

  @Get("insights")
  async insights(@Param("knowledgeBaseId") knowledgeBaseId: string, @Req() request: ApiKeyRequest) {
    const scope = requireApiKeyScope(request);

    this.knowledgeBaseService.assertReadableKnowledgeBase(knowledgeBaseId, scope);
    return createSuccessEnvelope(
      await this.retrieveService.graphInsights(knowledgeBaseId, scope),
      createRequestId(),
    );
  }
}

function parsePositiveInteger(value: string, fallback: number): number {
  const parsed = Number(value);

  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}
