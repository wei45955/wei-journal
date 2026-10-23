import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { en } from './en'
import { zh } from './zh'

export type LanguageCode = 'en' | 'zh-CN'

const STORAGE_KEY = 'wj.language'

function storedLanguage(): LanguageCode {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    if (value === 'en' || value === 'zh-CN') return value
  } catch {
    // Storage may be refused; English is the default.
  }
  return 'en'
}

function applyDocumentLanguage(code: LanguageCode) {
  document.documentElement.lang = code === 'zh-CN' ? 'zh-Hans' : 'en'
  document.title = code === 'zh-CN' ? '微日记' : 'Wei Journal'
}

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    'zh-CN': { translation: zh },
  },
  lng: storedLanguage(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  returnNull: false,
})

applyDocumentLanguage(i18n.language as LanguageCode)

export function setLanguage(code: LanguageCode) {
  if (i18n.language !== code) void i18n.changeLanguage(code)
  applyDocumentLanguage(code)
  try {
    localStorage.setItem(STORAGE_KEY, code)
  } catch {
    // The choice will not survive a reload.
  }
}

export default i18n
