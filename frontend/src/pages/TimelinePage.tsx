import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { api } from '../lib/api'
import { dayHeading } from '../lib/format'
import { useAuth } from '../state/auth'
import { useToast } from '../state/toast'
import { useFolders } from '../hooks/useFolders'
import { Button, EmptyState, ErrorState, Skeleton } from '../components/ui'
import { EntryCard } from '../components/entries/EntryCard'
import { FilterBar } from '../components/entries/FilterBar'
import { BulkBar } from '../components/entries/BulkBar'
import { emptyFilters, filtersToQuery, hasActiveFilters } from '../components/entries/filters'
import type { TimelineFilters } from '../components/entries/filters'
import type { Entry } from '../lib/types'

const PAGE_SIZE = 30

export function TimelinePage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const { describe } = useToast()
  const { folders } = useFolders()
  const params = useParams()

  const routeFolderId = params.folderId ? Number(params.folderId) : undefined
  const [filters, setFilters] = useState<TimelineFilters>(emptyFilters)
  const [entries, setEntries] = useState<Entry[]>([])
  const [cursor, setCursor] = useState('')
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState('')
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<number[]>([])

  const language = user?.settings.language ?? 'en'

  // A folder route scopes the timeline; an explicit folder filter wins.
  const effectiveFilters = useMemo<TimelineFilters>(() => {
    if (routeFolderId === undefined) return filters
    return { ...filters, folderId: routeFolderId }
  }, [filters, routeFolderId])

  const load = useCallback(
    async (nextCursor: string, replace: boolean) => {
      try {
        const result = await api.entries({
          ...filtersToQuery(effectiveFilters),
          limit: PAGE_SIZE,
          cursor: nextCursor || undefined,
        })
        setEntries((current) => (replace ? result.items : [...current, ...result.items]))
        setCursor(result.nextCursor)
        setHasMore(result.hasMore)
        setError('')
      } catch (err) {
        setError(describe(err, t('errors.generic')))
      }
    },
    [effectiveFilters, describe, t],
  )

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    void (async () => {
      try {
        const result = await api.entries({
          ...filtersToQuery(effectiveFilters),
          limit: PAGE_SIZE,
        })
        if (cancelled) return
        setEntries(result.items)
        setCursor(result.nextCursor)
        setHasMore(result.hasMore)
        setError('')
      } catch (err) {
        if (!cancelled) setError(describe(err, t('errors.generic')))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [effectiveFilters, describe, t])

  const currentFolder = folders.find((folder) => folder.id === routeFolderId)

  const groups = useMemo(() => {
    const map = new Map<string, Entry[]>()
    for (const entry of entries) {
      const key = entry.eventDate
      const list = map.get(key)
      if (list) list.push(entry)
      else map.set(key, [entry])
    }
    return Array.from(map.entries())
  }, [entries])

  function toggleSelect(id: number) {
    setSelected((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    )
  }

  function exitSelection() {
    setSelecting(false)
    setSelected([])
  }

  async function handleBulkDone() {
    exitSelection()
    await load('', true)
  }

  const filtered = hasActiveFilters(effectiveFilters)

  return (
    <div className="pb-8">
      <header className="mb-4 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-serif text-2xl text-ink-strong">
            {currentFolder ? currentFolder.name : t('nav.timeline')}
          </h1>
          {currentFolder ? (
            <p className="mt-0.5 text-sm text-ink-muted">
              {currentFolder.entryCount === 1
                ? t('folders.oneEntry')
                : t('folders.entries', { count: currentFolder.entryCount })}
            </p>
          ) : null}
        </div>
        <Button
          variant={selecting ? 'secondary' : 'ghost'}
          size="sm"
          onClick={() => (selecting ? exitSelection() : setSelecting(true))}
        >
          {selecting ? t('batch.clear') : t('batch.select')}
        </Button>
      </header>

      <div className="mb-4">
        <FilterBar filters={filters} onChange={setFilters} showFolder={routeFolderId === undefined} />
      </div>

      {loading ? (
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} className="h-32 w-full" />
          ))}
        </div>
      ) : error ? (
        <ErrorState message={error} onRetry={() => void load('', true)} />
      ) : entries.length === 0 ? (
        <EmptyState
          title={filtered ? t('entries.empty.filtered') : t('entries.empty.title')}
          body={filtered ? t('entries.empty.filteredBody') : t('entries.empty.body')}
        />
      ) : (
        <>
          <div className="flex flex-col gap-6">
            {groups.map(([date, group]) => (
              <section key={date} aria-label={dayHeading(date, language)}>
                <h2 className="mb-2 flex items-center gap-3 text-sm font-semibold tracking-wide text-ink-faint uppercase">
                  {dayHeading(date, language)}
                  <span className="h-px flex-1 bg-line" aria-hidden="true" />
                </h2>
                <div className="flex flex-col gap-2.5">
                  {group.map((entry) => (
                    <EntryCard
                      key={entry.id}
                      entry={entry}
                      language={language}
                      selectable={selecting}
                      selected={selected.includes(entry.id)}
                      onToggleSelect={toggleSelect}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>

          {hasMore ? (
            <div className="mt-6 flex justify-center">
              <Button
                variant="secondary"
                loading={loadingMore}
                onClick={async () => {
                  setLoadingMore(true)
                  await load(cursor, false)
                  setLoadingMore(false)
                }}
              >
                {t('entries.loadMore')}
              </Button>
            </div>
          ) : null}
        </>
      )}

      {selecting ? (
        <BulkBar selected={selected} onClear={exitSelection} onDone={() => void handleBulkDone()} />
      ) : null}
    </div>
  )
}
