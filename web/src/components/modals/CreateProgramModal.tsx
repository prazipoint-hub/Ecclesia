import { useState } from 'react';
import type { Program } from '@/types/program';
import type { Committee } from '@/types/committee';
import { programSchema } from '@/utils/validators';
import { Button } from '@/components/common/Button';
import { FormField } from '@/components/forms/FormField';
import { FormSelect } from '@/components/forms/FormSelect';
import { Modal } from '@/components/forms/Modal';

type ProgramStatus = Program['status'];

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
  const [formData, setFormData] = useState<{
    name: string;
    ownerCommitteeId: string;
    status: ProgramStatus;
  }>({
    name: '',
    ownerCommitteeId: '',
    status: 'ACTIVE',
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

  return (
    <Modal
      open={isOpen}
      title="Create program"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} type="button" disabled={isLoading}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="create-program-form" isLoading={isLoading}>
            Create program
          </Button>
        </>
      }
    >
      <form id="create-program-form" onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div
            role="alert"
            className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700"
          >
            {error}
          </div>
        )}

        <FormField
          label="Program name"
          required
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          placeholder="e.g., Youth Conference"
        />
        <FormSelect
          label="Owning committee"
          required
          value={formData.ownerCommitteeId}
          onChange={(e) => setFormData({ ...formData, ownerCommitteeId: e.target.value })}
          placeholder="Select a committee…"
          options={committees.map((committee) => ({ value: committee.id, label: committee.name }))}
        />
        <FormSelect
          label="Status"
          value={formData.status}
          onChange={(e) => setFormData({ ...formData, status: e.target.value as ProgramStatus })}
          options={[
            { value: 'PLANNED', label: 'Planned' },
            { value: 'ACTIVE', label: 'Active' },
            { value: 'COMPLETED', label: 'Completed' },
          ]}
        />
      </form>
    </Modal>
  );
};
