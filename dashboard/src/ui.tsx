import type { RoomStatus } from './api'

export const STATUS_LABEL: Record<RoomStatus, string> = {
  in_use: 'In use',
  free: 'Free',
  offline: 'Offline',
}

export function StatusBadge({ status }: { status: RoomStatus }) {
  return <span className={`badge badge--${status}`}>{STATUS_LABEL[status]}</span>
}

export function relativeTime(now: number, ts: number | null): string {
  if (ts == null) return '—'
  const s = Math.max(0, now - ts)
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  return `${Math.floor(s / 3600)}h ago`
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m`
  return `${Math.max(0, Math.round(seconds))}s`
}

export function hoursLabel(h: number): string {
  return h < 48 ? `${h}h` : `${Math.round(h / 24)}d`
}
