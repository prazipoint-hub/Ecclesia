import type { ReactNode } from 'react';
import { Modal } from '@/components/forms/Modal';
import { ErrorNotice } from '@/pages/auth/AuthShell';
import { primaryBtn, secondaryBtn } from '@/pages/account/shared';
import { getApiErrorMessage } from '@/utils/apiError';

export const inputCls = 'block min-h-11 w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-primary-500 focus:outline-none focus:ring-4 focus:ring-primary-100 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-500';

export const Labeled = ({ label, children }: { label: string; children: ReactNode }) => (
  <label className="block text-sm font-medium text-gray-700">
    {label}
    <div className="mt-1 font-normal">{children}</div>
  </label>
);

export const ProgressBar = ({ percent, label }: { percent: number; label: string }) => (
  <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} className="h-2.5 w-full overflow-hidden rounded-full bg-gray-100 ring-1 ring-gray-200">
    <div className="h-full rounded-full bg-gradient-to-r from-primary-600 to-primary-400 transition-[width] duration-300" style={{ width: `${Math.min(Math.max(percent, 0), 100)}%` }} />
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
