import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const req = context.switchToHttp().getRequest<{
      method: string;
      originalUrl: string;
    }>();
    const { method, originalUrl } = req;
    const started = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const res = context.switchToHttp().getResponse<{ statusCode: number }>();
          this.logger.log(
            `${method} ${originalUrl} ${res.statusCode} ${Date.now() - started}ms`,
          );
        },
        error: (err: { status?: number; message?: string }) => {
          const status = err?.status ?? 500;
          this.logger.warn(
            `${method} ${originalUrl} ${status} ${Date.now() - started}ms — ${err?.message ?? 'error'}`,
          );
        },
      }),
    );
  }
}
