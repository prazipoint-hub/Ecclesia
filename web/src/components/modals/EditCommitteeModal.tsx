import { useEffect, useState } from 'react';
import type { Committee } from '@/types/committee';
import { Button } from '@/components/common/Button';
import { FormField } from '@/components/forms/FormField';
import { Modal } from '@/components/forms/Modal';

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

  useEffect(() => {
    if (!isOpen || !committee) return;
    setName(committee.name);
    setError(null);
  }, [committee, isOpen]);

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

  return (
    <Modal
      open={isOpen && Boolean(committee)}
      title="Edit committee"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} type="button" disabled={isLoading}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="edit-committee-form" isLoading={isLoading}>
            Save changes
          </Button>
        </>
      }
    >
      <form id="edit-committee-form" onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"
          >
            {error}
          </div>
        )}
        <FormField
          label="Committee name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </form>
    </Modal>
  );
};
