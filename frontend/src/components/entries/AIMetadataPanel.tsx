import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../../lib/api'
import { useToast } from '../../state/toast'
import { Badge, Button } from '../ui'
import { SparkIcon } from '../icons'
import type { AIMetadata } from '../../lib/types'

interface AIMetadataPanelProps {
  metadata: AIMetadata[]
  onApplyTags?: (tags: string[]) => void
  entryId?: number
}

/** Shows what the optional AI features produced for an entry. */
export function AIMetadataPanel({ metadata, onApplyTags, entryId }: AIMetadataPanelProps) {
  const { t } = useTranslation()
  const { notify, describe } = useToast()
  const [busy, setBusy] = useState(false)

  if (metadata.length === 0) return null

  const summary = metadata.find((item) => item.kind === 'summary')
  const descriptions = metadata.filter((item) => item.kind === 'description' || item.kind === 'image')
  const suggestions = metadata.flatMap((item) => item.suggestedTags ?? [])
  const keywords = metadata.flatMap((item) => item.keywords ?? [])
  const pending = metadata.some((item) => item.status === 'pending' || item.status === 'processing')
  const failed = metadata.find((item) => item.status === 'failed' || item.status === 'error')

  async function reprocess() {
    if (!entryId) return
    setBusy(true)
    try {
      const result = await api.reprocessAI({ entryId })
      notify(t('entries.aiPending'), 'success')
      if (result.queued === 0) notify(t('entries.aiDisabled'), 'info')
    } catch (err) {
      notify(describe(err, t('errors.generic')), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="rounded-lg border border-line bg-paper-raised/70 p-4">
      <header className="mb-2 flex items-center gap-2">
        <SparkIcon size={16} className="text-accent" />
        <h3 className="text-sm font-semibold text-ink">{t('entries.aiSummary')}</h3>
        {entryId ? (
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto"
            loading={busy}
            onClick={() => void reprocess()}
          >
            {t('common.retry')}
          </Button>
        ) : null}
      </header>

      {pending ? <p className="text-sm text-ink-muted">{t('entries.aiPending')}</p> : null}

      {failed ? (
        <p className="text-sm text-danger">
          {t('entries.aiFailed')}
          {failed.error ? `: ${failed.error}` : ''}
        </p>
      ) : null}

      {summary?.summary ? (
        <p className="text-sm leading-relaxed text-ink-muted">{summary.summary}</p>
      ) : null}

      {descriptions
        .filter((item) => item.description)
        .map((item) => (
          <p key={item.id} className="mt-2 text-sm leading-relaxed text-ink-muted">
            {item.description}
          </p>
        ))}

      {suggestions.length > 0 ? (
        <div className="mt-3">
          <p className="mb-1.5 text-xs font-medium text-ink-faint">{t('entries.aiSuggestedTags')}</p>
          <div className="flex flex-wrap items-center gap-1.5">
            {suggestions.map((tag) => (
              <button
                key={tag}
                type="button"
                disabled={!onApplyTags}
                onClick={() => onApplyTags?.([tag])}
                className="rounded-full bg-accent-soft px-2.5 py-1 text-xs font-medium text-accent-ink transition-opacity disabled:opacity-100"
                title={onApplyTags ? t('entries.addTag') : undefined}
              >
                {tag}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {keywords.length > 0 ? (
        <div className="mt-3">
          <p className="mb-1.5 text-xs font-medium text-ink-faint">{t('entries.aiKeywords')}</p>
          <div className="flex flex-wrap gap-1.5">
            {keywords.map((keyword) => (
              <Badge key={keyword} tone="sage">
                {keyword}
              </Badge>
            ))}
          </div>
        </div>
      ) : null}

      <p className="mt-3 text-xs text-ink-faint">{t('entries.generatedByAI')}</p>
    </section>
  )
}
