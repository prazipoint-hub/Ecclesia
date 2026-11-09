import { Prisma } from '@prisma/client';
import { prisma } from '@/database';

/**
 * Circuit, district and section receipts have a GLOBALLY unique receiptNumber, but the old generator used a per-owner
 * count + 1, so two owners' first receipts (or two concurrent requests) collided. Numbers now come from an atomic
 * counter per prefix and year, stored in ReceiptSequence under a non-church scope key. The first allocation continues
 * after the highest existing number, so legacy numbers are never reused.
 */
export type ReceiptPrefix = 'CIR' | 'DST' | 'SEC';
const lastNumber = async (tx: Prisma.TransactionClient, prefix: ReceiptPrefix, like: string): Promise<string | undefined> => {
  const where = { receiptNumber: { startsWith: like } };
  const args = { where, orderBy: { receiptNumber: 'desc' as const }, select: { receiptNumber: true } };
  const row = prefix === 'CIR' ? await tx.circuitReceipt.findFirst(args) : prefix === 'DST' ? await tx.districtReceipt.findFirst(args) : await tx.sectionReceipt.findFirst(args);
  return row?.receiptNumber;
};

export async function nextReceiptNumber(prefix: ReceiptPrefix, now = new Date()): Promise<string> {
  const year = now.getFullYear();
  const like = `${prefix}-${year}-`;
  return prisma.$transaction(async (tx) => {
    const last = await lastNumber(tx, prefix, like);
    const floor = Number(last?.slice(like.length)) || 0;
    const seq = await tx.receiptSequence.upsert({
      where: { churchId_year: { churchId: `GLOBAL:${prefix}`, year } },
      create: { churchId: `GLOBAL:${prefix}`, year, last: floor + 1 },
      update: { last: { increment: 1 } },
    });
    return `${like}${String(seq.last).padStart(6, '0')}`;
  });
}

/** Allocate a number and create the receipt; a collision (e.g. a legacy number ahead of the counter) takes the next number. */
export async function createWithNumber<T>(prefix: ReceiptPrefix, create: (receiptNumber: string) => Promise<T>): Promise<{ receipt: T; receiptNumber: string }> {
  for (let attempt = 0; ; attempt += 1) {
    const receiptNumber = await nextReceiptNumber(prefix);
    try {
      return { receipt: await create(receiptNumber), receiptNumber };
    } catch (error) {
      const clash = error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002' && String(error.meta?.target).includes('receiptNumber');
      if (!clash || attempt >= 4) throw error;
    }
  }
}
