import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  ListObjectVersionsCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
  type DeleteObjectsCommandOutput,
  type GetObjectCommandOutput,
  type HeadObjectCommandOutput,
  type ListObjectVersionsCommandOutput,
  type ListObjectsV2CommandOutput,
  type PutObjectCommandInput,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export { GetObjectCommand, ListObjectsV2Command, S3Client };

export type ObjectStorageOperationClass = "class_a" | "class_b" | "free" | "unknown";
export type ObjectStorageOperationScope = "system" | "source_watch";
export type ObjectStorageOperationStatus = "success" | "error";

export interface ObjectStorageOperationRecord {
  at: string;
  operation: string;
  operationClass: ObjectStorageOperationClass;
  caller: string;
  scope: ObjectStorageOperationScope;
  status: ObjectStorageOperationStatus;
  latencyMs: number;
  retryCount: number;
  contentLength?: number;
  errorName?: string;
  errorCode?: string;
}

export interface ObjectStorageOperationRecorder {
  record(record: ObjectStorageOperationRecord): void;
  snapshot(windowSeconds?: number): ObjectStorageOperationRecord[];
  reset(): void;
}

export interface ObjectStorageInstrumentationOptions {
  caller?: string;
  enabled?: boolean;
  recorder?: ObjectStorageOperationRecorder;
  scope?: ObjectStorageOperationScope;
}

export interface S3ObjectStorageConfig {
  providerName: string;
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
  publicBaseUrl?: string;
}

export interface PutObjectInput {
  key: string;
  body: PutObjectCommandInput["Body"];
  contentType?: string;
  metadata?: Record<string, string>;
  signal?: AbortSignal;
}

export interface GetObjectInput {
  key: string;
}

export interface DeleteObjectInput {
  key: string;
}

export interface DeleteObjectsInput {
  keys: string[];
  batchSize?: number;
}

export interface DeleteObjectVersionIdentifier {
  key: string;
  versionId?: string;
}

export interface DeleteObjectVersionsInput {
  objects: DeleteObjectVersionIdentifier[];
  batchSize?: number;
}

export interface ListObjectsByPrefixInput {
  continuationToken?: string;
  maxKeys?: number;
  prefix: string;
}

export interface ListObjectVersionsByPrefixInput {
  keyMarker?: string;
  maxKeys?: number;
  prefix: string;
  versionIdMarker?: string;
}

export interface HeadObjectInput {
  key: string;
}

export interface PresignedObjectUrlInput {
  key: string;
  expiresInSeconds: number;
  contentType?: string;
  metadata?: Record<string, string>;
}

export interface PutObjectResult {
  bucket: string;
  key: string;
  etag?: string;
}

export interface GetObjectResult {
  bucket: string;
  key: string;
  body: GetObjectCommandOutput["Body"];
  contentLength?: number;
  contentType?: string;
  etag?: string;
  metadata?: Record<string, string>;
}

export interface HeadObjectResult {
  bucket: string;
  key: string;
  exists: boolean;
  contentLength?: number;
  contentType?: string;
  etag?: string;
  metadata?: Record<string, string>;
  lastModified?: Date;
}

export interface DeleteObjectResult {
  bucket: string;
  key: string;
}

export interface DeletedObjectItem {
  key: string;
  status: "deleted";
}

export interface DeletedObjectVersionItem {
  key: string;
  status: "deleted";
  versionId?: string;
}

export interface DeleteObjectFailure {
  key: string;
  code?: string;
  message: string;
  retryable: boolean;
}

export interface DeleteObjectVersionFailure {
  key: string;
  code?: string;
  message: string;
  retryable: boolean;
  versionId?: string;
}

export interface DeleteObjectsResult {
  bucket: string;
  deleted: DeletedObjectItem[];
  failed: DeleteObjectFailure[];
}

export interface DeleteObjectVersionsResult {
  bucket: string;
  deleted: DeletedObjectVersionItem[];
  failed: DeleteObjectVersionFailure[];
}

export interface ListedObjectItem {
  etag?: string;
  key: string;
  lastModified?: Date;
  size?: number;
}

export interface ListedObjectVersionItem {
  etag?: string;
  isDeleteMarker: boolean;
  key: string;
  lastModified?: Date;
  size?: number;
  versionId?: string;
}

export interface ListObjectsByPrefixResult {
  bucket: string;
  isTruncated: boolean;
  nextContinuationToken?: string;
  objects: ListedObjectItem[];
  prefix: string;
}

export interface ListObjectVersionsByPrefixResult {
  bucket: string;
  isTruncated: boolean;
  nextKeyMarker?: string;
  nextVersionIdMarker?: string;
  prefix: string;
  versions: ListedObjectVersionItem[];
}

