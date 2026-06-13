import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { User, UserDocument } from '../modules/users/schemas/user.schema';
import {
  SubscriptionPlan,
  SubscriptionPlanDocument,
} from '../modules/subscriptions/schemas/subscription-plan.schema';
import {
  Subscription,
  SubscriptionDocument,
} from '../modules/subscriptions/schemas/subscription.schema';
import { Role } from '../common/enums/role.enum';
import { PlanInterval } from '../common/enums/plan-interval.enum';
import { SubscriptionStatus } from '../common/enums/subscription-status.enum';
import { toSlug } from '../common/utils/helpers.util';

@Injectable()
export class SeedService implements OnModuleInit {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(SubscriptionPlan.name)
    private planModel: Model<SubscriptionPlanDocument>,
    @InjectModel(Subscription.name)
    private subscriptionModel: Model<SubscriptionDocument>,
    private configService: ConfigService,
  ) {}

  async onModuleInit() {
    await this.seedPlans();
    await this.seedSuperAdmin();
  }

  private async seedPlans() {
    const existing = await this.planModel.findOne({ isDefault: true });
    if (existing) return;

    await this.planModel.create([
      {
        name: 'Free',
        slug: 'free',
        description: 'Free plan with access to unlocked books',
        price: 0,
        interval: PlanInterval.FREE,
        isDefault: true,
        isActive: true,
        unlocksLockedBooks: false,
        features: ['Access to free books', 'Reading progress tracking'],
      },
      {
        name: 'Premium',
        slug: 'premium',
        description: 'Access to all books including locked content',
        price: 9.99,
        interval: PlanInterval.MONTH,
        isDefault: false,
        isActive: true,
        unlocksLockedBooks: true,
        features: ['All free features', 'Access to locked books', 'Priority support'],
      },
    ]);

    this.logger.log('Subscription plans seeded');
  }

  private async seedSuperAdmin() {
    const email = this.configService.get<string>(
      'SUPERADMIN_EMAIL',
      'superadmin@storyshelf.com',
    );
    const existing = await this.userModel.findOne({ email });
    if (existing) return;

    const password = this.configService.get<string>(
      'SUPERADMIN_PASSWORD',
      'SuperAdmin@123',
    );
    const passwordHash = await bcrypt.hash(password, 12);

    const admin = await this.userModel.create({
      email,
      passwordHash,
      firstName: 'Super',
      lastName: 'Admin',
      role: Role.ADMIN,
      isSuperAdmin: true,
      isEmailVerified: true,
      isActive: true,
    });

    const freePlan = await this.planModel.findOne({ slug: toSlug('Free') });
    if (freePlan) {
      const subscription = await this.subscriptionModel.create({
        userId: admin._id,
        planId: freePlan._id,
        status: SubscriptionStatus.ACTIVE,
        currentPeriodStart: new Date(),
      });
      admin.subscriptionId = subscription._id;
      admin.subscriptionPlanId = freePlan._id;
      await admin.save();
    }

    this.logger.log(`Superadmin seeded: ${email}`);
  }
}
