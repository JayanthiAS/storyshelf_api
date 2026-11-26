import { createHash, randomBytes, randomUUID } from 'crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import * as bcrypt from 'bcrypt';
import { Model, Types } from 'mongoose';
import { InviteStatus } from '../../common/enums/invite-status.enum';
import { MembershipStatus } from '../../common/enums/membership-status.enum';
import { OrgRole } from '../../common/enums/org-role.enum';
import { OrganizationStatus } from '../../common/enums/organization-status.enum';
import { Role } from '../../common/enums/role.enum';
import { toSlug } from '../../common/utils/helpers.util';
import {
  buildPaginatedResult,
  parsePagination,
} from '../../common/utils/pagination.util';
import { User, UserDocument } from '../users/schemas/user.schema';
import {
  AcceptPublisherInviteDto,
  CreatePublisherHouseDto,
  PublisherListQueryDto,
  UpdatePublisherOrganizationDto,
} from './dto/publisher.dto';
import {
  COMPLIMENTARY_TERMS_TEXT,
  COMPLIMENTARY_TERMS_VERSION,
  INVITE_TTL_MS,
} from './publisher.constants';
import {
  Organization,
  OrganizationDocument,
} from './schemas/organization.schema';
import {
  PublisherAgreement,
  PublisherAgreementDocument,
} from './schemas/publisher-agreement.schema';
import {
  PublisherInvite,
  PublisherInviteDocument,
} from './schemas/publisher-invite.schema';
import {
  PublisherMembership,
  PublisherMembershipDocument,
} from './schemas/publisher-membership.schema';

const EMAIL_IN_USE = {
  message:
    'This email already has a Storyshelf account. Invite a work email that is not registered.',
  code: 'EMAIL_IN_USE',
};

const INVITE_INVALID = {
  message: 'This invite is no longer valid. Ask Storyshelf for a new link.',
  code: 'INVITE_INVALID',
};

@Injectable()
export class PublishersService {
  constructor(
    @InjectModel(Organization.name)
    private organizationModel: Model<OrganizationDocument>,
    @InjectModel(PublisherMembership.name)
    private membershipModel: Model<PublisherMembershipDocument>,
    @InjectModel(PublisherAgreement.name)
    private agreementModel: Model<PublisherAgreementDocument>,
    @InjectModel(PublisherInvite.name)
    private inviteModel: Model<PublisherInviteDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private configService: ConfigService,
  ) {}

  async createHouse(dto: CreatePublisherHouseDto, adminId: string) {
    const email = dto.ownerEmail.trim().toLowerCase();
    await this.assertEmailAvailable(email);
    await this.assertNoPendingInvite(email);

    const organization = await this.organizationModel.create({
      legalName: dto.legalName.trim(),
      displayName: dto.displayName.trim(),
      slug: await this.uniqueSlug(dto.displayName),
      country: dto.country.trim(),
      website: dto.website?.trim() || null,
      status: OrganizationStatus.INVITED,
      primaryContactEmail: email,
    });

    await this.agreementModel.create({
      organizationId: organization._id,
      termsVersion: COMPLIMENTARY_TERMS_VERSION,
      commercialModel: 'complimentary',
      territory: ['WORLD'],
    });

    const invite = await this.issueInvite({
      organizationId: organization._id,
      email,
      firstName: dto.ownerFirstName.trim(),
      lastName: dto.ownerLastName.trim(),
      orgRole: OrgRole.OWNER,
      invitedBy: new Types.ObjectId(adminId),
    });

    return {
      house: await this.presentHouse(organization),
      inviteUrl: invite.inviteUrl,
      expiresAt: invite.expiresAt,
    };
  }

  async listHouses(query: PublisherListQueryDto) {
    const { page, limit, skip } = parsePagination(query);
    const filter: Record<string, unknown> = { deletedAt: null };
    if (query.search?.trim()) {
      const search = query.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [
        { displayName: { $regex: search, $options: 'i' } },
        { legalName: { $regex: search, $options: 'i' } },
        { primaryContactEmail: { $regex: search, $options: 'i' } },
      ];
    }
    const [houses, total] = await Promise.all([
      this.organizationModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      this.organizationModel.countDocuments(filter),
    ]);
    const presented = await Promise.all(houses.map((house) => this.presentHouse(house)));
    return buildPaginatedResult(presented, total, page, limit);
  }

