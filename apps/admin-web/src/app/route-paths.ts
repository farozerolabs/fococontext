export const rootRoutePath = "/"
export const loginRoutePath = "/login"
export const dashboardRoutePath = "/dashboard"
export const systemSettingsRoutePath = "/settings"

export type KnowledgeBaseWorkflowLinkId =
  | "forks"
  | "graph"
  | "jobs"
  | "overview"
  | "pages"
  | "retrieval"
  | "settings"
  | "sources"
  | "versions"

export interface KnowledgeBaseWorkflowLink {
  id: KnowledgeBaseWorkflowLinkId
  labelKey: string
  path: string
}

export const knowledgeBaseRoutePaths = [
  "/knowledge-bases/:knowledgeBaseId/overview",
  "/knowledge-bases/:knowledgeBaseId/sources",
  "/knowledge-bases/:knowledgeBaseId/jobs",
  "/knowledge-bases/:knowledgeBaseId/pages",
  "/knowledge-bases/:knowledgeBaseId/graph",
  "/knowledge-bases/:knowledgeBaseId/versions",
  "/knowledge-bases/:knowledgeBaseId/forks",
  "/knowledge-bases/:knowledgeBaseId/retrieval",
  "/knowledge-bases/:knowledgeBaseId/settings",
] as const

export const adminRoutePaths = [
  rootRoutePath,
  loginRoutePath,
  dashboardRoutePath,
  systemSettingsRoutePath,
  ...knowledgeBaseRoutePaths,
] as const

export function getRootRedirectTarget(isAuthenticated: boolean) {
  return isAuthenticated ? dashboardRoutePath : loginRoutePath
}

export function createKnowledgeBaseWorkflowLinks(
  knowledgeBaseId: string
): KnowledgeBaseWorkflowLink[] {
  const basePath = `/knowledge-bases/${knowledgeBaseId}`

  return [
    {
      id: "overview",
      labelKey: "nav.overview",
      path: `${basePath}/overview`,
    },
    {
      id: "settings",
      labelKey: "nav.settings",
      path: `${basePath}/settings`,
    },
    {
      id: "sources",
      labelKey: "nav.sources",
      path: `${basePath}/sources`,
    },
    {
      id: "jobs",
      labelKey: "nav.jobs",
      path: `${basePath}/jobs`,
    },
    {
      id: "pages",
      labelKey: "nav.pages",
      path: `${basePath}/pages`,
    },
    {
      id: "graph",
      labelKey: "nav.graph",
      path: `${basePath}/graph`,
    },
    {
      id: "versions",
      labelKey: "nav.versions",
      path: `${basePath}/versions`,
    },
    {
      id: "forks",
      labelKey: "nav.forks",
      path: `${basePath}/forks`,
    },
    {
      id: "retrieval",
      labelKey: "nav.retrievalLab",
      path: `${basePath}/retrieval`,
    },
  ]
}
