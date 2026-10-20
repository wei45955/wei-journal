import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { ApiError } from '../lib/api'

export type ToastTone = 'info' | 'success' | 'error'

interface Toast {
  id: number
  message: string
  tone: ToastTone
}

interface ToastState {
  notify: (message: string, tone?: ToastTone) => void
  /** Turns an unknown thrown value into a readable message. */
  describe: (error: unknown, fallback: string) => string
}

const ToastContext = createContext<ToastState | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextId = useRef(1)

  const notify = useCallback((message: string, tone: ToastTone = 'info') => {
    const id = nextId.current++
    setToasts((current) => [...current, { id, message, tone }])
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id))
    }, tone === 'error' ? 6000 : 3500)
  }, [])

  const describe = useCallback((error: unknown, fallback: string) => {
    if (error instanceof ApiError) {
      if (error.code === 'validation_error') {
        const first = Object.values(error.details)[0]
        return first ?? error.message ?? fallback
      }
      if (error.isUnauthorized) return error.message || 'Please sign in again.'
      return error.message || fallback
    }
    if (error instanceof TypeError) return 'The server could not be reached.'
    return fallback
  }, [])

  const value = useMemo<ToastState>(() => ({ notify, describe }), [notify, describe])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 px-4 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)] sm:items-end sm:px-6"
        role="status"
        aria-live="polite"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={[
              'pointer-events-auto max-w-sm rounded-2xl border px-4 py-3 text-sm shadow-float backdrop-blur-xl animate-fade-rise',
              toast.tone === 'error'
                ? 'border-danger/30 bg-danger-soft text-danger'
                : toast.tone === 'success'
                  ? 'border-success/30 bg-sage-soft text-success'
                  : 'border-line/60 bg-paper-overlay/90 text-ink',
            ].join(' ')}
          >
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastState {
  const context = useContext(ToastContext)
  if (!context) throw new Error('useToast must be used inside ToastProvider')
  return context
}
