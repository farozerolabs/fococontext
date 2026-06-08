import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { GitFork, Plus, RefreshCcw, Search, Trash2 } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { useParams, useSearchParams } from "react-router"

import {
  type CreateForkSubmissionInput,
  type ForkOwnerType,
  type KnowledgeBase,
  type Pagination,
  type RetrieveResponse,
} from "@/api/fococontext-client.js"
import { useApiClient } from "@/api/api-client-context.js"
import { adminQueryKeys } from "@/api/query-keys.js"
import {
  IdeDetailPanel,
  IdeExplorer,
  IdeExplorerItem,
  IdeExplorerPagination,
  IdeWorkspace,
  IdeWorkbenchDetailPanel,
  InspectorField,
  InspectorGrid,
  InspectorJson,
  InspectorSection,
  ideExplorerPageSize,
  normalizeIdeExplorerPage,
} from "@/components/ide/IdeWorkspace.js"
import { ResourceIdDisplay } from "@/components/resource-id/ResourceIdDisplay.js"
import { AppDialog as Dialog } from "@/components/state/AppDialog.js"
import { DangerousAction } from "@/components/state/DangerousAction.js"
import { EmptyState } from "@/components/state/EmptyState.js"
import { ErrorAlert } from "@/components/state/ErrorAlert.js"
import { LoadingState } from "@/components/state/LoadingState.js"
import { Badge } from "@/components/ui/badge.js"
import { Button } from "@/components/ui/button.js"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field.js"
import { Input } from "@/components/ui/input.js"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.js"
import { Textarea } from "@/components/ui/textarea.js"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip.js"
import { showToast } from "@/components/ui/toast.js"

const ownerTypes: ForkOwnerType[] = [
  "user",
  "workspace",
  "customer",
  "session",
  "custom",
]

