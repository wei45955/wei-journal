import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/cn'
import { useFolders } from '../../hooks/useFolders'
import { useTags } from '../../hooks/useTags'
import { ChevronDownIcon, CloseIcon, PinIcon, TagIcon } from '../icons'
import type { TimelineFilters } from './filters'
import { hasActiveFilters } from './filters'

const mediaTypes = ['image', 'video', 'audio', 'file', 'livephoto'] as const

interface FilterBarProps {
  filters: TimelineFilters
  onChange: (next: TimelineFilters) => void
  /** Hides the folder selector when the timeline is already scoped to a folder. */
  showFolder?: boolean
}

/**
 * The filter strip above the timeline. It stays pinned to the top of the
 * screen so the filters are always one tap away.
 */
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
    <div className="sticky top-[var(--header-h)] z-30 -mx-4 mb-3 border-b border-line/50 bg-paper/88 px-4 py-2 backdrop-blur-xl sm:-mx-6 sm:px-6">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          className={cn(
            'flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold transition-colors',
            open || active
              ? 'bg-accent text-accent-contrast'
              : 'bg-paper-sunken text-ink-muted hover:text-ink',
          )}
        >
          <TagIcon size={15} />
          {t('search.filters')}
          <ChevronDownIcon
            size={13}
            className={cn('transition-transform duration-200', open && 'rotate-180')}
          />
        </button>

        <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto no-scrollbar">
          {showFolder ? (
            <span className="relative shrink-0">
              <select
                value={filters.folderId === undefined ? '' : String(filters.folderId)}
                onChange={(event) => {
                  const raw = event.target.value
                  if (raw === '') set({ folderId: undefined })
                  else if (raw === 'none') set({ folderId: 'none' })
                  else set({ folderId: Number(raw) })
                }}
                className="cursor-pointer appearance-none rounded-full border border-line bg-paper-raised py-1.5 pr-7 pl-3 text-sm text-ink transition-colors hover:border-line-strong focus:border-accent focus:outline-none"
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
              <ChevronDownIcon
                size={12}
                className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-ink-faint"
              />
            </span>
          ) : null}

          {tags.map((tag) => (
            <button
              key={tag.id}
              type="button"
              onClick={() => toggleTag(tag.id)}
              aria-pressed={filters.tagIds.includes(tag.id)}
              className={cn(
                'shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
                filters.tagIds.includes(tag.id)
                  ? 'border-accent bg-accent text-accent-contrast'
                  : 'border-line bg-paper-raised text-ink-muted hover:border-line-strong hover:text-ink',
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
              'flex shrink-0 items-center gap-1 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
              filters.pinned
                ? 'border-accent bg-accent text-accent-contrast'
                : 'border-line bg-paper-raised text-ink-muted hover:border-line-strong hover:text-ink',
            )}
          >
            <PinIcon size={13} />
            {t('entries.pinned')}
          </button>
        </div>

        {active ? (
          <button
            type="button"
            onClick={() => onChange({ tagIds: [], tagMode: filters.tagMode, folderId: undefined })}
            aria-label={t('tags.clearFilter')}
            className="flex size-7 shrink-0 items-center justify-center rounded-full text-ink-faint transition-colors hover:bg-paper-sunken hover:text-ink"
          >
            <CloseIcon size={14} />
          </button>
        ) : null}
      </div>

      {open ? (
        <div className="card mt-2 max-h-[60vh] overflow-y-auto p-3.5 animate-sheet-up">
          <div className="grid gap-3 sm:grid-cols-2">
            {tags.length > 1 ? (
              <div className="flex items-center gap-3 sm:col-span-2">
                <span className="text-xs font-semibold tracking-wide text-ink-faint uppercase">
                  {t('tags.filter')}
                </span>
                <label className="flex items-center gap-1.5 text-sm text-ink-muted">
                  <input
                    type="radio"
                    name="tagMode"
                    checked={filters.tagMode === 'any'}
                    onChange={() => set({ tagMode: 'any' })}
                    className="size-4 accent-[var(--accent)]"
                  />
                  {t('tags.anyOf')}
                </label>
                <label className="flex items-center gap-1.5 text-sm text-ink-muted">
                  <input
                    type="radio"
                    name="tagMode"
                    checked={filters.tagMode === 'all'}
                    onChange={() => set({ tagMode: 'all' })}
                    className="size-4 accent-[var(--accent)]"
                  />
                  {t('tags.allOf')}
                </label>
              </div>
            ) : null}

            <label className="flex flex-col gap-1.5 text-xs font-semibold tracking-wide text-ink-faint uppercase">
              {t('search.from')}
              <input
                type="date"
                value={filters.from ?? ''}
                onChange={(event) => set({ from: event.target.value || undefined })}
                className="rounded-xl border border-line bg-paper-raised px-3.5 py-2.5 text-[0.9375rem] font-normal text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
              />
            </label>

            <label className="flex flex-col gap-1.5 text-xs font-semibold tracking-wide text-ink-faint uppercase">
              {t('search.to')}
              <input
                type="date"
                value={filters.to ?? ''}
                onChange={(event) => set({ to: event.target.value || undefined })}
                className="rounded-xl border border-line bg-paper-raised px-3.5 py-2.5 text-[0.9375rem] font-normal text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
              />
            </label>

            <label className="flex flex-col gap-1.5 text-xs font-semibold tracking-wide text-ink-faint uppercase sm:col-span-2">
              {t('entries.attachments')}
              <select
                value={filters.mediaType ?? ''}
                onChange={(event) => set({ mediaType: event.target.value || undefined })}
                className="rounded-xl border border-line bg-paper-raised px-3.5 py-2.5 text-[0.9375rem] font-normal text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
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
        </div>
      ) : null}
    </div>
  )
}
