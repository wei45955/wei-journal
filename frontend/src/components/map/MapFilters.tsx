import { useTranslation } from 'react-i18next'
import { Button, Field, TextInput } from '../ui'
import { useFolders } from '../../hooks/useFolders'
import { useTags } from '../../hooks/useTags'

const selectClasses =
  'w-full cursor-pointer rounded-xl border border-line bg-paper-raised px-3.5 py-2.5 text-[0.9375rem] text-ink ' +
  'transition-colors duration-150 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20'

export type FolderFilter = number | 'none' | ''

interface MapFiltersProps {
  from: string
  to: string
  folderId: FolderFilter
  tags: number[]
  onFromChange: (value: string) => void
  onToChange: (value: string) => void
  onFolderChange: (value: FolderFilter) => void
  onTagsChange: (value: number[]) => void
  onReset: () => void
}

/**
 * The filters of the map: when, where and about what.
 */
export function MapFilters({
  from,
  to,
  folderId,
  tags,
  onFromChange,
  onToChange,
  onFolderChange,
  onTagsChange,
  onReset,
}: MapFiltersProps) {
  const { t } = useTranslation()
  const { folders } = useFolders()
  const { tags: allTags } = useTags()

  const dirty = from !== '' || to !== '' || folderId !== '' || tags.length > 0

  function toggleTag(id: number) {
    onTagsChange(tags.includes(id) ? tags.filter((tag) => tag !== id) : [...tags, id])
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label={t('search.from')} htmlFor="map-from">
          <TextInput
            id="map-from"
            type="date"
            value={from}
            onChange={(event) => onFromChange(event.target.value)}
          />
        </Field>

        <Field label={t('search.to')} htmlFor="map-to">
          <TextInput
            id="map-to"
            type="date"
            value={to}
            onChange={(event) => onToChange(event.target.value)}
          />
        </Field>

        <Field label={t('map.filterByFolder')} htmlFor="map-folder">
          <select
            id="map-folder"
            className={selectClasses}
            value={folderId === '' ? '' : String(folderId)}
            onChange={(event) => {
              const raw = event.target.value
              onFolderChange(raw === '' ? '' : raw === 'none' ? 'none' : Number(raw))
            }}
          >
            <option value="">{t('common.all')}</option>
            <option value="none">{t('entries.noFolder')}</option>
            {folders.map((folder) => (
              <option key={folder.id} value={folder.id}>
                {folder.name}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {allTags.length > 0 ? (
        <div>
          <p className="mb-1.5 text-sm text-ink-strong">{t('map.filterByTags')}</p>
          <div className="flex flex-wrap gap-1.5">
            {allTags.map((tag) => {
              const active = tags.includes(tag.id)
              return (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() => toggleTag(tag.id)}
                  aria-pressed={active}
                  className={`cursor-pointer rounded-full border px-3 py-1 text-sm transition-colors ${
                    active
                      ? 'border-accent bg-accent text-accent-contrast'
                      : 'border-line bg-paper-raised text-ink-muted hover:border-line-strong hover:text-ink-strong'
                  }`}
                >
                  {tag.name}
                </button>
              )
            })}
          </div>
        </div>
      ) : null}

      {dirty ? (
        <div>
          <Button variant="ghost" size="sm" onClick={onReset}>
            {t('common.reset')}
          </Button>
        </div>
      ) : null}
    </div>
  )
}
