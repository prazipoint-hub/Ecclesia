import { FormEvent, useCallback, useEffect, useState } from 'react';
import { CalendarDays, Check, Plus, RefreshCw, Users } from 'lucide-react';
import { MainLayout } from '@/components/Layout/MainLayout';
import { FormField } from '@/components/forms/FormField';
import { Modal } from '@/components/forms/Modal';
import { EmptyBlock, LoadingBlock, primaryBtn, secondaryBtn } from '@/pages/account/shared';
import { ErrorNotice } from '@/pages/auth/AuthShell';
import { useAuthStore } from '@/stores/authStore';
import { apiClient } from '@/utils/api';
import { Link } from 'react-router-dom';
import { EventsNav } from '@/pages/events/eventsShared';

interface EventRecord {
  capacity?: number | null;
  registrationRequired?: boolean;
  id: string;
  title: string;
  eventType: string;
  startDateTime: string;
  endDateTime?: string;
  location?: string;
  status: string;
  _count: { attendances: number };
}
interface Member {
  id: string;
  firstName: string;
  lastName: string;
  membershipNumber: string;
}
interface Attendance {
  id: string;
  status: string;
  member: Member;
}

const errorMessage = (error: unknown, fallback: string) =>
  typeof error === 'object' && error && 'response' in error
    ? ((error as { response?: { data?: { error?: string } } }).response?.data?.error ?? fallback)
    : fallback;
