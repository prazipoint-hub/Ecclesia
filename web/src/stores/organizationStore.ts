import { create } from 'zustand';
import type { Committee } from '@/types/committee';
import type { OrganizationUnit } from '@/types/organization';
import type { Program } from '@/types/program';

export type OrganizationScope = 'DISTRICT' | 'CIRCUIT';

interface OrganizationStore {
  scope: OrganizationScope;
  selectedUnitId: string;
  units: OrganizationUnit[];
  committees: Committee[];
  programs: Program[];
  setScope: (scope: OrganizationScope) => void;
  setSelectedUnitId: (unitId: string) => void;
  getCurrentScopeLabel: () => string;
}

const conferenceUnit: OrganizationUnit = {
  id: 'conference-harare',
  name: 'Harare Conference',
  displayName: 'HARARE CONFERENCE',
  type: 'CONFERENCE',
  status: 'ACTIVE',
};

const districtUnit: OrganizationUnit = {
  id: 'district-harare',
  name: 'Harare District',
  displayName: 'HARARE DISTRICT',
  type: 'DISTRICT',
  parentId: 'conference-harare',
  status: 'ACTIVE',
};

const circuitUnits: OrganizationUnit[] = [
  { id: 'circuit-cranborne', name: 'Cranborne', displayName: 'Cranborne', type: 'CIRCUIT', parentId: 'district-harare', status: 'ACTIVE' },
  { id: 'circuit-borrowdale', name: 'Borrowdale', displayName: 'Borrowdale', type: 'CIRCUIT', parentId: 'district-harare', status: 'ACTIVE' },
  { id: 'circuit-mbare', name: 'Mbare', displayName: 'Mbare', type: 'CIRCUIT', parentId: 'district-harare', status: 'ACTIVE' },
  { id: 'circuit-chitungwiza', name: 'Chitungwiza', displayName: 'Chitungwiza', type: 'CIRCUIT', parentId: 'district-harare', status: 'ACTIVE' },
];

const districtCommittees: Committee[] = [
  { id: 'committee-finance', name: 'District Finance Committee', scopeId: 'district-harare' },
  { id: 'committee-youth', name: 'District Youth Committee', scopeId: 'district-harare' },
  { id: 'committee-womens', name: 'District Women\'s Committee', scopeId: 'district-harare' },
  { id: 'committee-property', name: 'District Property Committee', scopeId: 'district-harare' },
];

const districtPrograms: Program[] = [
  { id: 'program-youth-conference', name: 'Youth Conference', ownerCommitteeId: 'committee-youth', scopeId: 'district-harare', status: 'ACTIVE' },
  { id: 'program-leadership', name: 'Leadership Training', ownerCommitteeId: 'committee-youth', scopeId: 'district-harare', status: 'ACTIVE' },
  { id: 'program-financial-literacy', name: 'Financial Literacy', ownerCommitteeId: 'committee-finance', scopeId: 'district-harare', status: 'PLANNED' },
  { id: 'program-community-outreach', name: 'Community Outreach', ownerCommitteeId: 'committee-property', scopeId: 'district-harare', status: 'COMPLETED' },
];

export const useOrganizationStore = create<OrganizationStore>((set, get) => ({
  scope: 'DISTRICT',
  selectedUnitId: districtUnit.id,
  units: [conferenceUnit, districtUnit, ...circuitUnits],
  committees: districtCommittees,
  programs: districtPrograms,
  setScope: (scope) => set({ scope }),
  setSelectedUnitId: (unitId) => set({ selectedUnitId: unitId }),
  getCurrentScopeLabel: () => {
    const current = get().units.find((unit) => unit.id === get().selectedUnitId) ?? districtUnit;
    return current.displayName;
  },
}));
