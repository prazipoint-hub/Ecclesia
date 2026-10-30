import { Prisma } from '@prisma/client';
import type { AccountType } from '../types';

export const D = (value: Prisma.Decimal.Value = 0) => new Prisma.Decimal(value);
export const toNumber = (value: Prisma.Decimal.Value) => Number(D(value).toFixed(2));

const DEBIT_NORMAL: AccountType[] = ['ASSET', 'EXPENSE'];

/** Assets and expenses grow with debits; everything else grows with credits. */
export const naturalBalance = (type: string, debit: Prisma.Decimal.Value, credit: Prisma.Decimal.Value): Prisma.Decimal =>
  DEBIT_NORMAL.includes(type as AccountType) ? D(debit).minus(credit) : D(credit).minus(debit);

export const startOfDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
export const endOfDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999));
