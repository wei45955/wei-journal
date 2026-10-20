import { useTranslation } from 'react-i18next'
import { INTENSITY_CLASSES } from './intensity'

/**
 * The scale used by the month and year grids, so the shading can be read.
 */
export function CalendarLegend() {
  const { t } = useTranslation()

  return (
    <div className="flex items-center gap-2 text-[0.6875rem] text-ink-faint">
      <span>{t('calendar.legend')}</span>
      <span className="flex gap-1">
        {INTENSITY_CLASSES.map((className, index) => (
          <span key={index} className={`h-3 w-3 rounded-[3px] ${className}`} />
        ))}
      </span>
      <span>{t('calendar.legendMore')}</span>
    </div>
  )
}
