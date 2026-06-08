import { Fragment, useMemo } from "react"
import { useTranslation } from "react-i18next"
import { useLocation } from "react-router"

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb.js"

export function Breadcrumbs() {
  const { t } = useTranslation()
  const location = useLocation()
  const items = useMemo(
    () => createBreadcrumbItems(location.pathname),
    [location.pathname]
  )

  return (
    <Breadcrumb className="min-w-0">
      <BreadcrumbList>
        {items.map((item, index) => (
          <Fragment key={`${item}-${index}`}>
            {index > 0 ? <BreadcrumbSeparator /> : null}
            <BreadcrumbItem className="min-w-0">
              <BreadcrumbPage className="truncate">{t(item)}</BreadcrumbPage>
            </BreadcrumbItem>
          </Fragment>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  )
}

function createBreadcrumbItems(pathname: string) {
  if (pathname === "/settings") {
    return ["nav.settings"]
  }

  if (pathname.startsWith("/knowledge-bases/")) {
    const routeKey = pathname.split("/")[3] ?? "overview"

    return ["nav.knowledgeBase", knowledgeBaseRouteKeyToLabel(routeKey)]
  }

  return ["nav.dashboard"]
}

function knowledgeBaseRouteKeyToLabel(routeKey: string) {
  const labels: Record<string, string> = {
    forks: "nav.forks",
    graph: "nav.graph",
    jobs: "nav.jobs",
    overview: "nav.knowledgeBase",
    pages: "nav.pages",
    retrieval: "nav.retrievalLab",
    settings: "nav.settings",
    sources: "nav.sources",
    versions: "nav.versions",
  }

  return labels[routeKey] ?? "nav.knowledgeBase"
}
