import type { JobRecord } from "../documents/document.types.js";

const hiddenFromKnowledgeBaseJobListTypes = new Set(["graph.insights.refresh"]);

export function isHiddenFromKnowledgeBaseJobList(job: JobRecord): boolean {
  return job.jobType !== undefined && hiddenFromKnowledgeBaseJobListTypes.has(job.jobType);
}
