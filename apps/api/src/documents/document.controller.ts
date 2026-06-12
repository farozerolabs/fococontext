import {
  Controller,
  Delete,
  Get,
  Body,
  Headers,
  HttpCode,
  Inject,
  Param,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import {
  ApiError,
  createListEnvelope,
  createRequestId,
  createSuccessEnvelope,
} from "@fococontext/contracts";
import type { RuntimeConfig } from "@fococontext/core";

import { DocumentService, type MultipartRequest } from "./document.service.js";
import { requireApiKeyScope, type ApiKeyRequest } from "../auth/api-key.guard.js";
import { parsePaginationQuery } from "../http/pagination.js";
import { KnowledgeBaseService } from "../knowledge-bases/knowledge-base.service.js";
import { runtimeConfigToken } from "../runtime-config.provider.js";
import {
  documentProcessingStages,
  documentProcessingUnitStatuses,
  type DocumentProcessingStage,
  type DocumentProcessingUnitStatus,
  sourceDocumentStatuses,
  sourceTypes,
  type SourceDocumentStatus,
  type SourceType,
} from "./document.types.js";

interface CreateTextSourceBody {
  name?: string;
  text?: string;
  source_path?: string;
  metadata?: Record<string, unknown>;
}

interface CreateUrlSourceBody {
  url?: string;
  name?: string;
  source_path?: string;
  metadata?: Record<string, unknown>;
}

interface CreateUploadSessionBody {
  file_name?: string;
  display_name?: string;
  mime_type?: string;
  size?: number;
  content_hash?: string;
  source_path?: string;
  metadata?: Record<string, unknown>;
}

interface FinalizeUploadSessionBody {
  content_hash?: string;
}

interface DocumentListQuery {
  page?: string;
  page_size?: string;
  keyword?: string;
  status?: string;
  source_type?: string;
}

interface MediaAssetListQuery {
  page?: string;
  page_size?: string;
}

interface ProcessingUnitListQuery {
  job_id?: string;
  page?: string;
  page_size?: string;
  stage?: string;
  status?: string;
}

interface SourceEvidenceQuery {
  allow_fallback?: string;
  context_chars?: string;
  evidence_kind?: string;
  knowledge_base_id?: string;
  locator?: string;
  max_chars?: string;
  media_asset_id?: string;
}

interface SourceEvidenceResolveBody {
  items?: unknown;
}

interface OcrRetryBody {
  mode?: string;
  page_numbers?: unknown;
}

@Controller("v1/knowledge-bases/:knowledgeBaseId/documents")
export class DocumentController {
  constructor(
    private readonly documentService: DocumentService,
    private readonly knowledgeBaseService: KnowledgeBaseService,
  ) {}

  @Get()
  async list(
    @Param("knowledgeBaseId") knowledgeBaseId: string,
    @Query() query: DocumentListQuery,
    @Req() request: ApiKeyRequest,
  ) {
    const scope = requireApiKeyScope(request);
    await this.knowledgeBaseService.assertReadableKnowledgeBase(knowledgeBaseId, scope);
    const result = await this.documentService.listDocuments(
      knowledgeBaseId,
      {
        ...parsePaginationQuery(query),
        ...(query.keyword === undefined ? {} : { keyword: query.keyword }),
        ...(query.status === undefined ? {} : { status: readDocumentStatus(query.status) }),
        ...(query.source_type === undefined
          ? {}
          : { sourceType: readSourceType(query.source_type) }),
      },
      scope,
    );

    return createListEnvelope(result.items, {
      page: result.page,
      page_size: result.pageSize,
      total: result.total,
      has_more: result.hasMore,
      requestId: createRequestId(),
    });
  }

  @Post("text")
  @HttpCode(201)
  async createTextSource(
    @Param("knowledgeBaseId") knowledgeBaseId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Req() request: ApiKeyRequest & { body: CreateTextSourceBody },
  ) {
    const scope = requireApiKeyScope(request);
    await this.knowledgeBaseService.assertReadableKnowledgeBase(knowledgeBaseId, scope);
    return createSuccessEnvelope(
      await this.documentService.createTextSource(
        knowledgeBaseId,
        request.body,
        idempotencyKey,
        scope,
      ),
      createRequestId(),
    );
  }

  @Post("url")
  @HttpCode(201)
  async createUrlSource(
    @Param("knowledgeBaseId") knowledgeBaseId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Req() request: ApiKeyRequest & { body: CreateUrlSourceBody },
  ) {
    const scope = requireApiKeyScope(request);
    await this.knowledgeBaseService.assertReadableKnowledgeBase(knowledgeBaseId, scope);
    return createSuccessEnvelope(
      await this.documentService.createUrlSource(
        knowledgeBaseId,
        request.body,
        idempotencyKey,
        scope,
      ),
      createRequestId(),
    );
  }

  @Post("upload-sessions")
  @HttpCode(201)
  async createUploadSession(
    @Param("knowledgeBaseId") knowledgeBaseId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Req() request: ApiKeyRequest & { body: CreateUploadSessionBody },
  ) {
    const scope = requireApiKeyScope(request);
    await this.knowledgeBaseService.assertReadableKnowledgeBase(knowledgeBaseId, scope);
    return createSuccessEnvelope(
      await this.documentService.createUploadSession(
        knowledgeBaseId,
        request.body,
        idempotencyKey,
        scope,
      ),
      createRequestId(),
    );
  }

  @Post("upload-sessions/:uploadSessionId/finalize")
  @HttpCode(201)
  async finalizeUploadSession(
    @Param("knowledgeBaseId") knowledgeBaseId: string,
    @Param("uploadSessionId") uploadSessionId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Req() request: ApiKeyRequest & { body: FinalizeUploadSessionBody },
  ) {
    const scope = requireApiKeyScope(request);
    await this.knowledgeBaseService.assertReadableKnowledgeBase(knowledgeBaseId, scope);
    return createSuccessEnvelope(
      await this.documentService.finalizeUploadSession(
        knowledgeBaseId,
        uploadSessionId,
        request.body,
        idempotencyKey,
        scope,
      ),
      createRequestId(),
    );
  }

  @Post()
  @HttpCode(201)
  async upload(
    @Param("knowledgeBaseId") knowledgeBaseId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Req() request: MultipartRequest & ApiKeyRequest,
  ) {
    const scope = requireApiKeyScope(request);
    await this.knowledgeBaseService.assertReadableKnowledgeBase(knowledgeBaseId, scope);
    return createSuccessEnvelope(
      await this.documentService.uploadMultipart(knowledgeBaseId, request, idempotencyKey, scope),
      createRequestId(),
    );
  }
}

@Controller("v1/documents")
export class DocumentLookupController {
  constructor(
    private readonly documentService: DocumentService,
    @Inject(runtimeConfigToken) private readonly runtimeConfig: RuntimeConfig,
  ) {}

  @Get(":documentId/evidence")
  async evidence(
    @Param("documentId") documentId: string,
    @Query() query: SourceEvidenceQuery,
    @Req() request: ApiKeyRequest,
  ) {
    return createSuccessEnvelope(
      await this.documentService.getSourceEvidence(documentId, query, requireApiKeyScope(request)),
      createRequestId(),
    );
  }

  @Get(":documentId/parsed-content")
  async parsedContent(@Param("documentId") documentId: string, @Req() request: ApiKeyRequest) {
    return createSuccessEnvelope(
      await this.documentService.getParsedContent(documentId, requireApiKeyScope(request)),
      createRequestId(),
    );
  }

  @Get(":documentId/media-assets")
  async mediaAssets(
    @Param("documentId") documentId: string,
    @Query() query: MediaAssetListQuery,
    @Req() request: ApiKeyRequest,
  ) {
    const result = await this.documentService.listMediaAssets(
      documentId,
      {
        ...parsePaginationQuery(query),
      },
      requireApiKeyScope(request),
    );

    return createListEnvelope(result.items, {
      page: result.page,
      page_size: result.pageSize,
      total: result.total,
      has_more: result.hasMore,
      requestId: createRequestId(),
    });
  }

  @Get(":documentId/processing-units")
  async processingUnits(
    @Param("documentId") documentId: string,
    @Query() query: ProcessingUnitListQuery,
    @Req() request: ApiKeyRequest,
  ) {
    const result = await this.documentService.listDocumentProcessingUnits(
      documentId,
      {
        ...parsePaginationQuery(query, {
          defaultPageSize: this.runtimeConfig.limits.documentProcessing.detailDefaultPageSize,
          maxPageSize: this.runtimeConfig.limits.documentProcessing.detailMaxPageSize,
        }),
        ...(query.job_id === undefined ? {} : { jobId: query.job_id }),
        ...(query.stage === undefined ? {} : { stage: readDocumentProcessingStage(query.stage) }),
        ...(query.status === undefined
          ? {}
          : { status: readDocumentProcessingUnitStatus(query.status) }),
      },
      requireApiKeyScope(request),
    );

    return createListEnvelope(result.items, {
      page: result.page,
      page_size: result.pageSize,
      total: result.total,
      has_more: result.hasMore,
      requestId: createRequestId(),
    });
  }

  @Get(":documentId")
  async detail(@Param("documentId") documentId: string, @Req() request: ApiKeyRequest) {
    return createSuccessEnvelope(
      await this.documentService.getDocumentDetail(documentId, requireApiKeyScope(request)),
      createRequestId(),
    );
  }

  @Delete(":documentId")
  @HttpCode(200)
  async delete(@Param("documentId") documentId: string, @Req() request: ApiKeyRequest) {
    return createSuccessEnvelope(
      await this.documentService.deleteDocument(documentId, requireApiKeyScope(request)),
      createRequestId(),
    );
  }

  @Post(":documentId/delete-preview")
  @HttpCode(200)
  async deletePreview(@Param("documentId") documentId: string, @Req() request: ApiKeyRequest) {
    return createSuccessEnvelope(
      await this.documentService.previewDelete(documentId, requireApiKeyScope(request)),
      createRequestId(),
    );
  }

  @Post(":documentId/reingest")
  @HttpCode(201)
  async reingest(@Param("documentId") documentId: string, @Req() request: ApiKeyRequest) {
    return createSuccessEnvelope(
      await this.documentService.reingestDocument(documentId, requireApiKeyScope(request)),
      createRequestId(),
    );
  }

  @Post(":documentId/ocr/retry")
  @HttpCode(202)
  async retryOcr(
    @Param("documentId") documentId: string,
    @Body() body: OcrRetryBody,
    @Req() request: ApiKeyRequest,
  ) {
    return createSuccessEnvelope(
      await this.documentService.retrySourceDocumentOcr(
        documentId,
        body,
        requireApiKeyScope(request),
      ),
      createRequestId(),
    );
  }
}

@Controller("v1/source-evidence")
export class SourceEvidenceController {
  constructor(private readonly documentService: DocumentService) {}

  @Post("resolve")
  @HttpCode(200)
  async resolve(@Req() request: ApiKeyRequest & { body: SourceEvidenceResolveBody }) {
    return createSuccessEnvelope(
      await this.documentService.resolveSourceEvidenceBatch(
        request.body,
        requireApiKeyScope(request),
      ),
      createRequestId(),
    );
  }
}

@Controller("v1/media-assets")
export class MediaAssetController {
  constructor(private readonly documentService: DocumentService) {}

  @Get(":mediaAssetId/preview")
  async preview(@Param("mediaAssetId") mediaAssetId: string, @Req() request: ApiKeyRequest) {
    return createSuccessEnvelope(
      await this.documentService.getMediaAssetPreview(mediaAssetId, requireApiKeyScope(request)),
      createRequestId(),
    );
  }

  @Post(":mediaAssetId/caption/retry")
  @HttpCode(202)
  async retryCaption(@Param("mediaAssetId") mediaAssetId: string, @Req() request: ApiKeyRequest) {
    return createSuccessEnvelope(
      await this.documentService.retryMediaAssetCaption(mediaAssetId, requireApiKeyScope(request)),
      createRequestId(),
    );
  }
}

function readDocumentStatus(value: string): SourceDocumentStatus {
  if (sourceDocumentStatuses.includes(value as SourceDocumentStatus)) {
    return value as SourceDocumentStatus;
  }

  throw new ApiError("invalid_request", {
    messageKey: "api.validation.document_status_filter_invalid",
    details: {
      fields: ["status"],
    },
  });
}

function readSourceType(value: string): SourceType {
  if (sourceTypes.includes(value as SourceType)) {
    return value as SourceType;
  }

  throw new ApiError("invalid_request", {
    messageKey: "api.validation.document_source_type_filter_invalid",
    details: {
      fields: ["source_type"],
    },
  });
}

function readDocumentProcessingStage(value: string): DocumentProcessingStage {
  if (documentProcessingStages.includes(value as DocumentProcessingStage)) {
    return value as DocumentProcessingStage;
  }

  throw new ApiError("invalid_request", {
    messageKey: "api.validation.document_processing_stage_filter_invalid",
    details: {
      fields: ["stage"],
    },
  });
}

function readDocumentProcessingUnitStatus(value: string): DocumentProcessingUnitStatus {
  if (documentProcessingUnitStatuses.includes(value as DocumentProcessingUnitStatus)) {
    return value as DocumentProcessingUnitStatus;
  }

  throw new ApiError("invalid_request", {
    messageKey: "api.validation.document_processing_status_filter_invalid",
    details: {
      fields: ["status"],
    },
  });
}
