import { useState } from 'react';
import { X } from 'lucide-react';
import type { Program } from '@/types/program';
import type { Committee } from '@/types/committee';
import { programSchema } from '@/utils/validators';
import { Button } from '@/components/common/Button';

interface CreateProgramModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: Partial<Program>) => Promise<void>;
  scopeId: string;
  committees: Committee[];
}

export const CreateProgramModal = ({
  isOpen,
  onClose,
  onSubmit,
  scopeId,
  committees,
}: CreateProgramModalProps) => {
  const [formData, setFormData] = useState({
    name: '',
    ownerCommitteeId: '',
    status: 'ACTIVE' as const,
  });
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const data = {
        name: formData.name,
        ownerCommitteeId: formData.ownerCommitteeId,
        scopeId,
        status: formData.status,
      };

      programSchema.partial().parse(data);
      await onSubmit(data);
      setFormData({ name: '', ownerCommitteeId: '', status: 'ACTIVE' });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create program');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white shadow-lg">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">Create Program</h2>
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
              Program Name
            </label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 placeholder-gray-500 focus:border-primary-500 focus:outline-none"
              placeholder="e.g., Youth Conference"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Owning Committee
            </label>
            <select
              required
              value={formData.ownerCommitteeId}
              onChange={(e) => setFormData({ ...formData, ownerCommitteeId: e.target.value })}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:border-primary-500 focus:outline-none"
            >
              <option value="">Select a committee...</option>
              {committees.map((committee) => (
                <option key={committee.id} value={committee.id}>
                  {committee.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Status
            </label>
            <select
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:border-primary-500 focus:outline-none"
            >
              <option value="PLANNED">Planned</option>
              <option value="ACTIVE">Active</option>
              <option value="COMPLETED">Completed</option>
            </select>
          </div>

          <div className="flex justify-end gap-3 border-t border-gray-200 pt-4">
            <Button variant="secondary" onClick={onClose} type="button">
              Cancel
            </Button>
            <Button variant="primary" type="submit" isLoading={isLoading}>
              Create Program
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
