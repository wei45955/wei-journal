import { useTranslation } from 'react-i18next'
import { Button, Field, TextInput } from '../ui'

/**
 * The kinds of match the server can report. The fallback is only used while
 * a key is missing from the dictionary.
 */
export const SEARCH_TYPES = [
  { value: 'all', labelKey: 'search.everything', fallback: 'Everything' },
  { value: 'title', labelKey: 'search.titleOnly', fallback: 'Titles' },
  { value: 'text', labelKey: 'search.content', fallback: 'Content' },
  { value: 'tag', labelKey: 'search.tagsOnly', fallback: 'Tags' },
  { value: 'folder', labelKey: 'entries.folder', fallback: 'Folder' },
  { value: 'media', labelKey: 'search.media', fallback: 'Media' },
  { value: 'ai_text', labelKey: 'search.aiText', fallback: 'AI text' },
  { value: 'ai_image', labelKey: 'search.aiImages', fallback: 'AI images' },
  { value: 'location', labelKey: 'entries.location', fallback: 'Location' },
] as const

const selectClasses =
  'w-full cursor-pointer rounded-md border border-line bg-paper-raised px-3 py-2 text-[0.9375rem] text-ink ' +
  'transition-colors duration-150 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20'

interface SearchFiltersProps {
  type: string
  from: string
  to: string
  dirty: boolean
  onTypeChange: (value: string) => void
  onFromChange: (value: string) => void
  onToChange: (value: string) => void
  onReset: () => void
}

/**
 * The filters that narrow a search: what to look in and when.
 */
export function SearchFilters({
  type,
  from,
  to,
  dirty,
  onTypeChange,
  onFromChange,
  onToChange,
  onReset,
}: SearchFiltersProps) {
  const { t } = useTranslation()

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Field label={t('search.type')} htmlFor="search-type">
        <select
          id="search-type"
          className={selectClasses}
          value={type}
          onChange={(event) => onTypeChange(event.target.value)}
        >
          {SEARCH_TYPES.map((option) => (
            <option key={option.value} value={option.value}>
              {t(option.labelKey, option.fallback)}
            </option>
          ))}
        </select>
      </Field>

      <Field label={t('search.from')} htmlFor="search-from">
        <TextInput
          id="search-from"
          type="date"
          value={from}
          onChange={(event) => onFromChange(event.target.value)}
        />
      </Field>

      <Field label={t('search.to')} htmlFor="search-to">
        <TextInput
          id="search-to"
          type="date"
          value={to}
          onChange={(event) => onToChange(event.target.value)}
        />
      </Field>

      <div className="flex items-end">
        <Button variant="ghost" onClick={onReset} disabled={!dirty}>
          {t('common.reset')}
        </Button>
      </div>
    </div>
  )
}
