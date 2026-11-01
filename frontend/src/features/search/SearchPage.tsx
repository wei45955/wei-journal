import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { api } from '../../lib/api'
import { formatEventDate } from '../../lib/format'
import { highlightParts } from '../../lib/safe'
import type { SearchResult } from '../../lib/types'
import { usePrefs } from '../../state/auth'
import { useTags } from '../../state/library'
import { useToast } from '../../state/toast'
import { Button, Chip, EmptyState, ErrorState, Skeleton } from '../../ui'
import { ClockIcon, CloseIcon, SearchIcon } from '../../ui/icons'
import { Thumb, splitMedia } from '../media/Thumb'

const PAGE = 20
const SCOPES = ['all', 'text', 'title', 'tag', 'location', 'ai_image', 'ai_text', 'media', 'folder'] as const
const RECENT_KEY = 'wj.recentSearches'

function readRecent(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string').slice(0, 6) : []
  } catch {
    return []
  }
}

function remember(term: string) {
  try {
    const next = [term, ...readRecent().filter((item) => item !== term)].slice(0, 6)
    localStorage.setItem(RECENT_KEY, JSON.stringify(next))
  } catch {
    // Not remembered; search still works.
  }
}

export function SearchPage() {
  const { t } = useTranslation()
  const { language, dateFormat } = usePrefs()
  const { describe } = useToast()
  const { tags } = useTags()
  const [params, setParams] = useSearchParams()
  const [text, setText] = useState(params.get('q') ?? '')
  const scope = (SCOPES as readonly string[]).includes(params.get('in') ?? '') ? (params.get('in') as string) : 'all'
  const term = params.get('q')?.trim() ?? ''
  const [results, setResults] = useState<SearchResult[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>(term ? 'loading' : 'idle')
  const [error, setError] = useState<unknown>(null)
  const [more, setMore] = useState(false)
  const [recent, setRecent] = useState(readRecent)
  const input = useRef<HTMLInputElement>(null)

  // The words reach the address after a short pause, and the address drives the search.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const value = text.trim()
      if (value === term) return
      const next = new URLSearchParams(params)
      if (value) next.set('q', value)
      else next.delete('q')
      setParams(next, { replace: true })
    }, 280)
    return () => window.clearTimeout(timer)
  }, [text, term, params, setParams])

  useEffect(() => {
    if (!term) {
      setStatus('idle')
      setResults([])
      return
    }
    let cancelled = false
    setStatus((current) => (current === 'ready' ? current : 'loading'))
    api
      .search(term, { limit: PAGE, offset: 0, type: scope === 'all' ? undefined : scope })
      .then((page) => {
        if (cancelled) return
        setResults(page.items)
        setHasMore(page.hasMore)
        setStatus('ready')
        if (page.items.length) {
          remember(term)
          setRecent(readRecent())
        }
      })
      .catch((reason: unknown) => {
        if (cancelled) return
        setError(reason)
        setStatus('error')
      })
    return () => {
      cancelled = true
    }
  }, [term, scope])

  async function loadMore() {
    setMore(true)
    try {
      const page = await api.search(term, { limit: PAGE, offset: results.length, type: scope === 'all' ? undefined : scope })
      const seen = new Set(results.map((result) => result.entry.id))
      setResults([...results, ...page.items.filter((result) => !seen.has(result.entry.id))])
      setHasMore(page.hasMore)
    } catch (reason) {
      setError(reason)
    } finally {
      setMore(false)
    }
  }

  function setScope(next: string) {
    const merged = new URLSearchParams(params)
    if (next === 'all') merged.delete('in')
    else merged.set('in', next)
    setParams(merged, { replace: true })
  }

  function searchFor(value: string) {
    setText(value)
    const next = new URLSearchParams(params)
    next.set('q', value)
    setParams(next, { replace: true })
  }

  return (
    <>
      <div className="sticky top-0 z-40 -mx-5 bg-paper sm:-mx-8 lg:-mx-10">
        {/* Plain paper, not frosted: this bar starts at the very top of the
            screen, which on a phone is under the system status bar. */}
        <div aria-hidden="true" className="h-[env(safe-area-inset-top)]" />
        <div className="border-b border-rule/70 px-5 pt-3 pb-3 sm:px-8 lg:px-10">
          <form
            role="search"
            onSubmit={(event) => {
              event.preventDefault()
              input.current?.blur()
              if (text.trim()) searchFor(text.trim())
            }}
            className="relative"
          >
            <SearchIcon size={20} className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-ink-3" />
            <input
              ref={input}
              type="search"
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder={t('search.placeholder')}
              aria-label={t('nav.search')}
              enterKeyHint="search"
              autoComplete="off"
              className="h-12 w-full rounded-lg bg-leaf pr-11 pl-11 text-base text-ink hairline outline-none placeholder:text-ink-3 focus:shadow-[0_0_0_2px_var(--wj-accent)]"
            />
            {text ? (
              <button
                type="button"
                aria-label={t('common.clear')}
                onClick={() => {
                  setText('')
                  input.current?.focus()
                }}
                className="press absolute top-1/2 right-1.5 flex size-9 -translate-y-1/2 items-center justify-center rounded-md text-ink-3 hover:bg-well hover:text-ink"
              >
                <CloseIcon size={18} />
              </button>
            ) : null}
          </form>
          <div className="-mx-5 mt-3 flex gap-2 overflow-x-auto px-5 no-scrollbar sm:mx-0 sm:px-0" role="radiogroup" aria-label={t('search.scope')}>
            {SCOPES.map((value) => (
              <Chip key={value} selected={scope === value} onClick={() => setScope(value)} className="shrink-0 text-sm">
                {value === 'all' ? t('search.everything') : t(`search.fields.${value}`)}
              </Chip>
            ))}
          </div>
        </div>
      </div>

      <div className="pt-3">
        {status === 'idle' ? (
          <Idle recent={recent} tags={tags.slice(0, 16).map((tag) => tag.name)} onPick={searchFor} onClearRecent={() => {
            localStorage.removeItem(RECENT_KEY)
            setRecent([])
          }} />
        ) : status === 'loading' ? (
          <div className="flex flex-col gap-3" aria-busy="true">
            {[0, 1, 2].map((index) => (
              <Skeleton key={index} className="h-24 w-full rounded-xl" />
            ))}
          </div>
        ) : status === 'error' ? (
          <ErrorState message={describe(error)} onRetry={() => searchFor(term)} />
        ) : results.length === 0 ? (
          <EmptyState title={t('search.noneTitle', { q: term })} body={t('search.noneBody')} />
        ) : (
          <>
            <p className="caption mb-3 text-ink-3" role="status">
              {t('search.results', { count: results.length })}
            </p>
            <ul className="flex flex-col gap-2">
              {results.map((result) => (
                <li key={result.entry.id}>
                  <ResultRow result={result} term={term} language={language} dateFormat={dateFormat} />
                </li>
              ))}
            </ul>
            {hasMore ? (
              <div className="mt-5 flex justify-center">
                <Button loading={more} onClick={() => void loadMore()}>
                  {t('search.more')}
                </Button>
              </div>
            ) : null}
          </>
        )}
      </div>
    </>
  )
}

