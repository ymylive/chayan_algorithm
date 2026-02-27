import { createI18n } from 'vue-i18n';
import zhCN from './locales/zh-CN';
import enUS from './locales/en-US';

const LOCALE_STORAGE_KEY = 'ui_locale';
const FALLBACK_LOCALE = 'zh-CN';
const SUPPORTED_LOCALES = new Set(['zh-CN', 'en-US']);

const resolveInitialLocale = () => {
  if (typeof window === 'undefined') {
    return FALLBACK_LOCALE;
  }
  const persisted = String(window.localStorage.getItem(LOCALE_STORAGE_KEY) || '').trim();
  if (SUPPORTED_LOCALES.has(persisted)) {
    return persisted;
  }
  const browserLocale = String(window.navigator.language || '').trim().toLowerCase();
  if (browserLocale.startsWith('en')) {
    return 'en-US';
  }
  return FALLBACK_LOCALE;
};

export const i18n = createI18n({
  legacy: false,
  locale: resolveInitialLocale(),
  fallbackLocale: FALLBACK_LOCALE,
  messages: {
    'zh-CN': zhCN,
    'en-US': enUS
  }
});

export const persistLocale = (locale: string) => {
  if (typeof window === 'undefined') return;
  if (!SUPPORTED_LOCALES.has(locale)) return;
  window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
};

export const getSupportedLocales = () => Array.from(SUPPORTED_LOCALES.values());
