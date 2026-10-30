import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { PledgesPage } from '@/pages/account/PledgesPage';
import { renderWithProviders } from '@/test/renderWithProviders';
import type { PaymentView, PledgeView } from '@/types/giving';
import { apiClient } from '@/utils/api';
import { GiveConfirmPage } from './GiveConfirmPage';
import { GivePage } from './GivePage';

vi.mock('@/utils/api', () => ({ apiClient: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }));
vi.mock('@/components/Layout/MainLayout', () => ({ MainLayout: ({ children }: { children: ReactNode }) => <div>{children}</div> }));

const get = vi.mocked(apiClient.get);
const post = vi.mocked(apiClient.post);

const payment = (overrides: Partial<PaymentView> = {}): PaymentView => ({
  id: 'pay-1',
  reference: 'ECC-ABC',
  amount: 25,
  currency: 'USD',
  incomeType: 'OFFERING',
  method: 'ECOCASH',
  status: 'PENDING',
  failureReason: null,
  fundName: 'General Fund',
  pledgeId: null,
  redirectUrl: null,
  instructions: 'Approve the prompt on your phone',
  receiptNumber: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  paidAt: null,
  ...overrides,
});

const answerGets = (extra: Record<string, unknown> = {}) =>
  get.mockImplementation(async (url: string) => {
    if (url in extra) return { data: extra[url] };
    if (url === '/api/v2/payments/funds') return { data: [{ id: 'f1', name: 'General Fund', description: null }] };
    if (url === '/api/v2/payment-methods') return { data: [] };
    if (url === '/api/v2/pledges') return { data: { items: [], total: 0, page: 1, pageSize: 100 } };
    throw new Error(`unexpected GET ${url}`);
  });

const Where = () => <p data-testid="where">{useLocation().pathname + useLocation().search}</p>;

beforeEach(() => {
  get.mockReset();
  post.mockReset();
});

