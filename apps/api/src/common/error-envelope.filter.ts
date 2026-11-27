import { ArgumentsHost, Catch, HttpException, HttpStatus, Logger, type ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';

const CODES: Record<number, string> = {
  400: 'bad_request',
  404: 'not_found',
  405: 'method_not_allowed',
  409: 'conflict',
  422: 'unprocessable_entity',
  500: 'internal_error',
  503: 'service_unavailable',
};

/** Every API error leaves as `{ error: { code, message } }` (Consistency Conventions). */
@Catch()
export class ErrorEnvelopeFilter implements ExceptionFilter {
  private readonly logger = new Logger('Http');

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const message =
      exception instanceof HttpException
        ? exception.message
        : 'Internal server error';
    if (!(exception instanceof HttpException)) {
      this.logger.error(exception instanceof Error ? exception.stack ?? exception.message : String(exception));
    }
    res.status(status).json({ error: { code: CODES[status] ?? `http_${status}`, message } });
  }
}
