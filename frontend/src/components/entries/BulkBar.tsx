import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../../lib/api'
import { useFolders } from '../../hooks/useFolders'
import { useTags } from '../../hooks/useTags'
import { useToast } from '../../state/toast'
import { Button } from '../ui'
import { ConfirmDialog } from '../ui/Dialog'
import { FolderIcon, TrashIcon } from '../icons'

interface BulkBarProps {
  selected: number[]
  onClear: () => void
  onDone: () => void
}

/** The action bar that appears while entries are selected in the timeline. */
export function BulkBar({ selected, onClear, onDone }: BulkBarProps) {
  const { t } = useTranslation()
  const { notify, describe } = useToast()
  const { folders } = useFolders()
  const { tags } = useTags()
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  if (selected.length === 0) return null

  async function run(action: Parameters<typeof api.batch>[0]['action'], extra?: { folderId?: number; tagIds?: number[] }) {
    setBusy(true)
    try {
      const result = await api.batch({
        action,
        entryIds: selected,
        folderId: extra?.folderId,
        tagIds: extra?.tagIds,
      })
      notify(
        action === 'delete'
          ? t('batch.done')
          : t('batch.done') + ` (${result.affected})`,
        'success',
      )
      onDone()
    } catch (err) {
      notify(describe(err, t('errors.generic')), 'error')
    } finally {
      setBusy(false)
      setConfirmDelete(false)
    }
  }

  return (
    <>
      <div className="sticky bottom-[calc(env(safe-area-inset-bottom,0px)+4.75rem)] z-20 mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-line bg-paper-overlay/95 p-2 shadow-lg backdrop-blur-md lg:bottom-4">
        <span className="px-1 text-sm font-medium text-ink">
          {selected.length === 1 ? t('batch.oneSelected') : t('batch.selected', { count: selected.length })}
        </span>

        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          {folders.length > 0 ? (
            <select
              defaultValue=""
              disabled={busy}
              onChange={(event) => {
                if (!event.target.value) return
                const folderId = Number(event.target.value)
                event.target.value = ''
                void run('moveToFolder', { folderId })
              }}
              className="rounded-md border border-line bg-paper-raised px-2 py-1.5 text-xs text-ink focus:border-accent focus:outline-none"
              aria-label={t('batch.moveToFolder')}
            >
              <option value="">{t('batch.moveToFolder')}…</option>
              {folders.map((folder) => (
                <option key={folder.id} value={folder.id}>
                  {folder.name}
                </option>
              ))}
            </select>
          ) : null}

          {tags.length > 0 ? (
            <select
              defaultValue=""
              disabled={busy}
              onChange={(event) => {
                if (!event.target.value) return
                const tagId = Number(event.target.value)
                event.target.value = ''
                void run('addTags', { tagIds: [tagId] })
              }}
              className="rounded-md border border-line bg-paper-raised px-2 py-1.5 text-xs text-ink focus:border-accent focus:outline-none"
              aria-label={t('batch.addTags')}
            >
              <option value="">{t('batch.addTags')}…</option>
              {tags.map((tag) => (
                <option key={tag.id} value={tag.id}>
                  {tag.name}
                </option>
              ))}
            </select>
          ) : null}

          <Button size="sm" variant="ghost" disabled={busy} onClick={() => void run('moveToDefault')}>
            <FolderIcon size={15} />
            {t('batch.moveToDefault')}
          </Button>

          <Button size="sm" variant="danger" disabled={busy} onClick={() => setConfirmDelete(true)}>
            <TrashIcon size={15} />
            {t('batch.delete')}
          </Button>

          <Button size="sm" variant="ghost" disabled={busy} onClick={onClear}>
            {t('batch.clear')}
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title={t('batch.deleteConfirm', { count: selected.length })}
        description={t('batch.deleteWarning')}
        confirmLabel={t('batch.delete')}
        destructive
        busy={busy}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => void run('delete')}
      />
    </>
  )
}
