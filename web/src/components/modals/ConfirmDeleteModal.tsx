import { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/common/Button';
import { Modal } from '@/components/forms/Modal';

interface ConfirmDeleteModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => Promise<void>;
  onCancel: () => void;
  isDangerous?: boolean;
}

export const ConfirmDeleteModal = ({
  isOpen,
  title,
  message,
  onConfirm,
  onCancel,
  isDangerous = false,
}: ConfirmDeleteModalProps) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) setError(null);
  }, [isOpen]);

  const handleConfirm = async () => {
    setIsLoading(true);
    setError(null);
    try {
      await onConfirm();
      onCancel();
    } catch (confirmError) {
      setError(
        confirmError instanceof Error ? confirmError.message : 'The action could not be completed.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal
      open={isOpen}
      title={title}
      onClose={onCancel}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} type="button" disabled={isLoading}>
            Cancel
          </Button>
          <Button
            variant={isDangerous ? 'danger' : 'primary'}
            onClick={handleConfirm}
            isLoading={isLoading}
          >
            {isDangerous ? 'Delete' : 'Confirm'}
          </Button>
        </>
      }
    >
      <div className="flex items-start gap-3">
        <span
          className={`rounded-xl p-2.5 ${isDangerous ? 'bg-red-50 text-red-600' : 'bg-primary-50 text-primary-700'}`}
        >
          <Trash2 className="h-5 w-5" />
        </span>
        <div className="space-y-3 pt-1">
          <p className="text-sm leading-relaxed text-gray-600">{message}</p>
          {error && (
            <p
              role="alert"
              className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"
            >
              {error}
            </p>
          )}
        </div>
      </div>
    </Modal>
  );
};
