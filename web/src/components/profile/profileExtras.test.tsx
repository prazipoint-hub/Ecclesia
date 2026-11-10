import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { apiClient } from '@/utils/api';
import { renderAt, signIn } from '@/test/peopleTestUtils';
import { useAuthStore } from '@stores/authStore';
import { Dependants, ExtraFields, PhotoControl } from './ProfileExtras';

vi.mock('@/utils/api', () => ({ apiClient: { get: vi.fn(), put: vi.fn(), post: vi.fn(), delete: vi.fn() } }));
const get = vi.mocked(apiClient.get);
const put = vi.mocked(apiClient.put);
beforeEach(() => { get.mockReset(); put.mockReset(); useAuthStore.setState({ user: null }); URL.createObjectURL = vi.fn(() => 'blob:x'); URL.revokeObjectURL = vi.fn(); });

describe('extra profile fields', () => {
  test('sends only what changed', async () => {
    signIn([]);
    get.mockResolvedValue({ data: { fields: [{ key: 'baptism', label: 'Baptism date', type: 'DATE', options: null, required: true, value: '' }, { key: 'skill', label: 'Skill', type: 'CHOICE', options: ['Music', 'Tech'], required: false, value: 'Music' }] } });
    put.mockResolvedValue({ data: {} });
    renderAt('/x', '/x', <ExtraFields />);
    const date = await screen.findByLabelText(/Baptism date/);
    await userEvent.type(date, '2015-06-01');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(put).toHaveBeenCalled());
    expect(put.mock.calls[0][1]).toEqual({ values: { baptism: '2015-06-01' } });
  });
});

describe('photo control', () => {
  test('refuses a wrong type or an oversized picture before sending anything', async () => {
    signIn([]);
    get.mockRejectedValue(new Error('none'));
    renderAt('/x', '/x', <PhotoControl />);
    const input = await screen.findByLabelText('Profile photo file');
    await userEvent.upload(input, new File(['x'], 'a.gif', { type: 'image/gif' }), { applyAccept: false });
    expect(await screen.findByRole('alert')).toHaveTextContent(/JPEG, PNG or WebP/);
    await userEvent.upload(input, new File([new Uint8Array(301 * 1024)], 'big.png', { type: 'image/png' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/300 KB/);
    expect(put).not.toHaveBeenCalled();
  });
});

describe('dependants', () => {
  test('shows nothing when there are no linked children', async () => {
    signIn([]);
    get.mockResolvedValue({ data: { dependants: [] } });
    const { container } = renderAt('/x', '/x', <Dependants />);
    await waitFor(() => expect(get).toHaveBeenCalled());
    expect(container.textContent).toBe('');
  });
});
