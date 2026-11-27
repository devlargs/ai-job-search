import { BadRequestException, Body, Controller, Get, Put } from '@nestjs/common';
import { Preference } from '@ai-job-search/shared';
import { PreferenceService } from './preference.service.js';

@Controller('preference')
export class PreferenceController {
  constructor(private readonly preference: PreferenceService) {}

  /** GET /api/preference: the stored preference, or the defaults. */
  @Get()
  get(): Promise<Preference> {
    return this.preference.get();
  }

  /** PUT /api/preference: validates and replaces the preference. 400 and nothing saved on an invalid body. */
  @Put()
  put(@Body() body: unknown): Promise<Preference> {
    const parsed = Preference.safeParse(body);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const where = issue && issue.path.length > 0 ? `${issue.path.join('.')}: ` : '';
      throw new BadRequestException(`Invalid preference: ${where}${issue?.message ?? 'bad body'}`);
    }
    return this.preference.set(parsed.data);
  }
}
