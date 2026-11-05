import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, test } from 'vitest';
import i18n, { setLanguage } from '@/i18n';
import en from '@/i18n/en.json';
import nd from '@/i18n/nd.json';
import sn from '@/i18n/sn.json';
import { LanguageSwitcher } from '@/components/common/LanguageSwitcher';
import { OfflineBanner } from '@/components/common/OfflineBanner';
import { InstallPrompt } from '@/components/common/InstallPrompt';
import { Sidebar } from '@/components/Layout/Sidebar';
import { decideCacheAction } from './cachePolicy';

const origin = 'https://app.example.org';
const decide = (url: string, extra: Record<string, unknown> = {}) =>
  decideCacheAction({ url, origin, method: 'GET', ...extra });

describe('cache policy (shared with the service worker)', () => {
  test.each([
    '/api/v2/members',
    '/api/v2/me/giving',
    '/api/v1/auth/login',
    '/api',
    'https://app.example.org/api/v2/admin/audit-logs?x=1',
  ])('never caches API traffic: %s', (url) => expect(decide(url)).toBe('bypass'));

  test('never caches a request carrying credentials, even for a static path', () => {
    expect(decide('/assets/app-abc.js', { hasAuthorization: true })).toBe('bypass');
  });
  test('never caches writes', () => {
    expect(decide('/assets/app-abc.js', { method: 'POST' })).toBe('bypass');
  });
  test('never caches other origins', () => {
    expect(decide('https://evil.example.com/assets/x.js')).toBe('bypass');
  });
  test('api check is not fooled by lookalike prefixes in navigation', () => {
    expect(decide('/api/v2/members', { mode: 'navigate' })).toBe('bypass');
  });
  test('static assets are cache-first; pages are network-first; everything else passes through', () => {
    expect(decide('/assets/index-abc123.js')).toBe('cache-first');
    expect(decide('/icons/icon-192.svg')).toBe('cache-first');
    expect(decide('/manifest.webmanifest')).toBe('cache-first');
    expect(decide('/members', { mode: 'navigate' })).toBe('navigate');
    expect(decide('/some/data.json')).toBe('bypass');
    expect(decide('/sw.js')).toBe('bypass');
  });
  test('service worker uses the shared policy and cleans old caches', () => {
    const sw = readFileSync(resolve(__dirname, '../../public/sw.js'), 'utf8');
    expect(sw).toContain("importScripts('/cache-policy.js')");
    expect(sw).toContain('caches.delete');
    expect(sw).not.toMatch(/\/api\//);
  });
  test('manifest is installable', () => {
    const m = JSON.parse(
      readFileSync(resolve(__dirname, '../../public/manifest.webmanifest'), 'utf8')
    );
    expect(m).toMatchObject({ display: 'standalone', start_url: '/' });
    expect(m.icons.length).toBeGreaterThanOrEqual(2);
  });
});

describe('i18n', () => {
  beforeEach(async () => {
    await setLanguage('en');
  });

  test('every language has exactly the English keys', () => {
    const flat = (o: Record<string, unknown>, p = ''): string[] =>
      Object.entries(o).flatMap(([k, v]) =>
        typeof v === 'object' && v ? flat(v as Record<string, unknown>, `${p}${k}.`) : [`${p}${k}`]
      );
    expect(flat(sn as never).sort()).toEqual(flat(en as never).sort());
    expect(flat(nd as never).sort()).toEqual(flat(en as never).sort());
  });

  test('switching language changes the sidebar and persists the choice', async () => {
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Sidebar isOpen onClose={() => {}} />
        <LanguageSwitcher />
      </MemoryRouter>
    );
    expect(screen.getByText('My Account')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Language'), { target: { value: 'sn' } });
    expect(await screen.findByText('Akaunti Yangu')).toBeInTheDocument();
    expect(screen.queryByText('My Account')).not.toBeInTheDocument();
    expect(localStorage.getItem('ecclesia.language')).toBe('sn');
    expect(document.documentElement.lang).toBe('sn');
  });

  test('missing keys fall back to English', async () => {
    i18n.addResource('nd', 'translation', 'test.onlyEnglish', undefined as never);
    i18n.addResource('en', 'translation', 'test.onlyEnglish', 'English only');
    await setLanguage('nd');
    expect(i18n.t('test.onlyEnglish')).toBe('English only');
  });
});

describe('offline and install', () => {
  beforeEach(async () => {
    await setLanguage('en');
  });

  test('banner shows only while offline', () => {
    render(<OfflineBanner />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    expect(screen.getByRole('status')).toBeInTheDocument();
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  test('install prompt appears on the browser event and stays gone once dismissed', () => {
    localStorage.clear();
    render(<InstallPrompt />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    act(() => {
      window.dispatchEvent(
        Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
          prompt: async () => {},
          userChoice: Promise.resolve({ outcome: 'dismissed' }),
        })
      );
    });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Close'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(localStorage.getItem('ecclesia.installPromptDismissed')).toBe('1');
  });
});
