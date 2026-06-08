import { createDefaultDatasetPromptTemplates } from "@fococontext/llm";

import type {
  DatasetConfigurationValues,
  JsonObject,
  KnowledgeBaseOutputLanguage,
  KnowledgeBaseTemplate,
  SystemPageType,
} from "./knowledge-base.types.js";

export const knowledgeBaseTemplateIds = [
  "general",
  "research",
  "team_knowledge",
] as const satisfies readonly KnowledgeBaseTemplate[];

export interface KnowledgeBaseTemplateDefinition {
  id: KnowledgeBaseTemplate;
  name: string;
  description: string;
  purpose: string;
  schema: JsonObject;
  retrieval: JsonObject;
  dataset_configuration: DatasetConfigurationValues & {
    preset_id: KnowledgeBaseTemplate;
    validation: JsonObject;
  };
  system_pages: readonly SystemPageType[];
}

const systemPages: readonly SystemPageType[] = ["index", "overview", "log", "purpose", "schema"];

const basePageTypes = [
  {
    type: "source",
    directory: "wiki/sources",
    purpose: "Source summary and traceable evidence.",
  },
  {
    type: "entity",
    directory: "wiki/entities",
    purpose: "Named people, organizations, tools, datasets, and systems.",
  },
  {
    type: "concept",
    directory: "wiki/concepts",
    purpose: "Reusable ideas, terms, frameworks, and techniques.",
  },
  {
    type: "synthesis",
    directory: "wiki/synthesis",
    purpose: "Cross-source summaries and conclusions.",
  },
];

const baseRetrieval = {
  mode: "hybrid",
  top_k: 10,
  vector_retrieval: {
    enabled: true,
  },
  graph_expansion: {
    enabled: true,
    depth: 1,
    budget_ratio: 0.21,
  },
  context_budget_tokens: 4000,
  include_trace_by_default: false,
  media_evidence: {
    enabled: true,
    max_items: 12,
    budget_ratio: 0.05,
  },
};

const baseMarkdownContract = {
  frontmatter_required: true,
  wikilinks_enabled: true,
  source_refs_required: true,
  export_format: "markdown",
};

const baseSourceLifecycle = {
  delete_policy: "preview_required",
  reingest_policy: "new_snapshot",
};

const baseKnowledgeCheck = {
  default_checks: ["missing_source_refs", "dead_wikilinks"],
};

const baseSourceWatch = {
  supported_kinds: ["mounted_directory"],
  default_kind: "mounted_directory",
  unsupported_kinds: ["s3_prefix", "url_list", "git_repo"],
};

const baseOcrPolicy = {
  mode: "auto",
  max_pages_per_document: null,
  min_text_chars_per_page: null,
};

const baseDatasetValidation = {
  required_sections: [
    "purpose",
    "schema",
    "markdown_contract",
    "retrieval",
    "source_lifecycle",
    "knowledge_check",
    "source_watch",
    "ocr_policy",
    "prompt_templates",
  ],
  env_secrets_allowed: false,
};

