import { useState } from 'react'
import { Link } from 'react-router'
import type { Room } from '../api'
import { STATUS_LABEL } from '../ui'
import { OFFICE_MAP_SRC, ROOM_POSITIONS } from '../roomPositions'

// Office map with a status marker overlaid on each room. If the image is missing
// it renders nothing, so the overview gracefully falls back to just the table.
export default function OfficeMap({ rooms }: { rooms: Room[] }) {
  const [hidden, setHidden] = useState(false)
  if (hidden) return null

  return (
    <div className="map">
      <img
        className="map__img"
        src={OFFICE_MAP_SRC}
        alt="Office map"
        onError={() => setHidden(true)}
      />
      {rooms.map((room) => {
        const pos = ROOM_POSITIONS[room.id]
        if (!pos) return null
        return (
          <Link
            key={room.id}
            to={`/rooms/${room.id}`}
            className={`marker marker--${room.status}`}
            style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
            aria-label={`${room.name ?? room.id} — ${STATUS_LABEL[room.status]}`}
          >
            <span className="marker__dot" />
            <span className="marker__tip">
              {room.name ?? room.id} — {STATUS_LABEL[room.status]}
            </span>
          </Link>
        )
      })}
    </div>
  )
}
