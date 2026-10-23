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
        'press flex h-[52px] flex-1 flex-col items-center justify-center gap-[3px] rounded-full text-[0.6875rem] font-medium disabled:opacity-35',
        danger ? 'text-danger' : 'text-accent',
      )}
    >
      {icon}
      {label}
    </button>
  )

  const row = 'flex min-h-[52px] w-full items-center gap-3.5 rounded-[14px] px-3 text-left text-[1rem] text-ink active:bg-well'

  return createPortal(
    <>
      <div className="fixed inset-x-0 bottom-0 z-[60] flex justify-center px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] animate-rise lg:pl-[17rem]">
        <div className="glass flex h-[62px] w-full max-w-[26rem] items-center rounded-full px-2 shadow-float">
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
          <p className="py-4 text-[0.9375rem] text-ink-3">{t('filters.noTags')}</p>
        ) : (
          <ul className="divide-y divide-rule">
            {tags.map((tag) => (
              <li key={tag.id} className="flex min-h-[52px] items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-[1rem] text-ink">#{tag.name}</span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void run({ action: 'removeTags', tagIds: [tag.id] }, 'batch.tagged', false)}
                  className="press h-9 rounded-full px-3 text-[0.875rem] text-ink-2"
                >
                  {t('batch.removeTag')}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void run({ action: 'addTags', tagIds: [tag.id] }, 'batch.tagged', false)}
                  className="press h-9 rounded-full bg-accent-soft px-3.5 text-[0.875rem] font-medium text-accent"
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
