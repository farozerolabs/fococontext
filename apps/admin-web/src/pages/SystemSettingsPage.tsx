import type { ReactNode } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { TFunction } from "i18next"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useSearchParams } from "react-router"

import type {
  CleanupOperation,
  Pagination,
  SystemSettingsStatus,
} from "@/api/fococontext-client.js"
import { useApiClient } from "@/api/api-client-context.js"
import { adminQueryKeys } from "@/api/query-keys.js"
import {
  IdeDetailPanel,
  IdeExplorer,
  IdeExplorerGroup,
  IdeExplorerItem,
  IdeExplorerPagination,
  IdeWorkspace,
  ideExplorerPageSize,
  normalizeIdeExplorerPage,
} from "@/components/ide/IdeWorkspace.js"
import { LanguageSwitcher } from "@/components/language/LanguageSwitcher.js"
import { ErrorAlert } from "@/components/state/ErrorAlert.js"
import { LoadingState } from "@/components/state/LoadingState.js"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert.js"
import { Badge } from "@/components/ui/badge.js"
import { Button } from "@/components/ui/button.js"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table.js"
import { showToast } from "@/components/ui/toast.js"

type SystemSettingsSection =
  | "about"
  | "adminAccount"
  | "apiAccess"
  | "limits"
  | "models"
  | "ocr"
  | "operations"
  | "preferences"
  | "runtime"
  | "storageIndexes"
  | "webhook"

export function SystemSettingsPage() {
  const { t } = useTranslation()
  const apiClient = useApiClient()
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const cleanupOperationsPage = readSearchPage(
    searchParams,
    "cleanup_operation_page"
  )
  const cleanupOperationsListOptions = {
    page: cleanupOperationsPage,
    pageSize: ideExplorerPageSize,
  }
  const [selectedSection, setSelectedSection] =
    useState<SystemSettingsSection>("runtime")
  const settingsQuery = useQuery({
    queryKey: adminQueryKeys.systemSettings(),
    queryFn: () => apiClient.getSystemSettings(),
  })
  const settings = settingsQuery.data
  const cleanupOperationsQuery = useQuery({
    queryKey: adminQueryKeys.cleanupOperations(cleanupOperationsListOptions),
    queryFn: () =>
      apiClient.listCleanupOperations(cleanupOperationsListOptions),
  })
  const retryCleanupMutation = useMutation({
    mutationFn: (operationId: string) =>
      apiClient.retryCleanupOperation(operationId),
    onError: (error) => {
      showToast({
        message:
          error instanceof Error ? error.message : t("cleanup.retryFailed"),
        variant: "error",
      })
    },
    onSuccess: async (result) => {
      showToast({
        message: t("cleanup.retryQueued", {
          operationId: result.cleanup_operation.id,
        }),
      })
      await queryClient.invalidateQueries({
        queryKey: adminQueryKeys.cleanupOperations(),
      })
      await queryClient.invalidateQueries({
        queryKey: adminQueryKeys.systemSettings(),
      })
    },
  })
  const sections: Array<{ id: SystemSettingsSection; title: string }> = [
    { id: "runtime", title: t("settingsSection.runtime") },
    { id: "operations", title: t("settingsSection.operations") },
    { id: "preferences", title: t("settingsSection.preferences") },
    { id: "adminAccount", title: t("settingsSection.adminAccount") },
    { id: "apiAccess", title: t("settingsSection.apiAccess") },
    { id: "models", title: t("settingsSection.models") },
    { id: "ocr", title: t("settingsSection.ocrPolicy") },
    { id: "storageIndexes", title: t("settingsSection.storageIndexes") },
    { id: "webhook", title: t("settingsSection.webhook") },
    { id: "limits", title: t("settingsSection.limits") },
    { id: "about", title: t("settingsSection.about") },
  ]
  const selectedSectionTitle =
    sections.find((section) => section.id === selectedSection)?.title ??
    t("settingsSection.runtime")
  const cleanupOperationsPagination =
    cleanupOperationsQuery.data?.pagination ??
    createEmptyPagination(cleanupOperationsPage)

  function updateCleanupOperationsPage(page: number) {
    const next = new URLSearchParams(searchParams)
    next.set("cleanup_operation_page", String(page))
    setSearchParams(next, { replace: true })
  }

  return (
    <section className="flex flex-col gap-5" data-route-id="system-settings">
      <h1 className="sr-only">{t("nav.settings")}</h1>
      {settingsQuery.isLoading ? (
        <LoadingState label={t("state.loading")} />
      ) : null}
      {settingsQuery.isError ? (
        <ErrorAlert
          action={
            <Button
              onClick={() => void settingsQuery.refetch()}
              size="sm"
              type="button"
              variant="outline"
            >
              {t("action.retry")}
            </Button>
          }
          description={t("systemSettings.loadFailedDescription")}
          title={t("state.loadFailed")}
        />
      ) : null}
      {settings === undefined ? null : (
        <IdeWorkspace
          detail={
            <IdeDetailPanel title={selectedSectionTitle}>
              <SystemSettingsSectionPanel
                cleanupOperations={cleanupOperationsQuery.data?.data ?? []}
                cleanupOperationsPagination={cleanupOperationsPagination}
                isRetryingCleanup={retryCleanupMutation.isPending}
                onCleanupOperationsPageChange={updateCleanupOperationsPage}
                onRetryCleanup={(operation) =>
                  retryCleanupMutation.mutate(operation.id)
                }
                section={selectedSection}
                settings={settings}
              />
            </IdeDetailPanel>
          }
          explorer={
            <IdeExplorer>
              <IdeExplorerGroup
                count={sections.length}
                title={t("ide.settingsSections")}
              >
                {sections.map((section) => (
                  <IdeExplorerItem
                    active={section.id === selectedSection}
                    key={section.id}
                    onSelect={() => setSelectedSection(section.id)}
                    title={section.title}
                  />
                ))}
              </IdeExplorerGroup>
            </IdeExplorer>
          }
        />
      )}
    </section>
  )
}