describe('GivePage', () => {
  const renderGive = () =>
    renderWithProviders(
      <Routes>
        <Route path="/give" element={<GivePage />} />
        <Route path="/give/confirm" element={<Where />} />
      </Routes>,
      '/give'
    );

  test('validates amount and phone before calling the API', async () => {
    answerGets();
    renderGive();
    await screen.findByLabelText('Amount');
    await userEvent.type(screen.getByLabelText('Amount'), '10.555');
    await userEvent.type(screen.getByLabelText('Mobile money number'), '123');
    await userEvent.click(screen.getByRole('button', { name: 'Give' }));
    expect(await screen.findByText('Enter an amount with at most two decimal places.')).toBeInTheDocument();
    expect(screen.getByText('Enter a valid number such as 0771234567.')).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });

  test('rejects a zero amount', async () => {
    answerGets();
    renderGive();
    await userEvent.type(await screen.findByLabelText('Amount'), '0');
    await userEvent.type(screen.getByLabelText('Mobile money number'), '0771234567');
    await userEvent.click(screen.getByRole('button', { name: 'Give' }));
    expect(await screen.findByText('Amount must be greater than zero.')).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });

  test('initiates the payment and moves to the confirmation page', async () => {
    answerGets();
    post.mockResolvedValue({ data: payment() });
    renderGive();
    await userEvent.type(await screen.findByLabelText('Amount'), '25');
    await userEvent.type(screen.getByLabelText('Mobile money number'), '0771234567');
    await userEvent.click(screen.getByRole('button', { name: 'Give' }));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/give/confirm?paymentId=pay-1'));
    expect(post).toHaveBeenCalledWith('/api/v2/payments/initiate', {
      fundId: 'f1',
      amount: 25,
      incomeType: 'OFFERING',
      method: 'ECOCASH',
      phone: '0771234567',
    });
  });

  test('card payments do not ask for a phone number', async () => {
    answerGets();
    post.mockResolvedValue({ data: payment({ method: 'WEB' }) });
    renderGive();
    await userEvent.selectOptions(await screen.findByLabelText('Pay with'), 'WEB');
    expect(screen.queryByLabelText('Mobile money number')).not.toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Amount'), '5');
    await userEvent.click(screen.getByRole('button', { name: 'Give' }));
    await waitFor(() => expect(post).toHaveBeenCalled());
    expect(post.mock.calls[0][1]).toEqual({ fundId: 'f1', amount: 5, incomeType: 'OFFERING', method: 'WEB' });
  });

  test('shows the server error when the payment cannot start', async () => {
    answerGets();
    post.mockRejectedValue({ isAxiosError: true, response: { status: 502, data: { error: 'Payment gateway is unreachable' } } });
    renderGive();
    await userEvent.type(await screen.findByLabelText('Amount'), '5');
    await userEvent.type(screen.getByLabelText('Mobile money number'), '0771234567');
    await userEvent.click(screen.getByRole('button', { name: 'Give' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Payment gateway is unreachable');
  });
});

describe('GiveConfirmPage', () => {
  const renderConfirm = () => renderWithProviders(<GiveConfirmPage pollMs={20} />, '/give/confirm?paymentId=pay-1');

  test('shows the pending instructions, then success once the payment completes', async () => {
    get
      .mockResolvedValueOnce({ data: payment() })
      .mockResolvedValue({ data: payment({ status: 'COMPLETED', instructions: null, receiptNumber: 'ON-ECC-ABC', paidAt: '2026-01-01T00:01:00.000Z' }) });
    renderConfirm();
    expect(await screen.findByText('Approve the prompt on your phone')).toBeInTheDocument();
    expect(await screen.findByText('Thank you!')).toBeInTheDocument();
    expect(screen.getByText('ON-ECC-ABC')).toBeInTheDocument();
    const calls = get.mock.calls.length;
    await new Promise((r) => setTimeout(r, 100));
    expect(get.mock.calls.length).toBe(calls); // polling stops on a final status
  });

  test('links to the payment page for web checkout', async () => {
    get.mockResolvedValue({ data: payment({ method: 'WEB', redirectUrl: 'https://pay.example/checkout' }) });
    renderConfirm();
    expect(await screen.findByRole('link', { name: 'Continue to payment page' })).toHaveAttribute('href', 'https://pay.example/checkout');
  });

  test('shows the failure reason and a retry link', async () => {
    get.mockResolvedValue({ data: payment({ status: 'FAILED', failureReason: 'Insufficient funds', instructions: null }) });
    renderConfirm();
    expect(await screen.findByText('Payment failed')).toBeInTheDocument();
    expect(screen.getByText('Insufficient funds')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Try again' })).toHaveAttribute('href', '/give');
  });

  test('without a payment id there is nothing to poll', () => {
    renderWithProviders(<GiveConfirmPage />, '/give/confirm');
    expect(screen.getByRole('alert')).toHaveTextContent('We could not find a payment');
    expect(get).not.toHaveBeenCalled();
  });
});

describe('PledgesPage', () => {
  const pledge = (overrides: Partial<PledgeView> = {}): PledgeView => ({
    id: 'pl1',
    name: 'Building fund',
    fundId: 'f1',
    fundName: 'General Fund',
    targetAmount: 200,
    paidAmount: 50,
    remainingAmount: 150,
    currency: 'USD',
    status: 'ACTIVE',
    startDate: '2026-01-01T00:00:00.000Z',
    endDate: null,
    ...overrides,
  });

  test('shows progress toward the target', async () => {
    get.mockResolvedValue({ data: { items: [pledge()], total: 1, page: 1, pageSize: 10 } });
    renderWithProviders(<PledgesPage />);
    const bar = await screen.findByRole('progressbar', { name: 'Building fund progress' });
    expect(bar).toHaveAttribute('aria-valuenow', '25');
    expect(screen.getByRole('link', { name: 'Give toward this' })).toHaveAttribute('href', '/give?pledgeId=pl1');
  });

  test('caps a fulfilled pledge at 100% and hides actions', async () => {
    get.mockResolvedValue({
      data: { items: [pledge({ status: 'FULFILLED', paidAmount: 250, remainingAmount: 0 })], total: 1, page: 1, pageSize: 10 },
    });
    renderWithProviders(<PledgesPage />);
    expect(await screen.findByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
    expect(screen.queryByRole('button', { name: 'Cancel pledge' })).not.toBeInTheDocument();
  });

  test('validates the new pledge form', async () => {
    get.mockImplementation(async (url: string) =>
      url === '/api/v2/payments/funds'
        ? { data: [{ id: 'f1', name: 'General Fund', description: null }] }
        : { data: { items: [], total: 0, page: 1, pageSize: 10 } }
    );
    renderWithProviders(<PledgesPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'New pledge' }));
    await userEvent.click(screen.getByRole('button', { name: 'Create pledge' }));
    expect(await screen.findByText('Give your pledge a name.')).toBeInTheDocument();
    expect(screen.getByText('Enter an amount.')).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });
});
