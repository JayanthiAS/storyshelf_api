import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  canActivate(context: ExecutionContext) {
    return super.canActivate(context) as Promise<boolean>;
  }

  handleRequest<T>(err: Error | null, user: T): T | undefined {
    if (err || !user) {
      return undefined;
    }
    return user;
  }
}
