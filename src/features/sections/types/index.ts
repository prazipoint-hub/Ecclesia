import { z } from 'zod';

export const CreateSectionSchema = z.object({
  name: z.string().min(1, 'Section name required'),
  churchId: z.string().min(1).max(64),
  code: z.string().min(1).max(10).optional(),
});

export const UpdateSectionSchema = CreateSectionSchema.partial();

export const AssignSectionLeadershipSchema = z.object({
  sectionId: z.string().min(1).max(64),
  memberId: z.string().min(1).max(64),
  position: z.enum(['LEADER', 'VICE_LEADER', 'SECRETARY', 'TREASURER']),
  effectiveDate: z.string().datetime().optional(),
});

export const SectionResponseSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string(),
  churchId: z.string().min(1).max(64),
  code: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type CreateSectionInput = z.infer<typeof CreateSectionSchema>;
export type UpdateSectionInput = z.infer<typeof UpdateSectionSchema>;
export type AssignSectionLeadershipInput = z.infer<typeof AssignSectionLeadershipSchema>;
export type SectionResponse = z.infer<typeof SectionResponseSchema>;