export interface ObjectStorageAdapter {
  putObject(input: PutObjectInput): Promise<PutObjectResult>;
  putObjectStream(input: PutObjectInput): Promise<PutObjectResult>;
  getObject(input: GetObjectInput): Promise<GetObjectResult>;
  headObject(input: HeadObjectInput): Promise<HeadObjectResult>;
  deleteObject(input: DeleteObjectInput): Promise<DeleteObjectResult>;
  deleteObjects(input: DeleteObjectsInput): Promise<DeleteObjectsResult>;
  deleteObjectVersions?(input: DeleteObjectVersionsInput): Promise<DeleteObjectVersionsResult>;
  listObjectsByPrefix(input: ListObjectsByPrefixInput): Promise<ListObjectsByPrefixResult>;
  listObjectVersionsByPrefix?(
    input: ListObjectVersionsByPrefixInput,
  ): Promise<ListObjectVersionsByPrefixResult>;
  createPresignedGetUrl(input: PresignedObjectUrlInput): Promise<string>;
  createPresignedPutUrl(input: PresignedObjectUrlInput): Promise<string>;
  getDiagnostics(): Promise<ObjectStorageDiagnostics>;
}

export class NullObjectStorageOperationRecorder implements ObjectStorageOperationRecorder {
  record(_record: ObjectStorageOperationRecord): void {
    void _record;
  }

  snapshot(_windowSeconds?: number): ObjectStorageOperationRecord[] {
    void _windowSeconds;

    return [];
  }

  reset(): void {}
}

export const defaultObjectStorageOperationRecorder = new NullObjectStorageOperationRecorder();

export function classifyObjectStorageOperation(operation: string): ObjectStorageOperationClass {
  if (classAOperations.has(operation)) {
    return "class_a";
  }
  if (classBOperations.has(operation)) {
    return "class_b";
  }
  if (freeOperations.has(operation)) {
    return "free";
  }

  return "unknown";
}

export type ObjectStorageConnectionStatus = "not_checked" | "connected" | "error";

export interface ObjectStorageConnectionDiagnostics {
  status: ObjectStorageConnectionStatus;
  message?: string;
}

export interface ObjectStorageDiagnostics {
  providerName: string;
  endpoint: string;
  bucket: string;
  region: string;
  forcePathStyle: boolean;
  accessKeyStatus: "configured" | "missing";
  secretKeyStatus: "configured" | "missing";
  connection: ObjectStorageConnectionDiagnostics;
  publicBaseUrl?: string;
}

type StorageCommand =
  | PutObjectCommand
  | GetObjectCommand
  | HeadObjectCommand
  | DeleteObjectCommand
  | DeleteObjectsCommand
  | ListObjectsV2Command
  | ListObjectVersionsCommand
  | HeadBucketCommand;

type PresignableStorageCommand = PutObjectCommand | GetObjectCommand;

type PutObjectCommandSource = {
  key: string;
  body?: PutObjectCommandInput["Body"];
  contentType?: string;
  metadata?: Record<string, string>;
};

export const s3MultipartUploadPartSizeBytes = 16 * 1024 * 1024;
export const s3MultipartUploadQueueSize = 1;
export const s3DeleteObjectsMaxBatchSize = 1000;

const classAOperations = new Set([
  "CopyObject",
  "CompleteMultipartUpload",
  "CreateBucket",
  "CreateMultipartUpload",
  "ListBucket",
  "ListObjectVersions",
  "ListObjects",
  "ListObjectsV2",
  "PostObject",
  "PutBucketLifecycleConfiguration",
  "PutObject",
  "PutObjectStream",
  "UploadPart",
]);

const classBOperations = new Set(["GetBucketLocation", "GetObject", "HeadBucket", "HeadObject"]);

const freeOperations = new Set([
  "AbortMultipartUpload",
  "DeleteObject",
  "DeleteObjectVersions",
  "DeleteObjects",
]);

export interface S3CompatibleClient {
  send(command: StorageCommand, options?: { abortSignal?: AbortSignal }): Promise<unknown>;
}

export type StoragePresigner = (
  command: PresignableStorageCommand,
  options: {
    expiresIn: number;
  },
) => Promise<string>;

export type StorageStreamUploader = (
  input: PutObjectCommandInput,
  signal?: AbortSignal,
) => Promise<unknown>;

export interface S3ObjectStorageAdapterOptions {
  client?: S3CompatibleClient;
  instrumentation?: ObjectStorageInstrumentationOptions;
  multipartPartSizeBytes?: number;
  presigner?: StoragePresigner;
  streamUploader?: StorageStreamUploader;
}

