import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useEditorState, type Editor } from '@tiptap/react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/cn'
import {
  BoldIcon,
  ChevronLeftIcon,
  ClockIcon,
  FolderIcon,
  ImageIcon,
  ItalicIcon,
  KeyboardDownIcon,
  LinkIcon,
  ListIcon,
  OrderedListIcon,
  PlaceIcon,
  QuoteIcon,
  RedoIcon,
  SketchIcon,
  StrikeIcon,
  TagIcon,
  TextIcon,
  UnderlineIcon,
  UndoIcon,
} from '../../ui/icons'

/** How far the on-screen keyboard pushes into the layout viewport. */
export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0)
  useEffect(() => {
    const viewport = window.visualViewport
    if (!viewport) return
    const update = () => setInset(Math.max(0, Math.round(window.innerHeight - viewport.height - viewport.offsetTop)))
    update()
    viewport.addEventListener('resize', update)
    viewport.addEventListener('scroll', update)
    return () => {
      viewport.removeEventListener('resize', update)
      viewport.removeEventListener('scroll', update)
    }
  }, [])
  return inset
}

export type EditorTool = 'attach' | 'sketch' | 'place' | 'tags' | 'folder' | 'time' | 'style' | 'link'

function Tool({
  label,
  active,
  disabled,
  onPress,
  keepFocus = true,
  children,
}: {
  label: string
  active?: boolean
  disabled?: boolean
  onPress: () => void
  keepFocus?: boolean
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      disabled={disabled}
      // The editor keeps the caret and the keyboard stays up.
      onMouseDown={keepFocus ? (event) => event.preventDefault() : undefined}
      onClick={onPress}
      className={cn(
        'press flex h-11 min-w-11 shrink-0 items-center justify-center rounded-[12px] disabled:opacity-30',
        active ? 'bg-accent-soft text-accent' : 'text-ink',
      )}
    >
      {children}
    </button>
  )
}

/**
 * The bar that rides on top of the keyboard. One row holds the things an
 * entry can carry; the "Aa" key swaps it for the text styles.
 */
