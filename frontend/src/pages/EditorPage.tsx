import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ApiError, api } from '../lib/api'
import { cn } from '../lib/cn'
import { displayTimezone, formatTime, isoToWallInput, wallInputToISO } from '../lib/format'
import { useAuth } from '../state/auth'
import { useToast } from '../state/toast'
import { useFolders } from '../hooks/useFolders'
import { Button, Field, Skeleton } from '../components/ui'
import { ConfirmDialog } from '../components/ui/Dialog'
import { RichTextEditor } from '../components/editor/RichTextEditor'
import { DrawingCanvas } from '../components/editor/DrawingCanvas'
import { MediaUploader } from '../components/media/MediaUploader'
import { MediaStrip } from '../components/media/MediaViewer'
import { NewFolderForm } from '../components/entries/NewFolderForm'
import { TagInput } from '../components/entries/TagInput'
import { LocationPicker } from '../components/entries/LocationPicker'
import { AIMetadataPanel } from '../components/entries/AIMetadataPanel'
import { CheckIcon, ChevronLeftIcon, ClockIcon, LocationIcon, PaletteIcon, PinIcon } from '../components/icons'
import type { DocNode, Entry, Media, PlaceRef, Stroke, Tag } from '../lib/types'

const AUTOSAVE_DELAY = 1200

type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error' | 'conflict'

const COLORS = ['#b8542f', '#5c7a63', '#3f6b47', '#8a6412', '#2f5d8a', '#7a4b86', '#23201b']

/** Whether a node of the document holds nothing worth storing. */
function isBlankNode(node: DocNode): boolean {
  if (node.type && node.type !== 'paragraph' && node.type !== 'text') return false
  if ((node.text ?? '').trim()) return false
  return (node.content ?? []).every(isBlankNode)
}

interface EditorState {
  title: string
  document: DocNode
  drawing: Stroke[]
  eventTime: string
  timezone: string
  folderId?: number | null
  tags: Tag[]
  color: string
  isPinned: boolean
  mediaIds: number[]
  location?: PlaceRef | null
}

