-- Sentry Sonar — initial schema (see PLAN.md → Data model)

CREATE TABLE IF NOT EXISTS rooms (
  id          TEXT PRIMARY KEY,          -- e.g. "room-a"
  name        TEXT,                      -- "Room A"
  occupied    INTEGER NOT NULL DEFAULT 0, -- 0 / 1
  last_seen   INTEGER,                   -- unix seconds of last heartbeat
  updated_at  INTEGER
);

CREATE TABLE IF NOT EXISTS events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id     TEXT NOT NULL,
  occupied    INTEGER NOT NULL,
  distance_cm INTEGER,                   -- optional, when using radar UART
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_room_time ON events (room_id, created_at);

CREATE TABLE IF NOT EXISTS api_tokens (
  id          TEXT PRIMARY KEY,          -- public token id / prefix
  token_hash  TEXT NOT NULL,             -- SHA-256 of the secret; plaintext never stored
  room_id     TEXT,                      -- scoped room, or NULL for all rooms
  scope       TEXT NOT NULL CHECK (scope IN ('read', 'write')),
  label       TEXT,
  revoked     INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL
);
