import { useState } from 'react'
import type { FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useFolders } from '../../hooks/useFolders'
import { useToast } from '../../state/toast'
import { Button, TextInput } from '../ui'
import type { Folder } from '../../lib/types'

/**
 * A name field and a button that creates a folder. The editor and the
 * sidebar both use it, so a folder can be added where it is chosen.
 */
export function NewFolderForm({
  onCreated,
  className,
}: {
  onCreated?: (folder: Folder) => void
  className?: string
}) {
  const { t } = useTranslation()
  const { create } = useFolders()
  const { notify, describe } = useToast()
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed || busy) return
    setBusy(true)
    try {
      const folder = await create(trimmed)
      setName('')
      notify(t('folders.created'), 'success')
      onCreated?.(folder)
    } catch (err) {
      notify(describe(err, t('errors.generic')), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)} className={className}>
      <div className="flex items-center gap-2">
        <TextInput
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={t('folders.name')}
          aria-label={t('folders.name')}
          maxLength={200}
          disabled={busy}
          className="min-w-0 flex-1"
        />
        <Button
          type="submit"
          size="sm"
          variant="secondary"
          disabled={busy || name.trim() === ''}
          loading={busy}
          className="shrink-0"
        >
          {t('folders.new')}
        </Button>
      </div>
    </form>
  )
}
