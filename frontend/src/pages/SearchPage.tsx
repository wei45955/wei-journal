import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { api } from '../lib/api'
import { useToast } from '../state/toast'
import { Button, EmptyState, ErrorState, Skeleton } from '../components/ui'
import { SearchIcon } from '../components/icons'
import { BackButton, TopBar } from '../components/layout/TopBar'
import type { SearchResult } from '../lib/types'
import { SearchFilters } from '../components/search/SearchFilters'
import { SearchResultCard } from '../components/search/SearchResultCard'
import { useDebouncedValue } from '../components/search/useDebouncedValue'

const PAGE_SIZE = 20

type Status = 'idle' | 'loading' | 'ready' | 'error'

/**
 * The search page: one field, a few filters and the entries that matched.
 */
export function SearchPage() {
  const { t, i18n } = useTranslation()
  const { notify, describe } = useToast()
  const navigate = useNavigate()

  const [query, setQuery] = useState('')
  const [type, setType] = useState('all')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [showFilters, setShowFilters] = useState(false)

  const [results, setResults] = useState<SearchResult[]>([])
  const [offset, setOffset] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState('')
  const [loadingMore, setLoadingMore] = useState(false)

  const debouncedQuery = useDebouncedValue(query, 300)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const term = debouncedQuery.trim()

  useEffect(() => {
    if (!term) {
      setResults([])
      setOffset(0)
      setHasMore(false)
      setStatus('idle')
      setError('')
      return
    }

    let cancelled = false
    setStatus('loading')
    void (async () => {
      try {
        const page = await api.search(term, { type, from, to, limit: PAGE_SIZE, offset: 0 })
        if (cancelled) return
        setResults(page.items)
        setOffset(page.items.length)
        setHasMore(page.hasMore)
        setError('')
        setStatus('ready')
      } catch (err) {
        if (cancelled) return
        setError(describe(err, t('errors.generic')))
        setStatus('error')
      }
    })()

    return () => {
      cancelled = true
    }
  }, [term, type, from, to, describe, t])

  async function loadMore() {
    if (!term || loadingMore) return
    setLoadingMore(true)
    try {
      const page = await api.search(term, { type, from, to, limit: PAGE_SIZE, offset })
      setResults((current) => [...current, ...page.items])
      setOffset((current) => current + page.items.length)
      setHasMore(page.hasMore)
    } catch (err) {
      notify(describe(err, t('errors.generic')), 'error')
    } finally {
      setLoadingMore(false)
    }
  }

  function reset() {
    setType('all')
    setFrom('')
    setTo('')
  }

  const dirty = type !== 'all' || from !== '' || to !== ''

  return (
    <div className="animate-page-in pb-8">
      <TopBar
        title={t('search.title')}
        left={<BackButton label={t('nav.back')} onClick={() => navigate(-1)} />}
      />

      <header className="pt-2 pb-3">
        <h1 className="title-large text-ink-strong">{t('search.title')}</h1>
      </header>

      <div className="relative">
        <SearchIcon
          size={18}
          className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-faint"
        />
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('search.placeholder')}
          aria-label={t('search.title')}
          className="w-full rounded-full border-0 bg-paper-sunken py-3 pr-4 pl-11 text-[0.9375rem] text-ink placeholder:text-ink-faint focus:bg-paper-raised focus:outline-none"
        />
      </div>

      <div className="mt-2.5">
        <Button
          variant={showFilters ? 'primary' : 'secondary'}
          size="sm"
          onClick={() => setShowFilters((open) => !open)}
          aria-expanded={showFilters}
        >
          {t('search.filters')}
        </Button>
      </div>

      {showFilters ? (
        <div className="card mt-3 p-4 animate-sheet-up">
          <SearchFilters
            type={type}
            from={from}
            to={to}
            dirty={dirty}
            onTypeChange={setType}
            onFromChange={setFrom}
            onToChange={setTo}
            onReset={reset}
          />
        </div>
      ) : null}

      <div className="mt-5">
        {status === 'idle' ? (
          <EmptyState
            title={t('search.startTitle', 'Search your archive')}
            body={t('search.startBody', 'Find entries, tags, photos and places by what is in them.')}
          />
        ) : status === 'loading' ? (
          <div className="flex flex-col gap-3" aria-busy="true" aria-label={t('search.searching')}>
            <p className="text-sm text-ink-muted">{t('search.searching')}</p>
            {[0, 1, 2].map((index) => (
              <Skeleton key={index} className="h-24 w-full" />
            ))}
          </div>
        ) : status === 'error' ? (
          <ErrorState message={error} onRetry={() => setQuery((current) => `${current} `)} />
        ) : results.length === 0 ? (
          <EmptyState title={t('search.noResults')} body={t('search.noResultsBody')} />
        ) : (
          <>
            <p className="mb-3 px-1 text-sm text-ink-muted">
              {results.length === 1 ? t('search.oneResult') : t('search.results', { count: results.length })}
              {hasMore ? ' ·' : ''}
            </p>
            <div className="flex flex-col gap-2.5">
              {results.map((result) => (
                <SearchResultCard
                  key={result.entry.id}
                  result={result}
                  language={i18n.resolvedLanguage ?? i18n.language}
                />
              ))}
            </div>
            {hasMore ? (
              <div className="mt-5 flex justify-center">
                <Button variant="secondary" loading={loadingMore} onClick={() => void loadMore()}>
                  {t('entries.loadMore')}
                </Button>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  )
}

export default SearchPage
