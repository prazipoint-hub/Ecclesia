import { prisma } from '@/database';

/**
 * Membership numbers are unique across all churches (M + year + sequence), so the next free sequence is read from
 * every church rather than counted per church, which would collide.
 */
export async function nextMembershipNumbers(count: number, year = new Date().getFullYear()): Promise<string[]> {
  const prefix = `M${year}`;
  const existing = await prisma.member.findMany({ where: { membershipNumber: { startsWith: prefix } }, select: { membershipNumber: true } });
  let highest = 0;
  for (const { membershipNumber } of existing) {
    const sequence = Number(membershipNumber.slice(prefix.length));
    if (Number.isInteger(sequence) && sequence > highest) highest = sequence;
  }
  return Array.from({ length: count }, (_, i) => `${prefix}${String(highest + i + 1).padStart(4, '0')}`);
}
