import {
  TOTAL_DAYS, dateForDayIndex, fmtDayShort, weekNrForIdx, isWeekendIdx, weekdayLetter,
  type ZoomLevel,
} from '../../utils/planningGanttUtils'

interface GanttRulerProps {
  zoom: ZoomLevel
  pxDay: number
  trackW: number
  weeks: number
  todayIdx: number
  windowStart: Date
}

export function GanttRuler({ zoom, pxDay, trackW, weeks, todayIdx, windowStart }: GanttRulerProps) {
  const dayCells = Array.from({ length: TOTAL_DAYS }, (_, i) => {
    const cls = ['ruler-day', isWeekendIdx(i, windowStart) && 'weekend', i === todayIdx && 'today', zoom === 'month' && 'compact']
      .filter(Boolean).join(' ')
    const d = dateForDayIndex(i, windowStart)
    return (
      <div key={i} className={cls} style={{ width: pxDay }}>
        {zoom !== 'month' && <span className="dn">{weekdayLetter(i, windowStart)}</span>}
        <span className="dd">{d.getDate()}</span>
      </div>
    )
  })
  const weekCells = Array.from({ length: weeks }, (_, w) => {
    const startIdx = w * 7
    return (
      <div key={w} className="ruler-week" style={{ width: pxDay * 7 }}>
        <span className="wk">wk {weekNrForIdx(startIdx, windowStart)}</span>
        {fmtDayShort(startIdx, windowStart)} – {fmtDayShort(startIdx + 6, windowStart)}
      </div>
    )
  })

  return (
    <div className="gantt-ruler">
      <div className="ruler-corner"><span className="t">Machine</span></div>
      <div className="ruler-track" style={{ width: trackW }}>
        <div className="ruler-weeks">{weekCells}</div>
        <div className="ruler-days">{dayCells}</div>
      </div>
    </div>
  )
}
