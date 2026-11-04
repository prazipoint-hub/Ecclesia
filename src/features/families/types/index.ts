import { z } from 'zod';

export const CreateFamilySchema = z.object({
  name: z.string().min(1, 'Family name required'),
  churchId: z.string().uuid(),
  sectionId: z.string().uuid().optional(),
  headOfFamilyId: z.string().uuid().optional(),
});

export const AddFamilyMemberSchema = z.object({
  memberId: z.string().uuid(),
  relationshipType: z.enum(['SPOUSE', 'CHILD', 'PARENT', 'SIBLING', 'OTHER']),
});

export const FamilyResponseSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  churchId: z.string().uuid(),
  sectionId: z.string().uuid().nullable(),
  headOfFamilyId: z.string().uuid().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type CreateFamilyInput = z.infer<typeof CreateFamilySchema>;
export type AddFamilyMemberInput = z.infer<typeof AddFamilyMemberSchema>;
export type FamilyResponse = z.infer<typeof FamilyResponseSchema>;
