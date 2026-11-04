import { logger } from '@/config/logger';
import type { AuthorizedUser } from '@/types';
import { ValidationError } from '@/types/errors';
import { adminRepository as repository } from '../repository';
import { RETENTION_ENTITIES, type RetentionEntity, type RunRetentionInput, type SetRetentionRuleInput } from '../types';
import { audit, require } from './common';

const DAY = 24 * 60 * 60 * 1000;

export class RetentionService {
  async list(user: AuthorizedUser) {
    require(user, 'admin:retention:manage');
    const rules = new Map((await repository.listRetentionRules(user.churchId)).map((r) => [r.entityType, r]));
    return (Object.keys(RETENTION_ENTITIES) as RetentionEntity[]).map((entityType) => ({
      entityType, ...RETENTION_ENTITIES[entityType], rule: rules.get(entityType) ?? null,
    }));
  }

  async set(user: AuthorizedUser, input: SetRetentionRuleInput) {
    require(user, 'admin:retention:manage');
    const min = RETENTION_ENTITIES[input.entityType].minDays;
    if (input.retentionDays < min) throw new ValidationError(`${RETENTION_ENTITIES[input.entityType].label} must be kept for at least ${min} day(s)`);
    const rule = await repository.upsertRetentionRule(user.churchId, input.entityType, input.retentionDays, input.isActive, user.memberId ?? user.id);
    await audit(user, 'RETENTION_RULE_SET', 'RETENTION_RULE', input.entityType, { retentionDays: input.retentionDays, isActive: input.isActive });
    return rule;
  }

  async remove(user: AuthorizedUser, entityType: string) {
    require(user, 'admin:retention:manage');
    await repository.deleteRetentionRule(user.churchId, entityType);
    await audit(user, 'RETENTION_RULE_REMOVED', 'RETENTION_RULE', entityType);
    return { deleted: true };
  }

  /** Counts what each active rule would remove; only deletes when told so explicitly. */
  async run(user: AuthorizedUser, input: RunRetentionInput, now = new Date()) {
    require(user, 'admin:retention:manage');
    const rules = (await repository.listRetentionRules(user.churchId)).filter(
      (r) => r.isActive && (!input.entityTypes || input.entityTypes.includes(r.entityType as RetentionEntity))
    );
    const results = [];
    for (const rule of rules) {
      const entry = RETENTION_ENTITIES[rule.entityType as RetentionEntity];
      // The floor is enforced again here, so a rule written straight into the database cannot go below it.
      const days = Math.max(rule.retentionDays, entry?.minDays ?? Number.MAX_SAFE_INTEGER);
      if (!entry) continue;
      const cutoff = new Date(now.getTime() - days * DAY);
      const count = await repository.countOrDelete(rule.entityType, user.churchId, cutoff, input.dryRun);
      if (!input.dryRun) await repository.recordRetentionRun(user.churchId, rule.entityType, count, now);
      results.push({ entityType: rule.entityType, retentionDays: days, cutoff, [input.dryRun ? 'wouldRemove' : 'removed']: count });
    }
    if (!input.dryRun) {
      await audit(user, 'RETENTION_PURGE_RUN', 'RETENTION_RULE', user.churchId, { results });
      logger.info({ churchId: user.churchId, results }, 'Data retention purge completed');
    }
    return { dryRun: input.dryRun, results };
  }
}

export const retentionService = new RetentionService();
