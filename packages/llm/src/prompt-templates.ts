import { createHash } from "node:crypto";

import type { ChatModelPurpose } from "./index.js";
import { analysisOutputContract, generationDraftOutputContract } from "./structured-json.js";

export const promptPurposes = [
  "analysis",
  "generation",
  "merge",
  "vision_caption",
  "knowledge_check",
  "wiki_draft",
] as const;

export type PromptPurpose = (typeof promptPurposes)[number];
export type PromptTemplateMode = "built_in" | "custom_instructions" | "override_template";

export interface DatasetPromptTemplateValue extends Record<string, unknown> {
  mode: PromptTemplateMode;
  built_in_prompt_id: string;
  custom_instructions: string | null;
  override_template: string | null;
  updated_at?: string | null;
}

export type DatasetPromptTemplateValues = Record<PromptPurpose, DatasetPromptTemplateValue> &
  Record<string, unknown>;

export interface PromptVersionRecord {
  id: string;
  purpose: PromptPurpose;
  version: string;
  modelPurpose: ChatModelPurpose;
  name: string;
  template: string;
}

export interface ResolvedDatasetPromptTemplate {
  prompt: PromptVersionRecord;
  metadata: {
    prompt_purpose: PromptPurpose;
    prompt_mode: PromptTemplateMode;
    built_in_prompt_id: string;
    effective_prompt_version: string;
    effective_prompt_hash: string;
    dataset_configuration_snapshot_id: string | null;
  };
}

export class PromptTemplateValidationError extends Error {
  readonly fields: string[];

  constructor(fields: readonly string[], message = "Prompt template validation failed.") {
    super(message);
    this.name = "PromptTemplateValidationError";
    this.fields = [...fields];
  }
}

export const builtInPromptVersionRecords: readonly PromptVersionRecord[] = [
  {
    id: "analysis@0.1.0",
    purpose: "analysis",
    version: "0.1.0",
    modelPurpose: "analysis",
    name: "Source analysis",
    template:
      "Analyze source material into the canonical top-level arrays entities, concepts, claims, contradictions, and relationships with source traceability.",
  },
  {
    id: "generation@0.1.0",
    purpose: "generation",
    version: "0.1.0",
    modelPurpose: "generation",
    name: "Wiki generation",
    template:
      "Generate traceable Wiki pages and relationship candidates from analyzed source material using the canonical top-level non-empty drafts array contract.",
  },
  {
    id: "merge@0.1.0",
    purpose: "merge",
    version: "0.1.0",
    modelPurpose: "merge",
    name: "Page merge",
    template:
      "Merge a Wiki Draft into an existing page while preserving page identity and source traceability.",
  },
  {
    id: "vision_caption@0.1.0",
    purpose: "vision_caption",
    version: "0.1.0",
    modelPurpose: "analysis",
    name: "Image caption",
    template:
      "Describe visible image content factually for source-grounded Wiki compilation without speculation.",
  },
  {
    id: "knowledge_check@0.1.0",
    purpose: "knowledge_check",
    version: "0.1.0",
    modelPurpose: "analysis",
    name: "Knowledge check",
    template:
      "Check Wiki quality for orphan pages, broken links, missing pages, missing sources, duplicates, and contradictions.",
  },
  {
    id: "wiki_draft@0.1.0",
    purpose: "wiki_draft",
    version: "0.1.0",
    modelPurpose: "generation",
    name: "Wiki Draft compilation",
    template:
      "Compile externally confirmed knowledge notes into schema-compatible Wiki change candidates.",
  },
];

export function createDefaultDatasetPromptTemplates(): DatasetPromptTemplateValues {
  const entries = promptPurposes.map((purpose) => {
    const builtIn = getBuiltInPromptVersion(purpose);

    return [
      purpose,
      {
        mode: "built_in",
        built_in_prompt_id: builtIn.id,
        custom_instructions: null,
        override_template: null,
      } satisfies DatasetPromptTemplateValue,
    ] as const;
  });

  return Object.fromEntries(entries) as DatasetPromptTemplateValues;
}

export function normalizeDatasetPromptTemplates(value: unknown): DatasetPromptTemplateValues {
  const defaults = createDefaultDatasetPromptTemplates();

  if (value === undefined || value === null) {
    return defaults;
  }
  if (!isRecord(value)) {
    throw new PromptTemplateValidationError(["prompt_templates"]);
  }

  const supportedPurposes = new Set<string>(promptPurposes);
  const invalidPurposes = Object.keys(value).filter((key) => !supportedPurposes.has(key));

  if (invalidPurposes.length > 0) {
    throw new PromptTemplateValidationError(
      invalidPurposes.map((purpose) => `prompt_templates.${purpose}`),
    );
  }

  const normalized: Partial<DatasetPromptTemplateValues> = {};

  for (const purpose of promptPurposes) {
    normalized[purpose] = normalizeDatasetPromptTemplateValue(
      purpose,
      value[purpose],
      defaults[purpose],
    );
  }

  return normalized as DatasetPromptTemplateValues;
}

