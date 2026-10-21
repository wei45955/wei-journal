import { Link, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { formatEventDate, normalizeDateFormat } from '../../lib/format'
import { FolderIcon } from '../icons'
import type { SearchResult } from '../../lib/types'

/** How a match is labelled, per kind of indexed field. */
const MATCH_LABELS: Record<string, { key: string; fallback: string }> = {
  title: { key: 'search.titleOnly', fallback: 'Titles' },
  text: { key: 'search.content', fallback: 'Content' },
  tag: { key: 'search.tagsOnly', fallback: 'Tags' },
  folder: { key: 'entries.folder', fallback: 'Folder' },
  media: { key: 'search.media', fallback: 'Media' },
  ai_text: { key: 'search.aiText', fallback: 'AI text' },
  ai_image: { key: 'search.aiImages', fallback: 'AI images' },
  location: { key: 'entries.location', fallback: 'Location' },
}

/**
 * The kinds that add context of their own. A matched title, tag or folder
 * is already on the card, so repeating it as a passage is only noise.
 */
const CONTEXT_KINDS = new Set(['text', 'media', 'ai_text', 'ai_image', 'location'])

const MAX_MATCHES = 2

interface SearchResultCardProps {
  result: SearchResult
  language: string
  dateFormat?: string
}

/**
 * One entry that matched. The title and the tags say what it is; the
 * passages say why it was found.
 */
export function SearchResultCard({ result, language, dateFormat }: SearchResultCardProps) {
  const { t } = useTranslation()
  const location = useLocation()
  const { entry, matches } = result
  const title = entry.title.trim() || t('entries.untitled')

  const passages = matches.filter((match) => CONTEXT_KINDS.has(match.kind))
  const excerpt = entry.plainText.trim().replace(/\s+/g, ' ')

  return (
    <article className="rounded-[1.25rem] bg-paper-raised shadow-[0_1px_2px_rgb(0_0_0/0.04)] transition-shadow hover:shadow-[0_3px_12px_rgb(0_0_0/0.07)]">
      <Link
        to={`/entries/${entry.id}`}
        state={{ from: location.pathname + location.search }}
        className="block p-4"
      >
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="min-w-0 flex-1 text-[1.0625rem] leading-snug font-semibold text-ink-strong">
            {title}
          </h3>
          <p className="shrink-0 text-xs text-ink-faint">
            {formatEventDate(entry.eventDate, language, normalizeDateFormat(dateFormat))}
          </p>
        </div>

        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="inline-flex min-w-0 items-center gap-1 text-xs text-ink-muted">
            <FolderIcon size={12} className="shrink-0 text-ink-faint" />
            <span className="truncate">{entry.folderName || t('entries.noFolder')}</span>
          </span>
          {entry.tags.slice(0, 4).map((tag) => (
            <span
              key={tag.id}
              className="rounded-full bg-paper-sunken px-2 py-0.5 text-[0.6875rem] font-medium text-ink-muted"
            >
              #{tag.name}
            </span>
          ))}
          {entry.tags.length > 4 ? (
            <span className="text-[0.6875rem] text-ink-faint">+{entry.tags.length - 4}</span>
          ) : null}
        </div>

        {passages.length > 0 ? (
          <ul className="mt-2.5 flex flex-col gap-1.5">
            {passages.slice(0, MAX_MATCHES).map((match, index) => {
              const label = MATCH_LABELS[match.kind]
              return (
                <li key={`${match.kind}-${match.field}-${index}`} className="flex gap-2">
                  <span className="min-w-10 shrink-0 pt-0.5 text-[0.6875rem] font-semibold tracking-wide text-ink-faint">
                    {label ? t(label.key, label.fallback) : match.kind}
                  </span>
                  <span className="line-clamp-2 min-w-0 flex-1 text-sm leading-relaxed text-ink-muted">
                    {match.snippet}
                  </span>
                </li>
              )
            })}
            {passages.length > MAX_MATCHES ? (
              <li className="pl-12 text-xs text-ink-faint">
                {t('search.moreMatches', '+{{count}} more', {
                  count: passages.length - MAX_MATCHES,
                })}
              </li>
            ) : null}
          </ul>
        ) : excerpt ? (
          <p className="mt-2.5 line-clamp-2 text-sm leading-relaxed text-ink-muted">{excerpt}</p>
        ) : null}
      </Link>
    </article>
  )
}
