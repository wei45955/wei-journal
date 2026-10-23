import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { inputClass, Button, Chip, Segmented, Switch } from '../../ui'
import { Sheet } from '../../ui/Sheet'
import { useTags } from '../../state/library'
import { noFilters, type JournalFilters } from '../../state/journal'

const KINDS = ['image', 'video', 'livephoto', 'audio', 'file'] as const

/**
 * The filters, edited as a draft and applied together, so the list behind
 * does not jump with every tap.
 */
export function FilterSheet({
  open,
  onClose,
  value,
  onApply,
}: {
  open: boolean
  onClose: () => void
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
    <Sheet
      open={open}
      onClose={onClose}
      title={t('filters.title')}
      tall
      action={
        <button
          type="button"
          onClick={() => setDraft({ ...noFilters })}
          className="press -mr-2 h-10 rounded-full px-3 text-[0.9375rem] text-ink-2"
        >
          {t('common.clear')}
        </button>
      }
      footer={
        <Button
          tone="primary"
          size="lg"
          block
          onClick={() => {
            onApply(draft)
            onClose()
          }}
        >
          {t('filters.show')}
        </Button>
      }
    >
      <section className="pt-2">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="text-[0.9375rem] font-semibold text-ink">{t('filters.tags')}</h3>
          {draft.tagIds.length > 1 ? (
            <Segmented
              label={t('filters.tags')}
              value={draft.tagMode}
              onChange={(tagMode) => patch({ tagMode })}
              options={[
                { value: 'any', label: t('filters.anyTag') },
                { value: 'all', label: t('filters.allTags') },
              ]}
              className="w-[13rem]"
            />
          ) : null}
        </div>
        {tags.length === 0 ? (
          <p className="text-[0.9375rem] text-ink-3">{t('filters.noTags')}</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => (
              <Chip key={tag.id} selected={draft.tagIds.includes(tag.id)} onClick={() => toggleTag(tag.id)}>
                {tag.name}
              </Chip>
            ))}
          </div>
        )}
      </section>

      <section className="mt-7">
        <h3 className="mb-3 text-[0.9375rem] font-semibold text-ink">{t('filters.dates')}</h3>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex min-w-0 flex-col gap-1.5">
            <span className="text-[0.8125rem] text-ink-2">{t('filters.from')}</span>
            <input
              type="date"
              value={draft.from ?? ''}
              max={draft.to}
              onChange={(event) => patch({ from: event.target.value || undefined })}
              className={inputClass}
            />
          </label>
          <label className="flex min-w-0 flex-col gap-1.5">
            <span className="text-[0.8125rem] text-ink-2">{t('filters.to')}</span>
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

      <section className="mt-7">
        <h3 className="mb-3 text-[0.9375rem] font-semibold text-ink">{t('filters.contains')}</h3>
        <div className="flex flex-wrap gap-2">
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

      <section className="mt-7 flex items-center justify-between gap-4 rounded-[16px] bg-paper px-4 py-3">
        <span className="text-[1rem] text-ink">{t('filters.pinnedOnly')}</span>
        <Switch
          label={t('filters.pinnedOnly')}
          checked={Boolean(draft.pinned)}
          onChange={(pinned) => patch({ pinned: pinned || undefined })}
        />
      </section>
    </Sheet>
  )
}
