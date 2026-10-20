import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { en } from './locales/en'
import { zhCN } from './locales/zh-CN'

export const SUPPORTED_LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'zh-CN', label: '简体中文' },
] as const

export type LanguageCode = (typeof SUPPORTED_LANGUAGES)[number]['code']

/** The language stored in the browser before the account is known. */
const STORAGE_KEY = 'wj.language'

function storedLanguage(): LanguageCode {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY)
    if (value && SUPPORTED_LANGUAGES.some((l) => l.code === value)) return value as LanguageCode
  } catch {
    // Private browsing modes can refuse local storage; the default is fine.
  }
  return 'en'
}

function applyDocumentLanguage(code: LanguageCode) {
  document.documentElement.lang = code === 'zh-CN' ? 'zh-Hans' : 'en'
}

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    'zh-CN': { translation: zhCN },
  },
  lng: storedLanguage(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  returnNull: false,
})

applyDocumentLanguage(i18n.language as LanguageCode)

/** Switches the interface language and remembers it for the next visit. */
export function setLanguage(code: LanguageCode) {
  void i18n.changeLanguage(code)
  applyDocumentLanguage(code)
  try {
    window.localStorage.setItem(STORAGE_KEY, code)
  } catch {
    // Ignored: the choice simply will not survive a reload.
  }
}

export default i18n
