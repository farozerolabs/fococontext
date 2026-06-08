#!/usr/bin/env node

import { spawnSync } from "node:child_process";

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (result.status !== 0 && !options.allowFailure) {
    const detail =
      result.stderr.trim() || result.stdout.trim() || `${command} exited with ${result.status}`;
    throw new Error(detail);
  }

  return {
    ok: result.status === 0,
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim(),
  };
}

function readComposeConfig(composeFile) {
  const composeArgs = composeFile === undefined ? [] : ["-f", composeFile];
  const primary = run("docker", ["compose", ...composeArgs, "config", "--format", "json"], {
    allowFailure: true,
  });

  if (primary.ok) {
    return JSON.parse(primary.stdout);
  }

  const template = run("docker", [
    "compose",
    "-f",
    "docker-compose.example.yml",
    "config",
    "--format",
    "json",
  ]);

  return JSON.parse(template.stdout);
}

function lines(value) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function declaredVolumes(config) {
  const logicalNames = new Set();
  const concreteNames = new Set();

  for (const [logicalName, volume] of Object.entries(config.volumes ?? {})) {
    logicalNames.add(logicalName);
    if (volume && typeof volume === "object" && typeof volume.name === "string") {
      concreteNames.add(volume.name);
    }
  }

  return { logicalNames, concreteNames };
}

function inspectVolume(volumeName) {
  const result = run("docker", ["volume", "inspect", volumeName]);
  const inspected = JSON.parse(result.stdout);
  return inspected[0] ?? {};
}

function isVolumeMounted(volumeName) {
  const result = run("docker", [
    "ps",
    "-a",
    "--filter",
    `volume=${volumeName}`,
    "--format",
    "{{.ID}}",
  ]);
  return lines(result.stdout).length > 0;
}

function pruneProjectImages(projectName, dryRun) {
  if (dryRun) {
    console.log(`[dry-run] Would prune dangling images for Compose project ${projectName}.`);
    return;
  }

  const result = run("docker", [
    "image",
    "prune",
    "-f",
    "--filter",
    `label=com.docker.compose.project=${projectName}`,
  ]);

  if (result.stdout) {
    console.log(result.stdout);
  }
}

function collectStaleVolumes(projectName, declared) {
  const result = run("docker", [
    "volume",
    "ls",
    "--filter",
    `label=com.docker.compose.project=${projectName}`,
    "--format",
    "{{.Name}}",
  ]);

  const staleVolumes = [];

  for (const volumeName of lines(result.stdout)) {
    const inspected = inspectVolume(volumeName);
    const labels = inspected.Labels ?? {};
    const logicalName = labels["com.docker.compose.volume"];
    const isDeclared =
      declared.concreteNames.has(volumeName) ||
      (typeof logicalName === "string" && declared.logicalNames.has(logicalName));

    if (!isDeclared && !isVolumeMounted(volumeName)) {
      staleVolumes.push(volumeName);
    }
  }

  return staleVolumes;
}

function removeVolumes(volumeNames, dryRun) {
  if (volumeNames.length === 0) {
    console.log("No stale project volumes to remove.");
    return;
  }

  if (dryRun) {
    console.log(`[dry-run] Would remove stale project volumes: ${volumeNames.join(", ")}`);
    return;
  }

  const result = run("docker", ["volume", "rm", ...volumeNames]);

  if (result.stdout) {
    console.log(result.stdout);
  }
}

function main() {
  const dryRun = process.argv.includes("--dry-run");
  const skipImages = process.argv.includes("--skip-images");
  const skipVolumes = process.argv.includes("--skip-volumes");
  const composeFileArgIndex = process.argv.indexOf("--compose-file");
  const composeFile =
    composeFileArgIndex === -1 ? undefined : process.argv[composeFileArgIndex + 1];

  if (composeFileArgIndex !== -1 && (composeFile === undefined || composeFile.startsWith("--"))) {
    throw new Error("Missing value for --compose-file.");
  }

  const config = readComposeConfig(composeFile);
  const projectName = process.env.FOCOCONTEXT_DOCKER_PROJECT || config.name;

  if (!projectName) {
    throw new Error("Unable to resolve the Docker Compose project name.");
  }

  console.log(`Cleaning Docker resources for Compose project: ${projectName}`);

  if (!skipImages) {
    pruneProjectImages(projectName, dryRun);
  }

  if (!skipVolumes) {
    removeVolumes(collectStaleVolumes(projectName, declaredVolumes(config)), dryRun);
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
