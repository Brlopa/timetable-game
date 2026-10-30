import type { LineCategory } from '../types';

/** Color mapping for line categories */
export const CATEGORY_COLORS: Record<LineCategory, string> = {
  IC: '#e3000f',   // SBB Red
  IR: '#2d327d',   // Dark blue
  RE: '#1a8c2c',   // Green
  R: '#5b9e2d',    // Light green
  S: '#0074be',    // Blue
  EC: '#8b1a4a',   // Burgundy
  ICE: '#6f6f6f',  // Gray (DB)
  TGV: '#7b2d8b',  // Purple (SNCF)
  PE: '#d4a017',   // Gold
  RJX: '#c80000',  // ÖBB Red
  NJ: '#1a237e',   // Night blue
  SN: '#4a90d9',   // Light blue
  RB: '#7cb342',   // Light green
  EXT: '#ff9800',  // Orange
  CC: '#795548',   // Brown
  FAE: '#607d8b',  // Blue gray
  RER: '#00bcd4',  // Cyan
};

/** Display names for categories */
export const CATEGORY_NAMES: Record<LineCategory, string> = {
  IC: 'InterCity',
  IR: 'InterRegio',
  RE: 'RegioExpress',
  R: 'Regio',
  S: 'S-Bahn',
  EC: 'EuroCity',
  ICE: 'ICE',
  TGV: 'TGV',
  PE: 'Panorama Express',
  RJX: 'Railjet Xpress',
  NJ: 'NightJet',
  SN: 'S-Bahn Nacht',
  RB: 'Regionalbahn',
  EXT: 'Extrazug',
  CC: 'Cross-Country',
  FAE: 'Fähre',
  RER: 'RER',
};

/** Importance/priority ordering of categories */
export const CATEGORY_PRIORITY: LineCategory[] = [
  'IC', 'EC', 'ICE', 'TGV', 'RJX', 'IR', 'RE', 'PE',
  'R', 'RB', 'S', 'SN', 'NJ', 'EXT', 'CC', 'FAE', 'RER',
];

/** Swiss center coordinates */
export const SWISS_CENTER: [number, number] = [46.8, 8.2];
export const SWISS_ZOOM = 8;

/** Format seconds to MM:SS or HH:MM:SS */
export function formatDuration(seconds: number): string {
  if (seconds < 0) return '-' + formatDuration(-seconds);
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m.toString().padStart(2, '0')}min`;
  if (m > 0) return `${m}min ${s > 0 ? s.toString().padStart(2, '0') + 's' : ''}`.trim();
  return `${s}s`;
}

/** Format time string HH:MM:SS to HH:MM */
export function formatTime(time: string): string {
  if (!time) return '';
  const parts = time.split(':');
  return `${parts[0]}:${parts[1]}`;
}

/** Parse time to seconds */
export function timeToSeconds(time: string): number {
  const parts = time.split(':');
  return parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseInt(parts[2] || '0');
}

/** Seconds to time string HH:MM:SS */
export function secondsToTime(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

/** Calculate total travel time for a line */
export function totalTravelTime(segments: { travelTime: number; dwellTime: number }[]): number {
  return segments.reduce((sum, seg) => sum + seg.travelTime + seg.dwellTime, 0);
}

/** Generate unique ID */
export function generateId(): string {
  return Math.random().toString(36).substring(2, 11);
}
