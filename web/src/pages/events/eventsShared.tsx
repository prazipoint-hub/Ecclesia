import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { MainLayout } from '@/components/Layout/MainLayout';
import { EmptyBlock, ErrorBlock, LoadingBlock, secondaryBtn } from '@/pages/account/shared';
import { AdminHeader, NoAccess } from '@/pages/admin/adminShared';
import { ErrorNotice } from '@/pages/auth/AuthShell';
import { usePermissions } from '@/pages/finance/financeShared';
import { apiClient } from '@/utils/api';
import { getApiErrorMessage } from '@/utils/apiError';
import type { Paged } from '@/types/events';

export { usePermissions };
export const E = '/api/v2/events';
export const PAGE_SIZE = 50;

export const ApiError = ({ error }: { error: unknown }) => (error ? <ErrorNotice message={getApiErrorMessage(error)} /> : null);
export const label = (value: string | null | undefined): string => (value ? value.toLowerCase().replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase()) : '—');
export const personName = (m?: { firstName: string; lastName: string } | null): string => (m ? `${m.firstName} ${m.lastName}` : '—');
export const dateTime = (iso: string | null | undefined): string => (iso ? new Date(iso).toLocaleString() : '—');

const LINKS: Array<{ to: string; label: string; permission?: string; end?: boolean }> = [
  { to: '/events', label: 'Calendar', end: true },
  { to: '/events/upcoming', label: 'Upcoming' },
  { to: '/events/scan', label: 'Check in' },
  { to: '/events/my-badge', label: 'My badge' },
  { to: '/events/volunteers', label: 'Volunteers' },
  { to: '/events/analytics', label: 'Analytics', permission: 'attendance:analytics:view' },
  { to: '/events/absences', label: 'Absences', permission: 'absence:followup:manage' },
];

export const EventsNav = () => {
  const has = usePermissions();
  return (
    <nav aria-label="Event sections" className="flex gap-1 overflow-x-auto rounded-md border border-gray-200/80 bg-white p-1.5 shadow-sm">
      {LINKS.filter((l) => !l.permission || has(l.permission)).map((link) => (
        <NavLink
          key={link.to}
          to={link.to}
          end={link.end}
          className={({ isActive }) => `min-h-9 shrink-0 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${isActive ? 'bg-primary-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'}`}
        >
          {link.label}
        </NavLink>
      ))}
    </nav>
  );
};

export const Shell = ({ title, subtitle, action, permission, children }: { title: string; subtitle?: string; action?: ReactNode; permission?: string; children: ReactNode }) => {
  const has = usePermissions();
  return (
    <MainLayout>
      <div className="mx-auto max-w-[1440px] space-y-6">
        <AdminHeader title={title} subtitle={subtitle} action={action} />
        <EventsNav />
        {permission && !has(permission) ? <NoAccess permission={permission} /> : children}
      </div>
    </MainLayout>
  );
};

export const th = 'bg-gray-50/80 px-4 py-3.5 text-left text-[11px] font-medium uppercase tracking-[0.12em] text-gray-500';
export const td = 'px-4 py-3.5 text-sm text-gray-700 align-top';
export const Tag = ({ value }: { value: string }) => {
  const red = ['DECLINED', 'NO_SHOW', 'CANCELLED'];
  const green = ['CONFIRMED', 'COMPLETED', 'REGISTERED', 'RESOLVED'];
  return <span className={`inline-block rounded-full border border-black/[0.04] px-2.5 py-1 text-xs font-medium ${red.includes(value) ? 'bg-red-100 text-red-700' : green.includes(value) ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}`}>{label(value)}</span>;
};

export const DataState = ({ query, empty, children }: { query: { isLoading: boolean; error: unknown; refetch: () => unknown; data?: { items: unknown[] } }; empty: string; children: ReactNode }) =>
  query.isLoading ? <LoadingBlock /> : query.error ? <ErrorBlock error={query.error} onRetry={() => void query.refetch()} /> : query.data && query.data.items.length === 0 ? <EmptyBlock message={empty} /> : <>{children}</>;

/** Paginated GET with skip/take. */
export const usePagedList = <T,>(key: string, path: string, params: Record<string, string | undefined> = {}, enabled = true, refetchInterval?: number) => {
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: ['events', key, params, page],
    enabled,
    refetchInterval,
    queryFn: async () =>
      (await apiClient.get<Paged<T>>(`${E}${path}`, { params: { ...Object.fromEntries(Object.entries(params).filter(([, v]) => v)), skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE } })).data,
  });
  return { query, page, setPage };
};

/** The event list, for pickers. Needs event:view, so callers fall back to an ID input when it is empty. */
export const useEventOptions = (enabled = true) =>
  useQuery({
    queryKey: ['events', 'options'],
    enabled,
    retry: false,
    queryFn: async () => (await apiClient.get<{ events: Array<{ id: string; title: string; startDateTime: string }> }>(E, { params: { take: 100 } })).data.events,
  });

type Detector = { detect: (source: CanvasImageSource) => Promise<Array<{ rawValue: string }>> };
type DetectorCtor = new (options: { formats: string[] }) => Detector;
const detectorCtor = (): DetectorCtor | undefined => (globalThis as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;

/** Camera scanning is optional: with no BarcodeDetector the component renders nothing and the paste field is the way in. */
export const CameraScanner = ({ onToken }: { onToken: (token: string) => void }) => {
  const [active, setActive] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  const supported = Boolean(detectorCtor()) && Boolean(globalThis.navigator?.mediaDevices?.getUserMedia);

  const stop = useCallback(() => setActive(false), []);
  useEffect(() => {
    if (!active) return undefined;
    let stream: MediaStream | undefined;
    let timer: ReturnType<typeof setInterval> | undefined;
    let cancelled = false;
    const Ctor = detectorCtor();
    void (async () => {
      try {
        if (!Ctor) return;
        const detector = new Ctor({ formats: ['qr_code'] });
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (cancelled || !video.current) return;
        video.current.srcObject = stream;
        await video.current.play();
        timer = setInterval(() => {
          if (!video.current) return;
          void detector.detect(video.current).then((codes) => {
            if (codes[0]?.rawValue) { onToken(codes[0].rawValue); setActive(false); }
          }).catch(() => undefined);
        }, 400);
      } catch {
        setProblem('The camera could not be opened. Paste the code instead.');
        setActive(false);
      }
    })();
    return () => { cancelled = true; if (timer) clearInterval(timer); stream?.getTracks().forEach((t) => t.stop()); };
  }, [active, onToken]);

  if (!supported) return null;
  return (
    <div className="space-y-2">
      {problem && <ErrorNotice message={problem} />}
      {active ? (
        <>
          <video ref={video} muted playsInline className="w-full max-w-sm rounded-lg bg-black" />
          <button type="button" className={secondaryBtn} onClick={stop}>Stop camera</button>
        </>
      ) : (
        <button type="button" className={secondaryBtn} onClick={() => { setProblem(null); setActive(true); }}>Scan with camera</button>
      )}
    </div>
  );
};