function normalizeInstrumentationOptions(
  options: ObjectStorageInstrumentationOptions = {},
): Required<ObjectStorageInstrumentationOptions> {
  return {
    caller: options.caller ?? "object_storage.adapter",
    enabled: options.enabled ?? true,
    recorder: options.recorder ?? defaultObjectStorageOperationRecorder,
    scope: options.scope ?? "system",
  };
}

export class S3ObjectStorageAdapter implements ObjectStorageAdapter {
  private readonly client: S3CompatibleClient;
  private readonly instrumentation: Required<ObjectStorageInstrumentationOptions>;
  private readonly multipartPartSizeBytes: number;
  private readonly presigner: StoragePresigner;
  private readonly streamUploader: StorageStreamUploader;

  constructor(
    private readonly config: S3ObjectStorageConfig,
    options: S3ObjectStorageAdapterOptions = {},
  ) {
    this.client = options.client ?? createS3Client(config);
    this.instrumentation = normalizeInstrumentationOptions(options.instrumentation);
    this.multipartPartSizeBytes = options.multipartPartSizeBytes ?? s3MultipartUploadPartSizeBytes;
    this.presigner =
      options.presigner ??
      ((command, presignOptions) =>
        getSignedUrl(this.client as S3Client, command, {
          expiresIn: presignOptions.expiresIn,
        }));
    this.streamUploader =
      options.streamUploader ??
      ((input, signal) => {
        const upload = createUpload(input, this.client as S3Client, this.multipartPartSizeBytes);

        return runUpload(upload, signal);
      });
  }

  async putObject(input: PutObjectInput): Promise<PutObjectResult> {
    const commandInput = this.createPutObjectCommandInput(input);
    const result = await this.recordOperation(
      "PutObject",
      async () =>
        this.client.send(
          new PutObjectCommand(commandInput),
          input.signal === undefined ? undefined : { abortSignal: input.signal },
        ),
      readBodyContentLength(input.body),
    );

    return {
      bucket: this.config.bucket,
      key: input.key,
      ...readEtag(result),
    };
  }

  async putObjectStream(input: PutObjectInput): Promise<PutObjectResult> {
    const commandInput = this.createPutObjectCommandInput(input);
    const result = await this.recordOperation("PutObjectStream", () =>
      this.streamUploader(commandInput, input.signal),
    );

    return {
      bucket: this.config.bucket,
      key: input.key,
      ...readEtag(result),
    };
  }

  async getObject(input: GetObjectInput): Promise<GetObjectResult> {
    const result = (await this.recordOperation("GetObject", () =>
      this.client.send(
        new GetObjectCommand({
          Bucket: this.config.bucket,
          Key: input.key,
        }),
      ),
    )) as GetObjectCommandOutput;

    return {
      bucket: this.config.bucket,
      key: input.key,
      body: result.Body,
      ...copyObjectMetadata(result),
    };
  }

  async headObject(input: HeadObjectInput): Promise<HeadObjectResult> {
    try {
      const result = (await this.recordOperation("HeadObject", () =>
        this.client.send(
          new HeadObjectCommand({
            Bucket: this.config.bucket,
            Key: input.key,
          }),
        ),
      )) as HeadObjectCommandOutput;

      return {
        bucket: this.config.bucket,
        key: input.key,
        exists: true,
        ...copyObjectMetadata(result),
        ...(result.LastModified === undefined ? {} : { lastModified: result.LastModified }),
      };
    } catch (error) {
      if (isObjectMissingError(error)) {
        return {
          bucket: this.config.bucket,
          key: input.key,
          exists: false,
        };
      }

      throw error;
    }
  }

  async deleteObject(input: DeleteObjectInput): Promise<DeleteObjectResult> {
    await this.recordOperation(
      "DeleteObject",
      async () =>
        this.client.send(
          new DeleteObjectCommand({
            Bucket: this.config.bucket,
            Key: input.key,
          }),
        ),
      undefined,
      isObjectMissingError,
    );

    return {
      bucket: this.config.bucket,
      key: input.key,
    };
  }

  async deleteObjects(input: DeleteObjectsInput): Promise<DeleteObjectsResult> {
    const result: DeleteObjectsResult = {
      bucket: this.config.bucket,
      deleted: [],
      failed: [],
    };
    const batchSize = normalizeDeleteBatchSize(input.batchSize);

    for (const keys of chunkKeys(input.keys, batchSize)) {
      try {
        const response = (await this.recordOperation("DeleteObjects", () =>
          this.client.send(
            new DeleteObjectsCommand({
              Bucket: this.config.bucket,
              Delete: {
                Objects: keys.map((key) => ({ Key: key })),
                Quiet: false,
              },
            }),
          ),
        )) as DeleteObjectsCommandOutput;

        mergeDeleteObjectsResponse(result, keys, response, this.getSecretRedactionValues());
      } catch (error) {
        if (isBulkDeleteUnsupportedError(error)) {
          await this.deleteObjectsIndividually(keys, result);
          continue;
        }

        for (const key of keys) {
          result.failed.push(
            createDeleteObjectFailure(key, error, this.getSecretRedactionValues()),
          );
        }
      }
    }

    return result;
  }

