import { DynamicModule, MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import type { RuntimeConfig } from "@fococontext/core";
import type { DefaultIdentitySeed } from "@fococontext/db";
import {
  createOpenAICompatibleChatProvider,
  resolveModelProviderProfiles,
  type ChatProvider,
} from "@fococontext/llm";
import { APP_GUARD } from "@nestjs/core";
import {
  createInMemoryRetrievalRepository,
  type RetrievalEmbeddingProvider,
  type RetrievalRepository,
  type RetrievalRerankProvider,
} from "@fococontext/retrieval";
import {
  createInstrumentedObjectStorageAdapter,
  createS3ObjectStorageAdapter,
  defaultObjectStorageOperationRecorder,
  type ObjectStorageAdapter,
} from "@fococontext/storage";

import { ApiKeyBoundaryController } from "./api-keys/api-key-boundary.controller.js";
import { AdminAuthController } from "./auth/admin-auth.controller.js";
import { AdminAuthService } from "./auth/admin-auth.service.js";
import { AdminSessionMiddleware } from "./auth/admin-session.middleware.js";
import {
  adminSessionApiScopeToken,
  apiKeyResolverToken,
  ApiKeyGuard,
  createAdminSessionApiScope,
  createEnvApiKeyRecord,
  createStaticApiKeyResolver,
  type ApiKeyResolver,
  type StaticApiKeyRecord,
} from "./auth/api-key.guard.js";
import {
  apiDatabaseMirrorToken,
  createNoopApiDatabaseMirror,
  type ApiDatabaseMirror,
} from "./database/api-database-mirror.js";
import {
  apiDatabaseHydratorToken,
  createNoopApiDatabaseHydrator,
  type ApiDatabaseHydrator,
  type ApiDatabaseHydratorRepositories,
} from "./database/api-database-hydrator.js";
import { DeletionCleanupController } from "./deletion-cleanup/deletion-cleanup.controller.js";
import { DeletionCleanupRepository } from "./deletion-cleanup/deletion-cleanup.repository.js";
import { DeletionCleanupManifestCollector } from "./deletion-cleanup/deletion-cleanup.manifest.js";
import { DeletionCleanupService } from "./deletion-cleanup/deletion-cleanup.service.js";
import {
  DocumentController,
  DocumentLookupController,
  MediaAssetController,
  SourceEvidenceController,
} from "./documents/document.controller.js";
import { DocumentRepository } from "./documents/document.repository.js";
import { DocumentService } from "./documents/document.service.js";
import { UploadAdmissionService } from "./documents/upload-admission.service.js";
import {
  JobController,
  KnowledgeBaseIngestProgressController,
  KnowledgeBaseJobController,
} from "./jobs/job.controller.js";
import { JobService } from "./jobs/job.service.js";
import { BatchImportController } from "./imports/batch-import.controller.js";
import { BatchImportService } from "./imports/batch-import.service.js";
import {
  KnowledgeBaseKnowledgeCheckController,
  KnowledgeCheckController,
} from "./knowledge-checks/knowledge-check.controller.js";
import { KnowledgeCheckRepository } from "./knowledge-checks/knowledge-check.repository.js";
import {
  knowledgeCheckChatProviderToken,
  KnowledgeCheckService,
} from "./knowledge-checks/knowledge-check.service.js";
import {
  DatasetConfigurationPresetController,
  ForkController,
  KnowledgeBaseController,
} from "./knowledge-bases/knowledge-base.controller.js";
import { KnowledgeBaseRepository } from "./knowledge-bases/knowledge-base.repository.js";
import { KnowledgeBaseService } from "./knowledge-bases/knowledge-base.service.js";
import { objectStorageToken } from "./object-storage.provider.js";
import {
  createBullMqSourceParseQueue,
  sourceParseQueueToken,
  type SourceParseQueue,
} from "./queues/source-parse.queue.js";
import {
  createBullMqMediaCaptionQueue,
  mediaCaptionQueueToken,
  type MediaCaptionQueue,
} from "./queues/media-caption.queue.js";
import {
  createBullMqDeletionCleanupQueue,
  deletionCleanupQueueToken,
  type DeletionCleanupQueue,
} from "./queues/deletion-cleanup.queue.js";
import {
  createBullMqSourceOcrQueue,
  sourceOcrQueueToken,
  type SourceOcrQueue,
} from "./queues/source-ocr.queue.js";
import {
  createBullMqWebhookDispatchQueue,
  webhookDispatchQueueToken,
  type WebhookDispatchQueue,
} from "./queues/webhook-dispatch.queue.js";
import { ForkSubmissionController } from "./fork-submissions/fork-submission.controller.js";
import { ForkSubmissionService } from "./fork-submissions/fork-submission.service.js";
import { GraphController } from "./retrieve/graph.controller.js";
import { RetrieveController } from "./retrieve/retrieve.controller.js";
import {
  createOpenAICompatibleRetrievalEmbeddingProvider,
  createOpenAICompatibleRetrievalRerankProvider,
  retrievalEmbeddingProviderToken,
  retrievalRepositoryToken,
  retrievalRerankProviderToken,
} from "./retrieve/retrieve.provider.js";
import { RetrieveService } from "./retrieve/retrieve.service.js";
import { runtimeConfigToken } from "./runtime-config.provider.js";
import {
  KnowledgeBaseSourceWatchController,
  ScheduledImportJobController,
  SourceWatchRuleController,
} from "./source-watch/source-watch.controller.js";
import { SourceWatchRuleRepository } from "./source-watch/source-watch.repository.js";
import { SourceWatchSchedulerService } from "./source-watch/source-watch-scheduler.service.js";
import {
  createDefaultSourceWatchScanner,
  sourceWatchScannerToken,
  type SourceWatchScanner,
} from "./source-watch/source-watch.scanner.js";
import { SourceWatchService } from "./source-watch/source-watch.service.js";
import { SystemStatusController } from "./system/system-status.controller.js";
import { SystemStatusService } from "./system/system-status.service.js";
import { WebhookController } from "./webhooks/webhook.controller.js";
import { WebhookRepository } from "./webhooks/webhook.repository.js";
import { WebhookService } from "./webhooks/webhook.service.js";
import { WikiDraftController } from "./wiki-drafts/wiki-draft.controller.js";
import { WikiDraftRepository } from "./wiki-drafts/wiki-draft.repository.js";
import { WikiDraftService } from "./wiki-drafts/wiki-draft.service.js";
import {
  ChangeSetController,
  KnowledgeBasePageController,
  KnowledgeBasePageVersionController,
  KnowledgeBaseRollbackController,
  KnowledgeBaseVersionController,
  WikiPageController,
} from "./wiki/wiki.controller.js";
import { createNoopWikiStore, type WikiStore, wikiStoreToken } from "./wiki/wiki-store.js";

export interface ApiModuleOptions {
  objectStorage?: ObjectStorageAdapter;
  mediaCaptionQueue?: MediaCaptionQueue;
  deletionCleanupQueue?: DeletionCleanupQueue;
  sourceOcrQueue?: SourceOcrQueue;
  webhookDispatchQueue?: WebhookDispatchQueue;
  sourceParseQueue?: SourceParseQueue;
  sourceWatchScanner?: SourceWatchScanner;
  retrievalRepository?: RetrievalRepository;
  retrievalEmbeddingProvider?: RetrievalEmbeddingProvider;
  retrievalRerankProvider?: RetrievalRerankProvider;
  knowledgeCheckChatProvider?: ChatProvider;
  apiDatabaseMirror?: ApiDatabaseMirror;
  apiDatabaseHydratorFactory?: (
    repositories: ApiDatabaseHydratorRepositories,
  ) => ApiDatabaseHydrator;
  defaultIdentity?: DefaultIdentitySeed;
  wikiStore?: WikiStore;
  apiKeyResolver?: ApiKeyResolver;
  apiKeyScopes?: StaticApiKeyRecord[];
}

@Module({})
export class ApiModule implements NestModule {
  static register(config: RuntimeConfig, options: ApiModuleOptions = {}): DynamicModule {
    return {
      module: ApiModule,
      controllers: [
        AdminAuthController,
        SystemStatusController,
        DeletionCleanupController,
        DatasetConfigurationPresetController,
        ForkController,
        KnowledgeBaseController,
        DocumentController,
        DocumentLookupController,
        MediaAssetController,
        SourceEvidenceController,
        KnowledgeBaseJobController,
        KnowledgeBaseIngestProgressController,
        JobController,
        BatchImportController,
        WikiDraftController,
        KnowledgeBaseKnowledgeCheckController,
        KnowledgeCheckController,
        KnowledgeBaseSourceWatchController,
        ScheduledImportJobController,
        SourceWatchRuleController,
        WebhookController,
        ForkSubmissionController,
        ApiKeyBoundaryController,
        RetrieveController,
        GraphController,
        KnowledgeBasePageController,
        KnowledgeBasePageVersionController,
        WikiPageController,
        KnowledgeBaseVersionController,
        ChangeSetController,
        KnowledgeBaseRollbackController,
      ],
      providers: [
        {
          provide: runtimeConfigToken,
          useValue: config,
        },
        {
          provide: apiKeyResolverToken,
          useValue:
            options.apiKeyResolver ??
            createStaticApiKeyResolver([
              createEnvApiKeyRecord(
                config,
                options.defaultIdentity === undefined
                  ? undefined
                  : {
                      accountId: options.defaultIdentity.account.id,
                      projectId: options.defaultIdentity.project.id,
                      tenantId: options.defaultIdentity.tenant.id,
                    },
              ),
              ...(options.apiKeyScopes ?? []),
            ]),
        },
        {
          provide: adminSessionApiScopeToken,
          useValue: createAdminSessionApiScope(
            options.defaultIdentity === undefined
              ? undefined
              : {
                  accountId: options.defaultIdentity.account.id,
                  projectId: options.defaultIdentity.project.id,
                  tenantId: options.defaultIdentity.tenant.id,
                },
          ),
        },
        {
          provide: objectStorageToken,
          useValue: createApiObjectStorage(config, options.objectStorage),
        },
        {
          provide: sourceParseQueueToken,
          useValue: options.sourceParseQueue ?? createBullMqSourceParseQueue(config),
        },
        {
          provide: mediaCaptionQueueToken,
          useValue: options.mediaCaptionQueue ?? createBullMqMediaCaptionQueue(config),
        },
        {
          provide: deletionCleanupQueueToken,
          useValue: options.deletionCleanupQueue ?? createBullMqDeletionCleanupQueue(config),
        },
        {
          provide: sourceOcrQueueToken,
          useValue: options.sourceOcrQueue ?? createBullMqSourceOcrQueue(config),
        },
        {
          provide: webhookDispatchQueueToken,
          useValue: options.webhookDispatchQueue ?? createBullMqWebhookDispatchQueue(config),
        },
        {
          provide: apiDatabaseMirrorToken,
          useValue: options.apiDatabaseMirror ?? createNoopApiDatabaseMirror(),
        },
        {
          provide: wikiStoreToken,
          useValue: options.wikiStore ?? createNoopWikiStore(),
        },
        {
          provide: sourceWatchScannerToken,
          useFactory: (documentRepository: DocumentRepository) =>
            options.sourceWatchScanner ??
            createDefaultSourceWatchScanner(documentRepository, config),
          inject: [DocumentRepository],
        },
        {
          provide: retrievalRepositoryToken,
          useValue: options.retrievalRepository ?? createInMemoryRetrievalRepository(),
        },
        {
          provide: retrievalEmbeddingProviderToken,
          useValue:
            options.retrievalEmbeddingProvider ??
            createOpenAICompatibleRetrievalEmbeddingProvider(config.models.embedding),
        },
        {
          provide: retrievalRerankProviderToken,
          useValue:
            options.retrievalRerankProvider ??
            (config.models.rerank === undefined
              ? undefined
              : createOpenAICompatibleRetrievalRerankProvider(config.models.rerank)),
        },
        {
          provide: knowledgeCheckChatProviderToken,
          useValue:
            options.knowledgeCheckChatProvider ??
            createOpenAICompatibleChatProvider(resolveModelProviderProfiles(config.models).chat),
        },
        AdminAuthService,
        AdminSessionMiddleware,
        KnowledgeBaseRepository,
        KnowledgeBaseService,
        DocumentRepository,
        UploadAdmissionService,
        DeletionCleanupRepository,
        DeletionCleanupManifestCollector,
        {
          provide: apiDatabaseHydratorToken,
          useFactory: (
            knowledgeBaseRepository: KnowledgeBaseRepository,
            documentRepository: DocumentRepository,
            deletionCleanupRepository: DeletionCleanupRepository,
            sourceWatchRuleRepository: SourceWatchRuleRepository,
            webhookRepository: WebhookRepository,
            knowledgeCheckRepository: KnowledgeCheckRepository,
          ) =>
            options.apiDatabaseHydratorFactory?.({
              knowledgeBaseRepository,
              documentRepository,
              deletionCleanupRepository,
              sourceWatchRuleRepository,
              webhookRepository,
              knowledgeCheckRepository,
            }) ?? createNoopApiDatabaseHydrator(),
          inject: [
            KnowledgeBaseRepository,
            DocumentRepository,
            DeletionCleanupRepository,
            SourceWatchRuleRepository,
            WebhookRepository,
            KnowledgeCheckRepository,
          ],
        },
        DocumentService,
        DeletionCleanupService,
        JobService,
        BatchImportService,
        WikiDraftRepository,
        WikiDraftService,
        KnowledgeCheckRepository,
        KnowledgeCheckService,
        ForkSubmissionService,
        SourceWatchRuleRepository,
        SourceWatchSchedulerService,
        SourceWatchService,
        WebhookRepository,
        WebhookService,
        RetrieveService,
        {
          provide: SystemStatusService,
          useFactory: (
            deletionCleanupRepository: DeletionCleanupRepository,
            uploadAdmissionService: UploadAdmissionService,
            documentRepository: DocumentRepository,
          ) =>
            new SystemStatusService(
              config,
              options.defaultIdentity,
              deletionCleanupRepository,
              uploadAdmissionService,
              documentRepository,
            ),
          inject: [DeletionCleanupRepository, UploadAdmissionService, DocumentRepository],
        },
        {
          provide: APP_GUARD,
          useClass: ApiKeyGuard,
        },
      ],
    };
  }

  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(AdminSessionMiddleware).forRoutes("*");
  }
}

function createApiObjectStorage(
  config: RuntimeConfig,
  objectStorage: ObjectStorageAdapter | undefined,
): ObjectStorageAdapter {
  const instrumentation = {
    caller: "api.object_storage",
    enabled: config.limits.objectStorageOperations.metricsEnabled,
    recorder: defaultObjectStorageOperationRecorder,
    scope: "system" as const,
  };

  if (objectStorage !== undefined) {
    return createInstrumentedObjectStorageAdapter(objectStorage, instrumentation);
  }

  return createS3ObjectStorageAdapter(config.storage, {
    instrumentation,
    multipartPartSizeBytes: config.limits.objectStorageOperations.multipartPartSizeBytes,
  });
}
