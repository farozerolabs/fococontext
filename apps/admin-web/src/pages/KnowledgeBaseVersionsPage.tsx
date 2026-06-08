import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { GitCompareArrows, RefreshCcw } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { useParams, useSearchParams } from "react-router"

import {
  type ChangeSet,
  type KnowledgeVersion,
  type RollbackResult,
  type WikiPageVersion,
} from "@/api/fococontext-client.js"
import { useApiClient } from "@/api/api-client-context.js"
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
  ideExplorerPageSize,
  normalizeIdeExplorerPage,
} from "@/components/ide/IdeWorkspace.js"
import { MarkdownPrimaryViewer } from "@/components/markdown/MarkdownPrimaryViewer.js"
import { ResourceIdDisplay } from "@/components/resource-id/ResourceIdDisplay.js"
import { EmptyState } from "@/components/state/EmptyState.js"
import { ErrorAlert } from "@/components/state/ErrorAlert.js"
import { LoadingState } from "@/components/state/LoadingState.js"
import { Button } from "@/components/ui/button.js"
import { AppDialog as Dialog } from "@/components/state/AppDialog.js"
import { Field, FieldLabel } from "@/components/ui/field.js"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.js"
import { AppSheet as Sheet } from "@/components/state/AppSheet.js"
import { Textarea } from "@/components/ui/textarea.js"

interface VersionsView {
  knowledgeVersions: KnowledgeVersion[]
  knowledgeVersionsPagination: {
    has_more: boolean
    page: number
    page_size: number
    total: number
  }
  pageVersionsPagination: {
    has_more: boolean
    page: number
    page_size: number
    total: number
  }
  pageVersions: PageVersionView[]
}

interface PageVersionView {
  changeSetId: string | null
  createdAt: string
  isCurrent: boolean
  knowledgeVersionId: string | null
  markdown: string
  pageId: string
  pageTitle: string
  pageVersionId: string
  summary: string
  trigger: string
}

type RollbackTarget =
  | {
      kind: "knowledge_base"
      version: KnowledgeVersion
    }
  | {
      kind: "page"
      version: PageVersionView
    }

type VersionSelection =
  | {
      kind: "knowledge_base"
      version: KnowledgeVersion
    }
  | {
      kind: "page"
      version: PageVersionView
    }

type VersionExplorerCategory = "knowledge_versions" | "page_versions"

const versionExplorerCategories: VersionExplorerCategory[] = [
  "knowledge_versions",
  "page_versions",
]