function Idle({ recent, tags, onPick, onClearRecent }: { recent: string[]; tags: string[]; onPick: (value: string) => void; onClearRecent: () => void }) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-8 pt-6">
      <div>
        <h1 className="heading-1 max-w-[16ch] text-ink">{t('search.idleTitle')}</h1>
        <p className="body-2 mt-3 max-w-sm text-ink-2">{t('search.idleBody')}</p>
      </div>

      {recent.length > 0 ? (
        <section className="border-t border-rule pt-3">
          <div className="mb-1 flex items-center justify-between">
            <h2 className="caption text-ink-3">{t('search.recent')}</h2>
            <button type="button" onClick={onClearRecent} className="press h-8 rounded-md px-2 text-sm text-ink-3 hover:bg-well hover:text-ink">
              {t('common.clear')}
            </button>
          </div>
          <ul className="-mx-2">
            {recent.map((item) => (
              <li key={item}>
                <button type="button" onClick={() => onPick(item)} className="press flex min-h-12 w-full items-center gap-3 rounded-lg px-2 text-left text-base text-ink hover:bg-well">
                  <ClockIcon size={18} className="shrink-0 text-ink-3" />
                  <span className="truncate">{item}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {tags.length > 0 ? (
        <section className="border-t border-rule pt-3">
          <h2 className="caption mb-3 text-ink-3">{t('filters.tags')}</h2>
          <div className="flex flex-wrap gap-2">
            {tags.map((name) => (
              <Chip key={name} onClick={() => onPick(name)}>
                #{name}
              </Chip>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  )
}

function Highlighted({ text, term }: { text: string; term: string }) {
  const parts = useMemo(() => highlightParts(text, term), [text, term])
  return (
    <>
      {parts.map((part, index) =>
        part.hit ? (
          <mark key={index} className="rounded-sm bg-accent-soft px-0.5 text-accent">
            {part.text}
          </mark>
        ) : (
          <span key={index}>{part.text}</span>
        ),
      )}
    </>
  )
}

function ResultRow({ result, term, language, dateFormat }: { result: SearchResult; term: string; language: string; dateFormat?: string }) {
  const { t } = useTranslation()
  const { entry } = result
  const passages = result.matches.filter((match) => match.snippet && match.kind !== 'title').slice(0, 2)
  const cover = splitMedia(entry.media ?? [], entry.coverMediaId).visual[0]
  const fallback = entry.plainText.replace(/\s+/g, ' ').trim().slice(0, 160)

  return (
    <Link to={`/entry/${entry.id}`} className="press flex gap-3.5 rounded-xl bg-leaf p-4 hairline hover:-translate-y-px">
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="heading-3 min-w-0 truncate text-ink">
            {entry.title ? <Highlighted text={entry.title} term={term} /> : <span className="text-ink-3">{t('timeline.untitled')}</span>}
          </h3>
          <span className="tnum caption shrink-0 text-ink-3">{formatEventDate(entry.eventDate, language, dateFormat)}</span>
        </div>
        {passages.length > 0 ? (
          <ul className="mt-1.5 flex flex-col gap-1">
            {passages.map((match, index) => (
              <li key={index} className="body-2 text-ink-2">
                <span className="caption mr-1.5 text-ink-3">{t(`search.fields.${match.kind}`, { defaultValue: '' })}</span>
                <span className="line-clamp-2 inline">
                  <Highlighted text={match.snippet} term={term} />
                </span>
              </li>
            ))}
          </ul>
        ) : fallback ? (
          <p className="body-2 mt-1.5 line-clamp-2 text-ink-2">
            <Highlighted text={fallback} term={term} />
          </p>
        ) : null}
      </div>
      {cover ? (
        <span className="size-16 shrink-0 overflow-hidden rounded-lg bg-well">
          <Thumb media={cover} />
        </span>
      ) : null}
    </Link>
  )
}
