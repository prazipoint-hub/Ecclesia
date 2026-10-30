import type { AccountType } from '../types';

export const DEFAULT_CHART: { code: string; name: string; type: AccountType }[] = [
  { code: '1000', name: 'Cash on Hand', type: 'ASSET' },
  { code: '1100', name: 'Bank Accounts', type: 'ASSET' },
  { code: '1200', name: 'Mobile Money & Online Clearing', type: 'ASSET' },
  { code: '2000', name: 'Accounts Payable', type: 'LIABILITY' },
  { code: '3000', name: 'Net Assets (Fund Balance)', type: 'EQUITY' },
  { code: '3100', name: 'Opening Balance Equity', type: 'EQUITY' },
  { code: '4000', name: 'Tithes', type: 'REVENUE' },
  { code: '4100', name: 'Offerings', type: 'REVENUE' },
  { code: '4200', name: 'Donations', type: 'REVENUE' },
  { code: '4300', name: 'Fundraising Income', type: 'REVENUE' },
  { code: '4900', name: 'Other Income', type: 'REVENUE' },
  { code: '5000', name: 'Administrative Expenses', type: 'EXPENSE' },
  { code: '5100', name: 'Building & Maintenance', type: 'EXPENSE' },
  { code: '5200', name: 'Salaries & Allowances', type: 'EXPENSE' },
  { code: '5300', name: 'Missions & Outreach', type: 'EXPENSE' },
  { code: '5400', name: 'Utilities', type: 'EXPENSE' },
  { code: '5900', name: 'Other Expenses', type: 'EXPENSE' },
];

/** Where a receipt's money lands, by how it was paid. */
export const assetAccountForPayment = (method: string): string => {
  switch (method) {
    case 'CASH': return '1000';
    case 'MOBILE_MONEY':
    case 'ONLINE': return '1200';
    default: return '1100'; // BANK_TRANSFER, CHEQUE, anything unknown
  }
};

export const revenueAccountForIncome = (incomeType: string): string =>
  ({ TITHE: '4000', OFFERING: '4100', DONATION: '4200', FUNDRAISING: '4300' } as Record<string, string>)[incomeType] ?? '4900';

export const expenseAccountForCategory = (category: string): string => {
  const c = category.toLowerCase();
  if (c.includes('admin')) return '5000';
  if (c.includes('build') || c.includes('maint')) return '5100';
  if (c.includes('salar') || c.includes('allowance') || c.includes('wage')) return '5200';
  if (c.includes('mission') || c.includes('outreach')) return '5300';
  if (c.includes('utilit')) return '5400';
  return '5900';
};
