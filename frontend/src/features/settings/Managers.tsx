import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Folder, Tag } from '../../lib/types'
import { deleteFolder, deleteTag, renameFolder, renameTag, reorderFolders, useFolders, useTags } from '../../state/library'
import { useToast } from '../../state/toast'
import { Button, IconButton, TextInput } from '../../ui'
import { ActionSheet, ConfirmSheet, Sheet } from '../../ui/Sheet'
import { ArrowDownIcon, ArrowUpIcon, FolderIcon, MoreIcon, PenIcon, TrashIcon } from '../../ui/icons'
import { Group } from './parts'

function RenameSheet({
  open,
  title,
  initial,
  onClose,
  onSave,
}: {
  open: boolean
  title: string
  initial: string
  onClose: () => void
  onSave: (name: string) => Promise<void>
}) {
  const { t } = useTranslation()
  const [name, setName] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [lastInitial, setLastInitial] = useState(initial)
  if (initial !== lastInitial) {
    setLastInitial(initial)
    setName(initial)
  }
  return (
    <Sheet open={open} onClose={onClose} title={title} width="sm">
      <form
        className="flex flex-col gap-3 pt-1 pb-2"
        onSubmit={async (event) => {
          event.preventDefault()
          if (!name.trim() || busy) return
          setBusy(true)
          try {
            await onSave(name)
            onClose()
          } finally {
            setBusy(false)
          }
        }}
      >
        <TextInput autoFocus value={name} maxLength={120} onChange={(event) => setName(event.target.value)} aria-label={title} />
        <Button type="submit" tone="primary" loading={busy} disabled={!name.trim()} className="self-end">
          {t('common.save')}
        </Button>
      </form>
    </Sheet>
  )
}

