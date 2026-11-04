import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { User, UserDocument } from '../users/schemas/user.schema';
import {
  OtpVerification,
  OtpVerificationDocument,
} from './schemas/otp-verification.schema';
import {
  SubscriptionPlan,
  SubscriptionPlanDocument,
} from '../subscriptions/schemas/subscription-plan.schema';
import {
  Subscription,
  SubscriptionDocument,
} from '../subscriptions/schemas/subscription.schema';
import {
  RegisterDto,
  LoginDto,
  VerifyOtpDto,
  ResetPasswordDto,
} from './dto/auth.dto';
import { Role } from '../../common/enums/role.enum';
import { OtpType } from '../../common/enums/otp-type.enum';
import { SubscriptionStatus } from '../../common/enums/subscription-status.enum';
import { generateOtp } from '../../common/utils/helpers.util';
import { RedisService } from '../../common/services/redis.service';
import { JwtPayload } from '../../common/decorators/current-user.decorator';
import { RabbitMQService, QUEUES } from '../../common/services/rabbitmq.service';
import { NotificationType } from '../../common/enums/notification-type.enum';

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(OtpVerification.name)
    private otpModel: Model<OtpVerificationDocument>,
    @InjectModel(SubscriptionPlan.name)
    private planModel: Model<SubscriptionPlanDocument>,
    @InjectModel(Subscription.name)
    private subscriptionModel: Model<SubscriptionDocument>,
    private jwtService: JwtService,
    private configService: ConfigService,
    private redisService: RedisService,
    private rabbitMQService: RabbitMQService,
  ) {}

  private sanitizeUser(user: UserDocument) {
    const obj = user.toObject();
    delete (obj as Record<string, unknown>).passwordHash;
    return obj;
  }

  private async generateTokens(user: UserDocument) {
    const payload: JwtPayload = {
      sub: user._id.toString(),
      email: user.email,
      role: user.role,
      isSuperAdmin: user.isSuperAdmin,
    };
    const accessToken = this.jwtService.sign(payload);
    const refreshToken = this.jwtService.sign(payload, {
      expiresIn: this.configService.get('JWT_REFRESH_EXPIRES', '7d'),
    });
    await this.redisService.set(
      `refresh:${user._id.toString()}`,
      refreshToken,
      7 * 24 * 60 * 60,
    );
    return { accessToken, refreshToken };
  }

  private async createOtp(userId: string, type: OtpType) {
    const isDev = this.configService.get('NODE_ENV') === 'development';
    const defaultOtp = isDev
      ? this.configService.get<string>('OTP_DEFAULT', '123456')
      : undefined;
    const code = generateOtp(defaultOtp);
    const expiresMinutes = this.configService.get<number>(
      'OTP_EXPIRES_MINUTES',
      10,
    );
    const expiresAt = new Date(Date.now() + expiresMinutes * 60 * 1000);
    const userObjectId = new Types.ObjectId(userId);

    await this.otpModel.updateMany(
      { userId: userObjectId, type, isUsed: false },
      { isUsed: true },
    );

    await this.otpModel.create({
      userId: userObjectId,
      code,
      type,
      expiresAt,
    });

    return code;
  }

  private includeOtpInResponse(code: string) {
    const isDev = this.configService.get('NODE_ENV') === 'development';
    return isDev ? { otp: code } : {};
  }

  async register(dto: RegisterDto) {
    const existing = await this.userModel.findOne({ email: dto.email });
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const freePlan = await this.planModel.findOne({
      isDefault: true,
      isActive: true,
      deletedAt: null,
    });
    if (!freePlan) {
      throw new BadRequestException('Default subscription plan not configured');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const user = await this.userModel.create({
      email: dto.email,
      passwordHash,
      firstName: dto.firstName,
      lastName: dto.lastName,
      role: Role.USER,
    });

    const subscription = await this.subscriptionModel.create({
      userId: user._id,
      planId: freePlan._id,
      status: SubscriptionStatus.ACTIVE,
      currentPeriodStart: new Date(),
    });

    user.subscriptionId = subscription._id;
    user.subscriptionPlanId = freePlan._id;
    await user.save();

    const otpCode = await this.createOtp(
      user._id.toString(),
      OtpType.EMAIL_VERIFICATION,
    );

    const tokens = await this.generateTokens(user);

    await this.rabbitMQService.publish(QUEUES.NOTIFICATIONS_SEND, {
      userId: user._id.toString(),
      type: NotificationType.SYSTEM,
      title: 'Welcome to Storyshelf',
      body: 'Your account has been created. Please verify your email.',
    });

    return {
      user: this.sanitizeUser(user),
      ...tokens,
      ...this.includeOtpInResponse(otpCode),
      message: 'Registration successful. Please verify your email with OTP.',
    };
  }

  async verifyOtp(dto: VerifyOtpDto) {
    const user = await this.userModel.findOne({
      email: dto.email.toLowerCase(),
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const otp = await this.otpModel.findOne({
      $or: [{ userId: user._id }, { userId: user._id.toString() }],
      code: dto.code,
      type: OtpType.EMAIL_VERIFICATION,
      isUsed: false,
      expiresAt: { $gt: new Date() },
    });

    if (!otp) {
      throw new BadRequestException('Invalid or expired OTP', {
        cause: { code: 'OTP_INVALID' },
      });
    }

    otp.isUsed = true;
    await otp.save();
    user.isEmailVerified = true;
    await user.save();

    return { message: 'Email verified successfully' };
  }

  async resendOtp(email: string) {
    const user = await this.userModel.findOne({ email: email.toLowerCase() });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    const otpCode = await this.createOtp(
      user._id.toString(),
      OtpType.EMAIL_VERIFICATION,
    );
    return {
      message: 'OTP sent successfully',
      ...this.includeOtpInResponse(otpCode),
    };
  }

  async login(dto: LoginDto, adminOnly = false) {
    const user = await this.userModel.findOne({ email: dto.email });
    if (!user || user.deletedAt) {
      throw new UnauthorizedException('Invalid credentials');
    }
    if (!user.isActive) {
      throw new UnauthorizedException('Account is deactivated');
    }

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (adminOnly && user.role !== Role.ADMIN) {
      throw new UnauthorizedException('Admin access required');
    }

    const tokens = await this.generateTokens(user);
    return { user: this.sanitizeUser(user), ...tokens };
  }

  async refresh(refreshToken: string) {
    try {
      const payload = this.jwtService.verify<JwtPayload>(refreshToken);
      const stored = await this.redisService.get(`refresh:${payload.sub}`);
      if (stored !== refreshToken) {
        throw new UnauthorizedException('Invalid refresh token');
      }
      const user = await this.userModel.findById(payload.sub);
      if (!user || user.deletedAt || !user.isActive) {
        throw new UnauthorizedException('User not found');
      }
      const tokens = await this.generateTokens(user);
      return { user: this.sanitizeUser(user), ...tokens };
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async logout(userId: string) {
    await this.redisService.del(`refresh:${userId}`);
    return { message: 'Logged out successfully' };
  }

  async forgotPassword(email: string) {
    const user = await this.userModel.findOne({ email });
    if (!user) {
      return { message: 'If the email exists, an OTP has been sent' };
    }
    await this.createOtp(user._id.toString(), OtpType.PASSWORD_RESET);
    return { message: 'If the email exists, an OTP has been sent' };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const user = await this.userModel.findOne({ email: dto.email });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const otp = await this.otpModel.findOne({
      $or: [{ userId: user._id }, { userId: user._id.toString() }],
      code: dto.code,
      type: OtpType.PASSWORD_RESET,
      isUsed: false,
      expiresAt: { $gt: new Date() },
    });

    if (!otp) {
      throw new BadRequestException('Invalid or expired OTP');
    }

    otp.isUsed = true;
    await otp.save();
    user.passwordHash = await bcrypt.hash(dto.newPassword, 12);
    await user.save();
    await this.redisService.del(`refresh:${user._id.toString()}`);

    return { message: 'Password reset successfully' };
  }

  async getMe(userId: string) {
    const user = await this.userModel.findById(userId);
    if (!user || user.deletedAt) {
      throw new NotFoundException('User not found');
    }
    return this.sanitizeUser(user);
  }
}
