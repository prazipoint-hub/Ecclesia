import { z } from 'zod';

/**
 * Organizations & Fellowships Types
 *
 * CRITICAL PRINCIPLE:
 * One member record → Multiple organizational memberships
 * Organizations are workspaces within Ecclesia, not separate systems
 */

export const OrganizationTypeEnum = z.enum(['MUMC', 'RRW', 'UMYF', 'CHILDREN_MINISTRIES']);

export const CreateOrganizationSchema = z.object({
  churchId: z.string().uuid(),
  organizationType: OrganizationTypeEnum,
  name: z.string().min(1),
  shortName: z.string().min(1).max(20),
  description: z.string().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
});

export const CreateOrganizationMembershipSchema = z.object({
  organizationId: z.string().uuid(),
  memberId: z.string().uuid(),
  membershipStatus: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED', 'LEFT']).default('ACTIVE'),
  notes: z.string().optional(),
});

export const AssignOrganizationRoleSchema = z.object({
  organizationId: z.string().uuid(),
  memberId: z.string().uuid(),
  position: z.string().min(1), // e.g., "President", "Treasurer", "Secretary"
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

export const OrganizationResponseSchema = z.object({
  id: z.string().uuid(),
  churchId: z.string().uuid(),
  organizationType: OrganizationTypeEnum,
  name: z.string(),
  shortName: z.string(),
  description: z.string().nullable(),
  status: z.enum(['ACTIVE', 'INACTIVE']),
  memberCount: z.number().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const OrganizationMembershipResponseSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  memberId: z.string().uuid(),
  membershipStatus: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED', 'LEFT']),
  joinedAt: z.string().datetime(),
  endedAt: z.string().datetime().nullable(),
  notes: z.string().nullable(),
});

export const OrganizationRoleAssignmentResponseSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  memberId: z.string().uuid(),
  position: z.string(),
  startDate: z.string().datetime(),
  endDate: z.string().datetime().nullable(),
  status: z.enum(['ACTIVE', 'INACTIVE']),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type CreateOrganizationInput = z.infer<typeof CreateOrganizationSchema>;
export type CreateOrganizationMembershipInput = z.infer<typeof CreateOrganizationMembershipSchema>;
export type AssignOrganizationRoleInput = z.infer<typeof AssignOrganizationRoleSchema>;
export type OrganizationResponse = z.infer<typeof OrganizationResponseSchema>;
export type OrganizationMembershipResponse = z.infer<typeof OrganizationMembershipResponseSchema>;
export type OrganizationRoleAssignmentResponse = z.infer<typeof OrganizationRoleAssignmentResponseSchema>;