export function EditorToolbar({
  editor,
  onTool,
  marks,
}: {
  editor: Editor | null
  onTool: (tool: EditorTool) => void
  /** Which of the entry's extras are set, so their keys show it. */
  marks: { place: boolean; tags: boolean; folder: boolean; sketch: boolean }
}) {
  const { t } = useTranslation()
  const inset = useKeyboardInset()
  const [mode, setMode] = useState<'tools' | 'format'>('tools')
  const keyboard = inset > 80

  const state = useEditorState({
    editor,
    selector: ({ editor: e }) =>
      e
        ? {
            bold: e.isActive('bold'),
            italic: e.isActive('italic'),
            underline: e.isActive('underline'),
            strike: e.isActive('strike'),
            h2: e.isActive('heading', { level: 2 }),
            h3: e.isActive('heading', { level: 3 }),
            bullet: e.isActive('bulletList'),
            ordered: e.isActive('orderedList'),
            quote: e.isActive('blockquote'),
            link: e.isActive('link'),
            styled: Boolean(e.getAttributes('textStyle').color || e.getAttributes('textStyle').fontSize),
            undo: e.can().undo(),
            redo: e.can().redo(),
          }
        : null,
  })

  const run = (command: (chain: ReturnType<Editor['chain']>) => ReturnType<Editor['chain']>) => {
    if (editor) command(editor.chain().focus()).run()
  }

  return (
    <div
      className="fixed inset-x-0 z-50 lg:pl-[17rem]"
      style={{ bottom: inset, transition: keyboard ? 'none' : 'bottom 200ms' }}
    >
      <div
        className={cn(
          'glass mx-auto flex max-w-[44rem] items-center border-t border-rule/70 px-2 sm:mb-3 sm:rounded-[18px] sm:border sm:shadow-float',
          keyboard ? 'pb-0' : 'pb-[env(safe-area-inset-bottom)]',
        )}
      >
        <div className="flex h-[52px] min-w-0 flex-1 items-center gap-0.5 overflow-x-auto no-scrollbar" role="toolbar" aria-label={mode === 'tools' ? t('editor.tools') : t('editor.format')}>
          {mode === 'tools' ? (
            <>
              <Tool label={t('editor.format')} onPress={() => setMode('format')}>
                <TextIcon size={23} />
              </Tool>
              <span className="mx-1 h-6 w-px shrink-0 bg-rule" aria-hidden="true" />
              <Tool label={t('editor.attach')} keepFocus={false} onPress={() => onTool('attach')}>
                <ImageIcon size={22} />
              </Tool>
              <Tool label={t('editor.sketch')} keepFocus={false} active={marks.sketch} onPress={() => onTool('sketch')}>
                <SketchIcon size={22} />
              </Tool>
              <Tool label={t('editor.place')} keepFocus={false} active={marks.place} onPress={() => onTool('place')}>
                <PlaceIcon size={22} />
              </Tool>
              <Tool label={t('editor.tags')} keepFocus={false} active={marks.tags} onPress={() => onTool('tags')}>
                <TagIcon size={22} />
              </Tool>
              <Tool label={t('editor.folder')} keepFocus={false} active={marks.folder} onPress={() => onTool('folder')}>
                <FolderIcon size={22} />
              </Tool>
              <Tool label={t('editor.time')} keepFocus={false} onPress={() => onTool('time')}>
                <ClockIcon size={22} />
              </Tool>
            </>
          ) : (
            <>
              <Tool label={t('nav.back')} onPress={() => setMode('tools')}>
                <ChevronLeftIcon size={22} />
              </Tool>
              <span className="mx-1 h-6 w-px shrink-0 bg-rule" aria-hidden="true" />
              <Tool label={t('format.bold')} active={state?.bold} onPress={() => run((c) => c.toggleBold())}>
                <BoldIcon size={20} />
              </Tool>
              <Tool label={t('format.italic')} active={state?.italic} onPress={() => run((c) => c.toggleItalic())}>
                <ItalicIcon size={20} />
              </Tool>
              <Tool label={t('format.underline')} active={state?.underline} onPress={() => run((c) => c.toggleUnderline())}>
                <UnderlineIcon size={20} />
              </Tool>
              <Tool label={t('format.strike')} active={state?.strike} onPress={() => run((c) => c.toggleStrike())}>
                <StrikeIcon size={20} />
              </Tool>
              <Tool label={t('format.heading')} active={state?.h2} onPress={() => run((c) => c.toggleHeading({ level: 2 }))}>
                <span className="font-serif text-[1.125rem] font-semibold">H</span>
              </Tool>
              <Tool label={t('format.subheading')} active={state?.h3} onPress={() => run((c) => c.toggleHeading({ level: 3 }))}>
                <span className="font-serif text-[0.9375rem] font-semibold">h</span>
              </Tool>
              <Tool label={t('format.bullet')} active={state?.bullet} onPress={() => run((c) => c.toggleBulletList())}>
                <ListIcon size={21} />
              </Tool>
              <Tool label={t('format.ordered')} active={state?.ordered} onPress={() => run((c) => c.toggleOrderedList())}>
                <OrderedListIcon size={21} />
              </Tool>
              <Tool label={t('format.quote')} active={state?.quote} onPress={() => run((c) => c.toggleBlockquote())}>
                <QuoteIcon size={21} />
              </Tool>
              <Tool label={t('format.link')} active={state?.link} keepFocus={false} onPress={() => onTool('link')}>
                <LinkIcon size={21} />
              </Tool>
              <Tool label={t('format.color')} active={state?.styled} keepFocus={false} onPress={() => onTool('style')}>
                <span className="relative font-serif text-[1.125rem] font-semibold">
                  A
                  <span className="absolute inset-x-0 -bottom-0.5 h-[3px] rounded-full bg-[linear-gradient(90deg,#3b6fb6,#2f8a5f,#c0602f,#9a5bb5)]" />
                </span>
              </Tool>
              <span className="mx-1 h-6 w-px shrink-0 bg-rule" aria-hidden="true" />
              <Tool label={t('format.undo')} disabled={!state?.undo} onPress={() => run((c) => c.undo())}>
                <UndoIcon size={21} />
              </Tool>
              <Tool label={t('format.redo')} disabled={!state?.redo} onPress={() => run((c) => c.redo())}>
                <RedoIcon size={21} />
              </Tool>
            </>
          )}
        </div>
        {keyboard ? (
          <button
            type="button"
            aria-label={t('editor.hideKeyboard')}
            onClick={() => (document.activeElement as HTMLElement | null)?.blur()}
            className="press ml-1 flex size-11 shrink-0 items-center justify-center rounded-[12px] text-ink-2"
          >
            <KeyboardDownIcon size={22} />
          </button>
        ) : null}
      </div>
    </div>
  )
}
