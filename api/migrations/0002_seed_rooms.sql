-- Seed the 4 meeting rooms (scope: 4 rooms). Adjust names as needed.
INSERT OR IGNORE INTO rooms (id, name, occupied, updated_at) VALUES
  ('room-a', 'Room A', 0, 0),
  ('room-b', 'Room B', 0, 0),
  ('room-c', 'Room C', 0, 0),
  ('room-d', 'Room D', 0, 0);
