import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/cn'
import { isoToWallInput, wallInputToISO } from '../../lib/format'
import type { Tag } from '../../lib/types'
import { createFolder, createTag, useFolders, useTags } from '../../state/library'
import { useToast } from '../../state/toast'
import { Button, Chip, inputClass, TextInput } from '../../ui'
import { Popover } from '../../ui/Popover'
import { Sheet } from '../../ui/Sheet'
import { CheckIcon, FolderIcon, InboxIcon, PlusIcon } from '../../ui/icons'

/* ------------------------------------------------------------------ tags */

export function TagSheet({ open, onClose, value, onChange }: { open: boolean; onClose: () => void; value: Tag[]; onChange: (tags: Tag[]) => void }) {
  const { t } = useTranslation()
  const { tags } = useTags()
  const { notify, describe } = useToast()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) setText('')
  }, [open])

  const chosen = new Set(value.map((tag) => tag.id))
  const needle = text.trim().toLowerCase()
  const shown = tags.filter((tag) => !needle || tag.name.toLowerCase().includes(needle))
  const exact = tags.find((tag) => tag.name.trim().toLowerCase() === needle)

  function toggle(tag: Tag) {
    onChange(chosen.has(tag.id) ? value.filter((item) => item.id !== tag.id) : [...value, tag])
  }

  async function add(event?: React.FormEvent) {
    event?.preventDefault()
    if (!needle || busy) return
    if (exact) {
      if (!chosen.has(exact.id)) onChange([...value, exact])
      setText('')
      return
    }
    setBusy(true)
    try {
      const tag = await createTag(text)
      onChange([...value, tag])
      setText('')
    } catch (error) {
      notify(describe(error), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title={t('tags.title')} tall>
      <form onSubmit={add} className="sticky top-0 z-10 -mx-5 bg-leaf px-5 pt-1 pb-3">
        <TextInput
          value={text}
          maxLength={120}
          onChange={(event) => setText(event.target.value)}
          placeholder={t('tags.add')}
          aria-label={t('tags.add')}
          enterKeyHint="done"
        />
      </form>
      {needle && !exact ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => void add()}
          className="press mb-3 flex h-11 items-center gap-2 rounded-full px-1 text-[0.9375rem] font-medium text-accent"
        >
          <PlusIcon size={19} />
          {t('tags.create', { name: text.trim() })}
        </button>
      ) : null}
      {tags.length === 0 && !needle ? <p className="py-4 text-[0.9375rem] text-ink-3">{t('tags.empty')}</p> : null}
      <div className="flex flex-wrap gap-2">
        {shown.map((tag) => (
          <Chip key={tag.id} selected={chosen.has(tag.id)} onClick={() => toggle(tag)}>
            #{tag.name}
          </Chip>
        ))}
      </div>
    </Sheet>
  )
}

/* ---------------------------------------------------------------- folder */

export function FolderSheet({
  open,
  onClose,
  value,
  onChange,
}: {
  open: boolean
  onClose: () => void
  value: number | null
  onChange: (id: number | null) => void
}) {
  const { t } = useTranslation()
  const { folders } = useFolders()
  const { notify, describe } = useToast()
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  function pick(id: number | null) {
    onChange(id)
    onClose()
  }

  async function add(event: React.FormEvent) {
    event.preventDefault()
    if (!name.trim() || busy) return
    setBusy(true)
    try {
      const folder = await createFolder(name)
      setName('')
      pick(folder.id)
    } catch (error) {
      notify(describe(error), 'error')
    } finally {
      setBusy(false)
    }
  }

  const row = (active: boolean) =>
    cn(
      'flex min-h-[52px] w-full items-center gap-3.5 rounded-[14px] px-3 text-left text-[1rem] active:bg-well',
      active ? 'text-accent' : 'text-ink',
    )

  return (
    <Sheet open={open} onClose={onClose} title={t('folder.title')} width="sm">
      <ul className="-mx-2">
        <li>
          <button type="button" className={row(value === null)} onClick={() => pick(null)}>
            <InboxIcon size={22} className="text-ink-2" />
            <span className="flex-1">{t('folder.none')}</span>
            {value === null ? <CheckIcon size={20} /> : null}
          </button>
        </li>
        {folders.map((folder) => (
          <li key={folder.id}>
            <button type="button" className={row(value === folder.id)} onClick={() => pick(folder.id)}>
              <FolderIcon size={22} className="text-ink-2" />
              <span className="min-w-0 flex-1 truncate">{folder.name}</span>
              {value === folder.id ? <CheckIcon size={20} /> : null}
            </button>
          </li>
        ))}
      </ul>
      <form onSubmit={add} className="mt-3 flex items-center gap-2 border-t border-rule pt-4">
        <TextInput
          value={name}
          maxLength={80}
          onChange={(event) => setName(event.target.value)}
          placeholder={t('timeline.newFolder')}
          aria-label={t('timeline.folderName')}
        />
        <Button type="submit" tone="primary" loading={busy} disabled={!name.trim()}>
          {t('common.add')}
        </Button>
      </form>
    </Sheet>
  )
}

/* ------------------------------------------------------------------ time */

