import { useCallback, useEffect, useState } from 'react';
import { card } from '@/pages/account/shared';
import { apiClient } from '@/utils/api';
import { getApiErrorMessage } from '@/utils/apiError';
import { ErrorNotice } from '@/pages/auth/AuthShell';
import type { QrCode } from '@/types/events';
import { E, Shell } from './eventsShared';

const REFRESH_BEFORE_MS = 20_000;

export const MyBadgePage = () => {
  const [badge, setBadge] = useState<QrCode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    try {
      const { data } = await apiClient.get<QrCode>(`${E}/members/me/badge`);
      setBadge(data);
      setError(null);
    } catch (e) {
      setError(getApiErrorMessage(e));
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Replace the badge shortly before it expires, so a screenshot goes stale but the live screen never does.
  useEffect(() => {
    if (!badge) return undefined;
    const wait = Math.max(new Date(badge.expiresAt).getTime() - Date.now() - REFRESH_BEFORE_MS, 5_000);
    const timer = setTimeout(() => void load(), wait);
    return () => clearTimeout(timer);
  }, [badge, load]);

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(tick);
  }, []);

  const secondsLeft = badge ? Math.max(Math.round((new Date(badge.expiresAt).getTime() - now) / 1000), 0) : 0;

  return (
    <Shell title="My badge" subtitle="Show this to an usher to check in. It changes every couple of minutes.">
      {error && <ErrorNotice message={error} />}
      <div className={`${card} mx-auto max-w-sm text-center`}>
        {badge ? (
          <>
            <img src={badge.dataUrl} alt="Your check-in QR code" className="mx-auto h-64 w-64" />
            <p className="mt-3 text-sm text-gray-600">Refreshes in {secondsLeft}s</p>
          </>
        ) : !error && <p className="text-sm text-gray-500">Loading your badge…</p>}
      </div>
    </Shell>
  );
};
