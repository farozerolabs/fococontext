import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { TFunction } from "i18next"
import { RefreshCcw } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { useParams, useSearchParams } from "react-router"

import {
  type Job,
  type JobDetail,
  type JobEvent,
  type JobStatus,
  type Pagination,
  type ParsedContent,
  type SourceDocument,
  type SourceDocumentDetail,
  type SystemSettingsStatus,
} from "@/api/fococontext-client.js"
import { useApiClient } from "@/api/api-client-context.js"
import {
  getActiveRefetchInterval,
  isActiveJobStatus,
} from "@/api/job-polling.js"
import { adminQueryKeys } from "@/api/query-keys.js"
import {
  IdeExplorerPagination,
  InspectorField,
  InspectorGrid,
  InspectorJson,
  InspectorSection,
  InspectorTabs,
  ideExplorerPageSize,
  normalizeIdeExplorerPage,
} from "@/components/ide/IdeWorkspace.js"
import { ResourceIdDisplay } from "@/components/resource-id/ResourceIdDisplay.js"
import { EmptyState } from "@/components/state/EmptyState.js"
import { ErrorAlert } from "@/components/state/ErrorAlert.js"
import { LoadingState } from "@/components/state/LoadingState.js"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert.js"
import { Badge } from "@/components/ui/badge.js"
import { Button } from "@/components/ui/button.js"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.js"
import { Progress } from "@/components/ui/progress.js"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table.js"
import {
  getJobProgressLabelKey,
  getJobProgressValue,
  getJobStateLabelKey,
  getTimelineEventMessageKey,
  getTimelineEventStateLabelKey,
  sortJobTimelineEvents,
} from "./job-display.js"

interface JobListItem {
  detail: SourceDocumentDetail | null
  document: SourceDocument | null
  job: Job
}

interface JobListView {
  items: JobListItem[]
  pagination: Pagination
}

interface CaptionStageSummary {
  cacheHitCount: number | null
  eligibleMediaAssetCount: number | null
  failedCount: number | null
  generatedCount: number | null
  mediaAssetIds: string[]
  providerCallCount: number | null
}

interface OcrStageSummary {
  blockCount: number | null
  candidatePages: number[]
  confidence: number | null
  failedPages: number | null
  pageCount: number | null
  provider: string | null
  retryAttempts: number | null
}