  async resendInvite(organizationId: string) {
    const organization = await this.requireHouse(organizationId);
    if (organization.status === OrganizationStatus.SUSPENDED) {
      throw new ForbiddenException({
        message: 'Reactivate this house before sending a new invite.',
        code: 'ORG_SUSPENDED',
      });
    }
    const owner = await this.membershipModel.findOne({
      organizationId: organization._id,
      orgRole: OrgRole.OWNER,
      status: MembershipStatus.ACTIVE,
    });
    if (owner) {
      throw new BadRequestException('This house already has an owner.');
    }

    await this.inviteModel.updateMany(
      { organizationId: organization._id, status: InviteStatus.PENDING },
      { status: InviteStatus.REVOKED },
    );

    const previous = await this.inviteModel
      .findOne({ organizationId: organization._id })
      .sort({ createdAt: -1 });
    if (!previous) {
      throw new NotFoundException('No invite exists for this house.');
    }
    await this.assertEmailAvailable(previous.email);
    await this.assertNoPendingInvite(previous.email);

    const invite = await this.issueInvite({
      organizationId: organization._id,
      email: previous.email,
      firstName: previous.firstName,
      lastName: previous.lastName,
      orgRole: OrgRole.OWNER,
      invitedBy: previous.invitedBy,
    });

    return {
      inviteUrl: invite.inviteUrl,
      expiresAt: invite.expiresAt,
      email: previous.email,
    };
  }

  async suspendHouse(organizationId: string) {
    const organization = await this.requireHouse(organizationId);
    if (organization.status === OrganizationStatus.SUSPENDED) {
      throw new BadRequestException('This house is already suspended.');
    }
    organization.status = OrganizationStatus.SUSPENDED;
    await organization.save();
    return this.presentHouse(organization);
  }

  async reactivateHouse(organizationId: string) {
    const organization = await this.requireHouse(organizationId);
    if (organization.status !== OrganizationStatus.SUSPENDED) {
      throw new BadRequestException('This house is not suspended.');
    }
    const agreement = await this.agreementModel.findOne({
      organizationId: organization._id,
      termsVersion: COMPLIMENTARY_TERMS_VERSION,
    });
    organization.status = agreement?.acceptedAt
      ? OrganizationStatus.ACTIVE
      : OrganizationStatus.INVITED;
    await organization.save();
    return this.presentHouse(organization);
  }

  async previewInvite(token: string) {
    const invite = await this.requirePendingInvite(token);
    const organization = await this.requireHouse(invite.organizationId.toString());
    this.assertHouseCanAccept(organization);
    return {
      email: invite.email,
      displayName: organization.displayName,
      legalName: organization.legalName,
      expiresAt: invite.expiresAt,
      termsVersion: COMPLIMENTARY_TERMS_VERSION,
      termsText: COMPLIMENTARY_TERMS_TEXT,
    };
  }

  async acceptInvite(dto: AcceptPublisherInviteDto): Promise<UserDocument> {
    const invite = await this.requirePendingInvite(dto.token);
    const organization = await this.requireHouse(invite.organizationId.toString());
    this.assertHouseCanAccept(organization);
    await this.assertEmailAvailable(invite.email);

    const passwordHash = await bcrypt.hash(dto.password, 12);
    let user: UserDocument;
    try {
      user = await this.userModel.create({
        email: invite.email,
        passwordHash,
        firstName: invite.firstName,
        lastName: invite.lastName,
        role: Role.PUBLISHER,
        isEmailVerified: true,
        isActive: true,
      });
    } catch (error) {
      if (this.isDuplicateKey(error)) {
        throw new ConflictException(EMAIL_IN_USE);
      }
      throw error;
    }

    try {
      await this.membershipModel.create({
        userId: user._id,
        organizationId: organization._id,
        orgRole: invite.orgRole,
        status: MembershipStatus.ACTIVE,
      });
      await this.agreementModel.updateOne(
        {
          organizationId: organization._id,
          termsVersion: COMPLIMENTARY_TERMS_VERSION,
        },
        { acceptedBy: user._id, acceptedAt: new Date() },
      );
      organization.status = OrganizationStatus.ACTIVE;
      await organization.save();
      invite.status = InviteStatus.ACCEPTED;
      invite.acceptedAt = new Date();
      await invite.save();
    } catch (error) {
      await this.userModel.deleteOne({ _id: user._id });
      await this.membershipModel.deleteOne({ userId: user._id });
      throw error;
    }

    return user;
  }

