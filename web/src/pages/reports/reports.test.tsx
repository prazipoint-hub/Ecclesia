import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { apiClient } from '@/utils/api';
import { renderAt, signIn } from '@/test/peopleTestUtils';
import { useAuthStore } from '@stores/authStore';
import { ReportsPage } from '@/pages/ReportsPage';
import { ChurchDashboardPage } from './ChurchDashboardPage';
import { ReportBuilderPage } from './ReportBuilderPage';
import { SavedReportsPage } from './SavedReportsPage';
import { SaveReportForm } from './SaveReportForm';

vi.mock('@/utils/api', () => ({ apiClient: { get: vi.fn(), put: vi.fn(), post: vi.fn(), delete: vi.fn() } }));
vi.mock('@/components/Layout/MainLayout', () => ({ MainLayout: ({ children }: { children: ReactNode }) => <div>{children}</div> }));

const get = vi.mocked(apiClient.get);
const post = vi.mocked(apiClient.post);

const routeGets = (map: Record<string, unknown>) =>
  get.mockImplementation((url: string) => {
    const key = Object.keys(map).sort((a, b) => b.length - a.length).find((k) => url.startsWith(k));
    return key ? Promise.resolve({ data: map[key] }) : Promise.reject(new Error(`unmocked ${url}`));
  });

beforeEach(() => {
  get.mockReset();
  post.mockReset();
  useAuthStore.setState({ user: null });
});

const entry = (over: Record<string, unknown>) => ({ type: 'MEMBER_DIRECTORY', category: 'MEMBERSHIP', label: 'Member directory', permission: 'member:view', needsDates: false, allowed: true, ...over });

describe('report catalog', () => {
  test('disables reports the user may not run and says which permission is missing', async () => {
    signIn([]);
    routeGets({ '/api/v2/reports/catalog': [entry({}), entry({ type: 'AUDIT_TRAIL', category: 'AUDIT', label: 'Audit trail', permission: 'audit:view', allowed: false })] });
    renderAt('/reports', '/reports', <ReportsPage />);
    await screen.findByRole('heading', { name: 'Member directory' });
    const audit = screen.getByRole('heading', { name: 'Audit trail' }).closest('article')!;
    expect(within(audit).getByRole('button', { name: 'Build / run' })).toBeDisabled();
    expect(within(audit).getByText('audit:view')).toBeInTheDocument();
    const dir = screen.getByRole('heading', { name: 'Member directory' }).closest('article')!;
    expect(within(dir).getByRole('link', { name: 'Build / run' })).toHaveAttribute('href', '/reports/build?type=MEMBER_DIRECTORY');
  });
});

describe('report builder', () => {
  const open = async (type: string) => {
    signIn([]);
    routeGets({ '/api/v2/reports/catalog': [entry({}), entry({ type: 'FINANCIAL_SUMMARY', category: 'FINANCIAL', label: 'Financial summary', needsDates: true })] });
    renderAt('/reports/build', `/reports/build?type=${type}`, <ReportBuilderPage />);
    await screen.findByLabelText('Period');
  };

  test('a report that needs dates will not run without a period or both dates', async () => {
    await open('FINANCIAL_SUMMARY');
    await userEvent.click(screen.getByRole('button', { name: 'Run' }));
    expect(await screen.findByText(/needs a period: pick a preset/)).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
    await userEvent.type(screen.getByLabelText('From'), '2030-01-01');
    await userEvent.click(screen.getByRole('button', { name: 'Run' }));
    expect(await screen.findByText(/needs a period: pick a preset/)).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });

  test('choosing a period clears custom dates and typing a date clears the period', async () => {
    await open('FINANCIAL_SUMMARY');
    await userEvent.type(screen.getByLabelText('From'), '2030-01-01');
    await userEvent.type(screen.getByLabelText('To'), '2030-02-01');
    await userEvent.selectOptions(screen.getByLabelText('Period'), 'LAST_30_DAYS');
    expect(screen.getByLabelText('From')).toHaveValue('');
    expect(screen.getByLabelText('To')).toHaveValue('');
    await userEvent.type(screen.getByLabelText('From'), '2030-03-01');
    expect(screen.getByLabelText('Period')).toHaveValue('');
  });
});

