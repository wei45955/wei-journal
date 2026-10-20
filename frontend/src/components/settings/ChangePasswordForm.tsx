import { useState } from 'react'
import type { FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Field, TextInput } from '../ui'

interface ChangePasswordFormProps {
  busy: boolean
  onSubmit: (currentPassword: string, newPassword: string) => Promise<void>
}

/**
 * The form that replaces the account password.
 */
export function ChangePasswordForm({ busy, onSubmit }: ChangePasswordFormProps) {
  const { t } = useTranslation()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState('')

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (next.length < 8) {
      setError(t('settings.passwordTooShort', 'Use at least eight characters.'))
      return
    }
    if (next !== confirmation) {
      setError(t('settings.passwordMismatch', 'The two passwords are not the same.'))
      return
    }
    setError('')
    await onSubmit(current, next)
    setCurrent('')
    setNext('')
    setConfirmation('')
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3" noValidate>
      <Field label={t('settings.currentPassword')} htmlFor="current-password">
        <TextInput
          id="current-password"
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={(event) => setCurrent(event.target.value)}
          required
        />
      </Field>

      <Field label={t('settings.newPassword')} htmlFor="new-password">
        <TextInput
          id="new-password"
          type="password"
          autoComplete="new-password"
          value={next}
          onChange={(event) => setNext(event.target.value)}
          required
        />
      </Field>

      <Field
        label={t('settings.confirmPassword', 'Repeat the new password')}
        htmlFor="confirm-password"
        error={error}
      >
        <TextInput
          id="confirm-password"
          type="password"
          autoComplete="new-password"
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
          invalid={error !== ''}
          required
        />
      </Field>

      <div>
        <Button type="submit" loading={busy} disabled={busy}>
          {t('settings.changePassword')}
        </Button>
      </div>
    </form>
  )
}
