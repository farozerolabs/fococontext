#!/usr/bin/env node
import { readFile } from "node:fs/promises";

const args = parseArgs(process.argv.slice(2));

try {
  if (args.selfTest === "true") {
    runSelfTest();
  } else {
    const report = await loadReport(args);
    validateReport(report);
  }
  console.log("Release validation report contract passed.");
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

async function loadReport(options) {
  if (options.fixture === "missing-fields") {
    return {
      metadata: {
        generatedAt: new Date().toISOString(),
        runId: "missing-fields",
      },
    };
  }

  if (options.fixture === "valid") {
    return validFixture();
  }

  const reportPath = options.report ?? options._?.[0];
  if (typeof reportPath !== "string" || reportPath.trim().length === 0) {
    throw new Error(
      "Usage: node scripts/validation/release-validation-report-contract.mjs --report <report.json>",
    );
  }

  return JSON.parse(await readFile(reportPath, "utf8"));
}

function runSelfTest() {
  let missingFieldsFailed = false;
  try {
    validateReport({ metadata: { generatedAt: new Date().toISOString(), runId: "self-test" } });
  } catch {
    missingFieldsFailed = true;
  }

  if (!missingFieldsFailed) {
    throw new Error("Self-test failed: missing-field fixture was accepted.");
  }

  validateReport(validFixture());
}

function validateReport(report) {
  const missing = [];

  requireString(report, "metadata.generatedAt", missing);
  requireString(report, "metadata.runId", missing);
  requireString(report, "validationSuite.name", missing);
  requireString(report, "validationSuite.mode", missing);
  requireNumber(report, "validationSuite.reportContractVersion", missing);
  requireString(report, "validationSuite.environmentClass", missing);
  requireArray(report, "validationSuite.commandList", missing);
  requireString(report, "validationSuite.branch", missing);
  requireString(report, "validationSuite.commit", missing);
  requireString(report, "validationSuite.composeTemplate", missing);

  requireArray(report, "whiteBox.checks", missing);
  requireArray(report, "whiteBox.persistenceBoundaries", missing);
  requireArray(report, "blackBox.checks", missing);
  requireArray(report, "blackBox.endpointCoverage", missing);
  requireArray(report, "blackBox.adminViews", missing);
  requireArray(report, "coverageInventory.apiRoutes", missing);
  requireArray(report, "coverageInventory.apiEndpointGroups", missing);
  requireArray(report, "coverageInventory.adminRoutes", missing);
  requireArray(report, "coverageInventory.backendModules", missing);
  requireArray(report, "coverageInventory.dockerComposeTemplates", missing);
  requireArray(report, "coverageInventory.envTemplates", missing);
  requireArray(report, "coverageInventory.migrations", missing);
  requireArray(report, "coverageInventory.representativeInputs", missing);
  requireArray(report, "coverageInventory.runtimeServices", missing);
  requireArray(report, "coverageMatrices.endpointGroups", missing);
  requireArray(report, "coverageMatrices.adminRoutes", missing);
  requireArray(report, "coverageMatrices.backendModules", missing);
  requireArray(report, "coverageMatrices.dockerEnv", missing);
  requireArray(report, "security.denialChecks", missing);
  requireArray(report, "developerExperience.findings", missing);
  requireArray(report, "developerExperience.callSequence", missing);
  requireArray(report, "userExperience.findings", missing);
  requireArray(report, "userExperience.retrievalReviews", missing);
  requireArray(report, "moduleCoverage", missing);
  requireArray(report, "residualRisks", missing);
  requireBoolean(report, "releaseGate.ready", missing);
  requireArray(report, "releaseGate.blockingFailures", missing);
  requireArray(report, "releaseGate.residualRisks", missing);

  for (const key of [
    "uploadSuccessRate",
    "ingestCompletionRate",
    "failedJobCount",
    "retrieveSuccessRate",
    "retrieveExpandSuccessRate",
    "sourceEvidenceDereferenceSuccessRate",
    "unauthorizedRejectionPassRate",
    "adminFlowPassRate",
  ]) {
    requireNumber(report, `metrics.${key}`, missing);
  }
  requireObject(report, "metrics.phaseElapsedMs", missing);

  const selectedFiles = [
    ...requireArray(report, "manifests.documents", missing),
    ...requireArray(report, "manifests.legal", missing),
  ];
  for (const [index, item] of selectedFiles.entries()) {
    for (const field of [
      "documentType",
      "extension",
      "kind",
      "name",
      "path",
      "rationale",
      "relativePath",
      "sha256",
      "sizeClass",
    ]) {
      if (typeof item?.[field] !== "string" && field !== "size") {
        missing.push(`selectedFiles[${index}].${field}`);
      }
    }
    if (typeof item?.size !== "number") {
      missing.push(`selectedFiles[${index}].size`);
    }
  }

  const serialized = JSON.stringify(report);
  const leakedMarkers = ["Bearer ", "sk-", "xoxb-", "AKIA", "-----BEGIN PRIVATE KEY-----"].filter(
    (marker) => serialized.includes(marker),
  );
  if (leakedMarkers.length > 0) {
    missing.push(`secretRedaction(${leakedMarkers.join(",")})`);
  }

  if (missing.length > 0) {
    throw new Error(
      `Release validation report contract failed. Missing or invalid fields: ${missing.join(", ")}`,
    );
  }
}

function requireString(value, path, missing) {
  const item = getPath(value, path);
  if (typeof item !== "string" || item.trim().length === 0) {
    missing.push(path);
  }
  return item;
}

function requireNumber(value, path, missing) {
  const item = getPath(value, path);
  if (typeof item !== "number" || !Number.isFinite(item)) {
    missing.push(path);
  }
  return item;
}

function requireBoolean(value, path, missing) {
  const item = getPath(value, path);
  if (typeof item !== "boolean") {
    missing.push(path);
  }
  return item;
}

function requireArray(value, path, missing) {
  const item = getPath(value, path);
  if (!Array.isArray(item)) {
    missing.push(path);
    return [];
  }
  return item;
}

function requireObject(value, path, missing) {
  const item = getPath(value, path);
  if (item === null || typeof item !== "object" || Array.isArray(item)) {
    missing.push(path);
    return {};
  }
  return item;
}

function getPath(value, path) {
  return path.split(".").reduce((current, key) => current?.[key], value);
}

function validFixture() {
  const selectedFile = {
    documentType: "Markdown",
    extension: ".md",
    kind: "general",
    modifiedAt: new Date().toISOString(),
    name: "sample.md",
    path: "/tmp/sample.md",
    rationale: "Representative small Markdown source.",
    relativePath: "sample.md",
    sha256: "0".repeat(64),
    size: 128,
    sizeClass: "small",
  };

  return {
    admin: { checks: [], screenshots: [] },
    api: { checks: [] },
    blackBox: { adminViews: [], checks: [], endpointCoverage: [] },
    compose: { checks: [] },
    coverageInventory: {
      adminRoutes: [{ component: "DashboardPage", path: "/dashboard" }],
      apiEndpointGroups: ["knowledge-bases"],
      apiRoutes: [
        {
          file: "apps/api/src/knowledge-bases/knowledge-base.controller.ts",
          group: "knowledge-bases",
          method: "GET",
          path: "/v1/knowledge-bases",
        },
      ],
      backendModules: [
        {
          category: "controller",
          file: "apps/api/src/knowledge-bases/knowledge-base.controller.ts",
          module: "apps/api/src/knowledge-bases/knowledge-base.controller",
        },
      ],
      dockerComposeTemplates: [{ path: "docker-compose.dev.example.yml", status: "available" }],
      envTemplates: [{ path: ".env.example", status: "available" }],
      migrations: [{ direction: "up", path: "packages/db/migrations/0001.up.sql" }],
      representativeInputs: [
        {
          documentType: "Markdown",
          extension: ".md",
          kind: "general",
          relativePath: "sample.md",
          sizeClass: "small",
        },
      ],
      runtimeServices: ["api", "admin", "worker", "postgres", "redis"],
    },
    coverageMatrices: {
      adminRoutes: [{ component: "DashboardPage", path: "/dashboard", status: "covered" }],
      backendModules: [{ category: "controller", count: 1, status: "covered" }],
      dockerEnv: [{ kind: "compose", path: "docker-compose.dev.example.yml", status: "covered" }],
      endpointGroups: [{ group: "knowledge-bases", routeCount: 1, status: "covered" }],
    },
    developerExperience: { callSequence: [], findings: [] },
    env: { checks: [] },
    failures: [],
    manifests: { documents: [selectedFile], legal: [] },
    metadata: {
      generatedAt: new Date().toISOString(),
      runId: "valid-fixture",
    },
    metrics: {
      adminFlowPassRate: 1,
      failedJobCount: 0,
      ingestCompletionRate: 1,
      phaseElapsedMs: {},
      retrieveExpandSuccessRate: 1,
      retrieveSuccessRate: 1,
      sourceEvidenceDereferenceSuccessRate: 1,
      unauthorizedRejectionPassRate: 1,
      uploadSuccessRate: 1,
    },
    moduleCoverage: [],
    releaseGate: { blockingFailures: [], ready: true, residualRisks: [] },
    residualRisks: [],
    security: { denialChecks: [] },
    status: "passed",
    userExperience: { findings: [], retrievalReviews: [] },
    validationSuite: {
      branch: "dev",
      commandList: ["node scripts/validation/example.mjs"],
      commit: "local",
      composeTemplate: "docker-compose.dev.example.yml",
      environmentClass: "local-dev",
      mode: "whitebox-blackbox",
      name: "whitebox-blackbox-release-validation",
      reportContractVersion: 1,
    },
    whiteBox: { checks: [], persistenceBoundaries: [] },
  };
}

function parseArgs(argv) {
  const parsed = { _: [] };

  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) {
      parsed._.push(item);
      continue;
    }
    const key = item.slice(2).replace(/-([a-z])/gu, (_match, letter) => letter.toUpperCase());
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
