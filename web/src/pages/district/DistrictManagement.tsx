import { useState } from 'react';
import { ArrowRight, BriefcaseBusiness, Building2, CalendarRange, Plus } from 'lucide-react';
import { MainLayout } from '@/components/Layout/MainLayout';
import { Button } from '@/components/common/Button';
import { Card, CardContent, CardHeader } from '@/components/common/Card';
import { ScopeBadge } from '@/components/hierarchy/ScopeBadge';
import { CreateCircuitModal } from '@/components/modals/CreateCircuitModal';
import { organizationService } from '@/services/organizationService';
import { useOrganizationStore } from '@/stores/organizationStore';
import type { OrganizationUnit } from '@/types/organization';

export const DistrictManagement = () => {
  const { units, selectedUnitId } = useOrganizationStore();
  const [isCircuitModalOpen, setIsCircuitModalOpen] = useState(false);
  const circuits = units.filter((unit) => unit.type === 'CIRCUIT');

  const handleCreateCircuit = async (data: Partial<OrganizationUnit>) => {
    const created = await organizationService.createUnit(data as OrganizationUnit);
    useOrganizationStore.setState((state) => ({
      units: [...state.units, created],
      selectedUnitId: created.id,
    }));
  };

  return (
    <MainLayout>
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <ScopeBadge type="DISTRICT" />
              <span className="text-sm font-semibold uppercase tracking-[0.18em] text-gray-500">District</span>
            </div>
            <h1 className="mt-3 text-3xl font-bold text-gray-900">District Administration</h1>
          </div>
          <Button variant="primary" onClick={() => setIsCircuitModalOpen(true)}>
            <Plus className="h-4 w-4" />
            Add Circuit
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader>
              <span className="text-sm font-medium text-gray-500">District</span>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-3xl font-bold text-gray-900">Harare</p>
              <p className="text-sm text-gray-600">Conference district</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <span className="text-sm font-medium text-gray-500">Circuits</span>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-3xl font-bold text-gray-900">{circuits.length}</p>
              <p className="text-sm text-gray-600">Active circuit units</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <span className="text-sm font-medium text-gray-500">Selected Unit</span>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-xl font-bold text-gray-900">{selectedUnitId}</p>
              <p className="text-sm text-gray-600">Current district scope</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <Card>
            <CardHeader className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Circuit roster</h2>
              <Building2 className="h-5 w-5 text-primary-600" />
            </CardHeader>
            <CardContent className="space-y-3">
              {circuits.map((circuit) => (
                <div key={circuit.id} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-3">
                  <div>
                    <p className="font-medium text-gray-900">{circuit.displayName}</p>
                    <p className="text-sm text-gray-500">{circuit.name}</p>
                  </div>
                  <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">Active</span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Quick actions</h2>
              <CalendarRange className="h-5 w-5 text-primary-600" />
            </CardHeader>
            <CardContent className="space-y-3">
              {[
                { title: 'Committee oversight', route: '/district/committees/manage', icon: BriefcaseBusiness },
                { title: 'Program planning', route: '/district/programs', icon: CalendarRange },
                { title: 'Reports and analytics', route: '/district/reports', icon: ArrowRight },
              ].map(({ title, route, icon: Icon }) => (
                <a key={title} href={route} className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-3 transition hover:bg-gray-50">
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-primary-50 p-2 text-primary-600"><Icon className="h-4 w-4" /></div>
                    <span className="font-medium text-gray-800">{title}</span>
                  </div>
                  <ArrowRight className="h-4 w-4 text-gray-500" />
                </a>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      <CreateCircuitModal
        isOpen={isCircuitModalOpen}
        onClose={() => setIsCircuitModalOpen(false)}
        onSubmit={handleCreateCircuit}
        parentDistrictId={selectedUnitId}
      />
    </MainLayout>
  );
};