export function KnowledgeBaseVersionsPage() {
  const { knowledgeBaseId } = useParams()
  const { i18n, t } = useTranslation()
  const apiClient = useApiClient()
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const activeExplorerCategory = readVersionExplorerCategory(searchParams)
  const knowledgeVersionsPage = readSearchPage(
    searchParams,
    "knowledge_version_page"
  )
  const pageVersionsPage = readSearchPage(searchParams, "page_version_page")
  const knowledgeVersionsListOptions = {
    page: knowledgeVersionsPage,
    pageSize: ideExplorerPageSize,
  }
  const pageVersionsListOptions = {
    page: pageVersionsPage,
    pageSize: ideExplorerPageSize,
  }
  const [selectedChangeSetId, setSelectedChangeSetId] = useState<string | null>(
    null
  )
  const [selectedVersion, setSelectedVersion] =
    useState<VersionSelection | null>(null)
  const [rollbackTarget, setRollbackTarget] = useState<RollbackTarget | null>(
    null
  )
  const [rollbackResult, setRollbackResult] = useState<RollbackResult | null>(
    null
  )
  const [compareOpen, setCompareOpen] = useState(false)

  const versionsQuery = useQuery({
    enabled: knowledgeBaseId !== undefined,
    queryKey:
      knowledgeBaseId === undefined
        ? adminQueryKeys.versions("")
        : adminQueryKeys.versions(knowledgeBaseId, {
            knowledgeVersionPage: knowledgeVersionsPage,
            pageVersionPage: pageVersionsPage,
          }),
    queryFn: async (): Promise<VersionsView> => {
      if (knowledgeBaseId === undefined) {
        return {
          knowledgeVersions: [],
          knowledgeVersionsPagination: createEmptyPagination(
            knowledgeVersionsPage
          ),
          pageVersions: [],
          pageVersionsPagination: createEmptyPagination(pageVersionsPage),
        }
      }

      const [knowledgeVersions, pageVersions] = await Promise.all([
        apiClient.listKnowledgeVersions(
          knowledgeBaseId,
          knowledgeVersionsListOptions
        ),
        apiClient.listKnowledgeBasePageVersions(
          knowledgeBaseId,
          pageVersionsListOptions
        ),
      ])

      return {
        knowledgeVersions: knowledgeVersions.data,
        knowledgeVersionsPagination: knowledgeVersions.pagination,
        pageVersions: pageVersions.data.map(normalizePageVersion),
        pageVersionsPagination: pageVersions.pagination,
      }
    },
  })

  const rollbackMutation = useMutation({
    mutationFn: async (input: { reason?: string; target: RollbackTarget }) => {
      if (knowledgeBaseId === undefined) {
        throw new Error("Knowledge base route parameter is missing.")
      }

      if (input.target.kind === "knowledge_base") {
        return apiClient.rollbackKnowledgeBase(knowledgeBaseId, {
          target_version_id: input.target.version.version_id,
          ...(input.reason === undefined ? {} : { reason: input.reason }),
        })
      }

      return apiClient.rollbackPage(input.target.version.pageId, {
        target_page_version_id: input.target.version.pageVersionId,
        ...(input.reason === undefined ? {} : { reason: input.reason }),
      })
    },
    onSuccess: async (result) => {
      setRollbackResult(result)
      setRollbackTarget(null)
      if (knowledgeBaseId !== undefined) {
        await queryClient.invalidateQueries({
          queryKey: adminQueryKeys.versions(knowledgeBaseId),
        })
        await queryClient.invalidateQueries({
          queryKey: adminQueryKeys.knowledgeBase(knowledgeBaseId),
        })
      }
    },
  })

  const knowledgeVersions = useMemo(
    () => versionsQuery.data?.knowledgeVersions ?? [],
    [versionsQuery.data?.knowledgeVersions]
  )
  const pageVersions = useMemo(
    () => versionsQuery.data?.pageVersions ?? [],
    [versionsQuery.data?.pageVersions]
  )
  const knowledgeVersionsPagination =
    versionsQuery.data?.knowledgeVersionsPagination ??
    createEmptyPagination(knowledgeVersionsPage)
  const pageVersionsPagination =
    versionsQuery.data?.pageVersionsPagination ??
    createEmptyPagination(pageVersionsPage)
  const selectedVersionExists =
    selectedVersion === null
      ? false
      : activeExplorerCategory === "knowledge_versions" &&
          selectedVersion.kind === "knowledge_base"
        ? knowledgeVersions.some(
            (version) =>
              version.version_id === selectedVersion.version.version_id
          )
        : activeExplorerCategory === "page_versions" &&
            selectedVersion.kind === "page"
          ? pageVersions.some(
              (version) =>
                version.pageVersionId === selectedVersion.version.pageVersionId
            )
          : false

  useEffect(() => {
    if (selectedVersionExists) {
      return
    }

    if (activeExplorerCategory === "knowledge_versions") {
      const firstKnowledgeVersion = knowledgeVersions[0]

      setSelectedVersion(
        firstKnowledgeVersion === undefined
          ? null
          : {
              kind: "knowledge_base",
              version: firstKnowledgeVersion,
            }
      )
      return
    }

    const firstPageVersion = pageVersions[0]

    if (firstPageVersion !== undefined) {
      setSelectedVersion({ kind: "page", version: firstPageVersion })
      return
    }
    setSelectedVersion(null)
  }, [
    activeExplorerCategory,
    knowledgeVersions,
    pageVersions,
    selectedVersionExists,
  ])

  function updateExplorerCategory(value: string) {
    if (!isVersionExplorerCategory(value)) {
      return
    }

    const next = new URLSearchParams(searchParams)
    next.set("explorer", value)
    setSearchParams(next, { replace: true })
  }

  function updateExplorerPage(category: VersionExplorerCategory, page: number) {
    const next = new URLSearchParams(searchParams)
    next.set(
      category === "knowledge_versions"
        ? "knowledge_version_page"
        : "page_version_page",
      String(page)
    )
    setSearchParams(next, { replace: true })
  }

  return (
    <div
      className="flex flex-col gap-5"
      data-route-id="knowledge-base-versions"
    >
      <h1 className="sr-only">{t("nav.versions")}</h1>

      {versionsQuery.isLoading ? (
        <LoadingState label={t("state.loading")} />
      ) : null}
      {versionsQuery.isError ? (
        <ErrorAlert title={t("state.loadFailed")} />
      ) : null}
      {rollbackResult === null ? null : (
        <RollbackResultStatus result={rollbackResult} />
      )}
      {versionsQuery.isSuccess &&
      knowledgeVersions.length === 0 &&
      pageVersions.length === 0 ? (
        <EmptyState title={t("version.noVersions")} />
      ) : null}

      {knowledgeVersions.length > 0 || pageVersions.length > 0 ? (
        <IdeWorkspace
          detail={
            <VersionInspector
              formatDate={(value) =>
                formatDate(value, i18n.language, t("source.notAvailable"))
              }
              onRollback={setRollbackTarget}
              onViewChangeSet={setSelectedChangeSetId}
              selection={selectedVersion}
            />
          }
          explorer={
            <IdeExplorer
              actions={
                <>
                  <Button
                    aria-label={t("action.compareVersions")}
                    onClick={() => setCompareOpen(true)}
                    size="icon"
                    title={t("action.compareVersions")}
                    type="button"
                    variant="outline"
                  >
                    <GitCompareArrows
                      aria-hidden="true"
                      data-icon="inline-start"
                    />
                  </Button>
                  <Button
                    aria-label={t("action.refresh")}
                    onClick={() => {
                      if (knowledgeBaseId !== undefined) {
                        void queryClient.invalidateQueries({
                          queryKey: adminQueryKeys.versions(knowledgeBaseId),
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
                          {knowledgeVersions.map((version) => (
                            <IdeExplorerItem
                              active={
                                selectedVersion?.kind === "knowledge_base" &&
                                selectedVersion.version.version_id ===
                                  version.version_id
                              }
                              key={version.version_id}
                              meta={version.version_id}
                              onSelect={() =>
                                setSelectedVersion({
                                  kind: "knowledge_base",
                                  version,
                                })
                              }
                              status={
                                version.is_current
                                  ? t("version.current")
                                  : (version.trigger ??
                                    t("source.notAvailable"))
                              }
                              subtitle={formatDate(
                                version.created_at,
                                i18n.language,
                                t("source.notAvailable")
                              )}
                              title={version.summary ?? version.version_id}
                            />
                          ))}
                        </div>
                        <IdeExplorerPagination
                          onPageChange={(page) =>
                            updateExplorerPage("knowledge_versions", page)
                          }
                          page={normalizeIdeExplorerPage(
                            knowledgeVersionsPagination.page,
                            knowledgeVersionsPagination.total,
                            knowledgeVersionsPagination.page_size
                          )}
                          pageSize={knowledgeVersionsPagination.page_size}
                          total={knowledgeVersionsPagination.total}
                        />
                      </>
                    ),
                    count: knowledgeVersionsPagination.total,
                    id: "knowledge_versions",
                    label: t("ide.knowledgeVersions"),
                  },
                  {
                    content: (
                      <>
                        <div className="flex flex-col gap-1">
                          {pageVersions.map((version) => (
                            <IdeExplorerItem
                              active={
                                selectedVersion?.kind === "page" &&
                                selectedVersion.version.pageVersionId ===
                                  version.pageVersionId
                              }
                              key={version.pageVersionId}
                              meta={version.pageVersionId}
                              onSelect={() =>
                                setSelectedVersion({ kind: "page", version })
                              }
                              status={
                                version.isCurrent
                                  ? t("version.current")
                                  : version.trigger
                              }
                              subtitle={version.pageTitle}
                              title={version.summary || version.pageVersionId}
                            />
                          ))}
                        </div>
                        <IdeExplorerPagination
                          onPageChange={(page) =>
                            updateExplorerPage("page_versions", page)
                          }
                          page={normalizeIdeExplorerPage(
                            pageVersionsPagination.page,
                            pageVersionsPagination.total,
                            pageVersionsPagination.page_size
                          )}
                          pageSize={pageVersionsPagination.page_size}
                          total={pageVersionsPagination.total}
                        />
                      </>
                    ),
                    count: pageVersionsPagination.total,
                    id: "page_versions",
                    label: t("ide.pageVersions"),
                  },
                ]}
                onValueChange={updateExplorerCategory}
                value={activeExplorerCategory}
              />
            </IdeExplorer>
          }
        />
      ) : null}

      <ChangeSetSheet
        changeSetId={selectedChangeSetId}
        onOpenChange={(open) =>
          setSelectedChangeSetId(open ? selectedChangeSetId : null)
        }
      />
      <RollbackDialog
        isSubmitting={rollbackMutation.isPending}
        onConfirm={(input) => {
          setRollbackResult(null)
          rollbackMutation.mutate(input)
        }}
        onOpenChange={(open) => setRollbackTarget(open ? rollbackTarget : null)}
        target={rollbackTarget}
      />
      <CompareVersionsDialog
        knowledgeVersions={knowledgeVersions}
        onOpenChange={setCompareOpen}
        onViewDiff={(changeSetId) => {
          setCompareOpen(false)
          setSelectedChangeSetId(changeSetId)
        }}
        open={compareOpen}
      />
    </div>
  )
}

function VersionInspector({
  formatDate,
  onRollback,
  onViewChangeSet,
  selection,
}: {
  formatDate: (value: string) => string
  onRollback: (target: RollbackTarget) => void
  onViewChangeSet: (changeSetId: string) => void
  selection: VersionSelection | null
}) {
  const { t } = useTranslation()

  if (selection === null) {
    return (
      <IdeDetailPanel title={t("ide.detail")}>
        <EmptyState title={t("ide.noSelection")} />
      </IdeDetailPanel>
    )
  }

  const changeSetId =
    selection.kind === "knowledge_base"
      ? selection.version.change_set_id
      : selection.version.changeSetId
  const title =
    selection.kind === "knowledge_base"
      ? (selection.version.summary ?? selection.version.version_id)
      : selection.version.pageTitle

  const primary =
    selection.kind === "knowledge_base" ? (
      <KnowledgeVersionSummary
        formatDate={formatDate}
        version={selection.version}
      />
    ) : (
      <MarkdownPrimaryViewer markdown={selection.version.markdown} />
    )

  return (
    <IdeWorkbenchDetailPanel
      actions={
        <>
          {changeSetId === null ? null : (
            <Button
              onClick={() => onViewChangeSet(changeSetId)}
              size="sm"
              type="button"
              variant="outline"
            >
              {t("action.viewDiff")}
            </Button>
          )}
          <Button
            onClick={() =>
              onRollback(
                selection.kind === "knowledge_base"
                  ? { kind: "knowledge_base", version: selection.version }
                  : { kind: "page", version: selection.version }
              )
            }
            size="sm"
            type="button"
            variant="outline"
          >
            {t("action.rollback")}
          </Button>
        </>
      }
      bottomPanelAriaLabel={t("ide.detailsPanel")}
      bottomPanelCloseLabel={t("ide.closeDetails")}
      bottomPanelDefaultOpen={true}
      bottomPanelFloatingCloseLabel={t("action.close")}
      bottomPanelOpenLabel={t("ide.openDetails")}
      bottomPanelResizeLabel={t("ide.resizeDetails")}
      bottomPanelStateKey={
        selection.kind === "knowledge_base"
          ? selection.version.version_id
          : selection.version.pageVersionId
      }
      bottomTabs={[
        {
          content:
            selection.kind === "knowledge_base" ? (
              <div className="flex flex-col gap-4">
                <KnowledgeVersionSummary
                  formatDate={formatDate}
                  version={selection.version}
                />
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <PageVersionSummary
                  formatDate={formatDate}
                  version={selection.version}
                />
              </div>
            ),
          id: "summary",
          label: t("ide.summary"),
        },
        {
          content: <InspectorJson value={selection.version} />,
          id: "data",
          label: t("ide.rawData"),
        },
      ]}
      primary={primary}
      subtitle={
        selection.kind === "knowledge_base" ? (
          <ResourceIdDisplay resourceId={selection.version.version_id} />
        ) : (
          <ResourceIdDisplay resourceId={selection.version.pageVersionId} />
        )
      }
      title={title}
    />
  )
}

function KnowledgeVersionSummary({
  formatDate,
  version,
}: {
  formatDate: (value: string) => string
  version: KnowledgeVersion
}) {
  const { t } = useTranslation()

  return (
    <InspectorGrid>
      <InspectorField label={t("version.column.knowledgeVersion")}>
        <ResourceIdDisplay resourceId={version.version_id} />
      </InspectorField>
      <InspectorField label={t("version.column.changeSet")}>
        {version.change_set_id === null ? (
          t("source.notAvailable")
        ) : (
          <ResourceIdDisplay resourceId={version.change_set_id} />
        )}
      </InspectorField>
      <InspectorField label={t("version.column.trigger")}>
        {version.trigger ?? t("source.notAvailable")}
      </InspectorField>
      <InspectorField label={t("version.column.summary")}>
        {version.summary ?? ""}
      </InspectorField>
      <InspectorField label={t("version.column.created")}>
        <time dateTime={version.created_at}>
          {formatDate(version.created_at)}
        </time>
      </InspectorField>
      <InspectorField label={t("source.column.status")}>
        {version.is_current ? t("version.current") : version.status}
      </InspectorField>
    </InspectorGrid>
  )
}

function PageVersionSummary({
  formatDate,
  version,
}: {
  formatDate: (value: string) => string
  version: PageVersionView
}) {
  const { t } = useTranslation()

  return (
    <InspectorGrid>
      <InspectorField label={t("version.column.page")}>
        <div className="flex flex-col gap-1">
          <div>{version.pageTitle}</div>
          <ResourceIdDisplay resourceId={version.pageId} />
        </div>
      </InspectorField>
      <InspectorField label={t("version.column.pageVersion")}>
        <ResourceIdDisplay resourceId={version.pageVersionId} />
      </InspectorField>
      <InspectorField label={t("version.column.knowledgeVersion")}>
        {version.knowledgeVersionId === null ? (
          t("source.notAvailable")
        ) : (
          <ResourceIdDisplay resourceId={version.knowledgeVersionId} />
        )}
      </InspectorField>
      <InspectorField label={t("version.column.changeSet")}>
        {version.changeSetId === null ? (
          t("source.notAvailable")
        ) : (
          <ResourceIdDisplay resourceId={version.changeSetId} />
        )}
      </InspectorField>
      <InspectorField label={t("version.column.trigger")}>
        {version.trigger}
      </InspectorField>
      <InspectorField label={t("version.column.summary")}>
        {version.summary}
      </InspectorField>
      <InspectorField label={t("version.column.created")}>
        <time dateTime={version.createdAt}>
          {formatDate(version.createdAt)}
        </time>
      </InspectorField>
      <InspectorField label={t("source.column.status")}>
        {version.isCurrent ? t("version.current") : t("source.notAvailable")}
      </InspectorField>
    </InspectorGrid>
  )
}

function ChangeSetSheet({
  changeSetId,
  onOpenChange,
}: {
  changeSetId: string | null
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const apiClient = useApiClient()
  const changeSetQuery = useQuery({
    enabled: changeSetId !== null,
    queryKey: ["change-sets", changeSetId],
    queryFn: () => apiClient.getChangeSet(changeSetId as string),
  })
  const changeSet = changeSetQuery.data

  return (
    <Sheet
      closeLabel={t("action.close")}
      onOpenChange={onOpenChange}
      open={changeSetId !== null}
      title={t("version.changeSetDetail")}
    >
      {changeSetQuery.isLoading ? (
        <LoadingState label={t("state.loading")} />
      ) : null}
      {changeSetQuery.isError ? (
        <ErrorAlert title={t("state.loadFailed")} />
      ) : null}
      {changeSet === undefined ? null : (
        <ChangeSetDetail changeSet={changeSet} />
      )}
    </Sheet>
  )
}

function ChangeSetDetail({ changeSet }: { changeSet: ChangeSet }) {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col gap-4 text-sm">
      <section className="flex flex-col gap-2">
        <ResourceIdDisplay resourceId={changeSet.id} />
        <ResourceIdDisplay resourceId={changeSet.knowledge_base_id} />
        {changeSet.base_version_id === null ? null : (
          <ResourceIdDisplay resourceId={changeSet.base_version_id} />
        )}
        {changeSet.target_version_id === null ? null : (
          <ResourceIdDisplay resourceId={changeSet.target_version_id} />
        )}
      </section>
      <section className="flex flex-col gap-2">
        <h3 className="font-medium">{t("versions.diff")}</h3>
        <pre className="max-h-72 overflow-auto rounded-md border bg-muted p-3 text-xs">
          {JSON.stringify(
            {
              diff: changeSet.diff,
              items: changeSet.items,
            },
            null,
            2
          )}
        </pre>
      </section>
    </div>
  )
}

function RollbackDialog({
  isSubmitting,
  onConfirm,
  onOpenChange,
  target,
}: {
  isSubmitting: boolean
  onConfirm: (input: { reason?: string; target: RollbackTarget }) => void
  onOpenChange: (open: boolean) => void
  target: RollbackTarget | null
}) {
  const { t } = useTranslation()
  const [reason, setReason] = useState("")
  const targetId =
    target?.kind === "knowledge_base"
      ? target.version.version_id
      : target?.kind === "page"
        ? target.version.pageVersionId
        : null

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
            disabled={isSubmitting || target === null}
            onClick={() => {
              if (target !== null) {
                const normalizedReason = reason.trim()

                onConfirm({
                  target,
                  ...(normalizedReason.length === 0
                    ? {}
                    : { reason: normalizedReason }),
                })
              }
            }}
            type="button"
            variant="destructive"
          >
            {t("action.rollback")}
          </Button>
        </>
      }
      onOpenChange={onOpenChange}
      open={target !== null}
      title={t("version.rollbackTitle")}
    >
      {targetId === null ? null : (
        <div className="flex flex-col gap-4">
          <ResourceIdDisplay resourceId={targetId} />
          <p className="text-sm text-muted-foreground">
            {t("version.rollbackDescription")}
          </p>
          <Field>
            <FieldLabel>{t("version.reason")}</FieldLabel>
            <Textarea
              className="min-h-20"
              onChange={(event) => setReason(event.target.value)}
              value={reason}
            />
          </Field>
        </div>
      )}
    </Dialog>
  )
}

