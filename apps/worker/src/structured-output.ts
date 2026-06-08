export class StructuredOutputValidationError extends Error {
  readonly issues: string[];

  constructor(issues: readonly string[]) {
    super(`Structured output validation failed: ${issues.join("; ")}`);
    this.name = "StructuredOutputValidationError";
    this.issues = [...issues];
  }
}

export interface StructuredSourceRef {
  document_id: string;
  parsed_content_id?: string;
  source_anchor_id?: string;
  locator?: string;
  media_asset_id?: string;
  evidence_kind?: "text" | "image_caption" | "ocr";
  locator_status?: "resolved" | "not_provided" | "not_found" | "ambiguous" | "unsupported";
  warning_codes?: string[];
}

export interface StructuredAnalysisItem {
  title: string;
  summary: string | null;
  source_refs: StructuredSourceRef[];
  locator_refs: string[];
  metadata: Record<string, unknown>;
}

export interface StructuredAnalysisRelationship {
  from_title: string;
  to_title: string;
  relation_type: string;
  evidence: string | null;
  source_refs: StructuredSourceRef[];
  locator_refs: string[];
}

export interface StructuredAnalysisOutput {
  entities: StructuredAnalysisItem[];
  concepts: StructuredAnalysisItem[];
  claims: StructuredAnalysisItem[];
  contradictions: StructuredAnalysisItem[];
  relationships: StructuredAnalysisRelationship[];
}

export interface StructuredGeneratedDraft {
  title: string;
  page_type: string;
  markdown: string;
  frontmatter: Record<string, unknown>;
  source_refs: StructuredSourceRef[];
  locator_refs: string[];
  relationship_candidates: Record<string, unknown>[];
  confidence: number | null;
}

export interface StructuredGenerationOutput {
  drafts: StructuredGeneratedDraft[];
}

export interface StructuredMergeOutput {
  merge_summary: string;
  markdown: string;
  frontmatter: Record<string, unknown>;
  source_refs: StructuredSourceRef[];
  locator_refs: string[];
  confidence: number | null;
}

export function parseAnalysisOutput(content: string): StructuredAnalysisOutput {
  const value = normalizeAnalysisOutputValue(parseStructuredJsonObject(content));
  const issues: string[] = [];
  const output: StructuredAnalysisOutput = {
    entities: readAnalysisItems(value, "entities", issues),
    concepts: readAnalysisItems(value, "concepts", issues),
    claims: readAnalysisItems(value, "claims", issues),
    contradictions: readAnalysisItems(value, "contradictions", issues),
    relationships: readRelationships(value, issues),
  };

  throwIfIssues(issues);

  return output;
}

export function parseGenerationOutput(content: string): StructuredGenerationOutput {
  const value = normalizeGenerationOutputValue(parseStructuredJsonObject(content));
  const issues: string[] = [];
  const output: StructuredGenerationOutput = {
    drafts: readDrafts(value, issues),
  };

  if (output.drafts.length === 0) {
    issues.push("drafts must include at least one candidate");
  }

  throwIfIssues(issues);

  return output;
}

export function parseMergeOutput(content: string): StructuredMergeOutput {
  const value = parseStructuredJsonObject(content);
  const issues: string[] = [];
  const output: StructuredMergeOutput = {
    merge_summary: readRequiredString(value, "merge_summary", issues),
    markdown: readRequiredString(value, "markdown", issues),
    frontmatter: readObject(value.frontmatter),
    source_refs: readSourceRefs(value, "source_refs", issues),
    locator_refs: readStringArray(value.locator_refs),
    confidence: readNullableNumber(value.confidence),
  };

  if (output.source_refs.length === 0) {
    issues.push("source_refs must include at least one source");
  }

  throwIfIssues(issues);

  return output;
}

export function parseStructuredJsonObject(content: string): Record<string, unknown> {
  const jsonCandidates = extractJsonTextCandidates(content);
  let parsedNonObject = false;

  for (const jsonText of jsonCandidates) {
    try {
      const parsed = JSON.parse(jsonText) as unknown;

      if (!isRecord(parsed)) {
        parsedNonObject = true;
        continue;
      }

      return parsed;
    } catch {
      continue;
    }
  }

  if (parsedNonObject) {
    throw new StructuredOutputValidationError(["output must be a JSON object"]);
  }

  throw new StructuredOutputValidationError(["output must be valid JSON"]);
}

