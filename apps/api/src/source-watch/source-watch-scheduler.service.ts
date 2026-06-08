import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import type { RuntimeConfig } from "@fococontext/core";

import { runtimeConfigToken } from "../runtime-config.provider.js";
import { SourceWatchService } from "./source-watch.service.js";

export const sourceWatchSchedulerTickMs = 30_000;

@Injectable()
export class SourceWatchSchedulerService implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    @Inject(runtimeConfigToken)
    private readonly config: RuntimeConfig,
    private readonly sourceWatchService: SourceWatchService,
  ) {}

  onModuleInit(): void {
    if (!this.config.sourceWatch.scheduler.enabled) {
      return;
    }

    this.timer = setInterval(() => {
      void this.tick();
    }, sourceWatchSchedulerTickMs);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async tick(now: Date = new Date()): Promise<void> {
    if (this.running) {
      return;
    }

    this.running = true;

    try {
      await this.sourceWatchService.runDueScheduledScans(now);
    } finally {
      this.running = false;
    }
  }
}
