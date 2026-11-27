import { Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { IngestionService } from './ingestion.service.js';

const INTERVAL_NAME = 'ingestion-fetch';

/**
 * AD-1: a run fires at boot (not awaited, so HTTP never waits on a fetch) and
 * then every FETCH_INTERVAL_MIN minutes. IngestionService.run() is single-flight.
 */
@Injectable()
export class IngestionScheduler implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger('IngestionScheduler');

  constructor(
    private readonly ingestion: IngestionService,
    private readonly registry: SchedulerRegistry,
    private readonly config: ConfigService,
  ) {}

  onApplicationBootstrap(): void {
    const minutes = Number(this.config.get('FETCH_INTERVAL_MIN') ?? 30);
    const intervalMin = Number.isFinite(minutes) && minutes > 0 ? minutes : 30;
    const handle = setInterval(() => this.fire(), intervalMin * 60_000);
    this.registry.addInterval(INTERVAL_NAME, handle);
    this.logger.log(`Fetch scheduled every ${intervalMin} min`);
    this.fire();
  }

  onApplicationShutdown(): void {
    if (this.registry.doesExist('interval', INTERVAL_NAME)) {
      this.registry.deleteInterval(INTERVAL_NAME);
    }
  }

  private fire(): void {
    void this.ingestion.run().catch((err: unknown) => {
      this.logger.error(`Fetch run crashed: ${err instanceof Error ? err.message : String(err)}`);
    });
  }
}
