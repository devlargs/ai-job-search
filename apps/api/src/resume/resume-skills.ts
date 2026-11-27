import { Injectable } from '@nestjs/common';

/**
 * The only source of the resume skill set (AD-6). Matching uses nothing else.
 *
 * STUB: there is no master resume yet, so this always returns null and every
 * feed score is null. epic-resume-tailoring replaces it with the set of
 * non-null `skillId`s in the confirmed master resume.
 */
@Injectable()
export class ResumeSkills {
  async resumeSkillSet(): Promise<ReadonlySet<string> | null> {
    return null;
  }
}
