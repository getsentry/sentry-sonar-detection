import { useState } from 'react'
import type { HourBucket } from '../api'

interface Bin {
  hour: number
  ratio: number
  occupied: number
  total: number
}

// Fold absolute hourly buckets into 24 local hour-of-day bins.
function foldByHour(buckets: HourBucket[]): Bin[] {
  const bins: Bin[] = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    ratio: 0,
    occupied: 0,
    total: 0,
  }))
  for (const b of buckets) {
    const h = new Date(b.start * 1000).getHours()
    bins[h].occupied += b.occupiedSeconds
    bins[h].total += b.totalSeconds
  }
  for (const b of bins) b.ratio = b.total > 0 ? b.occupied / b.total : 0
  return bins
}

function fmtDur(s: number): string {
  const m = Math.round(s / 60)
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`
}

const pad2 = (n: number) => String(n).padStart(2, '0')

// viewBox units (the SVG scales to its container width)
const W = 480
const H = 200
const PAD = { l: 30, r: 8, t: 10, b: 22 }
const plotW = W - PAD.l - PAD.r
const plotH = H - PAD.t - PAD.b

export default function BusyHours({ buckets }: { buckets: HourBucket[] }) {
  const bins = foldByHour(buckets)
  const hasData = bins.some((b) => b.total > 0)
  const [hover, setHover] = useState<number | null>(null)

  const slot = plotW / 24
  const barW = Math.max(2, slot - 3)
  const active = hover != null ? bins[hover] : null

  return (
    <section className="chart">
      <h2 className="chart__title">
        Busy hours <span className="muted">· % occupied by hour, local time</span>
      </h2>

      {!hasData ? (
        <p className="banner">No occupancy recorded in this window yet.</p>
      ) : (
        <div className="chart__wrap">
          <svg
            className="chart__svg"
            viewBox={`0 0 ${W} ${H}`}
            role="img"
            aria-label="Occupancy percentage by hour of day"
          >
            {[0, 0.5, 1].map((f) => {
              const y = PAD.t + plotH * (1 - f)
              return (
                <g key={f}>
                  <line className="chart__grid" x1={PAD.l} y1={y} x2={W - PAD.r} y2={y} />
                  <text className="chart__ylabel" x={PAD.l - 6} y={y + 3}>
                    {Math.round(f * 100)}%
                  </text>
                </g>
              )
            })}

            {bins.map((b) => {
              const bx = PAD.l + b.hour * slot
              const barH = plotH * b.ratio
              return (
                <g
                  key={b.hour}
                  onMouseEnter={() => setHover(b.hour)}
                  onMouseLeave={() => setHover((c) => (c === b.hour ? null : c))}
                >
                  <rect x={bx} y={PAD.t} width={slot} height={plotH} fill="transparent" />
                  {b.ratio > 0 && (
                    <rect
                      className={`chart__bar${hover === b.hour ? ' chart__bar--active' : ''}`}
                      x={bx + (slot - barW) / 2}
                      y={PAD.t + plotH - barH}
                      width={barW}
                      height={barH}
                      rx={2}
                    >
                      <title>{`${pad2(b.hour)}:00 — ${Math.round(b.ratio * 100)}% (${fmtDur(
                        b.occupied,
                      )} of ${fmtDur(b.total)})`}</title>
                    </rect>
                  )}
                </g>
              )
            })}

            {bins
              .filter((b) => b.hour % 3 === 0)
              .map((b) => (
                <text
                  key={b.hour}
                  className="chart__xlabel"
                  x={PAD.l + b.hour * slot + slot / 2}
                  y={H - 6}
                >
                  {pad2(b.hour)}
                </text>
              ))}
          </svg>

          {active && (
            <div
              className="chart__tip"
              style={{ left: `${((PAD.l + hover! * slot + slot / 2) / W) * 100}%` }}
            >
              <strong>{pad2(hover!)}:00</strong> · {Math.round(active.ratio * 100)}%
              <span className="muted">
                {' '}
                · {fmtDur(active.occupied)} of {fmtDur(active.total)}
              </span>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