const pretty = (value: string) =>
  value
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (part: string) => part.toUpperCase());

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
  const [form, setForm] = useState({
    title: '',
    eventType: 'SERVICE',
    startDateTime: '',
    endDateTime: '',
    location: '',
    capacity: '',
    registrationRequired: false,
  });
  const canCreate = Boolean(user?.permissions.includes('event:create'));
  const canView = Boolean(user?.permissions.includes('event:view'));
  const canRecordAttendance = Boolean(user?.permissions.includes('event:attendance:record'));

  const loadEvents = useCallback(async () => {
    if (!canView) return;
    setIsLoading(true);
    setError(null);
    try {
      const { data } = await apiClient.get<{ events: EventRecord[] }>('/api/v2/events', {
        params: { take: 50 },
      });
      setEvents(data.events);
    } catch (requestError) {
      setError(errorMessage(requestError, 'Events could not be loaded.'));
    } finally {
      setIsLoading(false);
    }
  }, [canView]);

  const loadMembers = useCallback(async () => {
    if (!user?.churchId || (!canCreate && !canRecordAttendance)) return;
    try {
      const { data } = await apiClient.get<{ members: Member[] }>('/api/v2/members', {
        params: { churchId: user.churchId, take: 100 },
      });
      setMembers(data.members);
    } catch (requestError) {
      setError(errorMessage(requestError, 'Members could not be loaded.'));
    }
  }, [canCreate, canRecordAttendance, user?.churchId]);

  useEffect(() => {
    void loadEvents();
  }, [loadEvents]);
  useEffect(() => {
    void loadMembers();
  }, [loadMembers]);

  const createEvent = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSaving(true);
    setError(null);
    try {
      await apiClient.post('/api/v2/events', {
        title: form.title.trim(),
        eventType: form.eventType.trim(),
        startDateTime: new Date(form.startDateTime).toISOString(),
        ...(form.endDateTime ? { endDateTime: new Date(form.endDateTime).toISOString() } : {}),
        ...(form.location.trim() ? { location: form.location.trim() } : {}),
        ...(form.capacity ? { capacity: Number(form.capacity) } : {}),
        ...(form.registrationRequired ? { registrationRequired: true } : {}),
      });
      setForm({
        title: '',
        eventType: 'SERVICE',
        startDateTime: '',
        endDateTime: '',
        location: '',
        capacity: '',
        registrationRequired: false,
      });
      setIsCreateOpen(false);
      await loadEvents();
    } catch (requestError) {
      setError(errorMessage(requestError, 'The event could not be scheduled.'));
    } finally {
      setIsSaving(false);
    }
  };

  const openAttendance = async (event: EventRecord) => {
    setAttendanceEvent(event);
    setAttendance([]);
    setMemberId('');
    setError(null);
    try {
      const { data } = await apiClient.get<Attendance[]>(`/api/v2/events/${event.id}/attendance`);
      setAttendance(data);
    } catch (requestError) {
      setError(errorMessage(requestError, 'Attendance could not be loaded.'));
    }
  };

  const checkIn = async () => {
    if (!attendanceEvent || !memberId) return;
    setIsSaving(true);
    setError(null);
    try {
      await apiClient.post(`/api/v2/events/${attendanceEvent.id}/attendance`, {
        memberId,
        status: 'PRESENT',
        arrivedAt: new Date().toISOString(),
      });
      await openAttendance(attendanceEvent);
      await loadEvents();
    } catch (requestError) {
      setError(errorMessage(requestError, 'Attendance could not be recorded.'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <MainLayout>
      <div className="mx-auto max-w-7xl space-y-7">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="page-eyebrow">Ministry calendar</p>
            <h1 className="mt-2 text-2xl font-medium text-gray-950 sm:text-2xl">
              Events & attendance
            </h1>
            <p className="mt-2 max-w-2xl text-gray-600">
              Schedule church life and keep a reliable attendance record.
            </p>
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              disabled={isLoading || !canView}
              onClick={() => void loadEvents()}
              className={secondaryBtn}
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} /> Refresh
            </button>
            {canCreate && (
              <button type="button" onClick={() => setIsCreateOpen(true)} className={primaryBtn}>
                <Plus className="h-4 w-4" /> Schedule event
              </button>
            )}
          </div>
        </div>
        <EventsNav />
        {!canView ? (
          <div
            role="alert"
            className="rounded-lg border border-amber-200 bg-amber-50 p-5 text-amber-900 shadow-sm"
          >
            Your role does not include access to events. Ask an administrator to assign the event
            permission.
          </div>
        ) : error ? (
          <ErrorNotice message={error} />
        ) : (
          <section className="overflow-hidden rounded-lg border border-gray-200/80 bg-white shadow-card">
            <div className="flex items-center gap-3 border-b border-gray-100 px-5 py-4 sm:px-6">
              <span className="rounded-md bg-primary-50 p-2.5 text-primary-700">
                <CalendarDays className="h-5 w-5" />
              </span>
              <div>
                <h2 className="font-medium text-gray-900">Event calendar</h2>
                <p className="text-sm text-gray-500">
                  {events.length} scheduled or recorded event{events.length === 1 ? '' : 's'}
                </p>
              </div>
            </div>
            {isLoading ? (
              <div className="p-5">
                <LoadingBlock label="Loading events…" />
              </div>
            ) : events.length === 0 ? (
              <div className="p-5">
                <EmptyBlock message="No events have been scheduled yet." />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-left">
                  <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                    <tr>
                      <th className="px-5 py-3">Event</th>
                      <th className="px-5 py-3">When</th>
                      <th className="px-5 py-3">Where</th>
                      <th className="px-5 py-3">Attendance</th>
                      <th className="px-5 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {events.map((event) => (
                      <tr key={event.id}>
                        <td className="px-5 py-4">
                          <p className="font-medium text-gray-900">{event.title}</p>
                          <p className="text-sm text-gray-500">
                            {pretty(event.eventType)} · {pretty(event.status)}
                          </p>
                        </td>
                        <td className="px-5 py-4 text-sm text-gray-600">
                          {new Date(event.startDateTime).toLocaleString()}
                        </td>
                        <td className="px-5 py-4 text-sm text-gray-600">{event.location ?? '—'}</td>
                        <td className="px-5 py-4 text-sm text-gray-600">
                          {event._count.attendances} recorded
                        </td>
                        <td className="px-5 py-4 text-right">
                          <span className="inline-flex flex-wrap justify-end gap-2">
                            {user?.permissions.includes('event:checkin:manage') && (
                              <Link to={`/events/${event.id}/checkin`} className={secondaryBtn}>
                                Check-in
                              </Link>
                            )}
                            {user?.permissions.includes('event:registration:manage') && (
                              <Link
                                to={`/events/${event.id}/registrations`}
                                className={secondaryBtn}
                              >
                                Registrations
                              </Link>
                            )}
                            {canRecordAttendance && (
                              <button
                                type="button"
                                onClick={() => void openAttendance(event)}
                                className={secondaryBtn}
                              >
                                <Users className="h-4 w-4" /> Attendance
                              </button>
                            )}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}
      </div>
      <Modal
        open={isCreateOpen}
        title="Schedule event"
        onClose={() => setIsCreateOpen(false)}
        footer={
          <>
            <button
              type="button"
              onClick={() => setIsCreateOpen(false)}
              className={secondaryBtn}
              disabled={isSaving}
            >
              Cancel
            </button>
            <button
              type="submit"
              form="schedule-event-form"
              disabled={isSaving}
              className={primaryBtn}
            >
              {isSaving ? 'Scheduling…' : 'Schedule event'}
            </button>
          </>
        }
      >
        <form id="schedule-event-form" onSubmit={createEvent} className="space-y-4">
          <FormField
            label="Title"
            required
            minLength={3}
            value={form.title}
            onChange={(event) => setForm({ ...form, title: event.target.value })}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              label="Type"
              required
              value={form.eventType}
              onChange={(event) => setForm({ ...form, eventType: event.target.value })}
            />
            <FormField
              label="Location (optional)"
              value={form.location}
              onChange={(event) => setForm({ ...form, location: event.target.value })}
            />
            <FormField
              label="Starts"
              required
              type="datetime-local"
              value={form.startDateTime}
              onChange={(event) => setForm({ ...form, startDateTime: event.target.value })}
            />
            <FormField
              label="Ends (optional)"
              type="datetime-local"
              value={form.endDateTime}
              onChange={(event) => setForm({ ...form, endDateTime: event.target.value })}
            />
            <FormField
              label="Capacity (optional)"
              type="number"
              inputMode="numeric"
              min={1}
              value={form.capacity}
              onChange={(event) => setForm({ ...form, capacity: event.target.value })}
            />
          </div>
          <label className="flex h-9 items-center gap-3 rounded-md border border-gray-200 bg-gray-50 px-4 text-sm font-medium text-gray-700">
            <input
              type="checkbox"
              checked={form.registrationRequired}
              onChange={(event) => setForm({ ...form, registrationRequired: event.target.checked })}
            />{' '}
            Registration required
          </label>
        </form>
      </Modal>
      <Modal
        open={attendanceEvent !== null}
        title={`Attendance · ${attendanceEvent?.title ?? ''}`}
        onClose={() => setAttendanceEvent(null)}
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-500">
            {attendance.length} member{attendance.length === 1 ? '' : 's'} recorded
          </p>
          {canRecordAttendance && (
            <div className="flex flex-col gap-3 sm:flex-row">
              <label className="sr-only" htmlFor="attendance-member">
                Select a member to check in
              </label>
              <select
                id="attendance-member"
                value={memberId}
                onChange={(event) => setMemberId(event.target.value)}
                className="min-w-0 flex-1"
              >
                <option value="">Select a member to check in</option>
                {members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.firstName} {member.lastName} · {member.membershipNumber}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={!memberId || isSaving}
                onClick={() => void checkIn()}
                className={primaryBtn}
              >
                <Check className="h-4 w-4" /> Check in
              </button>
            </div>
          )}
          <div className="max-h-72 overflow-auto rounded-md border border-gray-200">
            {attendance.length === 0 ? (
              <p className="p-5 text-sm text-gray-500">No attendance has been recorded yet.</p>
            ) : (
              attendance.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center justify-between border-b border-gray-100 px-4 py-3 last:border-0"
                >
                  <span className="font-medium text-gray-900">
                    {entry.member.firstName} {entry.member.lastName}
                  </span>
                  <span className="rounded-full bg-green-100 px-2.5 py-1 text-xs font-medium text-green-800">
                    {pretty(entry.status)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </Modal>
    </MainLayout>
  );
};
