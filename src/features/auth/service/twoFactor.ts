import bcrypt from 'bcryptjs';
import { prisma } from '@/database';
import { ConflictError, NotFoundError, UnauthorizedError, ValidationError } from '@/types/errors';
import {
  decryptSecret,
  encryptSecret,
  generateBackupCodes,
  generateTotpSecret,
  hashToken,
  otpauthUrl,
  verifyTotp,
} from '@/features/auth/crypto';
import { auditAuthEvent } from '@/features/auth/service/audit';

type StoredSecret = { secretEncrypted: string; backupCodeHashes: string | null };

export async function acceptTwoFactorCode(userId: string, secret: StoredSecret, code: string): Promise<boolean> {
  if (verifyTotp(decryptSecret(secret.secretEncrypted), code.trim())) return true;

  const hashes: string[] = secret.backupCodeHashes ? JSON.parse(secret.backupCodeHashes) : [];
  const codeHash = hashToken(code.trim().toLowerCase());
  if (!hashes.includes(codeHash)) return false;
  await prisma.twoFactorSecret.update({
    where: { userId },
    data: { backupCodeHashes: JSON.stringify(hashes.filter((hash) => hash !== codeHash)) },
  });
  return true;
}

export async function getTwoFactorStatus(userId: string): Promise<{ enabled: boolean }> {
  const record = await prisma.twoFactorSecret.findUnique({ where: { userId } });
  return { enabled: Boolean(record?.isEnabled) };
}

export async function setupTwoFactor(userId: string, email: string): Promise<{ secret: string; otpauthUrl: string }> {
  const existing = await prisma.twoFactorSecret.findUnique({ where: { userId } });
  if (existing?.isEnabled) throw new ConflictError('Two-factor authentication is already enabled');

  const secret = generateTotpSecret();
  await prisma.twoFactorSecret.upsert({
    where: { userId },
    create: { userId, secretEncrypted: encryptSecret(secret) },
    update: { secretEncrypted: encryptSecret(secret), backupCodeHashes: null },
  });
  return { secret, otpauthUrl: otpauthUrl(email, secret) };
}

export async function verifyAndEnableTwoFactor(
  userId: string,
  churchId: string | null,
  code: string
): Promise<{ backupCodes: string[] }> {
  const record = await prisma.twoFactorSecret.findUnique({ where: { userId } });
  if (!record) throw new ValidationError('Start two-factor setup before verifying a code');
  if (record.isEnabled) throw new ConflictError('Two-factor authentication is already enabled');
  if (!verifyTotp(decryptSecret(record.secretEncrypted), code.trim())) {
    throw new ValidationError('Invalid two-factor code');
  }

  const { codes, hashes } = generateBackupCodes();
  await prisma.twoFactorSecret.update({
    where: { userId },
    data: { isEnabled: true, backupCodeHashes: JSON.stringify(hashes) },
  });
  await auditAuthEvent({ churchId, action: 'TWO_FACTOR_ENABLED', entityType: 'USER', entityId: userId, actorId: userId });
  return { backupCodes: codes };
}

export async function disableTwoFactor(
  userId: string,
  churchId: string | null,
  password: string,
  code: string
): Promise<void> {
  const [user, record] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.twoFactorSecret.findUnique({ where: { userId } }),
  ]);
  if (!user) throw new NotFoundError('User');
  if (!record?.isEnabled) throw new ValidationError('Two-factor authentication is not enabled');
  if (!(await bcrypt.compare(password, user.passwordHash))) throw new UnauthorizedError('Unauthorized: incorrect password');
  if (!(await acceptTwoFactorCode(userId, record, code))) throw new UnauthorizedError('Unauthorized: invalid two-factor code');

  await prisma.twoFactorSecret.delete({ where: { userId } });
  await auditAuthEvent({ churchId, action: 'TWO_FACTOR_DISABLED', entityType: 'USER', entityId: userId, actorId: userId });
}
