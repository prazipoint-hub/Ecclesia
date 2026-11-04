import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './en.json';
import nd from './nd.json';
import sn from './sn.json';

export const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'sn', label: 'chiShona' },
  { code: 'nd', label: 'isiNdebele' },
] as const;
export type LanguageCode = (typeof LANGUAGES)[number]['code'];

const STORAGE_KEY = 'ecclesia.language';
const isSupported = (code: string | null): code is LanguageCode => LANGUAGES.some((l) => l.code === code);

export function storedLanguage(): LanguageCode {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (isSupported(saved)) return saved;
  } catch { /* storage can be blocked; fall through to English */ }
  return 'en';
}

export function setLanguage(code: LanguageCode): Promise<unknown> {
  try { localStorage.setItem(STORAGE_KEY, code); } catch { /* remembering is optional */ }
  return i18n.changeLanguage(code);
}

// Keeps <html lang> in step so screen readers and spell-checkers use the right language.
i18n.on('languageChanged', (lng) => {
  if (typeof document !== 'undefined') document.documentElement.lang = lng;
});

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, sn: { translation: sn }, nd: { translation: nd } },
  lng: storedLanguage(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  returnNull: false,
});
if (typeof document !== 'undefined') document.documentElement.lang = i18n.language;

export default i18n;
