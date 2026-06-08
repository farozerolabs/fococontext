import { useQuery } from "@tanstack/react-query"
import { Check, ChevronsUpDown } from "lucide-react"
import { useTranslation } from "react-i18next"
import { useLocation, useNavigate, useParams } from "react-router"

import { useApiClient } from "@/api/api-client-context.js"
import { adminQueryKeys } from "@/api/query-keys.js"
import { Button } from "@/components/ui/button.js"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.js"

export function KnowledgeBaseSwitcher() {
  const { t } = useTranslation()
  const apiClient = useApiClient()
  const location = useLocation()
  const navigate = useNavigate()
  const { knowledgeBaseId } = useParams()
  const knowledgeBasesQuery = useQuery({
    queryKey: adminQueryKeys.knowledgeBases(),
    queryFn: () => apiClient.listKnowledgeBases(),
  })
  const knowledgeBases = knowledgeBasesQuery.data?.data ?? []
  const currentKnowledgeBase =
    knowledgeBases.find(
      (knowledgeBase) => knowledgeBase.id === knowledgeBaseId
    ) ?? knowledgeBases[0]

  function selectKnowledgeBase(nextKnowledgeBaseId: string) {
    navigate(
      `/knowledge-bases/${nextKnowledgeBaseId}/${getKnowledgeBaseRouteSuffix(location.pathname)}`
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          className="hidden max-w-60 justify-between lg:inline-flex"
          disabled={knowledgeBases.length === 0}
          size="sm"
          type="button"
          variant="outline"
        >
          <span className="truncate">
            {currentKnowledgeBase?.name ?? t("layout.selectKnowledgeBase")}
          </span>
          <ChevronsUpDown aria-hidden="true" data-icon="inline-start" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-60">
        <DropdownMenuLabel>{t("layout.selectKnowledgeBase")}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {knowledgeBases.map((knowledgeBase) => (
          <DropdownMenuItem
            key={knowledgeBase.id}
            onSelect={() => selectKnowledgeBase(knowledgeBase.id)}
          >
            <span className="truncate">{knowledgeBase.name}</span>
            {currentKnowledgeBase?.id === knowledgeBase.id ? (
              <Check
                aria-hidden="true"
                className="ml-auto"
                data-icon="inline-start"
              />
            ) : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function getKnowledgeBaseRouteSuffix(pathname: string) {
  const routeMatch = /^\/knowledge-bases\/[^/]+\/([^/]+)/u.exec(pathname)
  const routeSuffix = routeMatch?.[1]

  return supportedKnowledgeBaseRouteSuffixes.has(routeSuffix ?? "")
    ? routeSuffix
    : "overview"
}

const supportedKnowledgeBaseRouteSuffixes = new Set([
  "overview",
  "sources",
  "jobs",
  "pages",
  "graph",
  "versions",
  "retrieval",
  "settings",
])
