import { DynamicModule, MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import {
  ProductionRuntimeConfigurationError,
  requireProductionDependency,
  type RuntimeCache,
  type RuntimeConfig,
  type RuntimeQueuePressureRecorder,
} from "@fococontext/core";
import type { DefaultIdentitySeed } from "@fococontext/db";
import {
  createOpenAICompatibleChatProvider,
  resolveModelProviderProfiles,
  type ChatProvider,
} from "@fococontext/llm";
import { APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import {
  type RetrievalEmbeddingProvider,
  type RetrievalRerankProvider,
} from "@fococontext/retrieval";
import {
  createInstrumentedObjectStorageAdapter,
  createS3ObjectStorageAdapter,
  type ObjectStorageOperationRecorder,
  type ObjectStorageAdapter,
} from "@fococontext/storage";

import { ApiKeyBoundaryController } from "./api-keys/api-key-boundary.controller.js";
import { AdminAuthController } from "./auth/admin-auth.controller.js";
import {
  AdminAuthService,
  adminSessionStoreToken,
  createRedisAdminSessionStore,
  type AdminSessionStore,
} from "./auth/admin-auth.service.js";
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
import { apiDatabaseMirrorToken, type ApiDatabaseMirror } from "./database/api-database-mirror.js";
import {
  operationalReadStoreToken,
  type OperationalReadStore,
} from "./database/operational-read-store.js";
import { DeletionCleanupController } from "./deletion-cleanup/deletion-cleanup.controller.js";
import { DeletionCleanupManifestCollector } from "./deletion-cleanup/deletion-cleanup.manifest.js";
import { DeletionCleanupService } from "./deletion-cleanup/deletion-cleanup.service.js";
import {
  DocumentController,
  DocumentLookupController,
  MediaAssetController,
  SourceEvidenceController,
} from "./documents/document.controller.js";
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
import {
  knowledgeCheckChatProviderToken,
  KnowledgeCheckService,
} from "./knowledge-checks/knowledge-check.service.js";
import {
  DatasetConfigurationPresetController,
  ForkController,
  KnowledgeBaseController,
} from "./knowledge-bases/knowledge-base.controller.js";
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
  createBullMqKnowledgeCheckQueue,
  knowledgeCheckQueueToken,
  type KnowledgeCheckQueue,
} from "./queues/knowledge-check.queue.js";
import {
  createBullMqGraphInsightsRefreshQueue,
  graphInsightsRefreshQueueToken,
  type GraphInsightsRefreshQueue,
} from "./queues/graph-insights-refresh.queue.js";
import {
  createBullMqReindexQueue,
  reindexQueueToken,
  type ReindexQueue,
} from "./queues/reindex.queue.js";
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
import { GraphInsightsRefreshService } from "./retrieve/graph-insights-refresh.service.js";
import { RetrieveController } from "./retrieve/retrieve.controller.js";
import {
  createRedisRetrievalQualityMetricsStore,
  retrievalQualityMetricsStoreToken,
  type RetrievalQualityMetricsStore,
} from "./retrieve/retrieve-quality-metrics.js";
import {
  boundedRetrievalRepositoryToken,
  createOpenAICompatibleRetrievalEmbeddingProvider,
  createOpenAICompatibleRetrievalRerankProvider,
  retrievalEmbeddingProviderToken,
  retrievalRerankProviderToken,
  type ApiBoundedRetrievalRepository,
} from "./retrieve/retrieve.provider.js";
import { RetrieveService } from "./retrieve/retrieve.service.js";
import {
  createRedisRuntimeCache,
  createRedisRuntimeCacheMetricsStore,
  runtimeCacheToken,
  runtimeCacheMetricsStoreToken,
  type RuntimeCacheMetricsStore,
} from "./runtime/redis-runtime-cache.js";
import {
  createRedisObjectStorageOperationRecorder,
  objectStorageOperationRecorderToken,
  type RedisObjectStorageOperationRecorder,
} from "./runtime/redis-object-storage-operation-recorder.js";
import {
  createRedisRuntimeQueuePressureRecorder,
  runtimeQueuePressureRecorderToken,
} from "./runtime/redis-runtime-queue-pressure.js";
import {
  createRedisRuntimeApiMetricsStore,
  RuntimeApiMetricsInterceptor,
  runtimeApiMetricsStoreToken,
  type RuntimeApiMetricsStore,
} from "./runtime/runtime-api-metrics.js";
import { runtimeConfigToken } from "./runtime-config.provider.js";
import {
  KnowledgeBaseSourceWatchController,
  ScheduledImportJobController,
  SourceWatchRuleController,
} from "./source-watch/source-watch.controller.js";
import {
  createRedisSourceWatchScanCoordinator,
  sourceWatchScanCoordinatorToken,
  type SourceWatchScanCoordinator,
} from "./source-watch/source-watch.coordinator.js";
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
import { WebhookService } from "./webhooks/webhook.service.js";
import { WikiDraftController } from "./wiki-drafts/wiki-draft.controller.js";
import { WikiDraftService } from "./wiki-drafts/wiki-draft.service.js";
import {
  ChangeSetController,
  KnowledgeBaseChangeSetController,
  KnowledgeBasePageController,
  KnowledgeBasePageVersionController,
  KnowledgeBaseRollbackController,
  KnowledgeBaseVersionController,
  WikiPageController,
} from "./wiki/wiki.controller.js";
import { type WikiStore, wikiStoreToken } from "./wiki/wiki-store.js";

export interface ApiModuleOptions {
  objectStorage?: ObjectStorageAdapter;
  mediaCaptionQueue?: MediaCaptionQueue;
  deletionCleanupQueue?: DeletionCleanupQueue;
  knowledgeCheckQueue?: KnowledgeCheckQueue;
  graphInsightsRefreshQueue?: GraphInsightsRefreshQueue;
  reindexQueue?: ReindexQueue;
  sourceOcrQueue?: SourceOcrQueue;
  webhookDispatchQueue?: WebhookDispatchQueue;
  sourceParseQueue?: SourceParseQueue;
  sourceWatchScanCoordinator?: SourceWatchScanCoordinator;
  sourceWatchScanner?: SourceWatchScanner;
  boundedRetrievalRepository?: ApiBoundedRetrievalRepository;
  retrievalEmbeddingProvider?: RetrievalEmbeddingProvider;
  retrievalRerankProvider?: RetrievalRerankProvider;
  knowledgeCheckChatProvider?: ChatProvider;
  apiDatabaseMirror?: ApiDatabaseMirror;
  operationalReadStore?: OperationalReadStore;
  defaultIdentity?: DefaultIdentitySeed;
  wikiStore?: WikiStore;
  apiKeyResolver?: ApiKeyResolver;
  apiKeyScopes?: StaticApiKeyRecord[];
  adminSessionStore?: AdminSessionStore;
  objectStorageOperationRecorder?: RedisObjectStorageOperationRecorder;
  runtimeCache?: RuntimeCache;
  runtimeCacheMetricsStore?: RuntimeCacheMetricsStore;
  runtimeApiMetricsStore?: RuntimeApiMetricsStore;
  runtimeQueuePressureRecorder?: RuntimeQueuePressureRecorder;
  retrievalQualityMetricsStore?: RetrievalQualityMetricsStore;
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
        KnowledgeBaseChangeSetController,
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
          provide: adminSessionStoreToken,
          useValue: options.adminSessionStore ?? createRedisAdminSessionStore(config),
        },
        {
          provide: runtimeApiMetricsStoreToken,
          useValue: options.runtimeApiMetricsStore ?? createRedisRuntimeApiMetricsStore(config),
        },
        {
          provide: runtimeCacheToken,
          useValue: options.runtimeCache ?? createRedisRuntimeCache(config),
        },
        {
          provide: runtimeCacheMetricsStoreToken,
          useValue: options.runtimeCacheMetricsStore ?? createRedisRuntimeCacheMetricsStore(config),
        },
        {
          provide: objectStorageOperationRecorderToken,
          useValue:
            options.objectStorageOperationRecorder ??
            createRedisObjectStorageOperationRecorder(config),
        },
        {
          provide: retrievalQualityMetricsStoreToken,
          useValue:
            options.retrievalQualityMetricsStore ?? createRedisRetrievalQualityMetricsStore(config),
        },
        {
          provide: runtimeQueuePressureRecorderToken,
          useValue:
            options.runtimeQueuePressureRecorder ?? createRedisRuntimeQueuePressureRecorder(config),
        },
        {
          provide: objectStorageToken,
          useFactory: (recorder: ObjectStorageOperationRecorder) =>
            createApiObjectStorage(config, options.objectStorage, recorder),
          inject: [objectStorageOperationRecorderToken],
        },
        {
          provide: sourceParseQueueToken,
          useFactory: (queuePressureRecorder: RuntimeQueuePressureRecorder) =>
            options.sourceParseQueue ?? createBullMqSourceParseQueue(config, queuePressureRecorder),
          inject: [runtimeQueuePressureRecorderToken],
        },
        {
          provide: mediaCaptionQueueToken,
          useFactory: (queuePressureRecorder: RuntimeQueuePressureRecorder) =>
            options.mediaCaptionQueue ??
            createBullMqMediaCaptionQueue(config, queuePressureRecorder),
          inject: [runtimeQueuePressureRecorderToken],
        },
        {
          provide: deletionCleanupQueueToken,
          useFactory: (queuePressureRecorder: RuntimeQueuePressureRecorder) =>
            options.deletionCleanupQueue ??
            createBullMqDeletionCleanupQueue(config, queuePressureRecorder),
          inject: [runtimeQueuePressureRecorderToken],
        },
        {
          provide: knowledgeCheckQueueToken,
          useFactory: (queuePressureRecorder: RuntimeQueuePressureRecorder) =>
            options.knowledgeCheckQueue ??
            createBullMqKnowledgeCheckQueue(config, queuePressureRecorder),
          inject: [runtimeQueuePressureRecorderToken],
        },
        {
          provide: graphInsightsRefreshQueueToken,
          useFactory: (queuePressureRecorder: RuntimeQueuePressureRecorder) =>
            options.graphInsightsRefreshQueue ??
            createBullMqGraphInsightsRefreshQueue(config, queuePressureRecorder),
          inject: [runtimeQueuePressureRecorderToken],
        },
        {
          provide: reindexQueueToken,
          useFactory: (queuePressureRecorder: RuntimeQueuePressureRecorder) =>
            options.reindexQueue ?? createBullMqReindexQueue(config, queuePressureRecorder),
          inject: [runtimeQueuePressureRecorderToken],
        },
        {
          provide: sourceOcrQueueToken,
          useFactory: (queuePressureRecorder: RuntimeQueuePressureRecorder) =>
            options.sourceOcrQueue ?? createBullMqSourceOcrQueue(config, queuePressureRecorder),
          inject: [runtimeQueuePressureRecorderToken],
        },
        {
          provide: webhookDispatchQueueToken,
          useFactory: (queuePressureRecorder: RuntimeQueuePressureRecorder) =>
            options.webhookDispatchQueue ??
            createBullMqWebhookDispatchQueue(config, queuePressureRecorder),
          inject: [runtimeQueuePressureRecorderToken],
        },
        {
          provide: apiDatabaseMirrorToken,
          useValue: requireProductionDependency("apiDatabaseMirror", options.apiDatabaseMirror),
        },
        {
          provide: operationalReadStoreToken,
          useValue: requireOperationalReadStore(options.operationalReadStore),
        },
        {
          provide: wikiStoreToken,
          useValue: requireProductionDependency("wikiStore", options.wikiStore),
        },
        {
          provide: sourceWatchScannerToken,
          useFactory: (
            operationalReadStore: OperationalReadStore,
            objectStorageOperationRecorder: ObjectStorageOperationRecorder,
          ) =>
            options.sourceWatchScanner ??
            createDefaultSourceWatchScanner(config, {
              existingDocumentProvider: {
                listExistingDocuments: (rule) =>
                  operationalReadStore.listSourceWatchDocuments({
                    knowledgeBaseId: rule.knowledgeBaseId,
                    sourceWatchRuleId: rule.id,
                  }),
              },
              operationRecorder: objectStorageOperationRecorder,
            }),
          inject: [operationalReadStoreToken, objectStorageOperationRecorderToken],
        },
        {
          provide: sourceWatchScanCoordinatorToken,
          useValue:
            options.sourceWatchScanCoordinator ?? createRedisSourceWatchScanCoordinator(config),
        },
        {
          provide: boundedRetrievalRepositoryToken,
          useValue: requireProductionDependency(
            "boundedRetrievalRepository",
            options.boundedRetrievalRepository,
          ),
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
        KnowledgeBaseService,
        UploadAdmissionService,
        DeletionCleanupManifestCollector,
        DocumentService,
        DeletionCleanupService,
        JobService,
        BatchImportService,
        WikiDraftService,
        KnowledgeCheckService,
        GraphInsightsRefreshService,
        ForkSubmissionService,
        SourceWatchSchedulerService,
        SourceWatchService,
        WebhookService,
        RetrieveService,
        {
          provide: SystemStatusService,
          useFactory: (
            uploadAdmissionService: UploadAdmissionService,
            operationalReadStore: OperationalReadStore,
            runtimeApiMetricsStore: RuntimeApiMetricsStore,
            runtimeCacheMetricsStore: RuntimeCacheMetricsStore,
            objectStorageOperationRecorder: RedisObjectStorageOperationRecorder,
            retrievalQualityMetricsStore: RetrievalQualityMetricsStore,
            runtimeQueuePressureRecorder: RuntimeQueuePressureRecorder,
          ) =>
            new SystemStatusService(
              config,
              options.defaultIdentity,
              uploadAdmissionService,
              operationalReadStore,
              runtimeApiMetricsStore,
              runtimeCacheMetricsStore,
              objectStorageOperationRecorder,
              retrievalQualityMetricsStore,
              runtimeQueuePressureRecorder,
            ),
          inject: [
            UploadAdmissionService,
            operationalReadStoreToken,
            runtimeApiMetricsStoreToken,
            runtimeCacheMetricsStoreToken,
            objectStorageOperationRecorderToken,
            retrievalQualityMetricsStoreToken,
            runtimeQueuePressureRecorderToken,
          ],
        },
        {
          provide: APP_GUARD,
          useClass: ApiKeyGuard,
        },
        {
          provide: APP_INTERCEPTOR,
          useFactory: (runtimeApiMetricsStore: RuntimeApiMetricsStore) =>
            new RuntimeApiMetricsInterceptor(runtimeApiMetricsStore),
          inject: [runtimeApiMetricsStoreToken],
        },
      ],
    };
  }

  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(AdminSessionMiddleware).forRoutes("*");
  }
}

function requireOperationalReadStore(
  operationalReadStore: OperationalReadStore | undefined,
): OperationalReadStore {
  const store = requireProductionDependency("operationalReadStore", operationalReadStore);
  if (!store.supportsOperationalReads) {
    throw new ProductionRuntimeConfigurationError({
      apiErrorCode: "durable_backend_unavailable",
      message: "Production runtime dependency is missing or invalid: operationalReadStore.",
      details: {
        invalid: ["operationalReadStore"],
      },
    });
  }

  return store;
}

function createApiObjectStorage(
  config: RuntimeConfig,
  objectStorage: ObjectStorageAdapter | undefined,
  recorder: ObjectStorageOperationRecorder,
): ObjectStorageAdapter {
  const instrumentation = {
    caller: "api.object_storage",
    enabled: config.limits.objectStorageOperations.metricsEnabled,
    recorder,
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
