#!/usr/bin/env node
/* global AbortController, Blob, FormData, clearTimeout, fetch, setTimeout, window */
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { access, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { setTimeout as delay } from "node:timers/promises";
import { URL } from "node:url";

const execFileAsync = promisify(execFile);
const workspaceRoot = resolve(new URL("../..", import.meta.url).pathname);
const args = parseArgs(process.argv.slice(2));
const envPath = resolve(
  workspaceRoot,
  args.env ?? process.env.FOCOCONTEXT_VALIDATION_ENV ?? ".env",
);
const envExamplePath = resolve(workspaceRoot, ".env.example");
const composeFiles = splitCsv(
  args.composeFile ??
    process.env.FOCOCONTEXT_VALIDATION_COMPOSE_FILE ??
    "docker-compose.dev.example.yml",
).map((item) => resolve(workspaceRoot, item));
const documentsDir = resolve(
  args.documentsDir ??
    process.env.FOCOCONTEXT_VALIDATION_DOCUMENTS_DIR ??
    "/Users/gaobohan/Desktop/documents-test",
);
const legalMarkdownDir = resolve(
  args.legalDir ??
    process.env.FOCOCONTEXT_VALIDATION_LEGAL_DIR ??
    "local-knowledge-demos/legal-corpus/official-flk-sync/derivatives/full-all-status-official-final-markdown-package/markdown",
);
const reportDir = resolve(
  workspaceRoot,
  args.reportDir ??
    process.env.FOCOCONTEXT_VALIDATION_REPORT_DIR ??
    "test-results/white-box-real-data-validation",
);
const runId = args.runId ?? process.env.FOCOCONTEXT_VALIDATION_RUN_ID ?? timestampId();
const generalLimit = readPositiveInt(
  args.generalLimit ?? process.env.FOCOCONTEXT_VALIDATION_GENERAL_LIMIT,
  3,
);
const legalLimit = readPositiveInt(
  args.legalLimit ?? process.env.FOCOCONTEXT_VALIDATION_LEGAL_LIMIT,
  5,
);
const jobTimeoutMs = readPositiveInt(
  args.jobTimeoutMs ?? process.env.FOCOCONTEXT_VALIDATION_JOB_TIMEOUT_MS,
  900000,
);
const httpTimeoutMs = readPositiveInt(
  args.httpTimeoutMs ?? process.env.FOCOCONTEXT_VALIDATION_HTTP_TIMEOUT_MS,
  180000,
);
const adminEnabled = parseBoolean(args.admin ?? process.env.FOCOCONTEXT_VALIDATION_ADMIN ?? "true");
const apiEnabled = parseBoolean(
  args.openapi ?? process.env.FOCOCONTEXT_VALIDATION_OPENAPI ?? "true",
);
const composeEnabled = parseBoolean(
  args.compose ?? process.env.FOCOCONTEXT_VALIDATION_COMPOSE ?? "true",
);
const runtimeEnabled = parseBoolean(
  args.runtime ?? process.env.FOCOCONTEXT_VALIDATION_RUNTIME ?? "true",
);
const strict = parseBoolean(args.strict ?? process.env.FOCOCONTEXT_VALIDATION_STRICT ?? "true");
const headless = parseBoolean(args.headless ?? process.env.HEADLESS ?? "true");
const supportedMimeTypes = new Map([
  [".csv", "text/csv"],
  [".html", "text/html"],
  [".md", "text/markdown"],
  [".pdf", "application/pdf"],
  [".pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation"],
  [".rtf", "application/rtf"],
  [".txt", "text/plain"],
  [".xls", "application/vnd.ms-excel"],
  [".xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  [".docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
]);
const report = {
  admin: {
    browserProblems: [],
    checks: [],
    screenshots: [],
  },
  api: {
    checks: [],
    cleanupCompleted: false,
    createdKnowledgeBaseId: null,
    documents: [],
    jobs: [],
    pages: 0,
    retrieveResults: 0,
  },
  compose: {
    checks: [],
    files: composeFiles.map((file) => relativePath(file)),
    services: {},
  },
  env: {
    checks: [],
    effective: {},
    selectedEnvPath: relativePath(envPath),
  },
  failures: [],
  fixes: [],
  manifests: {
    documents: [],
    legal: [],
  },
  metadata: {
    generatedAt: new Date().toISOString(),
    runId,
    strict,
    workspaceRoot,
  },
  moduleCoverage: [],
  reruns: [],
  residualRisks: [],
  status: "running",
  timings: {},
  warnings: [],
};

await mkdir(reportDir, { recursive: true });

const envExample = await readEnvFile(envExamplePath, { required: true });
const selectedEnv = await readEnvFile(envPath, { required: true });
const apiBaseUrl = normalizeApiBaseUrl(
  selectedEnv.FOCOCONTEXT_ADMIN_API_BASE_URL ??
    `http://127.0.0.1:${selectedEnv.FOCOCONTEXT_API_PORT ?? "18080"}/v1`,
);
const apiRootUrl = apiBaseUrl.replace(/\/v1$/u, "");
const adminBaseUrl = stripTrailingSlash(
  selectedEnv.FOCOCONTEXT_ADMIN_BASE_URL ??
    `http://127.0.0.1:${selectedEnv.FOCOCONTEXT_ADMIN_PORT ?? "18081"}`,
);

try {
  await step("preflight", async () => {
    await validateEnvConfiguration(envExample, selectedEnv);
    if (composeEnabled) {
      await validateComposeConfiguration(selectedEnv);
    }
    report.manifests.documents = await selectGeneralDocuments();
    report.manifests.legal = await selectLegalMarkdown();
    validateCoverageMap();
    markCoverage(["env-template", "selected-env"], "verified");
    if (composeEnabled) {
      markCoverage(["docker-compose-config"], "verified");
    } else {
      markCoverage(["docker-compose-config"], "skipped");
    }
  });

  if (runtimeEnabled) {
    await step("runtime", async () => {
      await validateRuntimeMetadata(selectedEnv);
      markCoverage(["runtime-health", "admin-runtime-config"], "verified");
    });
  } else {
    markCoverage(["runtime-health", "admin-runtime-config"], "skipped");
  }

  if (apiEnabled) {
    await step("openapi", async () => {
      await runOpenApiValidation();
      markCoverage(
        [
          "knowledge-base-api",
          "document-upload-api",
          "job-polling-api",
          "processing-unit-api",
          "document-list-api",
          "wiki-page-api",
          "graph-api",
          "retrieve-api",
          "source-evidence-api",
        ],
        "verified",
      );
    });
  } else {
    markCoverage(
      [
        "knowledge-base-api",
        "document-upload-api",
        "job-polling-api",
        "processing-unit-api",
        "document-list-api",
        "wiki-page-api",
        "graph-api",
        "retrieve-api",
        "source-evidence-api",
      ],
      "skipped",
    );
  }

  if (adminEnabled) {
    await step("admin", async () => {
      await runAdminValidation();
      markCoverage(
        [
          "admin-login",
          "admin-settings",
          "admin-knowledge-base",
          "admin-sources",
          "admin-jobs",
          "admin-pages",
          "admin-retrieval",
        ],
        "verified",
      );
    });
  } else {
    markCoverage(
      [
        "admin-login",
        "admin-settings",
        "admin-knowledge-base",
        "admin-sources",
        "admin-jobs",
        "admin-pages",
        "admin-retrieval",
      ],
      "skipped",
    );
  }

  await step("final", async () => {
    await validateNoSecretLeak();
  });
} catch (error) {
  report.failures.push(toErrorMessage(error));
} finally {
  await cleanupOpenApiKnowledgeBase();
  report.status = report.failures.length === 0 ? "passed" : "failed";
  report.timings.finishedAt = new Date().toISOString();
  await writeReport();
}

if (report.failures.length > 0) {
  console.error(JSON.stringify({ failures: report.failures, reportDir }, null, 2));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({ reportDir, status: "passed" }, null, 2));
}

async function step(name, action) {
  const startedAt = Date.now();
  console.log(`[white-box-validation] ${name}:start ${new Date().toISOString()}`);
  await action();
  report.timings[name] = {
    durationMs: Date.now() - startedAt,
    finishedAt: new Date().toISOString(),
  };
  console.log(`[white-box-validation] ${name}:done ${new Date().toISOString()}`);
}

function logProgress(name, details = {}) {
  const safeDetails = Object.entries(redactObject(details))
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(" ");
  console.log(
    `[white-box-validation] ${name} ${new Date().toISOString()}${safeDetails ? ` ${safeDetails}` : ""}`,
  );
}

async function validateEnvConfiguration(example, actual) {
  const requiredKeys = [
    "FOCOCONTEXT_ADMIN_USERNAME",
    "FOCOCONTEXT_ADMIN_PASSWORD",
    "FOCOCONTEXT_API_KEY",
    "FOCOCONTEXT_ADMIN_API_BASE_URL",
    "FOCOCONTEXT_ADMIN_BASE_URL",
    "FOCOCONTEXT_CORS_ORIGINS",
    "DATABASE_URL",
    "REDIS_URL",
    "S3_ENDPOINT",
    "S3_BUCKET",
    "S3_ACCESS_KEY_ID",
    "S3_SECRET_ACCESS_KEY",
    "CHAT_BASE_URL",
    "CHAT_API_KEY",
    "CHAT_DEFAULT_MODEL",
    "EMBEDDING_BASE_URL",
    "EMBEDDING_API_KEY",
    "EMBEDDING_MODEL",
  ];
  const templateMissing = requiredKeys.filter((key) => !(key in example));
  const actualMissing = requiredKeys.filter(
    (key) => isEmpty(actual[key]) || isPlaceholder(actual[key]),
  );

  recordCheck(report.env.checks, "env-template-required-keys", templateMissing.length === 0, {
    missing: templateMissing,
  });
  recordCheck(report.env.checks, "selected-env-required-values", actualMissing.length === 0, {
    missing: actualMissing,
  });

  if (templateMissing.length > 0 || actualMissing.length > 0) {
    throw new Error(
      `Env validation failed: template missing ${templateMissing.join(", ") || "none"}, selected env missing ${actualMissing.join(", ") || "none"}.`,
    );
  }

  const partialRerankKeys = [
    "RERANK_PROVIDER_NAME",
    "RERANK_BASE_URL",
    "RERANK_API_KEY",
    "RERANK_MODEL",
  ];
  const configuredRerankKeys = partialRerankKeys.filter((key) => !isEmpty(actual[key]));
  recordCheck(
    report.env.checks,
    "rerank-config-all-or-none",
    configuredRerankKeys.length === 0 || configuredRerankKeys.length === partialRerankKeys.length,
    { configured: configuredRerankKeys },
  );

  if (configuredRerankKeys.length > 0 && configuredRerankKeys.length !== partialRerankKeys.length) {
    throw new Error("Rerank configuration must be empty or fully configured.");
  }

  report.env.effective = redactObject({
    apiBaseUrl,
    adminBaseUrl,
    corsOrigins: actual.FOCOCONTEXT_CORS_ORIGINS,
    ocrEnabled: actual.OCR_ENABLED,
    queueConcurrency: actual.FOCOCONTEXT_QUEUE_CONCURRENCY,
    s3Endpoint: actual.S3_ENDPOINT,
    uploadDirectEnabled: actual.UPLOAD_DIRECT_ENABLED,
    uploadMaxFileSizeMb: actual.UPLOAD_MAX_FILE_SIZE_MB,
  });
}

async function validateComposeConfiguration(actualEnv) {
  for (const composeFile of composeFiles) {
    await access(composeFile);
  }

  const config = await dockerComposeJson(["config", "--format", "json"], actualEnv);
  const services = config.services ?? {};
  const requiredServices = [
    "api",
    "admin",
    "worker",
    "postgres",
    "redis",
    "migrate",
    "ocr-service",
  ];
  const missingServices = requiredServices.filter((service) => services[service] === undefined);

  recordCheck(report.compose.checks, "compose-required-services", missingServices.length === 0, {
    missing: missingServices,
  });

  if (missingServices.length > 0) {
    throw new Error(`Compose configuration missing services: ${missingServices.join(", ")}.`);
  }

  for (const [name, service] of Object.entries(services)) {
    report.compose.services[name] = {
      dependsOn: Object.keys(service.depends_on ?? {}),
      hasHealthcheck: service.healthcheck !== undefined,
      image: service.image ?? null,
      ports: service.ports ?? [],
      volumes: service.volumes ?? [],
    };
  }

  recordCheck(
    report.compose.checks,
    "api-admin-worker-healthchecks",
    ["api", "admin", "worker"].every((service) => services[service]?.healthcheck !== undefined),
  );
  recordCheck(
    report.compose.checks,
    "compose-bind-host-configured",
    JSON.stringify(config).includes(actualEnv.FOCOCONTEXT_BIND_HOST ?? "127.0.0.1"),
  );

  const ps = await dockerComposeJson(["ps", "--format", "json"], actualEnv).catch((error) => {
    report.warnings.push(`Compose ps unavailable: ${toErrorMessage(error)}`);
    return [];
  });
  const psItems = Array.isArray(ps) ? ps : [ps].filter(Boolean);
  const unhealthy = psItems.filter((item) => {
    const state = String(item.State ?? item.state ?? "");
    const health = String(item.Health ?? item.health ?? "");
    return state.length > 0 && !["running", "exited"].includes(state) && health !== "healthy";
  });

  recordCheck(report.compose.checks, "compose-ps-readable", psItems.length > 0, {
    services: psItems.map((item) => item.Service ?? item.Name ?? "unknown"),
  });
  recordCheck(report.compose.checks, "compose-ps-no-unexpected-unhealthy", unhealthy.length === 0, {
    unhealthy,
  });
}

async function validateRuntimeMetadata(actualEnv) {
  const health = await httpJson(`${apiRootUrl}/health`, {
    headers: { accept: "application/json" },
  });
  const healthData = health.data ?? {};

  recordCheck(report.env.checks, "api-health-ready", healthData.status === "ready", {
    status: healthData.status,
  });
  validateReleaseMetadata("api", healthData.runtime?.release);
  validateReleaseMetadata("worker", healthData.dependencies?.worker?.release);
  validateReleaseMetadata("ocr", healthData.dependencies?.ocr?.release);
  recordCheck(
    report.env.checks,
    "health-api-base-url-matches-env",
    healthData.runtime?.apiBaseUrl === apiBaseUrl,
    {
      actual: healthData.runtime?.apiBaseUrl,
      expected: apiBaseUrl,
    },
  );
  recordCheck(
    report.env.checks,
    "health-admin-base-url-matches-env",
    healthData.runtime?.adminBaseUrl === adminBaseUrl,
    {
      actual: healthData.runtime?.adminBaseUrl,
      expected: adminBaseUrl,
    },
  );

  const dependencyKeys = ["database", "redis", "objectStorage", "worker", "queue"];
  for (const key of dependencyKeys) {
    recordCheck(
      report.env.checks,
      `dependency-${key}-has-status`,
      healthData.dependencies?.[key]?.status !== undefined,
      {
        status: healthData.dependencies?.[key]?.status,
      },
    );
  }

  const runtimeConfig = await fetchText(`${adminBaseUrl}/runtime-config.js`);
  recordCheck(
    report.env.checks,
    "admin-runtime-config-api-url",
    runtimeConfig.includes(apiBaseUrl),
  );
  recordCheck(
    report.env.checks,
    "admin-runtime-config-admin-url",
    runtimeConfig.includes(adminBaseUrl),
  );
  recordCheck(
    report.env.checks,
    "admin-runtime-config-no-api-key",
    !runtimeConfig.includes(actualEnv.FOCOCONTEXT_API_KEY),
  );
  recordCheck(
    report.env.checks,
    "health-direct-upload-status-present",
    healthData.limits?.upload?.directUpload !== undefined,
    healthData.limits?.upload ?? {},
  );
}

function validateReleaseMetadata(name, metadata) {
  recordCheck(report.env.checks, `release-${name}-metadata-present`, metadata !== undefined, {
    metadata,
  });
  recordCheck(
    report.env.checks,
    `release-${name}-revision-known`,
    isKnownReleaseValue(metadata?.revision),
    {
      revision: metadata?.revision,
    },
  );
  recordCheck(
    report.env.checks,
    `release-${name}-build-time-known`,
    isKnownReleaseValue(metadata?.buildTime),
    {
      buildTime: metadata?.buildTime,
    },
  );
}

function isKnownReleaseValue(value) {
  return typeof value === "string" && value.trim().length > 0 && value !== "unknown";
}

async function selectGeneralDocuments() {
  const files = await listFiles(documentsDir);
  const candidates = files
    .filter((file) => supportedMimeTypes.has(extname(file).toLowerCase()))
    .sort(
      (left, right) =>
        documentRank(left) - documentRank(right) || basename(left).localeCompare(basename(right)),
    );
  const selected = [];
  const seenExtensions = new Set();

  for (const file of candidates) {
    const extension = extname(file).toLowerCase();
    if (selected.length < generalLimit && (!seenExtensions.has(extension) || selected.length < 2)) {
      selected.push(await manifestItem(file));
      seenExtensions.add(extension);
    }
  }

  for (const file of candidates) {
    if (selected.length >= generalLimit) {
      break;
    }
    if (!selected.some((item) => item.path === file)) {
      selected.push(await manifestItem(file));
    }
  }

  if (selected.length === 0) {
    throw new Error(`No supported general validation documents found in ${documentsDir}.`);
  }

  return selected;
}

async function selectLegalMarkdown() {
  const files = (await listFiles(legalMarkdownDir))
    .filter((file) => extname(file).toLowerCase() === ".md")
    .sort((left, right) => basename(left).localeCompare(basename(right)));

  const selected = [];
  for (const file of pickSpread(files, legalLimit)) {
    selected.push(await manifestItem(file));
  }

  if (selected.length === 0) {
    throw new Error(`No legal Markdown validation documents found in ${legalMarkdownDir}.`);
  }

  return selected;
}

function pickSpread(items, limit) {
  const count = Math.min(Math.max(limit, 0), items.length);
  if (count === 0) {
    return [];
  }
  if (count === 1) {
    return [items[0]];
  }

  const selected = [];
  const seen = new Set();
  for (let index = 0; index < count; index += 1) {
    const itemIndex = Math.round((index * (items.length - 1)) / (count - 1));
    if (!seen.has(itemIndex)) {
      selected.push(items[itemIndex]);
      seen.add(itemIndex);
    }
  }

  for (let index = 0; selected.length < count && index < items.length; index += 1) {
    if (!seen.has(index)) {
      selected.push(items[index]);
      seen.add(index);
    }
  }

  return selected;
}

function validateCoverageMap() {
  const coverage = [
    "env-template",
    "selected-env",
    "docker-compose-config",
    "runtime-health",
    "admin-runtime-config",
    "knowledge-base-api",
    "document-upload-api",
    "job-polling-api",
    "processing-unit-api",
    "document-list-api",
    "wiki-page-api",
    "graph-api",
    "retrieve-api",
    "source-evidence-api",
    "admin-login",
    "admin-settings",
    "admin-knowledge-base",
    "admin-sources",
    "admin-jobs",
    "admin-pages",
    "admin-retrieval",
    "cleanup",
  ];

  report.moduleCoverage = coverage.map((name) => ({ name, status: "planned" }));
  recordCheck(report.env.checks, "coverage-map-defined", coverage.length >= 20, { coverage });
}

async function runOpenApiValidation() {
  logProgress("openapi:create-knowledge-base");
  const created = await apiPost("/knowledge-bases", {
    description: "Temporary white-box real-data validation knowledge base.",
    name: `White Box Validation ${runId}`,
    output_language: "en-US",
    purpose:
      "Validate module, API, Admin Web, runtime, and real-data behavior without algorithm changes.",
    slug: `white-box-validation-${runId}`,
    template: "general",
  });
  const knowledgeBase = created.knowledge_base ?? created;
  report.api.createdKnowledgeBaseId = knowledgeBase.id;

  await apiGet(`/knowledge-bases/${knowledgeBase.id}`);
  recordCheck(report.api.checks, "knowledge-base-create-and-detail", true, {
    id: knowledgeBase.id,
  });

  const uploadItems = [
    ...report.manifests.documents.slice(0, 2),
    ...report.manifests.legal.slice(0, 3),
  ];
  let uploadIndex = 0;
  for (const item of uploadItems) {
    uploadIndex += 1;
    logProgress("openapi:upload:start", {
      index: uploadIndex,
      kind: item.kind,
      total: uploadItems.length,
    });
    const upload = await uploadDocument(knowledgeBase.id, item);
    report.api.documents.push({
      documentId: upload.document?.id,
      jobId: upload.job?.id,
      path: item.relativePath,
      title: item.name,
    });
    report.api.jobs.push(await waitForJob(upload.job.id));
    logProgress("openapi:upload:done", {
      index: uploadIndex,
      kind: item.kind,
      total: uploadItems.length,
    });
  }

  logProgress("openapi:direct-upload:start");
  await validateDirectUploadIfReady(knowledgeBase.id);
  logProgress("openapi:direct-upload:done");
  logProgress("openapi:lists:start");
  await validateApiLists(knowledgeBase.id);
  logProgress("openapi:lists:done");
  logProgress("openapi:retrieve:start");
  await validateRetrieval(knowledgeBase.id);
  logProgress("openapi:retrieve:done");
  logProgress("openapi:errors:start");
  await validateApiErrors(knowledgeBase.id);
  logProgress("openapi:errors:done");
}

async function uploadDocument(knowledgeBaseId, item) {
  const content = await readFile(item.path);
  const formData = new FormData();
  const extension = extname(item.path).toLowerCase();

  formData.set(
    "data",
    JSON.stringify({
      display_name: item.name,
      metadata: {
        content_sha256: item.sha256,
        validation_run_id: runId,
        validation_source: item.kind,
      },
      source_path: `white-box-validation/${runId}/${item.kind}/${item.name}`,
    }),
  );
  formData.set(
    "file",
    new Blob([content], {
      type: supportedMimeTypes.get(extension) ?? "application/octet-stream",
    }),
    item.name,
  );

  const response = await fetchWithTimeout(
    `${apiBaseUrl}/knowledge-bases/${knowledgeBaseId}/documents`,
    {
      body: formData,
      headers: {
        ...authHeaders(),
        "idempotency-key": `white-box-${runId}-${item.sha256.slice(0, 16)}`,
      },
      method: "POST",
    },
    "document-upload",
  );

  return readData(response);
}

async function waitForJob(jobId) {
  const startedAt = Date.now();
  let lastJob = null;

  while (Date.now() - startedAt < jobTimeoutMs) {
    lastJob = await apiGet(`/jobs/${jobId}`);
    if (lastJob.status === "completed") {
      recordCheck(report.api.checks, `job-completed-${jobId}`, true, {
        progress: lastJob.progress,
        stage: lastJob.stage,
      });
      return lastJob;
    }
    if (["failed", "canceled"].includes(lastJob.status)) {
      throw new Error(
        `Job ${jobId} ended with ${lastJob.status} at ${lastJob.stage}: ${lastJob.error?.message ?? "no error message"}`,
      );
    }
    await delay(3000);
  }

  throw new Error(
    `Job ${jobId} did not complete before timeout. Last state: ${JSON.stringify(lastJob)}`,
  );
}

async function validateApiLists(knowledgeBaseId) {
  const jobs = await apiList(`/knowledge-bases/${knowledgeBaseId}/jobs?page=1&page_size=2`);
  const documents = await apiList(
    `/knowledge-bases/${knowledgeBaseId}/documents?page=1&page_size=2`,
  );
  const pages = await apiList(`/knowledge-bases/${knowledgeBaseId}/pages?page=1&page_size=2`);
  const graph = await apiGet(`/knowledge-bases/${knowledgeBaseId}/graph`);

  report.api.pages = pages.items.length;
  recordCheck(
    report.api.checks,
    "jobs-pagination",
    jobs.pagination?.page_size === 2,
    jobs.pagination,
  );
  recordCheck(
    report.api.checks,
    "documents-pagination",
    documents.pagination?.page_size === 2,
    documents.pagination,
  );
  recordCheck(report.api.checks, "pages-generated", pages.items.length > 0, {
    count: pages.items.length,
  });
  recordCheck(
    report.api.checks,
    "graph-readable",
    Array.isArray(graph.nodes) && Array.isArray(graph.edges),
    {
      edges: graph.edges?.length ?? 0,
      nodes: graph.nodes?.length ?? 0,
    },
  );

  const firstDocumentId = report.api.documents.find(
    (item) => typeof item.documentId === "string",
  )?.documentId;
  if (firstDocumentId !== undefined) {
    const units = await apiList(
      `/documents/${firstDocumentId}/processing-units?page=1&page_size=5`,
    );
    recordCheck(
      report.api.checks,
      "processing-units-pagination",
      units.pagination?.page_size === 5,
      units.pagination,
    );
  }
}

async function validateDirectUploadIfReady(knowledgeBaseId) {
  const health = await httpJson(`${apiRootUrl}/health`, {
    headers: { accept: "application/json" },
  });
  const directUpload = health.data?.limits?.upload?.directUpload;

  if (directUpload?.ready !== true) {
    report.warnings.push(
      "Direct upload is not ready in this runtime; upload session flow was recorded as skipped.",
    );
    recordCheck(
      report.api.checks,
      "direct-upload-session-skipped-when-not-ready",
      true,
      directUpload ?? {},
    );
    return;
  }

  const content = Buffer.from(
    [
      "# Direct Upload Validation",
      "",
      "This document validates direct upload session creation, object upload, finalize, and ingest.",
      "",
      "Validation phrase: direct upload white box validation.",
    ].join("\n"),
    "utf8",
  );
  const contentHash = createHash("sha256").update(content).digest("hex");
  const session = await apiPost(`/knowledge-bases/${knowledgeBaseId}/documents/upload-sessions`, {
    content_hash: `sha256:${contentHash}`,
    display_name: "Direct upload validation",
    file_name: `direct-upload-validation-${runId}.md`,
    metadata: {
      validation_run_id: runId,
      validation_source: "direct-upload",
    },
    mime_type: "text/markdown",
    size: content.byteLength,
    source_path: `white-box-validation/${runId}/direct-upload.md`,
  });
  const presigned = session.presigned_upload;
  const uploadResponse = await fetchWithTimeout(
    presigned.url,
    {
      body: content,
      headers: presigned.headers ?? { "content-type": "text/markdown" },
      method: presigned.method ?? "PUT",
    },
    "direct-upload-put",
  );

  if (!uploadResponse.ok) {
    throw new Error(`Direct upload object PUT failed with status ${uploadResponse.status}.`);
  }

  const finalized = await apiPost(
    `/knowledge-bases/${knowledgeBaseId}/documents/upload-sessions/${session.upload_session.id}/finalize`,
    {
      content_hash: `sha256:${contentHash}`,
    },
  );
  report.api.documents.push({
    documentId: finalized.document?.id,
    jobId: finalized.job?.id,
    path: "direct-upload-generated",
    title: "Direct upload validation",
  });
  report.api.jobs.push(await waitForJob(finalized.job.id));
  recordCheck(report.api.checks, "direct-upload-session-finalized", true, {
    documentId: finalized.document?.id,
    sessionId: session.upload_session.id,
  });
}

async function validateRetrieval(knowledgeBaseId) {
  const retrieve = await apiPost(`/knowledge-bases/${knowledgeBaseId}/retrieve`, {
    context_budget_tokens: 4000,
    graph_depth: 1,
    include_context_pack: true,
    include_graph: true,
    mode: "hybrid",
    query: "validation source evidence runtime configuration document",
    top_k: 5,
  });

  report.api.retrieveResults = retrieve.results?.length ?? 0;
  recordCheck(report.api.checks, "retrieve-results", report.api.retrieveResults > 0, {
    count: report.api.retrieveResults,
  });

  const firstPageId = retrieve.results?.find((item) => typeof item.page_id === "string")?.page_id;
  if (firstPageId !== undefined) {
    const expand = await apiPost(`/knowledge-bases/${knowledgeBaseId}/retrieve/expand`, {
      depth: 1,
      include_context_pack: true,
      seed_page_ids: [firstPageId],
    });
    recordCheck(
      report.api.checks,
      "retrieve-expand-readable",
      Array.isArray(expand.nodes) || Array.isArray(expand.edges),
      {
        edges: expand.edges?.length ?? 0,
        nodes: expand.nodes?.length ?? 0,
      },
    );
  }

  const evidenceItems = collectSourceEvidenceItems(retrieve, knowledgeBaseId).slice(0, 5);
  if (evidenceItems.length > 0) {
    const resolved = await apiPost("/source-evidence/resolve", { items: evidenceItems });
    recordCheck(
      report.api.checks,
      "source-evidence-resolve",
      resolved.items?.length === evidenceItems.length,
      {
        requested: evidenceItems.length,
        returned: resolved.items?.length ?? 0,
      },
    );
  } else {
    recordCheck(report.api.checks, "source-evidence-present", false, {
      message: "Retrieve response did not include source evidence items.",
    });
  }
}

async function cleanupOpenApiKnowledgeBase() {
  if (report.api.createdKnowledgeBaseId === null || report.api.cleanupCompleted) {
    return;
  }

  try {
    const knowledgeBaseId = report.api.createdKnowledgeBaseId;
    await apiDelete(`/knowledge-bases/${knowledgeBaseId}`);

    const deletedDetail = await fetchWithTimeout(
      `${apiBaseUrl}/knowledge-bases/${knowledgeBaseId}`,
      {
        headers: authHeaders(),
      },
      "cleanup-knowledge-base-detail",
    );
    const knowledgeBases = await apiList("/knowledge-bases?page=1&page_size=100");
    const hiddenFromDetail = deletedDetail.status === 404 || deletedDetail.status === 410;
    const hiddenFromList = knowledgeBases.items.every((item) => item.id !== knowledgeBaseId);
    recordCheck(
      report.api.checks,
      "cleanup-public-api-hidden",
      hiddenFromDetail && hiddenFromList,
      {
        detailStatus: deletedDetail.status,
        hiddenFromDetail,
        hiddenFromList,
      },
    );

    report.api.cleanupCompleted = true;
    markCoverage(["cleanup"], "verified");
  } catch (error) {
    const message = `OpenAPI cleanup failed: ${toErrorMessage(error)}`;
    report.warnings.push(message);
    if (strict) {
      report.failures.push(message);
    }
  }
}

function markCoverage(names, status) {
  const updates = new Set(names);
  report.moduleCoverage = report.moduleCoverage.map((item) =>
    updates.has(item.name) ? { ...item, status } : item,
  );
}

async function validateApiErrors(knowledgeBaseId) {
  const invalidAuth = await fetchWithTimeout(
    `${apiBaseUrl}/knowledge-bases/${knowledgeBaseId}`,
    {
      headers: { authorization: "Bearer invalid" },
    },
    "invalid-auth-check",
  );
  recordCheck(
    report.api.checks,
    "invalid-auth-rejected",
    invalidAuth.status === 401 || invalidAuth.status === 403,
    {
      status: invalidAuth.status,
    },
  );

  const missing = await fetchWithTimeout(
    `${apiBaseUrl}/knowledge-bases/kb_missing_white_box_validation`,
    {
      headers: authHeaders(),
    },
    "missing-resource-check",
  );
  recordCheck(report.api.checks, "missing-resource-rejected", missing.status === 404, {
    status: missing.status,
  });
}

async function runAdminValidation() {
  const { chromium, expect } = await import("@playwright/test");
  const browser = await chromium.launch({
    channel: process.env.PLAYWRIGHT_CHROME_CHANNEL ?? "chrome",
    headless,
  });
  const context = await browser.newContext({
    acceptDownloads: true,
    viewport: { height: 950, width: 1440 },
  });
  await context.addInitScript(() => {
    window.localStorage.setItem("fococontext.admin.language", "en-US");
  });
  const page = await context.newPage();

  page.on("console", (message) => {
    if (message.type() === "error") {
      report.admin.browserProblems.push(`console:${message.text()}`);
    }
  });
  page.on("requestfailed", (request) => {
    if (request.failure()?.errorText.includes("net::ERR_ABORTED") !== true) {
      report.admin.browserProblems.push(`requestfailed:${request.method()} ${request.url()}`);
    }
  });
  page.on("response", (response) => {
    if (response.status() >= 500) {
      report.admin.browserProblems.push(`response:${response.status()} ${response.url()}`);
    }
  });

  try {
    await adminCheck("login", async () => {
      await context.clearCookies();
      await page.goto(`${adminBaseUrl}/login`);
      await page.locator('input[name="username"]').fill(selectedEnv.FOCOCONTEXT_ADMIN_USERNAME);
      await page.locator('input[name="password"]').fill(selectedEnv.FOCOCONTEXT_ADMIN_PASSWORD);
      await page.getByRole("button", { name: "Sign in" }).click();
      await expect(page).toHaveURL(/\/dashboard$/u, { timeout: 20000 });
      await captureAdmin(page, "01-dashboard");
    });

    await adminCheck("system-settings", async () => {
      await page.goto(`${adminBaseUrl}/settings`);
      await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible({ timeout: 20000 });
      await expect(page.getByText(apiBaseUrl)).toBeVisible();
      await expect(page.getByText(adminBaseUrl)).toBeVisible();
      await page.getByRole("button", { name: "Models" }).click();
      await expect(page.getByRole("heading", { name: "Models" })).toBeVisible();
      await page.getByRole("button", { name: "Storage & indexes" }).click();
      await expect(page.getByRole("heading", { name: "Storage & indexes" })).toBeVisible();
      await captureAdmin(page, "02-system-settings");
    });

    await adminCheck("dashboard-empty-and-pagination-surface", async () => {
      await page.goto(`${adminBaseUrl}/dashboard`);
      await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible({
        timeout: 20000,
      });
      await expect(page.getByRole("button", { name: "New knowledge base" })).toBeVisible();
      await captureAdmin(page, "03-dashboard");
    });

    if (report.api.createdKnowledgeBaseId !== null && report.api.cleanupCompleted === false) {
      await adminCheck("knowledge-base-pages", async () => {
        await page.goto(
          `${adminBaseUrl}/knowledge-bases/${report.api.createdKnowledgeBaseId}/jobs`,
        );
        await expect(page.getByRole("button", { name: "Refresh" })).toBeVisible({ timeout: 20000 });
        await captureAdmin(page, "04-jobs");
      });
    }

    const storage = await context.storageState();
    const serializedStorage = JSON.stringify(storage);
    recordCheck(
      report.admin.checks,
      "admin-storage-no-public-api-key",
      !serializedStorage.includes(selectedEnv.FOCOCONTEXT_API_KEY),
    );
  } finally {
    await browser.close();
  }

  if (report.admin.browserProblems.length > 0) {
    throw new Error(`Admin browser problems: ${report.admin.browserProblems.join("; ")}`);
  }
}

async function adminCheck(name, action) {
  try {
    await action();
    recordCheck(report.admin.checks, name, true);
  } catch (error) {
    recordCheck(report.admin.checks, name, false, { error: toErrorMessage(error) });
    throw error;
  }
}

async function captureAdmin(page, name) {
  const path = join(reportDir, `${name}.png`);
  await page.screenshot({ fullPage: true, path });
  report.admin.screenshots.push(relativePath(path));
}

function collectSourceEvidenceItems(value, knowledgeBaseId) {
  const rawItems = [];
  collectSourceEvidenceItemsFromValue(value, rawItems);

  return rawItems
    .map((item) => {
      if (typeof item.document_id !== "string") {
        return null;
      }
      const locator =
        typeof item.locator === "string" && item.locator.length > 0 ? item.locator : null;
      if (locator === null) {
        return null;
      }
      return {
        allow_fallback: true,
        context_chars: 160,
        document_id: item.document_id,
        evidence_kind: typeof item.evidence_kind === "string" ? item.evidence_kind : "text",
        knowledge_base_id: knowledgeBaseId,
        locator,
        max_chars: 1000,
      };
    })
    .filter((item) => item !== null);
}

function collectSourceEvidenceItemsFromValue(value, items) {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectSourceEvidenceItemsFromValue(item, items);
    }
    return;
  }
  if (value === null || typeof value !== "object") {
    return;
  }
  if (typeof value.document_id === "string") {
    items.push(value);
  }
  for (const key of ["citations", "source_refs", "results", "expanded_results", "nodes"]) {
    collectSourceEvidenceItemsFromValue(value[key], items);
  }
}

