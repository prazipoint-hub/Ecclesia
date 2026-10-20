import { ChevronDown } from 'lucide-react';
import { useOrganizationStore } from '@/stores/organizationStore';
import type { OrganizationUnit } from '@/types/organization';

export const OrganizationSwitcher = () => {
  const { scope, selectedUnitId, units, setScope, setSelectedUnitId } = useOrganizationStore();
  const selectedUnit = units.find((unit) => unit.id === selectedUnitId) ?? units[0];

  const handleSelect = (unit: OrganizationUnit) => {
    setSelectedUnitId(unit.id);
    if (unit.type === 'DISTRICT' || unit.type === 'CIRCUIT') {
      setScope(unit.type === 'DISTRICT' ? 'DISTRICT' : 'CIRCUIT');
    }
  };

  return (
    <div className="relative">
      <button className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-left text-sm hover:bg-gray-100">
        <span className="font-semibold text-gray-900">{scope}</span>
        <span className="text-gray-500">{selectedUnit?.displayName}</span>
        <ChevronDown className="h-4 w-4 text-gray-500" />
      </button>

      <div className="absolute left-0 top-full z-50 mt-2 w-64 rounded-lg border border-gray-200 bg-white p-2 shadow-lg">
        {units.map((unit) => (
          <button
            key={unit.id}
            onClick={() => handleSelect(unit)}
            className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm ${
              selectedUnitId === unit.id ? 'bg-primary-50 text-primary-700' : 'text-gray-700 hover:bg-gray-50'
            }`}
          >
            <span>{unit.displayName}</span>
            <span className="text-xs uppercase tracking-wide text-gray-500">{unit.type}</span>
          </button>
        ))}
      </div>
    </div>
  );
};
