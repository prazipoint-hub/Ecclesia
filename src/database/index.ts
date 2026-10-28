import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  // allow attaching to globalThis to avoid multiple clients in dev
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

export const prisma = globalThis.__prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== 'production') globalThis.__prisma = prisma;

export default prisma;
