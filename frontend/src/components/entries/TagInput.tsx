import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../../lib/api'
import { useTags } from '../../hooks/useTags'
import { useToast } from '../../state/toast'
import { cn } from '../../lib/cn'
import type { Tag } from '../../lib/types'
import { CloseIcon } from '../icons'

interface TagInputProps {
  value: Tag[]
  onChange: (tags: Tag[]) => void
  id?: string
}

/**
 * Adds and removes tags.
 *
 * A name that does not exist yet is created, so a tag can be typed straight
 * into the entry.
 */
export function TagInput({ value, onChange, id }: TagInputProps) {
  const { t } = useTranslation()
  const { tags: knownTags, reload } = useTags()
  const { notify, describe } = useToast()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const suggestions = knownTags.filter(
    (tag) =>
      !value.some((current) => current.id === tag.id) &&
      tag.name.toLowerCase().includes(text.trim().toLowerCase()),
  )

  async function addTag(name: string) {
    const trimmed = name.trim()
    if (!trimmed || busy) return
    const existing = knownTags.find(
      (tag) => tag.name.toLowerCase() === trimmed.toLowerCase(),
    )
    if (existing) {
      if (!value.some((tag) => tag.id === existing.id)) {
        onChange([...value, existing])
      }
      setText('')
      return
    }
    setBusy(true)
    try {
      const created = await api.createTag(trimmed)
      onChange([...value, created])
      setText('')
      await reload()
    } catch (err) {
      notify(describe(err, t('errors.generic')), 'error')
    } finally {
      setBusy(false)
    }
  }

  function removeTag(tag: Tag) {
    onChange(value.filter((current) => current.id !== tag.id))
  }

  return (
    <div className="flex flex-col gap-2">
      {value.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5">
          {value.map((tag) => (
            <li key={tag.id}>
              <span className="inline-flex items-center gap-1 rounded-full bg-accent-soft py-0.5 pr-1 pl-2.5 text-xs font-medium text-accent-ink">
                {tag.name}
                <button
                  type="button"
                  onClick={() => removeTag(tag)}
                  aria-label={`${t('entries.remove')} ${tag.name}`}
                  className="rounded-full p-0.5 transition-colors hover:bg-accent/15"
                >
                  <CloseIcon size={12} />
                </button>
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="relative">
        <input
          id={id}
          ref={inputRef}
          type="text"
          value={text}
          disabled={busy}
          placeholder={t('entries.tagPlaceholder')}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ',') {
              event.preventDefault()
              void addTag(text)
            }
            if (event.key === 'Backspace' && !text && value.length > 0) {
              onChange(value.slice(0, -1))
            }
          }}
          list="wj-tag-suggestions"
          className="w-full rounded-md border border-line bg-paper-raised px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
        />
        <datalist id="wj-tag-suggestions">
          {suggestions.map((tag) => (
            <option key={tag.id} value={tag.name} />
          ))}
        </datalist>
      </div>

      {suggestions.length > 0 && text.trim() ? (
        <div className="flex flex-wrap gap-1.5">
          {suggestions.slice(0, 8).map((tag) => (
            <button
              key={tag.id}
              type="button"
              onClick={() => void addTag(tag.name)}
              className={cn(
                'rounded-full border border-line bg-paper-raised px-2.5 py-1 text-xs text-ink-muted',
                'transition-colors hover:border-accent hover:text-accent-ink',
              )}
            >
              {tag.name}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
