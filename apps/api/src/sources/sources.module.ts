import { Module } from '@nestjs/common';
import { HimalayasAdapter } from './adapters/himalayas.adapter.js';
import { JobicyAdapter } from './adapters/jobicy.adapter.js';
import { RemoteOkAdapter } from './adapters/remoteok.adapter.js';
import { RemotiveAdapter } from './adapters/remotive.adapter.js';
import { WeWorkRemotelyAdapter } from './adapters/we-work-remotely.adapter.js';
import { JOB_SOURCES, type JobSource } from './job-source.port.js';

/** Registry of usable sources (AD-2). Add a board only after the spike marks it usable. */
export const SOURCES: Array<new () => JobSource> = [
  RemotiveAdapter,
  RemoteOkAdapter,
  WeWorkRemotelyAdapter,
  HimalayasAdapter,
  JobicyAdapter,
];

@Module({
  providers: [
    {
      provide: JOB_SOURCES,
      useFactory: (): JobSource[] => SOURCES.map((Source) => new Source()),
    },
  ],
  exports: [JOB_SOURCES],
})
export class SourcesModule {}