const templates: readonly KnowledgeBaseTemplateDefinition[] = [
  {
    id: "general",
    name: "General",
    description: "A balanced Wiki-first template for general project knowledge.",
    purpose:
      "General knowledge base. Preserve source-backed facts, reusable concepts, named entities, and synthesis pages for retrieval.",
    schema: {
      page_types: basePageTypes,
      wikilink_style: "[[page-slug]]",
      required_system_pages: systemPages,
    },
    retrieval: baseRetrieval,
    dataset_configuration: createDatasetConfigurationTemplate({
      presetId: "general",
      purpose:
        "General knowledge base. Preserve source-backed facts, reusable concepts, named entities, and synthesis pages for retrieval.",
      schema: {
        page_types: basePageTypes,
        wikilink_style: "[[page-slug]]",
        required_system_pages: systemPages,
      },
      retrieval: baseRetrieval,
      outputLanguage: "en-US",
    }),
    system_pages: systemPages,
  },
  {
    id: "research",
    name: "Research",
    description: "A research template for questions, evidence, findings, and synthesis.",
    purpose:
      "Research knowledge base. Track questions, sources, findings, methods, contradictions, and evolving synthesis with source traceability.",
    schema: {
      page_types: [
        ...basePageTypes,
        {
          type: "question",
          directory: "wiki/questions",
          purpose: "Open research questions and investigation threads.",
        },
        {
          type: "finding",
          directory: "wiki/findings",
          purpose: "Evidence-backed observations and results.",
        },
        {
          type: "method",
          directory: "wiki/methods",
          purpose: "Research methods, protocols, and evaluation notes.",
        },
      ],
      wikilink_style: "[[page-slug]]",
      required_system_pages: systemPages,
    },
    retrieval: baseRetrieval,
    dataset_configuration: createDatasetConfigurationTemplate({
      presetId: "research",
      purpose:
        "Research knowledge base. Track questions, sources, findings, methods, contradictions, and evolving synthesis with source traceability.",
      schema: {
        page_types: [
          ...basePageTypes,
          {
            type: "question",
            directory: "wiki/questions",
            purpose: "Open research questions and investigation threads.",
          },
          {
            type: "finding",
            directory: "wiki/findings",
            purpose: "Evidence-backed observations and results.",
          },
          {
            type: "method",
            directory: "wiki/methods",
            purpose: "Research methods, protocols, and evaluation notes.",
          },
        ],
        wikilink_style: "[[page-slug]]",
        required_system_pages: systemPages,
      },
      retrieval: baseRetrieval,
      outputLanguage: "en-US",
    }),
    system_pages: systemPages,
  },
  {
    id: "team_knowledge",
    name: "Team Knowledge",
    description: "A team template for meetings, decisions, projects, and stakeholders.",
    purpose:
      "Team Knowledge base. Preserve decisions, meetings, projects, stakeholders, source-backed context, and reusable operating knowledge.",
    schema: {
      page_types: [
        ...basePageTypes,
        {
          type: "meeting",
          directory: "wiki/meetings",
          purpose: "Meeting notes, decisions, and action items.",
        },
        {
          type: "decision",
          directory: "wiki/decisions",
          purpose: "Architecture, product, or operating decisions with context and consequences.",
        },
        {
          type: "project",
          directory: "wiki/projects",
          purpose: "Project briefs, status, milestones, and retrospectives.",
        },
        {
          type: "stakeholder",
          directory: "wiki/stakeholders",
          purpose: "People, teams, and organizations involved in the knowledge base.",
        },
      ],
      wikilink_style: "[[page-slug]]",
      required_system_pages: systemPages,
    },
    retrieval: baseRetrieval,
    dataset_configuration: createDatasetConfigurationTemplate({
      presetId: "team_knowledge",
      purpose:
        "Team Knowledge base. Preserve decisions, meetings, projects, stakeholders, source-backed context, and reusable operating knowledge.",
      schema: {
        page_types: [
          ...basePageTypes,
          {
            type: "meeting",
            directory: "wiki/meetings",
            purpose: "Meeting notes, decisions, and action items.",
          },
          {
            type: "decision",
            directory: "wiki/decisions",
            purpose: "Architecture, product, or operating decisions with context and consequences.",
          },
          {
            type: "project",
            directory: "wiki/projects",
            purpose: "Project briefs, status, milestones, and retrospectives.",
          },
          {
            type: "stakeholder",
            directory: "wiki/stakeholders",
            purpose: "People, teams, and organizations involved in the knowledge base.",
          },
        ],
        wikilink_style: "[[page-slug]]",
        required_system_pages: systemPages,
      },
      retrieval: baseRetrieval,
      outputLanguage: "en-US",
    }),
    system_pages: systemPages,
  },
];

function createDatasetConfigurationTemplate(input: {
  presetId: KnowledgeBaseTemplate;
  purpose: string;
  schema: JsonObject;
  retrieval: JsonObject;
  outputLanguage: KnowledgeBaseOutputLanguage;
}): DatasetConfigurationValues & { preset_id: KnowledgeBaseTemplate; validation: JsonObject } {
  return {
    preset_id: input.presetId,
    purpose: input.purpose,
    schema: cloneJsonObject(input.schema),
    markdown_contract: cloneJsonObject(baseMarkdownContract),
    output_language: input.outputLanguage,
    retrieval: cloneJsonObject(input.retrieval),
    source_lifecycle: cloneJsonObject(baseSourceLifecycle),
    knowledge_check: cloneJsonObject(baseKnowledgeCheck),
    source_watch: cloneJsonObject(baseSourceWatch),
    ocr_policy: cloneJsonObject(baseOcrPolicy) as DatasetConfigurationValues["ocr_policy"],
    prompt_templates: createDefaultDatasetPromptTemplates(),
    validation: cloneJsonObject(baseDatasetValidation),
  };
}

export function getKnowledgeBaseTemplate(
  id: KnowledgeBaseTemplate,
): KnowledgeBaseTemplateDefinition {
  const template = findKnowledgeBaseTemplate(id);

  if (template === undefined) {
    throw new Error(`Unknown knowledge base template: ${id}`);
  }

  return template;
}

export function listKnowledgeBaseTemplates(): KnowledgeBaseTemplateDefinition[] {
  return templates.map((template) => ({
    ...template,
    schema: cloneJsonObject(template.schema),
    retrieval: cloneJsonObject(template.retrieval),
    dataset_configuration: JSON.parse(
      JSON.stringify(template.dataset_configuration),
    ) as KnowledgeBaseTemplateDefinition["dataset_configuration"],
    system_pages: [...template.system_pages],
  }));
}

export function findKnowledgeBaseTemplate(id: string): KnowledgeBaseTemplateDefinition | undefined {
  return templates.find((template) => template.id === id);
}

function cloneJsonObject(value: JsonObject): JsonObject {
  return JSON.parse(JSON.stringify(value)) as JsonObject;
}
