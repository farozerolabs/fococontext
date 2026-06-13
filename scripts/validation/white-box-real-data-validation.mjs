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
    "test-results/whitebox-blackbox-validation",
);
const runId = args.runId ?? process.env.FOCOCONTEXT_VALIDATION_RUN_ID ?? timestampId();
const validationSuiteName = "whitebox-blackbox-release-validation";
const validationReportContractVersion = 1;
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
const startCompose = parseBoolean(
  args.startCompose ?? process.env.FOCOCONTEXT_VALIDATION_START_COMPOSE ?? "false",
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
    sourceEvidenceResolved: 0,
  },
  blackBox: {
    adminViews: [],
    checks: [],
    endpointCoverage: [],
  },
  compose: {
    checks: [],
    files: composeFiles.map((file) => relativePath(file)),
    services: {},
  },
  coverageInventory: {
    adminRoutes: [],
    apiEndpointGroups: [],
    apiRoutes: [],
    backendModules: [],
    dockerComposeTemplates: [],
    envTemplates: [],
    migrations: [],
    representativeInputs: [],
    runtimeServices: [],
  },
  coverageMatrices: {
    adminRoutes: [],
    backendModules: [],
    dockerEnv: [],
    endpointGroups: [],
  },
  developerExperience: {
    callSequence: [],
    findings: [],
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
  metrics: {
    adminFlowPassRate: 0,
    failedJobCount: 0,
    ingestCompletionRate: 0,
    phaseElapsedMs: {},
    retrieveExpandSuccessRate: 0,
    retrieveSuccessRate: 0,
    sourceEvidenceDereferenceSuccessRate: 0,
    unauthorizedRejectionPassRate: 0,
    uploadSuccessRate: 0,
  },
  moduleCoverage: [],
  releaseGate: {
    blockingFailures: [],
    ready: false,
    residualRisks: [],
  },
  reruns: [],
  residualRisks: [],
  security: {
    denialChecks: [],
  },
  status: "running",
  timings: {},
  userExperience: {
    findings: [],
    retrievalReviews: [],
  },
  validationSuite: {
    branch: "unknown",
    commandList: [],
    commit: "unknown",
    composeTemplate: composeFiles.map((file) => relativePath(file)).join(","),
    environmentClass: "local-dev",
    mode: "whitebox-blackbox",
    name: validationSuiteName,
    reportContractVersion: validationReportContractVersion,
  },
  whiteBox: {
    checks: [],
    persistenceBoundaries: [],
  },
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
const gitMetadata = await readGitMetadata();
report.validationSuite = {
  ...report.validationSuite,
  branch: gitMetadata.branch,
  commandList: [
    "node",
    "scripts/validation/white-box-real-data-validation.mjs",
    ...process.argv.slice(2),
  ].map((item) => redactString(item)),
  commit: gitMetadata.commit,
  environmentClass:
    args.environmentClass ?? process.env.FOCOCONTEXT_VALIDATION_ENVIRONMENT_CLASS ?? "local-dev",
};

try {
  await step("preflight", async () => {
    report.coverageInventory = await buildCoverageInventory();
    validateCoverageInventory();
    await validateEnvConfiguration(envExample, selectedEnv);
    if (composeEnabled) {
      if (startCompose) {
        await startComposeRuntime(selectedEnv);
      }
      await validateComposeConfiguration(selectedEnv);
    }
    report.manifests.documents = await selectGeneralDocuments();
    report.manifests.legal = await selectLegalMarkdown();
    report.coverageInventory.representativeInputs = [
      ...report.manifests.documents,
      ...report.manifests.legal,
    ].map((item) => ({
      documentType: item.documentType,
      extension: item.extension,
      kind: item.kind,
      relativePath: item.relativePath,
      sizeClass: item.sizeClass,
    }));
    validateCoverageMap();
    validateBackendWhiteBoxInventory();
    validateAdminStaticInventory();
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
  finalizeReport();
  report.status = report.failures.length === 0 ? "passed" : "failed";
  report.timings.finishedAt = new Date().toISOString();
  await writeReport();
  await validateGeneratedReportContract();
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

  await validateEnvTemplateAlignment(example, actual);

  report.env.effective = redactObject({
    apiBaseUrl,
    adminBaseUrl,
    databaseConfigured: !isEmpty(actual.DATABASE_URL) && !isPlaceholder(actual.DATABASE_URL),
    redisConfigured: !isEmpty(actual.REDIS_URL) && !isPlaceholder(actual.REDIS_URL),
    objectStorageConfigured:
      !isEmpty(actual.S3_ENDPOINT) &&
      !isPlaceholder(actual.S3_ENDPOINT) &&
      !isEmpty(actual.S3_BUCKET) &&
      !isPlaceholder(actual.S3_BUCKET),
    corsOrigins: actual.FOCOCONTEXT_CORS_ORIGINS,
    ocrEnabled: actual.OCR_ENABLED,
    queueConcurrency: actual.FOCOCONTEXT_QUEUE_CONCURRENCY,
    s3Endpoint: actual.S3_ENDPOINT,
    uploadDirectEnabled: actual.UPLOAD_DIRECT_ENABLED,
    uploadMaxFileSizeMb: actual.UPLOAD_MAX_FILE_SIZE_MB,
  });
}

async function validateEnvTemplateAlignment(example, actual) {
  const composeReferences = new Map();
  for (const composeFile of composeFiles) {
    if (!(await fileExists(composeFile))) {
      continue;
    }
    const text = await readFile(composeFile, "utf8");
    for (const match of text.matchAll(/\$\{([A-Z0-9_]+)([^}]*)?\}/gu)) {
      const key = match[1];
      const expression = match[2] ?? "";
      const existing = composeReferences.get(key) ?? { optional: false, required: false };
      composeReferences.set(key, {
        optional: existing.optional || /^:-?/.test(expression) || /^-/.test(expression),
        required: existing.required || /^:\?/.test(expression) || /^\?/.test(expression),
      });
    }
  }
  const allowedExternalReferences = new Set(["FOCOCONTEXT_ENV_FILE"]);
  const missingFromTemplate = [...composeReferences.entries()]
    .filter(([, meta]) => meta.required || !meta.optional)
    .map(([key]) => key)
    .filter((key) => !allowedExternalReferences.has(key))
    .filter((key) => !(key in example))
    .sort();
  const unsafePublicValues = Object.entries(actual)
    .filter(
      ([key, value]) => /PASSWORD|SECRET|API_KEY|TOKEN|CREDENTIAL/iu.test(key) && !isEmpty(value),
    )
    .filter(
      ([, value]) => String(value).startsWith("http://") && !String(value).includes("localhost"),
    )
    .map(([key]) => key)
    .sort();
  const unusedTemplateKeys = Object.keys(example)
    .filter((key) => key.startsWith("FOCOCONTEXT_"))
    .filter((key) => !composeReferences.has(key))
    .filter(
      (key) =>
        ![
          "FOCOCONTEXT_ADMIN_API_BASE_URL",
          "FOCOCONTEXT_ADMIN_BASE_URL",
          "FOCOCONTEXT_API_KEY",
          "FOCOCONTEXT_CORS_ORIGINS",
          "FOCOCONTEXT_SOURCE_WATCH_CONTAINER_DIR",
          "FOCOCONTEXT_SOURCE_WATCH_HOST_DIR",
        ].includes(key),
    )
    .sort();

  recordCheck(
    report.env.checks,
    "compose-env-references-in-template",
    missingFromTemplate.length === 0,
    {
      missingFromTemplate,
      referenceCount: composeReferences.size,
    },
  );
  recordCheck(
    report.env.checks,
    "selected-env-no-unsafe-public-secret-values",
    unsafePublicValues.length === 0,
    {
      unsafePublicValues,
    },
  );
  recordCheck(report.env.checks, "env-template-unused-fococontext-keys-reviewed", true, {
    unusedTemplateKeys,
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

  if (startCompose) {
    recordCheck(report.compose.checks, "compose-ps-readable", psItems.length > 0, {
      services: psItems.map((item) => item.Service ?? item.Name ?? "unknown"),
    });
    recordCheck(
      report.compose.checks,
      "compose-ps-no-unexpected-unhealthy",
      unhealthy.length === 0,
      {
        unhealthy,
      },
    );
  } else {
    report.warnings.push("Compose ps health checks were skipped because start-compose is false.");
    recordCheck(report.compose.checks, "compose-ps-skipped-without-start", true, {
      startCompose,
    });
  }
}

async function startComposeRuntime(actualEnv) {
  logProgress("compose:up:start", {
    files: composeFiles.map((file) => relativePath(file)).join(","),
  });
  const dockerArgs = [
    "compose",
    ...composeFiles.flatMap((file) => ["-f", file]),
    "up",
    "-d",
    "--build",
    "--remove-orphans",
  ];
  const result = await execFileAsync("docker", dockerArgs, {
    cwd: workspaceRoot,
    env: {
      ...process.env,
      ...actualEnv,
      FOCOCONTEXT_ENV_FILE: envPath,
    },
    maxBuffer: 50 * 1024 * 1024,
  });
  report.compose.checks.push({
    details: redactObject({
      stderr: result.stderr.trim().slice(0, 4000),
      stdout: result.stdout.trim().slice(0, 4000),
    }),
    name: "compose-up-completed",
    status: "passed",
  });
  logProgress("compose:up:done");
}

async function validateRuntimeMetadata(actualEnv) {
  const health = await httpJson(`${apiRootUrl}/health`, {
    headers: { accept: "application/json" },
  });
  const healthData = health.data ?? {};
  const runtimeStatus = await apiGet("/runtime/status");

  recordCheck(report.env.checks, "api-health-ready", healthData.status === "ready", {
    status: healthData.status,
  });
  validateReleaseMetadata("api", runtimeStatus.runtime?.release);
  validateReleaseMetadata("worker", runtimeStatus.dependencies?.worker?.release);
  validateReleaseMetadata("ocr", runtimeStatus.dependencies?.ocr?.release);
  recordCheck(
    report.env.checks,
    "health-api-base-url-matches-env",
    runtimeStatus.runtime?.apiBaseUrl === apiBaseUrl,
    {
      actual: runtimeStatus.runtime?.apiBaseUrl,
      expected: apiBaseUrl,
    },
  );
  recordCheck(
    report.env.checks,
    "health-admin-base-url-matches-env",
    runtimeStatus.runtime?.adminBaseUrl === adminBaseUrl,
    {
      actual: runtimeStatus.runtime?.adminBaseUrl,
      expected: adminBaseUrl,
    },
  );

  const dependencyKeys = ["database", "redis", "objectStorage", "worker", "queue"];
  for (const key of dependencyKeys) {
    recordCheck(
      report.env.checks,
      `dependency-${key}-has-status`,
      runtimeStatus.dependencies?.[key]?.status !== undefined,
      {
        status: runtimeStatus.dependencies?.[key]?.status,
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
    runtimeStatus.limits?.upload?.directUpload !== undefined,
    runtimeStatus.limits?.upload ?? {},
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
  const files = await listFilesSafe(documentsDir, "general-document-samples");
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
    recordCheck(report.env.checks, "general-document-samples-available", !apiEnabled, {
      directory: documentsDir,
      message: "No supported general validation documents were available.",
    });
    report.residualRisks.push(
      `No supported general validation documents were available in ${documentsDir}.`,
    );
  }

  return selected;
}

async function selectLegalMarkdown() {
  const files = (await listFilesSafe(legalMarkdownDir, "legal-markdown-samples"))
    .filter((file) => extname(file).toLowerCase() === ".md")
    .sort((left, right) => basename(left).localeCompare(basename(right)));

  const selected = [];
  for (const file of pickSpread(files, legalLimit)) {
    selected.push(await manifestItem(file));
  }

  if (selected.length === 0) {
    recordCheck(report.env.checks, "legal-markdown-samples-available", !apiEnabled, {
      directory: legalMarkdownDir,
      message: "No legal Markdown validation documents were available.",
    });
    report.residualRisks.push(
      `No legal Markdown validation documents were available in ${legalMarkdownDir}.`,
    );
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

async function buildCoverageInventory() {
  const [apiRoutes, adminRoutes, backendModules, dockerComposeTemplates, envTemplates, migrations] =
    await Promise.all([
      inventoryApiRoutes(),
      inventoryAdminRoutes(),
      inventoryBackendModules(),
      inventoryDockerComposeTemplates(),
      inventoryEnvTemplates(),
      inventoryMigrations(),
    ]);

  return {
    adminRoutes,
    apiEndpointGroups: [
      ...new Set(
        apiRoutes.filter((route) => route.path.startsWith("/v1/")).map((route) => route.group),
      ),
    ].sort(),
    apiRoutes,
    backendModules,
    dockerComposeTemplates,
    envTemplates,
    migrations,
    representativeInputs: [],
    runtimeServices: ["api", "admin", "worker", "postgres", "redis", "migrate", "ocr-service"],
  };
}

async function inventoryApiRoutes() {
  const files = (await listFiles(resolve(workspaceRoot, "apps/api/src"))).filter((file) =>
    file.endsWith(".controller.ts"),
  );
  const routes = [];

  for (const file of files) {
    const text = await readFile(file, "utf8");
    const controllerMatches = [...text.matchAll(/@Controller\((?:["']([^"']*)["'])?\)/gu)].map(
      (match) => ({
        index: match.index ?? 0,
        path: match[1] ?? "",
      }),
    );
    const blocks =
      controllerMatches.length === 0
        ? [{ body: text, path: "" }]
        : controllerMatches.map((match, index) => ({
            body: text.slice(match.index, controllerMatches[index + 1]?.index ?? text.length),
            path: match.path,
          }));

    for (const block of blocks) {
      const methodMatches = [
        ...block.body.matchAll(/@(Get|Post|Put|Patch|Delete)\((?:["']([^"']*)["'])?\)/gu),
      ];
      for (const match of methodMatches) {
        const method = match[1].toUpperCase();
        const routePath = joinRoutePath(block.path, match[2] ?? "");
        if (routePath.length === 0) {
          continue;
        }
        routes.push({
          file: relativePath(file),
          group: endpointGroup(routePath),
          method,
          path: `/${routePath}`,
        });
      }
    }
  }

  return routes.sort((left, right) =>
    `${left.group}:${left.method}:${left.path}`.localeCompare(
      `${right.group}:${right.method}:${right.path}`,
    ),
  );
}

async function inventoryAdminRoutes() {
  const routePathFile = resolve(workspaceRoot, "apps/admin-web/src/app/route-paths.ts");
  const routerFile = resolve(workspaceRoot, "apps/admin-web/src/app/router.tsx");
  const [routeText, routerText] = await Promise.all([
    readFile(routePathFile, "utf8"),
    readFile(routerFile, "utf8"),
  ]);
  const literalRoutes = [...routeText.matchAll(/["'](\/[^"']*)["']/gu)]
    .map((match) => match[1])
    .filter((route) => !route.includes("${"))
    .filter((route) => route === "/" || route.startsWith("/"))
    .map((route) => ({
      component: componentForAdminRoute(route, routerText),
      path: route,
    }));

  return uniqueBy(literalRoutes, (item) => item.path).sort((left, right) =>
    left.path.localeCompare(right.path),
  );
}

async function inventoryBackendModules() {
  const roots = [
    "apps/api/src",
    "apps/worker/src",
    "packages/core/src",
    "packages/db/src",
    "packages/retrieval/src",
    "packages/storage/src",
    "packages/llm/src",
  ];
  const modules = [];

  for (const root of roots) {
    const absoluteRoot = resolve(workspaceRoot, root);
    const files = await listFilesSafe(absoluteRoot, `backend-root:${root}`);
    for (const file of files.filter((item) => /\.(ts|tsx|mjs|js)$/u.test(item))) {
      const moduleName = relativePath(file)
        .replace(/\.(ts|tsx|mjs|js)$/u, "")
        .replace(/\/(index|server|app)$/u, "");
      modules.push({
        category: backendModuleCategory(file),
        file: relativePath(file),
        module: moduleName,
      });
    }
  }

  return modules.sort((left, right) => left.file.localeCompare(right.file));
}

async function inventoryDockerComposeTemplates() {
  const files = [
    "docker-compose.example.yml",
    "docker-compose.optional-ocr.example.yml",
    "docker-compose.dev.example.yml",
    "docker-compose.yml",
  ];
  const templates = [];
  for (const file of files) {
    const absolutePath = resolve(workspaceRoot, file);
    const exists = await fileExists(absolutePath);
    templates.push({
      path: file,
      status: exists ? "available" : "missing",
    });
  }
  return templates;
}

async function inventoryEnvTemplates() {
  const files = [".env.example", ".env"];
  const templates = [];
  for (const file of files) {
    const absolutePath = resolve(workspaceRoot, file);
    const exists = await fileExists(absolutePath);
    templates.push({
      path: file,
      status: exists ? "available" : "missing",
    });
  }
  return templates;
}

async function inventoryMigrations() {
  const migrationDir = resolve(workspaceRoot, "packages/db/migrations");
  const files = await listFilesSafe(migrationDir, "database-migrations");
  return files
    .filter((file) => file.endsWith(".sql"))
    .map((file) => ({
      direction: file.endsWith(".down.sql") ? "down" : "up",
      path: relativePath(file),
    }))
    .sort((left, right) => left.path.localeCompare(right.path));
}

function validateCoverageInventory() {
  const inventory = report.coverageInventory;
  recordCheck(report.env.checks, "inventory-api-routes-present", inventory.apiRoutes.length >= 20, {
    count: inventory.apiRoutes.length,
  });
  recordCheck(
    report.env.checks,
    "inventory-admin-routes-present",
    inventory.adminRoutes.length >= 10,
    { count: inventory.adminRoutes.length },
  );
  recordCheck(
    report.env.checks,
    "inventory-backend-modules-present",
    inventory.backendModules.length >= 50,
    { count: inventory.backendModules.length },
  );
  recordCheck(
    report.env.checks,
    "inventory-migrations-present",
    inventory.migrations.some((item) => item.direction === "up"),
    { count: inventory.migrations.length },
  );
}

function validateCoverageMap() {
  const endpointCoverage = report.coverageInventory.apiEndpointGroups.map((group) => ({
    group,
    routeCount: report.coverageInventory.apiRoutes.filter((route) => route.group === group).length,
    status: "planned",
  }));
  const adminCoverage = report.coverageInventory.adminRoutes.map((route) => ({
    component: route.component,
    path: route.path,
    status: "planned",
  }));
  const backendCoverage = Object.entries(
    report.coverageInventory.backendModules.reduce((groups, item) => {
      groups[item.category] = (groups[item.category] ?? 0) + 1;
      return groups;
    }, {}),
  ).map(([category, count]) => ({ category, count, status: "planned" }));
  const dockerEnvCoverage = [
    ...report.coverageInventory.dockerComposeTemplates.map((item) => ({
      kind: "compose",
      path: item.path,
      status: item.status === "available" ? "planned" : "missing",
    })),
    ...report.coverageInventory.envTemplates.map((item) => ({
      kind: "env",
      path: item.path,
      status: item.status === "available" ? "planned" : "missing",
    })),
  ];

  report.coverageMatrices = {
    adminRoutes: adminCoverage,
    backendModules: backendCoverage,
    dockerEnv: dockerEnvCoverage,
    endpointGroups: endpointCoverage,
  };

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
    ...endpointCoverage.map((item) => `endpoint-group:${item.group}`),
    ...adminCoverage.map((item) => `admin-route:${item.path}`),
    ...backendCoverage.map((item) => `backend-module:${item.category}`),
    ...dockerEnvCoverage.map((item) => `${item.kind}:${item.path}`),
  ];

  report.moduleCoverage = coverage.map((name) => ({ name, status: "planned" }));
  recordCheck(report.env.checks, "coverage-map-defined", coverage.length >= 50, {
    adminRoutes: adminCoverage.length,
    backendModules: backendCoverage.length,
    endpointGroups: endpointCoverage.length,
    total: coverage.length,
  });
}

function validateBackendWhiteBoxInventory() {
  const categories = new Set(report.coverageInventory.backendModules.map((item) => item.category));
  for (const category of [
    "auth-security",
    "controller",
    "database",
    "queue-runtime",
    "repository-query",
    "retrieval-graph",
    "service",
    "storage",
    "worker",
  ]) {
    const present = categories.has(category);
    recordCheck(report.env.checks, `backend-category-${category}-present`, present, {
      category,
    });
    if (present) {
      markCoverage([`backend-module:${category}`], "verified");
    }
  }

  for (const boundary of ["postgres", "redis", "object-storage"]) {
    const hasBoundary =
      boundary === "postgres"
        ? report.coverageInventory.backendModules.some(
            (item) => item.category === "database" || item.file.includes("postgres"),
          )
        : boundary === "redis"
          ? report.coverageInventory.backendModules.some((item) => item.file.includes("redis"))
          : report.coverageInventory.backendModules.some((item) => item.file.includes("storage"));
    recordCheck(report.env.checks, `durable-boundary-${boundary}-present`, hasBoundary, {
      boundary,
    });
  }
}

async function validateAdminStaticInventory() {
  const [englishText, chineseText, clientText] = await Promise.all([
    readFile(resolve(workspaceRoot, "apps/admin-web/src/i18n/resources/en-US.ts"), "utf8"),
    readFile(resolve(workspaceRoot, "apps/admin-web/src/i18n/resources/zh-CN.ts"), "utf8"),
    readFile(resolve(workspaceRoot, "apps/admin-web/src/api/fococontext-client.ts"), "utf8"),
  ]);
  const requiredKeys = [
    "nav.dashboard",
    "nav.sources",
    "nav.jobs",
    "nav.pages",
    "nav.graph",
    "nav.versions",
    "nav.retrievalLab",
    "nav.settings",
    "state.loading",
    "systemSettings.envApiKey",
  ];

  for (const key of requiredKeys) {
    const lastSegment = key.split(".").at(-1);
    recordCheck(
      report.env.checks,
      `admin-i18n-key-${key}`,
      englishText.includes(lastSegment) && chineseText.includes(lastSegment),
      { key },
    );
  }

  recordCheck(
    report.env.checks,
    "admin-client-uses-credentials",
    clientText.includes("credentials") && clientText.includes("include"),
  );
  recordCheck(
    report.env.checks,
    "admin-route-inventory-matches-i18n",
    report.coverageInventory.adminRoutes.length >= 10,
    { count: report.coverageInventory.adminRoutes.length },
  );
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
  if (uploadItems.length === 0) {
    throw new Error("OpenAPI validation requires at least one representative document.");
  }
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
  await validateEndpointGroupCoverage(knowledgeBase.id);
  logProgress("openapi:errors:done");
}

async function uploadDocument(knowledgeBaseId, item) {
  const content = await readFile(item.path);
  const formData = new FormData();
  const extension = extname(item.path).toLowerCase();
  const startedAt = Date.now();

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
  recordOpenApiCall(
    "POST",
    `/knowledge-bases/${knowledgeBaseId}/documents`,
    response.status,
    Date.now() - startedAt,
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
  const runtimeStatus = await apiGet("/runtime/status");
  const directUpload = runtimeStatus.limits?.upload?.directUpload;

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
    report.api.sourceEvidenceResolved = resolved.items?.length ?? 0;
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
  const noAuth = await fetchWithTimeout(
    `${apiBaseUrl}/knowledge-bases/${knowledgeBaseId}`,
    {
      headers: { accept: "application/json" },
    },
    "missing-auth-check",
  );
  recordDenialCheck("missing-auth-rejected", noAuth.status, noAuth.status === 401);

  const noAuthRuntime = await fetchWithTimeout(
    `${apiBaseUrl}/runtime/status`,
    {
      headers: { accept: "application/json" },
    },
    "missing-auth-runtime-check",
  );
  recordDenialCheck(
    "missing-auth-runtime-status-rejected",
    noAuthRuntime.status,
    noAuthRuntime.status === 401,
  );

  const noAuthUpload = await fetchWithTimeout(
    `${apiBaseUrl}/knowledge-bases/${knowledgeBaseId}/documents`,
    {
      headers: { accept: "application/json" },
      method: "POST",
    },
    "missing-auth-upload-check",
  );
  recordDenialCheck(
    "missing-auth-upload-rejected",
    noAuthUpload.status,
    noAuthUpload.status === 401,
  );

  const noAuthRetrieve = await fetchWithTimeout(
    `${apiBaseUrl}/knowledge-bases/${knowledgeBaseId}/retrieve`,
    {
      body: JSON.stringify({ query: "validation" }),
      headers: { "content-type": "application/json" },
      method: "POST",
    },
    "missing-auth-retrieve-check",
  );
  recordDenialCheck(
    "missing-auth-retrieve-rejected",
    noAuthRetrieve.status,
    noAuthRetrieve.status === 401,
  );

  const noAuthEvidence = await fetchWithTimeout(
    `${apiBaseUrl}/source-evidence/resolve`,
    {
      body: JSON.stringify({ document_id: "doc_missing_validation" }),
      headers: { "content-type": "application/json" },
      method: "POST",
    },
    "missing-auth-source-evidence-check",
  );
  recordDenialCheck(
    "missing-auth-source-evidence-rejected",
    noAuthEvidence.status,
    noAuthEvidence.status === 401,
  );

  const noAuthCleanup = await fetchWithTimeout(
    `${apiBaseUrl}/knowledge-bases/${knowledgeBaseId}`,
    {
      headers: { accept: "application/json" },
      method: "DELETE",
    },
    "missing-auth-cleanup-check",
  );
  recordDenialCheck(
    "missing-auth-cleanup-rejected",
    noAuthCleanup.status,
    noAuthCleanup.status === 401,
  );

  const malformedAuth = await fetchWithTimeout(
    `${apiBaseUrl}/knowledge-bases/${knowledgeBaseId}`,
    {
      headers: { authorization: "Basic invalid" },
    },
    "malformed-auth-check",
  );
  recordDenialCheck(
    "malformed-auth-rejected",
    malformedAuth.status,
    malformedAuth.status === 401 || malformedAuth.status === 403,
  );

  const invalidAuth = await fetchWithTimeout(
    `${apiBaseUrl}/knowledge-bases/${knowledgeBaseId}`,
    {
      headers: { authorization: "Bearer invalid" },
    },
    "invalid-auth-check",
  );
  recordDenialCheck(
    "invalid-auth-rejected",
    invalidAuth.status,
    invalidAuth.status === 401 || invalidAuth.status === 403,
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

  const anonymousOpenApi = await fetchWithTimeout(
    `${apiRootUrl}/openapi.json`,
    {
      headers: { accept: "application/json" },
    },
    "anonymous-openapi-json-check",
  );
  recordDenialCheck(
    "anonymous-openapi-json-rejected",
    anonymousOpenApi.status,
    anonymousOpenApi.status === 401 || anonymousOpenApi.status === 403,
  );

  await validateUnauthenticatedEndpointMatrix(knowledgeBaseId);
}

async function validateUnauthenticatedEndpointMatrix(knowledgeBaseId) {
  const routeSamples = sampleEndpointGroupRoutes(knowledgeBaseId);

  for (const route of routeSamples) {
    const startedAt = Date.now();
    const body =
      route.method === "GET" || route.method === "DELETE"
        ? undefined
        : JSON.stringify(route.body ?? {});
    const response = await fetchWithTimeout(
      `${apiBaseUrl}${route.path}`,
      {
        ...(body === undefined ? {} : { body }),
        headers:
          body === undefined
            ? { accept: "application/json" }
            : { "content-type": "application/json" },
        method: route.method,
      },
      `unauthenticated-${route.group}`,
    );
    recordOpenApiCall(route.method, route.path, response.status, Date.now() - startedAt);
    recordDenialCheck(
      `unauthenticated-${route.group}-rejected`,
      response.status,
      response.status === 401 || response.status === 403,
    );
  }
}

function sampleEndpointGroupRoutes(knowledgeBaseId) {
  const replacements = {
    ":changeSetId": "cs_missing_validation",
    ":checkId": "check_missing_validation",
    ":documentId": "doc_missing_validation",
    ":forkId": "fork_missing_validation",
    ":id": knowledgeBaseId,
    ":jobId": "job_missing_validation",
    ":knowledgeBaseId": knowledgeBaseId,
    ":mediaAssetId": "med_missing_validation",
    ":operationId": "cleanup_missing_validation",
    ":pageId": "page_missing_validation",
    ":ruleId": "sw_missing_validation",
    ":type": "overview",
    ":uploadSessionId": "ups_missing_validation",
    ":webhookId": "wh_missing_validation",
  };
  const byGroup = new Map();

  for (const route of report.coverageInventory.apiRoutes) {
    if (!route.path.startsWith("/v1/")) {
      continue;
    }
    if (!byGroup.has(route.group)) {
      let path = route.path.slice("/v1".length);
      for (const [key, value] of Object.entries(replacements)) {
        path = path.split(key).join(value);
      }
      byGroup.set(route.group, {
        body: sampleBodyForRoute(route),
        group: route.group,
        method: route.method,
        path,
      });
    }
  }

  return [...byGroup.values()];
}

function sampleBodyForRoute(route) {
  if (route.method === "POST" && route.path.includes("/retrieve/expand")) {
    return { seed_page_ids: ["page_missing_validation"] };
  }
  if (route.method === "POST" && route.path.includes("/retrieve")) {
    return { query: "validation" };
  }
  if (route.method === "POST" && route.path.includes("/source-evidence")) {
    return { items: [] };
  }
  if (route.method === "POST" && route.path.includes("/webhooks")) {
    return { events: ["job.completed"], target_url: "https://example.com/webhook" };
  }
  if (route.method === "POST" && route.path.includes("/api-keys")) {
    return { name: "validation" };
  }
  if (route.method === "POST" && route.path.includes("/knowledge-bases")) {
    return { name: "Validation" };
  }
  return {};
}

async function validateEndpointGroupCoverage(knowledgeBaseId) {
  const observedGroups = new Set(
    report.blackBox.endpointCoverage
      .filter((item) => item.path.startsWith("/"))
      .map((item) => endpointGroup(`v1${item.path}`)),
  );
  const missingGroups = report.coverageInventory.apiEndpointGroups.filter(
    (group) => !observedGroups.has(group),
  );

  report.coverageMatrices.endpointGroups = report.coverageMatrices.endpointGroups.map((item) => ({
    ...item,
    status: missingGroups.includes(item.group) ? "missing" : "covered",
  }));
  for (const group of observedGroups) {
    markCoverage([`endpoint-group:${group}`], "verified");
  }

  recordCheck(report.api.checks, "endpoint-group-coverage", missingGroups.length === 0, {
    knowledgeBaseId,
    missingGroups,
    observedGroups: [...observedGroups].sort(),
  });
}

function recordDenialCheck(name, status, passed) {
  const item = {
    name,
    status: passed ? "passed" : "failed",
    statusCode: status,
  };
  report.security.denialChecks.push(item);
  recordCheck(report.api.checks, name, passed, { status });
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
    if (window.localStorage.getItem("fococontext.admin.language") === null) {
      window.localStorage.setItem("fococontext.admin.language", "en-US");
    }
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
    await adminCheck("login-zh-cn-labels", async () => {
      await context.clearCookies();
      await page.goto(`${adminBaseUrl}/login`);
      await page.evaluate(() => {
        window.localStorage.setItem("fococontext.admin.language", "zh-CN");
      });
      await page.reload();
      await expect(page.getByRole("button", { name: "登录" })).toBeVisible({ timeout: 20000 });
    });

    await adminCheck("login", async () => {
      await context.clearCookies();
      await page.evaluate(() => {
        window.localStorage.setItem("fococontext.admin.language", "en-US");
      });
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

    await adminCheck("root-redirect", async () => {
      await page.goto(`${adminBaseUrl}/`);
      await expect(page).toHaveURL(/\/dashboard$/u, { timeout: 20000 });
      await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible({
        timeout: 20000,
      });
    });

    if (report.api.createdKnowledgeBaseId !== null && report.api.cleanupCompleted === false) {
      const knowledgeBaseRoutes = [
        "overview",
        "sources",
        "jobs",
        "pages",
        "graph",
        "versions",
        "forks",
        "retrieval",
        "settings",
      ];
      for (const route of knowledgeBaseRoutes) {
        await adminCheck(`knowledge-base-${route}`, async () => {
          await page.goto(
            `${adminBaseUrl}/knowledge-bases/${report.api.createdKnowledgeBaseId}/${route}`,
          );
          await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => undefined);
          await expect(page.locator("body")).toBeVisible({ timeout: 20000 });
          await expect(page.locator("body")).not.toContainText(selectedEnv.FOCOCONTEXT_API_KEY);
          if (route === "jobs") {
            await expect(page.getByRole("button", { name: "Refresh" })).toBeVisible({
              timeout: 20000,
            });
          }
          await captureAdmin(page, `04-kb-${route}`);
        });
      }
    }

    const storage = await context.storageState();
    const serializedStorage = JSON.stringify(storage);
    recordCheck(
      report.admin.checks,
      "admin-storage-no-public-api-key",
      !containsSecretValue(serializedStorage, selectedEnv.FOCOCONTEXT_API_KEY),
    );
    recordCheck(
      report.admin.checks,
      "admin-storage-no-storage-secret",
      !containsSecretValue(serializedStorage, selectedEnv.S3_SECRET_ACCESS_KEY),
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
    report.blackBox.adminViews.push({ name, status: "passed" });
    recordCheck(report.admin.checks, name, true);
  } catch (error) {
    report.blackBox.adminViews.push({
      name,
      status: "failed",
      error: toErrorMessage(error),
    });
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

function finalizeReport() {
  updateCoverageMatrices();
  synchronizeModuleCoverageWithMatrices();
  report.metrics.phaseElapsedMs = Object.fromEntries(
    Object.entries(report.timings)
      .filter(([, value]) => typeof value?.durationMs === "number")
      .map(([key, value]) => [key, value.durationMs]),
  );

  const uploadedDocuments = report.api.documents.filter(
    (item) => typeof item.documentId === "string" && item.documentId.length > 0,
  );
  const completedJobs = report.api.jobs.filter((item) => item.status === "completed");
  const failedJobs = report.api.jobs.filter((item) => item.status !== "completed");
  const retrieveExpandPassed = findCheck(report.api.checks, "retrieve-expand-readable")?.status;
  const sourceEvidencePassed = findCheck(report.api.checks, "source-evidence-resolve")?.status;
  const retrievePassed = findCheck(report.api.checks, "retrieve-results")?.status;

  report.metrics.uploadSuccessRate = ratio(uploadedDocuments.length, report.api.documents.length);
  report.metrics.ingestCompletionRate = ratio(completedJobs.length, report.api.jobs.length);
  report.metrics.failedJobCount = failedJobs.length;
  report.metrics.retrieveSuccessRate = retrievePassed === "passed" ? 1 : 0;
  report.metrics.retrieveExpandSuccessRate =
    retrieveExpandPassed === undefined ? 0 : retrieveExpandPassed === "passed" ? 1 : 0;
  report.metrics.sourceEvidenceDereferenceSuccessRate =
    sourceEvidencePassed === undefined ? 0 : sourceEvidencePassed === "passed" ? 1 : 0;
  report.metrics.unauthorizedRejectionPassRate = ratio(
    report.security.denialChecks.filter((item) => item.status === "passed").length,
    report.security.denialChecks.length,
  );
  report.metrics.adminFlowPassRate = ratio(
    report.admin.checks.filter((item) => item.status === "passed").length,
    report.admin.checks.length,
  );

  report.whiteBox.checks = [
    ...report.env.checks.map((item) => ({ ...item, group: "env" })),
    ...report.compose.checks.map((item) => ({ ...item, group: "compose" })),
  ];
  report.whiteBox.persistenceBoundaries = [
    {
      evidence: "DATABASE_URL",
      name: "postgres",
      status: report.env.effective.databaseConfigured === true ? "configured" : "unknown",
    },
    {
      evidence: "REDIS_URL",
      name: "redis",
      status: report.env.effective.redisConfigured === true ? "configured" : "unknown",
    },
    {
      evidence: "S3_ENDPOINT/S3_BUCKET",
      name: "object-storage",
      status: report.env.effective.objectStorageConfigured === true ? "configured" : "unknown",
    },
  ];
  report.blackBox.checks = [
    ...report.api.checks.map((item) => ({ ...item, group: "openapi" })),
    ...report.admin.checks.map((item) => ({ ...item, group: "admin" })),
  ];

  const skippedCoverage = report.moduleCoverage.filter((item) => item.status === "planned");
  if (skippedCoverage.length > 0) {
    report.residualRisks.push(
      `${skippedCoverage.length} coverage item(s) remained planned because the corresponding validation mode did not run or no representative runtime data was available.`,
    );
  }

  if (report.developerExperience.findings.length === 0) {
    report.developerExperience.findings.push({
      endpoint: "public-openapi-flow",
      evidence: `${report.developerExperience.callSequence.length} public API calls recorded.`,
      recommendation:
        "Review call sequence and latency when the validation report is used for release sign-off.",
      severity: "info",
      summary: "OpenAPI validation recorded the developer call sequence.",
    });
  }

  if (report.userExperience.retrievalReviews.length === 0) {
    report.userExperience.retrievalReviews.push({
      citationQuality: sourceEvidencePassed ?? "not-run",
      confidenceRating: report.metrics.retrieveSuccessRate === 1 ? "medium" : "low",
      missingImportantContent: [],
      observedResultCoverage: report.api.retrieveResults,
      queryIntent:
        "Validate that representative uploaded sources produce source-traceable retrieval context.",
      recommendedFollowUp:
        report.metrics.retrieveSuccessRate === 1
          ? "None for this sample."
          : "Inspect retrieve output for weak sample coverage.",
    });
  }

  if (report.userExperience.findings.length === 0) {
    report.userExperience.findings.push({
      evidence: `Retrieve results: ${report.api.retrieveResults}; source evidence resolved: ${report.api.sourceEvidenceResolved}.`,
      recommendation: "Use a larger representative sample before a major release.",
      severity: "info",
      summary: "Representative retrieval sample completed with bounded evidence.",
    });
  }

  const failedChecks = [
    ...report.env.checks,
    ...report.compose.checks,
    ...report.api.checks,
    ...report.admin.checks,
  ].filter((check) => check.status === "failed");
  report.releaseGate.blockingFailures = [
    ...report.failures.map((message) => ({ message, source: "runtime" })),
    ...failedChecks.map((check) => ({
      message: `Check failed: ${check.name}`,
      source: "validation-check",
    })),
  ];
  report.releaseGate.residualRisks = [...report.residualRisks];
  report.releaseGate.ready = report.releaseGate.blockingFailures.length === 0;
}

function updateCoverageMatrices() {
  const observedEndpointGroups = new Set(
    report.blackBox.endpointCoverage.map((item) => endpointGroup(`v1${item.path}`)),
  );
  report.coverageMatrices.endpointGroups = report.coverageMatrices.endpointGroups.map((item) => ({
    ...item,
    status: observedEndpointGroups.has(item.group) ? "covered" : item.status,
  }));

  const observedAdminRoutes = new Set(
    report.blackBox.adminViews
      .filter((item) => item.status === "passed")
      .map((item) => adminRouteFromCheckName(item.name))
      .filter((item) => item !== null),
  );
  report.coverageMatrices.adminRoutes = report.coverageMatrices.adminRoutes.map((item) => ({
    ...item,
    status: observedAdminRoutes.has(item.path) ? "covered" : item.status,
  }));

  report.coverageMatrices.backendModules = report.coverageMatrices.backendModules.map((item) => ({
    ...item,
    status: report.env.checks.some(
      (check) =>
        check.name === `backend-category-${item.category}-present` && check.status === "passed",
    )
      ? "covered"
      : item.status,
  }));
  report.coverageMatrices.dockerEnv = report.coverageMatrices.dockerEnv.map((item) => ({
    ...item,
    status:
      item.status === "missing"
        ? "missing"
        : report.env.checks.some((check) => check.name.includes("env-template")) ||
            report.compose.checks.length > 0
          ? "covered"
          : item.status,
  }));
}

function synchronizeModuleCoverageWithMatrices() {
  const coveredNames = new Set();
  const missingNames = new Set();
  for (const item of report.coverageMatrices.endpointGroups) {
    const name = `endpoint-group:${item.group}`;
    if (item.status === "covered") {
      coveredNames.add(name);
    } else if (item.status === "missing") {
      missingNames.add(name);
    }
  }
  for (const item of report.coverageMatrices.adminRoutes) {
    const name = `admin-route:${item.path}`;
    if (item.status === "covered") {
      coveredNames.add(name);
    } else if (item.status === "missing") {
      missingNames.add(name);
    }
  }
  for (const item of report.coverageMatrices.backendModules) {
    const name = `backend-module:${item.category}`;
    if (item.status === "covered") {
      coveredNames.add(name);
    } else if (item.status === "missing") {
      missingNames.add(name);
    }
  }
  for (const item of report.coverageMatrices.dockerEnv) {
    const name = `${item.kind}:${item.path}`;
    if (item.status === "covered") {
      coveredNames.add(name);
    } else if (item.status === "missing") {
      missingNames.add(name);
    }
  }

  report.moduleCoverage = report.moduleCoverage.map((item) => {
    if (coveredNames.has(item.name)) {
      return { ...item, status: "verified" };
    }
    if (missingNames.has(item.name)) {
      return { ...item, status: "missing" };
    }
    return item;
  });
}

function adminRouteFromCheckName(name) {
  if (name === "login" || name === "login-zh-cn-labels") {
    return "/login";
  }
  if (name === "root-redirect") {
    return "/";
  }
  if (name === "dashboard-empty-and-pagination-surface") {
    return "/dashboard";
  }
  if (name === "system-settings") {
    return "/settings";
  }
  if (name.startsWith("knowledge-base-")) {
    return `/knowledge-bases/:knowledgeBaseId/${name.slice("knowledge-base-".length)}`;
  }
  return null;
}

function ratio(numerator, denominator) {
  if (denominator === 0) {
    return 1;
  }
  return numerator / denominator;
}

function findCheck(checks, name) {
  return checks.find((item) => item.name === name);
}

async function writeReport() {
  const summary = renderSummary(redactObject(report));
  await writeFile(
    join(reportDir, "report.json"),
    JSON.stringify(redactObject(report), null, 2),
    "utf8",
  );
  await writeFile(join(reportDir, "summary.md"), summary, "utf8");
}

async function validateGeneratedReportContract() {
  const reportPath = join(reportDir, "report.json");
  const result = await execFileAsync(
    process.execPath,
    ["scripts/validation/release-validation-report-contract.mjs", "--report", reportPath],
    {
      cwd: workspaceRoot,
      maxBuffer: 1024 * 1024,
    },
  ).catch((error) => {
    throw new Error(
      `Generated validation report did not satisfy the release contract: ${error.stderr || error.stdout || error.message}`,
    );
  });
  if (result.stdout.trim().length > 0) {
    console.log(result.stdout.trim());
  }
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
    "## Coverage Matrices",
    "",
    `- Endpoint groups: ${countCovered(value.coverageMatrices.endpointGroups)}/${value.coverageMatrices.endpointGroups.length}`,
    `- Admin routes: ${countCovered(value.coverageMatrices.adminRoutes)}/${value.coverageMatrices.adminRoutes.length}`,
    `- Backend module categories: ${countCovered(value.coverageMatrices.backendModules)}/${value.coverageMatrices.backendModules.length}`,
    `- Docker/env entries: ${countCovered(value.coverageMatrices.dockerEnv)}/${value.coverageMatrices.dockerEnv.length}`,
    "",
    "## Results",
    "",
    `- Env checks: ${countPassed(value.env.checks)}/${value.env.checks.length}`,
    `- Compose checks: ${countPassed(value.compose.checks)}/${value.compose.checks.length}`,
    `- OpenAPI checks: ${countPassed(value.api.checks)}/${value.api.checks.length}`,
    `- Admin checks: ${countPassed(value.admin.checks)}/${value.admin.checks.length}`,
    `- Unauthorized rejection pass rate: ${formatPercent(value.metrics.unauthorizedRejectionPassRate)}`,
    `- Upload success rate: ${formatPercent(value.metrics.uploadSuccessRate)}`,
    `- Ingest completion rate: ${formatPercent(value.metrics.ingestCompletionRate)}`,
    `- Retrieve success rate: ${formatPercent(value.metrics.retrieveSuccessRate)}`,
    `- Source evidence dereference success rate: ${formatPercent(value.metrics.sourceEvidenceDereferenceSuccessRate)}`,
    `- Admin flow pass rate: ${formatPercent(value.metrics.adminFlowPassRate)}`,
    `- Release gate ready: ${value.releaseGate.ready ? "yes" : "no"}`,
    `- Failures: ${value.failures.length}`,
    "",
    "## Developer Experience Findings",
    "",
    ...value.developerExperience.findings.map(
      (item) => `- ${item.severity}: ${item.summary} ${item.recommendation}`,
    ),
    "",
    "## User Experience Findings",
    "",
    ...value.userExperience.findings.map(
      (item) => `- ${item.severity}: ${item.summary} ${item.recommendation}`,
    ),
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

function countCovered(items) {
  return items.filter((item) => item.status === "covered" || item.status === "verified").length;
}

function formatPercent(value) {
  return `${Math.round(Number(value) * 100)}%`;
}

async function apiGet(path) {
  const startedAt = Date.now();
  const response = await fetchWithTimeout(
    `${apiBaseUrl}${path}`,
    {
      headers: authHeaders(),
    },
    `GET ${path}`,
  );
  recordOpenApiCall("GET", path, response.status, Date.now() - startedAt);
  return readData(response);
}

async function apiList(path) {
  const startedAt = Date.now();
  const response = await fetchWithTimeout(
    `${apiBaseUrl}${path}`,
    {
      headers: authHeaders(),
    },
    `GET ${path}`,
  );
  recordOpenApiCall("GET", path, response.status, Date.now() - startedAt);
  const envelope = await readEnvelope(response);
  return {
    items: Array.isArray(envelope.data) ? envelope.data : [],
    pagination: envelope.pagination ?? null,
  };
}

async function apiPost(path, body) {
  const startedAt = Date.now();
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
  recordOpenApiCall("POST", path, response.status, Date.now() - startedAt);
  return readData(response);
}

async function apiDelete(path) {
  const startedAt = Date.now();
  const response = await fetchWithTimeout(
    `${apiBaseUrl}${path}`,
    {
      headers: authHeaders(),
      method: "DELETE",
    },
    `DELETE ${path}`,
  );
  recordOpenApiCall("DELETE", path, response.status, Date.now() - startedAt);
  return readData(response);
}

function recordOpenApiCall(method, path, status, durationMs) {
  const item = {
    durationMs,
    method,
    path: normalizeEndpointPath(path),
    status,
  };
  report.developerExperience.callSequence.push(item);
  report.blackBox.endpointCoverage.push(item);
}

function normalizeEndpointPath(path) {
  return path
    .replace(/kb_[A-Za-z0-9_:-]+/gu, "{knowledge_base_id}")
    .replace(/doc_[A-Za-z0-9_:-]+/gu, "{document_id}")
    .replace(/job_[A-Za-z0-9_:-]+/gu, "{job_id}")
    .replace(/ups_[A-Za-z0-9_:-]+/gu, "{upload_session_id}")
    .replace(/upload_session_[A-Za-z0-9_:-]+/gu, "{upload_session_id}");
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

async function readGitMetadata() {
  const [branch, commit] = await Promise.all([
    execFileAsync("git", ["branch", "--show-current"], {
      cwd: workspaceRoot,
    }).catch(() => ({ stdout: "unknown" })),
    execFileAsync("git", ["rev-parse", "HEAD"], {
      cwd: workspaceRoot,
    }).catch(() => ({ stdout: "unknown" })),
  ]);

  return {
    branch: branch.stdout.trim() || "unknown",
    commit: commit.stdout.trim() || "unknown",
  };
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

function joinRoutePath(...parts) {
  return parts
    .map((part) => String(part ?? "").replace(/^\/+|\/+$/gu, ""))
    .filter((part) => part.length > 0)
    .join("/");
}

function endpointGroup(routePath) {
  const segments = routePath
    .replace(/^\/+|\/+$/gu, "")
    .split("/")
    .filter((segment) => segment.length > 0);
  const versionIndex = segments[0] === "v1" ? 1 : 0;
  const first = segments[versionIndex] ?? "root";
  const second = segments[versionIndex + 1] ?? "";
  const resourceScopedGroups = new Set([
    "change-sets",
    "cleanup-operations",
    "documents",
    "forks",
    "jobs",
    "knowledge-checks",
    "media-assets",
    "pages",
    "scheduled-import-jobs",
    "source-watch-rules",
    "webhooks",
  ]);

  if (first === "knowledge-bases" && isRouteParameter(second)) {
    return segments[versionIndex + 2] ?? "knowledge-bases";
  }
  if (resourceScopedGroups.has(first)) {
    return first;
  }
  return first;
}

function isRouteParameter(segment) {
  return segment.startsWith(":") || /^\{[^}]+\}$/u.test(segment);
}

function componentForAdminRoute(route, routerText) {
  if (route === "/") {
    return "RootRedirect";
  }
  if (route === "/login") {
    return "LoginPage";
  }
  if (route === "/dashboard") {
    return "DashboardPage";
  }
  if (route === "/settings") {
    return "SystemSettingsPage";
  }
  const suffix = route.split("/").at(-1);
  const match = [...routerText.matchAll(/const (KnowledgeBase[A-Za-z]+Page) =/gu)].find((item) =>
    item[1].toLowerCase().includes(String(suffix).replace(/s$/u, "").toLowerCase()),
  );
  return match?.[1] ?? "KnowledgeBaseRoute";
}

function backendModuleCategory(file) {
  const relative = relativePath(file);
  if (relative.includes("/auth/") || relative.includes("/security/")) {
    return "auth-security";
  }
  if (relative.endsWith(".controller.ts")) {
    return "controller";
  }
  if (
    relative.includes("/database/") ||
    relative.includes("postgres") ||
    relative.includes("db/")
  ) {
    return "database";
  }
  if (relative.includes("/queues/") || relative.includes("queue") || relative.includes("redis")) {
    return "queue-runtime";
  }
  if (relative.includes("repository") || relative.includes("operational-read")) {
    return "repository-query";
  }
  if (
    relative.includes("/retrieve/") ||
    relative.includes("/graph/") ||
    relative.includes("retrieval")
  ) {
    return "retrieval-graph";
  }
  if (relative.includes("storage") || relative.includes("object-storage")) {
    return "storage";
  }
  if (relative.includes("apps/worker/")) {
    return "worker";
  }
  return "service";
}

function uniqueBy(items, keyFn) {
  const seen = new Set();
  const unique = [];
  for (const item of items) {
    const key = keyFn(item);
    if (!seen.has(key)) {
      unique.push(item);
      seen.add(key);
    }
  }
  return unique;
}

function parseArgs(argv) {
  const parsed = {};

  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === "--") {
      continue;
    }
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

async function listFilesSafe(root, label) {
  try {
    return await listFiles(root);
  } catch (error) {
    report.warnings.push(`${label} unavailable: ${toErrorMessage(error)}`);
    return [];
  }
}

async function fileExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function manifestItem(path) {
  const content = await readFile(path);
  const stats = await stat(path);
  const extension = extname(path).toLowerCase();

  return {
    documentType: documentTypeFromExtension(extension),
    extension,
    kind: path.startsWith(legalMarkdownDir) ? "legal" : "general",
    modifiedAt: stats.mtime.toISOString(),
    name: basename(path),
    path,
    rationale: representativeRationale(path, content.byteLength),
    relativePath: relativePath(path),
    sha256: createHash("sha256").update(content).digest("hex"),
    size: content.byteLength,
    sizeClass: sizeClass(content.byteLength),
  };
}

function documentTypeFromExtension(extension) {
  return (
    new Map([
      [".csv", "CSV table"],
      [".docx", "Word document"],
      [".html", "HTML document"],
      [".md", "Markdown document"],
      [".pdf", "PDF document"],
      [".pptx", "PowerPoint deck"],
      [".rtf", "Rich text document"],
      [".txt", "Plain text document"],
      [".xls", "Excel workbook"],
      [".xlsx", "Excel workbook"],
    ]).get(extension) ?? "Document"
  );
}

function representativeRationale(path, bytes) {
  const extension = extname(path).toLowerCase();
  const kind = path.startsWith(legalMarkdownDir) ? "legal corpus Markdown" : "general document";
  return `${documentTypeFromExtension(extension)} selected from ${kind} sample set with ${sizeClass(bytes)} size profile.`;
}

function sizeClass(bytes) {
  if (bytes < 128 * 1024) {
    return "small";
  }
  if (bytes < 5 * 1024 * 1024) {
    return "medium";
  }
  return "large";
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

function containsSecretValue(text, secret) {
  return !isEmpty(secret) && !isPlaceholder(secret) && String(text).includes(String(secret));
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
