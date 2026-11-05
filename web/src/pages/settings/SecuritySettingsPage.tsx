import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, KeyRound, Laptop, Loader2, ShieldCheck, AlertTriangle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { MainLayout } from '@/components/Layout/MainLayout';
import { FormField } from '@/components/forms/FormField';
import { Modal } from '@/components/forms/Modal';
import { useAuthStore } from '@/stores/authStore';
import { apiClient } from '@/utils/api';
import { getApiErrorMessage } from '@/utils/apiError';
import { CalendarFeedsCard } from '@/pages/advanced/CalendarFeedsCard';
import { ErrorNotice, PASSWORD_MAX, PASSWORD_MIN, SuccessNotice, validateNewPassword } from '@/pages/auth/AuthShell';

interface Device {
  id: string;
  userAgent: string | null;
  ipAddress: string | null;
  lastSeenAt: string;
  createdAt: string;
  current: boolean;
}

const AUTH = '/api/v1/auth';
const card = 'rounded-2xl border border-gray-200/80 bg-white p-5 shadow-soft sm:p-6';
const primaryBtn = 'inline-flex min-h-11 items-center justify-center rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-primary-700 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60';
const secondaryBtn = 'inline-flex min-h-11 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 shadow-sm hover:border-primary-200 hover:bg-primary-50 disabled:cursor-not-allowed disabled:opacity-60';

const CopyButton = ({ value, label }: { value: string; label: string }) => {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };
  return (
    <button type="button" onClick={copy} aria-label={`Copy ${label}`} className="inline-flex items-center gap-1 rounded border border-gray-300 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50">
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
};

const ChangePasswordSection = () => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [validationError, setValidationError] = useState<string>();

  const change = useMutation({
    mutationFn: (input: { currentPassword: string; newPassword: string }) => apiClient.post(`${AUTH}/password/change`, input),
    onSuccess: () => {
      setCurrentPassword('');
      setNewPassword('');
      setConfirm('');
    },
  });

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const problem = validateNewPassword(newPassword, confirm);
    setValidationError(problem);
    if (problem) return;
    change.mutate({ currentPassword, newPassword });
  };

  return (
    <section className={card} aria-labelledby="password-heading">
      <h2 id="password-heading" className="flex items-center gap-2 text-lg font-semibold text-gray-900">
        <KeyRound className="h-5 w-5 text-gray-500" /> Change password
      </h2>
      <form onSubmit={onSubmit} className="mt-4 space-y-4">
        {change.isSuccess && <SuccessNotice message="Your password has been changed." />}
        {change.isError && <ErrorNotice message={getApiErrorMessage(change.error, 'We could not change your password.')} />}
        <FormField label="Current password" type="password" autoComplete="current-password" required value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} disabled={change.isPending} />
        <FormField label="New password" type="password" autoComplete="new-password" required minLength={PASSWORD_MIN} maxLength={PASSWORD_MAX} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} disabled={change.isPending} />
        <FormField label="Confirm new password" type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} error={validationError} disabled={change.isPending} />
        <button type="submit" className={primaryBtn} disabled={change.isPending}>
          {change.isPending ? 'Saving…' : 'Update password'}
        </button>
      </form>
    </section>
  );
};

const EmailVerificationSection = () => {
  const verified = useAuthStore((state) => state.user?.emailVerified);
  const resend = useMutation({
    mutationFn: async () => (await apiClient.post<{ message?: string }>(`${AUTH}/email/resend-verification`)).data,
  });
  return (
    <section className={card} aria-labelledby="email-heading">
      <h2 id="email-heading" className="text-lg font-semibold text-gray-900">Email verification</h2>
      {verified ? (
        <p className="mt-1 flex items-center gap-2 text-sm text-green-700">
          <Check className="h-4 w-4" /> Your email address is verified.
        </p>
      ) : (
        <p className="mt-1 text-sm text-gray-600">Did not get a verification email? Send a new one to your account address.</p>
      )}
      <div className={`mt-4 space-y-3 ${verified ? 'hidden' : ''}`}>
        {resend.isSuccess && <SuccessNotice message={resend.data?.message ?? 'A new verification email has been sent.'} />}
        {resend.isError && <ErrorNotice message={getApiErrorMessage(resend.error)} />}
        <button type="button" className={secondaryBtn} onClick={() => resend.mutate()} disabled={resend.isPending}>
          {resend.isPending ? 'Sending…' : 'Resend verification email'}
        </button>
      </div>
    </section>
  );
};

