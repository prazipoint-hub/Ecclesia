import { useState } from 'react';
import { X } from 'lucide-react';
import type { OrganizationUnit } from '@/types/organization';
import { organizationUnitSchema } from '@/utils/validators';
import { Button } from '@/components/common/Button';

interface CreateCircuitModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: Partial<OrganizationUnit>) => Promise<void>;
  parentDistrictId: string;
}

export const CreateCircuitModal = ({
  isOpen,
  onClose,
  onSubmit,
  parentDistrictId,
}: CreateCircuitModalProps) => {
  const [formData, setFormData] = useState({ name: '', displayName: '' });
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const data = {
        name: formData.name,
        displayName: formData.displayName,
        type: 'CIRCUIT' as const,
        parentId: parentDistrictId,
        status: 'ACTIVE' as const,
      };

      organizationUnitSchema.parse(data);
      await onSubmit(data);
      setFormData({ name: '', displayName: '' });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create circuit');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white shadow-lg">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">Create Circuit</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1 hover:bg-gray-100"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 px-6 py-4">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Circuit Name
            </label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 placeholder-gray-500 focus:border-primary-500 focus:outline-none"
              placeholder="e.g., Cranborne"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Display Name
            </label>
            <input
              type="text"
              required
              value={formData.displayName}
              onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 placeholder-gray-500 focus:border-primary-500 focus:outline-none"
              placeholder="e.g., Cranborne Circuit"
            />
          </div>

          <div className="flex justify-end gap-3 border-t border-gray-200 pt-4">
            <Button variant="secondary" onClick={onClose} type="button">
              Cancel
            </Button>
            <Button variant="primary" type="submit" isLoading={isLoading}>
              Create Circuit
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