export function FolderManager() {
  const { t } = useTranslation()
  const { folders } = useFolders()
  const { notify, describe } = useToast()
  const [menu, setMenu] = useState<Folder | null>(null)
  const [renaming, setRenaming] = useState<Folder | null>(null)
  const [removing, setRemoving] = useState<Folder | null>(null)
  const [permanent, setPermanent] = useState(false)
  const [busy, setBusy] = useState(false)

  async function move(folder: Folder, delta: number) {
    const ids = folders.map((item) => item.id)
    const index = ids.indexOf(folder.id)
    const target = index + delta
    if (target < 0 || target >= ids.length) return
    ;[ids[index], ids[target]] = [ids[target], ids[index]]
    try {
      await reorderFolders(ids)
    } catch (error) {
      notify(describe(error), 'error')
    }
  }

  async function remove(folder: Folder, strategy: 'default' | 'delete') {
    setBusy(true)
    try {
      await deleteFolder(folder.id, strategy)
      notify(t('settings.folderDeleted'))
      setRemoving(null)
      setPermanent(false)
    } catch (error) {
      notify(describe(error), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Group id="folders" title={t('settings.folders')}>
      {folders.length === 0 ? (
        <p className="px-4 py-4 text-[0.9375rem] leading-relaxed text-ink-3">{t('settings.noFolders')}</p>
      ) : (
        folders.map((folder, index) => (
          <div key={folder.id} className="flex min-h-[52px] items-center gap-3 pr-1 pl-4">
            <FolderIcon size={20} className="shrink-0 text-ink-3" />
            <span className="min-w-0 flex-1 truncate text-[1rem] text-ink">{folder.name}</span>
            <span className="tnum text-[0.8125rem] text-ink-3">{folder.entryCount}</span>
            <IconButton size="sm" label={t('settings.moveUp')} disabled={index === 0} onClick={() => void move(folder, -1)} className="text-ink-2">
              <ArrowUpIcon size={18} />
            </IconButton>
            <IconButton size="sm" label={t('nav.more')} onClick={() => setMenu(folder)} className="text-ink-2">
              <MoreIcon size={20} />
            </IconButton>
          </div>
        ))
      )}

      <ActionSheet
        open={menu !== null}
        onClose={() => setMenu(null)}
        title={menu?.name}
        actions={
          menu
            ? [
                { id: 'rename', label: t('settings.renameFolder'), icon: <PenIcon size={22} />, onSelect: () => setRenaming(menu) },
                {
                  id: 'down',
                  label: t('settings.moveDown'),
                  icon: <ArrowDownIcon size={22} />,
                  disabled: folders[folders.length - 1]?.id === menu.id,
                  onSelect: () => void move(menu, 1),
                },
                { id: 'delete', label: t('common.delete'), icon: <TrashIcon size={22} />, destructive: true, onSelect: () => setRemoving(menu) },
              ]
            : []
        }
      />
      <RenameSheet
        open={renaming !== null}
        title={t('settings.renameFolder')}
        initial={renaming?.name ?? ''}
        onClose={() => setRenaming(null)}
        onSave={async (name) => {
          if (!renaming) return
          try {
            await renameFolder(renaming.id, name)
          } catch (error) {
            notify(describe(error), 'error')
            throw error
          }
        }}
      />
      <Sheet open={removing !== null && !permanent} onClose={() => setRemoving(null)} width="sm" label={t('settings.deleteFolderTitle', { name: removing?.name ?? '' })}>
        <h2 className="pt-3 text-center font-serif text-[1.375rem] leading-snug text-ink sm:pt-6">
          {t('settings.deleteFolderTitle', { name: removing?.name ?? '' })}
        </h2>
        <div className="mt-6 flex flex-col gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => removing && void remove(removing, 'default')}
            className="press rounded-[16px] bg-well px-4 py-3.5 text-left disabled:opacity-50"
          >
            <span className="block text-[1rem] font-medium text-ink">{t('settings.keepEntries')}</span>
            <span className="block text-[0.8125rem] text-ink-2">{t('settings.keepEntriesHint')}</span>
          </button>
          <button
            type="button"
            disabled={busy || (removing?.entryCount ?? 0) === 0}
            onClick={() => setPermanent(true)}
            className="press rounded-[16px] bg-danger-soft px-4 py-3.5 text-left disabled:opacity-40"
          >
            <span className="block text-[1rem] font-medium text-danger">
              {t('settings.deleteEntries', { count: removing?.entryCount ?? 0 })}
            </span>
            <span className="block text-[0.8125rem] text-danger/80">{t('settings.deleteEntriesHint')}</span>
          </button>
          <Button block size="lg" tone="quiet" onClick={() => setRemoving(null)}>
            {t('common.cancel')}
          </Button>
        </div>
      </Sheet>
      <ConfirmSheet
        open={removing !== null && permanent}
        onClose={() => setPermanent(false)}
        title={t('settings.deleteEntries', { count: removing?.entryCount ?? 0 })}
        body={t('settings.deleteEntriesHint')}
        confirmLabel={t('settings.confirmPermanent')}
        destructive
        busy={busy}
        onConfirm={() => removing && void remove(removing, 'delete')}
      />
    </Group>
  )
}

export function TagManager() {
  const { t } = useTranslation()
  const { tags } = useTags()
  const { notify, describe } = useToast()
  const [menu, setMenu] = useState<Tag | null>(null)
  const [renaming, setRenaming] = useState<Tag | null>(null)
  const [removing, setRemoving] = useState<Tag | null>(null)
  const [busy, setBusy] = useState(false)

  return (
    <Group id="tags" title={t('settings.tags')}>
      {tags.length === 0 ? (
        <p className="px-4 py-4 text-[0.9375rem] text-ink-3">{t('settings.noTags')}</p>
      ) : (
        <div className="flex flex-wrap gap-2 p-4">
          {tags.map((tag) => (
            <button
              key={tag.id}
              type="button"
              onClick={() => setMenu(tag)}
              className="press flex h-9 items-center gap-1.5 rounded-full bg-well px-3.5 text-[0.875rem] text-ink"
            >
              #{tag.name}
              <span className="tnum text-[0.75rem] text-ink-3">{tag.entryCount}</span>
            </button>
          ))}
        </div>
      )}
      <ActionSheet
        open={menu !== null}
        onClose={() => setMenu(null)}
        title={menu ? `#${menu.name}` : undefined}
        actions={
          menu
            ? [
                { id: 'rename', label: t('settings.renameTag'), icon: <PenIcon size={22} />, onSelect: () => setRenaming(menu) },
                { id: 'delete', label: t('common.delete'), icon: <TrashIcon size={22} />, destructive: true, onSelect: () => setRemoving(menu) },
              ]
            : []
        }
      />
      <RenameSheet
        open={renaming !== null}
        title={t('settings.renameTag')}
        initial={renaming?.name ?? ''}
        onClose={() => setRenaming(null)}
        onSave={async (name) => {
          if (!renaming) return
          try {
            await renameTag(renaming.id, name)
          } catch (error) {
            notify(describe(error), 'error')
            throw error
          }
        }}
      />
      <ConfirmSheet
        open={removing !== null}
        onClose={() => setRemoving(null)}
        title={t('settings.deleteTagTitle', { name: removing?.name ?? '' })}
        body={t('settings.deleteTagBody', { count: removing?.entryCount ?? 0 })}
        confirmLabel={t('common.delete')}
        destructive
        busy={busy}
        onConfirm={async () => {
          if (!removing) return
          setBusy(true)
          try {
            await deleteTag(removing.id)
            notify(t('settings.tagDeleted'))
            setRemoving(null)
          } catch (error) {
            notify(describe(error), 'error')
          } finally {
            setBusy(false)
          }
        }}
      />
    </Group>
  )
}
