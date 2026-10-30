import type { Line, Station } from '../types';
import { isExactStationMatch } from './connections';

export type PotentialLevel = 'high' | 'medium' | 'low' | 'none';

export interface StationOptimizationPotential {
  stationId: string;
  stationName: string;
  lat: number;
  lon: number;
  isHub: boolean;
  totalConnections: number;
  brokenCount: number;
  knappCount: number;
  optimalCount: number;
  qualityPercent: number; // 0 - 100%
  potentialScore: number;  // 0 - 100 (100 = highest optimization potential/urgency)
  potentialLevel: PotentialLevel;
  color: string;
  textColor: string;
  badgeLabel: string;
  summaryText: string;
}

/**
 * Computes the optimization potential for all stations based on timetable connections.
 * Uses an inverted index for sub-10ms performance across thousands of stops.
 */
export function computeAllStationsOptimizationPotential(
  stations: Station[],
  lines: Line[],
  minTransferMinutes: number = 4
): Map<string, StationOptimizationPotential> {
  const result = new Map<string, StationOptimizationPotential>();

  // 1. Inverted index: normalized station name -> array of { line, stop, idx }
  interface StopEntry {
    line: Line;
    idx: number;
    arrMinute: number;
    depMinute: number;
    isStart: boolean;
    isEnd: boolean;
  }

  const stationStopIndex = new Map<string, StopEntry[]>();

  for (const l of lines) {
    for (let idx = 0; idx < l.stops.length; idx++) {
      const s = l.stops[idx];
      const key = s.name.trim().toLowerCase();
      let arr = stationStopIndex.get(key);
      if (!arr) {
        arr = [];
        stationStopIndex.set(key, arr);
      }

      const arrMinute = s.arrival ? parseInt(s.arrival.split(':')[1] || '0', 10) : -1;
      const depMinute = s.departure ? parseInt(s.departure.split(':')[1] || '0', 10) : -1;

      arr.push({
        line: l,
        idx,
        arrMinute,
        depMinute,
        isStart: idx === 0,
        isEnd: idx === l.stops.length - 1,
      });
    }
  }

  // 2. Evaluate for each station
  for (const station of stations) {
    const sNameNorm = station.name.trim().toLowerCase();
    const stops = stationStopIndex.get(sNameNorm) || [];

    // Filter arrivals and departures at this exact station
    const arrivals = stops.filter(
      (s) => !s.isStart && s.arrMinute !== -1 && !isExactStationMatch(s.line.stops[0], station.name, station)
    );
    const departures = stops.filter(
      (s) => !s.isEnd && s.depMinute !== -1 && !isExactStationMatch(s.line.stops[s.line.stops.length - 1], station.name, station)
    );

    let broken = 0;
    let knapp = 0;
    let optimal = 0;
    let total = 0;

    for (const a of arrivals) {
      for (const d of departures) {
        if (a.line.id === d.line.id) continue;

        let diff = d.depMinute - a.arrMinute;
        if (diff < -15) diff += 60;
        if (diff < -10 || diff > 40) continue;

        total++;
        if (diff < 1) {
          broken++;
        } else if (diff < minTransferMinutes) {
          knapp++;
        } else if (diff <= 15) {
          optimal++;
        }
      }
    }

    if (total === 0) {
      result.set(station.id, {
        stationId: station.id,
        stationName: station.name,
        lat: station.lat,
        lon: station.lon,
        isHub: station.isHub,
        totalConnections: 0,
        brokenCount: 0,
        knappCount: 0,
        optimalCount: 0,
        qualityPercent: 100,
        potentialScore: 0,
        potentialLevel: 'none',
        color: '#94a3b8', // Gray
        textColor: 'text-gray-500',
        badgeLabel: 'Keine Umstiege',
        summaryText: 'Durchgangsstation ohne Umsteigeknoten',
      });
      continue;
    }

    const qualityPercent = Math.round(((optimal + knapp * 0.5) / total) * 100);

    // Potential Score (0-100): High score means high potential / urgent need for optimization!
    // Weighted by broken connections and low quality
    let potentialScore = Math.min(
      100,
      Math.round(
        (100 - qualityPercent) * 0.6 +
        Math.min(40, (broken * 8) + (knapp * 3))
      )
    );

    let level: PotentialLevel = 'low';
    let color = '#10b981'; // Green
    let textColor = 'text-emerald-700';
    let badgeLabel = 'Optimal / Gering';
    let summaryText = 'Anschlüsse weitgehend gesichert';

    if (broken >= 3 || (broken >= 1 && qualityPercent < 70) || knapp >= 6 || potentialScore >= 60) {
      level = 'high';
      color = '#ef4444'; // Red
      textColor = 'text-red-700';
      badgeLabel = 'Hohes Potenzial';
      summaryText = `${broken} gebrochene & ${knapp} knappe Anschlüsse`;
    } else if (broken >= 1 || qualityPercent < 85 || knapp >= 2 || potentialScore >= 30) {
      level = 'medium';
      color = '#f59e0b'; // Amber
      textColor = 'text-amber-700';
      badgeLabel = 'Mittleres Potenzial';
      summaryText = `Verbesserungspotenzial (${qualityPercent}% Qualität)`;
    }

    result.set(station.id, {
      stationId: station.id,
      stationName: station.name,
      lat: station.lat,
      lon: station.lon,
      isHub: station.isHub,
      totalConnections: total,
      brokenCount: broken,
      knappCount: knapp,
      optimalCount: optimal,
      qualityPercent,
      potentialScore,
      potentialLevel: level,
      color,
      textColor,
      badgeLabel,
      summaryText,
    });
  }

  return result;
}
