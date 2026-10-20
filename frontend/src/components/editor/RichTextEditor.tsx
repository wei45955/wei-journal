import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { EditorContent, useEditor, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import { cn } from '../../lib/cn'
import type { DocNode } from '../../lib/types'
import {
  BoldIcon,
  HeadingIcon,
  ItalicIcon,
  ListIcon,
  QuoteIcon,
  RedoIcon,
  UndoIcon,
} from '../icons'

interface RichTextEditorProps {
  content?: DocNode | null
  onChange: (document: DocNode) => void
  placeholder?: string
  editable?: boolean
  ariaLabel?: string
}

const EMPTY_DOC: DocNode = { type: 'doc', content: [{ type: 'paragraph' }] }

export function RichTextEditor({
  content,
  onChange,
  placeholder,
  editable = true,
  ariaLabel,
}: RichTextEditorProps) {
  const { t } = useTranslation()

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: { openOnClick: false, autolink: true, protocols: ['http', 'https', 'mailto'] },
      }),
      Placeholder.configure({ placeholder: placeholder ?? '' }),
    ],
    content: (content as never) ?? EMPTY_DOC,
    editable,
    editorProps: {
      attributes: {
        class: 'rte focus:outline-none min-h-[16rem] px-4 py-3',
        'aria-label': ariaLabel ?? placeholder ?? t('entries.bodyPlaceholder'),
      },
    },
    onUpdate: ({ editor: instance }) => {
      onChange(instance.getJSON() as DocNode)
    },
  })

  // Adopt the stored document when the entry is opened, but never while the
  // user is typing.
  useEffect(() => {
    if (!editor) return
    if (editor.isFocused) return
    const next = (content as never) ?? EMPTY_DOC
    const current = JSON.stringify(editor.getJSON())
    if (JSON.stringify(next) !== current) {
      editor.commands.setContent(next as never, { emitUpdate: false })
    }
  }, [content, editor])

  useEffect(() => {
    editor?.setEditable(editable)
  }, [editor, editable])

  if (!editor) {
    return <div className="min-h-[16rem] rounded-2xl bg-paper-raised" />
  }

  return (
    <div className="overflow-hidden rounded-2xl bg-paper-raised shadow-[0_1px_2px_rgb(0_0_0/0.04)]">
      <Toolbar editor={editor} />
      <EditorContent editor={editor} />
    </div>
  )
}

function Toolbar({ editor }: { editor: Editor }) {
  const { t } = useTranslation()

  const items = [
    {
      key: 'bold',
      label: t('editor.bold'),
      icon: <BoldIcon size={16} />,
      active: editor.isActive('bold'),
      disabled: !editor.can().chain().focus().toggleBold().run(),
      run: () => editor.chain().focus().toggleBold().run(),
    },
    {
      key: 'italic',
      label: t('editor.italic'),
      icon: <ItalicIcon size={16} />,
      active: editor.isActive('italic'),
      disabled: !editor.can().chain().focus().toggleItalic().run(),
      run: () => editor.chain().focus().toggleItalic().run(),
    },
    {
      key: 'strike',
      label: t('editor.strike'),
      icon: <span className="text-xs font-semibold line-through">S</span>,
      active: editor.isActive('strike'),
      disabled: !editor.can().chain().focus().toggleStrike().run(),
      run: () => editor.chain().focus().toggleStrike().run(),
    },
    {
      key: 'underline',
      label: t('editor.underline'),
      icon: <span className="text-xs font-semibold underline">U</span>,
      active: editor.isActive('underline'),
      disabled: !editor.can().chain().focus().toggleUnderline().run(),
      run: () => editor.chain().focus().toggleUnderline().run(),
    },
    {
      key: 'h1',
      label: t('editor.heading1'),
      icon: <HeadingIcon size={16} />,
      active: editor.isActive('heading', { level: 1 }),
      disabled: !editor.can().chain().focus().toggleHeading({ level: 1 }).run(),
      run: () => editor.chain().focus().toggleHeading({ level: 1 }).run(),
    },
    {
      key: 'h2',
      label: t('editor.heading2'),
      icon: <HeadingIcon size={16} />,
      active: editor.isActive('heading', { level: 2 }),
      disabled: !editor.can().chain().focus().toggleHeading({ level: 2 }).run(),
      run: () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
    },
    {
      key: 'bullet',
      label: t('editor.bulletList'),
      icon: <ListIcon size={16} />,
      active: editor.isActive('bulletList'),
      disabled: !editor.can().chain().focus().toggleBulletList().run(),
      run: () => editor.chain().focus().toggleBulletList().run(),
    },
    {
      key: 'quote',
      label: t('editor.quote'),
      icon: <QuoteIcon size={16} />,
      active: editor.isActive('blockquote'),
      disabled: !editor.can().chain().focus().toggleBlockquote().run(),
      run: () => editor.chain().focus().toggleBlockquote().run(),
    },
  ]

  return (
    <div className="flex items-center gap-0.5 overflow-x-auto border-b border-line/70 bg-paper-sunken/40 px-2 py-1.5 no-scrollbar">
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          onClick={item.run}
          disabled={item.disabled}
          aria-label={item.label}
          aria-pressed={item.active}
          className={cn(
            'flex size-8 shrink-0 items-center justify-center rounded-lg transition-colors disabled:opacity-30',
            item.active ? 'bg-paper-raised text-accent-ink shadow-sm' : 'text-ink-muted hover:bg-paper-raised hover:text-ink',
          )}
        >
          {item.icon}
        </button>
      ))}

      <span className="mx-1 h-5 w-px shrink-0 bg-line" aria-hidden="true" />

      <button
        type="button"
        onClick={() => editor.chain().focus().undo().run()}
        disabled={!editor.can().chain().focus().undo().run()}
        aria-label={t('drawing.undo')}
        className="flex size-8 shrink-0 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-paper-raised hover:text-ink disabled:opacity-30"
      >
        <UndoIcon size={16} />
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().redo().run()}
        disabled={!editor.can().chain().focus().redo().run()}
        aria-label={t('drawing.redo')}
        className="flex size-8 shrink-0 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-paper-raised hover:text-ink disabled:opacity-30"
      >
        <RedoIcon size={16} />
      </button>
    </div>
  )
}
