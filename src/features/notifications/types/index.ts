import { z } from 'zod';
import { CATEGORIES, CHANNELS } from '@/services/notifications';

const ids = z.array(z.string().min(1)).min(1).max(50);

export const AudienceSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('ALL') }).strict(),
  z.object({ type: z.literal('SECTIONS'), ids }).strict(),
  z.object({ type: z.literal('ORGANIZATIONS'), ids }).strict(),
]);

const BROADCAST_CHANNELS = ['IN_APP', 'EMAIL', 'SMS'] as const;

export const BroadcastSchema = z
  .object({
    title: z.string().trim().min(1).max(150),
    body: z.string().trim().min(1).max(5000),
    category: z.enum(CATEGORIES).default('ANNOUNCEMENTS'),
    audience: AudienceSchema,
    channels: z.array(z.enum(BROADCAST_CHANNELS)).min(1).max(3),
  })
  .strict();

export const UpdateBroadcastSchema = BroadcastSchema.partial().strict().refine((v) => Object.keys(v).length > 0, 'Nothing to update');

export const AudiencePreviewSchema = z.object({ audience: AudienceSchema }).strict();

export const ScheduleSchema = z
  .object({ scheduledAt: z.coerce.date().refine((d) => d.getTime() > Date.now() + 60_000, 'Choose a time at least a minute from now') })
  .strict();

export const TemplateSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    subject: z.string().trim().min(1).max(150),
    body: z.string().trim().min(1).max(5000),
  })
  .strict();

export const UpdateTemplateSchema = TemplateSchema.partial().strict().refine((v) => Object.keys(v).length > 0, 'Nothing to update');

export const UpdatePreferencesSchema = z
  .object({
    preferences: z
      .array(z.object({ category: z.enum(CATEGORIES), channel: z.enum(CHANNELS), enabled: z.boolean() }).strict())
      .min(1)
      .max(CATEGORIES.length * CHANNELS.length),
  })
  .strict();

export const PushSubscriptionSchema = z
  .object({
    endpoint: z.string().url().max(500).refine((u) => u.startsWith('https://'), 'Push endpoint must be https'),
    keys: z.object({ p256dh: z.string().min(1).max(255), auth: z.string().min(1).max(255) }).strict(),
  })
  .strict();

export const RemovePushSchema = z.object({ endpoint: z.string().url().max(500) }).strict();

export const ListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['DRAFT', 'SCHEDULED', 'SENDING', 'SENT', 'FAILED', 'CANCELLED']).optional(),
});

export type Audience = z.infer<typeof AudienceSchema>;
export type BroadcastInput = z.infer<typeof BroadcastSchema>;
export type UpdateBroadcastInput = z.infer<typeof UpdateBroadcastSchema>;
export type TemplateInput = z.infer<typeof TemplateSchema>;
export type UpdateTemplateInput = z.infer<typeof UpdateTemplateSchema>;
export type ListQuery = z.infer<typeof ListQuerySchema>;