export function KnowledgeBaseForksPage() {
  const { knowledgeBaseId } = useParams()
  const { i18n, t } = useTranslation()
  const apiClient = useApiClient()
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const forksPage = readSearchPage(searchParams, "fork_page")
  const forksListOptions = { page: forksPage, pageSize: ideExplorerPageSize }
  const [selectedForkId, setSelectedForkId] = useState<string | null>(null)
  const [createForkOpen, setCreateForkOpen] = useState(false)
  const [createSubmissionOpen, setCreateSubmissionOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [retrieveQuery, setRetrieveQuery] = useState("")
  const [retrieveResult, setRetrieveResult] = useState<RetrieveResponse | null>(
    null
  )

  const forksQuery = useQuery({
    enabled: knowledgeBaseId !== undefined,
    queryKey:
      knowledgeBaseId === undefined
        ? adminQueryKeys.forks("")
        : adminQueryKeys.forks(knowledgeBaseId, forksListOptions),
    queryFn: () =>
      knowledgeBaseId === undefined
        ? Promise.resolve({ data: [], pagination: emptyPagination(forksPage) })
        : apiClient.listKnowledgeBaseForks(knowledgeBaseId, forksListOptions),
  })
  const forks = useMemo(
    () => forksQuery.data?.data ?? [],
    [forksQuery.data?.data]
  )
  const forksPagination =
    forksQuery.data?.pagination ?? emptyPagination(forksPage)
  const normalizedForksPage = normalizeIdeExplorerPage(
    forksPagination.page,
    forksPagination.total,
    forksPagination.page_size || ideExplorerPageSize
  )
  const selectedFork =
    forks.find((fork) => fork.id === selectedForkId) ?? forks[0] ?? null

  const selectedForkQuery = useQuery({
    enabled: selectedFork?.id !== undefined,
    queryKey:
      selectedFork?.id === undefined
        ? adminQueryKeys.fork("")
        : adminQueryKeys.fork(selectedFork.id),
    queryFn: () =>
      selectedFork?.id === undefined
        ? Promise.reject(new Error("fork_id_missing"))
        : apiClient.getKnowledgeBaseFork(selectedFork.id),
  })
  const forkDetail = selectedForkQuery.data ?? selectedFork

  useEffect(() => {
    if (
      selectedForkId !== null &&
      forks.some((fork) => fork.id === selectedForkId)
    ) {
      return
    }
    setSelectedForkId(forks[0]?.id ?? null)
  }, [forks, selectedForkId])

  function updateExplorerPage(page: number) {
    const next = new URLSearchParams(searchParams)
    next.set("fork_page", String(page))
    setSearchParams(next, { replace: true })
  }

  const resolveForkMutation = useMutation({
    mutationFn: (input: {
      display_name?: string | null
      external_owner_id: string
      owner_type: ForkOwnerType
    }) => {
      if (knowledgeBaseId === undefined) {
        throw new Error("knowledge_base_id_missing")
      }

      return apiClient.resolveKnowledgeBaseFork(knowledgeBaseId, input)
    },
    onError: (error) => showErrorToast(error, t("forks.createFailed")),
    onSuccess: async (result) => {
      setCreateForkOpen(false)
      setSelectedForkId(result.fork.id)
      showToast({ message: t("forks.createQueued") })
      if (knowledgeBaseId !== undefined) {
        await queryClient.invalidateQueries({
          queryKey: adminQueryKeys.forks(knowledgeBaseId),
        })
      }
    },
  })

  const syncForkMutation = useMutation({
    mutationFn: (forkId: string) => apiClient.syncKnowledgeBaseFork(forkId),
    onError: (error) => showErrorToast(error, t("forks.syncFailed")),
    onSuccess: async (_result, forkId) => {
      showToast({ message: t("forks.syncQueued") })
      await invalidateForkQueries(queryClient, forkId, knowledgeBaseId)
    },
  })

  const deleteForkMutation = useMutation({
    mutationFn: (forkId: string) => apiClient.deleteKnowledgeBaseFork(forkId),
    onError: (error) => showErrorToast(error, t("forks.deleteFailed")),
    onSuccess: async (_result, forkId) => {
      setDeleteOpen(false)
      setSelectedForkId(null)
      showToast({ message: t("forks.deleteQueued") })
      await invalidateForkQueries(queryClient, forkId, knowledgeBaseId)
    },
  })

  const createSubmissionMutation = useMutation({
    mutationFn: (input: CreateForkSubmissionInput) => {
      if (forkDetail === null) {
        throw new Error("fork_id_missing")
      }

      return apiClient.submitForkKnowledge(forkDetail.id, input)
    },
    onError: (error) => showErrorToast(error, t("forks.submissionFailed")),
    onSuccess: async (result) => {
      setCreateSubmissionOpen(false)
      showToast({ message: t("forks.submissionCreated") })
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: adminQueryKeys.jobs(result.fork_id),
        }),
        queryClient.invalidateQueries({
          queryKey: adminQueryKeys.ingestProgress(result.fork_id),
        }),
        queryClient.invalidateQueries({
          queryKey: adminQueryKeys.sourceDocuments(result.fork_id),
        }),
        queryClient.invalidateQueries({
          queryKey: adminQueryKeys.fork(result.fork_id),
        }),
      ])
    },
  })

  const retrieveMutation = useMutation({
    mutationFn: async () => {
      if (forkDetail === null) {
        throw new Error("fork_id_missing")
      }

      return apiClient.retrieveKnowledgeContext(forkDetail.id, {
        include_context_pack: true,
        include_graph: true,
        include_trace: true,
        mode: "hybrid",
        query: retrieveQuery,
        top_k: 5,
      })
    },
    onError: (error) => showErrorToast(error, t("forks.retrieveFailed")),
    onSuccess: (result) => setRetrieveResult(result),
  })

  const formatDate = (value: string) => formatDateTime(value, i18n.language)

  return (
    <section className="flex flex-col" data-route-id="knowledge-base-forks">
      <h1 className="sr-only">{t("nav.forks")}</h1>
      {forksQuery.isLoading ? (
        <LoadingState label={t("state.loading")} />
      ) : null}
      {forksQuery.isError ? <ErrorAlert title={t("state.loadFailed")} /> : null}
      {forksQuery.isSuccess ? (
        <IdeWorkspace
          explorer={
            <IdeExplorer
              actions={
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      aria-label={t("action.createFork")}
                      onClick={() => setCreateForkOpen(true)}
                      size="icon-sm"
                      title={t("action.createFork")}
                      type="button"
                    >
                      <Plus aria-hidden="true" data-icon="inline-start" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t("action.createFork")}</TooltipContent>
                </Tooltip>
              }
            >
              <div className="flex flex-col gap-2">
                {forks.length === 0 ? (
                  <EmptyState title={t("forks.empty")} />
                ) : (
                  forks.map((fork) => (
                    <IdeExplorerItem
                      active={forkDetail?.id === fork.id}
                      key={fork.id}
                      meta={formatDate(fork.updated_at)}
                      onSelect={() => setSelectedForkId(fork.id)}
                      status={t(`forks.syncStatusValue.${fork.sync_status}`)}
                      subtitle={formatForkOwner(fork, t)}
                      title={fork.fork_owner?.display_name ?? fork.name}
                    />
                  ))
                )}
                <IdeExplorerPagination
                  onPageChange={updateExplorerPage}
                  page={normalizedForksPage}
                  total={forksPagination.total}
                  pageSize={forksPagination.page_size || ideExplorerPageSize}
                />
              </div>
            </IdeExplorer>
          }
          detail={
            forkDetail === null ? (
              <IdeDetailPanel
                title={t("forks.forks")}
                subtitle={t("ide.readOnly")}
                actions={
                  <Button onClick={() => setCreateForkOpen(true)} type="button">
                    <Plus aria-hidden="true" data-icon="inline-start" />
                    {t("action.createFork")}
                  </Button>
                }
              >
                <EmptyState title={t("forks.empty")} />
              </IdeDetailPanel>
            ) : (
              <ForkDetailPanel
                createSubmission={() => setCreateSubmissionOpen(true)}
                deleteFork={() => setDeleteOpen(true)}
                formatDate={formatDate}
                fork={forkDetail}
                retrieveQuery={retrieveQuery}
                retrieveResult={retrieveResult}
                retrieveRunning={retrieveMutation.isPending}
                runRetrieve={() => retrieveMutation.mutate()}
                setRetrieveQuery={setRetrieveQuery}
                syncFork={() => syncForkMutation.mutate(forkDetail.id)}
              />
            )
          }
        />
      ) : null}

      <ForkFormDialog
        mutationPending={resolveForkMutation.isPending}
        onOpenChange={setCreateForkOpen}
        onSubmit={(input) => resolveForkMutation.mutate(input)}
        open={createForkOpen}
      />
      <ForkSubmissionDialog
        mutationPending={createSubmissionMutation.isPending}
        onOpenChange={setCreateSubmissionOpen}
        onSubmit={(input) => createSubmissionMutation.mutate(input)}
        open={createSubmissionOpen}
      />
      <DangerousAction
        cancelLabel={t("action.cancel")}
        confirmLabel={t("action.delete")}
        description={t("forks.deleteDescription")}
        onConfirm={() => {
          if (forkDetail !== null) {
            deleteForkMutation.mutate(forkDetail.id)
          }
        }}
        onOpenChange={setDeleteOpen}
        open={deleteOpen}
        title={t("forks.deleteQuestion")}
      />
    </section>
  )
}

