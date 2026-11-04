import { Languages } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { LANGUAGES, setLanguage, type LanguageCode } from '@/i18n';

export const LanguageSwitcher = () => {
  const { t, i18n } = useTranslation();
  return (
    <label className="flex items-center gap-1 text-sm text-gray-600">
      <Languages className="h-4 w-4" aria-hidden />
      <span className="sr-only">{t('common.language')}</span>
      <select
        aria-label={t('common.language')}
        value={i18n.language}
        onChange={(e) => void setLanguage(e.target.value as LanguageCode)}
        className="rounded border-gray-300 py-1 text-sm"
      >
        {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
      </select>
    </label>
  );
};
