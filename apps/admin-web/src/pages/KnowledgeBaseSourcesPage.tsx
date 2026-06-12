import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import { FileUp, Plus, RefreshCw, Trash2 } from "lucide-react"
import {
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react"
import { useTranslation } from "react-i18next"
import { useParams, useSearchParams } from "react-router"

import {
  type CreateSourceWatchRuleInput,
  type DeleteImpactPreview,
  type Job,
  type JobStage,
  type MediaAsset,
  type ParsedContent,
  type PresignedUpload,
  type SourceDocument,
  type SourceDocumentDetail,
  type SourceDocumentStatus,
  type ScheduledImportJob,
  type SourceWatchScanItem,
  type SourceWatchScanItemKind,
  type SourceWatchRule,
  type SourceWatchSourceKind,
  type SystemSettingsStatus,
} from "@/api/fococontext-client.js"
import { useApiClient } from "@/api/api-client-context.js"
import {
  getActiveRefetchInterval,
  isActiveJobStatus,
  isActiveSourceDocumentStatus,
} from "@/api/job-polling.js"
import { adminQueryKeys } from "@/api/query-keys.js"
import {
  IdeDetailPanel,
  IdeExplorer,
  IdeExplorerCategoryTabs,
  IdeExplorerItem,
  IdeExplorerPagination,
  IdeWorkspace,
  IdeWorkbenchDetailPanel,
  InspectorField,
  InspectorGrid,
  InspectorJson,
  InspectorSection,
  InspectorTabs,
  ideExplorerPageSize,
  normalizeIdeExplorerPage,
} from "@/components/ide/IdeWorkspace.js"
import { MarkdownPrimaryViewer } from "@/components/markdown/MarkdownPrimaryViewer.js"
import { ResourceIdDisplay } from "@/components/resource-id/ResourceIdDisplay.js"
import { EmptyState } from "@/components/state/EmptyState.js"
import { ErrorAlert } from "@/components/state/ErrorAlert.js"
import { LoadingState } from "@/components/state/LoadingState.js"
import { Button } from "@/components/ui/button.js"
import { Badge } from "@/components/ui/badge.js"
import { Checkbox } from "@/components/ui/checkbox.js"
import { AppDialog as Dialog } from "@/components/state/AppDialog.js"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert.js"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field.js"
import { Input } from "@/components/ui/input.js"
import { Progress } from "@/components/ui/progress.js"
import { showToast } from "@/components/ui/toast.js"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog.js"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table.js"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.js"
import {
  getSourceExplorerProgressValue,
  getSourceExplorerSubtitle,
  getSourceExplorerStatusLabelKey,
  sortSourceDetailsNewestFirst,
} from "./source-display.js"
import {
  readDirectUploadSettings,
  shouldUseDirectUpload,
  type DirectUploadSettings,
  type SourceUploadMode,
} from "./source-upload-routing.js"

interface SourceDocumentsView {
  details: SourceDocumentDetail[]
  documents: SourceDocument[]
  pagination: {
    has_more: boolean
    page: number
    page_size: number
    total: number
  }
}

interface UploadRow {
  documentId?: string
  errorMessage?: string
  fileName: string
  fileSize: number
  jobId?: string
  phase?: "selected" | "hashing" | "session" | "object_upload" | "finalizing"
  progress: number
  rowKey: string
  status: "selected" | "uploading" | "completed" | "failed"
}

type SourceSelection =
  | {
      detail: SourceDocumentDetail
      kind: "source"
    }
  | {
      kind: "source_watch"
      rule: SourceWatchRule
    }

type SourceExplorerCategory = "source_documents" | "source_watch_rules"

const sourceExplorerCategories: SourceExplorerCategory[] = [
  "source_documents",
  "source_watch_rules",
]
const sourceWatchScanHistoryPreviewLimit = 5
const sourceWatchScanItemPreviewLimit = 20
const sourceWatchPreviewKinds = [
  "new",
  "changed",
  "delete_candidate",
  "skipped",
] as const satisfies readonly SourceWatchScanItemKind[]

export function KnowledgeBaseSourcesPage() {
  const { knowledgeBaseId } = useParams()
  const { i18n, t } = useTranslation()
  const apiClient = useApiClient()
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const activeExplorerCategory = readSourceExplorerCategory(searchParams)
  const sourceDocumentsPage = readSearchPage(searchParams, "source_page")
  const sourceWatchRulesPage = readSearchPage(searchParams, "source_watch_page")
  const sourceDocumentsListOptions = {
    page: sourceDocumentsPage,
    pageSize: ideExplorerPageSize,
  }
  const sourceWatchRulesListOptions = {
    page: sourceWatchRulesPage,
    pageSize: ideExplorerPageSize,
  }
  const [uploadOpen, setUploadOpen] = useState(false)
  const [uploadErrorMessage, setUploadErrorMessage] = useState<string | null>(
    null
  )
  const [uploadRows, setUploadRows] = useState<UploadRow[]>([])
  const [uploadMode, setUploadMode] = useState<SourceUploadMode>("auto")
  const [sourceWatchCreateOpen, setSourceWatchCreateOpen] = useState(false)
  const [selectedItem, setSelectedItem] = useState<SourceSelection | null>(null)
  const [deletePreviewDetail, setDeletePreviewDetail] =
    useState<SourceDocumentDetail | null>(null)
  const [deletePreview, setDeletePreview] =
    useState<DeleteImpactPreview | null>(null)
  const [sourceWatchPreview, setSourceWatchPreview] =
    useState<ScheduledImportJob | null>(null)

  const sourceDocumentsQuery = useQuery({
    enabled: knowledgeBaseId !== undefined,
    queryKey:
      knowledgeBaseId === undefined
        ? adminQueryKeys.sourceDocuments("")
        : adminQueryKeys.sourceDocuments(
            knowledgeBaseId,
            sourceDocumentsListOptions
          ),
    queryFn: async (): Promise<SourceDocumentsView> => {
      if (knowledgeBaseId === undefined) {
        return {
          details: [],
          documents: [],
          pagination: createEmptyPagination(sourceDocumentsPage),
        }
      }

      const documents = await apiClient.listSourceDocuments(
        knowledgeBaseId,
        sourceDocumentsListOptions
      )
      const details = await Promise.all(
        documents.data.map((document) =>
          apiClient.getSourceDocument(document.id)
        )
      )

      return {
        details,
        documents: documents.data,
        pagination: documents.pagination,
      }
    },
    refetchInterval: (query) =>
      getActiveRefetchInterval(hasActiveSourceDocuments(query.state.data)),
    refetchIntervalInBackground: true,
  })

  const sourceWatchQuery = useQuery({
    enabled: knowledgeBaseId !== undefined,
    queryKey:
      knowledgeBaseId === undefined
        ? adminQueryKeys.sourceWatchRules("")
        : adminQueryKeys.sourceWatchRules(
            knowledgeBaseId,
            sourceWatchRulesListOptions
          ),
    queryFn: async () =>
      knowledgeBaseId === undefined
        ? { data: [], pagination: createEmptyPagination(sourceWatchRulesPage) }
        : apiClient.listSourceWatchRules(
            knowledgeBaseId,
            sourceWatchRulesListOptions
          ),
  })
  const selectedSourceWatchRuleId =
    selectedItem?.kind === "source_watch" ? selectedItem.rule.id : null
  const sourceWatchScansListOptions = {
    page: 1,
    pageSize: sourceWatchScanHistoryPreviewLimit,
  }
  const sourceWatchScansQuery = useQuery({
    enabled: selectedSourceWatchRuleId !== null,
    queryKey:
      selectedSourceWatchRuleId === null
        ? adminQueryKeys.sourceWatchScans("")
        : adminQueryKeys.sourceWatchScans(
            selectedSourceWatchRuleId,
            sourceWatchScansListOptions
          ),
    queryFn: async () =>
      selectedSourceWatchRuleId === null
        ? { data: [] }
        : apiClient.listSourceWatchScans(
            selectedSourceWatchRuleId,
            sourceWatchScansListOptions
          ),
    refetchInterval: (query) =>
      (query.state.data?.data ?? []).some(
        (scan) => scan.status !== "completed" && scan.status !== "disabled"
      )
        ? 2500
        : false,
    refetchIntervalInBackground: true,
  })

  const systemSettingsQuery = useQuery({
    queryKey: adminQueryKeys.systemSettings(),
    queryFn: () => apiClient.getSystemSettings(),
  })
  const directUploadSettings = readDirectUploadSettings(
    systemSettingsQuery.data
  )
  const uploadPressureWarnings = getUploadPressureWarnings(
    systemSettingsQuery.data,
    t
  )

  const uploadMutation = useMutation({
    mutationFn: async (input: {
      file: File
      sourcePath?: string
      tags?: string
      uploadMode: SourceUploadMode
    }) => {
      if (knowledgeBaseId === undefined) {
        throw new Error("Knowledge base route parameter is missing.")
      }

      if (
        shouldUseDirectUpload({
          directUploadSettings,
          fileSize: input.file.size,
          uploadMode: input.uploadMode,
        })
      ) {
        return uploadDirectSourceDocument(knowledgeBaseId, input)
      }

      return apiClient.uploadSourceDocument(knowledgeBaseId, input)
    },
    onError: (error, variables) => {
      const errorMessage =
        error instanceof Error ? error.message : t("progress.uploadFailed")
      const rowKey = createUploadRowKey(variables.file)

      setUploadRows((rows) =>
        rows.map((row) =>
          row.rowKey === rowKey
            ? { ...row, errorMessage, progress: 100, status: "failed" }
            : row
        )
      )
    },
    onSuccess: async (result, variables) => {
      const rowKey = createUploadRowKey(variables.file)

      setUploadRows((rows) =>
        rows.map((row) =>
          row.rowKey === rowKey
            ? {
                ...row,
                documentId: result.document.id,
                jobId: result.job.id,
                progress: 100,
                status: "completed",
              }
            : row
        )
      )
      if (knowledgeBaseId !== undefined) {
        await queryClient.invalidateQueries({
          queryKey: adminQueryKeys.sourceDocuments(knowledgeBaseId),
        })
        await queryClient.invalidateQueries({
          queryKey: adminQueryKeys.jobs(knowledgeBaseId),
        })
        await queryClient.invalidateQueries({
          queryKey: adminQueryKeys.ingestProgress(knowledgeBaseId),
        })
      }
    },
  })

  const details = useMemo(
    () => sourceDocumentsQuery.data?.details ?? [],
    [sourceDocumentsQuery.data?.details]
  )
  const sourceDocumentsPagination =
    sourceDocumentsQuery.data?.pagination ??
    createEmptyPagination(sourceDocumentsPage)
  const sortedDetails = useMemo(
    () => sortSourceDetailsNewestFirst(details),
    [details]
  )
  const sourceWatchRules = useMemo(
    () => sourceWatchQuery.data?.data ?? [],
    [sourceWatchQuery.data?.data]
  )
  const sourceWatchRulesPagination =
    sourceWatchQuery.data?.pagination ??
    createEmptyPagination(sourceWatchRulesPage)
  const selectedLiveItem =
    selectedItem === null
      ? null
      : selectedItem.kind === "source"
        ? ({
            kind: "source" as const,
            detail:
              sortedDetails.find(
                (detail) =>
                  detail.document.id === selectedItem.detail.document.id
              ) ?? selectedItem.detail,
          } satisfies SourceSelection)
        : ({
            kind: "source_watch" as const,
            rule:
              sourceWatchRules.find(
                (rule) => rule.id === selectedItem.rule.id
              ) ?? selectedItem.rule,
          } satisfies SourceSelection)
  const failedJobIds = details.flatMap((detail) =>
    detail.latest_job?.status === "failed" ? [detail.latest_job.id] : []
  )

  function updateUploadRow(rowKey: string, patch: Partial<UploadRow>) {
    setUploadRows((rows) =>
      rows.map((row) => (row.rowKey === rowKey ? { ...row, ...patch } : row))
    )
  }

  async function uploadDirectSourceDocument(
    currentKnowledgeBaseId: string,
    input: {
      file: File
      sourcePath?: string
      tags?: string
    }
  ) {
    const rowKey = createUploadRowKey(input.file)

    updateUploadRow(rowKey, {
      phase: "hashing",
      progress: 8,
      status: "uploading",
    })
    const contentHash = await calculateSha256ContentHash(input.file)
    updateUploadRow(rowKey, {
      phase: "session",
      progress: 18,
    })
    const session = await apiClient.createSourceUploadSession(
      currentKnowledgeBaseId,
      {
        contentHash,
        displayName: input.file.name,
        fileName: input.file.name,
        metadata: createUploadMetadata(input.tags),
        mimeType: input.file.type || "application/octet-stream",
        size: input.file.size,
        ...(input.sourcePath === undefined ||
        input.sourcePath.trim().length === 0
          ? {}
          : { sourcePath: input.sourcePath }),
      }
    )
    updateUploadRow(rowKey, {
      phase: "object_upload",
      progress: 25,
    })
    await uploadPresignedObject(
      session.presigned_upload,
      input.file,
      (value) =>
        updateUploadRow(rowKey, {
          phase: "object_upload",
          progress: Math.max(25, Math.min(88, 25 + value * 0.63)),
        }),
      t("source.directUploadObjectFailed")
    )
    updateUploadRow(rowKey, {
      phase: "finalizing",
      progress: 92,
    })

    return apiClient.finalizeSourceUploadSession(
      currentKnowledgeBaseId,
      session.upload_session.id,
      {
        contentHash,
      }
    )
  }

  const retryFailedMutation = useMutation({
    mutationFn: async () => {
      await Promise.all(failedJobIds.map((jobId) => apiClient.retryJob(jobId)))
    },
    onSuccess: async () => {
      if (knowledgeBaseId !== undefined) {
        await queryClient.invalidateQueries({
          queryKey: adminQueryKeys.sourceDocuments(knowledgeBaseId),
        })
        await queryClient.invalidateQueries({
          queryKey: adminQueryKeys.jobs(knowledgeBaseId),
        })
        await queryClient.invalidateQueries({
          queryKey: adminQueryKeys.ingestProgress(knowledgeBaseId),
        })
      }
    },
  })

  const reingestMutation = useMutation({
    mutationFn: async (detail: SourceDocumentDetail) =>
      apiClient.reingestSourceDocument(detail.document.id),
    onSuccess: async (result) => {
      setSelectedItem((current) =>
        current?.kind === "source" &&
        current.detail.document.id === result.document.id
          ? {
              kind: "source",
              detail: {
                ...current.detail,
                document: result.document,
                latest_job: result.job,
              },
            }
          : current
      )
      if (knowledgeBaseId !== undefined) {
        await queryClient.invalidateQueries({
          queryKey: adminQueryKeys.sourceDocuments(knowledgeBaseId),
        })
        await queryClient.invalidateQueries({
          queryKey: adminQueryKeys.jobs(knowledgeBaseId),
        })
        await queryClient.invalidateQueries({
          queryKey: adminQueryKeys.ingestProgress(knowledgeBaseId),
        })
      }
    },
  })

  const retryMediaCaptionMutation = useMutation({
    mutationFn: async (asset: MediaAsset) =>
      apiClient.retryMediaAssetCaption(asset.id),
    onError: (error) => {
      showToast({
        message:
          error instanceof Error
            ? error.message
            : t("source.caption.retryFailed"),
        variant: "error",
      })
    },
    onSuccess: async () => {
      showToast({ message: t("source.caption.retrySuccess") })
      if (knowledgeBaseId !== undefined) {
        await queryClient.invalidateQueries({
          queryKey: adminQueryKeys.sourceDocuments(knowledgeBaseId),
        })
        await queryClient.invalidateQueries({
          queryKey: adminQueryKeys.jobs(knowledgeBaseId),
        })
        await queryClient.invalidateQueries({
          queryKey: adminQueryKeys.ingestProgress(knowledgeBaseId),
        })
      }
    },
  })

  const retrySourceOcrMutation = useMutation({
    mutationFn: async (detail: SourceDocumentDetail) =>
      apiClient.retrySourceDocumentOcr(detail.document.id, {
        mode: "retry_failed",
      }),
    onError: (error) => {
      showToast({
        message:
          error instanceof Error ? error.message : t("source.ocr.retryFailed"),
        variant: "error",
      })
    },
    onSuccess: async (job) => {
      showToast({ message: t("source.ocr.retrySuccess") })
      if (knowledgeBaseId !== undefined) {
        await queryClient.invalidateQueries({
          queryKey: adminQueryKeys.sourceDocuments(knowledgeBaseId),
        })
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

  const createSourceWatchMutation = useMutation({
    mutationFn: async (input: CreateSourceWatchRuleInput) => {
      if (knowledgeBaseId === undefined) {
        throw new Error("Knowledge base route parameter is missing.")
      }

      return apiClient.createSourceWatchRule(knowledgeBaseId, input)
    },
    onSuccess: async (result) => {
      setSourceWatchCreateOpen(false)
      showToast({ message: t("sourceWatch.toast.created") })
      if (knowledgeBaseId !== undefined) {
        await queryClient.invalidateQueries({
          queryKey: adminQueryKeys.sourceWatchRules(knowledgeBaseId),
        })
      }
      setSelectedItem({ kind: "source_watch", rule: result.rule })
      const next = new URLSearchParams(searchParams)
      next.set("explorer", "source_watch_rules")
      setSearchParams(next, { replace: true })
    },
  })

  const scanSourceWatchMutation = useMutation({
    mutationFn: async (rule: SourceWatchRule) =>
      apiClient.scanSourceWatchRule(rule.id),
    onSuccess: async (result) => {
      setSourceWatchPreview(result.scan.scheduled_import_job)
      showToast({ message: t("sourceWatch.toast.scanned") })
      if (knowledgeBaseId !== undefined) {
        await queryClient.invalidateQueries({
          queryKey: adminQueryKeys.sourceWatchRules(knowledgeBaseId),
        })
        await queryClient.invalidateQueries({
          queryKey: adminQueryKeys.sourceDocuments(knowledgeBaseId),
        })
        await queryClient.invalidateQueries({
          queryKey: adminQueryKeys.jobs(knowledgeBaseId),
        })
        await queryClient.invalidateQueries({
          queryKey: adminQueryKeys.ingestProgress(knowledgeBaseId),
        })
      }
      await queryClient.invalidateQueries({
        queryKey: adminQueryKeys.sourceWatchScans(
          result.scan.source_watch_rule_id
        ),
      })
    },
  })

  const disableSourceWatchMutation = useMutation({
    mutationFn: async (rule: SourceWatchRule) =>
      apiClient.disableSourceWatchRule(rule.id),
    onSuccess: async (result) => {
      showToast({ message: t("sourceWatch.toast.disabled") })
      if (knowledgeBaseId !== undefined) {
        await queryClient.invalidateQueries({
          queryKey: adminQueryKeys.sourceWatchRules(knowledgeBaseId),
        })
      }
      await queryClient.invalidateQueries({
        queryKey: adminQueryKeys.sourceWatchScans(result.rule.id),
      })
    },
  })

  const openSourceWatchPreviewMutation = useMutation({
    mutationFn: async (rule: SourceWatchRule) => {
      if (rule.latest_scan === null) {
        throw new Error("Source watch rule has no latest scan.")
      }

      return apiClient.getScheduledImportJob(
        rule.latest_scan.scheduled_import_job_id
      )
    },
    onSuccess: (result) => setSourceWatchPreview(result.scheduled_import_job),
  })

  const deletePreviewMutation = useMutation({
    mutationFn: async (detail: SourceDocumentDetail) =>
      apiClient.previewSourceDeleteImpact(detail.document.id),
    onSuccess: async (preview) => {
      setDeletePreview(preview)
    },
  })

  const deleteSourceMutation = useMutation({
    mutationFn: async (detail: SourceDocumentDetail) =>
      apiClient.deleteSourceDocument(detail.document.id),
    onSuccess: async (result) => {
      const deletedDocumentId = result.document_id
      setDeletePreviewDetail(null)
      setDeletePreview(null)
      setSelectedItem((current) =>
        current?.kind === "source" &&
        current.detail.document.id === deletedDocumentId
          ? null
          : current
      )
      showToast({
        message: t("cleanup.deleteQueued", {
          operationId: result.cleanup_operation.id,
        }),
      })
      if (knowledgeBaseId !== undefined) {
        await queryClient.invalidateQueries({
          queryKey: adminQueryKeys.sourceDocuments(knowledgeBaseId),
        })
        await queryClient.invalidateQueries({
          queryKey: adminQueryKeys.jobs(knowledgeBaseId),
        })
        await queryClient.invalidateQueries({
          queryKey: adminQueryKeys.ingestProgress(knowledgeBaseId),
        })
      }
      await queryClient.invalidateQueries({
        queryKey: adminQueryKeys.cleanupOperations(),
      })
    },
  })

  function handleUploadSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setUploadErrorMessage(null)
    const formData = new FormData(event.currentTarget)
    const files = formData
      .getAll("files")
      .filter(
        (item): item is File => item instanceof File && item.name.length > 0
      )

    if (files.length === 0) {
      setUploadErrorMessage(t("source.noFileSelected"))
      setUploadRows([])
      return
    }

    if (files.some((file) => file.size === 0)) {
      setUploadErrorMessage(t("source.emptyFileSelected"))
      return
    }

    const sourcePath = String(formData.get("sourcePath") ?? "")
    const tags = String(formData.get("tags") ?? "")

    if (uploadMode === "direct" && !directUploadSettings.ready) {
      setUploadErrorMessage(t("source.uploadMode.directUnavailable"))
      return
    }

    setUploadRows((rows) => [
      ...rows.filter(
        (row) => !files.some((file) => row.rowKey === createUploadRowKey(file))
      ),
      ...files.map((file) => ({
        fileName: file.name,
        fileSize: file.size,
        progress: 35,
        rowKey: createUploadRowKey(file),
        status: "uploading" as const,
      })),
    ])

    for (const file of files) {
      uploadMutation.mutate({ file, sourcePath, tags, uploadMode })
    }
  }

  function handleUploadFileChange(files: File[]) {
    setUploadErrorMessage(null)

    if (files.length === 0) {
      setUploadRows([])
      return
    }

    setUploadRows(
      files.map((file) => ({
        fileName: file.name,
        fileSize: file.size,
        progress: 0,
        rowKey: createUploadRowKey(file),
        status: "selected",
      }))
    )
  }

  function openUploadDialog() {
    setUploadErrorMessage(null)
    setUploadRows([])
    setUploadMode("auto")
    setUploadOpen(true)
  }

  function handleUploadDialogOpenChange(open: boolean) {
    setUploadOpen(open)

    if (!open) {
      setUploadErrorMessage(null)
      setUploadRows([])
      setUploadMode("auto")
      uploadMutation.reset()
    }
  }

  function handlePreviewDelete(detail: SourceDocumentDetail) {
    setDeletePreviewDetail(detail)
    setDeletePreview(null)
    deletePreviewMutation.mutate(detail)
  }

  function handleDeleteDialogOpenChange(open: boolean) {
    if (open) {
      return
    }

    setDeletePreviewDetail(null)
    setDeletePreview(null)
    deletePreviewMutation.reset()
    deleteSourceMutation.reset()
  }

  const selectedItemExists =
    selectedItem === null
      ? false
      : activeExplorerCategory === "source_documents" &&
          selectedItem.kind === "source"
        ? sortedDetails.some(
            (detail) => detail.document.id === selectedItem.detail.document.id
          )
        : activeExplorerCategory === "source_watch_rules" &&
            selectedItem.kind === "source_watch"
          ? sourceWatchRules.some((rule) => rule.id === selectedItem.rule.id)
          : false

  useEffect(() => {
    if (sourceDocumentsQuery.isLoading || sourceWatchQuery.isLoading) {
      return
    }

    if (selectedItemExists) {
      return
    }

    if (activeExplorerCategory === "source_documents") {
      const firstDetail = sortedDetails[0]

      setSelectedItem(
        firstDetail === undefined
          ? null
          : { detail: firstDetail, kind: "source" }
      )
      return
    }

    const firstRule = sourceWatchRules[0]

    if (firstRule !== undefined) {
      setSelectedItem({ kind: "source_watch", rule: firstRule })
      return
    }
    setSelectedItem(null)
  }, [
    activeExplorerCategory,
    selectedItemExists,
    sortedDetails,
    sourceDocumentsQuery.isLoading,
    sourceWatchQuery.isLoading,
    sourceWatchRules,
  ])

  function updateExplorerCategory(value: string) {
    if (!isSourceExplorerCategory(value)) {
      return
    }

    const next = new URLSearchParams(searchParams)
    next.set("explorer", value)
    setSearchParams(next, { replace: true })
  }

  function updateExplorerPage(category: SourceExplorerCategory, page: number) {
    const next = new URLSearchParams(searchParams)
    next.set(
      category === "source_documents" ? "source_page" : "source_watch_page",
      String(page)
    )
    setSearchParams(next, { replace: true })
  }

  return (
    <div className="flex flex-col gap-5" data-route-id="knowledge-base-sources">
      <h1 className="sr-only">{t("nav.sources")}</h1>

      {sourceDocumentsQuery.isLoading ? (
        <LoadingState label={t("state.loading")} />
      ) : null}
      {sourceDocumentsQuery.isError ? (
        <ErrorAlert title={t("state.loadFailed")} />
      ) : null}
      {sourceDocumentsQuery.isSuccess &&
      details.length === 0 &&
      sourceWatchRules.length === 0 ? (
        <EmptyState
          action={
            <Button onClick={openUploadDialog} type="button">
              {t("action.uploadSources")}
            </Button>
          }
          title={t("empty.noSources")}
        />
      ) : null}
      {details.length > 0 || sourceWatchRules.length > 0 ? (
        <IdeWorkspace
          detail={
            <SourceInspector
              disablingRuleId={disableSourceWatchMutation.variables?.id ?? null}
              formatDate={(value) => formatDate(value, i18n.language)}
              isReingesting={reingestMutation.isPending}
              isScanning={scanSourceWatchMutation.isPending}
              onDisableRule={(rule) => disableSourceWatchMutation.mutate(rule)}
              onOpenImportPreview={(rule) =>
                openSourceWatchPreviewMutation.mutate(rule)
              }
              onPreviewDelete={handlePreviewDelete}
              onReingest={(detail) => reingestMutation.mutate(detail)}
              onRetryMediaCaption={(asset) =>
                retryMediaCaptionMutation.mutate(asset)
              }
              onRetrySourceOcr={(detail) =>
                retrySourceOcrMutation.mutate(detail)
              }
              onScanRule={(rule) => scanSourceWatchMutation.mutate(rule)}
              reingestingDocumentId={
                reingestMutation.variables?.document.id ?? null
              }
              retryingOcrDocumentId={
                retrySourceOcrMutation.variables?.document.id ?? null
              }
              retryingMediaAssetId={
                retryMediaCaptionMutation.variables?.id ?? null
              }
              scanningRuleId={scanSourceWatchMutation.variables?.id ?? null}
              selection={selectedLiveItem}
              sourceWatchScans={sourceWatchScansQuery.data?.data ?? []}
            />
          }
          explorer={
            <IdeExplorer
              actions={
                <>
                  <Button
                    aria-label={t("action.uploadSources")}
                    onClick={openUploadDialog}
                    size="icon"
                    title={t("action.uploadSources")}
                    type="button"
                  >
                    <FileUp aria-hidden="true" data-icon="inline-start" />
                  </Button>
                  <Button
                    aria-label={t("source.retryFailed")}
                    disabled={
                      failedJobIds.length === 0 || retryFailedMutation.isPending
                    }
                    onClick={() => retryFailedMutation.mutate()}
                    size="icon"
                    title={t("source.retryFailed")}
                    type="button"
                    variant="outline"
                  >
                    <RefreshCw aria-hidden="true" data-icon="inline-start" />
                  </Button>
                  <Button
                    aria-label={t("sourceWatch.createRule")}
                    onClick={() => setSourceWatchCreateOpen(true)}
                    size="icon"
                    title={t("sourceWatch.createRule")}
                    type="button"
                    variant="outline"
                  >
                    <Plus aria-hidden="true" data-icon="inline-start" />
                  </Button>
                </>
              }
            >
              <IdeExplorerCategoryTabs
                ariaLabel={t("ide.resourceCategories")}
                categories={[
                  {
                    content: (
                      <>
                        <div className="flex flex-col gap-1">
                          {sortedDetails.map((detail) => {
                            const progressValue =
                              getSourceExplorerProgressValue(detail)

                            return (
                              <IdeExplorerItem
                                active={
                                  selectedLiveItem?.kind === "source" &&
                                  selectedLiveItem.detail.document.id ===
                                    detail.document.id
                                }
                                key={detail.document.id}
                                meta={detail.document.id}
                                onSelect={() =>
                                  setSelectedItem({ detail, kind: "source" })
                                }
                                status={t(
                                  getSourceExplorerStatusLabelKey(detail)
                                )}
                                subtitle={getSourceExplorerSubtitle(
                                  detail,
                                  (value) => formatDate(value, i18n.language)
                                )}
                                title={detail.document.display_name}
                              >
                                {progressValue === null ? null : (
                                  <Progress value={progressValue} />
                                )}
                              </IdeExplorerItem>
                            )
                          })}
                        </div>
                        <IdeExplorerPagination
                          onPageChange={(page) =>
                            updateExplorerPage("source_documents", page)
                          }
                          page={normalizeIdeExplorerPage(
                            sourceDocumentsPagination.page,
                            sourceDocumentsPagination.total,
                            sourceDocumentsPagination.page_size
                          )}
                          pageSize={sourceDocumentsPagination.page_size}
                          total={sourceDocumentsPagination.total}
                        />
                      </>
                    ),
                    count: sourceDocumentsPagination.total,
                    id: "source_documents",
                    label: t("ide.sourceDocuments"),
                  },
                  {
                    content:
                      sourceWatchRules.length === 0 ? (
                        <div className="px-2 py-1 text-sm text-muted-foreground">
                          {t("sourceWatch.noRules")}
                        </div>
                      ) : (
                        <>
                          <div className="flex flex-col gap-1">
                            {sourceWatchRules.map((rule) => (
                              <IdeExplorerItem
                                active={
                                  selectedLiveItem?.kind === "source_watch" &&
                                  selectedLiveItem.rule.id === rule.id
                                }
                                key={rule.id}
                                meta={rule.id}
                                onSelect={() =>
                                  setSelectedItem({
                                    kind: "source_watch",
                                    rule,
                                  })
                                }
                                status={t(`state.${rule.status}`)}
                                subtitle={rule.location}
                                title={rule.name}
                              />
                            ))}
                          </div>
                          <IdeExplorerPagination
                            onPageChange={(page) =>
                              updateExplorerPage("source_watch_rules", page)
                            }
                            page={normalizeIdeExplorerPage(
                              sourceWatchRulesPagination.page,
                              sourceWatchRulesPagination.total,
                              sourceWatchRulesPagination.page_size
                            )}
                            pageSize={sourceWatchRulesPagination.page_size}
                            total={sourceWatchRulesPagination.total}
                          />
                        </>
                      ),
                    count: sourceWatchRulesPagination.total,
                    id: "source_watch_rules",
                    label: t("ide.sourceWatchRules"),
                  },
                ]}
                onValueChange={updateExplorerCategory}
                value={activeExplorerCategory}
              />
            </IdeExplorer>
          }
        />
      ) : null}

      <UploadSourcesDialog
        directUploadSettings={directUploadSettings}
        errorMessage={uploadErrorMessage}
        isUploading={uploadMutation.isPending}
        onFileChange={handleUploadFileChange}
        onUploadModeChange={setUploadMode}
        onOpenChange={handleUploadDialogOpenChange}
        onSubmit={handleUploadSubmit}
        open={uploadOpen}
        pressureWarnings={uploadPressureWarnings}
        rows={uploadRows}
        uploadMode={uploadMode}
      />

      <CreateSourceWatchRuleDialog
        isSubmitting={createSourceWatchMutation.isPending}
        onOpenChange={setSourceWatchCreateOpen}
        onSubmit={(input) => createSourceWatchMutation.mutate(input)}
        open={sourceWatchCreateOpen}
      />

      <DeleteImpactDialog
        detail={deletePreviewDetail}
        error={deletePreviewMutation.error}
        isDeleting={deleteSourceMutation.isPending}
        isLoading={deletePreviewMutation.isPending}
        onConfirmDelete={(detail) => deleteSourceMutation.mutate(detail)}
        onOpenChange={handleDeleteDialogOpenChange}
        preview={deletePreview}
      />
      <SourceWatchImportPreviewDialog
        job={sourceWatchPreview}
        onOpenChange={(open) =>
          setSourceWatchPreview(open ? sourceWatchPreview : null)
        }
      />
    </div>
  )
}

function SourceInspector({
  disablingRuleId,
  formatDate,
  isReingesting,
  isScanning,
  onDisableRule,
  onOpenImportPreview,
  onPreviewDelete,
  onReingest,
  onRetryMediaCaption,
  onRetrySourceOcr,
  onScanRule,
  reingestingDocumentId,
  retryingOcrDocumentId,
  retryingMediaAssetId,
  scanningRuleId,
  selection,
  sourceWatchScans,
}: {
  disablingRuleId: string | null
  formatDate: (value: string) => string
  isReingesting: boolean
  isScanning: boolean
  onDisableRule: (rule: SourceWatchRule) => void
  onOpenImportPreview: (rule: SourceWatchRule) => void
  onPreviewDelete: (detail: SourceDocumentDetail) => void
  onReingest: (detail: SourceDocumentDetail) => void
  onRetryMediaCaption: (asset: MediaAsset) => void
  onRetrySourceOcr: (detail: SourceDocumentDetail) => void
  onScanRule: (rule: SourceWatchRule) => void
  reingestingDocumentId: string | null
  retryingOcrDocumentId: string | null
  retryingMediaAssetId: string | null
  scanningRuleId: string | null
  selection: SourceSelection | null
  sourceWatchScans: readonly ScheduledImportJob[]
}) {
  const { t } = useTranslation()

  if (selection === null) {
    return (
      <IdeDetailPanel title={t("ide.detail")}>
        <EmptyState title={t("ide.noSelection")} />
      </IdeDetailPanel>
    )
  }

  if (selection.kind === "source_watch") {
    const rule = selection.rule

    return (
      <IdeDetailPanel
        actions={
          <>
            <Button
              disabled={
                rule.status === "disabled" ||
                (isScanning && scanningRuleId === rule.id)
              }
              onClick={() => onScanRule(rule)}
              size="sm"
              type="button"
              variant="outline"
            >
              <RefreshCw aria-hidden="true" data-icon="inline-start" />
              {t("sourceWatch.runScan")}
            </Button>
            <Button
              disabled={rule.latest_scan === null}
              onClick={() => onOpenImportPreview(rule)}
              size="sm"
              type="button"
              variant="outline"
            >
              {t("sourceWatch.openImportPreview")}
            </Button>
            <Button
              disabled={
                rule.status === "disabled" || disablingRuleId === rule.id
              }
              onClick={() => onDisableRule(rule)}
              size="sm"
              type="button"
              variant="outline"
            >
              {t("sourceWatch.disableRule")}
            </Button>
          </>
        }
        subtitle={<ResourceIdDisplay resourceId={rule.id} />}
        title={rule.name}
      >
        <InspectorTabs
          ariaLabel={t("ide.tabs")}
          tabs={[
            {
              content: (
                <div className="flex flex-col gap-4">
                  <InspectorGrid>
                    <InspectorField label={t("sourceWatch.field.sourceKind")}>
                      {t(`sourceWatch.kind.${rule.source_kind}`)}
                    </InspectorField>
                    <InspectorField label={t("sourceWatch.field.location")}>
                      {rule.location}
                    </InspectorField>
                    <InspectorField
                      label={t("sourceWatch.field.credentialProfile")}
                    >
                      {rule.credential_profile ?? t("source.notAvailable")}
                    </InspectorField>
                    <InspectorField label={t("sourceWatch.column.status")}>
                      {t(`state.${rule.status}`)}
                    </InspectorField>
                    <InspectorField label={t("sourceWatch.column.autoIngest")}>
                      {rule.auto_ingest
                        ? t("state.enabled")
                        : t("state.disabled")}
                    </InspectorField>
                    <InspectorField label={t("sourceWatch.column.latestScan")}>
                      {rule.latest_scan === null ? (
                        t("source.notAvailable")
                      ) : (
                        <ResourceIdDisplay
                          resourceId={rule.latest_scan.scheduled_import_job_id}
                        />
                      )}
                    </InspectorField>
                    <InspectorField label={t("sourceWatch.column.execution")}>
                      {rule.execution.enabled
                        ? t("state.enabled")
                        : t("sourceWatch.notConfigured")}
                    </InspectorField>
                  </InspectorGrid>
                  {Object.keys(rule.adapter_options).length > 0 ? (
                    <InspectorSection
                      title={t("sourceWatch.field.adapterOptions")}
                    >
                      <InspectorJson value={rule.adapter_options} />
                    </InspectorSection>
                  ) : null}
                  <InspectorSection title={t("sourceWatch.field.filters")}>
                    <div className="text-sm text-muted-foreground">
                      {formatSourceWatchFilters(rule, t)}
                    </div>
                  </InspectorSection>
                  <InspectorSection title={t("sourceWatch.schedule.title")}>
                    <InspectorGrid>
                      <InspectorField label={t("sourceWatch.schedule.enabled")}>
                        {rule.schedule.enabled
                          ? t("state.enabled")
                          : t("state.disabled")}
                      </InspectorField>
                      <InspectorField label={t("sourceWatch.schedule.status")}>
                        {t(
                          `sourceWatch.schedule.statusValue.${rule.schedule.scheduler_status}`
                        )}
                      </InspectorField>
                      <InspectorField
                        label={t("sourceWatch.schedule.interval")}
                      >
                        {rule.schedule.interval_seconds === null
                          ? t("source.notAvailable")
                          : t("sourceWatch.schedule.intervalValue", {
                              seconds: rule.schedule.interval_seconds,
                            })}
                      </InspectorField>
                      <InspectorField label={t("sourceWatch.schedule.nextRun")}>
                        {rule.schedule.next_run_at === null
                          ? t("source.notAvailable")
                          : formatDate(rule.schedule.next_run_at)}
                      </InspectorField>
                      <InspectorField label={t("sourceWatch.schedule.lastRun")}>
                        {rule.schedule.last_run_at === null
                          ? t("source.notAvailable")
                          : formatDate(rule.schedule.last_run_at)}
                      </InspectorField>
                      <InspectorField
                        label={t("sourceWatch.schedule.lastStatus")}
                      >
                        {rule.schedule.last_status === null
                          ? t("source.notAvailable")
                          : t(`status.${rule.schedule.last_status}`)}
                      </InspectorField>
                    </InspectorGrid>
                  </InspectorSection>
                  <InspectorSection title={t("sourceWatch.scanHistory")}>
                    {sourceWatchScans.length === 0 ? (
                      <div className="text-sm text-muted-foreground">
                        {t("sourceWatch.noScanHistory")}
                      </div>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>
                              {t("sourceWatch.history.trigger")}
                            </TableHead>
                            <TableHead>
                              {t("sourceWatch.column.status")}
                            </TableHead>
                            <TableHead>
                              {t("sourceWatch.history.startedAt")}
                            </TableHead>
                            <TableHead>
                              {t("sourceWatch.history.duration")}
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {sourceWatchScans.map((scan) => (
                            <TableRow key={scan.id}>
                              <TableCell>
                                {t(
                                  `sourceWatch.history.triggerValue.${scan.trigger_type}`
                                )}
                              </TableCell>
                              <TableCell>
                                {t(`status.${scan.status}`)}
                              </TableCell>
                              <TableCell>
                                {formatDate(scan.started_at)}
                              </TableCell>
                              <TableCell>
                                {scan.duration_ms === null
                                  ? t("source.notAvailable")
                                  : t("sourceWatch.history.durationMs", {
                                      ms: scan.duration_ms,
                                    })}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </InspectorSection>
                </div>
              ),
              id: "summary",
              label: t("ide.summary"),
            },
            {
              content: <InspectorJson value={rule} />,
              id: "data",
              label: t("ide.rawData"),
            },
          ]}
        />
      </IdeDetailPanel>
    )
  }

  const detail = selection.detail
  const document = detail.document
  const latestJob = detail.latest_job

  return (
    <IdeWorkbenchDetailPanel
      actions={
        <>
          <Button
            disabled={isReingesting || reingestingDocumentId === document.id}
            onClick={() => onReingest(detail)}
            size="sm"
            type="button"
            variant="outline"
          >
            <RefreshCw aria-hidden="true" data-icon="inline-start" />
            {t("source.reingest")}
          </Button>
          <Button
            onClick={() => onPreviewDelete(detail)}
            size="sm"
            type="button"
            variant="outline"
          >
            {t("action.previewDeleteImpact")}
          </Button>
        </>
      }
      bottomPanelAriaLabel={t("ide.detailsPanel")}
      bottomPanelCloseLabel={t("ide.closeDetails")}
      bottomPanelDefaultOpen={true}
      bottomPanelFloatingCloseLabel={t("action.close")}
      bottomPanelOpenLabel={t("ide.openDetails")}
      bottomPanelResizeLabel={t("ide.resizeDetails")}
      bottomPanelStateKey={document.id}
      bottomTabs={[
        {
          content: (
            <div className="flex flex-col gap-4">
              <InspectorGrid>
                <InspectorField label={t("source.column.type")}>
                  {t(`sourceType.${document.source_type}`)}
                </InspectorField>
                <InspectorField label={t("source.column.status")}>
                  {t(`status.${document.status}`)}
                </InspectorField>
                <InspectorField label={t("source.column.stage")}>
                  {latestJob === null
                    ? t("source.noJob")
                    : t(`jobStage.${latestJob.stage}`)}
                </InspectorField>
                <InspectorField label={t("source.column.updated")}>
                  <time dateTime={document.updated_at}>
                    {formatDate(document.updated_at)}
                  </time>
                </InspectorField>
                <InspectorField label={t("source.column.lastJob")}>
                  {latestJob === null ? (
                    t("source.noJob")
                  ) : (
                    <ResourceIdDisplay resourceId={latestJob.id} />
                  )}
                </InspectorField>
                <InspectorField label={t("source.column.changeSet")}>
                  {latestJob?.change_set_id === null ||
                  latestJob?.change_set_id === undefined ? (
                    t("source.notAvailable")
                  ) : (
                    <ResourceIdDisplay resourceId={latestJob.change_set_id} />
                  )}
                </InspectorField>
              </InspectorGrid>
              <Progress
                label={getProgressLabel(t, document.status, latestJob)}
                value={
                  latestJob?.progress ?? getStatusProgress(document.status)
                }
              />
            </div>
          ),
          id: "overview",
          label: t("source.tab.overview"),
        },
        {
          content: (
            <div className="flex flex-col gap-4">
              {detail.parsed_content === null ? (
                <div className="text-sm text-muted-foreground">
                  {t("source.notAvailable")}
                </div>
              ) : (
                <InspectorGrid>
                  <InspectorField label={t("source.column.parseResult")}>
                    <ResourceIdDisplay resourceId={detail.parsed_content.id} />
                  </InspectorField>
                  <InspectorField label={t("job.section.parser")}>
                    {detail.parsed_content.parser_name}
                  </InspectorField>
                  <InspectorField label={t("systemSettings.version")}>
                    {detail.parsed_content.parser_version}
                  </InspectorField>
                </InspectorGrid>
              )}
              <OcrBlocksView
                document={document}
                isRetrying={retryingOcrDocumentId === document.id}
                onRetry={() => onRetrySourceOcr(detail)}
                parsedContent={detail.parsed_content}
              />
              <InspectorJson value={detail.parsed_content} />
            </div>
          ),
          id: "parsed",
          label: t("source.tab.parsedContent"),
        },
        {
          content: (
            <div className="flex flex-col gap-5">
              <DetailList
                items={detail.wiki_pages.map((page) => JSON.stringify(page))}
                title={t("source.column.wikiPages")}
              />
              <DetailList
                items={detail.page_versions.map((version) =>
                  JSON.stringify(version)
                )}
                title={t("page.versionHistory")}
              />
              <MediaAssetsPanel
                formatDate={formatDate}
                mediaAssets={detail.media_assets}
                onRetryMediaCaption={onRetryMediaCaption}
                retryingMediaAssetId={retryingMediaAssetId}
              />
            </div>
          ),
          id: "artifacts",
          label: t("job.section.artifacts"),
        },
        {
          content: <InspectorJson value={detail} />,
          id: "data",
          label: t("ide.rawData"),
        },
      ]}
      primary={
        <SourcePrimaryViewer
          detail={detail}
          document={document}
          formatDate={formatDate}
          isRetryingOcr={retryingOcrDocumentId === document.id}
          latestJob={latestJob}
          onRetryMediaCaption={onRetryMediaCaption}
          onRetrySourceOcr={() => onRetrySourceOcr(detail)}
          retryingMediaAssetId={retryingMediaAssetId}
        />
      }
      subtitle={<ResourceIdDisplay resourceId={document.id} />}
      title={document.display_name}
    />
  )
}

function SourcePrimaryViewer({
  detail,
  document,
  formatDate,
  isRetryingOcr,
  latestJob,
  onRetryMediaCaption,
  onRetrySourceOcr,
  retryingMediaAssetId,
}: {
  detail: SourceDocumentDetail
  document: SourceDocument
  formatDate: (value: string) => string
  isRetryingOcr: boolean
  latestJob: Job | null
  onRetryMediaCaption: (asset: MediaAsset) => void
  onRetrySourceOcr: () => void
  retryingMediaAssetId: string | null
}) {
  const { t } = useTranslation()
  const parsedContent = detail.parsed_content

  if (parsedContent?.markdown_preview !== null && parsedContent !== null) {
    return (
      <div className="flex flex-col gap-4">
        {parsedContent.markdown_preview_truncated ? (
          <Alert>
            <AlertTitle>{t("source.parsedPreviewTruncated")}</AlertTitle>
          </Alert>
        ) : null}
        <MarkdownPrimaryViewer markdown={parsedContent.markdown_preview} />
      </div>
    )
  }

  if (parsedContent?.markdown_preview_error !== undefined) {
    return (
      <div className="flex flex-col gap-4">
        <Alert variant="destructive">
          <AlertTitle>{t("source.parsedPreviewError")}</AlertTitle>
          <AlertDescription>
            {parsedContent.markdown_preview_error}
          </AlertDescription>
        </Alert>
        <OcrBlocksView
          document={document}
          isRetrying={isRetryingOcr}
          onRetry={onRetrySourceOcr}
          parsedContent={parsedContent}
        />
      </div>
    )
  }

  if (readOcrBlocks(parsedContent).length > 0) {
    return (
      <OcrBlocksView
        document={document}
        isRetrying={isRetryingOcr}
        onRetry={onRetrySourceOcr}
        parsedContent={parsedContent}
      />
    )
  }

  if (detail.media_assets.length > 0) {
    return (
      <MediaAssetsPanel
        formatDate={formatDate}
        mediaAssets={detail.media_assets}
        onRetryMediaCaption={onRetryMediaCaption}
        retryingMediaAssetId={retryingMediaAssetId}
      />
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <EmptyState title={t("source.parsedPreviewUnavailable")} />
      {latestJob === null ? null : (
        <Progress
          label={getProgressLabel(t, document.status, latestJob)}
          value={latestJob.progress}
        />
      )}
    </div>
  )
}

function DetailList({ items, title }: { items: string[]; title: string }) {
  const { t } = useTranslation()

  return (
    <InspectorSection title={title}>
      {items.length === 0 ? (
        <div className="text-sm text-muted-foreground">
          {t("source.notAvailable")}
        </div>
      ) : (
        <ul className="flex flex-col gap-1 text-sm">
          {items.map((item) => (
            <li className="rounded-md border px-2 py-1" key={item}>
              {item}
            </li>
          ))}
        </ul>
      )}
    </InspectorSection>
  )
}

function OcrBlocksView({
  document,
  isRetrying,
  onRetry,
  parsedContent,
}: {
  document: SourceDocument
  isRetrying: boolean
  onRetry: () => void
  parsedContent: ParsedContent | null
}) {
  const { t } = useTranslation()
  const [retryOpen, setRetryOpen] = useState(false)
  const blocks = readOcrBlocks(parsedContent)
  const ocrStatus = parsedContent?.ocr_status ?? document.ocr_status ?? null
  const canRetryOcr = document.mime_type === "application/pdf"

  function handleRetryConfirm() {
    onRetry()
    setRetryOpen(false)
  }

  return (
    <InspectorSection title={t("source.ocr.blocks")}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {ocrStatus === null ? null : (
              <Badge variant={getOcrStatusVariant(ocrStatus)}>
                {t(`source.ocr.status.${normalizeOcrStatus(ocrStatus)}`)}
              </Badge>
            )}
            <span className="text-muted-foreground">
              {t("source.ocr.page")}:{" "}
              {parsedContent?.ocr_page_count ?? t("source.notAvailable")}
            </span>
            <span className="text-muted-foreground">
              {t("source.ocr.provider")}:{" "}
              {readString(parsedContent?.ocr_provider_metadata?.provider) ??
                readString(
                  parsedContent?.ocr_provider_metadata?.provider_name
                ) ??
                t("source.notAvailable")}
            </span>
          </div>
          <Button
            disabled={!canRetryOcr || isRetrying}
            onClick={() => setRetryOpen(true)}
            size="sm"
            type="button"
            variant="outline"
          >
            <RefreshCw aria-hidden="true" data-icon="inline-start" />
            {t("source.ocr.retry")}
          </Button>
        </div>
        {blocks.length === 0 ? (
          <EmptyState title={t("source.ocr.empty")} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("source.ocr.page")}</TableHead>
                <TableHead>{t("source.ocr.confidence")}</TableHead>
                <TableHead>{t("source.ocr.provider")}</TableHead>
                <TableHead>{t("source.ocr.text")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {blocks.map((block) => (
                <TableRow key={block.key}>
                  <TableCell>{block.pageNumber}</TableCell>
                  <TableCell>
                    {block.confidence === null
                      ? t("source.notAvailable")
                      : formatRatio(block.confidence)}
                  </TableCell>
                  <TableCell>{block.provider}</TableCell>
                  <TableCell className="max-w-96 whitespace-normal">
                    {block.text}
                    {block.locator === null ? null : (
                      <div className="mt-1 text-xs text-muted-foreground">
                        {block.locator}
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
      <AlertDialog onOpenChange={setRetryOpen} open={retryOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("source.ocr.retryTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("source.ocr.retryDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <ResourceIdDisplay resourceId={document.id} />
          <AlertDialogFooter>
            <AlertDialogCancel>{t("action.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleRetryConfirm}>
              {t("source.ocr.confirmRetry")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </InspectorSection>
  )
}

function MediaAssetsPanel({
  formatDate,
  mediaAssets,
  onRetryMediaCaption,
  retryingMediaAssetId,
}: {
  formatDate: (value: string) => string
  mediaAssets: readonly MediaAsset[]
  onRetryMediaCaption: (asset: MediaAsset) => void
  retryingMediaAssetId: string | null
}) {
  const { t } = useTranslation()
  const apiClient = useApiClient()
  const [retryCandidate, setRetryCandidate] = useState<MediaAsset | null>(null)
  const previewMediaMutation = useMutation({
    mutationFn: (asset: MediaAsset) => apiClient.getMediaAssetPreview(asset.id),
    onError: (error) =>
      showToast({
        message:
          error instanceof Error
            ? error.message
            : t("source.caption.previewFailed"),
      }),
    onSuccess: (result) => {
      const previewUrl = result.media_asset_preview.preview_url

      if (previewUrl === null) {
        showToast({ message: t("source.caption.previewUnavailable") })
        return
      }

      window.open(previewUrl, "_blank", "noopener,noreferrer")
    },
  })

  function handleRetryConfirm() {
    if (retryCandidate === null) {
      return
    }

    onRetryMediaCaption(retryCandidate)
    setRetryCandidate(null)
  }

  return (
    <InspectorSection title={t("source.tab.mediaAssets")}>
      {mediaAssets.length === 0 ? (
        <div className="text-sm text-muted-foreground">
          {t("source.notAvailable")}
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("knowledgeBase.id")}</TableHead>
              <TableHead>{t("source.column.status")}</TableHead>
              <TableHead>{t("source.caption.text")}</TableHead>
              <TableHead>{t("source.caption.cacheHit")}</TableHead>
              <TableHead>{t("source.caption.attempts")}</TableHead>
              <TableHead>{t("source.caption.generatedAt")}</TableHead>
              <TableHead>{t("source.caption.error")}</TableHead>
              <TableHead>{t("source.column.actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {mediaAssets.map((asset) => (
              <TableRow key={asset.id}>
                <TableCell>
                  <ResourceIdDisplay resourceId={asset.id} />
                  <div className="mt-1 max-w-60 truncate text-xs text-muted-foreground">
                    {asset.object_key}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge
                    variant={getCaptionStatusVariant(asset.caption_status)}
                  >
                    {t(`source.caption.status.${asset.caption_status}`)}
                  </Badge>
                </TableCell>
                <TableCell className="max-w-96 whitespace-normal">
                  {asset.caption ?? t("source.notAvailable")}
                  {asset.caption_model === null ? null : (
                    <div className="mt-1 text-xs text-muted-foreground">
                      {asset.caption_provider_name ?? t("source.notAvailable")}{" "}
                      · {asset.caption_model}
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  {asset.caption_cache_hit
                    ? t("state.enabled")
                    : t("state.disabled")}
                </TableCell>
                <TableCell>{asset.caption_attempt_count}</TableCell>
                <TableCell>
                  {asset.caption_generated_at === null
                    ? t("source.notAvailable")
                    : formatDate(asset.caption_generated_at)}
                </TableCell>
                <TableCell className="max-w-72 whitespace-normal">
                  {asset.caption_error === null
                    ? t("source.notAvailable")
                    : String(
                        asset.caption_error.message ??
                          JSON.stringify(asset.caption_error)
                      )}
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      disabled={previewMediaMutation.variables?.id === asset.id}
                      onClick={() => previewMediaMutation.mutate(asset)}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      {t("source.caption.preview")}
                    </Button>
                    <Button
                      disabled={
                        asset.caption_status !== "failed" ||
                        retryingMediaAssetId === asset.id
                      }
                      onClick={() => setRetryCandidate(asset)}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      <RefreshCw aria-hidden="true" data-icon="inline-start" />
                      {t("source.caption.retry")}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <AlertDialog
        onOpenChange={(open) => setRetryCandidate(open ? retryCandidate : null)}
        open={retryCandidate !== null}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("source.caption.retryTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("source.caption.retryDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {retryCandidate === null ? null : (
            <ResourceIdDisplay resourceId={retryCandidate.id} />
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>{t("action.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleRetryConfirm}>
              {t("source.caption.confirmRetry")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </InspectorSection>
  )
}

interface CreateSourceWatchRuleDialogProps {
  isSubmitting: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (input: CreateSourceWatchRuleInput) => void
  open: boolean
}

function CreateSourceWatchRuleDialog({
  isSubmitting,
  onOpenChange,
  onSubmit,
  open,
}: CreateSourceWatchRuleDialogProps) {
  const { t } = useTranslation()
  const [selectedSourceKind, setSelectedSourceKind] =
    useState<SourceWatchSourceKind>("mounted_directory")

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    const name = String(formData.get("name") ?? "").trim()
    const sourceKind = String(
      formData.get("sourceKind") ?? "mounted_directory"
    ).trim()
    const location = String(formData.get("location") ?? "").trim()
    const credentialProfile = String(
      formData.get("credentialProfile") ?? ""
    ).trim()
    const gitRef = String(formData.get("gitRef") ?? "").trim()
    const maxFileSizeMb = String(formData.get("maxFileSizeMb") ?? "").trim()
    const parsedMaxFileSizeMb = Number(maxFileSizeMb)
    const scheduleIntervalSeconds = String(
      formData.get("scheduleIntervalSeconds") ?? ""
    ).trim()
    const parsedScheduleIntervalSeconds = Number(scheduleIntervalSeconds)

    onSubmit({
      ...(gitRef.length === 0 ? {} : { adapter_options: { ref: gitRef } }),
      auto_ingest: formData.get("autoIngest") === "on",
      ...(credentialProfile.length === 0
        ? {}
        : { credential_profile: credentialProfile }),
      exclude_dirs: readCommaSeparatedList(
        String(formData.get("excludeDirs") ?? "")
      ),
      exclude_globs: readCommaSeparatedList(
        String(formData.get("excludeGlobs") ?? "")
      ),
      include_extensions: readCommaSeparatedList(
        String(formData.get("includeExtensions") ?? "")
      ),
      location,
      ...(maxFileSizeMb.length === 0
        ? {}
        : { max_file_size_mb: parsedMaxFileSizeMb }),
      name,
      schedule: {
        enabled: formData.get("scheduleEnabled") === "on",
        ...(scheduleIntervalSeconds.length === 0
          ? {}
          : { interval_seconds: parsedScheduleIntervalSeconds }),
      },
      source_kind: sourceKind as SourceWatchSourceKind,
    })
  }

  return (
    <Dialog
      onOpenChange={onOpenChange}
      open={open}
      title={t("sourceWatch.createRule")}
    >
      <form
        className="flex flex-col gap-4"
        id="source-watch-rule-form"
        onSubmit={handleSubmit}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="source-watch-name">
              {t("sourceWatch.field.name")}
            </FieldLabel>
            <Input id="source-watch-name" name="name" required />
          </Field>
          <Field>
            <FieldLabel>{t("sourceWatch.field.sourceKind")}</FieldLabel>
            <FieldDescription>
              {t("sourceWatch.description.supportedKinds")}
            </FieldDescription>
            <Select
              name="sourceKind"
              onValueChange={(value) =>
                setSelectedSourceKind(value as SourceWatchSourceKind)
              }
              required
              value={selectedSourceKind}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="mounted_directory">
                  {t("sourceWatch.kind.mounted_directory")}
                </SelectItem>
                <SelectItem value="s3_prefix">
                  {t("sourceWatch.kind.s3_prefix")}
                </SelectItem>
                <SelectItem value="url_list">
                  {t("sourceWatch.kind.url_list")}
                </SelectItem>
                <SelectItem value="git_repo">
                  {t("sourceWatch.kind.git_repo")}
                </SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>
        <Field>
          <FieldLabel htmlFor="source-watch-location">
            {t(`sourceWatch.field.locationByKind.${selectedSourceKind}`)}
          </FieldLabel>
          <FieldDescription>
            {t(`sourceWatch.description.locationByKind.${selectedSourceKind}`)}
          </FieldDescription>
          <Input
            id="source-watch-location"
            name="location"
            placeholder={t(
              `sourceWatch.placeholder.locationByKind.${selectedSourceKind}`
            )}
            required
          />
        </Field>
        {selectedSourceKind === "s3_prefix" ||
        selectedSourceKind === "git_repo" ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="source-watch-credential-profile">
                {t("sourceWatch.field.credentialProfile")}
              </FieldLabel>
              <FieldDescription>
                {t("sourceWatch.description.credentialProfile")}
              </FieldDescription>
              <Input
                id="source-watch-credential-profile"
                name="credentialProfile"
              />
            </Field>
            {selectedSourceKind === "git_repo" ? (
              <Field>
                <FieldLabel htmlFor="source-watch-git-ref">
                  {t("sourceWatch.field.gitRef")}
                </FieldLabel>
                <FieldDescription>
                  {t("sourceWatch.description.gitRef")}
                </FieldDescription>
                <Input id="source-watch-git-ref" name="gitRef" />
              </Field>
            ) : null}
          </div>
        ) : null}
        <details className="rounded-md border p-3">
          <summary className="cursor-pointer text-sm font-medium">
            {t("sourceWatch.field.filters")}
          </summary>
          <div className="mt-4 flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="source-watch-include-extensions">
                  {t("sourceWatch.field.includeExtensions")}
                </FieldLabel>
                <Input
                  id="source-watch-include-extensions"
                  name="includeExtensions"
                  placeholder={t("sourceWatch.placeholder.includeExtensions")}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="source-watch-max-file-size">
                  {t("sourceWatch.field.maxFileSizeMb")}
                </FieldLabel>
                <Input
                  id="source-watch-max-file-size"
                  min="1"
                  name="maxFileSizeMb"
                  type="number"
                />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="source-watch-exclude-dirs">
                  {t("sourceWatch.field.excludeDirs")}
                </FieldLabel>
                <Input
                  id="source-watch-exclude-dirs"
                  name="excludeDirs"
                  placeholder={t("sourceWatch.placeholder.excludeDirs")}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="source-watch-exclude-globs">
                  {t("sourceWatch.field.excludeGlobs")}
                </FieldLabel>
                <Input
                  id="source-watch-exclude-globs"
                  name="excludeGlobs"
                  placeholder={t("sourceWatch.placeholder.excludeGlobs")}
                />
              </Field>
            </div>
          </div>
        </details>
        <Field className="items-center gap-2" orientation="horizontal">
          <Checkbox
            defaultChecked
            id="source-watch-auto-ingest"
            name="autoIngest"
          />
          <FieldLabel htmlFor="source-watch-auto-ingest">
            {t("sourceWatch.field.autoIngest")}
          </FieldLabel>
        </Field>
        <details className="rounded-md border p-3">
          <summary className="cursor-pointer text-sm font-medium">
            {t("sourceWatch.schedule.title")}
          </summary>
          <div className="mt-4 flex flex-col gap-4">
            <Field className="items-center gap-2" orientation="horizontal">
              <Checkbox
                id="source-watch-schedule-enabled"
                name="scheduleEnabled"
              />
              <FieldLabel htmlFor="source-watch-schedule-enabled">
                {t("sourceWatch.schedule.enabled")}
              </FieldLabel>
            </Field>
            <Field>
              <FieldLabel htmlFor="source-watch-schedule-interval">
                {t("sourceWatch.schedule.interval")}
              </FieldLabel>
              <FieldDescription>
                {t("sourceWatch.schedule.intervalDescription")}
              </FieldDescription>
              <Input
                id="source-watch-schedule-interval"
                min="60"
                name="scheduleIntervalSeconds"
                placeholder={t("sourceWatch.schedule.intervalPlaceholder")}
                type="number"
              />
            </Field>
          </div>
        </details>
        <div className="relative z-20 grid gap-2 sm:flex sm:justify-end">
          <Button
            className="relative z-20 w-full sm:w-auto"
            onClick={() => onOpenChange(false)}
            type="button"
            variant="outline"
          >
            {t("action.cancel")}
          </Button>
          <Button
            className="relative z-20 w-full sm:w-auto"
            disabled={isSubmitting}
            type="submit"
          >
            {isSubmitting ? t("status.running") : t("sourceWatch.createRule")}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}

function SourceWatchImportPreviewDialog({
  job,
  onOpenChange,
}: {
  job: ScheduledImportJob | null
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const apiClient = useApiClient()
  const itemQueries = useQueries({
    queries: sourceWatchPreviewKinds.map((itemKind) => ({
      enabled: job !== null,
      queryKey:
        job === null
          ? adminQueryKeys.sourceWatchScanItems("", { itemKind })
          : adminQueryKeys.sourceWatchScanItems(job.id, {
              itemKind,
              page: 1,
              pageSize: sourceWatchScanItemPreviewLimit,
            }),
      queryFn: () => {
        if (job === null) {
          return Promise.resolve({
            data: [],
            pagination: createEmptyPagination(1),
          })
        }

        return apiClient.listScheduledImportJobItems(job.id, {
          itemKind,
          page: 1,
          pageSize: sourceWatchScanItemPreviewLimit,
        })
      },
    })),
  })
  const previewByKind = Object.fromEntries(
    sourceWatchPreviewKinds.map((itemKind, index) => [
      itemKind,
      itemQueries[index]?.data ?? null,
    ])
  ) as Record<
    (typeof sourceWatchPreviewKinds)[number],
    Awaited<ReturnType<typeof apiClient.listScheduledImportJobItems>> | null
  >

  return (
    <Dialog
      footer={
        <Button
          onClick={() => onOpenChange(false)}
          type="button"
          variant="outline"
        >
          {t("action.close")}
        </Button>
      }
      onOpenChange={onOpenChange}
      open={job !== null}
      title={t("sourceWatch.importPreview")}
    >
      {job === null ? null : (
        <div className="flex flex-col gap-4 text-sm">
          <div className="flex flex-wrap gap-2">
            <ResourceIdDisplay resourceId={job.id} />
            <ResourceIdDisplay resourceId={job.source_watch_rule_id} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <PreviewMetric
              label={t("source.previewStatus")}
              value={t(`status.${job.status}`)}
            />
            <PreviewMetric
              label={t("sourceWatch.newSources")}
              value={formatSourceWatchPreviewCount(
                previewByKind.new?.pagination.total,
                job.scan_result.new_sources.length
              )}
            />
            <PreviewMetric
              label={t("sourceWatch.changedSources")}
              value={formatSourceWatchPreviewCount(
                previewByKind.changed?.pagination.total,
                job.scan_result.changed_sources.length
              )}
            />
            <PreviewMetric
              label={t("sourceWatch.deleteCandidates")}
              value={formatSourceWatchPreviewCount(
                previewByKind.delete_candidate?.pagination.total,
                job.scan_result.delete_candidates.length
              )}
            />
            <PreviewMetric
              label={t("sourceWatch.skippedSources")}
              value={formatSourceWatchPreviewCount(
                previewByKind.skipped?.pagination.total,
                job.scan_result.skipped.length
              )}
            />
          </div>
          <SourceWatchPreviewList
            items={formatSourceWatchScanItems(previewByKind.new?.data)}
            title={t("sourceWatch.newSources")}
          />
          <SourceWatchPreviewList
            items={formatSourceWatchScanItems(previewByKind.changed?.data)}
            title={t("sourceWatch.changedSources")}
          />
          <SourceWatchPreviewList
            items={formatSourceWatchScanItems(
              previewByKind.delete_candidate?.data
            )}
            title={t("sourceWatch.deleteCandidates")}
          />
          <SourceWatchPreviewList
            items={formatSourceWatchScanItems(previewByKind.skipped?.data)}
            title={t("sourceWatch.skippedSources")}
          />
        </div>
      )}
    </Dialog>
  )
}

function SourceWatchPreviewList({
  items,
  title,
}: {
  items: string[]
  title: string
}) {
  const { t } = useTranslation()

  return (
    <section className="flex flex-col gap-2">
      <h3 className="font-medium">{title}</h3>
      {items.length === 0 ? (
        <div className="text-sm text-muted-foreground">
          {t("sourceWatch.noImportPreviewItems")}
        </div>
      ) : (
        <ul className="flex flex-col gap-1">
          {items.map((item) => (
            <li className="rounded-md border px-2 py-1" key={item}>
              {item}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

interface UploadSourcesDialogProps {
  directUploadSettings: DirectUploadSettings
  errorMessage: string | null
  isUploading: boolean
  onFileChange: (files: File[]) => void
  onOpenChange: (open: boolean) => void
  onUploadModeChange: (mode: SourceUploadMode) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  open: boolean
  pressureWarnings: string[]
  rows: UploadRow[]
  uploadMode: SourceUploadMode
}

function UploadSourcesDialog({
  directUploadSettings,
  errorMessage,
  isUploading,
  onFileChange,
  onOpenChange,
  onUploadModeChange,
  onSubmit,
  open,
  pressureWarnings,
  rows,
  uploadMode,
}: UploadSourcesDialogProps) {
  const { t } = useTranslation()
  const uploadModeOptions = [
    {
      descriptionKey: "source.uploadMode.auto.description",
      labelKey: "source.uploadMode.auto.label",
      value: "auto",
    },
    {
      descriptionKey: "source.uploadMode.multipart.description",
      labelKey: "source.uploadMode.multipart.label",
      value: "multipart",
    },
    {
      descriptionKey: "source.uploadMode.direct.description",
      labelKey: "source.uploadMode.direct.label",
      value: "direct",
    },
  ] satisfies Array<{
    descriptionKey: string
    labelKey: string
    value: SourceUploadMode
  }>
  const selectedUploadModeOption =
    uploadModeOptions.find((option) => option.value === uploadMode) ??
    ({
      descriptionKey: "source.uploadMode.auto.description",
      labelKey: "source.uploadMode.auto.label",
      value: "auto",
    } satisfies (typeof uploadModeOptions)[number])

  function handleFileInputChange(event: ChangeEvent<HTMLInputElement>) {
    onFileChange(Array.from(event.currentTarget.files ?? []))
  }

  return (
    <Dialog
      footer={
        <>
          <Button
            onClick={() => onOpenChange(false)}
            type="button"
            variant="outline"
          >
            {t("action.cancel")}
          </Button>
          <Button
            disabled={isUploading}
            form="source-upload-form"
            type="submit"
          >
            {t("source.upload")}
          </Button>
        </>
      }
      onOpenChange={onOpenChange}
      open={open}
      title={t("action.uploadSources")}
    >
      <form
        className="flex flex-col gap-4"
        id="source-upload-form"
        onSubmit={onSubmit}
      >
        <Field className="gap-2">
          <FieldLabel
            className="flex min-h-28 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-4 text-center text-sm"
            htmlFor="source-upload-files"
          >
            <span>{t("source.dropzone")}</span>
            <span className="text-muted-foreground">
              {t("source.supportedFormats")}
            </span>
          </FieldLabel>
          <input
            className="sr-only"
            data-testid="source-upload-input"
            id="source-upload-files"
            multiple
            name="files"
            onChange={handleFileInputChange}
            type="file"
          />
        </Field>
        {errorMessage === null ? null : (
          <ErrorAlert
            description={errorMessage}
            title={t("progress.uploadFailed")}
          />
        )}
        {pressureWarnings.length === 0 ? null : (
          <Alert variant="destructive">
            <AlertTitle>{t("source.uploadPressureWarningTitle")}</AlertTitle>
            <AlertDescription>
              <ul className="list-disc space-y-1 pl-4">
                {pressureWarnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}
        <Field>
          <FieldLabel htmlFor="source-upload-mode">
            {t("source.uploadMode.label")}
          </FieldLabel>
          <FieldDescription>
            {t("source.uploadMode.description", {
              threshold: formatFileSize(directUploadSettings.thresholdBytes),
            })}
          </FieldDescription>
          <input
            className="sr-only"
            id="source-upload-mode"
            readOnly
            tabIndex={-1}
            value={uploadMode}
          />
          <Select
            onValueChange={(value) => {
              if (isSourceUploadMode(value)) {
                onUploadModeChange(value)
              }
            }}
            value={uploadMode}
          >
            <SelectTrigger
              aria-label={t("source.uploadMode.label")}
              className="w-full"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {uploadModeOptions.map((mode) => (
                <SelectItem
                  disabled={
                    mode.value === "direct" && !directUploadSettings.ready
                  }
                  key={mode.value}
                  value={mode.value}
                >
                  {t(mode.labelKey)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldDescription>
            {t(selectedUploadModeOption.descriptionKey, {
              threshold: formatFileSize(directUploadSettings.thresholdBytes),
            })}
          </FieldDescription>
          {directUploadSettings.ready ? null : (
            <FieldDescription className="text-destructive">
              {t("source.uploadMode.directUnavailable")}
            </FieldDescription>
          )}
        </Field>
        <Field>
          <FieldLabel htmlFor="source-upload-tags">
            {t("source.tags")}
          </FieldLabel>
          <FieldDescription>{t("source.tagsDescription")}</FieldDescription>
          <Input id="source-upload-tags" name="tags" />
        </Field>
        <details className="rounded-md border p-3">
          <summary className="cursor-pointer text-sm font-medium">
            {t("source.advancedOptions")}
          </summary>
          <div className="mt-4 flex flex-col gap-4">
            <Field>
              <FieldLabel htmlFor="source-upload-path">
                {t("source.archivePath")}
              </FieldLabel>
              <FieldDescription>
                {t("source.archivePathDescription")}
              </FieldDescription>
              <Input
                id="source-upload-path"
                name="sourcePath"
                placeholder={t("source.archivePathPlaceholder")}
              />
            </Field>
          </div>
        </details>
        {rows.length === 0 ? null : (
          <div className="flex flex-col gap-3">
            {rows.map((row) => (
              <div className="rounded-md border p-3" key={row.rowKey}>
                <div className="flex flex-wrap items-start justify-between gap-3 text-sm">
                  <div className="flex flex-col gap-1">
                    <div className="font-medium break-all">{row.fileName}</div>
                    <div className="text-xs text-muted-foreground">
                      {t("source.fileSize")}: {formatFileSize(row.fileSize)}
                    </div>
                  </div>
                </div>
                <Progress
                  label={getUploadRowProgressLabel(row, t)}
                  value={row.progress}
                />
                {row.documentId === undefined &&
                row.jobId === undefined ? null : (
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    {row.documentId === undefined ? null : (
                      <div className="flex flex-col gap-1">
                        <div className="text-xs font-medium text-muted-foreground">
                          {t("source.uploadedDocument")}
                        </div>
                        <ResourceIdDisplay resourceId={row.documentId} />
                      </div>
                    )}
                    {row.jobId === undefined ? null : (
                      <div className="flex flex-col gap-1">
                        <div className="text-xs font-medium text-muted-foreground">
                          {t("source.ingestJob")}
                        </div>
                        <ResourceIdDisplay resourceId={row.jobId} />
                      </div>
                    )}
                  </div>
                )}
                {row.errorMessage === undefined ? null : (
                  <div className="mt-3">
                    <ErrorAlert
                      description={row.errorMessage}
                      title={t("progress.uploadFailed")}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </form>
    </Dialog>
  )
}

interface DeleteImpactDialogProps {
  detail: SourceDocumentDetail | null
  error: Error | null
  isDeleting: boolean
  isLoading: boolean
  onConfirmDelete: (detail: SourceDocumentDetail) => void
  onOpenChange: (open: boolean) => void
  preview: DeleteImpactPreview | null
}

function DeleteImpactDialog({
  detail,
  error,
  isDeleting,
  isLoading,
  onConfirmDelete,
  onOpenChange,
  preview,
}: DeleteImpactDialogProps) {
  const { t } = useTranslation()

  return (
    <Dialog
      footer={
        <>
          <Button
            onClick={() => onOpenChange(false)}
            type="button"
            variant="outline"
          >
            {t("action.cancel")}
          </Button>
          <Button
            disabled={detail === null || isDeleting}
            onClick={() => {
              if (detail !== null) {
                onConfirmDelete(detail)
              }
            }}
            type="button"
            variant="destructive"
          >
            <Trash2 aria-hidden="true" data-icon="inline-start" />
            {t("source.deleteSource")}
          </Button>
        </>
      }
      onOpenChange={onOpenChange}
      open={detail !== null}
      title={t("source.deleteSourceQuestion")}
    >
      {detail === null ? null : (
        <div className="flex flex-col gap-3 text-sm">
          <ResourceIdDisplay resourceId={detail.document.id} />
          <ResourceIdDisplay resourceId={detail.document.knowledge_base_id} />
          <p>{t("source.deleteSourceDescription")}</p>
          {isLoading ? <LoadingState label={t("state.loading")} /> : null}
          {error === null ? null : (
            <ErrorAlert
              description={error.message}
              title={t("state.loadFailed")}
            />
          )}
          {preview === null ? null : (
            <div className="flex flex-col gap-3 rounded-md border p-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <PreviewMetric
                  label={t("source.previewStatus")}
                  value={t(`status.${preview.status}`)}
                />
                <PreviewMetric
                  label={t("source.previewCanApply")}
                  value={
                    preview.can_apply ? t("state.enabled") : t("state.disabled")
                  }
                />
                <PreviewMetric
                  label={t("source.affectedPages")}
                  value={String(preview.affected_page_ids.length)}
                />
                <PreviewMetric
                  label={t("source.affectedEdges")}
                  value={String(preview.affected_edge_ids.length)}
                />
                <PreviewMetric
                  label={t("source.systemPages")}
                  value={
                    preview.system_page_keys.length > 0
                      ? preview.system_page_keys.join(", ")
                      : t("state.disabled")
                  }
                />
                <PreviewMetric
                  label={t("source.affectedResources")}
                  value={String(preview.impact.affected_resources.length)}
                />
                <PreviewMetric
                  label={t("source.retrievalIndexUpdate")}
                  value={`${preview.impact.retrieval_index_update.required ? t("state.enabled") : t("state.disabled")} · ${preview.impact.retrieval_index_update.reason}`}
                />
                <PreviewMetric
                  label={t("source.unsafeReasons")}
                  value={
                    preview.impact.unsafe_reasons.length > 0
                      ? preview.impact.unsafe_reasons.join(", ")
                      : t("state.disabled")
                  }
                />
              </div>
              <div className="flex flex-col gap-1">
                <div className="text-xs font-medium text-muted-foreground">
                  {t("source.changeSet")}
                </div>
                <ResourceIdDisplay resourceId={preview.change_set_id} />
              </div>
              <div className="flex flex-col gap-1">
                <div className="text-xs font-medium text-muted-foreground">
                  {t("source.applyAction")}
                </div>
                <code className="rounded bg-muted px-2 py-1 text-xs break-all">
                  {preview.apply_action.method} {preview.apply_action.path}
                </code>
              </div>
            </div>
          )}
        </div>
      )}
    </Dialog>
  )
}

function PreviewMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="text-sm">{value}</div>
    </div>
  )
}

function readCommaSeparatedList(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
}

function formatSourceWatchFilters(
  rule: SourceWatchRule,
  t: ReturnType<typeof useTranslation>["t"]
) {
  const parts = [
    `${t("sourceWatch.field.includeExtensions")}: ${formatList(rule.include_extensions)}`,
    `${t("sourceWatch.field.excludeDirs")}: ${formatList(rule.exclude_dirs)}`,
    `${t("sourceWatch.field.excludeGlobs")}: ${formatList(rule.exclude_globs)}`,
    `${t("sourceWatch.field.maxFileSizeMb")}: ${
      rule.max_file_size_mb === null
        ? t("source.notAvailable")
        : String(rule.max_file_size_mb)
    }`,
  ]

  return parts.join(" | ")
}

function formatSourceWatchPreviewCount(
  persistedTotal: number | undefined,
  previewCount: number
) {
  return String(persistedTotal ?? previewCount)
}

function formatSourceWatchScanItems(
  items: readonly SourceWatchScanItem[] = []
) {
  return items.map((item) => {
    const payload = item.payload
    const sourcePath =
      typeof payload.source_path === "string"
        ? payload.source_path
        : item.source_path
    const sourceUrl =
      typeof payload.source_url === "string"
        ? payload.source_url
        : item.source_url
    const metadata =
      typeof payload.metadata === "object" &&
      payload.metadata !== null &&
      !Array.isArray(payload.metadata)
        ? payload.metadata
        : undefined

    return formatSourceWatchPreviewItem({
      ...(typeof payload.document_id === "string"
        ? { document_id: payload.document_id }
        : {}),
      ...(metadata === undefined
        ? {}
        : { metadata: metadata as Record<string, unknown> }),
      ...(typeof payload.name === "string" ? { name: payload.name } : {}),
      ...(typeof payload.reason === "string" ? { reason: payload.reason } : {}),
      ...(sourcePath === undefined ? {} : { source_path: sourcePath }),
      ...(sourceUrl === undefined ? {} : { source_url: sourceUrl }),
    })
  })
}

function formatSourceWatchPreviewItem(item: {
  document_id?: string
  metadata?: Record<string, unknown>
  name?: string
  reason?: string
  source_path?: string
  source_url?: string
}) {
  return [
    item.name,
    item.source_path,
    item.source_url,
    item.document_id,
    item.reason,
    item.metadata === undefined ? undefined : JSON.stringify(item.metadata),
  ]
    .filter(
      (value): value is string => typeof value === "string" && value.length > 0
    )
    .join(" | ")
}

function formatList(values: readonly string[]) {
  return values.length === 0 ? "-" : values.join(", ")
}

function getProgressLabel(
  t: ReturnType<typeof useTranslation>["t"],
  status: SourceDocumentStatus,
  latestJob: Job | null
) {
  if (status === "ready") {
    return t("progress.ready")
  }
  if (status === "failed" || latestJob?.status === "failed") {
    return t("progress.failed")
  }
  if (latestJob === null || latestJob.status === "queued") {
    return t("progress.queued")
  }

  return t(getStageProgressKey(latestJob.stage))
}

function getStageProgressKey(stage: JobStage) {
  const keys: Record<JobStage, string> = {
    analyzing: "progress.analyzing",
    captioning: "progress.captioning",
    generating: "progress.generating",
    indexing: "progress.indexing",
    merging: "progress.merging",
    ocr: "progress.ocr",
    parsing: "progress.parsing",
    uploading: "progress.uploading",
  }

  return keys[stage]
}

function getStatusProgress(status: SourceDocumentStatus) {
  const values: Record<SourceDocumentStatus, number> = {
    deleted: 0,
    failed: 100,
    processing: 50,
    queued: 0,
    ready: 100,
    uploaded: 100,
  }

  return values[status]
}

function getUploadRowProgressLabel(
  row: UploadRow,
  t: ReturnType<typeof useTranslation>["t"]
) {
  if (row.status === "selected") {
    return t("source.selectedFile")
  }

  if (row.status === "completed") {
    return t("progress.uploadCompleted")
  }

  if (row.status === "failed") {
    return t("progress.uploadFailed")
  }

  if (row.phase !== undefined) {
    return t(`source.uploadPhase.${row.phase}`)
  }

  return t("progress.uploading")
}

function hasActiveSourceDocuments(view: SourceDocumentsView | undefined) {
  return (
    view?.details.some(
      (detail) =>
        isActiveSourceDocumentStatus(detail.document.status) ||
        (detail.latest_job !== null &&
          isActiveJobStatus(detail.latest_job.status))
    ) ?? false
  )
}

function getCaptionStatusVariant(status: MediaAsset["caption_status"]) {
  if (status === "failed") {
    return "destructive"
  }

  if (status === "generated") {
    return "default"
  }

  return "outline"
}

interface OcrBlockView {
  confidence: number | null
  key: string
  locator: string | null
  pageNumber: string
  provider: string
  text: string
}

function readOcrBlocks(parsedContent: ParsedContent | null): OcrBlockView[] {
  return (parsedContent?.ocr_blocks ?? []).flatMap((block, index) => {
    if (!isRecord(block)) {
      return []
    }

    const text = readString(block.text)

    if (text === null) {
      return []
    }

    const pageNumber =
      readNumber(block.page_number) ?? readNumber(block.pageNumber)
    const blockOrder =
      readNumber(block.block_order) ?? readNumber(block.blockOrder)
    const fallbackLocator =
      pageNumber === null
        ? null
        : blockOrder === null
          ? `page:${pageNumber}`
          : `page:${pageNumber}:block:${blockOrder}`

    return [
      {
        confidence: readNumber(block.confidence),
        key: readString(block.id) ?? `ocr-block-${index}`,
        locator: readString(block.locator) ?? fallbackLocator,
        pageNumber: pageNumber === null ? "-" : String(Math.trunc(pageNumber)),
        provider:
          readString(block.provider) ??
          readString(block.provider_name) ??
          readString(block.engine) ??
          "-",
        text,
      },
    ]
  })
}

function getOcrStatusVariant(status: string) {
  if (normalizeOcrStatus(status) === "failed") {
    return "destructive"
  }

  if (normalizeOcrStatus(status) === "succeeded") {
    return "default"
  }

  return "outline"
}

function normalizeOcrStatus(status: string) {
  if (status === "failed") {
    return "failed"
  }
  if (status === "succeeded" || status === "completed") {
    return "succeeded"
  }

  return "skipped"
}

function readRecord(value: unknown) {
  return isRecord(value) ? value : {}
}

function readString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null
}

function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function getUploadPressureWarnings(
  settings: SystemSettingsStatus | undefined,
  t: (key: string) => string
) {
  const dependencies = readRecord(settings?.dependencies)
  const pressure = readRecord(dependencies.pressure)
  const upload = readRecord(pressure.upload)
  const compile = readRecord(pressure.compile)
  const warnings: string[] = []

  if (isPressureState(upload.pressure)) {
    warnings.push(t("systemSettings.uploadPressureWarning"))
  }
  if (isPressureState(compile.status)) {
    warnings.push(t("systemSettings.compilePressureWarning"))
  }

  return warnings
}

function isPressureState(value: unknown) {
  return value === "degraded" || value === "saturated"
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function formatRatio(value: number) {
  if (value <= 1) {
    return `${Math.round(value * 100)}%`
  }

  return String(value)
}

function formatFileSize(size: number) {
  if (size < 1024) {
    return `${size} B`
  }

  const units = ["KB", "MB", "GB", "TB"]
  let value = size / 1024

  for (const unit of units) {
    if (value < 1024) {
      return `${formatSizeValue(value)} ${unit}`
    }

    value /= 1024
  }

  return `${formatSizeValue(value)} PB`
}

function createUploadRowKey(file: File) {
  return `${file.name}:${file.size}:${file.lastModified}`
}

function createUploadMetadata(tags: string | undefined) {
  if (tags === undefined || tags.trim().length === 0) {
    return {}
  }

  const parsedTags = tags
    .split(",")
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0)

  return parsedTags.length === 0 ? {} : { tags: parsedTags }
}

async function calculateSha256ContentHash(file: File) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer())
  const hex = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")

  return `sha256:${hex}`
}

function uploadPresignedObject(
  presignedUpload: PresignedUpload,
  file: File,
  onProgress: (progress: number) => void,
  failureMessage: string
) {
  return new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest()

    request.open(presignedUpload.method, presignedUpload.url)
    for (const [name, value] of Object.entries(presignedUpload.headers)) {
      request.setRequestHeader(name, value)
    }
    request.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        onProgress((event.loaded / event.total) * 100)
      }
    }
    request.onerror = () => reject(new Error(failureMessage))
    request.ontimeout = () => reject(new Error(failureMessage))
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) {
        onProgress(100)
        resolve()
        return
      }

      reject(new Error(failureMessage))
    }
    request.send(file)
  })
}

function createEmptyPagination(page: number) {
  return {
    has_more: false,
    page,
    page_size: ideExplorerPageSize,
    total: 0,
  }
}

function readSourceExplorerCategory(
  searchParams: URLSearchParams
): SourceExplorerCategory {
  const value = searchParams.get("explorer")

  return isSourceExplorerCategory(value) ? value : "source_documents"
}

function isSourceExplorerCategory(
  value: string | null
): value is SourceExplorerCategory {
  return (
    typeof value === "string" &&
    sourceExplorerCategories.includes(value as SourceExplorerCategory)
  )
}

function isSourceUploadMode(value: string): value is SourceUploadMode {
  return value === "auto" || value === "multipart" || value === "direct"
}

function readSearchPage(searchParams: URLSearchParams, key: string) {
  const value = Number(searchParams.get(key))

  return Number.isSafeInteger(value) && value > 0 ? value : 1
}

function formatSizeValue(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

function formatDate(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value))
}
