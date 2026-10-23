import { useEffect, useState } from 'react'
import type { RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import { inputClass, Button, Chip, Segmented, Switch } from '../../ui'
import { Popover } from '../../ui/Popover'
import { useTags } from '../../state/library'
import { noFilters, type JournalFilters } from '../../state/journal'

const KINDS = ['image', 'video', 'livephoto', 'audio', 'file'] as const

/**
 * The filters, edited as a draft and applied together, so the list behind
 * does not jump with every tap. The panel opens beside the filter button and
 * stays small; it never covers the journal.
 */
export function FilterMenu({
  open,
  onClose,
  anchorRef,
  value,
  onApply,
}: {
  open: boolean
  onClose: () => void
  anchorRef: RefObject<HTMLElement | null>
  value: JournalFilters
  onApply: (next: JournalFilters) => void
}) {
  const { t } = useTranslation()
  const { tags } = useTags()
  const [draft, setDraft] = useState(value)

  useEffect(() => {
    if (open) setDraft(value)
  }, [open, value])

  const patch = (next: Partial<JournalFilters>) => setDraft((current) => ({ ...current, ...next }))
  const toggleTag = (id: number) =>
    patch({ tagIds: draft.tagIds.includes(id) ? draft.tagIds.filter((tag) => tag !== id) : [...draft.tagIds, id] })

  return (
    <Popover
      open={open}
      onClose={onClose}
      anchorRef={anchorRef}
      placement="bottom-end"
      label={t('filters.title')}
      className="w-[20rem] max-w-[calc(100vw_-_1.5rem)] overflow-hidden"
    >
      <header className="flex items-center justify-between gap-3 border-b border-rule px-4 py-2.5">
        <h2 className="text-[0.9375rem] font-semibold text-ink">{t('filters.title')}</h2>
        <button
          type="button"
          onClick={() => setDraft({ ...noFilters })}
          className="press -mr-1 h-8 rounded-full px-2 text-[0.875rem] font-medium text-ink-2"
        >
          {t('common.clear')}
        </button>
      </header>

      <div className="max-h-[min(58vh,25rem)] overflow-y-auto overscroll-contain px-4 py-3">
        <section>
          <div className="mb-2.5 flex items-center justify-between gap-3">
            <h3 className="text-[0.8125rem] font-semibold text-ink-2">{t('filters.tags')}</h3>
            {draft.tagIds.length > 1 ? (
              <Segmented
                label={t('filters.tags')}
                value={draft.tagMode}
                onChange={(tagMode) => patch({ tagMode })}
                options={[
                  { value: 'any', label: t('filters.anyTag') },
                  { value: 'all', label: t('filters.allTags') },
                ]}
                className="w-[11.5rem]"
              />
            ) : null}
          </div>
          {tags.length === 0 ? (
            <p className="text-[0.875rem] text-ink-3">{t('filters.noTags')}</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {tags.map((tag) => (
                <Chip key={tag.id} selected={draft.tagIds.includes(tag.id)} onClick={() => toggleTag(tag.id)}>
                  {tag.name}
                </Chip>
              ))}
            </div>
          )}
        </section>

        <section className="mt-5">
          <h3 className="mb-2.5 text-[0.8125rem] font-semibold text-ink-2">{t('filters.dates')}</h3>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex min-w-0 flex-col gap-1.5">
              <span className="text-[0.75rem] text-ink-3">{t('filters.from')}</span>
              <input
                type="date"
                value={draft.from ?? ''}
                max={draft.to}
                onChange={(event) => patch({ from: event.target.value || undefined })}
                className={inputClass}
              />
            </label>
            <label className="flex min-w-0 flex-col gap-1.5">
              <span className="text-[0.75rem] text-ink-3">{t('filters.to')}</span>
              <input
                type="date"
                value={draft.to ?? ''}
                min={draft.from}
                onChange={(event) => patch({ to: event.target.value || undefined })}
                className={inputClass}
              />
            </label>
          </div>
        </section>

        <section className="mt-5">
          <h3 className="mb-2.5 text-[0.8125rem] font-semibold text-ink-2">{t('filters.contains')}</h3>
          <div className="flex flex-wrap gap-1.5">
            {KINDS.map((kind) => (
              <Chip
                key={kind}
                selected={draft.mediaType === kind}
                onClick={() => patch({ mediaType: draft.mediaType === kind ? undefined : kind })}
              >
                {t(`filters.${kind}`)}
              </Chip>
            ))}
          </div>
        </section>

        <section className="mt-5 flex items-center justify-between gap-4 rounded-[14px] bg-paper px-3.5 py-2.5">
          <span className="text-[0.9375rem] text-ink">{t('filters.pinnedOnly')}</span>
          <Switch
            label={t('filters.pinnedOnly')}
            checked={Boolean(draft.pinned)}
            onChange={(pinned) => patch({ pinned: pinned || undefined })}
          />
        </section>
      </div>

      <footer className="border-t border-rule p-2.5">
        <Button
          tone="primary"
          size="md"
          block
          onClick={() => {
            onApply(draft)
            onClose()
          }}
        >
          {t('filters.show')}
        </Button>
      </footer>
    </Popover>
  )
}
