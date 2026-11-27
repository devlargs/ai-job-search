import { Module } from '@nestjs/common';
import { ResumeSkills } from './resume-skills.js';

@Module({
  providers: [ResumeSkills],
  exports: [ResumeSkills],
})
export class ResumeModule {}
