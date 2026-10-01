import { z } from 'zod';

export const DistrictFinanceDashboardSchema = z.object({
  circuitId: z.string().uuid(),
  circuitName: z.string(),
  totalChurches: z.number(),
  totalIncome: z.number(),
  totalExpense: z.number(),
  netBalance: z.number(),
  churchMetrics: z.array(
    z.object({
      churchId: z.string().uuid(),
      churchName: z.string(),
      totalIncome: z.number(),
      totalExpense: z.number(),
      currentBalance: z.number(),
      status: z.string().optional(),
    })
  ),
});

export const DistrictFinancePendingExpenditureSchema = z.object({
  items: z.array(
    z.object({
      id: z.string().uuid(),
      churchId: z.string().uuid(),
      churchName: z.string(),
      amount: z.number(),
      purpose: z.string(),
      category: z.string(),
      requestedBy: z.string().uuid(),
      status: z.string(),
      createdAt: z.string().datetime(),
    })
  ),
  total: z.number(),
  skip: z.number(),
  take: z.number(),
});

export type DistrictFinanceDashboard = z.infer<typeof DistrictFinanceDashboardSchema>;
export type DistrictFinancePendingExpenditure = z.infer<typeof DistrictFinancePendingExpenditureSchema>;
