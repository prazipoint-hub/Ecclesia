import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/common/Button';

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

  const handleConfirm = async () => {
    setIsLoading(true);
    try {
      await onConfirm();
      onCancel();
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white shadow-lg">
        <div className="flex items-center gap-3 border-b border-gray-200 px-6 py-4">
          <Trash2 className={`h-5 w-5 ${isDangerous ? 'text-red-600' : 'text-gray-600'}`} />
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
        </div>

        <div className="px-6 py-4">
          <p className="text-sm text-gray-600">{message}</p>
        </div>

        <div className="flex justify-end gap-3 border-t border-gray-200 px-6 py-4">
          <Button variant="secondary" onClick={onCancel} type="button">
            Cancel
          </Button>
          <Button
            variant={isDangerous ? 'danger' : 'primary'}
            onClick={handleConfirm}
            isLoading={isLoading}
          >
            {isDangerous ? 'Delete' : 'Confirm'}
          </Button>
        </div>
      </div>
    </div>
  );
};
