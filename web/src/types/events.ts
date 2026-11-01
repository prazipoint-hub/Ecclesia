export interface Paged<T> { items: T[]; total: number }
export interface PersonRef { id: string; firstName: string; lastName: string; membershipNumber?: string | null }

export interface UpcomingEvent {
  id: string; title: string; description: string | null; eventType: string; startDateTime: string; endDateTime: string | null; location: string | null;
  capacity: number | null; registrationRequired: boolean; registered: number; spotsLeft: number | null; registeredByMe: boolean;
}

export interface QrCode { token: string; expiresAt: string; dataUrl: string }

export interface CheckInResult {
  alreadyCheckedIn: boolean; checkedInAt: string; method: string; member: PersonRef; event: { id: string; title: string; endsAt: string };
}
export interface CheckInRow { id: string; method: string; checkedInAt: string; member: PersonRef }

export interface Registration {
  id: string; eventId: string; memberId: string | null; name: string; email: string | null; phone: string | null; status: string; createdAt: string; member?: PersonRef | null;
}

export type VolunteerStatus = 'ASSIGNED' | 'CONFIRMED' | 'DECLINED' | 'COMPLETED' | 'NO_SHOW' | 'CANCELLED';
export const FINAL_VOLUNTEER_STATES: VolunteerStatus[] = ['COMPLETED', 'NO_SHOW', 'CANCELLED'];
export interface Volunteer {
  id: string; eventId: string; memberId: string; role: string; status: VolunteerStatus; notes: string | null;
  member?: PersonRef; event: { id: string; title: string; startDateTime: string };
}

export interface AnalyticsEventRow {
  id: string; title: string; eventType: string; startDateTime: string; present: number; registered: number; expected: number | null; attendanceRate: number | null;
}
export interface Analytics {
  period: { from: string; to: string }; totalEvents: number; totalPresent: number; averagePerEvent: number; uniqueAttendees: number;
  byType: Array<{ eventType: string; events: number; present: number; average: number }>;
  byMonth: Array<{ month: string; events: number; present: number; average: number }>;
  checkInMethods: Record<string, number>; events: AnalyticsEventRow[]; truncated: boolean;
}

export interface Absence {
  id: string; memberId: string; consecutiveAbsences: number; eventType: string; status: 'OPEN' | 'CONTACTED' | 'RESOLVED' | 'DISMISSED';
  assignedTo: string | null; notes: string | null; detectedAt: string; member?: PersonRef;
}
export interface DetectResult { created: number; candidates: PersonRef[]; eventsConsidered: number; message?: string }

/** Statuses an absence follow-up may move to next, mirroring the server workflow. */
export const nextAbsenceStatuses = (status: Absence['status']): Array<'CONTACTED' | 'RESOLVED' | 'DISMISSED'> =>
  status === 'OPEN' ? ['CONTACTED', 'RESOLVED', 'DISMISSED'] : status === 'CONTACTED' ? ['RESOLVED', 'DISMISSED'] : [];
