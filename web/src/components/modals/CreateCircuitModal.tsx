import { useState } from 'react';
import type { OrganizationUnit } from '@/types/organization';
import { organizationUnitSchema } from '@/utils/validators';
import { Button } from '@/components/common/Button';
import { FormField } from '@/components/forms/FormField';
import { Modal } from '@/components/forms/Modal';

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

  return (
    <Modal
      open={isOpen}
      title="Create circuit"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} type="button" disabled={isLoading}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="create-circuit-form" isLoading={isLoading}>
            Create circuit
          </Button>
        </>
      }
    >
      <form id="create-circuit-form" onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div
            role="alert"
            className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700"
          >
            {error}
          </div>
        )}

        <FormField
          label="Circuit name"
          required
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          placeholder="e.g., Cranborne"
        />
        <FormField
          label="Display name"
          required
          value={formData.displayName}
          onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
          placeholder="e.g., Cranborne Circuit"
          hint="This is the name people will see throughout Ecclesia."
        />
      </form>
    </Modal>
  );
};