export function resolveDatasetPromptTemplate(input: {
  purpose: PromptPurpose;
  promptTemplates?: unknown;
  datasetConfigurationSnapshotId?: string | null;
}): ResolvedDatasetPromptTemplate {
  const templates = normalizeDatasetPromptTemplates(input.promptTemplates);
  const config = templates[input.purpose];
  const builtIn = getBuiltInPromptVersion(input.purpose);
  const effectivePrompt = createEffectivePrompt(builtIn, config);
  const hash = createPromptHash(effectivePrompt);
  const hashSuffix = hash.replace("sha256:", "").slice(0, 12);
  const effectivePromptVersion =
    config.mode === "built_in"
      ? builtIn.id
      : `${builtIn.purpose}@${builtIn.version}+sha256.${hashSuffix}`;

  return {
    prompt: {
      ...builtIn,
      id: effectivePromptVersion,
      version:
        config.mode === "built_in" ? builtIn.version : `${builtIn.version}+sha256.${hashSuffix}`,
      template: effectivePrompt,
    },
    metadata: {
      prompt_purpose: input.purpose,
      prompt_mode: config.mode,
      built_in_prompt_id: config.built_in_prompt_id,
      effective_prompt_version: effectivePromptVersion,
      effective_prompt_hash: hash,
      dataset_configuration_snapshot_id: input.datasetConfigurationSnapshotId ?? null,
    },
  };
}

export function resolveDatasetPromptTemplateFromSnapshot(input: {
  purpose: PromptPurpose;
  datasetConfigurationSnapshot?: unknown;
}): ResolvedDatasetPromptTemplate {
  const snapshot = isRecord(input.datasetConfigurationSnapshot)
    ? input.datasetConfigurationSnapshot
    : {};
  const values = snapshot !== null && isRecord(snapshot.values) ? snapshot.values : {};
  const snapshotId =
    typeof snapshot.id === "string"
      ? snapshot.id
      : typeof snapshot.dataset_configuration_snapshot_id === "string"
        ? snapshot.dataset_configuration_snapshot_id
        : null;

  return resolveDatasetPromptTemplate({
    purpose: input.purpose,
    promptTemplates: values.prompt_templates,
    datasetConfigurationSnapshotId: snapshotId,
  });
}

export function getBuiltInPromptVersion(purpose: PromptPurpose): PromptVersionRecord {
  const record = builtInPromptVersionRecords.find(
    (promptVersion) => promptVersion.purpose === purpose,
  );

  if (record === undefined) {
    throw new Error(`Built-in Prompt Version not found: ${purpose}`);
  }

  return clonePromptVersionRecord(record);
}

function normalizeDatasetPromptTemplateValue(
  purpose: PromptPurpose,
  value: unknown,
  fallback: DatasetPromptTemplateValue,
): DatasetPromptTemplateValue {
  if (value === undefined || value === null) {
    return { ...fallback };
  }
  if (!isRecord(value)) {
    throw new PromptTemplateValidationError([`prompt_templates.${purpose}`]);
  }

  rejectForbiddenPromptTemplateFields(value, `prompt_templates.${purpose}`);

  const builtIn = getBuiltInPromptVersion(purpose);
  const mode = readPromptTemplateMode(value.mode, `prompt_templates.${purpose}.mode`);
  const builtInPromptId =
    value.built_in_prompt_id === undefined
      ? builtIn.id
      : (readStringOrNull(
          value.built_in_prompt_id,
          `prompt_templates.${purpose}.built_in_prompt_id`,
        ) ?? builtIn.id);

  if (builtInPromptId !== builtIn.id) {
    throw new PromptTemplateValidationError([`prompt_templates.${purpose}.built_in_prompt_id`]);
  }

  const customInstructions = readStringOrNull(
    value.custom_instructions,
    `prompt_templates.${purpose}.custom_instructions`,
  );
  const overrideTemplate = readStringOrNull(
    value.override_template,
    `prompt_templates.${purpose}.override_template`,
  );
  const updatedAt = readStringOrNull(value.updated_at, `prompt_templates.${purpose}.updated_at`);

  if (customInstructions !== null && customInstructions.length > 12000) {
    throw new PromptTemplateValidationError([`prompt_templates.${purpose}.custom_instructions`]);
  }
  if (overrideTemplate !== null && overrideTemplate.length > 24000) {
    throw new PromptTemplateValidationError([`prompt_templates.${purpose}.override_template`]);
  }
  if (mode === "override_template") {
    validateOverridePromptTemplate(purpose, overrideTemplate);
  }

  return {
    mode,
    built_in_prompt_id: builtInPromptId,
    custom_instructions: mode === "custom_instructions" ? customInstructions : null,
    override_template: mode === "override_template" ? overrideTemplate : null,
    ...(updatedAt === null ? {} : { updated_at: updatedAt }),
  };
}

