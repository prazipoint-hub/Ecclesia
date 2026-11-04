import { z } from 'zod';

export const CreateMemberSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  middleName: z.string().optional(),
  lastName: z.string().min(1, 'Last name is required'),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER']),
  dateOfBirth: z.string().datetime().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  address: z.string().optional(),
  churchId: z.string().uuid(),
  sectionId: z.string().uuid().optional(),
  membershipStatus: z.enum(['ACTIVE', 'INACTIVE', 'TRANSFERRED', 'DECEASED']).default('ACTIVE'),
  membershipDate: z.string().datetime().optional(),
});

export const UpdateMemberSchema = CreateMemberSchema.partial();

export const MemberResponseSchema = z.object({
  id: z.string().uuid(),
  firstName: z.string(),
  middleName: z.string().nullable(),
  lastName: z.string(),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER']),
  dateOfBirth: z.string().datetime().nullable(),
  phone: z.string().nullable(),
  email: z.string().email().nullable(),
  address: z.string().nullable(),
  membershipNumber: z.string(),
  churchId: z.string().uuid(),
  sectionId: z.string().uuid().nullable(),
  membershipStatus: z.enum(['ACTIVE', 'INACTIVE', 'TRANSFERRED', 'DECEASED']),
  isDependent: z.boolean(),
  parentMemberId: z.string().uuid().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type CreateMemberInput = z.infer<typeof CreateMemberSchema>;
export type UpdateMemberInput = z.infer<typeof UpdateMemberSchema>;
export type MemberResponse = z.infer<typeof MemberResponseSchema>;
