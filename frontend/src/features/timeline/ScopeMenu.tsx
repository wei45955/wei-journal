import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/cn'
import { createFolder, useFolders } from '../../state/library'
import { useToast } from '../../state/toast'
import { Button, TextInput } from '../../ui'
import { Popover } from '../../ui/Popover'
import { CheckIcon, FolderIcon, InboxIcon, PlusIcon, StackIcon } from '../../ui/icons'

export type Scope = number | 'none' | undefined

/**
 * Chooses which part of the journal is shown: everything, the unfiled entries
 * or one folder. It opens beside the title it belongs to.
 */
export function ScopeMenu({
  open,
  onClose,
  anchorRef,
  scope,
}: {
  open: boolean
  onClose: () => void
  anchorRef: RefObject<HTMLElement | null>
  scope: Scope
}) {
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
      'flex min-h-[44px] w-full items-center gap-3 rounded-[12px] px-2.5 text-left text-[0.9375rem] transition-colors active:bg-well',
      active ? 'text-accent' : 'text-ink',
    )

  return (
    <Popover
      open={open}
      onClose={onClose}
      anchorRef={anchorRef}
      placement="bottom-start"
      label={t('timeline.scopeTitle')}
      className="w-[15rem] max-w-[calc(100vw_-_1.5rem)] p-1.5"
    >
      <ul>
        <li>
          <button type="button" className={row(scope === undefined)} onClick={() => go(undefined)}>
            <StackIcon size={21} className="text-ink-2" />
            <span className="flex-1">{t('timeline.allEntries')}</span>
            {scope === undefined ? <CheckIcon size={19} /> : null}
          </button>
        </li>
        <li>
          <button type="button" className={row(scope === 'none')} onClick={() => go('none')}>
            <InboxIcon size={21} className="text-ink-2" />
            <span className="flex-1">{t('timeline.unfiled')}</span>
            {scope === 'none' ? <CheckIcon size={19} /> : null}
          </button>
        </li>
      </ul>

      {folders.length > 0 ? <div className="my-1.5 h-px bg-rule" /> : null}

      <ul>
        {folders.map((folder) => (
          <li key={folder.id}>
            <button type="button" className={row(scope === folder.id)} onClick={() => go(folder.id)}>
              <FolderIcon size={21} className="text-ink-2" />
              <span className="min-w-0 flex-1 truncate">{folder.name}</span>
              {scope === folder.id ? (
                <CheckIcon size={19} />
              ) : (
                <span className="tnum text-[0.8125rem] text-ink-3">{folder.entryCount}</span>
              )}
            </button>
          </li>
        ))}
      </ul>

      <div className="mt-1.5 border-t border-rule pt-1.5">
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
            className="press flex h-10 items-center gap-2 rounded-[12px] px-2.5 text-[0.9375rem] font-medium text-accent"
          >
            <PlusIcon size={19} />
            {t('timeline.newFolder')}
          </button>
        )}
      </div>
    </Popover>
  )
}