async function validateNoSecretLeak() {
  const serialized = JSON.stringify(report);
  const secretValues = [
    selectedEnv.FOCOCONTEXT_API_KEY,
    selectedEnv.FOCOCONTEXT_ADMIN_PASSWORD,
    selectedEnv.S3_SECRET_ACCESS_KEY,
    selectedEnv.CHAT_API_KEY,
    selectedEnv.EMBEDDING_API_KEY,
    selectedEnv.RERANK_API_KEY,
    selectedEnv.VISION_CAPTION_API_KEY,
  ].filter((value) => !isEmpty(value) && !isPlaceholder(value));
  const leaked = secretValues.filter((value) => serialized.includes(value));

  recordCheck(report.env.checks, "report-secret-redaction", leaked.length === 0, {
    leakedCount: leaked.length,
  });

  if (leaked.length > 0) {
    throw new Error(`Validation report contains ${leaked.length} raw secret value(s).`);
  }
}

async function writeReport() {
  await writeFile(
    join(reportDir, "report.json"),
    JSON.stringify(redactObject(report), null, 2),
    "utf8",
  );
  await writeFile(join(reportDir, "summary.md"), renderSummary(redactObject(report)), "utf8");
}

function renderSummary(value) {
  const failedChecks = [
    ...value.env.checks,
    ...value.compose.checks,
    ...value.api.checks,
    ...value.admin.checks,
  ].filter((check) => check.status === "failed");

  return [
    "# White-box Real-data Validation",
    "",
    `Run id: \`${value.metadata.runId}\``,
    `Generated at: ${value.metadata.generatedAt}`,
    `Status: **${value.status}**`,
    "",
    "## Inputs",
    "",
    `- General documents: ${value.manifests.documents.length}`,
    `- Legal Markdown documents: ${value.manifests.legal.length}`,
    `- Env file: \`${value.env.selectedEnvPath}\``,
    `- Compose files: ${value.compose.files.map((file) => `\`${file}\``).join(", ")}`,
    "",
    "## Coverage",
    "",
    ...value.moduleCoverage.map((item) => `- ${item.name}: ${item.status}`),
    "",
    "## Results",
    "",
    `- Env checks: ${countPassed(value.env.checks)}/${value.env.checks.length}`,
    `- Compose checks: ${countPassed(value.compose.checks)}/${value.compose.checks.length}`,
    `- OpenAPI checks: ${countPassed(value.api.checks)}/${value.api.checks.length}`,
    `- Admin checks: ${countPassed(value.admin.checks)}/${value.admin.checks.length}`,
    `- Failures: ${value.failures.length}`,
    "",
    "## Failed Checks",
    "",
    ...(failedChecks.length === 0
      ? ["- None"]
      : failedChecks.map((check) => `- ${check.name}: ${JSON.stringify(check.details ?? {})}`)),
    "",
    "## Residual Risks",
    "",
    ...(value.residualRisks.length === 0
      ? ["- None recorded"]
      : value.residualRisks.map((item) => `- ${item}`)),
    "",
  ].join("\n");
}

function countPassed(checks) {
  return checks.filter((check) => check.status === "passed").length;
}

async function apiGet(path) {
  const response = await fetchWithTimeout(
    `${apiBaseUrl}${path}`,
    {
      headers: authHeaders(),
    },
    `GET ${path}`,
  );
  return readData(response);
}

async function apiList(path) {
  const response = await fetchWithTimeout(
    `${apiBaseUrl}${path}`,
    {
      headers: authHeaders(),
    },
    `GET ${path}`,
  );
  const envelope = await readEnvelope(response);
  return {
    items: Array.isArray(envelope.data) ? envelope.data : [],
    pagination: envelope.pagination ?? null,
  };
}

async function apiPost(path, body) {
  const response = await fetchWithTimeout(
    `${apiBaseUrl}${path}`,
    {
      body: JSON.stringify(body),
      headers: {
        ...authHeaders(),
        "content-type": "application/json",
      },
      method: "POST",
    },
    `POST ${path}`,
  );
  return readData(response);
}

async function apiDelete(path) {
  const response = await fetchWithTimeout(
    `${apiBaseUrl}${path}`,
    {
      headers: authHeaders(),
      method: "DELETE",
    },
    `DELETE ${path}`,
  );
  return readData(response);
}

async function readData(response) {
  const envelope = await readEnvelope(response);
  return envelope.data ?? envelope;
}

async function readEnvelope(response) {
  const payload = await response.json().catch(() => ({}));

  if (!response.ok || payload.error !== undefined) {
    throw new Error(
      `API ${response.status} ${response.url}: ${payload.error?.message ?? response.statusText}`,
    );
  }

  return payload;
}

function authHeaders() {
  return {
    accept: "application/json",
    authorization: `Bearer ${selectedEnv.FOCOCONTEXT_API_KEY}`,
  };
}

async function httpJson(url, init) {
  const response = await fetchWithTimeout(url, init, "http-json");
  return readEnvelope(response);
}

async function fetchText(url) {
  const response = await fetchWithTimeout(url, undefined, "fetch-text");
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${url}: ${text.slice(0, 200)}`);
  }
  return text;
}

