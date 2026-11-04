import { create } from 'zustand';
import { apiClient } from '@/utils/api';
import type { Committee } from '@/types/committee';
import type { OrganizationUnit } from '@/types/organization';
import type { Program } from '@/types/program';
import type { Sbu, SbuOversight } from '@/types/sbu';

export type OrganizationScope = OrganizationUnit['type'];

type WorkspaceResponse = {
  conference: { id: string; name: string; code: string | null } | null;
  district: { id: string; name: string; code: string | null } | null;
  circuit: { id: string; name: string } | null;
  church: { id: string; name: string; location: string | null };
  sections: Array<{ id: string; name: string; code: string | null }>;
  organizations: Array<{ id: string; name: string; shortName: string; type: string }>;
};

interface OrganizationStore {
  scope: OrganizationScope;
  selectedUnitId: string;
  units: OrganizationUnit[];
  committees: Committee[];
  programs: Program[];
  sbus: Sbu[];
  oversight: SbuOversight[];
  isLoading: boolean;
  error: string | null;
  loadWorkspace: () => Promise<void>;
  setScope: (scope: OrganizationScope) => void;
  setSelectedUnitId: (unitId: string) => void;
  getCurrentScopeLabel: () => string;
  getSbusForScope: (scopeId?: string) => Sbu[];
  getOversightForSbu: (sbuId: string) => SbuOversight | undefined;
}

const workspaceUnits = (workspace: WorkspaceResponse): OrganizationUnit[] => {
  const units: OrganizationUnit[] = [];
  if (workspace.conference) units.push({
    id: workspace.conference.id,
    name: workspace.conference.name,
    displayName: workspace.conference.name,
    type: 'CONFERENCE',
    status: 'ACTIVE',
  });
  if (workspace.district) units.push({
    id: workspace.district.id,
    name: workspace.district.name,
    displayName: workspace.district.name,
    type: 'DISTRICT',
    parentId: workspace.conference?.id,
    status: 'ACTIVE',
  });
  if (workspace.circuit) units.push({
    id: workspace.circuit.id,
    name: workspace.circuit.name,
    displayName: workspace.circuit.name,
    type: 'CIRCUIT',
    parentId: workspace.district?.id,
    status: 'ACTIVE',
  });
  units.push(...workspace.sections.map((section) => ({
    id: section.id,
    name: section.name,
    displayName: section.name,
    type: 'SECTION' as const,
    parentId: workspace.circuit?.id,
    status: 'ACTIVE' as const,
  })));
  return units;
};

export const useOrganizationStore = create<OrganizationStore>((set, get) => ({
  scope: 'CIRCUIT',
  selectedUnitId: '',
  units: [],
  committees: [],
  programs: [],
  sbus: [],
  oversight: [],
  isLoading: false,
  error: null,
  loadWorkspace: async () => {
    if (get().isLoading) return;
    set({ isLoading: true, error: null });
    try {
      const { data } = await apiClient.get<WorkspaceResponse>('/api/v2/hierarchy/me');
      const units = workspaceUnits(data);
      const selected = units.find((unit) => unit.type === 'CIRCUIT') ?? units.find((unit) => unit.type === 'SECTION') ?? units[0];
      set({ units, selectedUnitId: selected?.id ?? '', scope: selected?.type ?? 'CIRCUIT', isLoading: false });
    } catch {
      set({ isLoading: false, error: 'Church workspace could not be loaded.' });
    }
  },
  setScope: (scope) => set({ scope }),
  setSelectedUnitId: (unitId) => {
    const unit = get().units.find((item) => item.id === unitId);
    if (unit) set({ selectedUnitId: unitId, scope: unit.type });
  },
  getCurrentScopeLabel: () => get().units.find((unit) => unit.id === get().selectedUnitId)?.displayName ?? 'Church workspace',
  getSbusForScope: (scopeId = get().selectedUnitId) => get().sbus.filter((sbu) => sbu.scopeId === scopeId),
  getOversightForSbu: (sbuId) => get().oversight.find((sbu) => sbu.sbuId === sbuId),
}));
