export type IncomeType = 'OFFERING' | 'TITHE' | 'DONATION' | 'FUNDRAISING';
export type PaymentMethod = 'ECOCASH' | 'ONEMONEY' | 'WEB';
export type PaymentStatus = 'PENDING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
export type PledgeStatus = 'ACTIVE' | 'FULFILLED' | 'CANCELLED';

export interface GivingFund {
  id: string;
  name: string;
  description: string | null;
}

export interface PaymentView {
  id: string;
  reference: string;
  amount: number;
  currency: string;
  incomeType: IncomeType;
  method: PaymentMethod;
  status: PaymentStatus;
  failureReason: string | null;
  fundName: string;
  pledgeId: string | null;
  redirectUrl: string | null;
  instructions: string | null;
  receiptNumber: string | null;
  createdAt: string;
  paidAt: string | null;
}

export interface InitiatePaymentRequest {
  fundId: string;
  amount: number;
  incomeType: IncomeType;
  method: PaymentMethod;
  phone?: string;
  savedMethodId?: string;
  pledgeId?: string;
}

export interface PledgeView {
  id: string;
  name: string;
  fundId: string;
  fundName: string;
  targetAmount: number;
  paidAmount: number;
  remainingAmount: number;
  currency: string;
  status: PledgeStatus;
  startDate: string;
  endDate: string | null;
}

export interface PledgeList {
  items: PledgeView[];
  total: number;
  page: number;
  pageSize: number;
}

export type RecurringFrequency = 'WEEKLY' | 'MONTHLY';

export interface RecurringView {
  id: string;
  fundId: string;
  fundName: string;
  amount: number;
  currency: string;
  incomeType: IncomeType;
  frequency: RecurringFrequency;
  method: 'ECOCASH' | 'ONEMONEY';
  phone: string;
  nextChargeDate: string;
  isActive: boolean;
}

export interface SavedMethod {
  id: string;
  type: 'ECOCASH' | 'ONEMONEY';
  label: string;
  isDefault: boolean;
  phoneMasked: string;
}

export const INCOME_TYPE_OPTIONS: Array<{ value: IncomeType; label: string }> = [
  { value: 'OFFERING', label: 'Offering' },
  { value: 'TITHE', label: 'Tithe' },
  { value: 'DONATION', label: 'Donation' },
  { value: 'FUNDRAISING', label: 'Fundraising' },
];

const PHONE_PATTERN = /^(0\d{9}|\+?263\d{9})$/;

/** Returns an error message, or undefined when the phone number is acceptable. */
export const validatePhone = (value: string): string | undefined => {
  if (!value.trim()) return 'Enter your mobile money number.';
  return PHONE_PATTERN.test(value.trim()) ? undefined : 'Enter a valid number such as 0771234567.';
};

/** Returns an error message, or undefined when the amount is a positive number with at most two decimals. */
export const validateAmount = (value: string): string | undefined => {
  const text = value.trim();
  if (!text) return 'Enter an amount.';
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return 'Enter an amount with at most two decimal places.';
  const amount = Number(text);
  if (amount <= 0) return 'Amount must be greater than zero.';
  if (amount > 1_000_000) return 'Amount is too large.';
  return undefined;
};