  async deleteObjectVersions(
    input: DeleteObjectVersionsInput,
  ): Promise<DeleteObjectVersionsResult> {
    const result: DeleteObjectVersionsResult = {
      bucket: this.config.bucket,
      deleted: [],
      failed: [],
    };
    const batchSize = normalizeDeleteBatchSize(input.batchSize);

    for (const objects of chunkObjectVersions(input.objects, batchSize)) {
      try {
        const response = (await this.recordOperation("DeleteObjectVersions", () =>
          this.client.send(
            new DeleteObjectsCommand({
              Bucket: this.config.bucket,
              Delete: {
                Objects: objects.map((object) => ({
                  Key: object.key,
                  ...(object.versionId === undefined ? {} : { VersionId: object.versionId }),
                })),
                Quiet: false,
              },
            }),
          ),
        )) as DeleteObjectsCommandOutput;

        mergeDeleteObjectVersionsResponse(
          result,
          objects,
          response,
          this.getSecretRedactionValues(),
        );
      } catch (error) {
        if (isBulkDeleteUnsupportedError(error)) {
          await this.deleteObjectVersionsIndividually(objects, result);
          continue;
        }

        for (const object of objects) {
          result.failed.push(
            createDeleteObjectVersionFailure(object, error, this.getSecretRedactionValues()),
          );
        }
      }
    }

    return result;
  }

  async listObjectsByPrefix(input: ListObjectsByPrefixInput): Promise<ListObjectsByPrefixResult> {
    const result = (await this.recordOperation("ListObjectsV2", () =>
      this.client.send(
        new ListObjectsV2Command({
          Bucket: this.config.bucket,
          ContinuationToken: input.continuationToken,
          MaxKeys: normalizeListObjectsMaxKeys(input.maxKeys),
          Prefix: input.prefix,
        }),
      ),
    )) as ListObjectsV2CommandOutput;

    return {
      bucket: this.config.bucket,
      isTruncated: result.IsTruncated === true,
      ...(result.NextContinuationToken === undefined
        ? {}
        : { nextContinuationToken: result.NextContinuationToken }),
      objects: (result.Contents ?? []).flatMap((item) => {
        if (item.Key === undefined || item.Key.length === 0) {
          return [];
        }

        return [
          {
            key: item.Key,
            ...(item.ETag === undefined ? {} : { etag: item.ETag }),
            ...(item.LastModified === undefined ? {} : { lastModified: item.LastModified }),
            ...(item.Size === undefined ? {} : { size: item.Size }),
          },
        ];
      }),
      prefix: input.prefix,
    };
  }

  async listObjectVersionsByPrefix(
    input: ListObjectVersionsByPrefixInput,
  ): Promise<ListObjectVersionsByPrefixResult> {
    const result = (await this.recordOperation("ListObjectVersions", () =>
      this.client.send(
        new ListObjectVersionsCommand({
          Bucket: this.config.bucket,
          KeyMarker: input.keyMarker,
          MaxKeys: normalizeListObjectsMaxKeys(input.maxKeys),
          Prefix: input.prefix,
          VersionIdMarker: input.versionIdMarker,
        }),
      ),
    )) as ListObjectVersionsCommandOutput;

    return {
      bucket: this.config.bucket,
      isTruncated: result.IsTruncated === true,
      ...(result.NextKeyMarker === undefined ? {} : { nextKeyMarker: result.NextKeyMarker }),
      ...(result.NextVersionIdMarker === undefined
        ? {}
        : { nextVersionIdMarker: result.NextVersionIdMarker }),
      prefix: input.prefix,
      versions: [
        ...(result.Versions ?? []).flatMap((item) => {
          if (item.Key === undefined || item.Key.length === 0) {
            return [];
          }

          return [
            {
              etag: item.ETag,
              isDeleteMarker: false,
              key: item.Key,
              ...(item.LastModified === undefined ? {} : { lastModified: item.LastModified }),
              ...(item.Size === undefined ? {} : { size: item.Size }),
              ...(item.VersionId === undefined ? {} : { versionId: item.VersionId }),
            },
          ];
        }),
        ...(result.DeleteMarkers ?? []).flatMap((item) => {
          if (item.Key === undefined || item.Key.length === 0) {
            return [];
          }

          return [
            {
              isDeleteMarker: true,
              key: item.Key,
              ...(item.LastModified === undefined ? {} : { lastModified: item.LastModified }),
              ...(item.VersionId === undefined ? {} : { versionId: item.VersionId }),
            },
          ];
        }),
      ],
    };
  }