function CompareVersionsDialog({
  knowledgeVersions,
  onOpenChange,
  onViewDiff,
  open,
}: {
  knowledgeVersions: KnowledgeVersion[]
  onOpenChange: (open: boolean) => void
  onViewDiff: (changeSetId: string) => void
  open: boolean
}) {
  const { t } = useTranslation()
  const apiClient = useApiClient()
  const [baseVersionId, setBaseVersionId] = useState("")
  const [scope, setScope] = useState("all_pages")
  const [targetVersionId, setTargetVersionId] = useState("")
  const baseVersion = knowledgeVersions.find(
    (version) => version.version_id === baseVersionId
  )
  const targetVersion = knowledgeVersions.find(
    (version) => version.version_id === targetVersionId
  )
  const changeSetId = targetVersion?.change_set_id ?? null
  const changeSetQuery = useQuery({
    enabled: open && changeSetId !== null,
    queryKey: ["change-sets", changeSetId],
    queryFn: () => apiClient.getChangeSet(changeSetId as string),
  })
  const summary =
    changeSetQuery.data === undefined
      ? null
      : summarizeChangeSet(changeSetQuery.data)

  useEffect(() => {
    if (!open) {
      return
    }

    setTargetVersionId(knowledgeVersions[0]?.version_id ?? "")
    setBaseVersionId(
      knowledgeVersions[1]?.version_id ?? knowledgeVersions[0]?.version_id ?? ""
    )
    setScope("all_pages")
  }, [knowledgeVersions, open])

  return (
    <Dialog
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            disabled={changeSetId === null}
            onClick={() => {
              if (changeSetId !== null) {
                onViewDiff(changeSetId)
              }
            }}
            type="button"
            variant="outline"
          >
            {t("action.viewDiff")}
          </Button>
          <Button
            onClick={() => onOpenChange(false)}
            type="button"
            variant="outline"
          >
            {t("action.close")}
          </Button>
        </div>
      }
      onOpenChange={onOpenChange}
      open={open}
      title={t("version.compareTitle")}
    >
      {knowledgeVersions.length < 2 ? (
        <EmptyState title={t("version.noVersions")} />
      ) : (
        <div className="flex flex-col gap-4 text-sm">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field>
              <FieldLabel>{t("version.baseVersion")}</FieldLabel>
              <input
                aria-label={t("version.baseVersion")}
                className="sr-only"
                readOnly
                tabIndex={-1}
                value={baseVersionId}
              />
              <Select onValueChange={setBaseVersionId} value={baseVersionId}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {knowledgeVersions.map((version) => (
                    <SelectItem
                      key={version.version_id}
                      value={version.version_id}
                    >
                      {version.version_id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel>{t("version.targetVersion")}</FieldLabel>
              <input
                aria-label={t("version.targetVersion")}
                className="sr-only"
                readOnly
                tabIndex={-1}
                value={targetVersionId}
              />
              <Select
                onValueChange={setTargetVersionId}
                value={targetVersionId}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {knowledgeVersions.map((version) => (
                    <SelectItem
                      key={version.version_id}
                      value={version.version_id}
                    >
                      {version.version_id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel>{t("version.scope")}</FieldLabel>
              <input
                aria-label={t("version.scope")}
                className="sr-only"
                readOnly
                tabIndex={-1}
                value={scope}
              />
              <Select onValueChange={setScope} value={scope}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all_pages">
                    {t("version.scopeAllPages")}
                  </SelectItem>
                  <SelectItem value="selected_pages">
                    {t("version.scopeSelectedPages")}
                  </SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
          <div className="text-muted-foreground">
            {t("version.compareSummary", {
              base: baseVersion?.summary ?? baseVersionId,
              target: targetVersion?.summary ?? targetVersionId,
            })}
          </div>
          {changeSetQuery.isLoading ? (
            <LoadingState label={t("state.loading")} />
          ) : null}
          {changeSetQuery.isError ? (
            <ErrorAlert title={t("state.loadFailed")} />
          ) : null}
          {summary === null ? null : (
            <div className="grid gap-3 sm:grid-cols-2">
              <CompareResultList
                items={summary.addedPages}
                title={t("version.addedPages")}
              />
              <CompareResultList
                items={summary.removedPages}
                title={t("version.removedPages")}
              />
              <CompareResultList
                items={summary.changedPages}
                title={t("version.changedPages")}
              />
              <CompareResultList
                items={summary.relationshipChanges}
                title={t("version.relationshipChanges")}
              />
              <CompareResultList
                items={summary.sourceChanges}
                title={t("version.sourceChanges")}
              />
            </div>
          )}
        </div>
      )}
    </Dialog>
  )
}

function RollbackResultStatus({ result }: { result: RollbackResult }) {
  const { t } = useTranslation()
  const pageVersionId =
    typeof result.page_version_id === "string" ? result.page_version_id : null

  return (
    <div className="rounded-md border bg-muted p-3 text-sm" role="status">
      <div className="font-medium">{t("version.rollbackCompleted")}</div>
      <div className="mt-2 flex flex-wrap gap-2">
        <ResourceIdDisplay resourceId={result.rollback_id} />
        <ResourceIdDisplay resourceId={result.change_set_id} />
        <ResourceIdDisplay resourceId={result.knowledge_version_id} />
        {pageVersionId === null ? null : (
          <ResourceIdDisplay resourceId={pageVersionId} />
        )}
      </div>
    </div>
  )
}

function CompareResultList({
  items,
  title,
}: {
  items: string[]
  title: string
}) {
  const { t } = useTranslation()

  return (
    <section className="rounded-md border p-3">
      <h3 className="font-medium">{title}</h3>
      {items.length === 0 ? (
        <div className="mt-2 text-muted-foreground">
          {t("version.noCompareChanges")}
        </div>
      ) : (
        <ul className="mt-2 flex flex-col gap-1">
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

interface ChangeSetSummary {
  addedPages: string[]
  changedPages: string[]
  relationshipChanges: string[]
  removedPages: string[]
  sourceChanges: string[]
}

function summarizeChangeSet(changeSet: ChangeSet): ChangeSetSummary {
  const summary: ChangeSetSummary = {
    addedPages: [],
    changedPages: [],
    relationshipChanges: [],
    removedPages: [],
    sourceChanges: [],
  }

  appendDiffList(summary.addedPages, changeSet.diff.added_pages)
  appendDiffList(summary.removedPages, changeSet.diff.removed_pages)
  appendDiffList(summary.changedPages, changeSet.diff.changed_pages)
  appendDiffList(
    summary.relationshipChanges,
    changeSet.diff.relationship_changes
  )
  appendDiffList(summary.sourceChanges, changeSet.diff.source_changes)

  for (const item of changeSet.items) {
    const objectType = readStringField(item, "object_type") ?? ""
    const objectId =
      readStringField(item, "object_id") ?? readStringField(item, "id")
    const operation = readStringField(item, "operation") ?? "change"

    if (objectId === null) {
      continue
    }

    if (objectType.includes("wiki_page") || objectType.includes("page")) {
      if (operation === "create") {
        appendUnique(summary.addedPages, objectId)
      } else if (operation === "delete") {
        appendUnique(summary.removedPages, objectId)
      } else {
        appendUnique(summary.changedPages, objectId)
      }
      continue
    }

    if (objectType.includes("edge") || objectType.includes("relationship")) {
      appendUnique(summary.relationshipChanges, objectId)
      continue
    }

    if (objectType.includes("source") || objectType.includes("document")) {
      appendUnique(summary.sourceChanges, objectId)
    }
  }

  return summary
}

function appendDiffList(target: string[], value: unknown) {
  if (!Array.isArray(value)) {
    return
  }

  for (const item of value) {
    if (typeof item === "string") {
      appendUnique(target, item)
    }
  }
}

function appendUnique(target: string[], value: string) {
  if (!target.includes(value)) {
    target.push(value)
  }
}

function readStringField(item: Record<string, unknown>, key: string) {
  const value = item[key]

  return typeof value === "string" ? value : null
}

function normalizePageVersion(version: WikiPageVersion): PageVersionView {
  return {
    changeSetId: version.change_set_id,
    createdAt: normalizeVersionTimestamp(version.created_at),
    isCurrent: version.is_current,
    knowledgeVersionId: version.knowledge_version_id,
    markdown: version.markdown,
    pageId: version.page_id,
    pageTitle: version.page_title ?? version.title,
    pageVersionId: version.page_version_id,
    summary: version.summary ?? "",
    trigger: version.trigger ?? "ingest",
  }
}

function createEmptyPagination(page: number) {
  return {
    has_more: false,
    page,
    page_size: ideExplorerPageSize,
    total: 0,
  }
}

function readVersionExplorerCategory(
  searchParams: URLSearchParams
): VersionExplorerCategory {
  const value = searchParams.get("explorer")

  return isVersionExplorerCategory(value) ? value : "knowledge_versions"
}

function isVersionExplorerCategory(
  value: string | null
): value is VersionExplorerCategory {
  return (
    typeof value === "string" &&
    versionExplorerCategories.includes(value as VersionExplorerCategory)
  )
}

function readSearchPage(searchParams: URLSearchParams, key: string) {
  const value = Number(searchParams.get(key))

  return Number.isSafeInteger(value) && value > 0 ? value : 1
}

export function compareCreatedAtDesc(
  leftCreatedAt: unknown,
  leftId: string,
  rightCreatedAt: unknown,
  rightId: string
) {
  const normalizedLeftCreatedAt = normalizeVersionTimestamp(leftCreatedAt)
  const normalizedRightCreatedAt = normalizeVersionTimestamp(rightCreatedAt)
  const createdAtOrder = normalizedRightCreatedAt.localeCompare(
    normalizedLeftCreatedAt
  )

  return createdAtOrder === 0 ? rightId.localeCompare(leftId) : createdAtOrder
}

export function normalizeVersionTimestamp(value: unknown): string {
  return typeof value === "string" ? value : ""
}

function formatDate(
  value: string | null | undefined,
  locale: string,
  fallback: string
) {
  if (typeof value !== "string" || value.trim().length === 0) {
    return fallback
  }

  const date = new Date(value)

  if (!Number.isFinite(date.getTime())) {
    return fallback
  }

  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date)
}
