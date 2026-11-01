import { Download, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useInstallPrompt } from '@/pwa/useInstallPrompt';

export const InstallPrompt = () => {
  const { t } = useTranslation();
  const { canInstall, install, dismiss } = useInstallPrompt();
  if (!canInstall) return null;
  return (
    <div role="dialog" aria-label={t('pwa.installTitle')} className="fixed bottom-4 left-4 right-4 z-50 mx-auto flex max-w-md items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-lg">
      <Download className="h-5 w-5 shrink-0 text-primary-600" />
      <div className="flex-1 text-sm">
        <p className="font-semibold text-gray-900">{t('pwa.installTitle')}</p>
        <p className="text-gray-600">{t('pwa.installBody')}</p>
      </div>
      <button onClick={install} className="rounded-lg bg-primary-600 px-3 py-2 text-sm font-semibold text-white hover:bg-primary-700">{t('pwa.install')}</button>
      <button onClick={dismiss} aria-label={t('common.close')} className="rounded p-1 text-gray-500 hover:bg-gray-100"><X className="h-4 w-4" /></button>
    </div>
  );
};