  async createPresignedGetUrl(input: PresignedObjectUrlInput): Promise<string> {
    return this.recordOperation("PresignGetObject", () =>
      this.presigner(
        new GetObjectCommand({
          Bucket: this.config.bucket,
          Key: input.key,
        }),
        {
          expiresIn: input.expiresInSeconds,
        },
      ),
    );
  }

  async createPresignedPutUrl(input: PresignedObjectUrlInput): Promise<string> {
    return this.recordOperation("PresignPutObject", () =>
      this.presigner(new PutObjectCommand(this.createPutObjectCommandInput(input)), {
        expiresIn: input.expiresInSeconds,
      }),
    );
  }

  async getDiagnostics(): Promise<ObjectStorageDiagnostics> {
    try {
      await this.recordOperation("HeadBucket", async () =>
        this.client.send(
          new HeadBucketCommand({
            Bucket: this.config.bucket,
          }),
        ),
      );

      return createStorageDiagnostics(this.config, {
        status: "connected",
      });
    } catch (error) {
      return createStorageDiagnostics(this.config, {
        status: "error",
        message: getErrorMessage(error),
      });
    }
  }

  private createPutObjectCommandInput(input: PutObjectCommandSource): PutObjectCommandInput {
    return {
      Bucket: this.config.bucket,
      Key: input.key,
      ...(input.body === undefined ? {} : { Body: input.body }),
      ...(input.contentType === undefined ? {} : { ContentType: input.contentType }),
      ...(input.metadata === undefined ? {} : { Metadata: input.metadata }),
    };
  }

  private async deleteObjectsIndividually(
    keys: string[],
    result: DeleteObjectsResult,
  ): Promise<void> {
    for (const key of keys) {
      try {
        await this.deleteObject({ key });
        result.deleted.push({
          key,
          status: "deleted",
        });
      } catch (error) {
        if (isObjectMissingError(error)) {
          result.deleted.push({
            key,
            status: "deleted",
          });
          continue;
        }

        result.failed.push(createDeleteObjectFailure(key, error, this.getSecretRedactionValues()));
      }
    }
  }

  private async deleteObjectVersionsIndividually(
    objects: DeleteObjectVersionIdentifier[],
    result: DeleteObjectVersionsResult,
  ): Promise<void> {
    for (const object of objects) {
      try {
        await this.recordOperation(
          "DeleteObject",
          async () =>
            this.client.send(
              new DeleteObjectCommand({
                Bucket: this.config.bucket,
                Key: object.key,
                ...(object.versionId === undefined ? {} : { VersionId: object.versionId }),
              }),
            ),
          undefined,
          isObjectMissingError,
        );
        result.deleted.push({
          key: object.key,
          status: "deleted",
          ...(object.versionId === undefined ? {} : { versionId: object.versionId }),
        });
      } catch (error) {
        if (isObjectMissingError(error)) {
          result.deleted.push({
            key: object.key,
            status: "deleted",
            ...(object.versionId === undefined ? {} : { versionId: object.versionId }),
          });
          continue;
        }

        result.failed.push(
          createDeleteObjectVersionFailure(object, error, this.getSecretRedactionValues()),
        );
      }
    }
  }

  private getSecretRedactionValues(): string[] {
    return [this.config.accessKeyId, this.config.secretAccessKey].filter(
      (value) => value.length > 0,
    );
  }

  private async recordOperation<TValue>(
    operation: string,
    run: () => Promise<TValue>,
    contentLength?: number,
    treatErrorAsSuccess?: (error: unknown) => boolean,
  ): Promise<TValue> {
    return recordObjectStorageOperation({
      ...this.instrumentation,
      operation,
      contentLength,
      run,
      treatErrorAsSuccess,
    });
  }
}

