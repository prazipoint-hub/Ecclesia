import { useOrganizationStore } from '@stores/organizationStore';

export const useOrganization = () => {
  const { scope, selectedUnitId, units, committees, programs, setScope, setSelectedUnitId, getCurrentScopeLabel } = useOrganizationStore();

  const getCurrentUnit = () => units.find((unit) => unit.id === selectedUnitId);

  const getCircuits = () => units.filter((unit) => unit.type === 'CIRCUIT' && unit.parentId === selectedUnitId);

  const getCommitteesForScope = () => committees.filter((committee) => committee.scopeId === selectedUnitId);

  const getProgramsForScope = () => programs.filter((program) => program.scopeId === selectedUnitId);

  return {
    scope,
    selectedUnitId,
    units,
    committees,
    programs,
    setScope,
    setSelectedUnitId,
    getCurrentScopeLabel,
    getCurrentUnit,
    getCircuits,
    getCommitteesForScope,
    getProgramsForScope,
  };
};
