export interface SourceWatchRuntimeAdapterBase {
  enabled: boolean;
  concurrency: number;
  maxBytes: number;
  maxItems: number;
  maxRetries: number;
  retryBaseDelayMs: number;
  timeoutSeconds: number;
}

export interface SourceWatchRuntimeAdapters {
  gitRepo: SourceWatchRuntimeAdapterBase & {
    allowedProtocols: readonly string[];
    cloneDepth: number;
    tempDir: string;
    tokenConfigured: boolean;
  };
  mountedDirectory: {
    containerDir: string;
    enabled: boolean;
    hostDir?: string;
  };
  s3Prefix: SourceWatchRuntimeAdapterBase & {
    accessKeyId?: string;
    accessKeyConfigured: boolean;
    bucket?: string;
    endpoint?: string;
    forcePathStyle: boolean;
    incrementalScanEnabled: boolean;
    region?: string;
    secretAccessKey?: string;
    secretKeyConfigured: boolean;
  };
  urlList: SourceWatchRuntimeAdapterBase & {
    allowedProtocols: readonly string[];
    redirectLimit: number;
  };
}

export interface SourceWatchRemoteSecurityConfig {
  privateNetworkAllowlist: readonly string[];
  privateNetworkEnabled: boolean;
}
