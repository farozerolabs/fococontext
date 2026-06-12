#!/usr/bin/env node

import { spawnSync } from "node:child_process";

const composeFile = "docker-compose.dev.example.yml";

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: options.env ?? process.env,
    stdio: options.stdio ?? ["ignore", "pipe", "pipe"],
  });

  if (result.status !== 0 && !options.allowFailure) {
    const detail =
      result.stderr?.trim() || result.stdout?.trim() || `${command} exited with ${result.status}`;
    throw new Error(detail);
  }

  return {
    ok: result.status === 0,
    stdout: result.stdout?.trim() ?? "",
    stderr: result.stderr?.trim() ?? "",
  };
}

function gitValue(args, fallback) {
  const result = run("git", args, { allowFailure: true });
  return result.ok && result.stdout.length > 0 ? result.stdout : fallback;
}

function releaseEnvironment() {
  return {
    ...process.env,
    FOCOCONTEXT_RELEASE_BUILD_TIME:
      process.env.FOCOCONTEXT_RELEASE_BUILD_TIME ?? new Date().toISOString(),
    FOCOCONTEXT_RELEASE_REVISION:
      process.env.FOCOCONTEXT_RELEASE_REVISION ?? gitValue(["rev-parse", "HEAD"], "local"),
    FOCOCONTEXT_RELEASE_SOURCE: process.env.FOCOCONTEXT_RELEASE_SOURCE ?? "local",
    FOCOCONTEXT_RELEASE_VERSION: process.env.FOCOCONTEXT_RELEASE_VERSION ?? "dev",
  };
}

function main() {
  const env = releaseEnvironment();
  console.log(
    [
      "Starting development Docker Compose stack with release metadata:",
      `version=${env.FOCOCONTEXT_RELEASE_VERSION}`,
      `revision=${env.FOCOCONTEXT_RELEASE_REVISION}`,
      `buildTime=${env.FOCOCONTEXT_RELEASE_BUILD_TIME}`,
      `source=${env.FOCOCONTEXT_RELEASE_SOURCE}`,
    ].join(" "),
  );

  run(
    "docker",
    ["compose", "-f", composeFile, "up", "--build", "-d", "--force-recreate", "--remove-orphans"],
    {
      env,
      stdio: "inherit",
    },
  );

  run("node", ["scripts/docker-cleanup.mjs", "--compose-file", composeFile], {
    env,
    stdio: "inherit",
  });
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
