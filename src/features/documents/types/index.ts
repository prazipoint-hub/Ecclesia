import { z } from 'zod';

const id = z.string().min(1);
const page = { skip: z.coerce.number().int().min(0).max(100_000).default(0), take: z.coerce.number().int().min(1).max(100).default(25) };
const TYPES = ['CERTIFICATE', 'LETTER', 'MINUTES'] as const;

export const CreateTemplateSchema = z
  .object({ type: z.enum(TYPES), name: z.string().trim().min(2).max(100), title: z.string().trim().min(2).max(200), body: z.string().trim().min(5).max(20_000) })
  .strict();
export const UpdateTemplateSchema = z
  .object({ name: z.string().trim().min(2).max(100).optional(), title: z.string().trim().min(2).max(200).optional(), body: z.string().trim().min(5).max(20_000).optional(), isActive: z.boolean().optional() })
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');

const fieldKey = z.string().regex(/^[A-Za-z][A-Za-z0-9]{0,29}$/);
export const GenerateDocumentSchema = z
  .object({ templateId: id, memberId: id.optional(), fields: z.record(fieldKey, z.string().trim().max(500)).default({}) })
  .strict()
  .refine((v) => Object.keys(v.fields).length <= 20, 'At most 20 fields');
export const VoidDocumentSchema = z.object({ reason: z.string().trim().min(5).max(300) }).strict();
export const DocumentListQuerySchema = z.object({ type: z.enum(TYPES).optional(), memberId: id.optional(), ...page });

export type CreateTemplateInput = z.infer<typeof CreateTemplateSchema>;
export type UpdateTemplateInput = z.infer<typeof UpdateTemplateSchema>;
export type GenerateDocumentInput = z.infer<typeof GenerateDocumentSchema>;
