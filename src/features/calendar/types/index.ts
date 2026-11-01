import { z } from 'zod';

export const CreateFeedSchema = z.object({ label: z.string().trim().min(1).max(60).optional() }).strict();
