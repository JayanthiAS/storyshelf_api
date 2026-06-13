import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from '../../users/schemas/user.schema';
import type { JwtPayload } from '../../../common/decorators/current-user.decorator';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET', 'change-me'),
    });
  }

  async validate(payload: JwtPayload): Promise<JwtPayload> {
    const user = await this.userModel.findById(payload.sub);
    if (!user || user.deletedAt || !user.isActive) {
      throw new UnauthorizedException('User not found or inactive');
    }
    return {
      sub: payload.sub,
      email: payload.email,
      role: payload.role,
      isSuperAdmin: payload.isSuperAdmin,
    };
  }
}