export function createInstrumentedObjectStorageAdapter(
  adapter: ObjectStorageAdapter,
  instrumentation: ObjectStorageInstrumentationOptions = {},
): ObjectStorageAdapter {
  const options = normalizeInstrumentationOptions(instrumentation);

  return {
    putObject: (input) =>
      recordObjectStorageOperation({
        ...options,
        operation: "PutObject",
        contentLength: readBodyContentLength(input.body),
        run: () => adapter.putObject(input),
      }),
    putObjectStream: (input) =>
      recordObjectStorageOperation({
        ...options,
        operation: "PutObjectStream",
        run: () => adapter.putObjectStream(input),
      }),
    getObject: (input) =>
      recordObjectStorageOperation({
        ...options,
        operation: "GetObject",
        run: () => adapter.getObject(input),
      }),
    headObject: (input) =>
      recordObjectStorageOperation({
        ...options,
        operation: "HeadObject",
        run: () => adapter.headObject(input),
      }),
    deleteObject: (input) =>
      recordObjectStorageOperation({
        ...options,
        operation: "DeleteObject",
        run: () => adapter.deleteObject(input),
      }),
    deleteObjects: (input) =>
      recordObjectStorageOperation({
        ...options,
        operation: "DeleteObjects",
        run: () => adapter.deleteObjects(input),
      }),
    ...(adapter.deleteObjectVersions === undefined
      ? {}
      : {
          deleteObjectVersions: (input: DeleteObjectVersionsInput) =>
            recordObjectStorageOperation({
              ...options,
              operation: "DeleteObjectVersions",
              run: () => adapter.deleteObjectVersions!(input),
            }),
        }),
    listObjectsByPrefix: (input) =>
      recordObjectStorageOperation({
        ...options,
        operation: "ListObjectsV2",
        run: () => adapter.listObjectsByPrefix(input),
      }),
    ...(adapter.listObjectVersionsByPrefix === undefined
      ? {}
      : {
          listObjectVersionsByPrefix: (input: ListObjectVersionsByPrefixInput) =>
            recordObjectStorageOperation({
              ...options,
              operation: "ListObjectVersions",
              run: () => adapter.listObjectVersionsByPrefix!(input),
            }),
        }),
    createPresignedGetUrl: (input) =>
      recordObjectStorageOperation({
        ...options,
        operation: "PresignGetObject",
        run: () => adapter.createPresignedGetUrl(input),
      }),
    createPresignedPutUrl: (input) =>
      recordObjectStorageOperation({
        ...options,
        operation: "PresignPutObject",
        run: () => adapter.createPresignedPutUrl(input),
      }),
    getDiagnostics: () =>
      recordObjectStorageOperation({
        ...options,
        operation: "HeadBucket",
        run: () => adapter.getDiagnostics(),
      }),
  };
}

export async function recordObjectStorageOperation<TValue>(input: {
  caller: string;
  contentLength?: number | undefined;
  enabled: boolean;
  operation: string;
  recorder: ObjectStorageOperationRecorder;
  retryCount?: number;
  run: () => Promise<TValue>;
  scope: ObjectStorageOperationScope;
  treatErrorAsSuccess?: ((error: unknown) => boolean) | undefined;
}): Promise<TValue> {
  if (!input.enabled) {
    return input.run();
  }

  const startedAt = Date.now();

  try {
    const result = await input.run();

    input.recorder.record({
      at: new Date().toISOString(),
      operation: input.operation,
      operationClass: classifyObjectStorageOperation(input.operation),
      caller: input.caller,
      scope: input.scope,
      status: "success",
      latencyMs: Date.now() - startedAt,
      retryCount: input.retryCount ?? 0,
      ...(input.contentLength === undefined ? {} : { contentLength: input.contentLength }),
    });

    return result;
  } catch (error) {
    const success = input.treatErrorAsSuccess?.(error) === true;

    input.recorder.record({
      at: new Date().toISOString(),
      operation: input.operation,
      operationClass: classifyObjectStorageOperation(input.operation),
      caller: input.caller,
      scope: input.scope,
      status: success ? "success" : "error",
      latencyMs: Date.now() - startedAt,
      retryCount: input.retryCount ?? 0,
      ...(input.contentLength === undefined ? {} : { contentLength: input.contentLength }),
      ...readOperationError(error),
    });

    throw error;
  }
}

function createUpload(input: PutObjectCommandInput, client: S3Client, partSize: number): Upload {
  return new Upload({
    client,
    leavePartsOnError: false,
    partSize,
    params: input,
    queueSize: s3MultipartUploadQueueSize,
  });
}

async function runUpload(upload: Upload, signal: AbortSignal | undefined): Promise<unknown> {
  const removeAbortListener = bindAbortSignal(signal, () => upload.abort());

  try {
    return await upload.done();
  } finally {
    removeAbortListener();
  }
}

function bindAbortSignal(signal: AbortSignal | undefined, onAbort: () => void): () => void {
  if (signal === undefined) {
    return () => undefined;
  }

  if (signal.aborted) {
    onAbort();

    return () => undefined;
  }

  signal.addEventListener("abort", onAbort, { once: true });

  return () => signal.removeEventListener("abort", onAbort);
}

export function createS3ObjectStorageAdapter(
  config: S3ObjectStorageConfig,
  options: S3ObjectStorageAdapterOptions = {},
): S3ObjectStorageAdapter {
  return new S3ObjectStorageAdapter(config, options);
}

