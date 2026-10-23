import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/cn'
import { createFolder, useFolders } from '../../state/library'
import { useToast } from '../../state/toast'
import { Button, TextInput } from '../../ui'
import { Sheet } from '../../ui/Sheet'
import { CheckIcon, FolderIcon, InboxIcon, PlusIcon, StackIcon } from '../../ui/icons'

export type Scope = number | 'none' | undefined

/** Chooses which part of the journal is shown: everything, the unfiled entries or one folder. */
export function ScopeSheet({ open, onClose, scope }: { open: boolean; onClose: () => void; scope: Scope }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { folders } = useFolders()
  const { notify, describe } = useToast()
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  function go(next: Scope) {
    onClose()
    navigate(next === undefined ? '/' : `/folder/${next}`, { replace: true })
  }

  async function add(event: React.FormEvent) {
    event.preventDefault()
    if (!name.trim() || busy) return
    setBusy(true)
    try {
      const folder = await createFolder(name)
      setName('')
      setAdding(false)
      go(folder.id)
    } catch (error) {
      notify(describe(error), 'error')
    } finally {
      setBusy(false)
    }
  }

  const row = (active: boolean) =>
    cn(
      'flex min-h-[52px] w-full items-center gap-3.5 rounded-[14px] px-3 text-left text-[1rem] transition-colors active:bg-well',
      active ? 'text-accent' : 'text-ink',
    )

  return (
    <Sheet open={open} onClose={onClose} title={t('timeline.scopeTitle')} width="sm">
      <ul className="-mx-2">
        <li>
          <button type="button" className={row(scope === undefined)} onClick={() => go(undefined)}>
            <StackIcon size={22} className="text-ink-2" />
            <span className="flex-1">{t('timeline.allEntries')}</span>
            {scope === undefined ? <CheckIcon size={20} /> : null}
          </button>
        </li>
        <li>
          <button type="button" className={row(scope === 'none')} onClick={() => go('none')}>
            <InboxIcon size={22} className="text-ink-2" />
            <span className="flex-1">{t('timeline.unfiled')}</span>
            {scope === 'none' ? <CheckIcon size={20} /> : null}
          </button>
        </li>
      </ul>

      {folders.length > 0 ? <div className="my-2 h-px bg-rule" /> : null}

      <ul className="-mx-2">
        {folders.map((folder) => (
          <li key={folder.id}>
            <button type="button" className={row(scope === folder.id)} onClick={() => go(folder.id)}>
              <FolderIcon size={22} className="text-ink-2" />
              <span className="min-w-0 flex-1 truncate">{folder.name}</span>
              {scope === folder.id ? (
                <CheckIcon size={20} />
              ) : (
                <span className="tnum text-[0.875rem] text-ink-3">{folder.entryCount}</span>
              )}
            </button>
          </li>
        ))}
      </ul>

      <div className="mt-2 border-t border-rule pt-3">
        {adding ? (
          <form onSubmit={add} className="flex items-center gap-2 animate-fade">
            <TextInput
              autoFocus
              value={name}
              maxLength={80}
              placeholder={t('timeline.folderName')}
              aria-label={t('timeline.folderName')}
              onChange={(event) => setName(event.target.value)}
            />
            <Button type="submit" tone="primary" loading={busy} disabled={!name.trim()}>
              {t('common.add')}
            </Button>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="press flex h-11 items-center gap-2 rounded-full px-1 text-[0.9375rem] font-medium text-accent"
          >
            <PlusIcon size={20} />
            {t('timeline.newFolder')}
          </button>
        )}
      </div>
    </Sheet>
  )
}
