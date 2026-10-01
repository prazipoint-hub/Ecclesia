import { useState } from 'react';
import { X } from 'lucide-react';
import type { Committee } from '@/types/committee';
import { Button } from '@/components/common/Button';

interface EditCommitteeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: Partial<Committee>) => Promise<void>;
  committee?: Committee;
}

export const EditCommitteeModal = ({
  isOpen,
  onClose,
  onSubmit,
  committee,
}: EditCommitteeModalProps) => {
  const [name, setName] = useState(committee?.name ?? '');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!committee) return;

    setError(null);
    setIsLoading(true);

    try {
      await onSubmit({ ...committee, name });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update committee');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen || !committee) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white shadow-lg">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">Edit Committee</h2>
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
              Committee Name
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 placeholder-gray-500 focus:border-primary-500 focus:outline-none"
            />
          </div>

          <div className="flex justify-end gap-3 border-t border-gray-200 pt-4">
            <Button variant="secondary" onClick={onClose} type="button">
              Cancel
            </Button>
            <Button variant="primary" type="submit" isLoading={isLoading}>
              Save Changes
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