  async getActiveMembership(userId: string) {
    if (!Types.ObjectId.isValid(userId)) return null;
    return this.membershipModel.findOne({
      userId: new Types.ObjectId(userId),
      status: MembershipStatus.ACTIVE,
    });
  }

  async getSession(userId: string) {
    const user = await this.userModel.findById(userId);
    if (!user || user.deletedAt || user.role !== Role.PUBLISHER) {
      throw new NotFoundException('Publisher not found');
    }
    const membership = await this.getActiveMembership(userId);
    if (!membership) {
      return {
        user: this.publicUser(user),
        organization: null,
        membership: null,
        agreement: null,
        checklist: this.checklist(false, false),
      };
    }
    const organization = await this.organizationModel.findOne({
      _id: membership.organizationId,
      deletedAt: null,
    });
    if (!organization) {
      return {
        user: this.publicUser(user),
        organization: null,
        membership: null,
        agreement: null,
        checklist: this.checklist(false, false),
      };
    }
    const agreement = await this.agreementModel.findOne({
      organizationId: organization._id,
      termsVersion: COMPLIMENTARY_TERMS_VERSION,
    });
    return {
      user: this.publicUser(user),
      organization: this.publicOrganization(organization),
      membership: {
        orgRole: membership.orgRole,
        status: membership.status,
      },
      agreement: agreement ? this.publicAgreement(agreement) : null,
      checklist: this.checklist(!!agreement?.acceptedAt, !!organization.website),
    };
  }

  async updateOrganization(userId: string, dto: UpdatePublisherOrganizationDto) {
    const context = await this.requireOwnerContext(userId);
    if (context.organization.status === OrganizationStatus.SUSPENDED) {
      throw new ForbiddenException({
        message: 'This house is suspended. Profile changes are paused.',
        code: 'ORG_SUSPENDED',
      });
    }
    if (dto.displayName !== undefined) {
      context.organization.displayName = dto.displayName.trim();
    }
    if (dto.country !== undefined) {
      context.organization.country = dto.country.trim();
    }
    if (dto.website !== undefined) {
      context.organization.website = dto.website.trim();
    }
    await context.organization.save();
    return this.getSession(userId);
  }

  async requireStaff(userId: string, write: boolean, ownerOnly = false) {
    const membership = await this.getActiveMembership(userId);
    if (!membership) {
      throw new ForbiddenException('You are not a member of a publishing house.');
    }
    const organization = await this.organizationModel.findOne({
      _id: membership.organizationId,
      deletedAt: null,
    });
    if (!organization) {
      throw new NotFoundException('Publisher house not found');
    }
    if (ownerOnly && membership.orgRole !== OrgRole.OWNER) {
      throw new ForbiddenException('Only the house owner can do this.');
    }
    if (write && membership.orgRole === OrgRole.VIEWER) {
      throw new ForbiddenException('Viewers cannot change books.');
    }
    if (write && organization.status === OrganizationStatus.SUSPENDED) {
      throw new ForbiddenException({
        message: 'This house is suspended. Changes are paused.',
        code: 'ORG_SUSPENDED',
      });
    }
    return { membership, organization };
  }

  private async requireOwnerContext(userId: string) {
    const membership = await this.getActiveMembership(userId);
    if (!membership || membership.orgRole !== OrgRole.OWNER) {
      throw new ForbiddenException('Only the house owner can change these details.');
    }
    const organization = await this.organizationModel.findOne({
      _id: membership.organizationId,
      deletedAt: null,
    });
    if (!organization) {
      throw new NotFoundException('Publisher house not found');
    }
    return { membership, organization };
  }

  private async assertEmailAvailable(email: string) {
    const existing = await this.userModel.findOne({ email });
    if (existing) {
      throw new ConflictException(EMAIL_IN_USE);
    }
  }

  private async assertNoPendingInvite(email: string) {
    const pending = await this.inviteModel.findOne({
      email,
      status: InviteStatus.PENDING,
      expiresAt: { $gt: new Date() },
    });
    if (pending) {
      throw new ConflictException({
        message: 'An invite is already pending for this email.',
        code: 'EMAIL_IN_USE',
      });
    }
  }

  private async issueInvite(input: {
    organizationId: Types.ObjectId;
    email: string;
    firstName: string;
    lastName: string;
    orgRole: OrgRole;
    invitedBy: Types.ObjectId;
  }) {
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
    await this.inviteModel.create({
      ...input,
      tokenHash: this.hashToken(token),
      expiresAt,
      status: InviteStatus.PENDING,
    });
    return { inviteUrl: this.inviteUrl(token), expiresAt };
  }