function ForkDetailPanel({
  createSubmission,
  deleteFork,
  fork,
  formatDate,
  retrieveQuery,
  retrieveResult,
  retrieveRunning,
  runRetrieve,
  setRetrieveQuery,
  syncFork,
}: {
  createSubmission: () => void
  deleteFork: () => void
  fork: KnowledgeBase
  formatDate: (value: string) => string
  retrieveQuery: string
  retrieveResult: RetrieveResponse | null
  retrieveRunning: boolean
  runRetrieve: () => void
  setRetrieveQuery: (value: string) => void
  syncFork: () => void
}) {
  const { t } = useTranslation()

  return (
    <IdeWorkbenchDetailPanel
      actions={
        <>
          <Button onClick={syncFork} size="sm" type="button" variant="outline">
            <RefreshCcw aria-hidden="true" data-icon="inline-start" />
            {t("action.syncFork")}
          </Button>
          <Button
            onClick={createSubmission}
            size="sm"
            type="button"
            variant="outline"
          >
            <Plus aria-hidden="true" data-icon="inline-start" />
            {t("action.submitForkKnowledge")}
          </Button>
          <Button
            onClick={deleteFork}
            size="sm"
            type="button"
            variant="destructive"
          >
            <Trash2 aria-hidden="true" data-icon="inline-start" />
            {t("action.delete")}
          </Button>
        </>
      }
      bottomPanelAriaLabel={t("ide.detailsPanel")}
      bottomPanelCloseLabel={t("ide.closeDetails")}
      bottomPanelDefaultOpen={true}
      bottomPanelFloatingCloseLabel={t("action.close")}
      bottomPanelOpenLabel={t("ide.openDetails")}
      bottomPanelResizeLabel={t("ide.resizeDetails")}
      bottomPanelStateKey={fork.id}
      bottomTabs={[
        {
          content: (
            <ForkSubmissionPanel
              createSubmission={createSubmission}
              fork={fork}
              formatDate={formatDate}
            />
          ),
          id: "submission",
          label: t("forks.submissions"),
        },
        {
          content: (
            <RetrieveExamplePanel
              retrieveQuery={retrieveQuery}
              retrieveResult={retrieveResult}
              retrieveRunning={retrieveRunning}
              runRetrieve={runRetrieve}
              setRetrieveQuery={setRetrieveQuery}
            />
          ),
          id: "retrieve",
          label: t("forks.retrieveExample"),
        },
        {
          content: <InspectorJson value={fork} />,
          id: "data",
          label: t("ide.rawData"),
        },
      ]}
      primary={
        <div className="flex flex-col gap-4">
          <ForkSummary fork={fork} />
        </div>
      }
      subtitle={<ResourceIdDisplay resourceId={fork.id} />}
      title={fork.fork_owner?.display_name ?? fork.name}
    />
  )
}

