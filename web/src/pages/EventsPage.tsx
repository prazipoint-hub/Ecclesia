import { FormEvent, useCallback, useEffect, useState } from 'react';
import { CalendarDays, Check, Plus, RefreshCw, Users, X } from 'lucide-react';
import { MainLayout } from '@/components/Layout/MainLayout';
import { useAuthStore } from '@/stores/authStore';
import { apiClient } from '@/utils/api';

interface EventRecord { id: string; title: string; eventType: string; startDateTime: string; endDateTime?: string; location?: string; status: string; _count: { attendances: number }; }
interface Member { id: string; firstName: string; lastName: string; membershipNumber: string; }
interface Attendance { id: string; status: string; member: Member; }

const errorMessage = (error: unknown, fallback: string) => typeof error === 'object' && error && 'response' in error
  ? (error as { response?: { data?: { error?: string } } }).response?.data?.error ?? fallback : fallback;
const pretty = (value: string) => value.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (part: string) => part.toUpperCase());

export const EventsPage = () => {
  const { user } = useAuthStore();
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [attendanceEvent, setAttendanceEvent] = useState<EventRecord | null>(null);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [memberId, setMemberId] = useState('');
  const [form, setForm] = useState({ title: '', eventType: 'SERVICE', startDateTime: '', endDateTime: '', location: '' });
  const canCreate = Boolean(user?.permissions.includes('event:create'));
  const canView = Boolean(user?.permissions.includes('event:view'));
  const canRecordAttendance = Boolean(user?.permissions.includes('event:attendance:record'));

  const loadEvents = useCallback(async () => {
    if (!canView) return;
    setIsLoading(true); setError(null);
    try { const { data } = await apiClient.get<{ events: EventRecord[] }>('/api/v2/events', { params: { take: 50 } }); setEvents(data.events); }
    catch (requestError) { setError(errorMessage(requestError, 'Events could not be loaded.')); }
    finally { setIsLoading(false); }
  }, [canView]);

  const loadMembers = useCallback(async () => {
    if (!user?.churchId || (!canCreate && !canRecordAttendance)) return;
    try { const { data } = await apiClient.get<{ members: Member[] }>('/api/v2/members', { params: { churchId: user.churchId, take: 100 } }); setMembers(data.members); }
    catch (requestError) { setError(errorMessage(requestError, 'Members could not be loaded.')); }
  }, [canCreate, canRecordAttendance, user?.churchId]);

  useEffect(() => { void loadEvents(); }, [loadEvents]);
  useEffect(() => { void loadMembers(); }, [loadMembers]);

  const createEvent = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setIsSaving(true); setError(null);
    try {
      await apiClient.post('/api/v2/events', { title: form.title.trim(), eventType: form.eventType.trim(), startDateTime: new Date(form.startDateTime).toISOString(), ...(form.endDateTime ? { endDateTime: new Date(form.endDateTime).toISOString() } : {}), ...(form.location.trim() ? { location: form.location.trim() } : {}) });
      setForm({ title: '', eventType: 'SERVICE', startDateTime: '', endDateTime: '', location: '' }); setIsCreateOpen(false); await loadEvents();
    } catch (requestError) { setError(errorMessage(requestError, 'The event could not be scheduled.')); }
    finally { setIsSaving(false); }
  };

  const openAttendance = async (event: EventRecord) => {
    setAttendanceEvent(event); setAttendance([]); setMemberId(''); setError(null);
    try { const { data } = await apiClient.get<Attendance[]>(`/api/v2/events/${event.id}/attendance`); setAttendance(data); }
    catch (requestError) { setError(errorMessage(requestError, 'Attendance could not be loaded.')); }
  };

  const checkIn = async () => {
    if (!attendanceEvent || !memberId) return;
    setIsSaving(true); setError(null);
    try {
      await apiClient.post(`/api/v2/events/${attendanceEvent.id}/attendance`, { memberId, status: 'PRESENT', arrivedAt: new Date().toISOString() });
      await openAttendance(attendanceEvent); await loadEvents();
    } catch (requestError) { setError(errorMessage(requestError, 'Attendance could not be recorded.')); }
    finally { setIsSaving(false); }
  };

  return <MainLayout><div className="mx-auto max-w-7xl space-y-6">
    <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary-600">Ministry calendar</p><h1 className="mt-2 text-3xl font-bold text-gray-900">Events & attendance</h1><p className="mt-2 text-gray-600">Schedule church life and keep a reliable attendance record.</p></div><div className="flex gap-3"><button type="button" disabled={isLoading || !canView} onClick={() => void loadEvents()} className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"><RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} /> Refresh</button>{canCreate && <button type="button" onClick={() => setIsCreateOpen(true)} className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-700"><Plus className="h-4 w-4" /> Schedule event</button>}</div></div>
    {!canView ? <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-amber-900">Your role does not include access to events. Ask an administrator to assign the event permission.</div> : error ? <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-red-800">{error}</div> : <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm"><div className="flex items-center gap-3 border-b border-gray-200 px-5 py-4"><span className="rounded-lg bg-primary-50 p-2 text-primary-700"><CalendarDays className="h-5 w-5" /></span><div><h2 className="font-semibold text-gray-900">Event calendar</h2><p className="text-sm text-gray-500">{events.length} scheduled or recorded event{events.length === 1 ? '' : 's'}</p></div></div>{isLoading ? <div className="p-10 text-center text-gray-500">Loading events…</div> : events.length === 0 ? <div className="p-10 text-center text-gray-500">No events have been scheduled yet.</div> : <div className="overflow-x-auto"><table className="min-w-full divide-y divide-gray-200 text-left"><thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500"><tr><th className="px-5 py-3">Event</th><th className="px-5 py-3">When</th><th className="px-5 py-3">Where</th><th className="px-5 py-3">Attendance</th><th className="px-5 py-3" /></tr></thead><tbody className="divide-y divide-gray-100">{events.map((event) => <tr key={event.id}><td className="px-5 py-4"><p className="font-semibold text-gray-900">{event.title}</p><p className="text-sm text-gray-500">{pretty(event.eventType)} · {pretty(event.status)}</p></td><td className="px-5 py-4 text-sm text-gray-600">{new Date(event.startDateTime).toLocaleString()}</td><td className="px-5 py-4 text-sm text-gray-600">{event.location ?? '—'}</td><td className="px-5 py-4 text-sm text-gray-600">{event._count.attendances} recorded</td><td className="px-5 py-4 text-right">{canRecordAttendance && <button type="button" onClick={() => void openAttendance(event)} className="inline-flex items-center gap-2 rounded-lg border border-primary-200 px-3 py-2 text-sm font-semibold text-primary-700 hover:bg-primary-50"><Users className="h-4 w-4" /> Attendance</button>}</td></tr>)}</tbody></table></div>}</section>}
  </div>
  {isCreateOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"><div className="w-full max-w-xl rounded-xl bg-white shadow-xl"><div className="flex items-center justify-between border-b border-gray-200 px-6 py-4"><h2 className="text-lg font-semibold text-gray-900">Schedule event</h2><button type="button" onClick={() => setIsCreateOpen(false)} className="rounded-lg p-2 hover:bg-gray-100"><X className="h-5 w-5" /></button></div><form onSubmit={createEvent} className="space-y-4 p-6"><label className="block text-sm font-medium text-gray-700">Title<input required minLength={3} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} className="mt-1.5 w-full rounded-lg border border-gray-300 px-3 py-2.5" /></label><div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-medium text-gray-700">Type<input required value={form.eventType} onChange={(event) => setForm({ ...form, eventType: event.target.value })} className="mt-1.5 w-full rounded-lg border border-gray-300 px-3 py-2.5" /></label><label className="text-sm font-medium text-gray-700">Location<input value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })} className="mt-1.5 w-full rounded-lg border border-gray-300 px-3 py-2.5" /></label></div><div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-medium text-gray-700">Starts<input required type="datetime-local" value={form.startDateTime} onChange={(event) => setForm({ ...form, startDateTime: event.target.value })} className="mt-1.5 w-full rounded-lg border border-gray-300 px-3 py-2.5" /></label><label className="text-sm font-medium text-gray-700">Ends <span className="font-normal text-gray-500">(optional)</span><input type="datetime-local" value={form.endDateTime} onChange={(event) => setForm({ ...form, endDateTime: event.target.value })} className="mt-1.5 w-full rounded-lg border border-gray-300 px-3 py-2.5" /></label></div><div className="flex justify-end gap-3"><button type="button" onClick={() => setIsCreateOpen(false)} className="rounded-lg px-4 py-2.5 font-semibold text-gray-700 hover:bg-gray-100">Cancel</button><button type="submit" disabled={isSaving} className="rounded-lg bg-primary-600 px-4 py-2.5 font-semibold text-white disabled:opacity-60">{isSaving ? 'Scheduling…' : 'Schedule event'}</button></div></form></div></div>}
  {attendanceEvent && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"><div className="w-full max-w-2xl rounded-xl bg-white shadow-xl"><div className="flex items-center justify-between border-b border-gray-200 px-6 py-4"><div><h2 className="text-lg font-semibold text-gray-900">Attendance · {attendanceEvent.title}</h2><p className="text-sm text-gray-500">{attendance.length} member{attendance.length === 1 ? '' : 's'} recorded</p></div><button type="button" onClick={() => setAttendanceEvent(null)} className="rounded-lg p-2 hover:bg-gray-100"><X className="h-5 w-5" /></button></div><div className="space-y-4 p-6">{canRecordAttendance && <div className="flex gap-3"><select value={memberId} onChange={(event) => setMemberId(event.target.value)} className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2.5"><option value="">Select a member to check in</option>{members.map((member) => <option key={member.id} value={member.id}>{member.firstName} {member.lastName} · {member.membershipNumber}</option>)}</select><button type="button" disabled={!memberId || isSaving} onClick={() => void checkIn()} className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2.5 font-semibold text-white disabled:opacity-60"><Check className="h-4 w-4" /> Check in</button></div>}<div className="max-h-72 overflow-auto rounded-lg border border-gray-200">{attendance.length === 0 ? <p className="p-5 text-sm text-gray-500">No attendance has been recorded yet.</p> : attendance.map((entry) => <div key={entry.id} className="flex items-center justify-between border-b border-gray-100 px-4 py-3 last:border-0"><span className="font-medium text-gray-900">{entry.member.firstName} {entry.member.lastName}</span><span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">{pretty(entry.status)}</span></div>)}</div></div></div></div>}
  </MainLayout>;
};
