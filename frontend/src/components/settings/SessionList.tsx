import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../ui'
import { ConfirmDialog } from '../ui/Dialog'
import { formatDateTime } from '../../lib/format'
import type { Session } from '../../lib/types'

/** A short name for the device a session was opened on. */
function deviceLabel(agent: string): string {
  const lower = (agent || '').toLowerCase()
  let browser = 'Browser'
  if (lower.includes('edg/')) browser = 'Edge'
  else if (lower.includes('opr/')) browser = 'Opera'
  else if (lower.includes('firefox')) browser = 'Firefox'
  else if (lower.includes('chrome')) browser = 'Chrome'
  else if (lower.includes('safari')) browser = 'Safari'

  let platform = ''
  if (lower.includes('iphone')) platform = 'iPhone'
  else if (lower.includes('ipad')) platform = 'iPad'
  else if (lower.includes('android')) platform = 'Android'
  else if (lower.includes('windows')) platform = 'Windows'
  else if (lower.includes('mac os')) platform = 'macOS'
  else if (lower.includes('linux')) platform = 'Linux'

  return platform ? `${browser} · ${platform}` : browser
}

interface SessionListProps {
  sessions: Session[]
  language: string
  busy: boolean
  onRevoke: (id: number) => void
}

/**
 * The devices that are signed in, with the ones that are not welcome gone.
 */
export function SessionList({ sessions, language, busy, onRevoke }: SessionListProps) {
  const { t } = useTranslation()
  const [pending, setPending] = useState<Session | null>(null)

  if (sessions.length === 0) {
    return <p className="text-sm text-ink-muted">{t('settings.sessionsEmpty', 'No other devices.')}</p>
  }

  return (
    <>
      <ul className="flex flex-col gap-2">
        {sessions.map((session) => (
          <li
            key={session.id}
            className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-xl bg-paper-sunken/60 px-3.5 py-3"
          >
            <div className="min-w-0">
              <p className="text-[0.9375rem] text-ink-strong">
                {deviceLabel(session.userAgent)}
                {session.current ? (
                  <span className="ml-2 rounded-full bg-accent-soft px-2 py-0.5 text-xs text-accent-ink">
                    {t('settings.current')}
                  </span>
                ) : null}
              </p>
              <p className="mt-0.5 truncate text-xs text-ink-muted">
                {session.ip ? `${session.ip} · ` : ''}
                {formatDateTime(session.lastSeenAt, language)}
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              disabled={busy || session.current}
              onClick={() => setPending(session)}
              title={session.userAgent}
            >
              {t('settings.revoke')}
            </Button>
          </li>
        ))}
      </ul>

      <ConfirmDialog
        open={pending !== null}
        onClose={() => setPending(null)}
        onConfirm={() => {
          if (pending) onRevoke(pending.id)
          setPending(null)
        }}
        title={t('settings.revoke')}
        description={t('settings.revokeConfirm')}
        confirmLabel={t('settings.revoke')}
        destructive
        busy={busy}
      />
    </>
  )
}