export function TimeSheet({
  open,
  onClose,
  value,
  zone,
  onChange,
}: {
  open: boolean
  onClose: () => void
  value: string
  zone: string
  onChange: (iso: string) => void
}) {
  const { t } = useTranslation()
  const wall = useMemo(() => isoToWallInput(value, zone), [value, zone])
  return (
    <Sheet open={open} onClose={onClose} title={t('time.title')} width="sm">
      <div className="pt-1 pb-2">
        <input
          type="datetime-local"
          value={wall}
          onChange={(event) => event.target.value && onChange(wallInputToISO(event.target.value, zone))}
          aria-label={t('time.title')}
          className={cn(inputClass, 'tnum')}
        />
        <p className="mt-2 text-[0.8125rem] leading-snug text-ink-3">{t('time.hint')}</p>
        <Button className="mt-4" size="sm" onClick={() => onChange(new Date().toISOString())}>
          {t('time.now')}
        </Button>
      </div>
    </Sheet>
  )
}

/* ------------------------------------------------------------ text style */

export const TEXT_COLOURS = ['#3b6fb6', '#2f8a5f', '#c0602f', '#c2453f', '#9a5bb5', '#b08a1e']
export const TEXT_SIZES = [
  { id: 'small', value: '15px' },
  { id: 'normal', value: '' },
  { id: 'large', value: '22px' },
] as const

export function StyleMenu({
  open,
  onClose,
  anchorRef,
  colour,
  size,
  onColour,
  onSize,
}: {
  open: boolean
  onClose: () => void
  anchorRef: React.RefObject<HTMLElement | null>
  colour: string | null
  size: string | null
  onColour: (value: string | null) => void
  onSize: (value: string | null) => void
}) {
  const { t } = useTranslation()
  return (
    <Popover
      open={open}
      onClose={onClose}
      anchorRef={anchorRef}
      placement="top-end"
      label={t('editor.format')}
      className="w-[17.5rem] max-w-[calc(100vw_-_1.5rem)] p-4"
    >
      <p className="text-[0.8125rem] text-ink-3">{t('format.color')}</p>
      <div className="mt-2 flex items-center justify-between">
        <button
          type="button"
          aria-label={t('format.inkDefault')}
          aria-pressed={!colour}
          onClick={() => onColour(null)}
          className="press flex size-11 items-center justify-center rounded-full"
        >
          <span className={cn('size-8 rounded-full bg-ink', !colour && 'shadow-[0_0_0_2px_var(--wj-leaf),0_0_0_4px_var(--wj-accent)]')} />
        </button>
        {TEXT_COLOURS.map((swatch) => (
          <button
            key={swatch}
            type="button"
            aria-label={swatch}
            aria-pressed={colour === swatch}
            onClick={() => onColour(swatch)}
            className="press flex size-11 items-center justify-center rounded-full"
          >
            <span
              className={cn('size-8 rounded-full', colour === swatch && 'shadow-[0_0_0_2px_var(--wj-leaf),0_0_0_4px_var(--wj-accent)]')}
              style={{ background: swatch }}
            />
          </button>
        ))}
      </div>
      <p className="mt-4 text-[0.8125rem] text-ink-3">{t('format.size')}</p>
      <div className="mt-2 grid grid-cols-3 gap-2">
        {TEXT_SIZES.map((option) => {
          const active = (size ?? '') === option.value
          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={active}
              onClick={() => onSize(option.value || null)}
              className={cn(
                'press flex h-12 items-center justify-center rounded-[14px] font-serif',
                active ? 'bg-accent-soft text-accent' : 'bg-well text-ink',
              )}
              style={{ fontSize: option.value || '18px' }}
            >
              {t(`format.${option.id}`)}
            </button>
          )
        })}
      </div>
    </Popover>
  )
}

/* ------------------------------------------------------------------ link */

export function LinkSheet({
  open,
  onClose,
  initial,
  onApply,
}: {
  open: boolean
  onClose: () => void
  initial: string
  onApply: (href: string | null) => void
}) {
  const { t } = useTranslation()
  const [href, setHref] = useState(initial)
  useEffect(() => {
    if (open) setHref(initial)
  }, [open, initial])

  function submit(event: React.FormEvent) {
    event.preventDefault()
    const value = href.trim()
    if (!value) {
      onApply(null)
    } else {
      onApply(/^(https?:|mailto:)/i.test(value) ? value : `https://${value}`)
    }
    onClose()
  }

  return (
    <Sheet open={open} onClose={onClose} title={t('format.link')} width="sm">
      <form onSubmit={submit} className="flex flex-col gap-3 pt-1 pb-2">
        <TextInput
          autoFocus
          type="url"
          inputMode="url"
          autoCapitalize="none"
          value={href}
          onChange={(event) => setHref(event.target.value)}
          placeholder="https://"
          aria-label={t('format.linkPrompt')}
        />
        <div className="flex gap-2">
          {initial ? (
            <Button
              tone="secondary"
              onClick={() => {
                onApply(null)
                onClose()
              }}
            >
              {t('format.unlink')}
            </Button>
          ) : null}
          <Button type="submit" tone="primary" className="ml-auto">
            {t('common.done')}
          </Button>
        </div>
      </form>
    </Sheet>
  )
}
