import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError } from 'axios';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { renderWithProviders } from '@/test/renderWithProviders';
import { apiClient } from '@/utils/api';
import { ForgotPasswordPage } from './ForgotPasswordPage';
import { ResetPasswordPage } from './ResetPasswordPage';

vi.mock('@/utils/api', () => ({ apiClient: { post: vi.fn(), get: vi.fn(), delete: vi.fn() } }));

const post = vi.mocked(apiClient.post);

const apiError = (status: number, body: { error: string; code?: string }) =>
  new AxiosError('failed', 'ERR_BAD_REQUEST', undefined, undefined, {
    status,
    statusText: 'err',
    headers: {},
    config: {} as never,
    data: body,
  });

beforeEach(() => {
  post.mockReset();
});

describe('ForgotPasswordPage', () => {
  test('sends the lowercased email and shows the server message', async () => {
    post.mockResolvedValue({ data: { message: 'Check your inbox.' } });
    renderWithProviders(<ForgotPasswordPage />);

    await userEvent.type(screen.getByLabelText('Email'), 'Member@Church.org');
    await userEvent.click(screen.getByRole('button', { name: 'Send reset link' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Check your inbox.');
    expect(post).toHaveBeenCalledWith('/api/v1/auth/password-reset/request', { email: 'member@church.org' });
  });

  test('shows the API error message on failure', async () => {
    post.mockRejectedValue(apiError(429, { error: 'Too many requests, try later.' }));
    renderWithProviders(<ForgotPasswordPage />);

    await userEvent.type(screen.getByLabelText('Email'), 'a@b.co');
    await userEvent.click(screen.getByRole('button', { name: 'Send reset link' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Too many requests, try later.');
  });
});

describe('ResetPasswordPage', () => {
  test('shows a clear error when the token is missing', () => {
    renderWithProviders(<ResetPasswordPage />, '/auth/reset-password');
    expect(screen.getByRole('alert')).toHaveTextContent(/missing its token/i);
    expect(screen.getByRole('link', { name: 'Request a new link' })).toBeInTheDocument();
    expect(screen.queryByLabelText('New password')).not.toBeInTheDocument();
  });

  test('blocks submit when passwords do not match', async () => {
    renderWithProviders(<ResetPasswordPage />, '/auth/reset-password?token=abc');
    await userEvent.type(screen.getByLabelText('New password'), 'longenough1');
    await userEvent.type(screen.getByLabelText('Confirm new password'), 'different12');
    await userEvent.click(screen.getByRole('button', { name: 'Reset password' }));

    expect(await screen.findByText('Passwords do not match.')).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });

  test('blocks submit when password is too short', async () => {
    renderWithProviders(<ResetPasswordPage />, '/auth/reset-password?token=abc');
    await userEvent.type(screen.getByLabelText('New password'), 'short');
    await userEvent.type(screen.getByLabelText('Confirm new password'), 'short');
    await userEvent.click(screen.getByRole('button', { name: 'Reset password' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/at least 8 characters/i);
    expect(post).not.toHaveBeenCalled();
  });

  test('submits token and password, then offers sign in', async () => {
    post.mockResolvedValue({ data: { message: 'Password updated.' } });
    renderWithProviders(<ResetPasswordPage />, '/auth/reset-password?token=abc');
    await userEvent.type(screen.getByLabelText('New password'), 'longenough1');
    await userEvent.type(screen.getByLabelText('Confirm new password'), 'longenough1');
    await userEvent.click(screen.getByRole('button', { name: 'Reset password' }));

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Password updated.'));
    expect(post).toHaveBeenCalledWith('/api/v1/auth/password-reset/confirm', { token: 'abc', password: 'longenough1' });
    expect(screen.getByRole('link', { name: 'Sign in' })).toBeInTheDocument();
  });
});