function ForkSummary({ fork }: { fork: KnowledgeBase }) {
  const { t } = useTranslation()

  return (
    <InspectorGrid>
      <InspectorField label={t("forks.status")}>
        <Badge variant="secondary">{t(`status.${fork.status}`)}</Badge>
      </InspectorField>
      <InspectorField label={t("forks.syncStatus")}>
        <Badge variant="outline">
          {t(`forks.syncStatusValue.${fork.sync_status}`)}
        </Badge>
      </InspectorField>
      <InspectorField label={t("forks.forkOwner")}>
        {formatForkOwner(fork, t)}
      </InspectorField>
      <InspectorField label={t("forks.upstreamKnowledgeBase")}>
        {fork.upstream_knowledge_base_id === null ? (
          t("source.notAvailable")
        ) : (
          <ResourceIdDisplay resourceId={fork.upstream_knowledge_base_id} />
        )}
      </InspectorField>
      <InspectorField label={t("forks.upstreamBaseVersion")}>
        {formatNullableResourceId(fork.upstream_base_version_id, t)}
      </InspectorField>
      <InspectorField label={t("forks.upstreamSyncedVersion")}>
        {formatNullableResourceId(fork.upstream_synced_version_id, t)}
      </InspectorField>
      <InspectorField label={t("knowledgeBase.currentVersion")}>
        <ResourceIdDisplay resourceId={fork.current_version_id} />
      </InspectorField>
      <InspectorField label={t("knowledgeBase.outputLanguage")}>
        {fork.output_language}
      </InspectorField>
    </InspectorGrid>
  )
}

function ForkSubmissionPanel({
  createSubmission,
  fork,
  formatDate,
}: {
  createSubmission: () => void
  fork: KnowledgeBase
  formatDate: (value: string) => string
}) {
  const { t } = useTranslation()

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-medium">{t("forks.submissions")}</h2>
          <p className="text-sm text-muted-foreground">
            {t("forks.submissionDescription")}
          </p>
        </div>
        <Button onClick={createSubmission} size="sm" type="button">
          <Plus aria-hidden="true" data-icon="inline-start" />
          {t("action.submitForkKnowledge")}
        </Button>
      </div>
      <InspectorGrid>
        <InspectorField label={t("forks.forkOwner")}>
          {formatForkOwner(fork, t)}
        </InspectorField>
        <InspectorField label={t("knowledgeBase.updatedAt")}>
          {formatDate(fork.updated_at)}
        </InspectorField>
        <InspectorField label={t("forks.submissionScope")}>
          {t("forks.submissionScopeValue")}
        </InspectorField>
      </InspectorGrid>
      <InspectorJson
        value={{
          endpoint: `/v1/forks/${fork.id}/submissions`,
          method: "POST",
          output: ["source_document", "ingest_job", "fork_overlay"],
        }}
      />
    </div>
  )
}

