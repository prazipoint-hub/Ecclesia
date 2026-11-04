import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/utils/api';
import type { FundSummary, LedgerAccount } from '@/types/accounting';

export const ACCOUNTS_KEY = ['accounting', 'accounts'] as const;
export const FUNDS_KEY = ['accounting', 'funds'] as const;

export const useAccounts = () =>
  useQuery({ queryKey: ACCOUNTS_KEY, queryFn: async () => (await apiClient.get<LedgerAccount[]>('/api/v2/accounting/accounts')).data });

export const useFunds = () =>
  useQuery({ queryKey: FUNDS_KEY, queryFn: async () => (await apiClient.get<FundSummary[]>('/api/v2/accounting/funds')).data });
