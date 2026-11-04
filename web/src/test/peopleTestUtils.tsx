import { Route, Routes } from 'react-router-dom';
import type { ReactElement } from 'react';
import { vi } from 'vitest';
import { renderWithProviders } from '@/test/renderWithProviders';
import type { User } from '@/types/auth';
import { useAuthStore } from '@stores/authStore';

export const signIn = (permissions: string[]) =>
  useAuthStore.setState({
    user: { id: 'u1', email: 'a@b.co', firstName: 'A', lastName: 'B', churchId: 'church-1', permissions, committees: [], sbus: [], organizationContexts: [] } as User,
  });

/** Renders a page at a URL with its route pattern so useParams works. */
export const renderAt = (pattern: string, url: string, element: ReactElement) =>
  renderWithProviders(<Routes><Route path={pattern} element={element} /></Routes>, url);

/** An error shaped like the ones axios throws, so getApiErrorMessage can read the server's message. */
export const apiError = (message: string, status = 400) =>
  Object.assign(new Error(message), { isAxiosError: true, response: { status, data: { error: message } } });

export const stubDownloads = () => {
  const createObjectURL = vi.fn(() => 'blob:test');
  Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
  return createObjectURL;
};
