import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '../enums/role.enum';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { IS_SUPER_ADMIN_KEY } from '../decorators/super-admin.decorator';
import { JwtPayload } from '../decorators/current-user.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const superAdminOnly = this.reflector.getAllAndOverride<boolean>(
      IS_SUPER_ADMIN_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles && !superAdminOnly) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{ user?: JwtPayload }>();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('Authentication required');
    }

    if (superAdminOnly && !user.isSuperAdmin) {
      throw new ForbiddenException('Superadmin access required');
    }

    if (requiredRoles && !requiredRoles.includes(user.role as Role)) {
      throw new ForbiddenException('Insufficient permissions');
    }

    return true;
  }
}
