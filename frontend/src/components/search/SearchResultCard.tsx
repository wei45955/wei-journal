import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Badge } from '../ui'
import { formatEventDate } from '../../lib/format'
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

const MAX_MATCHES = 4

interface SearchResultCardProps {
  result: SearchResult
  language: string
}

/**
 * One entry that matched, with the passages that matched.
 */
export function SearchResultCard({ result, language }: SearchResultCardProps) {
  const { t } = useTranslation()
  const { entry, matches } = result
  const title = entry.title.trim() || t('entries.untitled')

  return (
    <article className="rounded-lg border border-line bg-paper-raised p-4 transition-colors hover:border-line-strong">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="font-[--font-sans] text-[1.0625rem] font-medium text-ink-strong">
          <Link to={`/entries/${entry.id}`} className="hover:underline">
            {title}
          </Link>
        </h3>
        <p className="text-xs text-ink-faint">{formatEventDate(entry.eventDate, language)}</p>
      </div>

      <p className="mt-1 text-xs text-ink-muted">
        {entry.folderName ? entry.folderName : t('entries.noFolder')}
        {entry.tags.length > 0 ? ` · ${entry.tags.map((tag) => tag.name).join(', ')}` : ''}
      </p>

      {matches.length > 0 ? (
        <ul className="mt-3 flex flex-col gap-2">
          {matches.slice(0, MAX_MATCHES).map((match, index) => {
            const label = MATCH_LABELS[match.kind]
            return (
              <li key={`${match.kind}-${match.field}-${index}`} className="flex gap-2 text-sm">
                <Badge tone={match.kind.startsWith('ai') ? 'accent' : 'neutral'}>
                  {label ? t(label.key, label.fallback) : match.kind}
                </Badge>
                <span className="min-w-0 flex-1 text-ink-muted">{match.snippet}</span>
              </li>
            )
          })}
          {matches.length > MAX_MATCHES ? (
            <li className="text-xs text-ink-faint">
              {t('search.moreMatches', '+{{count}} more', { count: matches.length - MAX_MATCHES })}
            </li>
          ) : null}
        </ul>
      ) : null}
    </article>
  )
}
