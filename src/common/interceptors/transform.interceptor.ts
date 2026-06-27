import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  StreamableFile,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable()
export class TransformInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      map((data) => {
        // Do not wrap binary file streams — breaks PDF/EPUB content delivery
        if (data instanceof StreamableFile) {
          return data;
        }
        if (data && typeof data === 'object' && 'success' in data) {
          return data;
        }
        return { success: true, data };
      }),
    );
  }
}
