// Where each room's status marker sits on the office map, as percentages of the
// image (0–100, from the top-left). These are PLACEHOLDERS — calibrate them to
// office-map.png. Rooms without an entry are simply omitted from the map (they
// still appear in the table below).
// Calibrated to vie-office-map.png (Sentry Vienna floor plan): OIDA / SERVUS /
// URWALD stacked down the left edge, MAKAVA KINGDOM lower center-left.
export const ROOM_POSITIONS: Record<string, { x: number; y: number }> = {
  oida: { x: 7.3, y: 31 },
  servus: { x: 6.8, y: 50.5 },
  urwald: { x: 6.2, y: 62 },
  'makava-kingdom': { x: 19.5, y: 75 },
}

// Served from dashboard/public/. Drop the PNG there with this name.
export const OFFICE_MAP_SRC = '/vie-office-map.png'
