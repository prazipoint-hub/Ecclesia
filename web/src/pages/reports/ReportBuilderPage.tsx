import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FormField } from '@/components/forms/FormField';
import { FormSelect } from '@/components/forms/FormSelect';
import { Modal } from '@/components/forms/Modal';
import { ErrorBlock, LoadingBlock, card, primaryBtn, secondaryBtn } from '@/pages/account/shared';
import { useSections } from '@/pages/members/useSections';
import { ErrorNotice } from '@/pages/auth/AuthShell';
import { FORMATS, PERIODS } from '@/types/reports';
import type { CatalogEntry, ReportFormat, ReportParams, RunOutcome } from '@/types/reports';
import { apiClient } from '@/utils/api';
import { ApiError, JsonPreview, R, Shell, label, runReport } from './reportsShared';
import { SaveReportForm } from './SaveReportForm';
import type { SaveValues } from './SaveReportForm';

const MEMBER_FILTER = ['MEMBERSHIP_SUMMARY', 'MEMBERSHIP_DETAIL'];

export const ReportBuilderPage = () => {
  const [search] = useSearchParams();
  const queryClient = useQueryClient();
  const catalog = useQuery({ queryKey: ['reports', 'catalog'], queryFn: async () => (await apiClient.get<CatalogEntry[]>(`${R}/catalog`)).data });
  const sections = useSections();

  const [type, setType] = useState(search.get('type') ?? '');
  const [period, setPeriod] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [format, setFormat] = useState<ReportFormat>('PDF');
  const [filters, setFilters] = useState({ sectionId: '', organizationId: '', membershipStatus: '', eventType: '', entityType: '', entityId: '', action: '' });
  const [problem, setProblem] = useState('');
  const [saving, setSaving] = useState(false);
  const [outcome, setOutcome] = useState<RunOutcome | null>(null);

  const allowed = (catalog.data ?? []).filter((e) => e.allowed);
  const entry = allowed.find((e) => e.type === type);
  const category = entry?.category;

  // A rolling period and fixed dates are two ways to say the same thing, so choosing one clears the other.
  const pickPeriod = (value: string) => { setPeriod(value); if (value) { setStartDate(''); setEndDate(''); } };
  const pickDate = (which: 'start' | 'end', value: string) => {
    if (which === 'start') setStartDate(value); else setEndDate(value);
    if (value) setPeriod('');
  };

  const parameters = (): ReportParams => {
    const params: ReportParams = {};
    if (period) params.period = period as ReportParams['period'];
    else {
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;
    }
    const add = (key: keyof typeof filters, applies: boolean) => { if (applies && filters[key].trim()) (params as Record<string, string>)[key] = filters[key].trim(); };
    add('sectionId', category === 'FINANCIAL' || category === 'MEMBERSHIP' || category === 'ATTENDANCE');
    add('organizationId', category === 'FINANCIAL' || category === 'MEMBERSHIP');
    add('membershipStatus', MEMBER_FILTER.includes(type));
    add('eventType', type === 'ATTENDANCE_ANALYTICS');
    const audit = category === 'AUDIT';
    add('entityType', audit); add('entityId', audit); add('action', audit);
    return params;
  };

  const validate = (): string => {
    if (!entry) return 'Choose a report.';
    if (entry.needsDates) {
      if (!period && !(startDate && endDate)) return 'This report needs a period: pick a preset, or enter both a start and an end date.';
    }
    if ((startDate && !endDate) || (!startDate && endDate)) return 'Enter both a start and an end date, or neither.';
    if (startDate && endDate && startDate > endDate) return 'The start date must be before the end date.';
    return '';
  };

  const run = useMutation({
    mutationFn: () => runReport('post', `${R}/run`, { reportType: type, parameters: parameters(), format }),
    onSuccess: (result) => { setOutcome(result); void queryClient.invalidateQueries({ queryKey: ['reports', 'executions'] }); },
  });
  const save = useMutation({
    mutationFn: async (values: SaveValues) => (await apiClient.post(`${R}/saved`, { ...values, reportType: type, parameters: parameters() })).data,
    onSuccess: () => { setSaving(false); void queryClient.invalidateQueries({ queryKey: ['reports', 'saved'] }); },
  });

  const guard = (action: () => void) => {
    const message = validate();
    setProblem(message);
    if (!message) action();
  };

  if (catalog.isLoading) return <Shell title="Build a report"><LoadingBlock /></Shell>;
  if (catalog.error) return <Shell title="Build a report"><ErrorBlock error={catalog.error} onRetry={() => void catalog.refetch()} /></Shell>;

  const setFilter = (key: keyof typeof filters, value: string) => setFilters({ ...filters, [key]: value });

  return (
    <Shell title="Build a report" subtitle="Pick a report and a period, then run it or save it.">
      <section className={`${card} space-y-4`}>
        <FormSelect label="Report" value={type} placeholder="Choose a report" options={allowed.map((e) => ({ value: e.type, label: e.label }))} onChange={(e) => { setType(e.target.value); setProblem(''); setOutcome(null); }} />

        {entry && (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <FormSelect label="Period" value={period} placeholder="Custom dates" options={PERIODS.map((p) => ({ value: p, label: label(p) }))} onChange={(e) => pickPeriod(e.target.value)} />
              <FormField label="From" type="date" value={startDate} onChange={(e) => pickDate('start', e.target.value)} />
              <FormField label="To" type="date" value={endDate} onChange={(e) => pickDate('end', e.target.value)} />
            </div>
            <p className="text-xs text-gray-500">{entry.needsDates ? 'This report needs a period.' : 'A period is optional for this report.'} A preset and custom dates cannot be combined.</p>

            <div className="grid gap-3 sm:grid-cols-2">
              {(category === 'FINANCIAL' || category === 'MEMBERSHIP' || category === 'ATTENDANCE') && (
                (sections.data?.length ?? 0) > 0
                  ? <FormSelect label="Section (optional)" value={filters.sectionId} placeholder="Whole church" options={sections.data!.map((s) => ({ value: s.id, label: s.name }))} onChange={(e) => setFilter('sectionId', e.target.value)} />
                  : <FormField label="Section ID (optional)" value={filters.sectionId} onChange={(e) => setFilter('sectionId', e.target.value)} />
              )}
              {(category === 'FINANCIAL' || category === 'MEMBERSHIP') && <FormField label="Organization ID (optional)" value={filters.organizationId} onChange={(e) => setFilter('organizationId', e.target.value)} />}
              {MEMBER_FILTER.includes(type) && <FormSelect label="Membership status (optional)" value={filters.membershipStatus} placeholder="Any" options={['ACTIVE', 'INACTIVE', 'TRANSFERRED', 'DECEASED'].map((s) => ({ value: s, label: label(s) }))} onChange={(e) => setFilter('membershipStatus', e.target.value)} />}
              {type === 'ATTENDANCE_ANALYTICS' && <FormField label="Event type (optional)" value={filters.eventType} onChange={(e) => setFilter('eventType', e.target.value.toUpperCase())} />}
              {category === 'AUDIT' && (
                <>
                  <FormField label="Entity type (optional)" value={filters.entityType} onChange={(e) => setFilter('entityType', e.target.value)} />
                  <FormField label="Entity ID (optional)" value={filters.entityId} onChange={(e) => setFilter('entityId', e.target.value)} />
                  <FormField label="Action (optional)" value={filters.action} onChange={(e) => setFilter('action', e.target.value)} />
                </>
              )}
            </div>

            <FormSelect label="Format" value={format} options={FORMATS.map((f) => ({ value: f, label: f === 'JSON' ? 'JSON (preview on screen)' : f }))} onChange={(e) => setFormat(e.target.value as ReportFormat)} className="max-w-xs" />

            {problem && <ErrorNotice message={problem} />}
            <ApiError error={run.error} />
            <div className="flex flex-wrap gap-2">
              <button type="button" className={primaryBtn} disabled={run.isPending} onClick={() => guard(() => { setOutcome(null); run.mutate(); })}>{run.isPending ? 'Running…' : 'Run'}</button>
              <button type="button" className={secondaryBtn} onClick={() => guard(() => { save.reset(); setSaving(true); })}>Save this report</button>
            </div>
          </>
        )}
      </section>

      {outcome?.kind === 'file' && <p role="status" className="text-sm text-green-700">Downloaded {outcome.filename}.</p>}
      {outcome?.kind === 'json' && (
        <section className={`${card} space-y-2`}>
          <h2 className="font-medium text-gray-900">{outcome.filename}</h2>
          <JsonPreview data={outcome.data} />
        </section>
      )}
      {save.isSuccess && <p role="status" className="text-sm text-green-700">Report saved. Find it under Saved reports.</p>}

      <Modal open={saving} title="Save this report" onClose={() => setSaving(false)}>
        <SaveReportForm initial={{ name: entry?.label, format }} busy={save.isPending} error={save.error} onSubmit={(values) => save.mutate(values)} onCancel={() => setSaving(false)} />
      </Modal>
    </Shell>
  );
};
