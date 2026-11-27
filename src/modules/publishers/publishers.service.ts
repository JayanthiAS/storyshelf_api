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
import { BookStatus } from '../../common/enums/book-status.enum';
import { Role } from '../../common/enums/role.enum';
import { SubmissionStatus } from '../../common/enums/submission-status.enum';
import { toSlug } from '../../common/utils/helpers.util';
import {
  buildPaginatedResult,
  parsePagination,
} from '../../common/utils/pagination.util';
import { Book, BookDocument } from '../books/schemas/book.schema';
import { StorageService } from '../uploads/storage.service';
import { User, UserDocument } from '../users/schemas/user.schema';
import {
  AcceptPublisherInviteDto,
  CreatePublisherHouseDto,
  InviteStaffDto,
  PublisherListQueryDto,
  UpdatePublisherOrganizationDto,
  UpdateStaffRoleDto,
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
    @InjectModel(Book.name) private bookModel: Model<BookDocument>,
    private configService: ConfigService,
    private storageService: StorageService,
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
      orgRole: invite.orgRole,
      expiresAt: invite.expiresAt,
      termsVersion: COMPLIMENTARY_TERMS_VERSION,
      termsText: COMPLIMENTARY_TERMS_TEXT,
    };
  }

  async acceptInvite(dto: AcceptPublisherInviteDto): Promise<UserDocument> {
    const invite = await this.requirePendingInvite(dto.token);
    const organization = await this.requireHouse(invite.organizationId.toString());
    this.assertHouseCanAccept(organization);

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const existing = await this.userModel.findOne({ email: invite.email });
    if (existing && (existing.role !== Role.PUBLISHER || existing.deletedAt)) {
      throw new ConflictException(EMAIL_IN_USE);
    }

    let user = existing;
    let created = false;
    if (!user) {
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
        created = true;
      } catch (error) {
        if (this.isDuplicateKey(error)) {
          throw new ConflictException(EMAIL_IN_USE);
        }
        throw error;
      }
    } else {
      const activeElsewhere = await this.membershipModel.findOne({
        userId: user._id,
        status: MembershipStatus.ACTIVE,
        organizationId: { $ne: organization._id },
      });
      if (activeElsewhere) {
        throw new ConflictException(EMAIL_IN_USE);
      }
      user.passwordHash = passwordHash;
      user.firstName = invite.firstName;
      user.lastName = invite.lastName;
      user.isEmailVerified = true;
      user.isActive = true;
      await user.save();
    }

    try {
      const membership = await this.membershipModel.findOne({
        userId: user._id,
        organizationId: organization._id,
      });
      if (membership) {
        membership.orgRole = invite.orgRole;
        membership.status = MembershipStatus.ACTIVE;
        await membership.save();
      } else {
        await this.membershipModel.create({
          userId: user._id,
          organizationId: organization._id,
          orgRole: invite.orgRole,
          status: MembershipStatus.ACTIVE,
        });
      }
      if (invite.orgRole === OrgRole.OWNER) {
        await this.agreementModel.updateOne(
          {
            organizationId: organization._id,
            termsVersion: COMPLIMENTARY_TERMS_VERSION,
          },
          { acceptedBy: user._id, acceptedAt: new Date() },
        );
        organization.status = OrganizationStatus.ACTIVE;
        await organization.save();
      }
      invite.status = InviteStatus.ACCEPTED;
      invite.acceptedAt = new Date();
      await invite.save();
    } catch (error) {
      if (created) {
        await this.userModel.deleteOne({ _id: user._id });
        await this.membershipModel.deleteOne({ userId: user._id });
      }
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
    const houseBooks = { organizationId: organization._id, deletedAt: null };
    const [inReview, live, anyBook] = await Promise.all([
      this.bookModel.countDocuments({
        ...houseBooks,
        submissionStatus: SubmissionStatus.SUBMITTED,
      }),
      this.bookModel.countDocuments({
        ...houseBooks,
        status: BookStatus.PUBLISHED,
        takenDownAt: null,
      }),
      this.bookModel.exists(houseBooks),
    ]);
    return {
      user: this.publicUser(user),
      organization: this.publicOrganization(organization),
      membership: {
        orgRole: membership.orgRole,
        status: membership.status,
      },
      agreement: agreement ? this.publicAgreement(agreement) : null,
      checklist: this.checklist(
        !!agreement?.acceptedAt,
        !!organization.website,
        !!anyBook,
        inReview,
        live,
        !!organization.logoUrl,
      ),
    };
  }

  async activeMemberIds(organizationId: Types.ObjectId) {
    const members = await this.membershipModel
      .find({ organizationId, status: MembershipStatus.ACTIVE })
      .select('userId');
    return members.map((member) => member.userId.toString());
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

  async uploadLogo(userId: string, file: Express.Multer.File) {
    const context = await this.requireOwnerContext(userId);
    if (context.organization.status === OrganizationStatus.SUSPENDED) {
      throw new ForbiddenException({
        message: 'This house is suspended. Profile changes are paused.',
        code: 'ORG_SUSPENDED',
      });
    }
    if (!file) {
      throw new BadRequestException({
        message: 'Choose a logo image.',
        code: 'FILE_INVALID',
      });
    }
    this.storageService.assert(file, 'cover');
    const previous = this.logoKey(context.organization.logoUrl);
    const result = await this.storageService.upload(file, 'logos');
    context.organization.logoUrl = result.url;
    await context.organization.save();
    if (previous && previous !== result.key) {
      await this.storageService.delete(previous);
    }
    return this.getSession(userId);
  }

  async listStaff(userId: string) {
    const { organization } = await this.requireStaff(userId, false);
    const members = await this.membershipModel
      .find({
        organizationId: organization._id,
        status: MembershipStatus.ACTIVE,
      })
      .sort({ createdAt: 1 });
    const users = await this.userModel.find({
      _id: { $in: members.map((member) => member.userId) },
    });
    const usersById = new Map(users.map((user) => [user._id.toString(), user]));
    const invites = await this.inviteModel
      .find({
        organizationId: organization._id,
        status: InviteStatus.PENDING,
        expiresAt: { $gt: new Date() },
        orgRole: { $in: [OrgRole.EDITOR, OrgRole.VIEWER] },
      })
      .sort({ createdAt: -1 });

    return {
      members: members.map((member) => {
        const user = usersById.get(member.userId.toString());
        return {
          _id: member._id,
          email: user?.email ?? '',
          firstName: user?.firstName ?? '',
          lastName: user?.lastName ?? '',
          orgRole: member.orgRole,
          status: member.status,
        };
      }),
      invites: invites.map((invite) => ({
        _id: invite._id,
        email: invite.email,
        firstName: invite.firstName,
        lastName: invite.lastName,
        orgRole: invite.orgRole,
        expiresAt: invite.expiresAt,
      })),
    };
  }

  async inviteStaff(userId: string, dto: InviteStaffDto) {
    const { organization, membership } = await this.requireStaff(userId, true, true);
    const agreement = await this.agreementModel.findOne({
      organizationId: organization._id,
      termsVersion: COMPLIMENTARY_TERMS_VERSION,
    });
    if (!agreement?.acceptedAt) {
      throw new BadRequestException(
        'The house owner must accept the terms before inviting staff.',
      );
    }
    const email = dto.email.trim().toLowerCase();
    await this.assertStaffEmail(email, organization._id);
    const invite = await this.issueInvite({
      organizationId: organization._id,
      email,
      firstName: dto.firstName.trim(),
      lastName: dto.lastName.trim(),
      orgRole: dto.orgRole,
      invitedBy: membership.userId,
    });
    return {
      inviteUrl: invite.inviteUrl,
      expiresAt: invite.expiresAt,
      email,
      orgRole: dto.orgRole,
    };
  }

  async updateStaffRole(userId: string, membershipId: string, dto: UpdateStaffRoleDto) {
    const { organization } = await this.requireStaff(userId, true, true);
    const membership = await this.requireOrgMembership(membershipId, organization._id);
    if (membership.orgRole === OrgRole.OWNER) {
      throw new BadRequestException('The owner role cannot be changed from the team page.');
    }
    membership.orgRole = dto.orgRole;
    await membership.save();
    return { _id: membership._id, orgRole: membership.orgRole };
  }

  async removeStaff(userId: string, membershipId: string) {
    const { organization } = await this.requireStaff(userId, true, true);
    const membership = await this.requireOrgMembership(membershipId, organization._id);
    if (membership.orgRole === OrgRole.OWNER) {
      const owners = await this.membershipModel.countDocuments({
        organizationId: organization._id,
        orgRole: OrgRole.OWNER,
        status: MembershipStatus.ACTIVE,
      });
      if (owners <= 1) {
        throw new BadRequestException('The last owner cannot be removed.');
      }
    }
    membership.status = MembershipStatus.REVOKED;
    await membership.save();
    return { removed: true };
  }

  async resendStaffInvite(userId: string, inviteId: string) {
    const { organization, membership } = await this.requireStaff(userId, true, true);
    const invite = await this.requireStaffInvite(inviteId, organization._id);
    await this.assertStaffEmail(invite.email, organization._id, invite._id.toString());
    invite.status = InviteStatus.REVOKED;
    await invite.save();
    const next = await this.issueInvite({
      organizationId: organization._id,
      email: invite.email,
      firstName: invite.firstName,
      lastName: invite.lastName,
      orgRole: invite.orgRole,
      invitedBy: membership.userId,
    });
    return {
      inviteUrl: next.inviteUrl,
      expiresAt: next.expiresAt,
      email: invite.email,
    };
  }

  async revokeStaffInvite(userId: string, inviteId: string) {
    const { organization } = await this.requireStaff(userId, true, true);
    const invite = await this.requireStaffInvite(inviteId, organization._id);
    invite.status = InviteStatus.REVOKED;
    await invite.save();
    return { revoked: true };
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

  private async assertStaffEmail(
    email: string,
    organizationId: Types.ObjectId,
    ignoreInviteId?: string,
  ) {
    const pending = await this.inviteModel.findOne({
      email,
      status: InviteStatus.PENDING,
      expiresAt: { $gt: new Date() },
      ...(ignoreInviteId ? { _id: { $ne: ignoreInviteId } } : {}),
    });
    if (pending) {
      throw new ConflictException({
        message: 'An invite is already pending for this email.',
        code: 'EMAIL_IN_USE',
      });
    }
    const existing = await this.userModel.findOne({ email });
    if (!existing) return;
    if (existing.role !== Role.PUBLISHER || existing.deletedAt) {
      throw new ConflictException(EMAIL_IN_USE);
    }
    const memberships = await this.membershipModel.find({ userId: existing._id });
    const here = memberships.find(
      (membership) => membership.organizationId.toString() === organizationId.toString(),
    );
    if (here?.status === MembershipStatus.ACTIVE) {
      throw new ConflictException({
        message: 'This person is already on the team.',
        code: 'EMAIL_IN_USE',
      });
    }
    const elsewhere = memberships.some(
      (membership) =>
        membership.status === MembershipStatus.ACTIVE &&
        membership.organizationId.toString() !== organizationId.toString(),
    );
    if (elsewhere) {
      throw new ConflictException(EMAIL_IN_USE);
    }
  }

  private async requireOrgMembership(membershipId: string, organizationId: Types.ObjectId) {
    if (!Types.ObjectId.isValid(membershipId)) {
      throw new NotFoundException('Team member not found');
    }
    const membership = await this.membershipModel.findOne({
      _id: membershipId,
      organizationId,
      status: MembershipStatus.ACTIVE,
    });
    if (!membership) throw new NotFoundException('Team member not found');
    return membership;
  }

  private async requireStaffInvite(inviteId: string, organizationId: Types.ObjectId) {
    if (!Types.ObjectId.isValid(inviteId)) {
      throw new NotFoundException('Invite not found');
    }
    const invite = await this.inviteModel.findOne({
      _id: inviteId,
      organizationId,
      status: InviteStatus.PENDING,
      orgRole: { $in: [OrgRole.EDITOR, OrgRole.VIEWER] },
    });
    if (!invite) throw new NotFoundException('Invite not found');
    return invite;
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

  private checklist(
    termsAccepted: boolean,
    profileReady: boolean,
    booksReady = false,
    inReview = 0,
    live = 0,
    logoReady = false,
  ) {
    return {
      termsAccepted,
      profileReady,
      booksReady,
      inReview,
      live,
      logoReady,
    };
  }

  private logoKey(url: string | null) {
    if (!url?.startsWith('/uploads/')) return null;
    const key = url.slice('/uploads/'.length);
    return key.startsWith('logos/') ? key : null;
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
