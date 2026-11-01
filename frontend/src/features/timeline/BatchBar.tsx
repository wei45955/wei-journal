import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { api } from '../../lib/api'
import { cn } from '../../lib/cn'
import { afterEntryChange, useFolders, useTags } from '../../state/library'
import { useToast } from '../../state/toast'
import { Sheet, ConfirmSheet } from '../../ui/Sheet'
import { FolderIcon, InboxIcon, TagIcon, TrashIcon } from '../../ui/icons'

/** The actions for the selected entries, pinned where the tab bar was. */
export function BatchBar({ selected, onDone }: { selected: number[]; onDone: () => void }) {
  const { t } = useTranslation()
  const { notify, describe } = useToast()
  const { folders } = useFolders()
  const { tags } = useTags()
  const [sheet, setSheet] = useState<'move' | 'tag' | 'delete' | null>(null)
  const [busy, setBusy] = useState(false)
  const count = selected.length

  async function run(
    request: Parameters<typeof api.batch>[0],
    message: 'batch.moved' | 'batch.tagged' | 'batch.deleted',
    finish = true,
  ) {
    setBusy(true)
    try {
      const result = await api.batch({ ...request, entryIds: selected })
      afterEntryChange()
      notify(t(message, { count: result.affected }))
      setSheet(null)
      if (finish) onDone()
    } catch (error) {
      notify(describe(error), 'error')
    } finally {
      setBusy(false)
    }
  }

  const action = (icon: React.ReactNode, label: string, onClick: () => void, danger = false) => (
    <button
      type="button"
      disabled={count === 0 || busy}
      onClick={onClick}
      className={cn(
        'press flex h-14 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg text-xs font-medium disabled:opacity-35',
        danger ? 'text-danger' : 'text-accent',
      )}
    >
      {icon}
      {label}
    </button>
  )

  const row = 'title-2 flex min-h-13 w-full items-center gap-3.5 rounded-lg px-3 text-left text-ink hover:bg-well'

  return createPortal(
    <>
      <div className="fixed inset-x-0 bottom-0 z-[60] flex justify-center px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] animate-rise lg:pl-[17rem]">
        <div className="glass flex h-14 w-full max-w-md items-center rounded-xl px-1 shadow-float hairline">
          {action(<FolderIcon size={22} />, t('batch.move'), () => setSheet('move'))}
          {action(<TagIcon size={22} />, t('batch.tag'), () => setSheet('tag'))}
          {action(<TrashIcon size={22} />, t('batch.delete'), () => setSheet('delete'), true)}
        </div>
      </div>

      <Sheet open={sheet === 'move'} onClose={() => setSheet(null)} title={t('batch.moveTitle')} width="sm">
        <ul className="-mx-2">
          <li>
            <button type="button" disabled={busy} className={row} onClick={() => void run({ action: 'moveToDefault' }, 'batch.moved')}>
              <InboxIcon size={22} className="text-ink-2" />
              {t('timeline.unfiled')}
            </button>
          </li>
          {folders.map((folder) => (
            <li key={folder.id}>
              <button
                type="button"
                disabled={busy}
                className={row}
                onClick={() => void run({ action: 'moveToFolder', folderId: folder.id }, 'batch.moved')}
              >
                <FolderIcon size={22} className="text-ink-2" />
                <span className="truncate">{folder.name}</span>
              </button>
            </li>
          ))}
        </ul>
      </Sheet>

      <Sheet open={sheet === 'tag'} onClose={() => setSheet(null)} title={t('batch.tagTitle')} width="sm">
        {tags.length === 0 ? (
          <p className="body-2 py-4 text-ink-3">{t('filters.noTags')}</p>
        ) : (
          <ul className="divide-y divide-rule">
            {tags.map((tag) => (
              <li key={tag.id} className="flex min-h-13 items-center gap-2">
                <span className="title-2 min-w-0 flex-1 truncate text-ink">#{tag.name}</span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void run({ action: 'removeTags', tagIds: [tag.id] }, 'batch.tagged', false)}
                  className="press h-9 rounded-md px-3 text-sm text-ink-2 hover:bg-well"
                >
                  {t('batch.removeTag')}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void run({ action: 'addTags', tagIds: [tag.id] }, 'batch.tagged', false)}
                  className="press h-9 rounded-md bg-accent-soft px-3.5 text-sm font-medium text-accent hover:bg-accent-soft/70"
                >
                  {t('batch.addTag')}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Sheet>

      <ConfirmSheet
        open={sheet === 'delete'}
        onClose={() => setSheet(null)}
        title={t('batch.deleteTitle', { count })}
        body={t('batch.deleteBody')}
        confirmLabel={t('batch.delete')}
        destructive
        busy={busy}
        onConfirm={() => void run({ action: 'delete' }, 'batch.deleted')}
      />
    </>,
    document.body,
  )
}
