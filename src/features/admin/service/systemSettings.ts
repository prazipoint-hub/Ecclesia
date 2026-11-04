import type { AuthorizedUser } from '@/types';
import { NotFoundError, ValidationError } from '@/types/errors';
import { adminRepository as repository } from '../repository';
import { audit, require } from './common';
import { isSettingKey, SETTINGS, settingsReader, type JsonValue } from './settings';

export class SystemSettingsService {
  list(user: AuthorizedUser) {
    require(user, 'admin:settings:manage');
    return settingsReader.all(user.churchId);
  }

  async set(user: AuthorizedUser, key: string, value: unknown) {
    require(user, 'admin:settings:manage');
    if (!isSettingKey(key)) throw new NotFoundError('Setting');
    const parsed = SETTINGS[key].schema.safeParse(value);
    if (!parsed.success) throw new ValidationError(`${key}: ${parsed.error.issues[0]?.message ?? 'invalid value'}`);
    const before = await settingsReader.get(user.churchId, key);
    await repository.upsertSetting(user.churchId, key, parsed.data as JsonValue, SETTINGS[key].category, user.memberId ?? user.id);
    await audit(user, 'SETTING_CHANGED', 'SETTING', key, { before, after: parsed.data });
    return (await settingsReader.all(user.churchId)).find((s) => s.key === key);
  }

  /** Removing the stored value returns the setting to its default. */
  async reset(user: AuthorizedUser, key: string) {
    require(user, 'admin:settings:manage');
    if (!isSettingKey(key)) throw new NotFoundError('Setting');
    const before = await settingsReader.get(user.churchId, key);
    await repository.deleteSetting(user.churchId, key);
    await audit(user, 'SETTING_RESET', 'SETTING', key, { before, after: SETTINGS[key].default });
    return (await settingsReader.all(user.churchId)).find((s) => s.key === key);
  }
}

export const systemSettingsService = new SystemSettingsService();