const analysisCollectionKeys = [
  "entities",
  "concepts",
  "claims",
  "contradictions",
  "relationships",
] as const;

type AnalysisCollectionKey = (typeof analysisCollectionKeys)[number];

const analysisCollectionAliases: Record<AnalysisCollectionKey, readonly string[]> = {
  entities: ["entities", "named_entities", "key_entities", "entity"],
  concepts: ["concepts", "topics", "topic", "concept"],
  claims: ["claims", "evidence", "facts", "insights", "claim"],
  contradictions: ["contradictions", "conflicts", "conflict"],
  relationships: ["relationships", "relations", "relationship", "edges", "links"],
};

const analysisEnvelopeKeys = [
  "analysis",
  "analysis_result",
  "analysisResult",
  "structured_analysis",
  "structuredAnalysis",
  "structured_output",
  "structuredOutput",
  "json",
  "payload",
  "result",
  "output",
  "data",
  "response",
  "content",
] as const;

const generationEnvelopeKeys = [
  "answer",
  "final",
  "final_answer",
  "finalAnswer",
  "message",
  "body",
  "data",
  "result",
  "response",
  "output",
  "content",
  "generation",
  "wiki_generation",
  "structured_output",
  "structuredOutput",
  "json",
  "payload",
] as const;

const generationDraftAliases = [
  "drafts",
  "pages",
  "candidates",
  "draft_candidates",
  "draftCandidates",
  "candidate_pages",
  "candidatePages",
  "page_drafts",
  "pageDrafts",
  "generated_drafts",
  "generatedDrafts",
  "generated_pages",
  "generatedPages",
  "wiki_drafts",
  "wikiDrafts",
  "wiki_draft_candidates",
  "wikiDraftCandidates",
  "wiki_page_drafts",
  "wikiPageDrafts",
  "wiki_page_candidates",
  "wikiPageCandidates",
  "wiki_pages",
  "wikiPages",
  "results",
  "items",
] as const;

const generationSingleDraftAliases = [
  "draft",
  "draftCandidate",
  "generated_draft",
  "generatedDraft",
  "page",
  "wiki_draft",
  "wikiDraft",
  "wiki_page",
  "wikiPage",
] as const;

function readAnalysisItems(
  value: Record<string, unknown>,
  key: string,
  issues: string[],
): StructuredAnalysisItem[] {
  return readRecordArray(value[key], key, issues).map((item, index) => ({
    title: readRequiredString(item, `${key}[${index}].title`, issues),
    summary: readOptionalString(item.summary),
    source_refs: readSourceRefs(item, `${key}[${index}].source_refs`, issues),
    locator_refs: readStringArray(item.locator_refs),
    metadata: readObject(item.metadata),
  }));
}

function normalizeAnalysisOutputValue(value: Record<string, unknown>): Record<string, unknown> {
  const directValue = findAnalysisOutputValue(value, 0);

  return directValue === null ? value : normalizeAnalysisCollections(directValue);
}

function findAnalysisOutputValue(
  value: Record<string, unknown>,
  depth: number,
): Record<string, unknown> | null {
  if (hasAnalysisCollectionFields(value)) {
    return value;
  }

  if (depth >= 3) {
    return null;
  }

  for (const key of analysisEnvelopeKeys) {
    const nested = readNestedStructuredRecord(value[key]);

    if (nested === null) {
      continue;
    }

    const nestedAnalysis = findAnalysisOutputValue(nested, depth + 1);

    if (nestedAnalysis !== null) {
      return nestedAnalysis;
    }
  }

  return null;
}

function hasAnalysisCollectionFields(value: Record<string, unknown>): boolean {
  return analysisCollectionKeys.every((key) =>
    isRecoverableAnalysisCollection(resolveAnalysisCollectionValue(value, key)),
  );
}

function readRelationships(
  value: Record<string, unknown>,
  issues: string[],
): StructuredAnalysisRelationship[] {
  return readRecordArray(value.relationships, "relationships", issues).map((item, index) => ({
    from_title: readRequiredString(item, `relationships[${index}].from_title`, issues),
    to_title: readRequiredString(item, `relationships[${index}].to_title`, issues),
    relation_type: readRequiredString(item, `relationships[${index}].relation_type`, issues),
    evidence: readOptionalString(item.evidence),
    source_refs: readSourceRefs(item, `relationships[${index}].source_refs`, issues),
    locator_refs: readStringArray(item.locator_refs),
  }));
}