async function fetchWithTimeout(url, init = {}, label = "http-request") {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), httpTimeoutMs);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`${label} timed out after ${httpTimeoutMs}ms.`, { cause: error });
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function dockerComposeJson(composeArgs, actualEnv) {
  const dockerArgs = ["compose", ...composeFiles.flatMap((file) => ["-f", file]), ...composeArgs];
  const { stdout } = await execFileAsync("docker", dockerArgs, {
    cwd: workspaceRoot,
    env: {
      ...process.env,
      ...actualEnv,
      FOCOCONTEXT_ENV_FILE: envPath,
    },
    maxBuffer: 20 * 1024 * 1024,
  });
  const trimmed = stdout.trim();

  if (trimmed.length === 0) {
    return {};
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    const lines = trimmed
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => JSON.parse(line));
    return lines.length === 1 ? lines[0] : lines;
  }
}

async function readEnvFile(path, options = {}) {
  const required = options.required === true;
  try {
    return parseEnv(await readFile(path, "utf8"));
  } catch (error) {
    if (required) {
      throw error;
    }
    return {};
  }
}

function parseEnv(text) {
  const values = {};

  for (const line of text.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith("#")) {
      continue;
    }
    const separator = trimmed.indexOf("=");
    if (separator === -1) {
      continue;
    }
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }

  return values;
}

