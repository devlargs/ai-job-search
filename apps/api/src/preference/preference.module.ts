import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PreferenceController } from './preference.controller.js';
import { PreferenceDoc, PreferenceSchema } from './preference.schema.js';
import { PreferenceService } from './preference.service.js';

@Module({
  imports: [MongooseModule.forFeature([{ name: PreferenceDoc.name, schema: PreferenceSchema }])],
  controllers: [PreferenceController],
  providers: [PreferenceService],
  exports: [PreferenceService],
})
export class PreferenceModule {}
