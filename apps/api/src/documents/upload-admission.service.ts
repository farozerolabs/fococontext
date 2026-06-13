import { Inject, Injectable } from "@nestjs/common";
import { ApiError } from "@fococontext/contracts";
import type { RuntimeConfig } from "@fococontext/core";

import { runtimeConfigToken } from "../runtime-config.provider.js";
import {
  uploadAdmissionStateStoreToken,
  type UploadAdmissionStateStore,
} from "./upload-admission-state.store.js";

export interface UploadAdmissionSnapshot {
  activeMultipartUploads: number;
  backend: "redis" | "local";
  multipartAdmissionLimit: number;
  pressureDegradedThreshold: number;
  pressure: "normal" | "degraded" | "limited";
}

export interface UploadAdmissionLease {
  release(): Promise<void>;
}

@Injectable()
export class UploadAdmissionService {
  constructor(
    @Inject(runtimeConfigToken) private readonly runtimeConfig: RuntimeConfig,
    @Inject(uploadAdmissionStateStoreToken)
    private readonly stateStore: UploadAdmissionStateStore,
  ) {}

  async acquireMultipartUpload(): Promise<UploadAdmissionLease> {
    const limit = this.runtimeConfig.limits.upload.admissionConcurrency;
    const lease = await this.stateStore.acquireMultipartLease({
      leaseTtlSeconds: this.runtimeConfig.limits.upload.multipartTimeoutSeconds + 300,
      limit,
    });

    if (lease.active > limit) {
      const retryAfterMs = 1000;

      throw new ApiError("rate_limited", {
        messageKey: "api.validation.upload_admission_limit",
        details: {
          active_uploads: Math.max(0, lease.active - 1),
          limit,
          pressure: "limited",
          retry_after_ms: retryAfterMs,
          retry_after_seconds: Math.ceil(retryAfterMs / 1000),
          guidance:
            "Retry after the active multipart uploads finish or use a direct upload session for large files.",
        },
      });
    }

    return {
      release: () => lease.release(),
    };
  }

  async getSnapshot(): Promise<UploadAdmissionSnapshot> {
    const limit = this.runtimeConfig.limits.upload.admissionConcurrency;
    const pressureDegradedThreshold = this.runtimeConfig.limits.upload.pressureDegradedThreshold;
    const snapshot = await this.stateStore.getMultipartSnapshot({
      limit,
    });
    const pressure =
      snapshot.active >= limit
        ? "limited"
        : snapshot.active >= pressureDegradedThreshold
          ? "degraded"
          : "normal";

    return {
      activeMultipartUploads: snapshot.active,
      backend: snapshot.backend,
      multipartAdmissionLimit: limit,
      pressureDegradedThreshold,
      pressure,
    };
  }
}