function normalizeAnalysisCollections(value: Record<string, unknown>): Record<string, unknown> {
  const normalized = cloneJsonObject(value);

  for (const key of analysisCollectionKeys) {
    const collection = resolveAnalysisCollectionValue(value, key);

    if (collection === undefined) {
      delete normalized[key];
      continue;
    }

    normalized[key] = normalizeAnalysisCollection(collection, key);
  }

  return normalized;
}

function resolveAnalysisCollectionValue(
  value: Record<string, unknown>,
  key: AnalysisCollectionKey,
): unknown {
  for (const alias of analysisCollectionAliases[key]) {
    if (Object.hasOwn(value, alias)) {
      return value[alias];
    }
  }

  return undefined;
}

function isRecoverableAnalysisCollection(value: unknown): boolean {
  if (Array.isArray(value)) {
    return true;
  }

  if (!isRecord(value)) {
    return false;
  }

  if (Object.keys(value).length === 0) {
    return true;
  }

  if (isSingleAnalysisCollectionItem(value)) {
    return true;
  }

  const wrapped = readWrappedCollection(value);

  if (wrapped !== null) {
    return true;
  }

  const grouped = readGroupedCollection(value);

  if (grouped !== null) {
    return true;
  }

  const entries = Object.entries(value);

  return entries.length > 0 && entries.every(([, item]) => isRecord(item));
}

function normalizeAnalysisCollection(
  value: unknown,
  key: AnalysisCollectionKey,
): unknown[] | unknown {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeAnalysisCollectionItem(item, key));
  }

  if (!isRecord(value)) {
    return value;
  }

  if (isSingleAnalysisCollectionItem(value)) {
    return [normalizeAnalysisCollectionItem(value, key)];
  }

  const wrapped = readWrappedCollection(value);

  if (wrapped !== null) {
    return wrapped.map((item) => normalizeAnalysisCollectionItem(item, key));
  }

  const grouped = readGroupedCollection(value);

  if (grouped !== null) {
    return grouped.map((item) => normalizeAnalysisCollectionItem(item, key));
  }

  const entries = Object.entries(value);

  if (entries.length === 0) {
    return [];
  }

  if (!entries.every(([, item]) => isRecord(item))) {
    return value;
  }

  return entries.map(([title, item]) => {
    if (!isRecord(item)) {
      return {};
    }

    return normalizeMappedAnalysisCollectionItem(title, item, key);
  });
}

function normalizeMappedAnalysisCollectionItem(
  title: string,
  item: Record<string, unknown>,
  key: AnalysisCollectionKey,
): Record<string, unknown> {
  const normalized = normalizeAnalysisCollectionItem(item, key);

  if (key !== "relationships" && typeof normalized.title !== "string") {
    normalized.title = title;
  }

  return normalized;
}

function normalizeAnalysisCollectionItem(
  item: unknown,
  key: AnalysisCollectionKey,
): Record<string, unknown> {
  if (!isRecord(item)) {
    return {};
  }

  const normalized = cloneJsonObject(item);

  if (key === "relationships") {
    copyStringAlias(normalized, "from_title", ["from", "source", "fromTitle"]);
    copyStringAlias(normalized, "to_title", ["to", "target", "toTitle"]);
    copyStringAlias(normalized, "relation_type", [
      "type",
      "relation",
      "relationship_type",
      "relationshipType",
    ]);
  }

  return normalized;
}

function readWrappedCollection(value: Record<string, unknown>): unknown[] | null {
  for (const key of ["items", "values", "entries", "results", "data"]) {
    const wrapped = value[key];

    if (Array.isArray(wrapped)) {
      return wrapped;
    }
  }

  return null;
}

function readGroupedCollection(value: Record<string, unknown>): unknown[] | null {
  const entries = Object.entries(value);

  if (entries.length === 0) {
    return [];
  }

  const items: unknown[] = [];

  for (const [, entryValue] of entries) {
    if (Array.isArray(entryValue)) {
      items.push(...entryValue);
      continue;
    }

    if (!isRecord(entryValue)) {
      return null;
    }

    const wrapped = readWrappedCollection(entryValue);

    if (wrapped !== null) {
      items.push(...wrapped);
      continue;
    }

    if (isSingleAnalysisCollectionItem(entryValue)) {
      items.push(entryValue);
      continue;
    }

    return null;
  }

  return items;
}

function isSingleAnalysisCollectionItem(value: Record<string, unknown>): boolean {
  return (
    typeof value.title === "string" ||
    typeof value.from_title === "string" ||
    typeof value.from === "string" ||
    typeof value.source === "string"
  );
}

