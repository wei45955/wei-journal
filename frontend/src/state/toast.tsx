/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../lib/api'
import { cn } from '../lib/cn'

type Tone = 'info' | 'error'

interface Toast {
  id: number
  message: string
  tone: Tone
  leaving?: boolean
}

interface ToastApi {
  notify: (message: string, tone?: Tone) => void
  /** A readable sentence for any thrown value. */
  describe: (error: unknown, fallback?: string) => string
}

const ToastContext = createContext<ToastApi | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const [toasts, setToasts] = useState<Toast[]>([])
  const next = useRef(1)

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.map((toast) => (toast.id === id ? { ...toast, leaving: true } : toast)))
    window.setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), 200)
  }, [])

  const notify = useCallback(
    (message: string, tone: Tone = 'info') => {
      const id = next.current++
      setToasts((current) => [...current.slice(-2), { id, message, tone }])
      window.setTimeout(() => dismiss(id), tone === 'error' ? 5200 : 2600)
    },
    [dismiss],
  )

  const describe = useCallback(
    (error: unknown, fallback?: string) => {
      if (error instanceof ApiError) {
        if (error.code === 'network_error' || error.status === 0) return t('errors.network')
        if (error.isUnauthorized) return t('errors.unauthorized')
        if (error.status === 404) return t('errors.notFound')
        if (error.isValidation) return Object.values(error.details)[0] || error.message || t('errors.validation')
        return error.message || fallback || t('errors.generic')
      }
      if (error instanceof TypeError) return t('errors.network')
      return fallback ?? t('errors.generic')
    },
    [t],
  )

  const value = useMemo(() => ({ notify, describe }), [notify, describe])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 top-0 z-[90] flex flex-col items-center gap-2 px-4 pt-[calc(env(safe-area-inset-top)+0.5rem)]"
        role="status"
        aria-live="polite"
      >
        {toasts.map((toast) => (
          <button
            type="button"
            key={toast.id}
            onClick={() => dismiss(toast.id)}
            className={cn(
              'glass pointer-events-auto max-w-[min(26rem,100%)] rounded-full px-4 py-2.5 text-center text-[0.875rem] font-medium shadow-float',
              'transition-[opacity,translate] duration-200',
              toast.leaving ? '-translate-y-2 opacity-0' : 'animate-pop',
              toast.tone === 'error' ? 'text-danger' : 'text-ink',
            )}
          >
            {toast.message}
          </button>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastApi {
  const context = useContext(ToastContext)
  if (!context) throw new Error('useToast must be used inside ToastProvider')
  return context
}