  private async requirePendingInvite(token: string) {
    const invite = await this.inviteModel
      .findOne({ tokenHash: this.hashToken(token) })
      .select('+tokenHash');
    if (!invite || invite.status === InviteStatus.REVOKED) {
      throw new NotFoundException(INVITE_INVALID);
    }
    if (invite.status === InviteStatus.ACCEPTED) {
      throw new ConflictException({
        message: 'This invite has already been used. Sign in instead.',
        code: 'INVITE_INVALID',
      });
    }
    if (invite.status === InviteStatus.EXPIRED || invite.expiresAt <= new Date()) {
      if (invite.status !== InviteStatus.EXPIRED) {
        invite.status = InviteStatus.EXPIRED;
        await invite.save();
      }
      throw new BadRequestException({
        message: 'This invite has expired. Ask Storyshelf for a new link.',
        code: 'INVITE_INVALID',
      });
    }
    return invite;
  }

  private assertHouseCanAccept(organization: OrganizationDocument) {
    if (organization.status === OrganizationStatus.SUSPENDED) {
      throw new ForbiddenException({
        message: 'This house is suspended. Ask Storyshelf to reactivate the invite.',
        code: 'ORG_SUSPENDED',
      });
    }
  }

  private async requireHouse(id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Publisher house not found');
    }
    const organization = await this.organizationModel.findOne({
      _id: id,
      deletedAt: null,
    });
    if (!organization) {
      throw new NotFoundException('Publisher house not found');
    }
    return organization;
  }

  private async presentHouse(organization: OrganizationDocument) {
    const [agreement, pendingInvite] = await Promise.all([
      this.agreementModel.findOne({
        organizationId: organization._id,
        termsVersion: COMPLIMENTARY_TERMS_VERSION,
      }),
      this.inviteModel
        .findOne({
          organizationId: organization._id,
          status: InviteStatus.PENDING,
          expiresAt: { $gt: new Date() },
        })
        .sort({ createdAt: -1 }),
    ]);
    return {
      ...this.publicOrganization(organization),
      agreement: agreement ? this.publicAgreement(agreement) : null,
      pendingInvite: pendingInvite
        ? {
            email: pendingInvite.email,
            expiresAt: pendingInvite.expiresAt,
            createdAt: pendingInvite.get('createdAt'),
          }
        : null,
    };
  }

  private publicOrganization(organization: OrganizationDocument) {
    return {
      _id: organization._id,
      legalName: organization.legalName,
      displayName: organization.displayName,
      slug: organization.slug,
      country: organization.country,
      website: organization.website,
      logoUrl: organization.logoUrl,
      status: organization.status,
      primaryContactEmail: organization.primaryContactEmail,
      createdAt: organization.get('createdAt'),
      updatedAt: organization.get('updatedAt'),
    };
  }

  private publicAgreement(agreement: PublisherAgreementDocument) {
    return {
      termsVersion: agreement.termsVersion,
      termsText: COMPLIMENTARY_TERMS_TEXT,
      commercialModel: agreement.commercialModel,
      acceptedAt: agreement.acceptedAt,
      territory: agreement.territory,
      revenueShareBps: agreement.revenueShareBps,
      currency: agreement.currency,
    };
  }

  private publicUser(user: UserDocument) {
    return {
      _id: user._id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
    };
  }

  private checklist(termsAccepted: boolean, profileReady: boolean) {
    return {
      termsAccepted,
      profileReady,
      booksReady: false,
    };
  }

  private async uniqueSlug(source: string) {
    const base = toSlug(source) || `house-${randomUUID().slice(0, 8)}`;
    let slug = base;
    let suffix = 2;
    while (await this.organizationModel.exists({ slug })) {
      slug = `${base}-${suffix}`;
      suffix += 1;
      if (suffix > 50) {
        return `${base}-${randomUUID().slice(0, 8)}`;
      }
    }
    return slug;
  }

  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private inviteUrl(token: string) {
    const base = this.configService
      .get<string>('PUBLISHER_PORTAL_URL', 'http://localhost:3001')
      .replace(/\/$/, '');
    return `${base}/publisher/accept-invite?token=${token}`;
  }

  private isDuplicateKey(error: unknown) {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: number }).code === 11000
    );
  }
}