export function createStorageDiagnostics(
  config: S3ObjectStorageConfig,
  connection: ObjectStorageConnectionDiagnostics,
): ObjectStorageDiagnostics {
  return {
    providerName: config.providerName,
    endpoint: config.endpoint,
    bucket: config.bucket,
    region: config.region,
    forcePathStyle: config.forcePathStyle,
    accessKeyStatus: config.accessKeyId.length > 0 ? "configured" : "missing",
    secretKeyStatus: config.secretAccessKey.length > 0 ? "configured" : "missing",
    connection,
    ...(config.publicBaseUrl === undefined ? {} : { publicBaseUrl: config.publicBaseUrl }),
  };
}

function createS3Client(config: S3ObjectStorageConfig): S3Client {
  return new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    forcePathStyle: config.forcePathStyle,
    requestChecksumCalculation: "WHEN_REQUIRED",
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
}

function copyObjectMetadata(
  result: Pick<GetObjectCommandOutput, "ContentLength" | "ContentType" | "ETag" | "Metadata">,
) {
  return {
    ...(result.ContentLength === undefined ? {} : { contentLength: result.ContentLength }),
    ...(result.ContentType === undefined ? {} : { contentType: result.ContentType }),
    ...(result.ETag === undefined ? {} : { etag: result.ETag }),
    ...(result.Metadata === undefined ? {} : { metadata: result.Metadata }),
  };
}

function readEtag(result: unknown): { etag?: string } {
  if (typeof result !== "object" || result === null || !("ETag" in result)) {
    return {};
  }

  const etag = result.ETag;

  return typeof etag === "string" ? { etag } : {};
}

function readBodyContentLength(
  body: PutObjectCommandInput["Body"] | undefined,
): number | undefined {
  if (typeof body === "string") {
    return Buffer.byteLength(body);
  }
  if (body instanceof Uint8Array) {
    return body.byteLength;
  }

  return undefined;
}

function readOperationError(error: unknown): { errorCode?: string; errorName?: string } {
  if (typeof error !== "object" || error === null) {
    return {};
  }

  const errorName = "name" in error && typeof error.name === "string" ? error.name : undefined;
  const errorCode = readErrorCode(error);

  return {
    ...(errorName === undefined ? {} : { errorName }),
    ...(errorCode === undefined ? {} : { errorCode }),
  };
}

function isObjectMissingError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error.name === "NotFound" || error.name === "NoSuchKey")
  );
}

function isBulkDeleteUnsupportedError(error: unknown): boolean {
  const code = readErrorCode(error);

  return (
    code === "NotImplemented" ||
    code === "NotSupported" ||
    code === "UnsupportedOperation" ||
    code === "MethodNotAllowed"
  );
}

function mergeDeleteObjectsResponse(
  result: DeleteObjectsResult,
  keys: string[],
  response: DeleteObjectsCommandOutput,
  redactionValues: string[],
): void {
  const handledKeys = new Set<string>();

  for (const deleted of response.Deleted ?? []) {
    if (typeof deleted.Key !== "string") {
      continue;
    }
    handledKeys.add(deleted.Key);
    result.deleted.push({
      key: deleted.Key,
      status: "deleted",
    });
  }

  for (const error of response.Errors ?? []) {
    if (typeof error.Key !== "string") {
      continue;
    }
    handledKeys.add(error.Key);

    if (isMissingObjectCode(error.Code)) {
      result.deleted.push({
        key: error.Key,
        status: "deleted",
      });
      continue;
    }

    result.failed.push({
      key: error.Key,
      ...(typeof error.Code === "string" ? { code: error.Code } : {}),
      message:
        typeof error.Message === "string"
          ? sanitizeErrorMessage(error.Message, redactionValues)
          : "Object deletion failed.",
      retryable: true,
    });
  }

  for (const key of keys) {
    if (handledKeys.has(key)) {
      continue;
    }
    result.deleted.push({
      key,
      status: "deleted",
    });
  }
}

