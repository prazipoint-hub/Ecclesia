import { Link } from 'react-router-dom';
import { Building2, FileText, Layers3, ShieldCheck } from 'lucide-react';
import { MainLayout } from '@/components/Layout/MainLayout';
import { useOrganizationStore, type OrganizationScope } from '@/stores/organizationStore';
import { ScopeBadge } from '@/components/hierarchy/ScopeBadge';

type WorkspaceView = 'dashboard' | 'structure' | 'committees' | 'management';

const titleFor = (scope: OrganizationScope, view: WorkspaceView) => {
  const scopeName = `${scope.charAt(0)}${scope.slice(1).toLowerCase()}`;
  if (view === 'structure') return `${scopeName} structure`;
  if (view === 'committees') return `${scopeName} committees`;
  if (view === 'management') return `${scopeName} administration`;
  return `${scopeName} dashboard`;
};

export const ScopeWorkspacePage = ({
  scope,
  view = 'dashboard',
}: {
  scope: OrganizationScope;
  view?: WorkspaceView;
}) => {
  const { units, selectedUnitId, setScope, setSelectedUnitId, getSbusForScope } =
    useOrganizationStore();
  const selected =
    units.find((unit) => unit.id === selectedUnitId && unit.type === scope) ??
    units.find((unit) => unit.type === scope);
  const sbus = selected ? getSbusForScope(selected.id) : [];
  const scopePath = scope.toLowerCase();

  const selectWorkspace = () => {
    if (selected) setSelectedUnitId(selected.id);
    setScope(scope);
  };

  return (
    <MainLayout>
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-3">
                <ScopeBadge type={scope} />
                <span className="text-sm font-semibold uppercase tracking-[0.18em] text-gray-500">
                  Workspace
                </span>
              </div>
              <h1 className="mt-3 text-3xl font-bold text-gray-900">{titleFor(scope, view)}</h1>
              <p className="mt-2 text-gray-600">
                {selected?.displayName ?? `Choose a ${scope.toLowerCase()} workspace`}.
              </p>
            </div>
            <button
              type="button"
              onClick={selectWorkspace}
              className="rounded-lg border border-primary-200 bg-primary-50 px-4 py-2 text-sm font-semibold text-primary-700 hover:bg-primary-100"
            >
              Use this workspace
            </button>
          </div>
        </div>
        {view === 'structure' ? (
          <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3">
              <Building2 className="h-5 w-5 text-primary-600" />
              <h2 className="text-lg font-semibold text-gray-900">Available workspaces</h2>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {units
                .filter((unit) => unit.type !== 'SECTION')
                .map((unit) => (
                  <button
                    key={unit.id}
                    type="button"
                    onClick={() => setSelectedUnitId(unit.id)}
                    className={`rounded-lg border p-4 text-left ${unit.id === selectedUnitId ? 'border-primary-400 bg-primary-50' : 'border-gray-200 hover:bg-gray-50'}`}
                  >
                    <p className="font-semibold text-gray-900">{unit.displayName}</p>
                    <p className="mt-1 text-sm text-gray-500">{unit.type}</p>
                  </button>
                ))}
            </div>
          </section>
        ) : view === 'committees' ? (
          <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3">
              <Layers3 className="h-5 w-5 text-primary-600" />
              <h2 className="text-lg font-semibold text-gray-900">Committee workspace</h2>
            </div>
            <p className="mt-3 text-gray-600">
              Committee record management is not enabled in this deployment yet. The navigation
              remains available so existing oversight pages do not lead to a missing route.
            </p>
            <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
              No committee create, edit, or delete control is shown until the corresponding server
              API is available.
            </p>
          </section>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-3">
              <Summary
                label="Current workspace"
                value={selected?.displayName ?? 'Not selected'}
                icon={Building2}
              />
              <Summary label="Sub-unit dashboards" value={String(sbus.length)} icon={Layers3} />
              <Summary label="Reporting" value="Available" icon={FileText} />
            </div>
            <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-3">
                <ShieldCheck className="h-5 w-5 text-primary-600" />
                <h2 className="text-lg font-semibold text-gray-900">Workspace actions</h2>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {sbus.map((sbu) => (
                  <Link
                    key={sbu.id}
                    to={`/${scopePath}/sbus/${sbu.id}`}
                    className="rounded-lg border border-gray-200 p-4 transition hover:border-primary-300 hover:bg-primary-50"
                  >
                    <p className="font-semibold text-gray-900">{sbu.name}</p>
                    <p className="mt-1 text-sm text-gray-500">Open SBU dashboard</p>
                  </Link>
                ))}
                <Link
                  to={`/${scopePath}/reports`}
                  className="rounded-lg border border-gray-200 p-4 transition hover:border-primary-300 hover:bg-primary-50"
                >
                  <p className="font-semibold text-gray-900">Reports</p>
                  <p className="mt-1 text-sm text-gray-500">Generate administrative reports</p>
                </Link>
              </div>
            </section>
          </>
        )}
      </div>
    </MainLayout>
  );
};

const Summary = ({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: typeof Building2;
}) => (
  <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
    <Icon className="h-5 w-5 text-primary-600" />
    <p className="mt-4 text-sm text-gray-500">{label}</p>
    <p className="mt-1 text-xl font-bold text-gray-900">{value}</p>
  </div>
);
