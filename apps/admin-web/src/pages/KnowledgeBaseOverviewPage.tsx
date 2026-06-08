import { useQuery } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { Link, useParams } from "react-router"

import { useApiClient } from "@/api/api-client-context.js"
import { ResourceIdDisplay } from "@/components/resource-id/ResourceIdDisplay.js"
import { EmptyState } from "@/components/state/EmptyState.js"
import { ErrorAlert } from "@/components/state/ErrorAlert.js"
import { LoadingState } from "@/components/state/LoadingState.js"
import { Button } from "@/components/ui/button.js"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.js"

export function KnowledgeBaseOverviewPage() {
  const { knowledgeBaseId } = useParams()
  const { t } = useTranslation()
  const apiClient = useApiClient()

  const overviewQuery = useQuery({
    enabled: knowledgeBaseId !== undefined,
    queryKey: ["knowledge-bases", knowledgeBaseId, "overview"],
    queryFn: async () => {
      if (knowledgeBaseId === undefined) {
        return null
      }

      const [knowledgeBase, sources, pages, versions, systemPages] =
        await Promise.all([
          apiClient.getKnowledgeBase(knowledgeBaseId),
          apiClient.listSourceDocuments(knowledgeBaseId),
          apiClient.listWikiPages(knowledgeBaseId),
          apiClient.listKnowledgeVersions(knowledgeBaseId),
          apiClient.listSystemPages(knowledgeBaseId),
        ])

      return {
        knowledgeBase,
        pageCount: pages.pagination.total,
        sourceCount: sources.pagination.total,
        systemPages: systemPages.data,
        versionCount: versions.pagination.total,
      }
    },
  })
  const view = overviewQuery.data

  return (
    <div
      className="flex flex-col gap-5 p-6"
      data-route-id="knowledge-base-overview"
    >
      {overviewQuery.isLoading ? (
        <LoadingState label={t("state.loading")} />
      ) : null}
      {overviewQuery.isError ? (
        <ErrorAlert title={t("state.loadFailed")} />
      ) : null}
      {overviewQuery.isSuccess && view === null ? (
        <EmptyState title={t("state.loadFailed")} />
      ) : null}
      {view === null || view === undefined ? null : (
        <>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex flex-col gap-2">
              <h1 className="text-2xl font-semibold tracking-normal">
                {view.knowledgeBase.name}
              </h1>
              {view.knowledgeBase.description === undefined ? null : (
                <p className="max-w-3xl text-sm text-muted-foreground">
                  {view.knowledgeBase.description}
                </p>
              )}
              <div className="flex flex-wrap gap-3 text-sm">
                <ResourceIdDisplay resourceId={view.knowledgeBase.id} />
                <ResourceIdDisplay
                  resourceId={view.knowledgeBase.current_version_id}
                />
                <span className="rounded-md border px-2 py-1 text-xs">
                  {t(`status.${view.knowledgeBase.status}`)}
                </span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild>
                <Link to={`/knowledge-bases/${view.knowledgeBase.id}/sources`}>
                  {t("action.uploadSources")}
                </Link>
              </Button>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <SummaryCard label={t("nav.sources")} value={view.sourceCount} />
            <SummaryCard label={t("nav.pages")} value={view.pageCount} />
            <SummaryCard label={t("nav.versions")} value={view.versionCount} />
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>
                  <h2 className="text-base font-semibold tracking-normal">
                    {t("overview.knowledgeSummary")}
                  </h2>
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
                <KeyValue label={t("knowledgeBase.template")}>
                  {t(`template.${view.knowledgeBase.template}`)}
                </KeyValue>
                <KeyValue label={t("knowledgeBase.outputLanguage")}>
                  {t(`outputLanguage.${view.knowledgeBase.output_language}`)}
                </KeyValue>
                <KeyValue label={t("overview.retrieveConfig")}>
                  <pre className="max-h-32 overflow-auto rounded-md border bg-muted p-2 text-xs">
                    {JSON.stringify(view.knowledgeBase.retrieval, null, 2)}
                  </pre>
                </KeyValue>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>
                  <h2 className="text-base font-semibold tracking-normal">
                    {t("overview.systemPages")}
                  </h2>
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {view.systemPages.map((page) => (
                  <div className="rounded-md border p-3 text-sm" key={page.id}>
                    <div className="font-medium">{page.title}</div>
                    <ResourceIdDisplay resourceId={page.id} />
                    <div className="text-xs text-muted-foreground">
                      {page.type}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  )
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-1 p-4">
        <div className="text-sm text-muted-foreground">{label}</div>
        <div className="text-2xl font-semibold tracking-normal">{value}</div>
      </CardContent>
    </Card>
  )
}

function KeyValue({
  children,
  label,
}: {
  children: React.ReactNode
  label: string
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="font-medium text-muted-foreground">{label}</div>
      <div>{children}</div>
    </div>
  )
}
