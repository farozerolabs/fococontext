import { Inject, Injectable } from "@nestjs/common";
import { ApiError } from "@fococontext/contracts";
import type { RuntimeConfig } from "@fococontext/core";

import { runtimeConfigToken } from "../runtime-config.provider.js";

export interface UploadAdmissionSnapshot {
  activeMultipartUploads: number;
  multipartAdmissionLimit: number;
  pressureDegradedThreshold: number;
  pressure: "normal" | "degraded" | "limited";
}

export interface UploadAdmissionLease {
  release(): void;
}

@Injectable()
export class UploadAdmissionService {
  private activeMultipartUploads = 0;

  constructor(@Inject(runtimeConfigToken) private readonly runtimeConfig: RuntimeConfig) {}

  acquireMultipartUpload(): UploadAdmissionLease {
    const limit = this.runtimeConfig.limits.upload.admissionConcurrency;

    if (this.activeMultipartUploads >= limit) {
      const retryAfterMs = 1000;

      throw new ApiError("rate_limited", {
        messageKey: "api.validation.upload_admission_limit",
        details: {
          active_uploads: this.activeMultipartUploads,
          limit,
          pressure: "limited",
          retry_after_ms: retryAfterMs,
          retry_after_seconds: Math.ceil(retryAfterMs / 1000),
          guidance:
            "Retry after the active multipart uploads finish or use a direct upload session for large files.",
        },
      });
    }

    this.activeMultipartUploads += 1;
    let released = false;

    return {
      release: () => {
        if (released) {
          return;
        }

        released = true;
        this.activeMultipartUploads = Math.max(0, this.activeMultipartUploads - 1);
      },
    };
  }

  getSnapshot(): UploadAdmissionSnapshot {
    const limit = this.runtimeConfig.limits.upload.admissionConcurrency;
    const pressureDegradedThreshold = this.runtimeConfig.limits.upload.pressureDegradedThreshold;
    const pressure =
      this.activeMultipartUploads >= limit
        ? "limited"
        : this.activeMultipartUploads >= pressureDegradedThreshold
          ? "degraded"
          : "normal";

    return {
      activeMultipartUploads: this.activeMultipartUploads,
      multipartAdmissionLimit: limit,
      pressureDegradedThreshold,
      pressure,
    };
  }
}