describe('save form', () => {
  const setup = () => {
    const onSubmit = vi.fn();
    renderAt('/x', '/x', <SaveReportForm initial={{ name: 'Weekly' }} busy={false} error={null} onSubmit={onSubmit} onCancel={() => undefined} />);
    return onSubmit;
  };

  test('a scheduled report needs a recipient', async () => {
    const onSubmit = setup();
    await userEvent.selectOptions(screen.getByLabelText('Send on a schedule'), 'WEEKLY');
    await userEvent.click(screen.getByRole('button', { name: 'Save report' }));
    expect(await screen.findByText('A scheduled report needs at least one recipient.')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
    await userEvent.type(screen.getByLabelText(/Recipients/), 'pastor@church.org');
    await userEvent.click(screen.getByRole('button', { name: 'Save report' }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ schedule: 'WEEKLY', recipients: ['pastor@church.org'] }));
  });

  test('a scheduled report cannot be JSON', async () => {
    const onSubmit = setup();
    await userEvent.selectOptions(screen.getByLabelText('Format'), 'JSON');
    await userEvent.selectOptions(screen.getByLabelText('Send on a schedule'), 'DAILY');
    await userEvent.type(screen.getByLabelText(/Recipients/), 'a@b.co');
    await userEvent.click(screen.getByRole('button', { name: 'Save report' }));
    expect(await screen.findByText('Scheduled reports are sent as PDF, CSV or XLSX.')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe('saved reports', () => {
  const saved = (over: Record<string, unknown>) => ({
    id: 's1', createdBy: 'u1', name: 'Mine', description: null, reportType: 'MEMBER_DIRECTORY', parameters: {}, format: 'PDF', visibility: 'CHURCH',
    schedule: 'WEEKLY', recipients: ['a@b.co'], nextRunAt: null, lastRunAt: null, isActive: true, failureCount: 0, ...over,
  });

  test('only the owner sees edit and delete, and a paused schedule says so', async () => {
    signIn([]);
    routeGets({
      '/api/v2/reports/saved': [saved({}), saved({ id: 's2', name: 'Theirs', createdBy: 'other', isActive: false })],
      '/api/v2/reports/executions': { items: [], total: 0 },
    });
    renderAt('/reports/saved', '/reports/saved', <SavedReportsPage />);
    await screen.findByText('Mine');
    await screen.findByText('Theirs');
    expect(screen.getAllByRole('button', { name: 'Edit' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Delete' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Run now' })).toHaveLength(2);
    expect(screen.getByText('Paused: the schedule is not running.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Run due schedules now' })).not.toBeInTheDocument();
  });

  test('managers can change anyone’s report and run due schedules', async () => {
    signIn(['report:saved:manage_all', 'report:schedule:run']);
    routeGets({ '/api/v2/reports/saved': [saved({ createdBy: 'other' })], '/api/v2/reports/executions': { items: [], total: 0 } });
    renderAt('/reports/saved', '/reports/saved', <SavedReportsPage />);
    await screen.findByText('Mine');
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Run due schedules now' })).toBeInTheDocument();
  });
});

describe('church dashboard', () => {
  test('hides blocks the user has no permission for', async () => {
    signIn([]);
    routeGets({
      '/api/v2/reports/dashboards/church': {
        generatedAt: '2030-01-01T00:00:00Z', members: null, attendance: null, finance: null, upcomingEvents: null,
        pastoral: { openCases: 3, overdueFollowUps: 1 },
      },
    });
    renderAt('/dashboard/church', '/dashboard/church', <ChurchDashboardPage />);
    await screen.findByText('Pastoral care');
    expect(screen.getByText('Open cases')).toBeInTheDocument();
    for (const title of ['Members', 'Finance', 'Upcoming events']) expect(screen.queryByRole('heading', { name: title })).not.toBeInTheDocument();
    expect(screen.queryByText(/Nothing on this dashboard is available/)).not.toBeInTheDocument();
  });

  test('says so when every block is hidden', async () => {
    signIn([]);
    routeGets({ '/api/v2/reports/dashboards/church': { generatedAt: '2030-01-01T00:00:00Z', members: null, attendance: null, finance: null, pastoral: null, upcomingEvents: null } });
    renderAt('/dashboard/church', '/dashboard/church', <ChurchDashboardPage />);
    expect(await screen.findByText(/Nothing on this dashboard is available/)).toBeInTheDocument();
  });
});
