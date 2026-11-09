import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { logger } from '@/config/logger';
import { jwtSecret } from '@/config/secrets';
import { prisma } from '@/database';
import type { AuthorizedUser } from '@/types';
import { ConflictError, ForbiddenError, NotFoundError } from '@/types/errors';
import { activeGrants, permissionsAt, scopeChain, SCOPE_TYPES } from './scope';

/**
 * "View dashboard as": a short-lived, READ-ONLY token for a role in the administrator's own church.
 *  - It is the administrator's own session with fewer rights; nobody is impersonated and no other session is touched.
 *  - Permissions = the role's permissions that only read (':view', ':view:all', ':report'), intersected with what the
 *    administrator could preview. The member link is dropped so no personal self-service data of the admin or target shows.
 *  - The server (authenticate) rejects every non-read request made with it, so the browser cannot be trusted to hide buttons.
 */
export const PREVIEW_TTL_SECONDS = 15 * 60;
export const PreviewSchema = z.object({ roleId: z.string().trim().min(1).max(64) }).strict();
export const ContextSchema = z.object({ type: z.enum(SCOPE_TYPES), id: z.string().trim().min(1).max(64) }).strict();
export const isReadPermission = (p: string) => /:(view|view:all|report|read)$/.test(p);

export class PreviewService {
  async start(user: AuthorizedUser & { preview?: unknown }, sessionId: string | undefined, raw: unknown) {
    if (!user.permissions.includes('access:preview')) throw new ForbiddenError('Forbidden: access:preview permission required');
    if (user.preview) throw new ConflictError('Exit the current preview before starting another');
    const { roleId } = PreviewSchema.parse(raw);
    const role = await prisma.role.findUnique({ where: { id: roleId }, include: { permissions: { include: { permission: true } } } });
    if (!role || role.churchId !== user.churchId) throw new NotFoundError('Role');
    const session = sessionId ? await prisma.session.findUnique({ where: { id: sessionId } }) : null;
    if (!session || session.userId !== user.id) throw new ForbiddenError('Forbidden: no active session');
    const permissions = role.permissions.map((rp) => rp.permission.name).filter(isReadPermission);
    const token = jwt.sign(
      { sub: user.id, email: user.email, churchId: user.churchId, memberId: null, permissions, sessionId: session.id, tokenId: session.token, preview: { roleId: role.id, roleName: role.name } },
      jwtSecret,
      { expiresIn: PREVIEW_TTL_SECONDS }
    );
    await this.audit(user, 'PREVIEW_STARTED', role.id, { role: role.name, permissionCount: permissions.length });
    return { token, expiresInSeconds: PREVIEW_TTL_SECONDS, banner: `Previewing as ${role.name}. Read-only.`, role: { id: role.id, name: role.name }, permissions };
  }

  async exit(user: AuthorizedUser & { preview?: { roleId: string; roleName: string } }) {
    await this.audit(user, 'PREVIEW_ENDED', user.preview?.roleId ?? 'none', {});
    return { ended: true };
  }

  /**
   * Lets the browser re-check a remembered context. Returns the permissions held there NOW (scoped grants only), or 403.
   * A stale selection therefore can never be trusted: the answer comes from the database each time.
   */
  async verifyContext(user: AuthorizedUser, raw: unknown) {
    const scope = ContextSchema.parse(raw);
    const chain = await scopeChain(scope);
    if (!chain) throw new NotFoundError('Context');
    const permissions = [...permissionsAt(await activeGrants(user.id), chain)].sort();
    const ownChurch = scope.type === 'CHURCH' && scope.id === user.churchId;
    if (!permissions.length && !ownChurch) throw new ForbiddenError('Forbidden: you no longer hold a role in this context');
    return { scope, permissions: ownChurch ? [...new Set([...permissions, ...user.permissions])].sort() : permissions };
  }

  private async audit(user: AuthorizedUser, action: string, entityId: string, details: Record<string, unknown>) {
    try {
      await prisma.auditLog.create({ data: { churchId: user.churchId, action, entityType: 'ACCESS', entityId, actorId: user.memberId ?? user.id, changes: JSON.stringify(details) } });
    } catch (error) { logger.error({ err: error, action }, 'Failed to write preview audit log'); }
  }
}

export const previewService = new PreviewService();
