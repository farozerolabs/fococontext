export const adminQueryKeys = {
  cleanupOperations: (options?: Record<string, unknown>) =>
    [
      "cleanup-operations",
      ...(options === undefined ? [] : [options]),
    ] as const,
  cleanupOperation: (operationId: string) =>
    ["cleanup-operations", operationId] as const,
  graph: (knowledgeBaseId: string) =>
    ["knowledge-bases", knowledgeBaseId, "graph"] as const,
  graphInsights: (knowledgeBaseId: string) =>
    ["knowledge-bases", knowledgeBaseId, "graph", "insights"] as const,
  jobDetail: (jobId: string) => ["jobs", jobId] as const,
  ingestProgress: (knowledgeBaseId: string) =>
    ["knowledge-bases", knowledgeBaseId, "ingest-progress"] as const,
  knowledgeCheck: (checkId: string) => ["knowledge-checks", checkId] as const,
  knowledgeCheckFindings: (
    checkId: string,
    options?: Record<string, unknown>
  ) =>
    [
      "knowledge-checks",
      checkId,
      "findings",
      ...(options === undefined ? [] : [options]),
    ] as const,
  jobs: (knowledgeBaseId: string, options?: Record<string, unknown>) =>
    [
      "knowledge-bases",
      knowledgeBaseId,
      "jobs",
      ...(options === undefined ? [] : [options]),
    ] as const,
  knowledgeBase: (knowledgeBaseId: string) =>
    ["knowledge-bases", knowledgeBaseId] as const,
  datasetConfiguration: (knowledgeBaseId: string) =>
    ["knowledge-bases", knowledgeBaseId, "dataset-configuration"] as const,
  datasetConfigurationPresets: () => ["dataset-configuration-presets"] as const,
  fork: (forkId: string) => ["forks", forkId] as const,
  forks: (knowledgeBaseId: string, options?: Record<string, unknown>) =>
    [
      "knowledge-bases",
      knowledgeBaseId,
      "forks",
      ...(options === undefined ? [] : [options]),
    ] as const,
  knowledgeBases: (options?: Record<string, unknown>) =>
    ["knowledge-bases", ...(options === undefined ? [] : [options])] as const,
  sourceDocuments: (
    knowledgeBaseId: string,
    options?: Record<string, unknown>
  ) =>
    [
      "knowledge-bases",
      knowledgeBaseId,
      "documents",
      ...(options === undefined ? [] : [options]),
    ] as const,
  sourceWatchRules: (
    knowledgeBaseId: string,
    options?: Record<string, unknown>
  ) =>
    [
      "knowledge-bases",
      knowledgeBaseId,
      "source-watch-rules",
      ...(options === undefined ? [] : [options]),
    ] as const,
  sourceWatchScans: (ruleId: string, options?: Record<string, unknown>) =>
    [
      "source-watch-rules",
      ruleId,
      "scans",
      ...(options === undefined ? [] : [options]),
    ] as const,
  sourceWatchScanItems: (jobId: string, options?: Record<string, unknown>) =>
    [
      "scheduled-import-jobs",
      jobId,
      "items",
      ...(options === undefined ? [] : [options]),
    ] as const,
  systemSettings: () => ["system", "settings"] as const,
  systemStatus: () => ["system", "status"] as const,
  systemPages: (knowledgeBaseId: string, options?: Record<string, unknown>) =>
    [
      "knowledge-bases",
      knowledgeBaseId,
      "system-pages",
      ...(options === undefined ? [] : [options]),
    ] as const,
  wikiPages: (knowledgeBaseId: string, options?: Record<string, unknown>) =>
    [
      "knowledge-bases",
      knowledgeBaseId,
      "wiki-pages",
      ...(options === undefined ? [] : [options]),
    ] as const,
  versions: (knowledgeBaseId: string, options?: Record<string, unknown>) =>
    [
      "knowledge-bases",
      knowledgeBaseId,
      "versions",
      ...(options === undefined ? [] : [options]),
    ] as const,
  pageVersions: (pageId: string, options?: Record<string, unknown>) =>
    [
      "pages",
      pageId,
      "versions",
      ...(options === undefined ? [] : [options]),
    ] as const,
}
