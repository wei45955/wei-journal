import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../../lib/api'
import { cn } from '../../lib/cn'
import { usePrefs } from '../../state/auth'
import { Button, Chip, Spinner, inputClass } from '../../ui'
import { Sheet } from '../../ui/Sheet'

/**
 * The kinds of polish a writer can ask for. The instruction is written in
 * the language of the journal, so the model is told what to do in the same
 * language the writer used.
 */
const PRESETS = [
  {
    id: 'concise',
    zh: '把这段话写得更简洁：去掉重复和多余的话，句子更短。',
    en: 'Make this more concise: cut the repetition and the extra words, and keep the sentences short.',
  },
  {
    id: 'fluent',
    zh: '把这段话写得更通顺：句子之间衔接自然，读起来顺口。',
    en: 'Make this read more smoothly: let the sentences follow one another naturally.',
  },
  {
    id: 'vivid',
    zh: '把这段话写得更生动：加一点画面感和细节，但不编造没有的事实。',
    en: 'Make this more vivid: add a little imagery and detail, but invent nothing that is not there.',
  },
  {
    id: 'shorter',
    zh: '把这段话缩短一半左右，只留下最要紧的内容。',
    en: 'Cut this in half and keep only what matters.',
  },
  {
    id: 'longer',
    zh: '把这段话写得更丰富：补充感受和细节，但不改变原来的事实。',
    en: 'Write this out a little more: add feelings and detail without changing the facts.',
  },
  {
    id: 'formal',
    zh: '把这段话改得更书面一点，语气更正式。',
    en: 'Rewrite this in a more formal voice.',
  },
  {
    id: 'typos',
    zh: '只改错别字、标点和病句，不要改动用词和意思。',
    en: 'Fix only the typos, the punctuation and the broken sentences. Leave the words and the meaning alone.',
  },
]

/**
 * The polish panel: the writer says what they want, the model rewrites the
 * text, and the result is shown before it replaces anything.
 */
export function PolishSheet({
  open,
  onClose,
  text,
  available,
  reason,
  onApply,
}: {
  open: boolean
  onClose: () => void
  /** The words to rewrite. */
  text: string
  /** Whether the server can reach a model. */
  available: boolean
  /** Why it cannot, when it cannot. */
  reason: string
  onApply: (text: string) => void
}) {
  const { t } = useTranslation()
  const { language } = usePrefs()
  const [instruction, setInstruction] = useState('')
  const [preset, setPreset] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [showOriginal, setShowOriginal] = useState(false)

  useEffect(() => {
    if (open) return
    setInstruction('')
    setPreset(null)
    setResult(null)
    setError('')
    setShowOriginal(false)
  }, [open])

  const zh = language === 'zh-CN'
  const hints = useMemo(() => PRESETS.map((item) => ({ id: item.id, label: t(`polish.preset.${item.id}`), text: zh ? item.zh : item.en })), [t, zh])

  function choose(id: string) {
    const found = hints.find((item) => item.id === id)
    if (!found) return
    setPreset(id)
    setInstruction(found.text)
    setResult(null)
    setError('')
  }

  async function run() {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const polished = await api.polish({ text, instruction: instruction.trim() })
      setResult(polished.text)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusy(false)
    }
  }

  const empty = !text.trim()

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t('polish.title')}
      width="md"
      footer={
        result !== null ? (
          <div className="flex gap-2">
            <Button tone="secondary" className="flex-1" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button tone="primary" className="flex-1" onClick={() => onApply(result)}>
              {t('polish.use')}
            </Button>
          </div>
        ) : (
          <Button tone="primary" block size="lg" loading={busy} disabled={!available || empty} onClick={() => void run()}>
            {busy ? t('polish.working') : t('polish.run')}
          </Button>
        )
      }
    >
      {!available ? (
        <p role="status" className="mt-3 rounded-[14px] bg-accent-soft px-4 py-3 text-[0.875rem] leading-snug text-accent">
          {reason}
        </p>
      ) : null}

      {empty ? (
        <p role="status" className="mt-3 rounded-[14px] bg-well px-4 py-3 text-[0.875rem] leading-snug text-ink-2">
          {t('polish.empty')}
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-1.5">
        {hints.map((hint) => (
          <Chip key={hint.id} selected={preset === hint.id} onClick={() => choose(hint.id)}>
            {hint.label}
          </Chip>
        ))}
      </div>

      <label className="mt-4 block">
        <span className="mb-1.5 block text-[0.8125rem] text-ink-3">{t('polish.instruction')}</span>
        <textarea
          value={instruction}
          onChange={(event) => {
            setInstruction(event.target.value)
            setPreset(null)
          }}
          rows={3}
          maxLength={500}
          placeholder={t('polish.instructionPlaceholder')}
          aria-label={t('polish.instruction')}
          className={cn(inputClass, 'resize-none leading-relaxed')}
        />
      </label>

      {error ? (
        <p role="alert" className="mt-3 text-[0.875rem] text-danger">
          {error}
        </p>
      ) : null}

      {busy ? (
        <p role="status" className="mt-4 flex items-center gap-2 text-[0.875rem] text-ink-3">
          <Spinner size={16} />
          {t('polish.working')}
        </p>
      ) : null}

      {result !== null ? (
        <div className="mt-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-[0.8125rem] font-semibold text-ink-2">{t('polish.result')}</h3>
            <button type="button" onClick={() => setShowOriginal((value) => !value)} className="press text-[0.8125rem] font-medium text-accent">
              {showOriginal ? t('polish.hideOriginal') : t('polish.showOriginal')}
            </button>
          </div>
          {showOriginal ? (
            <div className="mt-2 rounded-[14px] bg-well px-4 py-3 text-[0.9375rem] leading-relaxed whitespace-pre-wrap text-ink-2">
              {text}
            </div>
          ) : null}
          <div className="mt-2 rounded-[14px] border border-rule px-4 py-3 text-[0.9375rem] leading-relaxed whitespace-pre-wrap text-ink">
            {result}
          </div>
          <Button tone="quiet" className="mt-2" onClick={() => void run()}>
            {t('polish.again')}
          </Button>
        </div>
      ) : null}
    </Sheet>
  )
}
