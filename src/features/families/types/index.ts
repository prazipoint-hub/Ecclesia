import { z } from 'zod';

export const CreateFamilySchema = z.object({
  name: z.string().min(1, 'Family name required'),
  churchId: z.string().min(1).max(64),
  sectionId: z.string().min(1).max(64).optional(),
  headOfFamilyId: z.string().min(1).max(64).optional(),
});

export const AddFamilyMemberSchema = z.object({
  memberId: z.string().min(1).max(64),
  relationshipType: z.enum(['SPOUSE', 'CHILD', 'PARENT', 'SIBLING', 'OTHER']),
});

export const FamilyResponseSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string(),
  churchId: z.string().min(1).max(64),
  sectionId: z.string().min(1).max(64).nullable(),
  headOfFamilyId: z.string().min(1).max(64).nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type CreateFamilyInput = z.infer<typeof CreateFamilySchema>;
export type AddFamilyMemberInput = z.infer<typeof AddFamilyMemberSchema>;
export type FamilyResponse = z.infer<typeof FamilyResponseSchema>;
