type RuntimeEnv = Readonly<Record<string, string | undefined>>;

export type UploadMultipartFallbackMode = "enabled" | "disabled";

export interface RuntimeConfigUploadLimits {
  maxFileSizeMb: number;
  maxConcurrentFiles: number;
  admissionConcurrency: number;
  directUploadEnabled: boolean;
  directUploadThresholdMb: number;
  uploadSessionExpiresSeconds: number;
  multipartFallbackMode: UploadMultipartFallbackMode;
  multipartTimeoutSeconds: number;
  pressureDegradedThreshold: number;
}

export function parseUploadLimits(env: RuntimeEnv, invalid: string[]): RuntimeConfigUploadLimits {
  const uploadMaxConcurrentFiles = parsePositiveInteger(
    env,
    "UPLOAD_MAX_CONCURRENT_FILES",
    invalid,
  );

  return {
    maxFileSizeMb: parsePositiveInteger(env, "UPLOAD_MAX_FILE_SIZE_MB", invalid),
    maxConcurrentFiles: uploadMaxConcurrentFiles,
    admissionConcurrency: uploadMaxConcurrentFiles,
    directUploadEnabled: parseOptionalBoolean(env, "UPLOAD_DIRECT_ENABLED", false, invalid),
    directUploadThresholdMb: parseOptionalPositiveInteger(
      env,
      "UPLOAD_DIRECT_THRESHOLD_MB",
      50,
      invalid,
    ),
    uploadSessionExpiresSeconds: parseOptionalPositiveInteger(
      env,
      "UPLOAD_SESSION_EXPIRES_SECONDS",
      900,
      invalid,
    ),
    multipartFallbackMode: parseOptionalUploadMultipartFallbackMode(
      env,
      "UPLOAD_MULTIPART_FALLBACK_MODE",
      "enabled",
      invalid,
    ),
    multipartTimeoutSeconds: parseOptionalPositiveInteger(
      env,
      "UPLOAD_MULTIPART_TIMEOUT_SECONDS",
      300,
      invalid,
    ),
    pressureDegradedThreshold: parseOptionalPositiveInteger(
      env,
      "UPLOAD_PRESSURE_DEGRADED_THRESHOLD",
      uploadMaxConcurrentFiles,
      invalid,
    ),
  };
}

function parseOptionalUploadMultipartFallbackMode(
  env: RuntimeEnv,
  key: string,
  defaultValue: UploadMultipartFallbackMode,
  invalid: string[],
): UploadMultipartFallbackMode {
  const value = readOptional(env, key);

  if (value === undefined) {
    return defaultValue;
  }

  if (value === "enabled" || value === "disabled") {
    return value;
  }

  invalid.push(key);
  return defaultValue;
}

function parsePositiveInteger(env: RuntimeEnv, key: string, invalid: string[]): number {
  const value = readOptional(env, key);
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    invalid.push(key);
    return 0;
  }

  return parsed;
}

function parseOptionalPositiveInteger(
  env: RuntimeEnv,
  key: string,
  defaultValue: number,
  invalid: string[],
): number {
  const value = readOptional(env, key);

  if (value === undefined) {
    return defaultValue;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    invalid.push(key);
    return defaultValue;
  }

  return parsed;
}

function parseOptionalBoolean(
  env: RuntimeEnv,
  key: string,
  defaultValue: boolean,
  invalid: string[],
): boolean {
  const value = readOptional(env, key);

  if (value === undefined) {
    return defaultValue;
  }

  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  invalid.push(key);
  return defaultValue;
}

function readOptional(env: RuntimeEnv, key: string): string | undefined {
  const value = env[key];

  if (value === undefined || value.trim() === "") {
    return undefined;
  }

  return value;
}
