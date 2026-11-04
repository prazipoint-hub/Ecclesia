import { z } from 'zod';

export const organizationUnitSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1, 'Name is required').max(255),
  displayName: z.string().min(1, 'Display name is required').max(255),
  type: z.enum(['CONFERENCE', 'DISTRICT', 'CIRCUIT']),
  parentId: z.string().uuid().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']),
});

export const committeeSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1, 'Committee name is required').max(255),
  scopeId: z.string().uuid('Invalid scope'),
  parentCommitteeId: z.string().uuid().optional(),
});

export const programSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1, 'Program name is required').max(255),
  ownerCommitteeId: z.string().uuid('Invalid committee'),
  scopeId: z.string().uuid('Invalid scope'),
  status: z.enum(['PLANNED', 'ACTIVE', 'COMPLETED']),
});

export type OrganizationUnitInput = z.infer<typeof organizationUnitSchema>;
export type CommitteeInput = z.infer<typeof committeeSchema>;
export type ProgramInput = z.infer<typeof programSchema>;
