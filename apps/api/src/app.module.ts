import { fileURLToPath } from 'node:url';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';
import { ServeStaticModule } from '@nestjs/serve-static';
import { ListingsModule } from './listings/listings.module.js';
import { PreferenceModule } from './preference/preference.module.js';

/** apps/web/dist, resolved from this file (apps/api/dist/app.module.js or apps/api/src/app.module.ts). */
const WEB_DIST = fileURLToPath(new URL('../../web/dist', import.meta.url));
/** Repo-root .env, so `pnpm start` from the root and `nest start` from apps/api both find it. */
const ROOT_ENV = fileURLToPath(new URL('../../../.env', import.meta.url));

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: [ROOT_ENV, '.env'] }),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.get<string>('MONGO_URI') ?? 'mongodb://localhost:27017/ai-job-search',
      }),
    }),
    ScheduleModule.forRoot(),
    ServeStaticModule.forRoot({
      rootPath: WEB_DIST,
      exclude: ['/api/{*path}'],
    }),
    ListingsModule,
    PreferenceModule,
  ],
})
export class AppModule {}
