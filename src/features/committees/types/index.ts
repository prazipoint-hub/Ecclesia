import { z } from 'zod';

export const CreateCommitteeSchema = z.object({
  name: z.string().trim().min(3).max(120),
  description: z.string().trim().max(2000).optional(),
});
export const UpdateCommitteeSchema = CreateCommitteeSchema.partial();
export type CreateCommitteeDTO = z.infer<typeof CreateCommitteeSchema>;
export type UpdateCommitteeDTO = z.infer<typeof UpdateCommitteeSchema>;
