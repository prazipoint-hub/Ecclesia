import { useState } from 'react';
import type { FormEvent } from 'react';
import { FormField } from '@/components/forms/FormField';
import { FormSelect } from '@/components/forms/FormSelect';
import { FormTextarea } from '@/components/forms/FormTextarea';
import { primaryBtn, secondaryBtn } from '@/pages/account/shared';
import { FORMATS, SCHEDULES, isEmail, recipientList } from '@/types/reports';
import type { ReportFormat, Schedule } from '@/types/reports';
import { ApiError, label } from './reportsShared';

export interface SaveValues {
  name: string;
  description?: string;
  visibility: 'PRIVATE' | 'CHURCH';
  schedule: Schedule;
  recipients: string[];
  format: ReportFormat;
}

interface Initial {
  name?: string;
  description?: string | null;
  visibility?: 'PRIVATE' | 'CHURCH';
  schedule?: Schedule;
  recipients?: string[] | null;
  format?: ReportFormat;
}

/** Shared by "save this report" in the builder and "edit" on the saved list. */
export const SaveReportForm = ({ initial, busy, error, submitLabel = 'Save report', onSubmit, onCancel }: {
  initial: Initial;
  busy: boolean;
  error: unknown;
  submitLabel?: string;
  onSubmit: (values: SaveValues) => void;
  onCancel: () => void;
}) => {
  const [name, setName] = useState(initial.name ?? '');
  const [description, setDescription] = useState(initial.description ?? '');
  const [visibility, setVisibility] = useState<'PRIVATE' | 'CHURCH'>(initial.visibility ?? 'PRIVATE');
  const [schedule, setSchedule] = useState<Schedule>(initial.schedule ?? 'NONE');
  const [recipientText, setRecipientText] = useState((initial.recipients ?? []).join(', '));
  const [format, setFormat] = useState<ReportFormat>(initial.format ?? 'PDF');
  const [problems, setProblems] = useState<{ name?: string; recipients?: string; format?: string }>({});

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const recipients = recipientList(recipientText);
    const next: typeof problems = {};
    if (name.trim().length < 2) next.name = 'Give the report a name (at least 2 characters).';
    const bad = recipients.filter((r) => !isEmail(r));
    if (bad.length) next.recipients = `These are not email addresses: ${bad.join(', ')}`;
    else if (schedule !== 'NONE' && recipients.length === 0) next.recipients = 'A scheduled report needs at least one recipient.';
    if (schedule !== 'NONE' && format === 'JSON') next.format = 'Scheduled reports are sent as PDF, CSV or XLSX.';
    setProblems(next);
    if (Object.keys(next).length) return;
    onSubmit({ name: name.trim(), description: description.trim() || undefined, visibility, schedule, recipients, format });
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <FormField label="Name" value={name} onChange={(e) => setName(e.target.value)} error={problems.name} />
      <FormTextarea label="Description" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
      <div className="grid gap-3 sm:grid-cols-3">
        <FormSelect label="Who can see it" value={visibility} options={[{ value: 'PRIVATE', label: 'Only me' }, { value: 'CHURCH', label: 'Everyone who may run it' }]} onChange={(e) => setVisibility(e.target.value as 'PRIVATE' | 'CHURCH')} />
        <FormSelect label="Format" value={format} options={FORMATS.map((f) => ({ value: f, label: f }))} error={problems.format} onChange={(e) => setFormat(e.target.value as ReportFormat)} />
        <FormSelect label="Send on a schedule" value={schedule} options={SCHEDULES.map((s) => ({ value: s, label: s === 'NONE' ? 'Not scheduled' : label(s) }))} onChange={(e) => setSchedule(e.target.value as Schedule)} />
      </div>
      <FormField
        label="Recipients (emails, comma separated)"
        value={recipientText}
        onChange={(e) => setRecipientText(e.target.value)}
        hint="Must be users of this church who are allowed to see this report. They are checked again each time it is sent."
        error={problems.recipients}
      />
      <ApiError error={error} />
      <div className="flex justify-end gap-2">
        <button type="button" className={secondaryBtn} onClick={onCancel}>Cancel</button>
        <button type="submit" className={primaryBtn} disabled={busy}>{submitLabel}</button>
      </div>
    </form>
  );
};