function copyStringAlias(
  value: Record<string, unknown>,
  targetKey: string,
  aliases: readonly string[],
): void {
  if (typeof value[targetKey] === "string") {
    return;
  }

  for (const alias of aliases) {
    if (typeof value[alias] === "string") {
      value[targetKey] = value[alias];
      return;
    }
  }
}

function normalizeGenerationOutputValue(value: Record<string, unknown>): Record<string, unknown> {
  const directValue = findGenerationOutputValue(value, 0);

  if (directValue === null) {
    return value;
  }

  const normalized = cloneJsonObject(directValue);
  const drafts = resolveGenerationDraftCollection(directValue);

  if (drafts !== undefined) {
    normalized.drafts = drafts.single ? [drafts.value] : drafts.value;
  } else if (looksLikeGenerationDraftShape(directValue)) {
    normalized.drafts = [directValue];
  }

  return normalized;
}

function findGenerationOutputValue(
  value: Record<string, unknown>,
  depth: number,
): Record<string, unknown> | null {
  if (hasGenerationDraftField(value) || looksLikeGenerationDraftShape(value)) {
    return value;
  }

  if (depth >= 3) {
    return null;
  }

  for (const key of generationEnvelopeKeys) {
    const nested = readNestedStructuredRecord(value[key]);

    if (nested === null) {
      continue;
    }

    const nestedGeneration = findGenerationOutputValue(nested, depth + 1);

    if (nestedGeneration !== null) {
      return nestedGeneration;
    }
  }

  return null;
}

function hasGenerationDraftField(value: Record<string, unknown>): boolean {
  return resolveGenerationDraftCollection(value) !== undefined;
}

function resolveGenerationDraftCollection(
  value: Record<string, unknown>,
): { value: unknown; single: boolean } | undefined {
  for (const alias of generationDraftAliases) {
    if (Object.hasOwn(value, alias)) {
      const draftValue = value[alias];

      return { value: draftValue, single: isRecord(draftValue) };
    }
  }

  for (const alias of generationSingleDraftAliases) {
    if (Object.hasOwn(value, alias)) {
      return { value: value[alias], single: true };
    }
  }

  return undefined;
}

function looksLikeGenerationDraftShape(value: Record<string, unknown>): boolean {
  if (typeof value.markdown !== "string" || value.markdown.trim().length === 0) {
    return false;
  }

  const signals = [
    typeof value.title === "string" && value.title.trim().length > 0,
    typeof value.page_type === "string" && value.page_type.trim().length > 0,
    isRecord(value.frontmatter),
    Array.isArray(value.source_refs),
    Array.isArray(value.locator_refs),
    Array.isArray(value.relationship_candidates),
  ].filter(Boolean).length;

  return signals >= 3;
}

function readNestedStructuredRecord(value: unknown): Record<string, unknown> | null {
  if (isRecord(value)) {
    return value;
  }

  if (typeof value !== "string") {
    return null;
  }

  try {
    return parseStructuredJsonObject(value);
  } catch {
    return null;
  }
}

function readDrafts(value: Record<string, unknown>, issues: string[]): StructuredGeneratedDraft[] {
  return readRecordArray(value.drafts, "drafts", issues).map((item, index) => ({
    title: readRequiredString(item, `drafts[${index}].title`, issues),
    page_type: readRequiredString(item, `drafts[${index}].page_type`, issues),
    markdown: readRequiredString(item, `drafts[${index}].markdown`, issues),
    frontmatter: readObject(item.frontmatter),
    source_refs: readSourceRefs(item, `drafts[${index}].source_refs`, issues),
    locator_refs: readStringArray(item.locator_refs),
    relationship_candidates: readOptionalRecordArray(item.relationship_candidates),
    confidence: readNullableNumber(item.confidence),
  }));
}