function createEffectivePrompt(
  builtIn: PromptVersionRecord,
  config: DatasetPromptTemplateValue,
): string {
  if (config.mode === "override_template") {
    validateOverridePromptTemplate(builtIn.purpose, config.override_template);

    return config.override_template ?? "";
  }

  const lockedContract = [
    `Built-in prompt ${builtIn.id}: ${builtIn.template}`,
    "Required contract: preserve source traceability, do not make unsupported claims, and follow the structured output contract for this workflow.",
    createPurposeContract(builtIn.purpose),
  ].join("\n");

  if (config.mode === "custom_instructions" && config.custom_instructions !== null) {
    return [lockedContract, "Administrator instructions:", config.custom_instructions.trim()].join(
      "\n\n",
    );
  }

  return lockedContract;
}

function createPurposeContract(purpose: PromptPurpose): string {
  if (purpose === "analysis") {
    return analysisOutputContract;
  }
  if (purpose === "generation") {
    return generationDraftOutputContract;
  }
  if (purpose === "merge") {
    return "Merge contract: preserve page identity, source references, and existing verified content unless the draft supplies sourced updates.";
  }
  if (purpose === "vision_caption") {
    return "Vision caption contract: describe visible image facts only and avoid speculation.";
  }
  if (purpose === "knowledge_check") {
    return "Knowledge Check contract: return findings with source evidence, severity, and actionable guidance.";
  }

  return "Wiki draft contract: compile externally confirmed notes into source-traceable Wiki candidates.";
}

function validateOverridePromptTemplate(purpose: PromptPurpose, value: string | null): void {
  if (value === null || value.trim().length === 0) {
    throw new PromptTemplateValidationError([`prompt_templates.${purpose}.override_template`]);
  }

  const lower = value.toLowerCase();
  const requiredTerms = getRequiredOverrideTerms(purpose);
  const hasEveryRequiredTerm = requiredTerms.every((termGroup) =>
    termGroup.some((term) => lower.includes(term)),
  );

  if (!hasEveryRequiredTerm) {
    throw new PromptTemplateValidationError([`prompt_templates.${purpose}.override_template`]);
  }
}

function getRequiredOverrideTerms(purpose: PromptPurpose): string[][] {
  const common = [["source"], ["trace", "citation", "evidence"], ["unsupported", "factual"]];

  if (purpose === "analysis") {
    return [
      ...common,
      ["json"],
      ["entities"],
      ["concepts"],
      ["claims"],
      ["contradictions"],
      ["relationships"],
      ["title"],
      ["summary"],
      ["source_refs"],
      ["locator_refs"],
      ["metadata"],
      ["from_title"],
      ["to_title"],
      ["relation_type"],
      ["evidence"],
    ];
  }
  if (purpose === "generation") {
    return [
      ...common,
      ["json"],
      ["wiki"],
      ["drafts"],
      ["title"],
      ["page_type"],
      ["markdown"],
      ["frontmatter"],
      ["source_refs"],
      ["locator_refs"],
      ["relationship_candidates"],
      ["confidence"],
    ];
  }
  if (purpose === "merge") {
    return [...common, ["preserve"], ["merge"]];
  }
  if (purpose === "vision_caption") {
    return [["image"], ["visible", "fact"], ["unsupported", "speculation"]];
  }
  if (purpose === "knowledge_check") {
    return [...common, ["finding"], ["severity"]];
  }

  return [...common, ["wiki"], ["source_refs"]];
}

function createPromptHash(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function readPromptTemplateMode(value: unknown, field: string): PromptTemplateMode {
  if (value === "built_in" || value === "custom_instructions" || value === "override_template") {
    return value;
  }

  throw new PromptTemplateValidationError([field]);
}

function readStringOrNull(value: unknown, field: string): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== "string") {
    throw new PromptTemplateValidationError([field]);
  }

  const trimmed = value.trim();

  return trimmed.length === 0 ? null : trimmed;
}

function rejectForbiddenPromptTemplateFields(value: Record<string, unknown>, prefix: string): void {
  const forbidden = [
    "api_key",
    "apikey",
    "secret",
    "password",
    "provider_api_key",
    "base_url",
    "service_endpoint",
    "service_base_url",
  ];
  const fields = Object.keys(value).filter((key) => forbidden.includes(key.toLowerCase()));

  if (fields.length > 0) {
    throw new PromptTemplateValidationError(fields.map((field) => `${prefix}.${field}`));
  }
}

function clonePromptVersionRecord(record: PromptVersionRecord): PromptVersionRecord {
  return { ...record };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
