import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError } from 'axios';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { renderWithProviders } from '@/test/renderWithProviders';
import { useAuthStore } from '@/stores/authStore';
import { apiClient } from '@/utils/api';
import { LoginForm } from './LoginForm';

vi.mock('@/utils/api', () => ({ apiClient: { post: vi.fn(), get: vi.fn() } }));

const post = vi.mocked(apiClient.post);

const apiError = (status: number, body: { error: string; code?: string }) =>
  new AxiosError('failed', 'ERR_BAD_REQUEST', undefined, undefined, {
    status,
    statusText: 'err',
    headers: {},
    config: {} as never,
    data: body,
  });

const authResponse = {
  user: { id: 'u1', email: 'a@b.co', firstName: 'A', lastName: 'B', permissions: [], committees: [], sbus: [], organizationContexts: [] },
  token: 't',
  refreshToken: 'r',
};

beforeEach(() => {
  post.mockReset();
  localStorage.clear();
  useAuthStore.setState({ user: null, isAuthenticated: false, requiresTwoFactor: false, error: null, token: null, refreshToken: null });
});

describe('LoginForm', () => {
  test('links to forgot password', () => {
    renderWithProviders(<LoginForm />);
    expect(screen.getByRole('link', { name: 'Forgot password?' })).toHaveAttribute('href', '/auth/forgot-password');
  });

  test('shows the API message for invalid credentials', async () => {
    post.mockRejectedValue(apiError(401, { error: 'Invalid email or password' }));
    renderWithProviders(<LoginForm />);
    await userEvent.type(screen.getByLabelText('Email'), 'a@b.co');
    await userEvent.type(screen.getByLabelText('Password'), 'wrongpass1');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password');
    expect(screen.queryByLabelText('Authentication code')).not.toBeInTheDocument();
  });

  test('asks for a code on TWO_FACTOR_REQUIRED, then resubmits with totpCode', async () => {
    post.mockRejectedValueOnce(apiError(401, { error: 'Two-factor code required', code: 'TWO_FACTOR_REQUIRED' }));
    renderWithProviders(<LoginForm />);
    await userEvent.type(screen.getByLabelText('Email'), 'a@b.co');
    await userEvent.type(screen.getByLabelText('Password'), 'rightpass1');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    const codeInput = await screen.findByLabelText('Authentication code');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(post).toHaveBeenLastCalledWith('/api/v1/auth/login', { email: 'a@b.co', password: 'rightpass1' });

    post.mockResolvedValueOnce({ data: authResponse });
    await userEvent.type(codeInput, '123456');
    await userEvent.click(screen.getByRole('button', { name: 'Verify and sign in' }));

    await vi.waitFor(() => expect(useAuthStore.getState().isAuthenticated).toBe(true));
    expect(post).toHaveBeenLastCalledWith('/api/v1/auth/login', { email: 'a@b.co', password: 'rightpass1', totpCode: '123456' });
    expect(useAuthStore.getState().requiresTwoFactor).toBe(false);
  });

  test('back button returns to the credentials step', async () => {
    useAuthStore.setState({ requiresTwoFactor: true });
    renderWithProviders(<LoginForm />);
    await userEvent.click(screen.getByRole('button', { name: 'Back to sign in' }));
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
  });
});
