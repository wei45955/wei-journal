import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/cn'
import { useFolders } from '../../hooks/useFolders'
import { useTags } from '../../hooks/useTags'
import { Button } from '../ui'
import { CloseIcon, PinIcon, TagIcon } from '../icons'
import type { TimelineFilters } from './filters'
import { hasActiveFilters } from './filters'

const mediaTypes = ['image', 'video', 'audio', 'file', 'livephoto'] as const

interface FilterBarProps {
  filters: TimelineFilters
  onChange: (next: TimelineFilters) => void
  /** Hides the folder selector when the timeline is already scoped to a folder. */
  showFolder?: boolean
}

/** The filter strip shown above the timeline. */
export function FilterBar({ filters, onChange, showFolder = true }: FilterBarProps) {
  const { t } = useTranslation()
  const { folders } = useFolders()
  const { tags } = useTags()
  const [open, setOpen] = useState(false)

  const active = hasActiveFilters(filters)

  function set(patch: Partial<TimelineFilters>) {
    onChange({ ...filters, ...patch })
  }

  function toggleTag(id: number) {
    const next = filters.tagIds.includes(id)
      ? filters.tagIds.filter((value) => value !== id)
      : [...filters.tagIds, id]
    set({ tagIds: next })
  }

  return (
    <div className="rounded-lg border border-line bg-paper-raised/60">
      <div className="flex items-center gap-2 px-3 py-2">
        <Button
          variant={open || active ? 'secondary' : 'ghost'}
          size="sm"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
        >
          <TagIcon size={15} />
          {t('search.filters')}
        </Button>

        <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto no-scrollbar">
          {showFolder ? (
            <select
              value={filters.folderId === undefined ? '' : String(filters.folderId)}
              onChange={(event) => {
                const raw = event.target.value
                if (raw === '') set({ folderId: undefined })
                else if (raw === 'none') set({ folderId: 'none' })
                else set({ folderId: Number(raw) })
              }}
              className="shrink-0 rounded-full border border-line bg-paper-raised px-2.5 py-1 text-xs text-ink-muted focus:border-accent focus:outline-none"
              aria-label={t('entries.folder')}
            >
              <option value="">{t('common.all')}</option>
              <option value="none">{t('entries.noFolder')}</option>
              {folders.map((folder) => (
                <option key={folder.id} value={folder.id}>
                  {folder.name}
                </option>
              ))}
            </select>
          ) : null}

          {tags.map((tag) => (
            <button
              key={tag.id}
              type="button"
              onClick={() => toggleTag(tag.id)}
              aria-pressed={filters.tagIds.includes(tag.id)}
              className={cn(
                'shrink-0 rounded-full border px-2.5 py-1 text-xs transition-colors',
                filters.tagIds.includes(tag.id)
                  ? 'border-accent bg-accent-soft text-accent-ink'
                  : 'border-line bg-paper-raised text-ink-muted hover:border-line-strong',
              )}
            >
              {tag.name}
            </button>
          ))}

          <button
            type="button"
            onClick={() => set({ pinned: !filters.pinned })}
            aria-pressed={Boolean(filters.pinned)}
            className={cn(
              'flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors',
              filters.pinned
                ? 'border-accent bg-accent-soft text-accent-ink'
                : 'border-line bg-paper-raised text-ink-muted hover:border-line-strong',
            )}
          >
            <PinIcon size={12} />
            {t('entries.pinned')}
          </button>
        </div>

        {active ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              onChange({ tagIds: [], tagMode: filters.tagMode, folderId: undefined })
            }
            aria-label={t('tags.clearFilter')}
          >
            <CloseIcon size={14} />
          </Button>
        ) : null}
      </div>

      {open ? (
        <div className="grid gap-3 border-t border-line px-3 py-3 sm:grid-cols-2">
          {tags.length > 1 ? (
            <div className="flex items-center gap-3 sm:col-span-2">
              <span className="text-xs font-medium text-ink-faint">{t('tags.filter')}</span>
              <label className="flex items-center gap-1.5 text-xs text-ink-muted">
                <input
                  type="radio"
                  name="tagMode"
                  checked={filters.tagMode === 'any'}
                  onChange={() => set({ tagMode: 'any' })}
                  className="accent-[var(--accent)]"
                />
                {t('tags.anyOf')}
              </label>
              <label className="flex items-center gap-1.5 text-xs text-ink-muted">
                <input
                  type="radio"
                  name="tagMode"
                  checked={filters.tagMode === 'all'}
                  onChange={() => set({ tagMode: 'all' })}
                  className="accent-[var(--accent)]"
                />
                {t('tags.allOf')}
              </label>
            </div>
          ) : null}

          <label className="flex flex-col gap-1 text-xs text-ink-faint">
            {t('search.from')}
            <input
              type="date"
              value={filters.from ?? ''}
              onChange={(event) => set({ from: event.target.value || undefined })}
              className="rounded-md border border-line bg-paper-raised px-2.5 py-1.5 text-sm text-ink focus:border-accent focus:outline-none"
            />
          </label>

          <label className="flex flex-col gap-1 text-xs text-ink-faint">
            {t('search.to')}
            <input
              type="date"
              value={filters.to ?? ''}
              onChange={(event) => set({ to: event.target.value || undefined })}
              className="rounded-md border border-line bg-paper-raised px-2.5 py-1.5 text-sm text-ink focus:border-accent focus:outline-none"
            />
          </label>

          <label className="flex flex-col gap-1 text-xs text-ink-faint sm:col-span-2">
            {t('entries.attachments')}
            <select
              value={filters.mediaType ?? ''}
              onChange={(event) => set({ mediaType: event.target.value || undefined })}
              className="rounded-md border border-line bg-paper-raised px-2.5 py-1.5 text-sm text-ink focus:border-accent focus:outline-none"
            >
              <option value="">{t('common.all')}</option>
              {mediaTypes.map((kind) => (
                <option key={kind} value={kind}>
                  {t(`media.${kind === 'livephoto' ? 'livePhoto' : kind}`)}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : null}
    </div>
  )
}
