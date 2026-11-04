import { useState } from 'react';
import type { FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FormField } from '@/components/forms/FormField';
import { FormSelect } from '@/components/forms/FormSelect';
import { FormTextarea } from '@/components/forms/FormTextarea';
import { Pagination, card, formatDate, primaryBtn } from '@/pages/account/shared';
import { apiClient } from '@/utils/api';
import type { CheckInResult, CheckInRow, QrCode } from '@/types/events';
import { ApiError, CameraScanner, DataState, E, PAGE_SIZE, Shell, Tag, dateTime, personName, td, th, usePagedList, usePermissions } from './eventsShared';

export const CheckInPage = () => {
  const { eventId = '' } = useParams();
  const has = usePermissions();
  const queryClient = useQueryClient();
  const [memberId, setMemberId] = useState('');
  const [membershipNumber, setMembershipNumber] = useState('');
  const [method, setMethod] = useState('MANUAL');
  const [badge, setBadge] = useState('');
  const [formError, setFormError] = useState('');
  const [last, setLast] = useState<CheckInResult | null>(null);

  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['events', 'checkins'] });
  const list = usePagedList<CheckInRow>('checkins', `/${eventId}/checkins`, {}, has('event:checkin:manage'), 10_000);
  const qr = useQuery({ queryKey: ['events', 'qr', eventId], enabled: has('event:qr:generate'), retry: false, queryFn: async () => (await apiClient.get<QrCode>(`${E}/${eventId}/qr`)).data });

  const manual = useMutation({
    mutationFn: async () => (await apiClient.post<CheckInResult>(`${E}/${eventId}/checkin`, { ...(memberId.trim() ? { memberId: memberId.trim() } : { membershipNumber: membershipNumber.trim() }), method })).data,
    onSuccess: (data) => { setLast(data); setMemberId(''); setMembershipNumber(''); refresh(); },
  });
  const scan = useMutation({
    mutationFn: async (token: string) => (await apiClient.post<CheckInResult>(`${E}/${eventId}/checkin/scan`, { token: token.trim() })).data,
    onSuccess: (data) => { setLast(data); setBadge(''); refresh(); },
  });

  const submitManual = (e: FormEvent) => {
    e.preventDefault();
    if (Boolean(memberId.trim()) === Boolean(membershipNumber.trim())) { setFormError('Enter either a member ID or a membership number.'); return; }
    setFormError('');
    manual.mutate();
  };

  return (
    <Shell title="Event check-in" permission="event:checkin:manage">
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          {has('event:qr:generate') && (
            <section className={`${card} text-center`}>
              <h2 className="mb-2 text-lg font-semibold text-gray-900">Door code</h2>
              <ApiError error={qr.error} />
              {qr.data && <img src={qr.data.dataUrl} alt="Event check-in QR code" className="mx-auto h-64 w-64" />}
              <p className="mt-2 text-xs text-gray-500">Members scan this to check themselves in. It stops working when check-in closes{qr.data ? ` (${dateTime(qr.data.expiresAt)})` : ''}.</p>
            </section>
          )}
          <section className={`${card} space-y-3`}>
            <h2 className="text-lg font-semibold text-gray-900">Check in a member</h2>
            <form onSubmit={submitManual} className="space-y-3">
              <FormField label="Member ID" value={memberId} onChange={(e) => setMemberId(e.target.value)} />
              <FormField label="Membership number" value={membershipNumber} onChange={(e) => setMembershipNumber(e.target.value)} error={formError} />
              <FormSelect label="Method" value={method} options={[{ value: 'MANUAL', label: 'Manual' }, { value: 'KIOSK', label: 'Kiosk' }]} onChange={(e) => setMethod(e.target.value)} />
              <button type="submit" className={primaryBtn} disabled={manual.isPending}>Check in</button>
            </form>
            <ApiError error={manual.error} />
          </section>
          <section className={`${card} space-y-3`}>
            <h2 className="text-lg font-semibold text-gray-900">Scan a member badge</h2>
            <CameraScanner onToken={(t) => scan.mutate(t)} />
            <FormTextarea label="Badge code" rows={2} value={badge} onChange={(e) => setBadge(e.target.value)} />
            <button type="button" className={primaryBtn} disabled={scan.isPending || !badge.trim()} onClick={() => scan.mutate(badge)}>Check in</button>
            <ApiError error={scan.error} />
          </section>
          {last && (
            <div role="status" className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-900">
              <p className="font-semibold">{last.alreadyCheckedIn ? 'Already checked in' : 'Checked in'}: {personName(last.member)}</p>
              <p>{formatDate(last.checkedInAt)} · {last.method}</p>
            </div>
          )}
        </div>
        <section className={card}>
          <h2 className="mb-3 text-lg font-semibold text-gray-900">Checked in{list.query.data ? ` (${list.query.data.total})` : ''}</h2>
          <DataState query={list.query} empty="Nobody has checked in yet.">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead><tr><th className={th}>Member</th><th className={th}>Time</th><th className={th}>How</th></tr></thead>
                <tbody className="divide-y divide-gray-100">
                  {list.query.data?.items.map((c) => (
                    <tr key={c.id}><td className={td}>{personName(c.member)}</td><td className={td}>{dateTime(c.checkedInAt)}</td><td className={td}><Tag value={c.method} /></td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={list.page} pageSize={PAGE_SIZE} total={list.query.data?.total ?? 0} onPage={list.setPage} />
          </DataState>
        </section>
      </div>
    </Shell>
  );
};
