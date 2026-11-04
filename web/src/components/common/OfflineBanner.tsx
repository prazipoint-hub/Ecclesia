import { WifiOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useOnlineStatus } from '@/pwa/useInstallPrompt';

export const OfflineBanner = () => {
  const { t } = useTranslation();
  if (useOnlineStatus()) return null;
  return (
    <div role="status" className="flex items-center justify-center gap-2 bg-amber-100 px-4 py-2 text-sm font-medium text-amber-900">
      <WifiOff className="h-4 w-4" />{t('pwa.offline')}
    </div>
  );
};
