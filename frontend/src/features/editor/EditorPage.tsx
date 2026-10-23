import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import { Color, FontSize, TextStyle } from '@tiptap/extension-text-style'
import { ApiError, api } from '../../lib/api'
import { peek, prime } from '../../lib/cache'
import { cn } from '../../lib/cn'
import { displayTimezone, formatTime, localDateKey, longDate, wallInputToISO } from '../../lib/format'
import { dropDraft, readDraft, writeDraft, type Draft } from '../../lib/drafts'
import type { DocNode, Entry, Media, PlaceRef, Stroke, Tag } from '../../lib/types'
import { usePrefs } from '../../state/auth'
import { afterEntryChange, useFolders } from '../../state/library'
import { useToast } from '../../state/toast'
import { TopBar, useBack } from '../../shell/TopBar'
import { Button, Skeleton, Spinner, ErrorState } from '../../ui'
import { ConfirmSheet, Sheet } from '../../ui/Sheet'
import { CheckIcon, ChevronDownIcon, CloseIcon, FolderIcon, PlaceIcon, StarFilledIcon, StarIcon } from '../../ui/icons'
import { Thumb, isPicture, isFilm } from '../media/Thumb'
import { Viewer } from '../media/Viewer'
import { useUploader } from '../media/upload'
import { SketchPad } from '../sketch/SketchPad'
import { SketchView } from '../sketch/SketchView'
import { EditorToolbar, type EditorTool } from './EditorToolbar'
import { FolderSheet, LinkSheet, StyleSheet, TagSheet, TimeSheet } from './EditorSheets'
import { PlaceSheet } from './PlaceSheet'

const AUTOSAVE_MS = 1200
const EMPTY_DOC: DocNode = { type: 'doc', content: [{ type: 'paragraph' }] }

type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error' | 'conflict'

interface Draftable {
  title: string
  document: DocNode
  drawing: Stroke[]
  eventTime: string
  timezone: string
  folderId: number | null
  tags: Tag[]
  isPinned: boolean
  color: string
  mediaIds: number[]
  coverMediaId: number | null
  location: PlaceRef | null
}

function blank(node: DocNode): boolean {
  if (node.type && node.type !== 'paragraph' && node.type !== 'text') return false
  if ((node.text ?? '').trim()) return false
  return (node.content ?? []).every(blank)
}

function isEmpty(state: Draftable) {
  return (
    !state.title.trim() &&
    state.mediaIds.length === 0 &&
    state.drawing.length === 0 &&
    (state.document.content ?? []).every(blank)
  )
}

function fromEntry(entry: Entry, zone: string): Draftable {
  return {
    title: entry.title,
    document: entry.document?.type ? entry.document : EMPTY_DOC,
    drawing: entry.drawing ?? [],
    eventTime: entry.eventTime,
    timezone: entry.timezone || zone,
    folderId: entry.folderId ?? null,
    tags: entry.tags ?? [],
    isPinned: entry.isPinned,
    color: entry.color,
    mediaIds: (entry.media ?? []).map((item) => item.id),
    coverMediaId: entry.coverMediaId ?? null,
    location: entry.location
      ? {
          name: entry.location.name,
          address: entry.location.address,
          latitude: entry.location.latitude,
          longitude: entry.location.longitude,
        }
      : null,
  }
}

function samePlace(a: PlaceRef | null, b: PlaceRef | null) {
  if (!a || !b) return a === b
  return a.name === b.name && a.latitude === b.latitude && a.longitude === b.longitude && a.address === b.address
}

