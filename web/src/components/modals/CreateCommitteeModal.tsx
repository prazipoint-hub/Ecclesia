import { useState } from 'react';
import type { Committee } from '@/types/committee';
import { committeeSchema } from '@/utils/validators';
import { Button } from '@/components/common/Button';
import { FormField } from '@/components/forms/FormField';
import { Modal } from '@/components/forms/Modal';

interface CreateCommitteeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: Partial<Committee>) => Promise<void>;
  scopeId: string;
}

export const CreateCommitteeModal = ({
  isOpen,
  onClose,
  onSubmit,
  scopeId,
}: CreateCommitteeModalProps) => {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const data = {
        name,
        scopeId,
      };

      committeeSchema.partial().parse(data);
      await onSubmit(data);
      setName('');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create committee');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal
      open={isOpen}
      title="Create committee"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} type="button" disabled={isLoading}>
            Cancel
          </Button>
          <Button
            variant="primary"
            type="submit"
            form="create-committee-form"
            isLoading={isLoading}
          >
            Create committee
          </Button>
        </>
      }
    >
      <form id="create-committee-form" onSubmit={handleSubmit} className="space-y-4">
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
          placeholder="e.g., Finance Committee"
          hint="Use a clear name that reflects the committee's responsibility."
        />
      </form>
    </Modal>
  );
};
