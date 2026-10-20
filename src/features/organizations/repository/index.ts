import { prisma } from '@/database';
import { Organization, OrganizationMembership, Prisma } from '@prisma/client';
import { AuthorizedUser } from '@/types';

export class OrganizationRepository {
  /**
   * Find organization by ID
   */
  async findById(id: string, user: AuthorizedUser): Promise<Organization | null> {
    const org = await prisma.organization.findUnique({
      where: { id },
    });

    if (!org) return null;

    // Authorization: user must be from same church
    if (org.churchId !== user.churchId && !user.permissions.includes('organization:view:all_churches')) {
      return null;
    }

    return org;
  }

  /**
   * List organizations by church
   */
  async listByChurch(
    churchId: string,
    user: AuthorizedUser,
    options?: { skip?: number; take?: number }
  ): Promise<{ organizations: Organization[]; total: number }> {
    if (churchId !== user.churchId && !user.permissions.includes('organization:view:all_churches')) {
      return { organizations: [], total: 0 };
    }

    const [organizations, total] = await Promise.all([
      prisma.organization.findMany({
        where: { churchId },
        skip: options?.skip,
        take: options?.take,
        orderBy: { name: 'asc' },
      }),
      prisma.organization.count({ where: { churchId } }),
    ]);

    return { organizations, total };
  }

  /**
   * Create organization
   */
  async create(data: Prisma.OrganizationCreateInput): Promise<Organization> {
    return prisma.organization.create({ data });
  }

  /**
   * Get organizations for member
   */
  async getMemberOrganizations(memberId: string): Promise<any[]> {
    return prisma.organizationMembership.findMany({
      where: { memberId },
      include: {
        organization: true,
      },
    });
  }

  /**
   * Create organization membership
   */
  async createMembership(
    data: Prisma.OrganizationMembershipCreateInput
  ): Promise<OrganizationMembership> {
    return prisma.organizationMembership.create({ data });
  }

  /**
   * Get organization members
   */
  async getOrganizationMembers(
    organizationId: string,
    options?: { skip?: number; take?: number; status?: string }
  ) {
    const where: Prisma.OrganizationMembershipWhereInput = {
      organizationId,
    };

    if (options?.status) {
      where.membershipStatus = options.status;
    }

    const [memberships, total] = await Promise.all([
      prisma.organizationMembership.findMany({
        where,
        include: { member: true },
        skip: options?.skip,
        take: options?.take,
        orderBy: { joinedAt: 'desc' },
      }),
      prisma.organizationMembership.count({ where }),
    ]);

    return { memberships, total };
  }

  /**
   * Get organization leadership
   */
  async getOrganizationLeadership(organizationId: string) {
    return prisma.organizationRoleAssignment.findMany({
      where: {
        organizationId,
        endDate: null,
      },
      include: { member: true },
      orderBy: { position: 'asc' },
    });
  }

  /**
   * Assign organization role
   */
  async assignRole(data: Prisma.OrganizationRoleAssignmentCreateInput) {
    // End any existing assignment with this position
    await prisma.organizationRoleAssignment.updateMany({
      where: {
        organizationId: data.organizationId as string,
        position: data.position as string,
        endDate: null,
      },
      data: {
        endDate: new Date(),
      },
    });

    return prisma.organizationRoleAssignment.create({ data });
  }

  /**
   * Count organization members
   */
  async countMembers(organizationId: string, status?: string): Promise<number> {
    return prisma.organizationMembership.count({
      where: {
        organizationId,
        membershipStatus: status,
      },
    });
  }

  /**
   * Get member organizations with roles
   */
  async getMemberOrganizationsWithRoles(memberId: string) {
    const memberships = await prisma.organizationMembership.findMany({
      where: { memberId },
      include: {
        organization: true,
        roles: {
          where: { endDate: null },
        },
      },
    });

    return memberships;
  }
}

export const organizationRepository = new OrganizationRepository();