export function EditorPage() {
  const { t } = useTranslation()
  const { entryId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { notify, describe } = useToast()
  const { folders } = useFolders()

  const editing = Boolean(entryId)
  const [entry, setEntry] = useState<Entry | null>(null)
  const [state, setState] = useState<EditorState>({
    title: '',
    document: { type: 'doc', content: [{ type: 'paragraph' }] },
    drawing: [],
    eventTime: new Date().toISOString(),
    timezone: displayTimezone(),
    folderId: null,
    tags: [],
    color: '',
    isPinned: false,
    mediaIds: [],
    location: null,
  })
  const [media, setMedia] = useState<Media[]>([])
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const [loading, setLoading] = useState(editing)
  const [loadError, setLoadError] = useState('')
  const [conflict, setConflict] = useState(false)
  const [showDrawing, setShowDrawing] = useState(false)
  const [showLocation, setShowLocation] = useState(false)
  const [confirmLeave, setConfirmLeave] = useState(false)

  const timer = useRef<number | null>(null)
  const saving = useRef(false)
  const pending = useRef(false)
  const revision = useRef<number | undefined>(undefined)
  const dirty = useRef(false)
  const stateRef = useRef(state)
  stateRef.current = state
  const entryIdRef = useRef<number | undefined>(entryId ? Number(entryId) : undefined)

  const language = user?.settings.language ?? 'en'

  useEffect(() => {
    // A new entry starts in the user's own time zone; an existing entry
    // keeps the zone it was written in.
    if (entryId) return
    setState((current) => ({ ...current, timezone: displayTimezone(user?.settings.timezone) }))
  }, [entryId, user?.settings.timezone])

  // Load the entry when editing.
  useEffect(() => {
    if (!entryId) return
    let cancelled = false
    void (async () => {
      try {
        const loaded = await api.entry(Number(entryId))
        if (cancelled) return
        revision.current = loaded.revision
        setEntry(loaded)
        setMedia(loaded.media)
        setState({
          title: loaded.title,
          document: loaded.document,
          drawing: loaded.drawing ?? [],
          eventTime: loaded.eventTime,
          timezone: displayTimezone(user?.settings.timezone),
          folderId: loaded.folderId ?? null,
          tags: loaded.tags,
          color: loaded.color,
          isPinned: loaded.isPinned,
          mediaIds: loaded.media.map((item) => item.id),
          location: loaded.location ?? null,
        })
        setLoadError('')
      } catch (err) {
        if (!cancelled) setLoadError(describe(err, t('errors.notFound')))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [entryId, describe, t])

  const save = useCallback(async () => {
    if (saving.current) {
      pending.current = true
      return
    }
    if (!dirty.current) return

    const snapshot = stateRef.current
    const isEmpty =
      !snapshot.title.trim() &&
      !snapshot.mediaIds.length &&
      !snapshot.drawing.length &&
      !(snapshot.document.content ?? []).some((node) => !isBlankNode(node))

    // Nothing worth storing yet: an untouched new entry stays unsaved.
    if (revision.current === undefined && isEmpty) return

    saving.current = true
    setSaveState('saving')
    try {
      const payload = {
        title: snapshot.title,
        document: JSON.stringify(snapshot.document),
        drawing: JSON.stringify(snapshot.drawing),
        eventTime: snapshot.eventTime,
        timezone: snapshot.timezone,
        folderId: snapshot.folderId ?? null,
        tagIds: snapshot.tags.map((tag) => tag.id),
        color: snapshot.color,
        isPinned: snapshot.isPinned,
        mediaIds: snapshot.mediaIds,
        revision: revision.current,
      }

      if (revision.current === undefined) {
        const created = await api.createEntry(payload)
        revision.current = created.revision
        entryIdRef.current = created.id
        setEntry(created)
        setMedia(created.media)
        navigate(`/entries/${created.id}/edit`, { replace: true })
      } else {
        const updated = await api.updateEntry(entryIdRef.current ?? 0, {
          ...payload,
          revision: revision.current,
        })
        revision.current = updated.revision
        setEntry(updated)
        setMedia(updated.media)
      }

      dirty.current = false
      setSaveState('saved')
      setSavedAt(new Date())
      setConflict(false)

      // The place lives in its own table, so it is written separately.
      if (snapshot.location) {
        try {
          await api.setEntryLocation(entryIdRef.current ?? 0, {
            name: snapshot.location.name,
            address: snapshot.location.address,
            latitude: snapshot.location.latitude,
            longitude: snapshot.location.longitude,
          })
        } catch {
          // A place that cannot be saved must not fail the entry itself.
        }
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setSaveState('conflict')
        setConflict(true)
        return
      }
      setSaveState('error')
      notify(describe(err, t('entries.saveFailed')), 'error')
    } finally {
      saving.current = false
      if (pending.current) {
        pending.current = false
        dirty.current = true
        schedule()
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate, notify, describe, t])

  const schedule = useCallback(() => {
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      timer.current = null
      void save()
    }, AUTOSAVE_DELAY)
  }, [save])

  function update(patch: Partial<EditorState>) {
    setState((current) => ({ ...current, ...patch }))
    dirty.current = true
    setSaveState('dirty')
    schedule()
  }

  // Save when the page is closed so nothing is lost.
  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty.current) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [])

  useEffect(() => {
    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current)
    }
  }, [])

  function leave() {
    if (dirty.current) {
      setConfirmLeave(true)
      return
    }
    navigate('/')
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-3 pb-16">
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-56 w-full" />
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-center">
        <p className="text-sm text-ink-muted">{loadError}</p>
        <Button variant="secondary" onClick={() => navigate('/')}>
          {t('entries.backToTimeline')}
        </Button>
      </div>
    )
  }

  return (
    <div className="pb-24">
      <header className="mb-5 flex items-center gap-2">
        <button
          type="button"
          onClick={leave}
          className="inline-flex items-center gap-0.5 rounded-full py-1 pr-3 pl-1 text-[0.9375rem] text-ink-muted transition-colors active:bg-paper-sunken hover:text-ink"
        >
          <ChevronLeftIcon size={18} />
          {t('nav.back')}
        </button>
        <div className="ml-auto">
          <SaveIndicator state={saveState} savedAt={savedAt} language={language} />
        </div>
      </header>

      {conflict ? (
        <div
          className="mb-4 flex flex-wrap items-center gap-3 rounded-xl bg-danger-soft px-3.5 py-2.5 text-sm text-danger"
          role="alert"
        >
          <span className="flex-1">{t('errors.conflict')}</span>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              dirty.current = false
              window.location.reload()
            }}
          >
            {t('common.retry')}
          </Button>
        </div>
      ) : null}

      <div className="flex flex-col gap-5">
        <input
          value={state.title}
          placeholder={t('entries.placeholder')}
          aria-label={t('entries.title')}
          onChange={(event) => update({ title: event.target.value })}
          className="w-full border-0 bg-transparent px-0 font-serif text-[1.75rem] leading-tight text-ink-strong placeholder:text-ink-faint/70 focus:ring-0 focus:outline-none"
        />

        <RichTextEditor
          content={state.document}
          onChange={(document) => update({ document })}
          placeholder={t('entries.bodyPlaceholder')}
          ariaLabel={t('entries.bodyPlaceholder')}
        />

        <section>
          <div className="mb-2 flex items-center gap-2">
            <h2 className="text-[0.8125rem] font-semibold tracking-wide text-ink-faint uppercase">
              {t('entries.attachments')}
            </h2>
            <div className="ml-auto">
              <MediaUploader
                onUploaded={(uploaded) => {
                  setMedia((current) => [...current, ...uploaded])
                  update({ mediaIds: [...state.mediaIds, ...uploaded.map((item) => item.id)] })
                }}
              />
            </div>
          </div>
          {media.length > 0 ? (
            <MediaStrip media={media} className="grid-cols-3 sm:grid-cols-4" />
          ) : (
            <p className="text-sm text-ink-faint">{t('entries.noMedia')}</p>
          )}
        </section>

        <section className="card p-4 sm:p-5">
          <h2 className="mb-4 text-[0.8125rem] font-semibold tracking-wide text-ink-faint uppercase">
            {t('editor.details')}
          </h2>

          <div className="flex flex-col gap-4">
            <Field label={t('entries.eventTime')} htmlFor="event-time" hint={t('entries.eventTimeHint')}>
              <div className="flex items-center gap-2">
                <ClockIcon size={16} className="shrink-0 text-ink-faint" />
                <input
                  id="event-time"
                  type="datetime-local"
                  value={isoToWallInput(state.eventTime, state.timezone)}
                  onChange={(event) =>
                    update({ eventTime: wallInputToISO(event.target.value, state.timezone) })
                  }
                  className="w-full cursor-pointer rounded-xl border border-line bg-paper-raised px-3.5 py-2.5 text-[0.9375rem] text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
                />
              </div>
            </Field>

            <Field label={t('entries.folder')} htmlFor="entry-folder">
              <select
                id="entry-folder"
                value={state.folderId === null || state.folderId === undefined ? '' : String(state.folderId)}
                onChange={(event) =>
                  update({ folderId: event.target.value === '' ? null : Number(event.target.value) })
                }
                className="w-full cursor-pointer rounded-xl border border-line bg-paper-raised px-3.5 py-2.5 text-[0.9375rem] text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
              >
                <option value="">{t('entries.noFolder')}</option>
                {folders.map((folder) => (
                  <option key={folder.id} value={folder.id}>
                    {folder.name}
                  </option>
                ))}
              </select>
              <NewFolderForm
                className="mt-2"
                onCreated={(folder) => update({ folderId: folder.id })}
              />
            </Field>

            <Field label={t('entries.tags')} htmlFor="entry-tags">
              <TagInput
                id="entry-tags"
                value={state.tags}
                onChange={(tags) => update({ tags })}
              />
            </Field>

            <Field label={t('entries.location')} htmlFor="entry-location">
              <div className="flex items-center gap-2">
                <LocationIcon size={16} className="shrink-0 text-ink-faint" />
                {state.location ? (
                  <span className="min-w-0 flex-1 truncate text-sm text-ink">
                    {state.location.name || state.location.address}
                  </span>
                ) : (
                  <span className="min-w-0 flex-1 text-sm text-ink-faint">{t('entries.noLocation')}</span>
                )}
                <Button size="sm" variant="secondary" onClick={() => setShowLocation(true)}>
                  {state.location ? t('entries.rename') : t('entries.addLocation')}
                </Button>
                {state.location ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      update({ location: null })
                      if (entryIdRef.current) {
                        void api.clearEntryLocation(entryIdRef.current)
                      }
                    }}
                  >
                    {t('entries.remove')}
                  </Button>
                ) : null}
              </div>
            </Field>

            <Field label={t('entries.color')} htmlFor="entry-color">
              <div className="flex items-center gap-2">
                <PaletteIcon size={16} className="shrink-0 text-ink-faint" />
                <div className="flex flex-wrap gap-2" id="entry-color">
                  {COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => update({ color: state.color === color ? '' : color })}
                      aria-label={color}
                      aria-pressed={state.color === color}
                      className={cn(
                        'size-7 rounded-full transition-transform duration-150',
                        state.color === color
                          ? 'ring-2 ring-ink ring-offset-2 ring-offset-paper-raised'
                          : 'ring-1 ring-black/5',
                      )}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="ml-auto"
                  icon={<PinIcon size={14} />}
                  onClick={() => update({ isPinned: !state.isPinned })}
                >
                  {state.isPinned ? t('entries.unpin') : t('entries.pin')}
                </Button>
              </div>
            </Field>
          </div>
        </section>

        <section>
          <div className="mb-2 flex items-center gap-2">
            <h2 className="text-[0.8125rem] font-semibold tracking-wide text-ink-faint uppercase">
              {t('drawing.title')}
            </h2>
            <Button
              size="sm"
              variant="ghost"
              className="ml-auto"
              onClick={() => setShowDrawing((value) => !value)}
            >
              {showDrawing ? t('drawing.close') : t('drawing.open')}
            </Button>
          </div>
          {showDrawing ? (
            <DrawingCanvas
              strokes={state.drawing}
              onChange={(drawing) => update({ drawing })}
            />
          ) : state.drawing.length > 0 ? (
            <div className="overflow-hidden rounded-2xl border border-line bg-paper-raised">
              <svg
                viewBox="0 0 1000 750"
                preserveAspectRatio="none"
                className="block aspect-[4/3] w-full"
                role="img"
                aria-label={t('drawing.title')}
              >
                {state.drawing.map((stroke, index) => (
                  <path
                    key={stroke.id ?? index}
                    d={
                      stroke.points.length
                        ? stroke.points
                            .map(
                              ([x, y], i) =>
                                `${i === 0 ? 'M' : 'L'} ${(x * 1000).toFixed(1)} ${(y * 750).toFixed(1)}`,
                            )
                            .join(' ')
                        : ''
                    }
                    fill="none"
                    stroke={stroke.color}
                    strokeWidth={stroke.width}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                ))}
              </svg>
            </div>
          ) : null}
        </section>

        {entry && entry.aiMetadata.length > 0 ? (
          <AIMetadataPanel
            metadata={entry.aiMetadata}
            entryId={entry.id}
            onApplyTags={(names) => {
              const existing = state.tags.map((tag) => tag.name.toLowerCase())
              const missing = names.filter((name) => !existing.includes(name.toLowerCase()))
              if (!missing.length) return
              void (async () => {
                const created: Tag[] = []
                for (const name of missing) {
                  try {
                    created.push(await api.createTag(name))
                  } catch {
                    // A tag that cannot be created is simply not suggested.
                  }
                }
                if (created.length) update({ tags: [...state.tags, ...created] })
              })()
            }}
          />
        ) : null}
      </div>

      <LocationPicker
        open={showLocation}
        onClose={() => setShowLocation(false)}
        current={state.location}
        onSelect={(place) => {
          update({ location: place })
        }}
      />

      <ConfirmDialog
        open={confirmLeave}
        title={t('entries.unsaved')}
        description={t('entries.saveFailed')}
        confirmLabel={t('entries.save')}
        onClose={() => setConfirmLeave(false)}
        onConfirm={() => {
          setConfirmLeave(false)
          void save().then(() => navigate('/'))
        }}
      />
    </div>
  )
}

function SaveIndicator({
  state,
  savedAt,
  language,
}: {
  state: SaveState
  savedAt: Date | null
  language: string
}) {
  const { t } = useTranslation()
  if (state === 'saving') return <span className="text-xs text-ink-faint">{t('entries.saving')}</span>
  if (state === 'dirty') return <span className="text-xs text-ink-faint">{t('entries.unsaved')}</span>
  if (state === 'error') return <span className="text-xs text-danger">{t('entries.saveFailed')}</span>
  if (state === 'conflict') return <span className="text-xs text-danger">{t('errors.conflict')}</span>
  if (state === 'saved' && savedAt) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-sage">
        <CheckIcon size={13} />
        {t('entries.savedAt', { time: formatTime(savedAt.toISOString(), language) })}
      </span>
    )
  }
  return null
}

