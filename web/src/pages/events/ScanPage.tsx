import { useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { FormTextarea } from '@/components/forms/FormTextarea';
import { card, formatDate, primaryBtn } from '@/pages/account/shared';
import { apiClient } from '@/utils/api';
import type { CheckInResult } from '@/types/events';
import { ApiError, CameraScanner, E, Shell, personName } from './eventsShared';

export const ScanPage = () => {
  const [token, setToken] = useState('');
  const checkIn = useMutation({ mutationFn: async (value: string) => (await apiClient.post<CheckInResult>(`${E}/checkin/self`, { token: value.trim() })).data });
  const submit = (e: FormEvent) => { e.preventDefault(); if (token.trim()) checkIn.mutate(token); };
  const scanned = (value: string) => { setToken(value); checkIn.mutate(value); };
  const result = checkIn.data;

  return (
    <Shell title="Check in" subtitle="Scan the code displayed at the door.">
      <div className={`${card} max-w-xl space-y-4`}>
        <CameraScanner onToken={scanned} />
        <form onSubmit={submit} className="space-y-3">
          <FormTextarea label="Door code" rows={3} value={token} onChange={(e) => setToken(e.target.value)} placeholder="Paste the code here if you cannot scan it" />
          <button type="submit" className={primaryBtn} disabled={checkIn.isPending || !token.trim()}>Check in</button>
        </form>
        <ApiError error={checkIn.error} />
        {result && (
          <div role="status" className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-900">
            <p className="font-semibold">{result.alreadyCheckedIn ? 'You were already checked in' : 'You are checked in'}</p>
            <p>{personName(result.member)} · {result.event.title}</p>
            <p className="text-green-800">{formatDate(result.checkedInAt)}</p>
          </div>
        )}
      </div>
    </Shell>
  );
};
