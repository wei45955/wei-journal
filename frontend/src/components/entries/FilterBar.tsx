import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/cn'
import { useFolders } from '../../hooks/useFolders'
import { useTags } from '../../hooks/useTags'
import { ChevronDownIcon, CloseIcon, FilterIcon, FolderIcon, PinIcon } from '../icons'
import type { TimelineFilters } from './filters'
import { emptyFilters } from './filters'

const mediaTypes = ['image', 'video', 'audio', 'file', 'livephoto'] as const

interface FilterBarProps {
  filters: TimelineFilters
  onChange: (next: TimelineFilters) => void
  /** Chooses a folder. The page turns this into the address of the folder. */
  onFolderChange?: (folderId: number | 'none' | undefined) => void
  /** Whether the panel of the filters is open. */
  open: boolean
  /** Opens or closes the panel of the filters. */
  onOpenChange: (open: boolean) => void
}

/**
 * The filter strip above the timeline.
 *
 * It stays pinned to the top of the screen and holds only two things: the
 * way into the filters, and the folder that is open. Everything else is
 * kept in a quiet panel, so the entries keep the room.
 */
export function FilterBar({
  filters,
  onChange,
  onFolderChange,
  open,
  onOpenChange,
}: FilterBarProps) {
  const { t } = useTranslation()
  const { folders } = useFolders()
  const { tags } = useTags()

  const activeCount =
    filters.tagIds.length +
    (filters.from ? 1 : 0) +
    (filters.to ? 1 : 0) +
    (filters.mediaType ? 1 : 0) +
    (filters.pinned ? 1 : 0)
  const active = activeCount > 0

  function set(patch: Partial<TimelineFilters>) {
    onChange({ ...filters, ...patch })
  }

  function chooseFolder(value: number | 'none' | undefined) {
    if (onFolderChange) onFolderChange(value)
    else set({ folderId: value })
  }

  function toggleTag(id: number) {
    const next = filters.tagIds.includes(id)
      ? filters.tagIds.filter((value) => value !== id)
      : [...filters.tagIds, id]
    set({ tagIds: next })
  }

  const clear = () => {
    chooseFolder(undefined)
    onChange({ ...emptyFilters, tagMode: filters.tagMode })
  }

  const selectedTags = tags.filter((tag) => filters.tagIds.includes(tag.id))

  return (
    // The band under the bar covers the page edge to edge, so a heading
    // never shows through the few pixels above the rounded controls.
    <div className="sticky top-[var(--header-h)] z-30 -mx-4 mb-4 bg-paper px-4 py-2 sm:-mx-6 sm:px-6">
      <div className="rounded-2xl bg-paper/88 shadow-[0_1px_2px_rgb(0_0_0/0.03)] backdrop-blur-xl">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onOpenChange(!open)}
            aria-expanded={open}
            className={cn(
              'flex h-11 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold transition-colors',
              open || active
                ? 'bg-accent-soft text-accent-ink'
                : 'bg-paper-sunken text-ink-muted hover:text-ink',
            )}
          >
            <FilterIcon size={15} />
            {t('timeline.filters')}
            {activeCount > 0 ? (
              <span className="flex min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[0.6875rem] leading-4 font-semibold text-accent-contrast tabular-nums">
                {activeCount}
              </span>
            ) : null}
            <ChevronDownIcon
              size={13}
              className={cn('transition-transform duration-200', open && 'rotate-180')}
            />
          </button>

          <div className="relative flex h-11 min-w-0 flex-1 items-center">
            <FolderIcon
              size={14}
              className="pointer-events-none absolute left-3 text-ink-faint"
            />
            <select
              value={filters.folderId === undefined ? '' : String(filters.folderId)}
              onChange={(event) => {
                const raw = event.target.value
                if (raw === '') chooseFolder(undefined)
                else if (raw === 'none') chooseFolder('none')
                else chooseFolder(Number(raw))
              }}
              className="h-11 w-full cursor-pointer appearance-none truncate rounded-full border border-line/70 bg-paper-raised pr-7 pl-8 text-sm font-medium text-ink transition-colors hover:border-line-strong focus:border-accent focus:outline-none"
              aria-label={t('entries.folder')}
            >
              <option value="">{t('timeline.allFolders')}</option>
              <option value="none">{t('entries.noFolder')}</option>
              {folders.map((folder) => (
                <option key={folder.id} value={folder.id}>
                  {folder.name}
                </option>
              ))}
            </select>
            <ChevronDownIcon
              size={12}
              className="pointer-events-none absolute right-2.5 text-ink-faint"
            />
          </div>

          {active ? (
            <button
              type="button"
              onClick={clear}
              className="h-11 shrink-0 rounded-full px-2 text-xs font-medium text-ink-faint transition-colors hover:text-ink"
            >
              {t('common.reset')}
            </button>
          ) : null}
        </div>

        {active ? (
          <div className="flex items-center gap-1.5 overflow-x-auto px-1 pt-1.5 pb-1 no-scrollbar">
            {selectedTags.map((tag) => (
              <FilterChip key={tag.id} label={tag.name} onRemove={() => toggleTag(tag.id)} />
            ))}
            {filters.from || filters.to ? (
              <FilterChip
                label={`${filters.from ?? '…'} – ${filters.to ?? '…'}`}
                onRemove={() => set({ from: undefined, to: undefined })}
              />
            ) : null}
            {filters.mediaType ? (
              <FilterChip
                label={t(`media.${filters.mediaType === 'livephoto' ? 'livePhoto' : filters.mediaType}`)}
                onRemove={() => set({ mediaType: undefined })}
              />
            ) : null}
            {filters.pinned ? (
              <FilterChip
                label={t('entries.pinned')}
                onRemove={() => set({ pinned: undefined })}
              />
            ) : null}
          </div>
        ) : null}

        {open ? (
          <div className="mt-1.5 max-h-[58vh] overflow-y-auto overscroll-contain border-t border-line/50 p-3.5 animate-sheet-up">
            <div className="flex flex-col gap-4">
              <section>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <h3 className="text-xs font-semibold tracking-wide text-ink-faint uppercase">
                    {t('entries.tags')}
                  </h3>
                  {filters.tagIds.length > 1 ? (
                    <div className="flex rounded-full bg-paper-sunken p-0.5 text-xs font-medium">
                      {(['any', 'all'] as const).map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => set({ tagMode: mode })}
                          aria-pressed={filters.tagMode === mode}
                          className={cn(
                            'min-h-8 rounded-full px-3 py-1.5 transition-colors',
                            filters.tagMode === mode
                              ? 'bg-paper-raised text-ink-strong shadow-sm'
                              : 'text-ink-muted',
                          )}
                        >
                          {mode === 'any' ? t('tags.anyOf') : t('tags.allOf')}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>

                {tags.length === 0 ? (
                  <p className="text-sm text-ink-faint">{t('tags.empty')}</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {tags.map((tag) => {
                      const chosen = filters.tagIds.includes(tag.id)
                      return (
                        <button
                          key={tag.id}
                          type="button"
                          onClick={() => toggleTag(tag.id)}
                          aria-pressed={chosen}
                          className={cn(
                            'inline-flex min-h-10 items-center justify-center rounded-full border px-3.5 py-1.5 text-sm transition-colors',
                            chosen
                              ? 'border-accent/30 bg-accent-soft font-medium text-accent-ink'
                              : 'border-line bg-paper-raised text-ink-muted hover:border-line-strong hover:text-ink',
                          )}
                        >
                          {tag.name}
                        </button>
                      )
                    })}
                  </div>
                )}
              </section>

              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1.5 text-xs font-semibold tracking-wide text-ink-faint uppercase">
                  {t('search.from')}
                  <input
                    type="date"
                    value={filters.from ?? ''}
                    max={filters.to}
                    onChange={(event) => set({ from: event.target.value || undefined })}
                    className="w-full min-w-0 rounded-xl border border-line bg-paper-raised px-3 py-2.5 text-[0.9375rem] font-normal text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
                  />
                </label>

                <label className="flex flex-col gap-1.5 text-xs font-semibold tracking-wide text-ink-faint uppercase">
                  {t('search.to')}
                  <input
                    type="date"
                    value={filters.to ?? ''}
                    min={filters.from}
                    onChange={(event) => set({ to: event.target.value || undefined })}
                    className="w-full min-w-0 rounded-xl border border-line bg-paper-raised px-3 py-2.5 text-[0.9375rem] font-normal text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
                  />
                </label>
              </div>

              <label className="flex flex-col gap-1.5 text-xs font-semibold tracking-wide text-ink-faint uppercase">
                {t('entries.attachments')}
                <select
                  value={filters.mediaType ?? ''}
                  onChange={(event) => set({ mediaType: event.target.value || undefined })}
                  className="w-full cursor-pointer rounded-xl border border-line bg-paper-raised px-3.5 py-2.5 text-[0.9375rem] font-normal text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
                >
                  <option value="">{t('common.all')}</option>
                  {mediaTypes.map((kind) => (
                    <option key={kind} value={kind}>
                      {t(`media.${kind === 'livephoto' ? 'livePhoto' : kind}`)}
                    </option>
                  ))}
                </select>
              </label>

              <button
                type="button"
                onClick={() => set({ pinned: filters.pinned ? undefined : true })}
                aria-pressed={Boolean(filters.pinned)}
                className="flex items-center justify-between gap-3 rounded-xl bg-paper-sunken/70 px-3.5 py-3 text-left transition-colors"
              >
                <span className="flex items-center gap-2 text-[0.9375rem] text-ink">
                  <PinIcon size={15} className="text-ink-faint" />
                  {t('entries.pinned')}
                </span>
                <span
                  className={cn(
                    'relative h-[1.625rem] w-[2.75rem] shrink-0 rounded-full transition-colors duration-200',
                    filters.pinned ? 'bg-accent' : 'bg-line-strong',
                  )}
                  aria-hidden="true"
                >
                  <span
                    className={cn(
                      'absolute top-0.5 left-0.5 size-[1.375rem] rounded-full bg-white shadow-sm transition-transform duration-200',
                      filters.pinned && 'translate-x-[1.125rem]',
                    )}
                  />
                </span>
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}

/** One chosen filter, removable without opening the panel. */
function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full bg-accent-soft pr-1 pl-2.5 text-xs font-medium text-accent-ink">
      <span className="max-w-40 truncate">{label}</span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={label}
        className="flex size-6 items-center justify-center rounded-full text-accent-ink/70 transition-colors hover:bg-accent/15 hover:text-accent-ink"
      >
        <CloseIcon size={12} />
      </button>
    </span>
  )
}
