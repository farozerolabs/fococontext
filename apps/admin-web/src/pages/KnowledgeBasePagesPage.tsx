import { useMutation, useQuery } from "@tanstack/react-query"
import { useEffect, useState, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { useParams, useSearchParams } from "react-router"

import {
  type MarkdownExportResult,
  type RelatedPage,
  type SystemPage,
  type WikiPage,
  type WikiPageVersion,
} from "@/api/fococontext-client.js"
import { useApiClient } from "@/api/api-client-context.js"
import { adminQueryKeys } from "@/api/query-keys.js"
import {
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
  ideExplorerPageSize,
  normalizeIdeExplorerPage,
} from "@/components/ide/IdeWorkspace.js"
import { MarkdownPrimaryViewer } from "@/components/markdown/MarkdownPrimaryViewer.js"
import { ResourceIdDisplay } from "@/components/resource-id/ResourceIdDisplay.js"
import { EmptyState } from "@/components/state/EmptyState.js"
import { ErrorAlert } from "@/components/state/ErrorAlert.js"
import { LoadingState } from "@/components/state/LoadingState.js"
import { Badge } from "@/components/ui/badge.js"
import { Button } from "@/components/ui/button.js"
import { showToast } from "@/components/ui/toast.js"
import { AppDialog as Dialog } from "@/components/state/AppDialog.js"

interface WikiPagesView {
  systemPagination: {
    has_more: boolean
    page: number
    page_size: number
    total: number
  }
  systemPages: SystemPage[]
  wikiPagination: {
    has_more: boolean
    page: number
    page_size: number
    total: number
  }
  wikiPages: WikiPageView[]
}

interface WikiPageView {
  frontmatter: Record<string, unknown>
  id: string
  knowledgeVersionId: string | null
  markdown: string
  mergeHistory: Record<string, unknown>[]
  relationships: Record<string, unknown>[]
  slug: string
  sources: Record<string, unknown>[]
  tags: string[]
  title: string
  type: string
  updatedAt: string
  versionHistory: Record<string, unknown>[]
  wikilinks: string[]
  wikilinkTargets: Record<string, unknown>[]
  pageVersionId: string
}

type SelectedPage =
  | {
      kind: "wiki"
      page: WikiPageView
    }
  | {
      kind: "system"
      page: SystemPage
    }

type WikiExplorerCategory = "wiki_pages" | "system_pages"

const wikiExplorerCategories: WikiExplorerCategory[] = [
  "wiki_pages",
  "system_pages",
]
const pageVersionPreviewLimit = 20
const relatedPagePreviewLimit = 20

export function KnowledgeBasePagesPage() {
  const { knowledgeBaseId } = useParams()
  const { i18n, t } = useTranslation()
  const apiClient = useApiClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const activeExplorerCategory = readWikiExplorerCategory(searchParams)
  const wikiPagesPage = readSearchPage(searchParams, "wiki_page")
  const systemPagesPage = readSearchPage(searchParams, "system_page")
  const wikiPagesListOptions = {
    page: wikiPagesPage,
    pageSize: ideExplorerPageSize,
  }
  const systemPagesListOptions = {
    page: systemPagesPage,
    pageSize: ideExplorerPageSize,
  }
  const [selectedPage, setSelectedPage] = useState<SelectedPage | null>(null)
  const [exportResult, setExportResult] = useState<MarkdownExportResult | null>(
    null
  )

  const pagesQuery = useQuery({
    enabled: knowledgeBaseId !== undefined,
    queryKey:
      knowledgeBaseId === undefined
        ? adminQueryKeys.wikiPages("")
        : adminQueryKeys.wikiPages(knowledgeBaseId, {
            systemPage: systemPagesPage,
            wikiPage: wikiPagesPage,
          }),
    queryFn: async (): Promise<WikiPagesView> => {
      if (knowledgeBaseId === undefined) {
        return {
          systemPagination: createEmptyPagination(systemPagesPage),
          systemPages: [],
          wikiPagination: createEmptyPagination(wikiPagesPage),
          wikiPages: [],
        }
      }

      const [pages, systemPages] = await Promise.all([
        apiClient.listWikiPages(knowledgeBaseId, wikiPagesListOptions),
        apiClient.listSystemPages(knowledgeBaseId, systemPagesListOptions),
      ])
      const pageDetails = await Promise.all(
        pages.data.map(async (page) => {
          const [related, versions] = await Promise.all([
            apiClient.listRelatedPages(page.id, {
              page: 1,
              pageSize: relatedPagePreviewLimit,
            }),
            apiClient.listPageVersions(page.id, {
              page: 1,
              pageSize: pageVersionPreviewLimit,
            }),
          ])

          return normalizeWikiPage(page, related.data, versions.data)
        })
      )

      return {
        systemPagination: systemPages.pagination,
        systemPages: systemPages.data,
        wikiPagination: pages.pagination,
        wikiPages: pageDetails,
      }
    },
  })
  const exportMutation = useMutation({
    mutationFn: async () => {
      if (knowledgeBaseId === undefined) {
        throw new Error("Knowledge base route parameter is missing.")
      }

      return apiClient.exportMarkdown(knowledgeBaseId)
    },
    onSuccess: setExportResult,
  })

  const view = pagesQuery.data
  const linkedPageId = searchParams.get("page_id")
  const selectedPageExists =
    selectedPage === null
      ? false
      : activeExplorerCategory === "wiki_pages" && selectedPage.kind === "wiki"
        ? (view?.wikiPages.some((page) => page.id === selectedPage.page.id) ??
          false)
        : activeExplorerCategory === "system_pages" &&
            selectedPage.kind === "system"
          ? (view?.systemPages.some(
              (page) => page.id === selectedPage.page.id
            ) ?? false)
          : false

  useEffect(() => {
    if (view === undefined || selectedPageExists) {
      return
    }

    if (activeExplorerCategory === "wiki_pages") {
      const linkedWikiPage =
        linkedPageId === null
          ? undefined
          : view.wikiPages.find(
              (page) =>
                page.id === linkedPageId ||
                page.slug === linkedPageId ||
                normalizeWikiTarget(page.title) === linkedPageId
            )
      const firstWikiPage = linkedWikiPage ?? view.wikiPages[0]

      setSelectedPage(
        firstWikiPage === undefined
          ? null
          : { kind: "wiki", page: firstWikiPage }
      )
      return
    }

    const firstSystemPage = view.systemPages[0]

    if (firstSystemPage !== undefined) {
      setSelectedPage({ kind: "system", page: firstSystemPage })
      return
    }
    setSelectedPage(null)
  }, [activeExplorerCategory, linkedPageId, selectedPageExists, view])

  function updateExplorerCategory(value: string) {
    if (!isWikiExplorerCategory(value)) {
      return
    }

    const next = new URLSearchParams(searchParams)
    next.set("explorer", value)
    setSearchParams(next, { replace: true })
  }

  function updateExplorerPage(category: WikiExplorerCategory, page: number) {
    const next = new URLSearchParams(searchParams)
    next.set(
      category === "wiki_pages" ? "wiki_page" : "system_page",
      String(page)
    )
    setSearchParams(next, { replace: true })
  }

  return (
    <div className="flex flex-col gap-6" data-route-id="knowledge-base-pages">
      <h1 className="sr-only">{t("nav.pages")}</h1>

      {pagesQuery.isLoading ? (
        <LoadingState label={t("state.loading")} />
      ) : null}
      {pagesQuery.isError ? <ErrorAlert title={t("state.loadFailed")} /> : null}
      {pagesQuery.isSuccess &&
      view?.wikiPages.length === 0 &&
      view.systemPages.length === 0 ? (
        <EmptyState title={t("empty.noPages")} />
      ) : null}
      {view !== undefined &&
      (view.wikiPages.length > 0 || view.systemPages.length > 0) ? (
        <IdeWorkspace
          detail={
            <PageInspector
              actions={
                <>
                  <Button
                    disabled={exportMutation.isPending}
                    onClick={() => exportMutation.mutate()}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    {t("page.exportPages")}
                  </Button>
                </>
              }
              formatDate={(value) => formatDate(value, i18n.language)}
              knowledgeBaseId={knowledgeBaseId ?? ""}
              selectedPage={selectedPage}
            />
          }
          explorer={
            <IdeExplorer>
              <IdeExplorerCategoryTabs
                ariaLabel={t("ide.resourceCategories")}
                categories={[
                  {
                    content: (
                      <>
                        <div className="flex flex-col gap-1">
                          {view.wikiPages.map((page) => (
                            <IdeExplorerItem
                              active={
                                selectedPage?.kind === "wiki" &&
                                selectedPage.page.id === page.id
                              }
                              key={page.id}
                              meta={page.id}
                              onSelect={() => {
                                setSelectedPage({ kind: "wiki", page })
                                const next = new URLSearchParams(searchParams)
                                next.set("page_id", page.id)
                                setSearchParams(next, { replace: true })
                              }}
                              status={page.type}
                              subtitle={page.slug}
                              title={page.title}
                            />
                          ))}
                        </div>
                        <IdeExplorerPagination
                          onPageChange={(page) =>
                            updateExplorerPage("wiki_pages", page)
                          }
                          page={normalizeIdeExplorerPage(
                            view.wikiPagination.page,
                            view.wikiPagination.total,
                            view.wikiPagination.page_size
                          )}
                          pageSize={view.wikiPagination.page_size}
                          total={view.wikiPagination.total}
                        />
                      </>
                    ),
                    count: view.wikiPagination.total,
                    id: "wiki_pages",
                    label: t("ide.wikiPages"),
                  },
                  {
                    content:
                      view.systemPages.length === 0 ? (
                        <div className="px-2 py-1 text-sm text-muted-foreground">
                          {t("page.noSystemPages")}
                        </div>
                      ) : (
                        <>
                          <div className="flex flex-col gap-1">
                            {view.systemPages.map((page) => (
                              <IdeExplorerItem
                                active={
                                  selectedPage?.kind === "system" &&
                                  selectedPage.page.id === page.id
                                }
                                key={page.id}
                                meta={page.id}
                                onSelect={() => {
                                  setSelectedPage({ kind: "system", page })
                                  const next = new URLSearchParams(searchParams)
                                  next.set("page_id", page.id)
                                  setSearchParams(next, { replace: true })
                                }}
                                status={page.type}
                                subtitle={formatDate(
                                  page.updated_at,
                                  i18n.language
                                )}
                                title={page.title}
                              />
                            ))}
                          </div>
                          <IdeExplorerPagination
                            onPageChange={(page) =>
                              updateExplorerPage("system_pages", page)
                            }
                            page={normalizeIdeExplorerPage(
                              view.systemPagination.page,
                              view.systemPagination.total,
                              view.systemPagination.page_size
                            )}
                            pageSize={view.systemPagination.page_size}
                            total={view.systemPagination.total}
                          />
                        </>
                      ),
                    count: view.systemPagination.total,
                    id: "system_pages",
                    label: t("ide.systemPages"),
                  },
                ]}
                onValueChange={updateExplorerCategory}
                value={activeExplorerCategory}
              />
            </IdeExplorer>
          }
        />
      ) : null}
      <MarkdownExportDialog
        exportResult={exportResult}
        onOpenChange={(open) => setExportResult(open ? exportResult : null)}
      />
    </div>
  )
}

function PageInspector({
  actions,
  formatDate,
  knowledgeBaseId,
  selectedPage,
}: {
  actions: ReactNode
  formatDate: (value: string) => string
  knowledgeBaseId: string
  selectedPage: SelectedPage | null
}) {
  const { t } = useTranslation()
  const title =
    selectedPage?.kind === "wiki"
      ? selectedPage.page.title
      : selectedPage?.kind === "system"
        ? selectedPage.page.title
        : t("ide.detail")

  const primary =
    selectedPage === null ? (
      <EmptyState title={t("ide.noSelection")} />
    ) : selectedPage.kind === "system" ? (
      <MarkdownPrimaryViewer markdown={selectedPage.page.markdown} />
    ) : (
      <MarkdownPrimaryViewer
        markdown={selectedPage.page.markdown}
        resolveWikilink={(target, anchor) =>
          `/knowledge-bases/${knowledgeBaseId}/pages?page_id=${encodeURIComponent(
            normalizeWikiTarget(target)
          )}${anchor === undefined ? "" : `#${encodeURIComponent(anchor)}`}`
        }
      />
    )

  const bottomTabs =
    selectedPage === null
      ? []
      : selectedPage.kind === "system"
        ? [
            {
              content: (
                <div className="flex flex-col gap-4">
                  <InspectorGrid>
                    <InspectorField label={t("page.column.type")}>
                      {selectedPage.page.type}
                    </InspectorField>
                    <InspectorField label={t("page.column.updated")}>
                      <time dateTime={selectedPage.page.updated_at}>
                        {formatDate(selectedPage.page.updated_at)}
                      </time>
                    </InspectorField>
                  </InspectorGrid>
                </div>
              ),
              id: "summary",
              label: t("ide.summary"),
            },
            {
              content: <InspectorJson value={selectedPage.page} />,
              id: "data",
              label: t("ide.rawData"),
            },
          ]
        : createWikiPageBottomTabs(selectedPage.page, t)

  return (
    <IdeWorkbenchDetailPanel
      actions={actions}
      bottomPanelAriaLabel={t("ide.detailsPanel")}
      bottomPanelCloseLabel={t("ide.closeDetails")}
      bottomPanelDefaultOpen={true}
      bottomPanelFloatingCloseLabel={t("action.close")}
      bottomPanelOpenLabel={t("ide.openDetails")}
      bottomPanelResizeLabel={t("ide.resizeDetails")}
      bottomPanelStateKey={selectedPage?.page.id}
      bottomTabs={bottomTabs}
      primary={primary}
      subtitle={
        selectedPage === null ? undefined : (
          <ResourceIdDisplay resourceId={selectedPage.page.id} />
        )
      }
      title={title}
    />
  )
}

function createWikiPageBottomTabs(
  page: WikiPageView,
  t: (key: string) => string
) {
  return [
    {
      content: (
        <div className="flex flex-col gap-4">
          <InspectorGrid>
            <InspectorField label={t("page.column.type")}>
              {page.type}
            </InspectorField>
            <InspectorField label={t("knowledgeBase.slug")}>
              {page.slug}
            </InspectorField>
            <InspectorField label={t("page.column.version")}>
              <ResourceIdDisplay resourceId={page.pageVersionId} />
            </InspectorField>
            <InspectorField label={t("knowledgeBase.currentVersion")}>
              {page.knowledgeVersionId === null ? (
                t("source.notAvailable")
              ) : (
                <ResourceIdDisplay resourceId={page.knowledgeVersionId} />
              )}
            </InspectorField>
          </InspectorGrid>
        </div>
      ),
      id: "summary",
      label: t("ide.summary"),
    },
    {
      content: (
        <div className="flex flex-col gap-5">
          <DetailSection
            items={Object.entries(page.frontmatter).map(
              ([key, value]) => `${key}: ${formatValue(value)}`
            )}
            title={t("page.frontmatter")}
          />
          <SourceEvidenceSection sources={page.sources} />
          <DetailSection
            items={page.relationships.map((relationship) =>
              formatValue(relationship)
            )}
            title={t("page.relationships")}
          />
          <DetailSection items={page.wikilinks} title={t("page.wikilinks")} />
        </div>
      ),
      id: "relationships",
      label: t("page.relationships"),
    },
    {
      content: (
        <div className="flex flex-col gap-5">
          <DetailSection
            items={page.mergeHistory.map((item) => formatValue(item))}
            title={t("page.mergeHistory")}
          />
          <DetailSection
            items={page.versionHistory.map((item) => formatValue(item))}
            title={t("page.versionHistory")}
          />
        </div>
      ),
      id: "history",
      label: t("page.versionHistory"),
    },
    {
      content: <InspectorJson value={page} />,
      id: "data",
      label: t("ide.rawData"),
    },
  ]
}

function SourceEvidenceSection({
  sources,
}: {
  sources: readonly Record<string, unknown>[]
}) {
  const { t } = useTranslation()
  const apiClient = useApiClient()
  const previewMediaMutation = useMutation({
    mutationFn: (mediaAssetId: string) =>
      apiClient.getMediaAssetPreview(mediaAssetId),
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

  return (
    <InspectorSection title={t("page.sources")}>
      {sources.length === 0 ? (
        <div className="text-sm text-muted-foreground">
          {t("source.notAvailable")}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {sources.map((source, index) => {
            const documentId = readString(source.document_id)
            const mediaAssetId = readString(source.media_asset_id)
            const locator = readString(source.locator)
            const evidenceKind = readString(source.evidence_kind)
            const isImageCaption = evidenceKind === "image_caption"
            const isOcrEvidence =
              evidenceKind === "ocr" || evidenceKind === "ocr_text"

            return (
              <div
                className="flex flex-col gap-2 rounded-md border px-3 py-2 text-sm"
                key={`${documentId ?? "source"}:${mediaAssetId ?? ""}:${locator ?? index}`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    variant={
                      isImageCaption
                        ? "default"
                        : isOcrEvidence
                          ? "outline"
                          : "secondary"
                    }
                  >
                    {isImageCaption
                      ? t("page.imageCaptionEvidence")
                      : isOcrEvidence
                        ? t("page.ocrEvidence")
                        : t("page.textEvidence")}
                  </Badge>
                  {documentId === null ? null : (
                    <span className="inline-flex items-center gap-1">
                      <span className="text-muted-foreground">
                        {t("page.document")}
                      </span>
                      <ResourceIdDisplay resourceId={documentId} />
                    </span>
                  )}
                  {mediaAssetId === null ? null : (
                    <span className="inline-flex items-center gap-1">
                      <span className="text-muted-foreground">
                        {t("page.mediaAsset")}
                      </span>
                      <ResourceIdDisplay resourceId={mediaAssetId} />
                    </span>
                  )}
                </div>
                {mediaAssetId === null ? null : (
                  <Button
                    disabled={previewMediaMutation.variables === mediaAssetId}
                    onClick={() => previewMediaMutation.mutate(mediaAssetId)}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    {t("source.caption.preview")}
                  </Button>
                )}
                {locator === null ? null : (
                  <div className="text-xs text-muted-foreground">
                    {t("page.locator")}: {locator}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </InspectorSection>
  )
}

function DetailSection({ items, title }: { items: string[]; title: string }) {
  const { t } = useTranslation()

  return (
    <section className="flex flex-col gap-2">
      <h3 className="font-medium">{title}</h3>
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
    </section>
  )
}

function MarkdownExportDialog({
  exportResult,
  onOpenChange,
}: {
  exportResult: MarkdownExportResult | null
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()

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
      open={exportResult !== null}
      title={t("page.markdownExport")}
    >
      {exportResult === null ? null : (
        <div className="flex flex-col gap-4">
          <DetailSection
            items={exportResult.files.map((file) => file.path)}
            title={t("page.exportFiles")}
          />
          <pre className="max-h-96 overflow-auto rounded-md border bg-muted p-3 text-xs">
            {exportResult.content}
          </pre>
        </div>
      )}
    </Dialog>
  )
}

function normalizeWikiPage(
  page: WikiPage,
  relatedPages: readonly RelatedPage[],
  versions: readonly WikiPageVersion[]
) {
  const pageVersionId = page.current_version_id ?? page.id
  const currentVersion = versions.find(
    (version) => version.page_version_id === pageVersionId
  )

  return {
    frontmatter: page.frontmatter,
    id: page.id,
    knowledgeVersionId: currentVersion?.knowledge_version_id ?? null,
    markdown: page.markdown,
    mergeHistory: versions
      .filter((version) => version.change_set_id !== null)
      .map((version) => ({
        change_set_id: version.change_set_id,
        summary: version.summary,
      })),
    pageVersionId,
    relationships: relatedPages.map((related) => ({ ...related })),
    slug: page.slug,
    sources: readObjectArray(page.source_refs).length
      ? readObjectArray(page.source_refs)
      : page.source_document_ids.map((documentId) => ({
          document_id: documentId,
          evidence_kind: "text",
        })),
    tags: readStringArray(page.metadata.tags),
    title: page.title,
    type: page.type,
    updatedAt: page.updated_at,
    versionHistory: versions.map((version) => ({
      change_set_id: version.change_set_id,
      created_at: version.created_at,
      page_version_id: version.page_version_id,
      summary: version.summary,
    })),
    wikilinks: readObjectArray(page.wikilink_targets).length
      ? readObjectArray(page.wikilink_targets).map((target) =>
          String(target.title ?? target.normalized_key ?? "")
        )
      : readStringArray(page.frontmatter.wikilinks),
    wikilinkTargets: readObjectArray(page.wikilink_targets),
  } satisfies WikiPageView
}

function normalizeWikiTarget(value: string) {
  return value.trim().toLowerCase().replace(/\s+/gu, "-")
}

function createEmptyPagination(page: number) {
  return {
    has_more: false,
    page,
    page_size: ideExplorerPageSize,
    total: 0,
  }
}

function readWikiExplorerCategory(
  searchParams: URLSearchParams
): WikiExplorerCategory {
  const value = searchParams.get("explorer")

  return isWikiExplorerCategory(value) ? value : "wiki_pages"
}

function isWikiExplorerCategory(
  value: string | null
): value is WikiExplorerCategory {
  return (
    typeof value === "string" &&
    wikiExplorerCategories.includes(value as WikiExplorerCategory)
  )
}

function readSearchPage(searchParams: URLSearchParams, key: string) {
  const value = Number(searchParams.get(key))

  return Number.isSafeInteger(value) && value > 0 ? value : 1
}

function readStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : []
}

function readObjectArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter(
        (item): item is Record<string, unknown> =>
          typeof item === "object" && item !== null && !Array.isArray(item)
      )
    : []
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value : null
}

function formatValue(value: unknown) {
  if (typeof value === "string") {
    return value
  }

  return JSON.stringify(value)
}

function formatDate(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value))
}
