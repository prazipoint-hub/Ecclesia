import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { adminRepository as repository } from '../repository';

/**
 * Every setting that exists is declared here with its limits and default. Unknown keys are rejected,
 * and each one is read by running code, which is named in `usedBy`.
 */
export const SETTINGS = {
  'events.checkInOpensHoursBefore': { schema: z.number().int().min(0).max(24), default: 2, category: 'EVENTS', description: 'How many hours before an event starts that check-in opens.', usedBy: 'Event check-in and door QR codes' },
  'events.checkInClosesHoursAfter': { schema: z.number().int().min(0).max(24), default: 2, category: 'EVENTS', description: 'How many hours after an event ends that check-in closes.', usedBy: 'Event check-in and door QR codes' },
  'events.absenceThreshold': { schema: z.number().int().min(2).max(12), default: 3, category: 'EVENTS', description: 'Consecutive missed events before a member is flagged for follow-up.', usedBy: 'Absence follow-up detection' },
  'pastoral.unvisitedAfterDays': { schema: z.number().int().min(30).max(730), default: 180, category: 'PASTORAL', description: 'Days without a pastoral visit before a member counts as unvisited.', usedBy: 'Pastoral dashboard' },
} as const;

export type SettingKey = keyof typeof SETTINGS;
export const isSettingKey = (key: string): key is SettingKey => Object.prototype.hasOwnProperty.call(SETTINGS, key);

export class SettingsReader {
  /** Reads one setting, falling back to its default if it was never changed or the stored value no longer fits the rules. */
  async get<K extends SettingKey>(churchId: string, key: K): Promise<z.infer<(typeof SETTINGS)[K]['schema']>> {
    const row = await repository.findSetting(churchId, key);
    if (row) {
      const parsed = SETTINGS[key].schema.safeParse(row.value);
      if (parsed.success) return parsed.data;
    }
    return SETTINGS[key].default;
  }

  async all(churchId: string) {
    const rows = new Map((await repository.listSettings(churchId)).map((r) => [r.key, r]));
    return (Object.keys(SETTINGS) as SettingKey[]).map((key) => {
      const def = SETTINGS[key];
      const stored = rows.get(key);
      const parsed = stored ? def.schema.safeParse(stored.value) : null;
      return {
        key, category: def.category, description: def.description, usedBy: def.usedBy, default: def.default,
        value: parsed?.success ? parsed.data : def.default, isDefault: !parsed?.success, updatedAt: stored?.updatedAt ?? null, updatedBy: stored?.updatedBy ?? null,
      };
    });
  }
}

export const settingsReader = new SettingsReader();
export type JsonValue = Prisma.InputJsonValue;