export function KnowledgeBaseJobsPage() {
  const { knowledgeBaseId } = useParams()
  const { i18n, t } = useTranslation()
  const apiClient = useApiClient()
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const jobsPage = readSearchPage(searchParams, "job_page")
  const jobsListOptions = { page: jobsPage, pageSize: ideExplorerPageSize }
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null)

  const jobsQuery = useQuery({
    enabled: knowledgeBaseId !== undefined,
    queryKey:
      knowledgeBaseId === undefined
        ? adminQueryKeys.jobs("")
        : adminQueryKeys.jobs(knowledgeBaseId, jobsListOptions),
    queryFn: async (): Promise<JobListView> => {
      if (knowledgeBaseId === undefined) {
        return {
          items: [],
          pagination: createEmptyPagination(jobsPage),
        }
      }

      const jobs = await apiClient.listJobs(knowledgeBaseId, jobsListOptions)
      const documentIds = jobs.data.flatMap((job) =>
        job.document_id === null ? [] : [job.document_id]
      )
      const details = await Promise.all(
        [...new Set(documentIds)].map((documentId) =>
          apiClient.getSourceDocument(documentId)
        )
      )
      const detailByDocumentId = new Map(
        details.map((detail) => [detail.document.id, detail])
      )

      return {
        items: jobs.data.map((job) => {
          const detail =
            job.document_id === null
              ? null
              : (detailByDocumentId.get(job.document_id) ?? null)

          return {
            detail,
            document: detail?.document ?? null,
            job,
          }
        }),
        pagination: jobs.pagination,
      }
    },
    refetchInterval: (query) =>
      getActiveRefetchInterval(
        hasActiveJobListItems(query.state.data?.items ?? [])
      ),
    refetchIntervalInBackground: true,
  })
  const ingestProgressQuery = useQuery({
    enabled: knowledgeBaseId !== undefined,
    queryKey:
      knowledgeBaseId === undefined
        ? adminQueryKeys.ingestProgress("")
        : adminQueryKeys.ingestProgress(knowledgeBaseId),
    queryFn: async () => {
      if (knowledgeBaseId === undefined) {
        throw new Error("Knowledge Base selection is required.")
      }

      return apiClient.getKnowledgeBaseIngestProgress(knowledgeBaseId)
    },
    refetchInterval: (query) =>
      getActiveRefetchInterval(query.state.data?.retrieve_ready === false),
    refetchIntervalInBackground: true,
  })
  const systemSettingsQuery = useQuery({
    queryKey: adminQueryKeys.systemSettings(),
    queryFn: () => apiClient.getSystemSettings(),
  })

  const retryMutation = useMutation({
    mutationFn: async (jobIds: string[]) => {
      return Promise.all(jobIds.map((jobId) => apiClient.retryJob(jobId)))
    },
    onSuccess: async (jobs) => {
      if (knowledgeBaseId !== undefined) {
        await queryClient.invalidateQueries({
          queryKey: adminQueryKeys.jobs(knowledgeBaseId),
        })
        await queryClient.invalidateQueries({
          queryKey: adminQueryKeys.ingestProgress(knowledgeBaseId),
        })
      }
      await Promise.all(
        jobs.map((job) =>
          queryClient.invalidateQueries({
            queryKey: adminQueryKeys.jobDetail(job.id),
          })
        )
      )
    },
  })

  const cancelMutation = useMutation({
    mutationFn: (jobId: string) => apiClient.cancelJob(jobId),
    onSuccess: async (job) => {
      if (knowledgeBaseId !== undefined) {
        await queryClient.invalidateQueries({
          queryKey: adminQueryKeys.jobs(knowledgeBaseId),
        })
        await queryClient.invalidateQueries({
          queryKey: adminQueryKeys.ingestProgress(knowledgeBaseId),
        })
      }
      await queryClient.invalidateQueries({
        queryKey: adminQueryKeys.jobDetail(job.id),
      })
    },
  })

  const jobs = useMemo(() => jobsQuery.data?.items ?? [], [jobsQuery.data])
  const jobsPagination =
    jobsQuery.data?.pagination ?? createEmptyPagination(jobsPage)
  const ingestProgress = ingestProgressQuery.data
  const hasIngestProgressJobs =
    ingestProgress !== undefined && ingestProgress.counts.total > 0
  const normalizedJobsPage = normalizeIdeExplorerPage(
    jobsPagination.page,
    jobsPagination.total,
    jobsPagination.page_size || ideExplorerPageSize
  )
  const pressureWarnings = getJobPressureWarnings(systemSettingsQuery.data, t)
  const failedJobIds = jobs.flatMap((item) =>
    item.job.status === "failed" ? [item.job.id] : []
  )
  const selectedJobItem =
    selectedJobId === null
      ? null
      : (jobs.find((item) => item.job.id === selectedJobId) ?? null)

  useEffect(() => {
    if (
      selectedJobId !== null &&
      jobs.every((item) => item.job.id !== selectedJobId)
    ) {
      setSelectedJobId(null)
    }
  }, [jobs, selectedJobId])

  function updateExplorerPage(page: number) {
    const next = new URLSearchParams(searchParams)
    next.set("job_page", String(page))
    setSearchParams(next, { replace: true })
  }

  return (
    <div
      className="flex flex-col gap-5 p-4 sm:p-6"
      data-route-id="knowledge-base-jobs"
    >
      <h1 className="sr-only">{t("nav.jobs")}</h1>

      {jobsQuery.isLoading ? <LoadingState label={t("state.loading")} /> : null}
      {jobsQuery.isError ? <ErrorAlert title={t("state.loadFailed")} /> : null}
      {jobsQuery.isSuccess && jobsPagination.total === 0 ? (
        <EmptyState title={t("empty.noJobs")} />
      ) : null}
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
      {hasIngestProgressJobs ? (
        <div className="flex flex-col gap-2 rounded-md border bg-background px-3 py-2">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span>
              {t("job.ingestProgressSummary", {
                completed: ingestProgress.counts.completed,
                progress: ingestProgress.overall_progress,
                total: ingestProgress.counts.total,
              })}
            </span>
            <Badge
              variant={ingestProgress.retrieve_ready ? "default" : "secondary"}
            >
              {ingestProgress.retrieve_ready
                ? t("job.retrieveReady")
                : t("job.retrieveNotReady")}
            </Badge>
          </div>
          <Progress value={ingestProgress.overall_progress} />
        </div>
      ) : null}
      {jobsQuery.isSuccess && jobsPagination.total > 0 ? (
        <section className="flex flex-col gap-3 rounded-md border bg-background p-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-muted-foreground">
              {t("job.listTotal", { total: jobsPagination.total })}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                aria-label={t("job.retryFailed")}
                disabled={failedJobIds.length === 0 || retryMutation.isPending}
                onClick={() => retryMutation.mutate(failedJobIds)}
                size="icon"
                title={t("job.retryFailed")}
                type="button"
                variant="outline"
              >
                <RefreshCcw aria-hidden="true" data-icon="inline-start" />
              </Button>
              <Button
                aria-label={t("action.refresh")}
                onClick={() => {
                  if (knowledgeBaseId !== undefined) {
                    void queryClient.invalidateQueries({
                      queryKey: adminQueryKeys.jobs(knowledgeBaseId),
                    })
                    void queryClient.invalidateQueries({
                      queryKey: adminQueryKeys.ingestProgress(knowledgeBaseId),
                    })
                  }
                }}
                size="icon"
                title={t("action.refresh")}
                type="button"
                variant="outline"
              >
                <RefreshCcw aria-hidden="true" data-icon="inline-start" />
              </Button>
            </div>
          </div>
          <Table aria-label={t("nav.jobs")}>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-56">
                  {t("job.column.job")}
                </TableHead>
                <TableHead className="min-w-44">
                  {t("job.field.knowledgeBase")}
                </TableHead>
                <TableHead className="min-w-48">
                  {t("job.column.source")}
                </TableHead>
                <TableHead>{t("job.column.status")}</TableHead>
                <TableHead>{t("job.column.stage")}</TableHead>
                <TableHead className="min-w-52">
                  {t("job.column.progress")}
                </TableHead>
                <TableHead className="min-w-40">
                  {t("job.column.updated")}
                </TableHead>
                <TableHead className="text-right">
                  {t("job.column.actions")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobs.map((item) => {
                const progressValue = getJobProgressValue(item.job)

                return (
                  <TableRow data-testid="job-list-row" key={item.job.id}>
                    <TableCell className="min-w-56 align-top whitespace-normal">
                      <div className="flex flex-col gap-1">
                        <div className="font-medium break-words">
                          {getJobDisplayName(item, t)}
                        </div>
                        <ResourceIdDisplay resourceId={item.job.id} />
                      </div>
                    </TableCell>
                    <TableCell className="min-w-44 align-top whitespace-normal">
                      <ResourceIdDisplay
                        resourceId={item.job.knowledge_base_id}
                      />
                    </TableCell>
                    <TableCell className="min-w-48 align-top whitespace-normal">
                      {item.document === null ? (
                        t("source.notAvailable")
                      ) : (
                        <div className="flex flex-col gap-1">
                          <div className="break-words">
                            {item.document.display_name}
                          </div>
                          <ResourceIdDisplay resourceId={item.document.id} />
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="align-top">
                      <Badge
                        variant={getJobStatusBadgeVariant(item.job.status)}
                      >
                        {t(getJobStateLabelKey(item.job))}
                      </Badge>
                    </TableCell>
                    <TableCell className="align-top">
                      {t(`jobStage.${item.job.stage}`)}
                    </TableCell>
                    <TableCell className="min-w-52 align-top whitespace-normal">
                      <div className="flex flex-col gap-2">
                        <Progress
                          label={t(getJobProgressLabelKey(item.job))}
                          value={progressValue}
                        />
                        <div className="text-xs break-words text-muted-foreground">
                          {item.job.progress_message}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="min-w-40 align-top">
                      <time dateTime={item.job.updated_at}>
                        {formatDate(item.job.updated_at, i18n.language)}
                      </time>
                    </TableCell>
                    <TableCell className="align-top">
                      <div className="flex flex-wrap justify-end gap-2">
                        <Button
                          onClick={() => setSelectedJobId(item.job.id)}
                          size="sm"
                          type="button"
                          variant="outline"
                        >
                          {t("job.viewDetails")}
                        </Button>
                        <Button
                          disabled={
                            retryMutation.isPending ||
                            item.job.status !== "failed"
                          }
                          onClick={() => retryMutation.mutate([item.job.id])}
                          size="sm"
                          type="button"
                          variant="outline"
                        >
                          {t("action.retry")}
                        </Button>
                        <Button
                          disabled={
                            cancelMutation.isPending ||
                            (item.job.status !== "queued" &&
                              item.job.status !== "running")
                          }
                          onClick={() => cancelMutation.mutate(item.job.id)}
                          size="sm"
                          type="button"
                          variant="outline"
                        >
                          {t("action.cancel")}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
          <IdeExplorerPagination
            onPageChange={updateExplorerPage}
            page={normalizedJobsPage}
            total={jobsPagination.total}
            pageSize={jobsPagination.page_size || ideExplorerPageSize}
          />
        </section>
      ) : null}
      {selectedJobItem === null ? null : (
        <JobDetailsDialog
          canceling={cancelMutation.isPending}
          formatDate={(value) => formatDate(value, i18n.language)}
          item={selectedJobItem}
          onCancel={(job) => cancelMutation.mutate(job.id)}
          onOpenChange={(open) => {
            if (!open) {
              setSelectedJobId(null)
            }
          }}
          onRetry={(job) => retryMutation.mutate([job.id])}
          open={selectedJobItem !== null}
          retrying={retryMutation.isPending}
        />
      )}
    </div>
  )
}

interface JobDetailsDialogProps {
  canceling: boolean
  formatDate: (value: string) => string
  item: JobListItem
  onCancel: (job: Job) => void
  onOpenChange: (open: boolean) => void
  onRetry: (job: Job) => void
  open: boolean
  retrying: boolean
}

function JobDetailsDialog({
  canceling,
  formatDate,
  item,
  onCancel,
  onOpenChange,
  onRetry,
  open,
  retrying,
}: JobDetailsDialogProps) {
  const { t } = useTranslation()
  const apiClient = useApiClient()
  const jobDetailQuery = useQuery({
    queryKey: adminQueryKeys.jobDetail(item.job.id),
    queryFn: async (): Promise<JobDetail> => {
      return apiClient.getJob(item.job.id)
    },
    refetchInterval: (query) => {
      const job = pickLatestJob(query.state.data, item.job)

      return getActiveRefetchInterval(isActiveJobStatus(job.status))
    },
    refetchIntervalInBackground: true,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  })
  const selectedJobId = item.job.id
  const selectedJobUpdatedAt = item.job.updated_at
  const jobDetailUpdatedAt = jobDetailQuery.data?.updated_at
  const refetchJobDetail = jobDetailQuery.refetch

  useEffect(() => {
    if (jobDetailUpdatedAt === selectedJobUpdatedAt) {
      return
    }

    void refetchJobDetail()
  }, [
    jobDetailUpdatedAt,
    refetchJobDetail,
    selectedJobId,
    selectedJobUpdatedAt,
  ])

  const job = pickLatestJob(jobDetailQuery.data, item.job)
  const events = jobDetailQuery.data?.events ?? []
  const parsedContent = item.detail?.parsed_content ?? null
  const captionSummary = createCaptionStageSummary(events)
  const ocrSummary = createOcrStageSummary(events, parsedContent)

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent
        className="grid max-h-[calc(100dvh-2rem)] grid-rows-[auto_auto_minmax(0,1fr)] sm:max-w-5xl"
        data-testid="job-detail-panel"
      >
        <DialogHeader className="pr-8">
          <DialogTitle>
            {item.document === null
              ? t("job.knowledgeBaseJob")
              : item.document.display_name}
          </DialogTitle>
          <DialogDescription>{job.id}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={retrying || job.status !== "failed"}
            onClick={() => onRetry(job)}
            size="sm"
            type="button"
            variant="outline"
          >
            {t("action.retry")}
          </Button>
          <Button
            disabled={
              canceling || (job.status !== "queued" && job.status !== "running")
            }
            onClick={() => onCancel(job)}
            size="sm"
            type="button"
            variant="outline"
          >
            {t("action.cancel")}
          </Button>
        </div>
        <div
          className="min-h-0 overflow-y-auto overscroll-contain pr-1"
          data-testid="job-detail-scroll-area"
        >
          <InspectorTabs
            ariaLabel={t("ide.detailsPanel")}
            tabs={[
              {
                content: (
                  <div className="flex flex-col gap-4">
                    <InspectorGrid>
                      <InspectorField label={t("job.field.job")}>
                        <ResourceIdDisplay resourceId={job.id} />
                      </InspectorField>
                      <InspectorField label={t("job.field.knowledgeBase")}>
                        <ResourceIdDisplay resourceId={job.knowledge_base_id} />
                      </InspectorField>
                      {item.document === null ? null : (
                        <InspectorField label={t("job.field.sourceDocument")}>
                          <ResourceIdDisplay resourceId={item.document.id} />
                        </InspectorField>
                      )}
                      {job.change_set_id === null ? null : (
                        <InspectorField label={t("job.field.changeSet")}>
                          <ResourceIdDisplay resourceId={job.change_set_id} />
                        </InspectorField>
                      )}
                      <InspectorField label={t("job.field.inputSnapshot")}>
                        {job.input_snapshot_id}
                      </InspectorField>
                      <InspectorField label={t("job.field.status")}>
                        <Badge variant={getJobStatusBadgeVariant(job.status)}>
                          {t(`status.${job.status}`)}
                        </Badge>
                      </InspectorField>
                      <InspectorField label={t("job.field.created")}>
                        <time dateTime={job.created_at}>
                          {formatDate(job.created_at)}
                        </time>
                      </InspectorField>
                    </InspectorGrid>
                    <InspectorSection title={t("job.column.progress")}>
                      <Progress
                        label={t(getJobProgressLabelKey(job))}
                        value={getJobProgressValue(job)}
                      />
                      <div className="text-sm text-muted-foreground">
                        {job.progress_message}
                      </div>
                    </InspectorSection>
                    {readErrorSummary(job.error) === null ? null : (
                      <InspectorSection title={t("job.section.error")}>
                        <div className="text-sm text-muted-foreground">
                          {readErrorSummary(job.error)}
                        </div>
                      </InspectorSection>
                    )}
                  </div>
                ),
                id: "summary",
                label: t("ide.summary"),
              },
              {
                content: (
                  <InspectorSection title={t("job.section.timeline")}>
                    <Progress
                      label={t(getJobProgressLabelKey(job))}
                      value={getJobProgressValue(job)}
                    />
                    {jobDetailQuery.isLoading ? (
                      <LoadingState label={t("state.loading")} />
                    ) : null}
                    {jobDetailQuery.isError ? (
                      <ErrorAlert title={t("state.loadFailed")} />
                    ) : null}
                    <JobEventTimeline
                      events={events}
                      formatDate={formatDate}
                      job={job}
                    />
                  </InspectorSection>
                ),
                id: "timeline",
                label: t("job.section.timeline"),
              },
              {
                content: (
                  <div className="flex flex-col gap-5">
                    {captionSummary === null ? null : (
                      <CaptionStageSummaryView summary={captionSummary} />
                    )}
                    {ocrSummary === null ? null : (
                      <OcrStageSummaryView summary={ocrSummary} />
                    )}
                    <InspectorSection title={t("job.section.parser")}>
                      {parsedContent === null ? (
                        <div className="text-sm text-muted-foreground">
                          {t("source.notAvailable")}
                        </div>
                      ) : (
                        <InspectorGrid>
                          <InspectorField label={t("job.column.parsedContent")}>
                            <ResourceIdDisplay resourceId={parsedContent.id} />
                          </InspectorField>
                          <InspectorField label={t("job.field.parserName")}>
                            {parsedContent.parser_name}
                          </InspectorField>
                          <InspectorField label={t("job.field.parserVersion")}>
                            {parsedContent.parser_version}
                          </InspectorField>
                        </InspectorGrid>
                      )}
                    </InspectorSection>
                  </div>
                ),
                id: "parser",
                label: t("job.section.parser"),
              },
              {
                content: (
                  <div className="flex flex-col gap-5">
                    <InspectorSection title={t("job.section.artifacts")}>
                      <InspectorGrid>
                        <InspectorField label={t("job.column.parsedContent")}>
                          {job.parsed_content_id === null ? (
                            t("source.notAvailable")
                          ) : (
                            <ResourceIdDisplay
                              resourceId={job.parsed_content_id}
                            />
                          )}
                        </InspectorField>
                        <InspectorField label={t("job.column.changeSet")}>
                          {job.change_set_id === null ? (
                            t("source.notAvailable")
                          ) : (
                            <ResourceIdDisplay resourceId={job.change_set_id} />
                          )}
                        </InspectorField>
                      </InspectorGrid>
                    </InspectorSection>
                    <InspectorSection title={t("job.section.logs")}>
                      <div className="text-sm text-muted-foreground">
                        {job.progress_message}
                      </div>
                    </InspectorSection>
                    <InspectorSection title={t("job.section.error")}>
                      <div className="text-sm text-muted-foreground">
                        {readErrorSummary(job.error) ??
                          t("source.notAvailable")}
                      </div>
                    </InspectorSection>
                  </div>
                ),
                id: "artifacts",
                label: t("job.section.artifacts"),
              },
              {
                content: <InspectorJson value={jobDetailQuery.data ?? job} />,
                id: "data",
                label: t("ide.rawData"),
              },
            ]}
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}

function OcrStageSummaryView({ summary }: { summary: OcrStageSummary }) {
  const { t } = useTranslation()
  const rows = [
    [t("job.ocr.pageCount"), summary.pageCount],
    [t("job.ocr.blockCount"), summary.blockCount],
    [t("job.ocr.failedPages"), summary.failedPages],
    [t("job.ocr.retryAttempts"), summary.retryAttempts],
    [t("job.ocr.confidence"), formatNullableNumber(summary.confidence)],
    [t("job.ocr.provider"), summary.provider],
  ] as const

  return (
    <InspectorSection title={t("job.section.ocr")}>
      <Table>
        <TableBody>
          {rows.map(([label, value]) => (
            <TableRow key={label}>
              <TableCell className="text-muted-foreground">{label}</TableCell>
              <TableCell className="text-right font-medium">
                {value ?? t("source.notAvailable")}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {summary.candidatePages.length === 0 ? null : (
        <div className="mt-3 flex flex-col gap-2">
          <div className="text-sm font-medium">
            {t("job.ocr.candidatePages")}
          </div>
          <div className="flex flex-wrap gap-2">
            {summary.candidatePages.map((pageNumber) => (
              <Badge key={pageNumber} variant="outline">
                {pageNumber}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </InspectorSection>
  )
}

function CaptionStageSummaryView({
  summary,
}: {
  summary: CaptionStageSummary
}) {
  const { t } = useTranslation()
  const rows = [
    [t("job.caption.eligibleMedia"), summary.eligibleMediaAssetCount],
    [t("job.caption.generated"), summary.generatedCount],
    [t("job.caption.cacheHits"), summary.cacheHitCount],
    [t("job.caption.failed"), summary.failedCount],
    [t("job.caption.providerCalls"), summary.providerCallCount],
  ] as const

  return (
    <InspectorSection title={t("job.section.caption")}>
      <Table>
        <TableBody>
          {rows.map(([label, value]) => (
            <TableRow key={label}>
              <TableCell className="text-muted-foreground">{label}</TableCell>
              <TableCell className="text-right font-medium">
                {value ?? t("source.notAvailable")}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {summary.mediaAssetIds.length === 0 ? null : (
        <div className="mt-3 flex flex-col gap-2">
          <div className="text-sm font-medium">
            {t("job.caption.mediaAssetIds")}
          </div>
          <div className="flex flex-wrap gap-2">
            {summary.mediaAssetIds.map((mediaAssetId) => (
              <ResourceIdDisplay key={mediaAssetId} resourceId={mediaAssetId} />
            ))}
          </div>
        </div>
      )}
    </InspectorSection>
  )
}

interface JobEventTimelineProps {
  events: readonly JobEvent[]
  formatDate: (value: string) => string
  job: Job
}

function JobEventTimeline({ events, formatDate, job }: JobEventTimelineProps) {
  const { t } = useTranslation()
  const sortedEvents = sortJobTimelineEvents(events)

  if (events.length === 0) {
    return (
      <div className="text-sm text-muted-foreground">
        {t("job.emptyEvents")}
      </div>
    )
  }

  return (
    <ol className="flex flex-col gap-2">
      {sortedEvents.map((event, index) => {
        const metadata = createTimelineEventMetadata(event.metadata)

        return (
          <li
            className="flex flex-col gap-1 rounded-md border bg-muted/30 p-3 text-sm"
            key={`${event.created_at}-${event.type}-${index}`}
          >
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">
                {t(getTimelineEventStateLabelKey(event, job))}
              </Badge>
            </div>
            <time
              className="block text-xs text-muted-foreground"
              dateTime={event.created_at}
            >
              {formatDate(event.created_at)}
            </time>
            <div>{t(getTimelineEventMessageKey(event, job))}</div>
            {hasMetadata(metadata) ? (
              <div className="flex flex-col gap-1">
                <div className="text-xs text-muted-foreground">
                  {t("job.metadata")}
                </div>
                <InspectorJson value={metadata} />
              </div>
            ) : null}
          </li>
        )
      })}
    </ol>
  )
}

function getJobStatusBadgeVariant(status: JobStatus) {
  if (status === "failed" || status === "canceled") {
    return "destructive"
  }

  if (status === "completed") {
    return "secondary"
  }

  return "outline"
}

function readErrorSummary(error: Record<string, unknown> | null) {
  if (error === null) {
    return null
  }

  const summary = error.summary ?? error.message

  return typeof summary === "string" ? summary : null
}

function hasMetadata(metadata: Record<string, unknown>) {
  return Object.keys(metadata).length > 0
}

function createTimelineEventMetadata(metadata: Record<string, unknown>) {
  const rest = { ...metadata }

  delete rest.stage
  delete rest.status
  return rest
}

function hasActiveJobListItems(items: readonly JobListItem[]) {
  return items.some((item) => isActiveJobStatus(item.job.status))
}

function createCaptionStageSummary(
  events: readonly JobEvent[]
): CaptionStageSummary | null {
  const summary: CaptionStageSummary = {
    cacheHitCount: null,
    eligibleMediaAssetCount: null,
    failedCount: null,
    generatedCount: null,
    mediaAssetIds: [],
    providerCallCount: null,
  }

  for (const event of events) {
    if (event.stage !== "captioning" && !hasCaptionMetadata(event.metadata)) {
      continue
    }

    summary.eligibleMediaAssetCount =
      readNumber(event.metadata.eligible_media_asset_count) ??
      summary.eligibleMediaAssetCount
    summary.generatedCount =
      readNumber(event.metadata.caption_generated_count) ??
      summary.generatedCount
    summary.cacheHitCount =
      readNumber(event.metadata.caption_cache_hit_count) ??
      readNumber(event.metadata.cache_hit_count) ??
      summary.cacheHitCount
    summary.failedCount =
      readNumber(event.metadata.caption_failed_count) ??
      readNumber(event.metadata.failed_count) ??
      summary.failedCount
    summary.providerCallCount =
      readNumber(event.metadata.provider_call_count) ??
      summary.providerCallCount
    summary.mediaAssetIds = mergeStringArrays(
      summary.mediaAssetIds,
      readStringArray(event.metadata.media_asset_ids)
    )
  }

  return hasCaptionSummaryValue(summary) ? summary : null
}

function createOcrStageSummary(
  events: readonly JobEvent[],
  parsedContent: ParsedContent | null
): OcrStageSummary | null {
  const summary: OcrStageSummary = {
    blockCount: parsedContent?.ocr_block_count ?? null,
    candidatePages: [],
    confidence: null,
    failedPages: null,
    pageCount: parsedContent?.ocr_page_count ?? null,
    provider:
      readString(parsedContent?.ocr_provider_metadata?.provider) ?? null,
    retryAttempts: null,
  }

  for (const event of events) {
    if (event.stage !== "ocr" && !hasOcrMetadata(event.metadata)) {
      continue
    }

    summary.blockCount =
      readNumber(event.metadata.ocr_block_count) ??
      readNumber(event.metadata.block_count) ??
      summary.blockCount
    summary.candidatePages = mergeNumberArrays(
      summary.candidatePages,
      readNumberArray(event.metadata.ocr_candidate_pages)
    )
    summary.confidence =
      readNumber(event.metadata.ocr_confidence) ??
      readNumber(event.metadata.confidence) ??
      summary.confidence
    summary.failedPages =
      readNumber(event.metadata.ocr_failed_page_count) ??
      readNumber(event.metadata.failed_page_count) ??
      summary.failedPages
    summary.pageCount =
      readNumber(event.metadata.ocr_page_count) ??
      readNumber(event.metadata.page_count) ??
      readNumber(event.metadata.ocr_candidate_page_count) ??
      summary.pageCount
    summary.provider =
      readString(event.metadata.ocr_provider_name) ??
      readString(event.metadata.provider_name) ??
      readString(event.metadata.provider) ??
      summary.provider
    summary.retryAttempts =
      readNumber(event.metadata.ocr_retry_attempt_count) ??
      readNumber(event.metadata.retry_attempt_count) ??
      summary.retryAttempts
  }

  return hasOcrSummaryValue(summary) ? summary : null
}

function hasCaptionMetadata(metadata: Record<string, unknown>) {
  return [
    "eligible_media_asset_count",
    "media_asset_ids",
    "caption_generated_count",
    "caption_cache_hit_count",
    "caption_failed_count",
    "provider_call_count",
  ].some((key) => key in metadata)
}

function hasOcrMetadata(metadata: Record<string, unknown>) {
  return [
    "ocr_block_count",
    "ocr_candidate_page_count",
    "ocr_candidate_pages",
    "ocr_confidence",
    "ocr_failed_page_count",
    "ocr_page_count",
    "ocr_provider_name",
    "ocr_retry_attempt_count",
  ].some((key) => key in metadata)
}

function hasCaptionSummaryValue(summary: CaptionStageSummary) {
  return (
    summary.cacheHitCount !== null ||
    summary.eligibleMediaAssetCount !== null ||
    summary.failedCount !== null ||
    summary.generatedCount !== null ||
    summary.mediaAssetIds.length > 0 ||
    summary.providerCallCount !== null
  )
}

function hasOcrSummaryValue(summary: OcrStageSummary) {
  return (
    summary.blockCount !== null ||
    summary.candidatePages.length > 0 ||
    summary.confidence !== null ||
    summary.failedPages !== null ||
    summary.pageCount !== null ||
    summary.provider !== null ||
    summary.retryAttempts !== null
  )
}

function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function readString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null
}

function readRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function getJobPressureWarnings(
  settings: SystemSettingsStatus | undefined,
  t: (key: string) => string
) {
  const dependencies = readRecord(settings?.dependencies)
  const pressure = readRecord(dependencies.pressure)
  const queue = readRecord(pressure.queue)
  const compile = readRecord(pressure.compile)
  const warnings: string[] = []

  if (isPressureState(queue.status)) {
    warnings.push(t("systemSettings.queuePressureWarning"))
  }
  if (isPressureState(compile.status)) {
    warnings.push(t("systemSettings.compilePressureWarning"))
  }

  return warnings
}

function isPressureState(value: unknown) {
  return value === "degraded" || value === "saturated"
}

function readStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : []
}

function readNumberArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is number => typeof item === "number")
    : []
}

function mergeStringArrays(
  current: readonly string[],
  next: readonly string[]
) {
  return [...new Set([...current, ...next])]
}

function mergeNumberArrays(
  current: readonly number[],
  next: readonly number[]
) {
  return [...new Set([...current, ...next])].sort((left, right) => left - right)
}

function formatNullableNumber(value: number | null) {
  return value === null ? null : String(value)
}

function getJobDisplayName(item: JobListItem, t: TFunction) {
  return item.document === null
    ? t("job.knowledgeBaseJob")
    : item.document.display_name
}

function pickLatestJob(detail: JobDetail | undefined, itemJob: Job): Job {
  if (detail === undefined) {
    return itemJob
  }

  return Date.parse(detail.updated_at) >= Date.parse(itemJob.updated_at)
    ? detail
    : itemJob
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

function formatDate(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value))
}