function SystemSettingsSectionPanel({
  cleanupOperations,
  cleanupOperationsPagination,
  isRetryingCleanup,
  onCleanupOperationsPageChange,
  onRetryCleanup,
  section,
  settings,
}: {
  cleanupOperations: CleanupOperation[]
  cleanupOperationsPagination: Pagination
  isRetryingCleanup: boolean
  onCleanupOperationsPageChange: (page: number) => void
  onRetryCleanup: (operation: CleanupOperation) => void
  section: SystemSettingsSection
  settings: SystemSettingsStatus
}) {
  const { t } = useTranslation()

  if (section === "runtime") {
    const pressure = readRecord(settings.dependencies, "pressure")
    const metrics = readRecord(settings.dependencies, "metrics")
    const migration = readRecord(settings.dependencies, "migration")
    const operationPressure = readRecord(pressure, "objectStorageOperations")
    const operationMetrics = readRecord(metrics, "objectStorageOperations")
    const worker = readRecord(settings.dependencies, "worker")
    const ocr = readRecord(settings.dependencies, "ocr")
    const workerRelease = readRecord(worker, "release")
    const ocrRelease = readRecord(ocr, "release")
    const pressureWarnings = getRuntimePressureWarnings(pressure, t)

    return (
      <div className="flex flex-col gap-4">
        {pressureWarnings.length === 0 ? null : (
          <Alert variant="destructive">
            <AlertTitle>{t("systemSettings.pressureWarningTitle")}</AlertTitle>
            <AlertDescription>
              <ul className="list-disc space-y-1 pl-4">
                {pressureWarnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}
        <KeyValue label={t("systemSettings.productReleaseVersion")}>
          {settings.runtime.version}
        </KeyValue>
        <KeyValue label={t("systemSettings.gitRevision")}>
          {settings.runtime.release?.revision ?? t("systemSettings.noValue")}
        </KeyValue>
        <KeyValue label={t("systemSettings.buildTime")}>
          {settings.runtime.release?.buildTime ?? t("systemSettings.noValue")}
        </KeyValue>
        <KeyValue label={t("systemSettings.releaseSource")}>
          {settings.runtime.release?.source ?? t("systemSettings.noValue")}
        </KeyValue>
        <KeyValue label={t("systemSettings.apiContractVersion")}>
          {settings.runtime.apiContractVersion ?? t("systemSettings.noValue")}
        </KeyValue>
        <KeyValue label={t("systemSettings.workerRelease")}>
          <JsonBlock value={workerRelease ?? {}} />
        </KeyValue>
        <KeyValue label={t("systemSettings.ocrRelease")}>
          <JsonBlock value={ocrRelease ?? {}} />
        </KeyValue>
        <KeyValue label={t("systemSettings.apiBaseUrl")}>
          {settings.runtime.apiBaseUrl}
        </KeyValue>
        <KeyValue label={t("systemSettings.adminBaseUrl")}>
          {settings.runtime.adminBaseUrl}
        </KeyValue>
        <KeyValue label={t("systemSettings.apiPort")}>
          {settings.runtime.apiPort}
        </KeyValue>
        <KeyValue label={t("systemSettings.adminPort")}>
          {settings.runtime.adminPort}
        </KeyValue>
        <KeyValue label={t("systemSettings.defaultContext")}>
          <JsonBlock value={settings.runtime.defaultContext} />
        </KeyValue>
        <MigrationStatusPanel migration={migration} />
        <KeyValue label={t("systemSettings.pressureStatus")}>
          {formatStatus(t, pressure?.status)}
        </KeyValue>
        <KeyValue label={t("systemSettings.uploadPressure")}>
          <JsonBlock value={pressure?.upload ?? {}} />
        </KeyValue>
        <KeyValue label={t("systemSettings.queuePressure")}>
          <JsonBlock value={pressure?.queue ?? {}} />
        </KeyValue>
        <KeyValue label={t("systemSettings.compilePressure")}>
          <JsonBlock value={pressure?.compile ?? {}} />
        </KeyValue>
        <KeyValue label={t("systemSettings.objectStorageOperationPressure")}>
          <JsonBlock value={operationPressure ?? {}} />
        </KeyValue>
        <KeyValue label={t("systemSettings.objectStorageOperationMetrics")}>
          <JsonBlock value={operationMetrics ?? {}} />
        </KeyValue>
      </div>
    )
  }

  if (section === "preferences") {
    return <LanguageSwitcher dataTestId="system-language-switcher" />
  }

  if (section === "operations") {
    const cleanupQueue = readRecord(settings.dependencies, "cleanupQueue")
    const operations = cleanupOperations.filter(
      (operation) =>
        operation.status === "failed" ||
        operation.status === "queued" ||
        operation.status === "running"
    )

    return (
      <div className="flex flex-col gap-4">
        <KeyValue label={t("cleanup.queue")}>
          {displayPrimitive(t, cleanupQueue?.queueName)}
        </KeyValue>
        <KeyValue label={t("cleanup.queueStatus")}>
          {formatStatus(t, cleanupQueue?.status)}
        </KeyValue>
        <KeyValue label={t("cleanup.pendingOperations")}>
          {displayPrimitive(t, readRecord(cleanupQueue, "operations")?.pending)}
        </KeyValue>
        <KeyValue label={t("cleanup.failedOperations")}>
          {displayPrimitive(t, readRecord(cleanupQueue, "operations")?.failed)}
        </KeyValue>
        {operations.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            {t("cleanup.noOperations")}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("cleanup.operation")}</TableHead>
                <TableHead>{t("cleanup.target")}</TableHead>
                <TableHead>{t("source.column.status")}</TableHead>
                <TableHead>{t("cleanup.phase")}</TableHead>
                <TableHead>{t("cleanup.items")}</TableHead>
                <TableHead>{t("cleanup.updated")}</TableHead>
                <TableHead className="text-right">
                  {t("job.column.actions")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {operations.map((operation) => (
                <TableRow key={operation.id}>
                  <TableCell className="font-mono text-xs">
                    {operation.id}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <span>
                        {t(`cleanup.targetType.${operation.target_type}`)}
                      </span>
                      <span className="font-mono text-xs text-muted-foreground">
                        {operation.target_id}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {formatStatus(t, operation.status)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {t(`cleanup.phaseValue.${operation.phase}`)}
                  </TableCell>
                  <TableCell>
                    {operation.item_counts.deleted +
                      operation.item_counts.skipped}
                    /{operation.item_counts.total}
                  </TableCell>
                  <TableCell>{operation.updated_at}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      disabled={!operation.retryable || isRetryingCleanup}
                      onClick={() => onRetryCleanup(operation)}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      {t("action.retry")}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <IdeExplorerPagination
          onPageChange={onCleanupOperationsPageChange}
          page={normalizeIdeExplorerPage(
            cleanupOperationsPagination.page,
            cleanupOperationsPagination.total,
            cleanupOperationsPagination.page_size || ideExplorerPageSize
          )}
          pageSize={
            cleanupOperationsPagination.page_size || ideExplorerPageSize
          }
          total={cleanupOperationsPagination.total}
        />
      </div>
    )
  }

  if (section === "adminAccount") {
    return (
      <div className="flex flex-col gap-4">
        <KeyValue label={t("systemSettings.username")}>
          {settings.admin.username}
        </KeyValue>
        <KeyValue label={t("systemSettings.passwordConfigured")}>
          {formatBoolean(t, settings.admin.passwordConfigured)}
        </KeyValue>
        <KeyValue label={t("systemSettings.lastSignIn")}>
          {settings.admin.lastSignIn ?? t("systemSettings.noValue")}
        </KeyValue>
      </div>
    )
  }

  if (section === "apiAccess") {
    return (
      <div className="flex flex-col gap-4">
        <KeyValue label={t("source.column.status")}>
          {formatStatus(t, settings.apiAccess.status)}
        </KeyValue>
        <KeyValue label={t("systemSettings.authMode")}>
          {settings.apiAccess.authMode === "env_api_key"
            ? t("systemSettings.envApiKey")
            : settings.apiAccess.authMode}
        </KeyValue>
        <KeyValue label={t("systemSettings.maskedKey")}>
          {settings.apiAccess.maskedKey}
        </KeyValue>
        <KeyValue label={t("systemSettings.apiBaseUrl")}>
          {settings.apiAccess.apiBaseUrl}
        </KeyValue>
        <div className="text-sm text-muted-foreground">
          {t("systemSettings.apiKeyBoundary")}
        </div>
      </div>
    )
  }

  if (section === "models") {
    return (
      <div className="flex flex-col gap-4">
        <KeyValue label={t("systemSettings.chatProvider")}>
          {readString(settings.models, "chat", "providerName")}
        </KeyValue>
        <KeyValue label={t("systemSettings.chatBaseUrl")}>
          {readString(settings.models, "chat", "baseUrl")}
        </KeyValue>
        <KeyValue label={t("systemSettings.chatApiKey")}>
          {formatStatus(t, readString(settings.models, "chat", "apiKeyStatus"))}
        </KeyValue>
        <KeyValue label={t("systemSettings.chatDefaultModel")}>
          {readString(settings.models, "chat", "defaultModel")}
        </KeyValue>
        <KeyValue label={t("systemSettings.embeddingProvider")}>
          {readString(settings.models, "embedding", "providerName")}
        </KeyValue>
        <KeyValue label={t("systemSettings.embeddingModel")}>
          {readString(settings.models, "embedding", "model")}
        </KeyValue>
        <KeyValue label={t("systemSettings.embeddingDimensions")}>
          {readPrimitive(settings.models, "embedding", "dimensions")}
        </KeyValue>
        <KeyValue label={t("systemSettings.embeddingApiKey")}>
          {formatStatus(
            t,
            readString(settings.models, "embedding", "apiKeyStatus")
          )}
        </KeyValue>
        <KeyValue label={t("systemSettings.rerankStatus")}>
          {formatStatus(t, readString(settings.models, "rerank", "status"))}
        </KeyValue>
        <KeyValue label={t("systemSettings.visionCaptionStatus")}>
          {formatStatus(
            t,
            readString(settings.models, "visionCaption", "status")
          )}
        </KeyValue>
        <KeyValue label={t("systemSettings.visionCaptionProvider")}>
          {readString(settings.models, "visionCaption", "providerName")}
        </KeyValue>
        <KeyValue label={t("systemSettings.visionCaptionModel")}>
          {readString(settings.models, "visionCaption", "model")}
        </KeyValue>
      </div>
    )
  }

  if (section === "ocr") {
    const runtimeOcrStatus = readRecord(settings.dependencies, "ocr")
    const runtimeOcrLimits = readRecord(settings.limits, "ocr")

    return (
      <div className="flex flex-col gap-4">
        <KeyValue label={t("kbSettings.ocrRuntimeStatus")}>
          {formatStatus(t, runtimeOcrStatus?.status)}
        </KeyValue>
        <KeyValue label={t("kbSettings.ocrRuntimeHealth")}>
          {formatStatus(t, runtimeOcrStatus?.health)}
        </KeyValue>
        <KeyValue label={t("kbSettings.ocrRuntimeProvider")}>
          {displayPrimitive(t, runtimeOcrStatus?.provider)}
        </KeyValue>
        <KeyValue label={t("settings.ocr.languages")}>
          <JsonBlock value={runtimeOcrStatus?.languages ?? []} />
        </KeyValue>
        <KeyValue label={t("settings.ocr.limits")}>
          <JsonBlock value={runtimeOcrLimits ?? {}} />
        </KeyValue>
        <KeyValue label={t("settings.ocr.apiKeyStatus")}>
          {formatStatus(t, runtimeOcrStatus?.apiKeyStatus)}
        </KeyValue>
      </div>
    )
  }

  if (section === "storageIndexes") {
    return (
      <div className="flex flex-col gap-4">
        <KeyValue label={t("systemSettings.databaseStatus")}>
          {formatStatus(
            t,
            readString(settings.dependencies, "database", "status")
          )}
        </KeyValue>
        <KeyValue label={t("systemSettings.redisStatus")}>
          {formatStatus(
            t,
            readString(settings.dependencies, "redis", "status")
          )}
        </KeyValue>
        <KeyValue label={t("systemSettings.objectStorageStatus")}>
          {formatStatus(
            t,
            readString(settings.dependencies, "objectStorage", "status")
          )}
        </KeyValue>
        <KeyValue label={t("systemSettings.workerStatus")}>
          {formatStatus(
            t,
            readString(settings.dependencies, "worker", "status")
          )}
        </KeyValue>
        <KeyValue label={t("systemSettings.queueStatus")}>
          {formatStatus(
            t,
            readString(settings.dependencies, "queue", "status")
          )}
        </KeyValue>
        <KeyValue label={t("systemSettings.queueConcurrency")}>
          {readPrimitive(settings.dependencies, "queue", "concurrency")}
        </KeyValue>
        <KeyValue label={t("systemSettings.storageProvider")}>
          {displayPrimitive(t, settings.storage.providerName)}
        </KeyValue>
        <KeyValue label={t("systemSettings.storageEndpoint")}>
          {displayPrimitive(t, settings.storage.endpoint)}
        </KeyValue>
        <KeyValue label={t("systemSettings.storageBucket")}>
          {displayPrimitive(t, settings.storage.bucket)}
        </KeyValue>
        <KeyValue label={t("systemSettings.storageRegion")}>
          {displayPrimitive(t, settings.storage.region)}
        </KeyValue>
        <KeyValue label={t("systemSettings.storagePathStyle")}>
          {formatBoolean(t, settings.storage.forcePathStyle)}
        </KeyValue>
        <KeyValue label={t("systemSettings.storageAccessKey")}>
          {formatStatus(
            t,
            displayPrimitive(t, settings.storage.accessKeyStatus)
          )}
        </KeyValue>
        <KeyValue label={t("systemSettings.storageSecretKey")}>
          {formatStatus(
            t,
            displayPrimitive(t, settings.storage.secretKeyStatus)
          )}
        </KeyValue>
      </div>
    )
  }

  if (section === "webhook") {
    return (
      <div className="flex flex-col gap-4">
        <KeyValue label={t("systemSettings.webhookDeliveryReadiness")}>
          {formatStatus(t, settings.limits.webhook?.deliveryReadiness)}
        </KeyValue>
        <KeyValue label={t("systemSettings.webhookSecret")}>
          {formatStatus(t, settings.limits.webhook?.secretStatus)}
        </KeyValue>
        <KeyValue label={t("systemSettings.maskedSecret")}>
          {settings.limits.webhook?.maskedSecret ?? t("systemSettings.noValue")}
        </KeyValue>
        <KeyValue label={t("systemSettings.webhookLatestDelivery")}>
          {t("systemSettings.noValue")}
        </KeyValue>
        <KeyValue label={t("systemSettings.webhookDeliveryHistory")}>
          <JsonBlock value={settings.limits.webhook?.delivery ?? {}} />
        </KeyValue>
        <div className="text-sm text-muted-foreground">
          {t("systemSettings.webhookBoundary")}
        </div>
      </div>
    )
  }

  if (section === "limits") {
    return (
      <div className="flex flex-col gap-5">
        <ConcurrencyLimitsTable settings={settings} />
        <KeyValue label={t("systemSettings.uploadLimits")}>
          <JsonBlock value={settings.limits.upload} />
        </KeyValue>
        <KeyValue label={t("systemSettings.retrieveLimits")}>
          <JsonBlock value={settings.limits.retrieve} />
        </KeyValue>
      </div>
    )
  }

  return (
    <div className="text-sm text-muted-foreground">
      {t("systemSettings.envFirstBoundary")}
    </div>
  )
}

function MigrationStatusPanel({
  migration,
}: {
  migration: Record<string, unknown> | undefined
}) {
  const { t } = useTranslation()

  if (migration === undefined) {
    return (
      <Alert>
        <AlertTitle>{t("systemSettings.migrationStatus")}</AlertTitle>
        <AlertDescription>
          {t("systemSettings.migrationManagedByStartup")}
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <KeyValue label={t("systemSettings.migrationStatus")}>
        {formatStatus(t, migration.status)}
      </KeyValue>
      <KeyValue label={t("systemSettings.migrationMode")}>
        {displayPrimitive(t, migration.mode)}
      </KeyValue>
      <KeyValue label={t("systemSettings.migrationPendingCount")}>
        {displayPrimitive(t, migration.pendingCount)}
      </KeyValue>
      <KeyValue label={t("systemSettings.migrationLastOutcome")}>
        {displayPrimitive(t, migration.lastOutcome)}
      </KeyValue>
    </div>
  )
}

function ConcurrencyLimitsTable({
  settings,
}: {
  settings: SystemSettingsStatus
}) {
  const { t } = useTranslation()
  const effectiveConcurrency = readRecord(
    settings.limits,
    "effectiveConcurrency"
  )
  const rows = buildConcurrencyRows(t, effectiveConcurrency)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-medium">
          {t("systemSettings.concurrency.title")}
        </h2>
        <p className="text-sm text-muted-foreground">
          {t("systemSettings.concurrency.description")}
        </p>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("systemSettings.concurrency.scope")}</TableHead>
            <TableHead>{t("systemSettings.concurrency.limit")}</TableHead>
            <TableHead>{t("systemSettings.concurrency.env")}</TableHead>
            <TableHead className="text-right">
              {t("systemSettings.concurrency.effective")}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={`${row.scope}.${row.key}`}>
              <TableCell>
                <Badge variant="outline">{row.scopeLabel}</Badge>
              </TableCell>
              <TableCell>{row.label}</TableCell>
              <TableCell className="font-mono text-xs">{row.env}</TableCell>
              <TableCell className="text-right font-mono">
                {displayPrimitive(t, row.value)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function buildConcurrencyRows(
  t: TFunction,
  effectiveConcurrency: Record<string, unknown> | undefined
) {
  const rowDefinitions = [
    {
      env: "FOCOCONTEXT_QUEUE_CONCURRENCY",
      key: "fallbackConcurrency",
      labelKey: "fallback",
      path: ["fallbackConcurrency"],
      scope: "runtime",
    },
    {
      env: "UPLOAD_MAX_CONCURRENT_FILES",
      key: "uploadMaxConcurrentFiles",
      labelKey: "uploadMaxConcurrentFiles",
      path: ["api", "uploadMaxConcurrentFiles"],
      scope: "api",
    },
    {
      env: "BATCH_IMPORT_CONCURRENCY",
      key: "batchImportConcurrency",
      labelKey: "batchImportConcurrency",
      path: ["api", "batchImportConcurrency"],
      scope: "api",
    },
    {
      env: "SOURCE_WATCH_SCAN_CONCURRENCY",
      key: "sourceWatchConcurrency",
      labelKey: "sourceWatchConcurrency",
      path: ["api", "sourceWatchConcurrency"],
      scope: "api",
    },
    {
      env: "SOURCE_PARSE_CONCURRENCY",
      key: "sourceParseConcurrency",
      labelKey: "sourceParseConcurrency",
      path: ["workers", "sourceParseConcurrency"],
      scope: "worker",
    },
    {
      env: "OCR_CONCURRENCY",
      key: "sourceOcrConcurrency",
      labelKey: "sourceOcrConcurrency",
      path: ["workers", "sourceOcrConcurrency"],
      scope: "worker",
    },
    {
      env: "VISION_CAPTION_CONCURRENCY",
      key: "mediaCaptionConcurrency",
      labelKey: "mediaCaptionConcurrency",
      path: ["workers", "mediaCaptionConcurrency"],
      scope: "worker",
    },
    {
      env: "WIKI_ANALYZE_CONCURRENCY",
      key: "wikiAnalyzeConcurrency",
      labelKey: "wikiAnalyzeConcurrency",
      path: ["workers", "wikiAnalyzeConcurrency"],
      scope: "worker",
    },
    {
      env: "WIKI_GENERATE_CONCURRENCY",
      key: "wikiGenerateConcurrency",
      labelKey: "wikiGenerateConcurrency",
      path: ["workers", "wikiGenerateConcurrency"],
      scope: "worker",
    },
    {
      env: "WIKI_MERGE_CONCURRENCY",
      key: "wikiMergeConcurrency",
      labelKey: "wikiMergeConcurrency",
      path: ["workers", "wikiMergeConcurrency"],
      scope: "worker",
    },
    {
      env: "WEBHOOK_DELIVERY_CONCURRENCY",
      key: "webhookDispatchConcurrency",
      labelKey: "webhookDispatchConcurrency",
      path: ["workers", "webhookDispatchConcurrency"],
      scope: "worker",
    },
    {
      env: "DELETION_CLEANUP_CONCURRENCY",
      key: "deletionCleanupConcurrency",
      labelKey: "deletionCleanupConcurrency",
      path: ["workers", "deletionCleanupConcurrency"],
      scope: "worker",
    },
    {
      env: "OCR_PAGE_CONCURRENCY",
      key: "ocrPageConcurrency",
      labelKey: "ocrPageConcurrency",
      path: ["internal", "ocrPageConcurrency"],
      scope: "internal",
    },
    {
      env: "VISION_CAPTION_IMAGE_CONCURRENCY",
      key: "visionCaptionImageConcurrency",
      labelKey: "visionCaptionImageConcurrency",
      path: ["internal", "visionCaptionImageConcurrency"],
      scope: "internal",
    },
  ]

  return rowDefinitions.map((row) => ({
    ...row,
    label: t(`systemSettings.concurrency.limitValue.${row.labelKey}`),
    scopeLabel: t(`systemSettings.concurrency.scopeValue.${row.scope}`),
    value: readNestedPrimitive(effectiveConcurrency, row.path),
  }))
}

function getRuntimePressureWarnings(
  pressure: Record<string, unknown> | undefined,
  t: TFunction
) {
  const warnings: string[] = []
  const upload = readRecord(pressure, "upload")
  const queue = readRecord(pressure, "queue")
  const compile = readRecord(pressure, "compile")
  const objectStorageOperations = readRecord(
    pressure,
    "objectStorageOperations"
  )

  if (isPressureState(upload?.pressure)) {
    warnings.push(t("systemSettings.uploadPressureWarning"))
  }
  if (isPressureState(queue?.status)) {
    warnings.push(t("systemSettings.queuePressureWarning"))
  }
  if (isPressureState(compile?.status)) {
    warnings.push(t("systemSettings.compilePressureWarning"))
  }
  if (objectStorageOperations?.status === "degraded") {
    warnings.push(t("systemSettings.objectStorageOperationPressureWarning"))
  }

  return warnings
}

function isPressureState(value: unknown) {
  return value === "degraded" || value === "saturated"
}

function readRecord(
  value: Record<string, unknown> | undefined,
  key: string
): Record<string, unknown> | undefined {
  if (value === undefined) {
    return undefined
  }

  const candidate = value[key]

  return typeof candidate === "object" &&
    candidate !== null &&
    !Array.isArray(candidate)
    ? (candidate as Record<string, unknown>)
    : undefined
}

function readNestedPrimitive(
  value: Record<string, unknown> | undefined,
  path: string[]
): string | number | boolean | undefined {
  let current: unknown = value

  for (const key of path) {
    if (
      typeof current !== "object" ||
      current === null ||
      Array.isArray(current)
    ) {
      return undefined
    }

    current = (current as Record<string, unknown>)[key]
  }

  return typeof current === "string" ||
    typeof current === "number" ||
    typeof current === "boolean"
    ? current
    : undefined
}

function KeyValue({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="flex flex-col gap-1 text-sm">
      <div className="font-medium text-muted-foreground">{label}</div>
      <div className="break-words">{children}</div>
    </div>
  )
}

function JsonBlock({ value }: { value: unknown }) {
  return (
    <pre className="max-h-48 overflow-auto rounded-md border bg-muted p-3 text-xs">
      {JSON.stringify(value, null, 2)}
    </pre>
  )
}

function readString(
  value: Record<string, unknown>,
  firstKey: string,
  secondKey: string
) {
  const primitive = readPrimitive(value, firstKey, secondKey)

  return typeof primitive === "string" ? primitive : ""
}

function readPrimitive(
  value: Record<string, unknown>,
  firstKey: string,
  secondKey: string
): string | number | boolean {
  const firstValue = value[firstKey]

  if (
    typeof firstValue !== "object" ||
    firstValue === null ||
    Array.isArray(firstValue)
  ) {
    return ""
  }

  const secondValue = (firstValue as Record<string, unknown>)[secondKey]

  return typeof secondValue === "string" ||
    typeof secondValue === "number" ||
    typeof secondValue === "boolean"
    ? secondValue
    : ""
}

function displayPrimitive(t: TFunction, value: unknown) {
  if (typeof value === "string" || typeof value === "number") {
    return String(value)
  }

  if (typeof value === "boolean") {
    return formatBoolean(t, value)
  }

  return t("systemSettings.noValue")
}

function formatBoolean(t: TFunction, value: unknown) {
  if (typeof value !== "boolean") {
    return t("systemSettings.noValue")
  }

  return value ? t("state.enabled") : t("state.disabled")
}

function formatStatus(t: TFunction, value: unknown) {
  if (typeof value !== "string" || value.length === 0) {
    return t("systemSettings.noValue")
  }

  return t(`status.${value}`, { defaultValue: value })
}

function createEmptyPagination(page: number): Pagination {
  return {
    has_more: false,
    page,
    page_size: ideExplorerPageSize,
    total: 0,
  }
}

function readSearchPage(searchParams: URLSearchParams, key: string) {
  const value = Number(searchParams.get(key))

  return Number.isSafeInteger(value) && value > 0 ? value : 1
}
