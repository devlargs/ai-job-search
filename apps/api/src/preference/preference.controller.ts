import { BadRequestException, Body, Controller, Get, Put, StandardSchemaValidationPipe } from '@nestjs/common';
import { Preference } from '@ai-job-search/shared';
import { PreferenceService } from './preference.service.js';

type Issue = { message: string; path?: ReadonlyArray<PropertyKey | { key: PropertyKey }> | undefined };

/** The first issue as `Invalid preference: <path>: <message>`, the path left out when empty. */
export function invalidPreference(issues: readonly Issue[]): BadRequestException {
  const issue = issues[0];
  const path = (issue?.path ?? []).map((seg) => String(typeof seg === 'object' && seg !== null ? seg.key : seg));
  const where = path.length > 0 ? `${path.join('.')}: ` : '';
  return new BadRequestException(`Invalid preference: ${where}${issue?.message ?? 'bad body'}`);
}

/** Validates the PUT body against the shared schema (AD-8) and returns the parsed, normalized value. */
export const preferenceBodyPipe = new StandardSchemaValidationPipe({ exceptionFactory: invalidPreference });

@Controller('preference')
export class PreferenceController {
  constructor(private readonly preference: PreferenceService) {}

  /** GET /api/preference: the stored preference, or the defaults. */
  @Get()
  get(): Promise<Preference> {
    return this.preference.get();
  }

  /** PUT /api/preference: validated by the pipe; 400 and nothing saved on an invalid body. */
  @Put()
  put(@Body({ schema: Preference, pipes: [preferenceBodyPipe] }) body: Preference): Promise<Preference> {
    return this.preference.set(body);
  }
}
