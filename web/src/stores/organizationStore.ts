import { create } from 'zustand';
import type { Committee } from '@/types/committee';
import type { OrganizationUnit } from '@/types/organization';
import type { Program } from '@/types/program';
import type { Sbu, SbuOversight } from '@/types/sbu';

export type OrganizationScope = 'CONFERENCE' | 'DISTRICT' | 'CIRCUIT' | 'SECTION';

interface OrganizationStore {
  scope: OrganizationScope;
  selectedUnitId: string;
  units: OrganizationUnit[];
  committees: Committee[];
  programs: Program[];
  sbus: Sbu[];
  oversight: SbuOversight[];
  setScope: (scope: OrganizationScope) => void;
  setSelectedUnitId: (unitId: string) => void;
  getCurrentScopeLabel: () => string;
  getSbusForScope: (scopeId?: string) => Sbu[];
  getOversightForSbu: (sbuId: string) => SbuOversight | undefined;
}

const conference: OrganizationUnit = { id: 'conference-harare', name: 'Harare Conference', displayName: 'HARARE CONFERENCE', type: 'CONFERENCE', status: 'ACTIVE' };
const district: OrganizationUnit = { id: 'district-harare', name: 'Harare District', displayName: 'HARARE DISTRICT', type: 'DISTRICT', parentId: conference.id, status: 'ACTIVE' };
const circuits: OrganizationUnit[] = [
  { id: 'circuit-cranborne', name: 'Cranborne', displayName: 'Cranborne', type: 'CIRCUIT', parentId: district.id, status: 'ACTIVE' },
  { id: 'circuit-borrowdale', name: 'Borrowdale', displayName: 'Borrowdale', type: 'CIRCUIT', parentId: district.id, status: 'ACTIVE' },
  { id: 'circuit-mbare', name: 'Mbare', displayName: 'Mbare', type: 'CIRCUIT', parentId: district.id, status: 'ACTIVE' },
];

const sbuDefinitions = [
  { key: 'RRW' as const, name: 'Rural and Urban Women (RRW)' },
  { key: 'UMYF' as const, name: 'United Methodist Youth Fellowship (UMYF)' },
  { key: 'MUMC' as const, name: 'Men of the United Methodist Church (MUMC)' },
  { key: 'CHILDRENS_MINISTRY' as const, name: "Children's Ministry" },
];

const sbus: Sbu[] = [
  ...[conference, district, ...circuits].flatMap((unit) => sbuDefinitions.map((definition) => ({
    id: `${unit.id}-${definition.key.toLowerCase()}`,
    ...definition,
    displayName: definition.name,
    scopeId: unit.id,
    scopeType: unit.type as 'CONFERENCE' | 'DISTRICT' | 'CIRCUIT',
    status: 'ACTIVE' as const,
  }))),
];

const oversight: SbuOversight[] = sbus.map((sbu) => ({
  sbuId: sbu.id,
  scopeId: sbu.scopeId,
  overseerRole: sbu.scopeType === 'CIRCUIT' ? 'PASTOR' : sbu.scopeType === 'DISTRICT' ? 'DISTRICT_SUPERINTENDENT' : 'BISHOP',
  canReview: true,
  canApprove: false,
}));

export const useOrganizationStore = create<OrganizationStore>((set, get) => ({
  scope: 'DISTRICT',
  selectedUnitId: district.id,
  units: [conference, district, ...circuits],
  committees: [],
  programs: [],
  sbus,
  oversight,
  setScope: (scope) => set({ scope }),
  setSelectedUnitId: (unitId) => {
    const unit = get().units.find((item) => item.id === unitId);
    if (unit) set({ selectedUnitId: unitId, scope: unit.type });
  },
  getCurrentScopeLabel: () => get().units.find((unit) => unit.id === get().selectedUnitId)?.displayName ?? district.displayName,
  getSbusForScope: (scopeId = get().selectedUnitId) => get().sbus.filter((sbu) => sbu.scopeId === scopeId),
  getOversightForSbu: (sbuId) => get().oversight.find((item) => item.sbuId === sbuId),
}));
