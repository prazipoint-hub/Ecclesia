import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import type { ReactNode } from 'react';
import { EmptyBlock, ErrorBlock, LoadingBlock, card, formatDate } from '@/pages/account/shared';
import { apiClient } from '@/utils/api';
import type { CareProfile } from '@/types/pastoral';
import { P, Shell, Tag, label, memberName } from './pastoralShared';

const Section = ({ title, items, render }: { title: string; items: unknown[] | null | undefined; render: (item: never) => ReactNode }) => {
  if (items === null || items === undefined) return null; // null means the viewer has no access to this section
  return (
    <section className={card}>
      <h2 className="mb-3 text-lg font-medium">{title}</h2>
      {items.length === 0 ? <EmptyBlock message="Nothing recorded." /> : <ul className="divide-y divide-gray-100 text-sm">{items.map((item, i) => <li key={i} className="py-2">{render(item as never)}</li>)}</ul>}
    </section>
  );
};

export const MemberCareProfilePage = () => {
  const { memberId = '' } = useParams();
  const profile = useQuery({ queryKey: ['pastoral', 'profile', memberId], queryFn: async () => (await apiClient.get<CareProfile>(`${P}/members/${memberId}/care-profile`)).data });
  const p = profile.data;
  const sacraments = p ? [p.sacraments.baptism && { kind: 'Baptism', status: p.sacraments.baptism.status }, p.sacraments.confirmation && { kind: 'Confirmation', status: p.sacraments.confirmation.status }].filter(Boolean) as Array<{ kind: string; status: string }> : [];
  return (
    <Shell title={p ? memberName(p.member) : 'Care profile'} subtitle="Everything you are allowed to see about this member's pastoral care." permission="pastoral:case:view">
      {profile.isLoading ? <LoadingBlock /> : profile.error ? <ErrorBlock error={profile.error} onRetry={() => void profile.refetch()} /> : p && (
        <div className="space-y-4">
          <Section title="Sacraments" items={sacraments} render={((s: { kind: string; status: string }) => <>{s.kind}: <Tag value={s.status} /></>) as never} />
          <Section title="Cases" items={p.cases} render={((c: CareProfile['cases'][number]) => <>{label(c.category)} — {c.concern} <Tag value={c.priority} /> <Tag value={c.status} /></>) as never} />
          <Section title="Visits" items={p.visits} render={((v: NonNullable<CareProfile['visits']>[number]) => <>{formatDate(v.visitDate)} · {label(v.visitType)} · {label(v.outcome)}</>) as never} />
          <Section title="Counseling" items={p.counseling} render={((c: NonNullable<CareProfile['counseling']>[number]) => <>{formatDate(c.sessionDate)} · {label(c.counselingType)} · {label(c.outcome)}{c.hasConfidentialContent && <span className="ml-2 text-xs text-amber-700">Has confidential notes</span>}</>) as never} />
          <Section title="Referrals" items={p.referrals} render={((r: NonNullable<CareProfile['referrals']>[number]) => <>{r.providerName} · <Tag value={r.status} /></>) as never} />
          <Section title="Follow-ups" items={p.followUps} render={((f: NonNullable<CareProfile['followUps']>[number]) => <>{formatDate(f.dueDate)} — {f.reason} <Tag value={f.effectiveStatus} /></>) as never} />
          <Section title="Latest assessments" items={p.assessments} render={((a: NonNullable<CareProfile['assessments']>[number]) => <>{formatDate(a.assessedAt)} · {label(a.spiritual)} / {label(a.social)} / {label(a.emotional)} / {label(a.economic)} / {label(a.physical)}</>) as never} />
          <Section title="Prayer requests" items={p.prayer} render={((r: NonNullable<CareProfile['prayer']>[number]) => <>{r.request} <Tag value={r.status} /></>) as never} />
          <Section title="Life events" items={p.lifeEvents} render={((e: CareProfile['lifeEvents'][number]) => <>{formatDate(e.eventDate)} · {label(e.eventType)} — {e.description}</>) as never} />
        </div>
      )}
    </Shell>
  );
};