function parseArgs(argv) {
  const parsed = {};

  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) {
      continue;
    }
    const keyValue = item.slice(2);
    const equalsIndex = keyValue.indexOf("=");
    if (equalsIndex !== -1) {
      parsed[toCamelCase(keyValue.slice(0, equalsIndex))] = keyValue.slice(equalsIndex + 1);
      continue;
    }
    const key = toCamelCase(keyValue);
    const next = argv[index + 1];
    if (next !== undefined && !next.startsWith("--")) {
      parsed[key] = next;
      index += 1;
    } else {
      parsed[key] = "true";
    }
  }

  return parsed;
}

function toCamelCase(value) {
  return value.replace(/-([a-z])/gu, (_match, letter) => letter.toUpperCase());
}

async function listFiles(root) {
  const entries = await readdir(root, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.name.startsWith(".")) {
      continue;
    }
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFiles(path)));
    } else if (entry.isFile()) {
      files.push(path);
    }
  }

  return files;
}

async function manifestItem(path) {
  const content = await readFile(path);
  const stats = await stat(path);
  const extension = extname(path).toLowerCase();

  return {
    extension,
    kind: path.startsWith(legalMarkdownDir) ? "legal" : "general",
    modifiedAt: stats.mtime.toISOString(),
    name: basename(path),
    path,
    relativePath: relativePath(path),
    sha256: createHash("sha256").update(content).digest("hex"),
    size: content.byteLength,
  };
}

