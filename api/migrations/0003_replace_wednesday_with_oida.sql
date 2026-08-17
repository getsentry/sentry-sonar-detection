-- Drop the Wednesday room (not in scope) and add Oida instead.
DELETE FROM events WHERE room_id = 'wednesday';
DELETE FROM rooms  WHERE id = 'wednesday';

INSERT OR IGNORE INTO rooms (id, name, occupied, updated_at) VALUES
  ('oida', 'Oida', 0, 0);
