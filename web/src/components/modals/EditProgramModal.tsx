import { useEffect, useState } from 'react';
import type { Program } from '@/types/program';
import type { Committee } from '@/types/committee';
import { Button } from '@/components/common/Button';
import { FormField } from '@/components/forms/FormField';
import { FormSelect } from '@/components/forms/FormSelect';
import { Modal } from '@/components/forms/Modal';

type ProgramStatus = Program['status'];

interface EditProgramModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: Partial<Program>) => Promise<void>;
  program?: Program;
  committees: Committee[];
}

export const EditProgramModal = ({
  isOpen,
  onClose,
  onSubmit,
  program,
  committees,
}: EditProgramModalProps) => {
  const [formData, setFormData] = useState<{
    name: string;
    ownerCommitteeId: string;
    status: ProgramStatus;
  }>({
    name: program?.name ?? '',
    ownerCommitteeId: program?.ownerCommitteeId ?? '',
    status: program?.status ?? 'ACTIVE',
  });
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!isOpen || !program) return;
    setFormData({
      name: program.name,
      ownerCommitteeId: program.ownerCommitteeId ?? '',
      status: program.status ?? 'ACTIVE',
    });
    setError(null);
  }, [isOpen, program]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!program) return;

    setError(null);
    setIsLoading(true);

    try {
      await onSubmit({ ...program, ...formData });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update program');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal
      open={isOpen && Boolean(program)}
      title="Edit program"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} type="button" disabled={isLoading}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="edit-program-form" isLoading={isLoading}>
            Save changes
          </Button>
        </>
      }
    >
      <form id="edit-program-form" onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"
          >
            {error}
          </div>
        )}

        <FormField
          label="Program name"
          required
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
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