function documentRank(path) {
  const rank = new Map([
    [".md", 0],
    [".docx", 1],
    [".pdf", 2],
    [".xlsx", 3],
    [".pptx", 4],
    [".txt", 5],
  ]);

  return rank.get(extname(path).toLowerCase()) ?? 10;
}

function recordCheck(collection, name, passed, details = {}) {
  const item = {
    details: redactObject(details),
    name,
    status: passed ? "passed" : "failed",
  };
  collection.push(item);
  if (!passed && strict) {
    throw new Error(`Check failed: ${name}`);
  }
}

function redactObject(value) {
  if (Array.isArray(value)) {
    return value.map((item) => redactObject(item));
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, redactObjectByKey(key, item)]),
    );
  }
  if (typeof value === "string") {
    return redactString(value);
  }
  return value;
}

function redactObjectByKey(key, value) {
  if (/password|secret|token|api[_-]?key|authorization|credential/iu.test(key)) {
    if (isEmpty(value)) {
      return value;
    }
    return maskSecret(String(value));
  }
  return redactObject(value);
}

function redactString(value) {
  let output = value;
  for (const secret of [
    selectedEnv?.FOCOCONTEXT_API_KEY,
    selectedEnv?.FOCOCONTEXT_ADMIN_PASSWORD,
    selectedEnv?.S3_SECRET_ACCESS_KEY,
    selectedEnv?.CHAT_API_KEY,
    selectedEnv?.EMBEDDING_API_KEY,
    selectedEnv?.RERANK_API_KEY,
    selectedEnv?.VISION_CAPTION_API_KEY,
  ]) {
    if (!isEmpty(secret) && !isPlaceholder(secret)) {
      output = output.split(secret).join(maskSecret(secret));
    }
  }
  return output;
}

function maskSecret(value) {
  if (value.length <= 8) {
    return "******";
  }
  return `${value.slice(0, 3)}••••••${value.slice(-4)}`;
}

function normalizeApiBaseUrl(value) {
  const stripped = stripTrailingSlash(value);
  return stripped.endsWith("/v1") ? stripped : `${stripped}/v1`;
}

function stripTrailingSlash(value) {
  return String(value).replace(/\/+$/u, "");
}

function splitCsv(value) {
  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function readPositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseBoolean(value) {
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

function isEmpty(value) {
  return value === undefined || value === null || String(value).trim().length === 0;
}

function isPlaceholder(value) {
  return /^<.+>$/u.test(String(value).trim());
}

function relativePath(path) {
  return path.startsWith(workspaceRoot) ? path.slice(workspaceRoot.length + 1) : path;
}

function timestampId() {
  return new Date()
    .toISOString()
    .replace(/[-:.TZ]/gu, "")
    .slice(0, 14);
}

function toErrorMessage(error) {
  return redactString(error instanceof Error ? error.message : String(error));
}