function RetrieveExamplePanel({
  retrieveQuery,
  retrieveResult,
  retrieveRunning,
  runRetrieve,
  setRetrieveQuery,
}: {
  retrieveQuery: string
  retrieveResult: RetrieveResponse | null
  retrieveRunning: boolean
  runRetrieve: () => void
  setRetrieveQuery: (value: string) => void
}) {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col gap-4">
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="fork-retrieve-query">
            {t("forks.retrieveQuery")}
          </FieldLabel>
          <Textarea
            id="fork-retrieve-query"
            onChange={(event) => setRetrieveQuery(event.target.value)}
            value={retrieveQuery}
          />
        </Field>
        <Button
          disabled={retrieveRunning || retrieveQuery.trim().length === 0}
          onClick={runRetrieve}
          type="button"
        >
          <Search aria-hidden="true" data-icon="inline-start" />
          {t("forks.retrieveRun")}
        </Button>
      </FieldGroup>
      {retrieveResult === null ? null : (
        <InspectorSection title={t("forks.retrieveResult")}>
          <InspectorJson value={retrieveResult} />
        </InspectorSection>
      )}
    </div>
  )
}

function ForkFormDialog({
  mutationPending,
  onOpenChange,
  onSubmit,
  open,
}: {
  mutationPending: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (input: {
    display_name?: string | null
    external_owner_id: string
    owner_type: ForkOwnerType
  }) => void
  open: boolean
}) {
  const { t } = useTranslation()
  const [ownerType, setOwnerType] = useState<ForkOwnerType>("user")
  const [externalOwnerId, setExternalOwnerId] = useState("")
  const [displayName, setDisplayName] = useState("")

  return (
    <Dialog
      description={t("forks.createDescription")}
      footer={
        <Button
          disabled={mutationPending || externalOwnerId.trim().length === 0}
          onClick={() =>
            onSubmit({
              display_name:
                displayName.trim().length === 0 ? null : displayName.trim(),
              external_owner_id: externalOwnerId.trim(),
              owner_type: ownerType,
            })
          }
          type="button"
        >
          <GitFork aria-hidden="true" data-icon="inline-start" />
          {t("action.createFork")}
        </Button>
      }
      onOpenChange={onOpenChange}
      open={open}
      title={t("action.createFork")}
    >
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="fork-owner-type">
            {t("forks.ownerType")}
          </FieldLabel>
          <Select
            onValueChange={(value) => setOwnerType(value as ForkOwnerType)}
            value={ownerType}
          >
            <SelectTrigger className="w-full" id="fork-owner-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ownerTypes.map((type) => (
                <SelectItem key={type} value={type}>
                  {t(`forks.ownerTypeValue.${type}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel htmlFor="fork-external-owner-id">
            {t("forks.externalOwnerId")}
          </FieldLabel>
          <Input
            id="fork-external-owner-id"
            onChange={(event) => setExternalOwnerId(event.target.value)}
            placeholder={t("forks.externalOwnerIdPlaceholder")}
            value={externalOwnerId}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="fork-display-name">
            {t("forks.displayName")}
          </FieldLabel>
          <Input
            id="fork-display-name"
            onChange={(event) => setDisplayName(event.target.value)}
            placeholder={t("forks.displayNamePlaceholder")}
            value={displayName}
          />
        </Field>
      </FieldGroup>
    </Dialog>
  )
}

function ForkSubmissionDialog({
  mutationPending,
  onOpenChange,
  onSubmit,
  open,
}: {
  mutationPending: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (input: CreateForkSubmissionInput) => void
  open: boolean
}) {
  const { t } = useTranslation()
  const [title, setTitle] = useState("")
  const [content, setContent] = useState("")
  const [sourceUrl, setSourceUrl] = useState("")
  const [evidenceTitle, setEvidenceTitle] = useState("")
  const [evidenceUrl, setEvidenceUrl] = useState("")

  useEffect(() => {
    if (open) {
      setTitle("")
      setContent("")
      setSourceUrl("")
      setEvidenceTitle("")
      setEvidenceUrl("")
    }
  }, [open])

  return (
    <Dialog
      description={t("forks.submissionDialogDescription")}
      footer={
        <Button
          disabled={
            mutationPending ||
            title.trim().length === 0 ||
            content.trim().length === 0
          }
          onClick={() =>
            onSubmit({
              content: content.trim(),
              content_type: "markdown",
              evidence:
                evidenceTitle.trim().length === 0 &&
                evidenceUrl.trim().length === 0
                  ? []
                  : [
                      {
                        source_type: "external",
                        title:
                          evidenceTitle.trim().length === 0
                            ? null
                            : evidenceTitle.trim(),
                        url:
                          evidenceUrl.trim().length === 0
                            ? null
                            : evidenceUrl.trim(),
                      },
                    ],
              source_url:
                sourceUrl.trim().length === 0 ? null : sourceUrl.trim(),
              title: title.trim(),
            })
          }
          type="button"
        >
          <Plus aria-hidden="true" data-icon="inline-start" />
          {t("action.submitForkKnowledge")}
        </Button>
      }
      onOpenChange={onOpenChange}
      open={open}
      title={t("action.submitForkKnowledge")}
    >
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="fork-submission-title">
            {t("forks.submissionTitle")}
          </FieldLabel>
          <Input
            id="fork-submission-title"
            onChange={(event) => setTitle(event.target.value)}
            placeholder={t("forks.submissionTitlePlaceholder")}
            value={title}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="fork-submission-content">
            {t("forks.submissionContent")}
          </FieldLabel>
          <Textarea
            id="fork-submission-content"
            onChange={(event) => setContent(event.target.value)}
            placeholder={t("forks.submissionContentPlaceholder")}
            value={content}
          />
          <FieldDescription>
            {t("forks.submissionContentDescription")}
          </FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="fork-submission-source-url">
            {t("forks.submissionSourceUrl")}
          </FieldLabel>
          <Input
            id="fork-submission-source-url"
            onChange={(event) => setSourceUrl(event.target.value)}
            placeholder={t("forks.submissionSourceUrlPlaceholder")}
            value={sourceUrl}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="fork-submission-evidence-title">
            {t("forks.evidenceTitle")}
          </FieldLabel>
          <Input
            id="fork-submission-evidence-title"
            onChange={(event) => setEvidenceTitle(event.target.value)}
            placeholder={t("forks.evidenceTitlePlaceholder")}
            value={evidenceTitle}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="fork-submission-evidence-url">
            {t("forks.evidenceUrl")}
          </FieldLabel>
          <Input
            id="fork-submission-evidence-url"
            onChange={(event) => setEvidenceUrl(event.target.value)}
            placeholder={t("forks.evidenceUrlPlaceholder")}
            value={evidenceUrl}
          />
        </Field>
      </FieldGroup>
    </Dialog>
  )
}

function formatNullableResourceId(
  value: string | null,
  t: (key: string) => string
) {
  return value === null ? (
    t("source.notAvailable")
  ) : (
    <ResourceIdDisplay resourceId={value} />
  )
}

function formatForkOwner(fork: KnowledgeBase, t: (key: string) => string) {
  if (fork.fork_owner === null) {
    return t("source.notAvailable")
  }

  return `${t(`forks.ownerTypeValue.${fork.fork_owner.owner_type}`)} · ${
    fork.fork_owner.external_owner_id
  }`
}

function formatDateTime(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value))
}

function emptyPagination(page: number): Pagination {
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

async function invalidateForkQueries(
  queryClient: ReturnType<typeof useQueryClient>,
  forkId: string,
  knowledgeBaseId: string | undefined
) {
  await queryClient.invalidateQueries({ queryKey: adminQueryKeys.fork(forkId) })
  if (knowledgeBaseId !== undefined) {
    await queryClient.invalidateQueries({
      queryKey: adminQueryKeys.forks(knowledgeBaseId),
    })
  }
}

function showErrorToast(error: unknown, fallback: string) {
  showToast({
    message: error instanceof Error ? error.message : fallback,
    variant: "error",
  })
}
