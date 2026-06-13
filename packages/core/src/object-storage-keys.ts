export interface KnowledgeBaseObjectKeyInput {
  knowledgeBaseId: string;
}

export interface SourceObjectKeyInput extends KnowledgeBaseObjectKeyInput {
  documentId: string;
  fileName: string;
}

export interface ParsedContentObjectKeyInput extends KnowledgeBaseObjectKeyInput {
  contentHash: string;
  documentId: string;
}

export interface MediaAssetObjectKeyInput extends KnowledgeBaseObjectKeyInput {
  documentId: string;
  parserObjectKey: string;
}

export interface ProcessingArtifactObjectKeyInput extends KnowledgeBaseObjectKeyInput {
  artifactKind: string;
  contentHash: string;
  documentId: string;
  extension: string;
  jobId: string;
  stage: string;
  unitKey: string;
}

export interface OcrPageImageObjectKeyInput extends KnowledgeBaseObjectKeyInput {
  documentId: string;
  pageNumber: number;
  parsedContentId: string;
}

export interface WikiDraftObjectKeyInput extends KnowledgeBaseObjectKeyInput {
  draftId: string;
}

export interface WikiPageObjectKeyInput extends KnowledgeBaseObjectKeyInput {
  pageId: string;
}

export interface WikiPageVersionObjectKeyInput extends KnowledgeBaseObjectKeyInput {
  pageVersionId: string;
}

export interface WikiEdgeObjectKeyInput extends KnowledgeBaseObjectKeyInput {
  edgeId: string;
}

export function sanitizeObjectKeySegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "_");
}

export function createKnowledgeBaseObjectPrefix(input: KnowledgeBaseObjectKeyInput): string {
  return `kb/${sanitizeObjectKeySegment(input.knowledgeBaseId)}/`;
}

export function createSourceObjectPrefix(
  input: KnowledgeBaseObjectKeyInput & { documentId: string },
): string {
  return `${createKnowledgeBaseObjectPrefix(input)}sources/${sanitizeObjectKeySegment(
    input.documentId,
  )}/`;
}

export function createSourceObjectKey(input: SourceObjectKeyInput): string {
  return `${createSourceObjectPrefix(input)}${sanitizeObjectKeySegment(input.fileName)}`;
}

export function createParsedContentObjectPrefix(
  input: KnowledgeBaseObjectKeyInput & { documentId: string },
): string {
  return `${createKnowledgeBaseObjectPrefix(input)}parsed/${sanitizeObjectKeySegment(
    input.documentId,
  )}/`;
}

export function createParsedContentObjectKey(input: ParsedContentObjectKeyInput): string {
  return `${createParsedContentObjectPrefix(input)}${sanitizeObjectKeySegment(
    input.contentHash,
  )}/normalized.md`;
}

export function createMediaAssetObjectPrefix(
  input: KnowledgeBaseObjectKeyInput & { documentId: string },
): string {
  return `${createKnowledgeBaseObjectPrefix(input)}media/${sanitizeObjectKeySegment(
    input.documentId,
  )}/`;
}

export function createMediaAssetObjectKey(input: MediaAssetObjectKeyInput): string {
  return `${createMediaAssetObjectPrefix(input)}${sanitizeObjectKeySegment(
    readObjectKeyBasename(input.parserObjectKey),
  )}`;
}

export function createProcessingObjectPrefix(
  input: KnowledgeBaseObjectKeyInput & { documentId: string },
): string {
  return `${createKnowledgeBaseObjectPrefix(input)}processing/${sanitizeObjectKeySegment(
    input.documentId,
  )}/`;
}

export function createProcessingArtifactObjectKey(input: ProcessingArtifactObjectKeyInput): string {
  return `${createProcessingObjectPrefix(input)}${sanitizeObjectKeySegment(
    input.jobId,
  )}/${sanitizeObjectKeySegment(
    input.stage,
  )}/${sanitizeObjectKeySegment(input.contentHash)}/${sanitizeObjectKeySegment(
    input.unitKey,
  )}-${sanitizeObjectKeySegment(input.artifactKind)}.${sanitizeObjectKeySegment(input.extension)}`;
}

export function createOcrObjectPrefix(
  input: KnowledgeBaseObjectKeyInput & { documentId: string },
): string {
  return `${createKnowledgeBaseObjectPrefix(input)}ocr/${sanitizeObjectKeySegment(
    input.documentId,
  )}/`;
}

export function createOcrPageImageObjectKey(input: OcrPageImageObjectKeyInput): string {
  return `${createOcrObjectPrefix(input)}${sanitizeObjectKeySegment(
    input.parsedContentId,
  )}/page-${input.pageNumber}.png`;
}

export function createWikiDraftObjectKey(input: WikiDraftObjectKeyInput): string {
  return `${createKnowledgeBaseObjectPrefix(input)}wiki-drafts/${sanitizeObjectKeySegment(
    input.draftId,
  )}.md`;
}

export function createWikiPageObjectPrefix(input: WikiPageObjectKeyInput): string {
  return `${createKnowledgeBaseObjectPrefix(input)}wiki-pages/${sanitizeObjectKeySegment(
    input.pageId,
  )}/`;
}

export function createWikiPageVersionObjectPrefix(input: WikiPageVersionObjectKeyInput): string {
  return `${createKnowledgeBaseObjectPrefix(input)}wiki-page-versions/${sanitizeObjectKeySegment(
    input.pageVersionId,
  )}/`;
}

export function createWikiEdgeObjectPrefix(input: WikiEdgeObjectKeyInput): string {
  return `${createKnowledgeBaseObjectPrefix(input)}wiki-edges/${sanitizeObjectKeySegment(
    input.edgeId,
  )}/`;
}

function readObjectKeyBasename(objectKey: string): string {
  const segments = objectKey.split("/").filter((segment) => segment.length > 0);

  return segments[segments.length - 1] ?? objectKey;
}
