import type { ReactNode } from 'react';
import { Modal } from '@/components/forms/Modal';
import { ErrorNotice } from '@/pages/auth/AuthShell';
import { primaryBtn, secondaryBtn } from '@/pages/account/shared';
import { getApiErrorMessage } from '@/utils/apiError';

export const inputCls = 'block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200';

export const Labeled = ({ label, children }: { label: string; children: ReactNode }) => (
  <label className="block text-sm font-medium text-gray-700">
    {label}
    <div className="mt-1 font-normal">{children}</div>
  </label>
);

export const ProgressBar = ({ percent, label }: { percent: number; label: string }) => (
  <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} className="h-3 w-full overflow-hidden rounded-full bg-gray-200">
    <div className="h-full bg-primary-600" style={{ width: `${Math.min(Math.max(percent, 0), 100)}%` }} />
  </div>
);

export const ConfirmModal = ({ open, title, message, confirmLabel, pending, error, onConfirm, onClose }: {
  open: boolean; title: string; message: string; confirmLabel: string; pending?: boolean; error?: unknown; onConfirm: () => void; onClose: () => void;
}) => (
  <Modal open={open} title={title} onClose={onClose}
    footer={<><button type="button" className={secondaryBtn} onClick={onClose}>Cancel</button><button type="button" className={primaryBtn} disabled={pending} onClick={onConfirm}>{confirmLabel}</button></>}>
    <p className="text-sm text-gray-700">{message}</p>
    {error != null && <div className="mt-3"><ErrorNotice message={getApiErrorMessage(error)} /></div>}
  </Modal>
);
