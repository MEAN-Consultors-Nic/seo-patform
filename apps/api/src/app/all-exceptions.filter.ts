import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

/**
 * Global filter that surfaces the actual error message on 5xx responses
 * instead of the default 'Internal server error' opaque string, and logs
 * the stack trace so Heroku logs make production issues diagnosable.
 * HttpExceptions (400/401/403/404 etc.) pass through unchanged.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exception');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      res.status(status).json(
        typeof body === 'string' ? { statusCode: status, message: body } : body,
      );
      return;
    }

    const err = exception as { message?: string; stack?: string; name?: string };
    const message = err?.message || 'Unexpected error';
    this.logger.error(
      `${req.method} ${req.url} → ${err?.name || 'Error'}: ${message}`,
      err?.stack,
    );
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message,
      path: req.url,
    });
  }
}