function readSourceRefs(
  value: Record<string, unknown>,
  key: string,
  issues: string[],
  optional = false,
): StructuredSourceRef[] {
  const fieldName = key.split(".").at(-1) ?? key;

  return readRecordArray(value[fieldName], key, issues, optional).map((item, index) => {
    const sourceRef: StructuredSourceRef = {
      document_id: readRequiredString(item, `${key}[${index}].document_id`, issues),
    };
    const parsedContentId = readOptionalString(item.parsed_content_id);
    const sourceAnchorId = readOptionalString(item.source_anchor_id);

    if (parsedContentId !== null) {
      sourceRef.parsed_content_id = parsedContentId;
    }
    if (sourceAnchorId !== null) {
      sourceRef.source_anchor_id = sourceAnchorId;
    }
    const locator = readOptionalString(item.locator);

    if (locator !== null) {
      sourceRef.locator = locator;
    }
    const mediaAssetId = readOptionalString(item.media_asset_id);
    const evidenceKind = readOptionalString(item.evidence_kind);
    const validMediaAssetId =
      mediaAssetId !== null && isMediaAssetId(mediaAssetId) ? mediaAssetId : null;

    if (validMediaAssetId !== null) {
      sourceRef.media_asset_id = validMediaAssetId;
    }
    if (evidenceKind === "image_caption") {
      if (validMediaAssetId !== null) {
        sourceRef.evidence_kind = evidenceKind;
      }
    } else if (evidenceKind === "text" || evidenceKind === "ocr") {
      sourceRef.evidence_kind = evidenceKind;
    }
    const locatorStatus = readOptionalString(item.locator_status);

    if (
      locatorStatus === "resolved" ||
      locatorStatus === "not_provided" ||
      locatorStatus === "not_found" ||
      locatorStatus === "ambiguous" ||
      locatorStatus === "unsupported"
    ) {
      sourceRef.locator_status = locatorStatus;
    }
    const warningCodes = readStringArray(item.warning_codes);

    if (warningCodes.length > 0) {
      sourceRef.warning_codes = warningCodes;
    }

    return sourceRef;
  });
}

function readRecordArray(
  value: unknown,
  key: string,
  issues: string[],
  optional = false,
): Record<string, unknown>[] {
  if (value === undefined && optional) {
    return [];
  }
  if (!Array.isArray(value)) {
    issues.push(`${key} must be an array`);
    return [];
  }

  return value.flatMap((item, index) => {
    if (!isRecord(item)) {
      issues.push(`${key}[${index}] must be an object`);
      return [];
    }

    return [item];
  });
}

function readOptionalRecordArray(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(isRecord).map((item) => cloneJsonObject(item));
}

function readRequiredString(value: Record<string, unknown>, key: string, issues: string[]): string {
  const fieldName = key.split(".").at(-1) ?? key;
  const raw = value[fieldName];

  if (typeof raw === "string" && raw.trim().length > 0) {
    return raw.trim();
  }

  issues.push(`${key} must be a non-empty string`);

  return "";
}

function readOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function isMediaAssetId(value: string): boolean {
  return /^med_[A-Za-z0-9_-]+$/u.test(value);
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string" && item.length > 0);
}

function readNullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readObject(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    return {};
  }

  return cloneJsonObject(value);
}

function cloneJsonObject(value: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

function extractJsonTextCandidates(content: string): string[] {
  const trimmed = content.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/iu);
  const candidates: string[] = [];

  if (fenced?.[1] !== undefined) {
    candidates.push(fenced[1].trim());
  }

  for (const match of trimmed.matchAll(/```(?:json)?\s*([\s\S]*?)\s*```/giu)) {
    if (match[1] !== undefined) {
      candidates.push(match[1].trim());
    }
  }

  for (let index = 0; index < trimmed.length; index += 1) {
    if (trimmed[index] !== "{") {
      continue;
    }

    const balanced = extractBalancedJsonObject(trimmed, index);
    if (balanced !== null) {
      candidates.push(balanced);
    }
  }

  candidates.push(trimmed);

  return [...new Set(candidates.filter((candidate) => candidate.length > 0))];
}

function extractBalancedJsonObject(content: string, startIndex: number): string | null {
  let depth = 0;
  let escaped = false;
  let inString = false;

  for (let index = startIndex; index < content.length; index += 1) {
    const character = content[index];

    if (character === undefined) {
      continue;
    }

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (character === "\\") {
        escaped = true;
        continue;
      }
      if (character === '"') {
        inString = false;
      }
      continue;
    }

    if (character === '"') {
      inString = true;
      continue;
    }

    if (character === "{") {
      depth += 1;
      continue;
    }

    if (character !== "}") {
      continue;
    }

    depth -= 1;

    if (depth === 0) {
      return content.slice(startIndex, index + 1).trim();
    }
  }

  return null;
}

function throwIfIssues(issues: readonly string[]): void {
  if (issues.length > 0) {
    throw new StructuredOutputValidationError(issues);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