export function EditorPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { entryId } = useParams()
  const back = useBack(entryId ? `/entry/${entryId}` : '/')
  const [search] = useSearchParams()
  const { language, zone: zoneSetting } = usePrefs()
  const zone = displayTimezone(zoneSetting)
  const { notify, describe } = useToast()
  const { folders } = useFolders()

  const existingId = entryId ? Number(entryId) : null
  const seed = existingId ? peek<Entry>(`entry:${existingId}`) : undefined

  const [state, setState] = useState<Draftable>(() => {
    if (seed) return fromEntry(seed, zone)
    const folder = Number(search.get('folder'))
    const day = search.get('day')
    const now = new Date()
    let eventTime = now.toISOString()
    if (day && /^\d{4}-\d{2}-\d{2}$/.test(day) && day !== localDateKey(now, zone)) {
      eventTime = wallInputToISO(`${day}T12:00`, zone)
    }
    return {
      title: '',
      document: EMPTY_DOC,
      drawing: [],
      eventTime,
      timezone: zone,
      folderId: Number.isInteger(folder) && folder > 0 ? folder : null,
      tags: [],
      isPinned: false,
      color: '',
      mediaIds: [],
      coverMediaId: null,
      location: null,
    }
  })
  const [media, setMedia] = useState<Media[]>(seed?.media ?? [])
  const [loading, setLoading] = useState(Boolean(existingId) && !seed)
  const [loadError, setLoadError] = useState<unknown>(null)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [tool, setTool] = useState<EditorTool | null>(null)
  const [leaving, setLeaving] = useState(false)
  const [askLeave, setAskLeave] = useState(false)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [viewer, setViewer] = useState<number | null>(null)
  const [removing, setRemoving] = useState<Media | null>(null)

  // --- the save engine ---------------------------------------------------
  const stateRef = useRef(state)
  stateRef.current = state
  const idRef = useRef<number | null>(existingId)
  const revision = useRef<number | undefined>(seed?.revision)
  const savedPlace = useRef<PlaceRef | null>(seed ? fromEntry(seed, zone).location : null)
  const dirty = useRef(false)
  const version = useRef(0)
  const blocked = useRef(false)
  const queue = useRef<Promise<boolean>>(Promise.resolve(true))
  const timer = useRef<number | null>(null)
  const draftTimer = useRef<number | null>(null)
  const ready = useRef(!existingId || Boolean(seed))
  // The entry this editor created. The address changes to it, but the words
  // on screen are already the truth and must not be reloaded.
  const createdHere = useRef<number | null>(null)

  const draftKey = () => idRef.current ?? 'new'

  const save = useCallback((): Promise<boolean> => {
    async function pass(): Promise<boolean> {
      if (blocked.current) return false
      if (!dirty.current) return true
      const snapshot = stateRef.current
      const at = version.current
      if (idRef.current === null && isEmpty(snapshot)) {
        dirty.current = false
        setSaveState('idle')
        dropDraft('new')
        return true
      }
      setSaveState('saving')
      const payload = {
        title: snapshot.title,
        document: JSON.stringify(snapshot.document),
        drawing: JSON.stringify(snapshot.drawing),
        eventTime: snapshot.eventTime,
        timezone: snapshot.timezone,
        folderId: snapshot.folderId,
        tagIds: snapshot.tags.map((tag) => tag.id),
        color: snapshot.color,
        isPinned: snapshot.isPinned,
        mediaIds: snapshot.mediaIds,
        coverMediaId: snapshot.coverMediaId,
      }
      try {
        let saved: Entry
        if (idRef.current === null) {
          saved = await api.createEntry(payload)
          idRef.current = saved.id
          createdHere.current = saved.id
          dropDraft('new')
          navigate(`/entry/${saved.id}/edit`, { replace: true })
        } else {
          saved = await api.updateEntry(idRef.current, { ...payload, revision: revision.current })
        }
        revision.current = saved.revision

        if (!samePlace(snapshot.location, savedPlace.current)) {
          try {
            if (snapshot.location) await api.setEntryLocation(saved.id, snapshot.location)
            else await api.clearEntryLocation(saved.id)
            savedPlace.current = snapshot.location
          } catch {
            // The place is written on the next pass; it never fails the words.
          }
        }

        prime(`entry:${saved.id}`, saved)
        afterEntryChange()
        const newer = version.current !== at
        dirty.current = newer
        if (newer) {
          setSaveState('dirty')
          schedule()
        } else {
          setSaveState('saved')
          dropDraft(saved.id)
        }
        return true
      } catch (error) {
        if (error instanceof ApiError && error.isConflict) {
          blocked.current = true
          setSaveState('conflict')
          return false
        }
        setSaveState('error')
        return false
      }
    }
    const next = queue.current.then(pass, pass)
    queue.current = next.catch(() => false)
    return next
    // schedule is stable through its ref below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate])

  const saveRef = useRef(save)
  saveRef.current = save

  function schedule() {
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      timer.current = null
      void saveRef.current()
    }, AUTOSAVE_MS)
  }

  function mirrorDraft() {
    if (draftTimer.current !== null) window.clearTimeout(draftTimer.current)
    draftTimer.current = window.setTimeout(() => {
      const current = stateRef.current
      if (idRef.current === null && isEmpty(current)) return
      writeDraft(draftKey(), {
        savedAt: Date.now(),
        revision: revision.current,
        title: current.title,
        document: current.document,
        drawing: current.drawing,
      })
    }, 300)
  }

  function touch() {
    if (!ready.current) return
    version.current += 1
    dirty.current = true
    setSaveState((current) => (current === 'conflict' ? current : 'dirty'))
    mirrorDraft()
    schedule()
  }

  function update(patch: Partial<Draftable>) {
    setState((current) => {
      const next = { ...current, ...patch }
      stateRef.current = next
      return next
    })
    touch()
  }

  // --- the editor --------------------------------------------------------
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: { openOnClick: false, autolink: true, protocols: ['http', 'https', 'mailto'], HTMLAttributes: { rel: 'noopener noreferrer nofollow', target: '_blank' } },
      }),
      TextStyle,
      Color,
      FontSize,
      Placeholder.configure({ placeholder: t('editor.bodyPlaceholder') }),
    ],
    content: state.document,
    editorProps: {
      attributes: { class: 'page-text tiptap pb-6', 'aria-label': t('editor.bodyPlaceholder') },
    },
    onUpdate: ({ editor: instance }) => {
      const document = instance.getJSON() as DocNode
      setState((current) => {
        const next = { ...current, document }
        stateRef.current = next
        return next
      })
      touch()
    },
  })

  const adopt = useCallback(
    (entry: Entry) => {
      const next = fromEntry(entry, zone)
      revision.current = entry.revision
      savedPlace.current = next.location
      stateRef.current = next
      setState(next)
      setMedia(entry.media ?? [])
      editor?.commands.setContent(next.document as never, { emitUpdate: false })
      ready.current = true
    },
    [editor, zone],
  )

  // Load the stored entry (or refresh the cached one) before editing it.
  useEffect(() => {
    if (!existingId || !editor) return
    if (createdHere.current === existingId) return
    let cancelled = false
    api
      .entry(existingId)
      .then((entry) => {
        if (cancelled) return
        prime(`entry:${entry.id}`, entry)
        if (!dirty.current) adopt(entry)
        else revision.current = revision.current ?? entry.revision
        const kept = readDraft(entry.id)
        if (kept && kept.savedAt > Date.parse(entry.updatedAt) && (kept.title !== entry.title || JSON.stringify(kept.document) !== JSON.stringify(entry.document))) {
          setDraft(kept)
        }
      })
      .catch((error: unknown) => !cancelled && setLoadError(error))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingId, editor])

  useEffect(() => {
    if (existingId) return
    const kept = readDraft('new')
    if (kept && (kept.title.trim() || (kept.document.content ?? []).some((node) => !blank(node)) || kept.drawing.length)) {
      setDraft(kept)
    }
  }, [existingId])

  // Nothing may be lost when the phone puts the app away or the page goes.
  useEffect(() => {
    const flush = () => {
      if (!dirty.current) return
      if (timer.current !== null) window.clearTimeout(timer.current)
      timer.current = null
      void saveRef.current()
    }
    const onHidden = () => document.visibilityState === 'hidden' && flush()
    const onUnload = (event: BeforeUnloadEvent) => {
      if (!dirty.current) return
      flush()
      event.preventDefault()
    }
    window.addEventListener('pagehide', flush)
    window.addEventListener('beforeunload', onUnload)
    document.addEventListener('visibilitychange', onHidden)
    window.addEventListener('online', flush)
    return () => {
      window.removeEventListener('pagehide', flush)
      window.removeEventListener('beforeunload', onUnload)
      document.removeEventListener('visibilitychange', onHidden)
      window.removeEventListener('online', flush)
      // Leaving by any other way (a swipe back, the browser button) still saves.
      flush()
    }
  }, [])

  // --- uploads -----------------------------------------------------------
  const fileInput = useRef<HTMLInputElement>(null)
  const uploader = useUploader((uploaded) => {
    setMedia((current) => [...current, ...uploaded])
    const firstPicture = uploaded.find((item) => isPicture(item))
    setState((current) => {
      const next = {
        ...current,
        mediaIds: [...current.mediaIds, ...uploaded.map((item) => item.id)],
        coverMediaId: current.coverMediaId ?? firstPicture?.id ?? null,
      }
      stateRef.current = next
      return next
    })
    touch()
  })

  async function removeMedia(item: Media) {
    try {
      await api.deleteMedia(item.id)
      const related = item.livePhotoId ? media.filter((m) => m.livePhotoId === item.livePhotoId).map((m) => m.id) : [item.id]
      setMedia((current) => current.filter((m) => !related.includes(m.id)))
      const rest = stateRef.current.mediaIds.filter((id) => !related.includes(id))
      const cover = related.includes(stateRef.current.coverMediaId ?? -1)
        ? (media.find((m) => rest.includes(m.id) && isPicture(m))?.id ?? null)
        : stateRef.current.coverMediaId
      update({ mediaIds: rest, coverMediaId: cover })
    } catch (error) {
      notify(describe(error), 'error')
    } finally {
      setRemoving(null)
    }
  }

  // --- leaving -----------------------------------------------------------
  async function finish() {
    if (leaving) return
    setLeaving(true)
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = null
    const ok = await save()
    setLeaving(false)
    if (!ok) {
      setAskLeave(true)
      return
    }
    back()
  }

  function discard() {
    dirty.current = false
    if (timer.current !== null) window.clearTimeout(timer.current)
    dropDraft(draftKey())
    setAskLeave(false)
    back()
  }

  async function loadNewer() {
    const id = idRef.current
    if (!id) return
    try {
      const entry = await api.entry(id)
      blocked.current = false
      dirty.current = false
      version.current += 1
      adopt(entry)
      prime(`entry:${id}`, entry)
      setSaveState('idle')
    } catch (error) {
      notify(describe(error), 'error')
    }
  }

  function restoreDraft() {
    if (!draft) return
    editor?.commands.setContent(draft.document as never, { emitUpdate: false })
    update({ title: draft.title, document: draft.document, drawing: draft.drawing })
    setDraft(null)
  }

  // --- view --------------------------------------------------------------
  const visual = useMemo(() => media.filter((item) => isPicture(item) || isFilm(item) || item.kind === 'file' || item.kind === 'audio'), [media])
  const day = localDateKey(new Date(state.eventTime), state.timezone)
  const folderName = folders.find((folder) => folder.id === state.folderId)?.name
  const textStyle = editor?.getAttributes('textStyle') ?? {}

  if (loadError && !seed) {
    return (
      <>
        <TopBar leading={<CloseButton onClick={back} />} />
        <ErrorState message={describe(loadError)} />
      </>
    )
  }

  return (
    <div className="pb-40">
      <TopBar
        alwaysTitle
        title={<SaveStatus state={saveState} onRetry={() => void save()} />}
        leading={<CloseButton onClick={() => void finish()} />}
        trailing={
          <Button tone="primary" size="sm" loading={leaving} onClick={() => void finish()} className="mr-1">
            {t('editor.done')}
          </Button>
        }
      />

      {saveState === 'conflict' ? (
        <div role="alert" className="mb-4 rounded-[16px] bg-danger-soft px-4 py-3 text-[0.875rem] leading-snug text-danger animate-fade">
          {t('editor.conflict')}
          <Button size="sm" tone="secondary" className="mt-2.5 bg-leaf" onClick={() => void loadNewer()}>
            {t('editor.loadLatest')}
          </Button>
        </div>
      ) : null}

      {draft ? (
        <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[16px] bg-accent-soft px-4 py-3 text-[0.875rem] text-ink animate-fade">
          <span className="min-w-0 flex-1">{t('editor.draftFound', { time: formatTime(new Date(draft.savedAt).toISOString(), language, zone) })}</span>
          <span className="flex gap-1">
            <Button size="sm" tone="quiet" onClick={() => { dropDraft(draftKey()); setDraft(null) }}>
              {t('editor.dropDraft')}
            </Button>
            <Button size="sm" tone="primary" onClick={restoreDraft}>
              {t('editor.restore')}
            </Button>
          </span>
        </div>
      ) : null}

      {loading ? (
        <div className="flex flex-col gap-3 pt-2" aria-busy="true">
          <Skeleton className="h-4 w-48 rounded-md" />
          <Skeleton className="h-10 w-2/3 rounded-lg" />
          <Skeleton className="h-4 w-full rounded-md" />
          <Skeleton className="h-4 w-5/6 rounded-md" />
        </div>
      ) : null}

      <div className={cn(loading && 'hidden')}>
        <button
          type="button"
          onClick={() => setTool('time')}
          className="press -ml-1 flex items-center gap-1.5 rounded-full px-1 py-1 text-[0.9375rem] text-ink-2"
        >
          <span>{longDate(day, language)}</span>
          <span className="tnum text-ink-3">{formatTime(state.eventTime, language, state.timezone)}</span>
          <ChevronDownIcon size={16} className="text-ink-3" />
        </button>

        <textarea
          rows={1}
          value={state.title}
          onChange={(event) => update({ title: event.target.value.replace(/\n/g, ' ') })}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              editor?.commands.focus('start')
            }
          }}
          placeholder={t('editor.titlePlaceholder')}
          aria-label={t('editor.titlePlaceholder')}
          maxLength={300}
          className="mt-2 block w-full resize-none bg-transparent font-serif text-[1.875rem] leading-[1.2] font-medium text-ink outline-none [field-sizing:content] placeholder:text-ink-3/70 [font-variation-settings:'opsz'_60]"
        />

        {visual.length > 0 || uploader.busy ? (
          <div className="-mx-5 mt-4 flex gap-2 overflow-x-auto px-5 pb-1 no-scrollbar sm:mx-0 sm:px-0">
            {visual.map((item, index) => {
              const cover = state.coverMediaId === item.id
              return (
                <div key={item.id} className="relative size-[6.5rem] shrink-0 overflow-hidden rounded-[14px] bg-well">
                  <button type="button" className="block size-full" aria-label={item.originalName} onClick={() => setViewer(index)}>
                    <Thumb media={item} />
                    {!isPicture(item) && !isFilm(item) ? (
                      <span className="absolute inset-x-1.5 bottom-1.5 truncate text-[0.6875rem] text-ink-2">{item.originalName}</span>
                    ) : null}
                  </button>
                  {isPicture(item) ? (
                    <button
                      type="button"
                      aria-label={cover ? t('media.cover') : t('media.setCover')}
                      aria-pressed={cover}
                      onClick={() => update({ coverMediaId: item.id })}
                      className={cn(
                        'absolute top-1 left-1 flex size-8 items-center justify-center rounded-full',
                        cover ? 'text-white' : 'text-white/80',
                      )}
                    >
                      <span className="flex size-6 items-center justify-center rounded-full bg-black/40 backdrop-blur-sm">
                        {cover ? <StarFilledIcon size={14} /> : <StarIcon size={14} />}
                      </span>
                    </button>
                  ) : null}
                  <button
                    type="button"
                    aria-label={t('media.remove')}
                    onClick={() => setRemoving(item)}
                    className="absolute top-1 right-1 flex size-8 items-center justify-center rounded-full text-white"
                  >
                    <span className="flex size-6 items-center justify-center rounded-full bg-black/40 backdrop-blur-sm">
                      <CloseIcon size={13} strokeWidth={2.2} />
                    </span>
                  </button>
                </div>
              )
            })}
            {uploader.busy ? (
              <div className="flex size-[6.5rem] shrink-0 flex-col items-center justify-center gap-2 rounded-[14px] bg-well text-ink-2" role="status">
                <Spinner size={20} />
                <span className="tnum text-[0.75rem]">
                  {uploader.phase.state === 'uploading' ? t('media.uploading', { percent: uploader.phase.percent }) : t('media.preparing')}
                </span>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="mt-4" onClick={(event) => event.target === event.currentTarget && editor?.commands.focus('end')}>
          <EditorContent editor={editor} />
        </div>

        {state.drawing.length > 0 ? (
          <button
            type="button"
            onClick={() => setTool('sketch')}
            className="mt-2 block w-full overflow-hidden rounded-[18px] bg-leaf p-2 text-left"
            aria-label={t('editor.sketch')}
          >
            <SketchView strokes={state.drawing} className="block aspect-[4/3] max-h-64 w-full" />
          </button>
        ) : null}

        {folderName || state.location || state.tags.length ? (
          <div className="mt-6 flex flex-wrap gap-2">
            {folderName ? (
              <button type="button" onClick={() => setTool('folder')} className="press flex h-9 items-center gap-1.5 rounded-full bg-well px-3.5 text-[0.875rem] text-ink">
                <FolderIcon size={16} className="text-ink-3" />
                {folderName}
              </button>
            ) : null}
            {state.location ? (
              <button type="button" onClick={() => setTool('place')} className="press flex h-9 max-w-full items-center gap-1.5 rounded-full bg-well px-3.5 text-[0.875rem] text-ink">
                <PlaceIcon size={16} className="shrink-0 text-ink-3" />
                <span className="truncate">{state.location.name || state.location.address}</span>
              </button>
            ) : null}
            {state.tags.map((tag) => (
              <button key={tag.id} type="button" onClick={() => setTool('tags')} className="press flex h-9 items-center rounded-full bg-accent-soft px-3.5 text-[0.875rem] text-accent">
                #{tag.name}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <input
        ref={fileInput}
        type="file"
        multiple
        accept="image/*,video/*,audio/*,.heic,.heif,.mov,.pdf,.txt,.md,.csv,.doc,.docx,.xls,.xlsx,.zip"
        className="sr-only"
        tabIndex={-1}
        onChange={(event) => {
          void uploader.upload(event.target.files)
          event.target.value = ''
        }}
      />

      <EditorToolbar
        editor={editor}
        marks={{
          place: Boolean(state.location),
          tags: state.tags.length > 0,
          folder: state.folderId !== null,
          sketch: state.drawing.length > 0,
        }}
        onTool={(next) => {
          if (next === 'attach') fileInput.current?.click()
          else setTool(next)
        }}
      />

      <TimeSheet open={tool === 'time'} onClose={() => setTool(null)} value={state.eventTime} zone={state.timezone} onChange={(eventTime) => update({ eventTime })} />
      <FolderSheet open={tool === 'folder'} onClose={() => setTool(null)} value={state.folderId} onChange={(folderId) => update({ folderId })} />
      <TagSheet open={tool === 'tags'} onClose={() => setTool(null)} value={state.tags} onChange={(tags) => update({ tags })} />
      <PlaceSheet
        open={tool === 'place'}
        onClose={() => setTool(null)}
        current={state.location}
        onSelect={(location) => update({ location })}
        onRemove={() => update({ location: null })}
      />
      <Sheet open={tool === 'sketch'} onClose={() => setTool(null)} title={t('sketch.title')} width="lg">
        <SketchPad strokes={state.drawing} onChange={(drawing) => update({ drawing })} />
      </Sheet>
      <StyleSheet
        open={tool === 'style'}
        onClose={() => {
          setTool(null)
          editor?.commands.focus()
        }}
        colour={(textStyle.color as string) || null}
        size={(textStyle.fontSize as string) || null}
        onColour={(value) => {
          if (!editor) return
          if (value) editor.chain().focus().setColor(value).run()
          else editor.chain().focus().unsetColor().run()
        }}
        onSize={(value) => {
          if (!editor) return
          if (value) editor.chain().focus().setFontSize(value).run()
          else editor.chain().focus().unsetFontSize().run()
        }}
      />
      <LinkSheet
        open={tool === 'link'}
        onClose={() => setTool(null)}
        initial={(editor?.getAttributes('link').href as string) ?? ''}
        onApply={(href) => {
          if (!editor) return
          const chain = editor.chain().focus().extendMarkRange('link')
          if (href) chain.setLink({ href }).run()
          else chain.unsetLink().run()
        }}
      />

      <ConfirmSheet
        open={removing !== null}
        onClose={() => setRemoving(null)}
        title={t('media.removeTitle')}
        body={t('media.removeBody')}
        confirmLabel={t('common.remove')}
        destructive
        onConfirm={() => removing && void removeMedia(removing)}
      />
      <ConfirmSheet
        open={askLeave}
        onClose={() => setAskLeave(false)}
        title={t('editor.leaveTitle')}
        body={t('editor.leaveBody')}
        confirmLabel={t('editor.saveAndLeave')}
        busy={leaving}
        onConfirm={() => {
          setAskLeave(false)
          blocked.current = false
          void finish()
        }}
        secondaryLabel={t('editor.discard')}
        onSecondary={discard}
      />

      {viewer !== null ? (
        <Viewer items={visual} all={media} index={viewer} onIndex={setViewer} onClose={() => setViewer(null)} />
      ) : null}
    </div>
  )
}

function CloseButton({ onClick }: { onClick: () => void }) {
  const { t } = useTranslation()
  return (
    <button type="button" onClick={onClick} aria-label={t('nav.back')} className="press -ml-1 flex size-11 items-center justify-center rounded-full text-ink-2">
      <CloseIcon size={22} />
    </button>
  )
}

function SaveStatus({ state, onRetry }: { state: SaveState; onRetry: () => void }) {
  const { t } = useTranslation()
  if (state === 'saving') return <span className="text-[0.8125rem] font-normal text-ink-3">{t('editor.saving')}</span>
  if (state === 'saved')
    return (
      <span className="inline-flex items-center gap-1 text-[0.8125rem] font-normal text-ink-3 animate-fade">
        <CheckIcon size={14} strokeWidth={2} />
        {t('editor.saved')}
      </span>
    )
  if (state === 'error')
    return (
      <button type="button" onClick={onRetry} className="pointer-events-auto text-[0.8125rem] font-medium text-danger">
        {t('editor.failed')} <span className="underline underline-offset-2">{t('editor.retry')}</span>
      </button>
    )
  if (state === 'dirty') return <span className="text-[0.8125rem] font-normal text-ink-3">{t('editor.unsaved')}</span>
  return null
}