function mergeDeleteObjectVersionsResponse(
  result: DeleteObjectVersionsResult,
  objects: DeleteObjectVersionIdentifier[],
  response: DeleteObjectsCommandOutput,
  redactionValues: string[],
): void {
  const handledObjects = new Set<string>();

  for (const deleted of response.Deleted ?? []) {
    if (typeof deleted.Key !== "string") {
      continue;
    }
    const deletedObject: DeleteObjectVersionIdentifier = {
      key: deleted.Key,
      ...(typeof deleted.VersionId === "string" ? { versionId: deleted.VersionId } : {}),
    };
    handledObjects.add(createObjectVersionIdentity(deletedObject));
    result.deleted.push({
      key: deletedObject.key,
      status: "deleted",
      ...(deletedObject.versionId === undefined ? {} : { versionId: deletedObject.versionId }),
    });
  }

  for (const error of response.Errors ?? []) {
    if (typeof error.Key !== "string") {
      continue;
    }
    const failedObject: DeleteObjectVersionIdentifier = {
      key: error.Key,
      ...(typeof error.VersionId === "string" ? { versionId: error.VersionId } : {}),
    };
    handledObjects.add(createObjectVersionIdentity(failedObject));

    if (isMissingObjectCode(error.Code)) {
      result.deleted.push({
        key: failedObject.key,
        status: "deleted",
        ...(failedObject.versionId === undefined ? {} : { versionId: failedObject.versionId }),
      });
      continue;
    }

    result.failed.push({
      key: failedObject.key,
      ...(typeof error.Code === "string" ? { code: error.Code } : {}),
      message:
        typeof error.Message === "string"
          ? sanitizeErrorMessage(error.Message, redactionValues)
          : "Object version deletion failed.",
      retryable: true,
      ...(failedObject.versionId === undefined ? {} : { versionId: failedObject.versionId }),
    });
  }

  for (const object of objects) {
    if (handledObjects.has(createObjectVersionIdentity(object))) {
      continue;
    }
    result.deleted.push({
      key: object.key,
      status: "deleted",
      ...(object.versionId === undefined ? {} : { versionId: object.versionId }),
    });
  }
}

function normalizeDeleteBatchSize(batchSize: number | undefined): number {
  if (batchSize === undefined || !Number.isFinite(batchSize)) {
    return s3DeleteObjectsMaxBatchSize;
  }

  return Math.max(1, Math.min(Math.trunc(batchSize), s3DeleteObjectsMaxBatchSize));
}

function normalizeListObjectsMaxKeys(maxKeys: number | undefined): number {
  if (maxKeys === undefined || !Number.isFinite(maxKeys)) {
    return s3DeleteObjectsMaxBatchSize;
  }

  return Math.max(1, Math.min(Math.trunc(maxKeys), s3DeleteObjectsMaxBatchSize));
}

function chunkKeys(keys: string[], batchSize: number): string[][] {
  const chunks: string[][] = [];
  const uniqueKeys = Array.from(new Set(keys)).filter((key) => key.length > 0);

  for (let index = 0; index < uniqueKeys.length; index += batchSize) {
    chunks.push(uniqueKeys.slice(index, index + batchSize));
  }

  return chunks;
}

function chunkObjectVersions(
  objects: DeleteObjectVersionIdentifier[],
  batchSize: number,
): DeleteObjectVersionIdentifier[][] {
  const chunks: DeleteObjectVersionIdentifier[][] = [];
  const seen = new Set<string>();
  const uniqueObjects = objects.filter((object) => {
    if (object.key.length === 0) {
      return false;
    }
    const identity = createObjectVersionIdentity(object);

    if (seen.has(identity)) {
      return false;
    }
    seen.add(identity);

    return true;
  });

  for (let index = 0; index < uniqueObjects.length; index += batchSize) {
    chunks.push(uniqueObjects.slice(index, index + batchSize));
  }

  return chunks;
}

function createObjectVersionIdentity(object: DeleteObjectVersionIdentifier): string {
  return `${object.key}\u0000${object.versionId ?? ""}`;
}

function createDeleteObjectFailure(
  key: string,
  error: unknown,
  redactionValues: string[] = [],
): DeleteObjectFailure {
  return {
    key,
    ...readOptionalErrorCode(error),
    message: sanitizeErrorMessage(getErrorMessage(error), redactionValues),
    retryable: !isObjectMissingError(error),
  };
}

function createDeleteObjectVersionFailure(
  object: DeleteObjectVersionIdentifier,
  error: unknown,
  redactionValues: string[] = [],
): DeleteObjectVersionFailure {
  return {
    key: object.key,
    ...readOptionalErrorCode(error),
    message: sanitizeErrorMessage(getErrorMessage(error), redactionValues),
    retryable: !isObjectMissingError(error),
    ...(object.versionId === undefined ? {} : { versionId: object.versionId }),
  };
}

function isMissingObjectCode(code: string | undefined): boolean {
  return code === "NoSuchKey" || code === "NotFound" || code === "404";
}

function readOptionalErrorCode(error: unknown): { code?: string } {
  const code = readErrorCode(error);

  return code === undefined ? {} : { code };
}

function readErrorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) {
    return undefined;
  }

  const candidate = error as Record<string, unknown>;

  for (const key of ["Code", "code", "name"]) {
    const value = candidate[key];

    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }

  return undefined;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Object storage diagnostics failed.";
}

function sanitizeErrorMessage(message: string, redactionValues: string[]): string {
  return redactionValues.reduce(
    (current, value) => current.split(value).join("[redacted]"),
    message,
  );
}