const DevicesSection = () => {
  const queryClient = useQueryClient();
  const devices = useQuery({
    queryKey: ['auth', 'devices'],
    queryFn: async () => (await apiClient.get<{ devices: Device[] }>(`${AUTH}/devices`)).data.devices,
  });
  const revoke = useMutation({
    mutationFn: (id: string) => apiClient.delete(`${AUTH}/devices/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['auth', 'devices'] }),
  });

  return (
    <section className={card} aria-labelledby="devices-heading">
      <h2 id="devices-heading" className="flex items-center gap-2 text-lg font-semibold text-gray-900">
        <Laptop className="h-5 w-5 text-gray-500" /> Signed-in devices
      </h2>
      <div className="mt-4 space-y-3">
        {revoke.isError && <ErrorNotice message={getApiErrorMessage(revoke.error, 'We could not revoke that device.')} />}
        {devices.isLoading ? (
          <div role="status" className="flex items-center gap-2 text-sm text-gray-600">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading devices…
          </div>
        ) : devices.isError ? (
          <ErrorNotice message={getApiErrorMessage(devices.error, 'Devices could not be loaded.')} />
        ) : devices.data && devices.data.length > 0 ? (
          <ul className="divide-y divide-gray-100">
            {devices.data.map((device) => (
              <li key={device.id} className="flex items-center justify-between gap-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-gray-900">
                    {device.userAgent ?? 'Unknown device'}
                    {device.current && <span className="ml-2 rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">This device</span>}
                  </p>
                  <p className="text-xs text-gray-500">
                    {device.ipAddress ?? 'Unknown IP'} · Last active {new Date(device.lastSeenAt).toLocaleString()}
                  </p>
                </div>
                {!device.current && (
                  <button type="button" className="shrink-0 rounded-lg border border-red-200 px-3 py-1.5 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60" onClick={() => revoke.mutate(device.id)} disabled={revoke.isPending && revoke.variables === device.id} aria-label={`Revoke ${device.userAgent ?? 'unknown device'}`}>
                    Revoke
                  </button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-600">No devices have signed in to this account yet.</p>
        )}
      </div>
    </section>
  );
};

const TwoFactorSection = () => {
  const queryClient = useQueryClient();
  const [code, setCode] = useState('');
  const [setup, setSetup] = useState<{ secret: string; otpauthUrl: string } | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [disableOpen, setDisableOpen] = useState(false);
  const [disablePassword, setDisablePassword] = useState('');
  const [disableCode, setDisableCode] = useState('');

  const status = useQuery({
    queryKey: ['auth', '2fa'],
    queryFn: async () => (await apiClient.get<{ enabled: boolean }>(`${AUTH}/2fa/status`)).data.enabled,
  });

  const startSetup = useMutation({
    mutationFn: async () => (await apiClient.post<{ secret: string; otpauthUrl: string }>(`${AUTH}/2fa/setup`)).data,
    onSuccess: (data) => setSetup(data),
  });

  const verify = useMutation({
    mutationFn: async (value: string) => (await apiClient.post<{ backupCodes: string[] }>(`${AUTH}/2fa/verify`, { code: value })).data,
    onSuccess: (data) => {
      setBackupCodes(data.backupCodes);
      setSetup(null);
      setCode('');
      queryClient.invalidateQueries({ queryKey: ['auth', '2fa'] });
    },
  });

  const disable = useMutation({
    mutationFn: (input: { password: string; code: string }) => apiClient.post(`${AUTH}/2fa/disable`, input),
    onSuccess: () => {
      setDisableOpen(false);
      setDisablePassword('');
      setDisableCode('');
      queryClient.invalidateQueries({ queryKey: ['auth', '2fa'] });
    },
  });

  const closeDisable = () => {
    setDisableOpen(false);
    disable.reset();
  };

  return (
    <section className={card} aria-labelledby="twofa-heading">
      <h2 id="twofa-heading" className="flex items-center gap-2 text-lg font-semibold text-gray-900">
        <ShieldCheck className="h-5 w-5 text-gray-500" /> Two-factor authentication
      </h2>
      <div className="mt-4 space-y-4">
        {status.isLoading ? (
          <div role="status" className="flex items-center gap-2 text-sm text-gray-600">
            <Loader2 className="h-4 w-4 animate-spin" /> Checking status…
          </div>
        ) : status.isError ? (
          <ErrorNotice message={getApiErrorMessage(status.error, 'Two-factor status could not be loaded.')} />
        ) : null}

        {backupCodes && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-amber-900">
              <AlertTriangle className="h-4 w-4" /> Save your backup codes now
            </p>
            <p className="mt-1 text-sm text-amber-800">They are shown only once. Each code can be used once if you lose access to your authenticator app.</p>
            <ul className="mt-3 grid grid-cols-2 gap-2 font-mono text-sm text-gray-900">
              {backupCodes.map((backup) => (
                <li key={backup} className="rounded bg-white px-2 py-1">{backup}</li>
              ))}
            </ul>
            <div className="mt-3 flex items-center gap-3">
              <CopyButton value={backupCodes.join('\n')} label="backup codes" />
              <button type="button" className={secondaryBtn} onClick={() => setBackupCodes(null)}>I have saved them</button>
            </div>
          </div>
        )}

        {status.data === true && !setup && (
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm text-gray-700"><span className="font-semibold text-green-700">Enabled.</span> Your account requires a code at sign-in.</p>
            <button type="button" className="rounded-lg border border-red-200 px-4 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-50" onClick={() => setDisableOpen(true)}>
              Disable
            </button>
          </div>
        )}

        {status.data === false && !setup && (
          <div className="space-y-3">
            <p className="text-sm text-gray-600">Add a second step at sign-in using an authenticator app such as Google Authenticator or Authy.</p>
            {startSetup.isError && <ErrorNotice message={getApiErrorMessage(startSetup.error, 'We could not start setup.')} />}
            <button type="button" className={primaryBtn} onClick={() => startSetup.mutate()} disabled={startSetup.isPending}>
              {startSetup.isPending ? 'Preparing…' : 'Set up two-factor authentication'}
            </button>
          </div>
        )}

        {setup && (
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              verify.mutate(code.trim());
            }}
          >
            <p className="text-sm text-gray-700">Add this account to your authenticator app by entering the secret key, then type the 6-digit code it shows.</p>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Secret key</p>
              <div className="mt-1 flex items-center gap-2">
                <code className="break-all rounded bg-gray-100 px-2 py-1 text-sm">{setup.secret}</code>
                <CopyButton value={setup.secret} label="secret key" />
              </div>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Setup link (otpauth)</p>
              <div className="mt-1 flex items-start gap-2">
                <code className="break-all rounded bg-gray-100 px-2 py-1 text-xs">{setup.otpauthUrl}</code>
                <CopyButton value={setup.otpauthUrl} label="setup link" />
              </div>
            </div>
            {verify.isError && <ErrorNotice message={getApiErrorMessage(verify.error, 'That code was not accepted.')} />}
            <FormField label="6-digit code" inputMode="numeric" autoComplete="one-time-code" required value={code} onChange={(e) => setCode(e.target.value)} disabled={verify.isPending} />
            <div className="flex gap-3">
              <button type="submit" className={primaryBtn} disabled={verify.isPending}>{verify.isPending ? 'Verifying…' : 'Verify and enable'}</button>
              <button type="button" className={secondaryBtn} onClick={() => { setSetup(null); verify.reset(); }} disabled={verify.isPending}>Cancel</button>
            </div>
          </form>
        )}
      </div>

      <Modal
        open={disableOpen}
        title="Disable two-factor authentication"
        onClose={closeDisable}
        footer={
          <>
            <button type="button" className={secondaryBtn} onClick={closeDisable} disabled={disable.isPending}>Cancel</button>
            <button type="submit" form="disable-2fa-form" className="rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60" disabled={disable.isPending}>
              {disable.isPending ? 'Disabling…' : 'Disable'}
            </button>
          </>
        }
      >
        <form
          id="disable-2fa-form"
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            disable.mutate({ password: disablePassword, code: disableCode.trim() });
          }}
        >
          <p className="text-sm text-gray-600">Confirm with your password and a current authentication code (or a backup code).</p>
          {disable.isError && <ErrorNotice message={getApiErrorMessage(disable.error, 'We could not disable two-factor authentication.')} />}
          <FormField label="Password" type="password" autoComplete="current-password" required value={disablePassword} onChange={(e) => setDisablePassword(e.target.value)} />
          <FormField label="Authentication code" autoComplete="one-time-code" required value={disableCode} onChange={(e) => setDisableCode(e.target.value)} />
        </form>
      </Modal>
    </section>
  );
};

export const SecuritySettingsPage = () => (
  <MainLayout>
    <div className="mx-auto max-w-4xl space-y-7">
      <div>
        <Link to="/settings" className="page-eyebrow hover:text-primary-900">← Settings</Link>
        <h1 className="mt-2 text-3xl font-semibold text-gray-950 sm:text-4xl">Security</h1>
        <p className="mt-2 max-w-2xl text-gray-600">Manage your password, signed-in devices and two-factor authentication.</p>
      </div>
      <ChangePasswordSection />
      <EmailVerificationSection />
      <DevicesSection />
      <TwoFactorSection />
      <CalendarFeedsCard />
    </div>
  </MainLayout>
);
