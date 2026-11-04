import { prisma } from '@/database';
import { logger } from '@/config/logger';
import { emailService } from '@/services/email';
import { verifyEmailEmail } from '@/services/email/templates';
import { generateToken } from '@/features/auth/crypto';

const VERIFICATION_TTL_MS = 48 * 60 * 60 * 1000;

export async function sendVerificationEmail(userId: string, email: string): Promise<void> {
  const { raw, hash } = generateToken();
  await prisma.emailVerification.deleteMany({ where: { userId, verifiedAt: null } });
  await prisma.emailVerification.create({
    data: { userId, tokenHash: hash, expiresAt: new Date(Date.now() + VERIFICATION_TTL_MS) },
  });
  try {
    await emailService.send(verifyEmailEmail(email, raw));
  } catch (error) {
    logger.error({ err: error, userId }, 'Failed to send verification email');
  }
}
