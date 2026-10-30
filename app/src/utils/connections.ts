import type { Line } from '../types';
import { timeToSeconds, formatTime } from './constants';
import { getTaktNode, type TaktNodeType } from './knoten';

export interface StationConnection {
  id: string;

  // Arriving train (Einfahrt am Knoten)
  fromLineId: string;
  fromLineName: string;
  fromCategory: string;
  fromOrigin: string; // Startbahnhof der Linie (woher der Zug kommt)
  fromDestination: string; // Endziel der Linie
  fromPreviousStop?: string; // Vorheriger Halt
  fromIsTerminating: boolean; // Endet an diesem Bahnhof
  fromHeadsign: string;
  fromArrivalTime: string;
  fromArrivalMinute: number;

  // Departing train (Ausfahrt / Weiterfahrt ab Knoten)
  toLineId: string;
  toLineName: string;
  toCategory: string;
  toOrigin: string; // Startbahnhof des abfahrenden Zugs
  toDestination: string; // Endziel der Linie (wohin der Zug fährt)
  toNextStop?: string; // Nächster Halt
  toIsOriginating: boolean; // Beginnt an diesem Bahnhof
  toHeadsign: string;
  toDepartureTime: string;
  toDepartureMinute: number;

  transferMinutes: number;
  originalTransferMinutes?: number;
  minTransferMinutes: number;

  status: 'optimal' | 'knapp' | 'gebrochen' | 'lang';
  isImprovedByMod: boolean;
  isBrokenByMod: boolean;
  nodeType: TaktNodeType;
}

export interface HubConnectionAnalysis {
  stationName: string;
  minTransferMinutes: number;
  connections: StationConnection[];
  optimalCount: number;
  knappCount: number;
  brokenCount: number;
  langCount: number;
  improvedCount: number;
  brokenByModCount: number;
  qualityPercent: number;
}

/**
 * Safely matches station names avoiding false substring collisions (e.g. "Alle" matching "St. Gallen").
 */
export function matchesStationName(stopName: string, targetName: string): boolean {
  const s = stopName.trim().toLowerCase();
  const t = targetName.trim().toLowerCase();
  if (s === t) return true;

  // Bilingual stations like "Biel/Bienne" or "Fribourg/Freiburg"
  const tParts = t.split(/[/,]/).map((p) => p.trim());
  if (tParts.some((p) => p.length >= 3 && s === p)) return true;
  const sParts = s.split(/[/,]/).map((p) => p.trim());
  if (sParts.some((p) => p.length >= 3 && t === p)) return true;

  // Suffixes like "Zürich HB" vs "Zürich" or "Basel SBB" vs "Basel"
  if (s.startsWith(t) || t.startsWith(s)) {
    if (Math.min(s.length, t.length) >= 4) return true;
  }
  return false;
}

/**
 * Calculates transfer connections at a given station across lines.
 * Accurately tracks origin (where arriving train comes from) and destination (where departing train goes).
 */
export function analyzeStationConnections(
  stationName: string,
  lines: Line[],
  originalLines: Line[],
  minTransferMinutes: number = 4,
  nodeFilter?: TaktNodeType | 'all'
): HubConnectionAnalysis {
  interface StopInfo {
    line: Line;
    idx: number;
    arrStr: string;
    depStr: string;
    arrMinute: number;
    depMinute: number;
    isStart: boolean;
    isEnd: boolean;
  }

  const findStops = (lineList: Line[]): StopInfo[] => {
    const list: StopInfo[] = [];
    for (const l of lineList) {
      const idx = l.stops.findIndex((s) => matchesStationName(s.name, stationName));

      if (idx !== -1) {
        const s = l.stops[idx];
        const arrStr = s.arrival || '';
        const depStr = s.departure || '';
        const arrMinute = arrStr ? parseInt(arrStr.split(':')[1] || '0', 10) : -1;
        const depMinute = depStr ? parseInt(depStr.split(':')[1] || '0', 10) : -1;

        list.push({
          line: l,
          idx,
          arrStr,
          depStr,
          arrMinute,
          depMinute,
          isStart: idx === 0,
          isEnd: idx === l.stops.length - 1,
        });
      }
    }
    return list;
  };

  const currentStops = findStops(lines);
  const origStops = findStops(originalLines);

  const origStopsMap = new Map<string, StopInfo>();
  for (const s of origStops) {
    origStopsMap.set(s.line.id, s);
  }

  const connections: StationConnection[] = [];

  // Consider lines arriving at the station that can connect to lines departing from the station
  for (const arrStop of currentStops) {
    // A train STARTING its route at this station has not arrived from anywhere: not an incoming connection!
    if (arrStop.isStart) continue;
    if (!arrStop.arrStr || arrStop.arrMinute === -1) continue;

    for (const depStop of currentStops) {
      // Cannot transfer to the exact same line/trip
      if (arrStop.line.id === depStop.line.id) continue;
      // A train TERMINATING at this station cannot depart further: not an outgoing connection!
      if (depStop.isEnd) continue;
      if (!depStop.depStr || depStop.depMinute === -1) continue;

      // Filter by node window if requested
      const arrNode = getTaktNode(arrStop.arrStr);
      const depNode = getTaktNode(depStop.depStr);

      if (nodeFilter && nodeFilter !== 'all') {
        if (arrNode.type !== nodeFilter && depNode.type !== nodeFilter) {
          continue;
        }
      }

      // Calculate transfer duration in minutes within the periodic hour:
      let diffMinutes = depStop.depMinute - arrStop.arrMinute;
      if (diffMinutes < -15) {
        // More than 15 min negative means it's for the next hourly cycle
        diffMinutes += 60;
      }

      // We only care about connections with a sensible transfer window (-10 to 45 min)
      if (diffMinutes < -10 || diffMinutes > 40) continue;

      // Determine status
      let status: 'optimal' | 'knapp' | 'gebrochen' | 'lang' = 'optimal';
      if (diffMinutes < 1) {
        status = 'gebrochen';
      } else if (diffMinutes < minTransferMinutes) {
        status = 'knapp';
      } else if (diffMinutes <= 15) {
        status = 'optimal';
      } else {
        status = 'lang';
      }

      // Calculate original transfer duration for comparison
      const origArr = origStopsMap.get(arrStop.line.id);
      const origDep = origStopsMap.get(depStop.line.id);
      let origDiffMinutes: number | undefined = undefined;

      if (origArr && origDep && !origArr.isStart && !origDep.isEnd && origArr.arrMinute !== -1 && origDep.depMinute !== -1) {
        let oDiff = origDep.depMinute - origArr.arrMinute;
        if (oDiff < -15) oDiff += 60;
        origDiffMinutes = oDiff;
      }

      const isImprovedByMod =
        origDiffMinutes !== undefined &&
        origDiffMinutes < minTransferMinutes &&
        diffMinutes >= minTransferMinutes;

      const isBrokenByMod =
        origDiffMinutes !== undefined &&
        origDiffMinutes >= minTransferMinutes &&
        diffMinutes < minTransferMinutes;

      const fromOrigin = arrStop.line.stops[0]?.name || '';
      const fromDestination = arrStop.line.stops[arrStop.line.stops.length - 1]?.name || arrStop.line.headsign;
      const fromPrevStop = arrStop.idx > 0 ? arrStop.line.stops[arrStop.idx - 1]?.name : undefined;

      const toOrigin = depStop.line.stops[0]?.name || '';
      const toDestination = depStop.line.stops[depStop.line.stops.length - 1]?.name || depStop.line.headsign;
      const toNextStop = depStop.idx < depStop.line.stops.length - 1 ? depStop.line.stops[depStop.idx + 1]?.name : undefined;

      connections.push({
        id: `${arrStop.line.id}_to_${depStop.line.id}`,

        fromLineId: arrStop.line.id,
        fromLineName: arrStop.line.name,
        fromCategory: arrStop.line.category,
        fromOrigin,
        fromDestination,
        fromPreviousStop: fromPrevStop,
        fromIsTerminating: arrStop.isEnd,
        fromHeadsign: arrStop.line.headsign,
        fromArrivalTime: arrStop.arrStr,
        fromArrivalMinute: arrStop.arrMinute,

        toLineId: depStop.line.id,
        toLineName: depStop.line.name,
        toCategory: depStop.line.category,
        toOrigin,
        toDestination,
        toNextStop,
        toIsOriginating: depStop.isStart,
        toHeadsign: depStop.line.headsign,
        toDepartureTime: depStop.depStr,
        toDepartureMinute: depStop.depMinute,

        transferMinutes: diffMinutes,
        originalTransferMinutes: origDiffMinutes,
        minTransferMinutes,

        status,
        isImprovedByMod,
        isBrokenByMod,
        nodeType: depNode.type !== 'zwischen' ? depNode.type : arrNode.type,
      });
    }
  }

  // Sort: prioritize broken/knapp first, then optimal by lowest wait time
  connections.sort((a, b) => {
    const priority = { gebrochen: 0, knapp: 1, optimal: 2, lang: 3 };
    if (priority[a.status] !== priority[b.status]) {
      return priority[a.status] - priority[b.status];
    }
    return a.transferMinutes - b.transferMinutes;
  });

  const optimalCount = connections.filter((c) => c.status === 'optimal').length;
  const knappCount = connections.filter((c) => c.status === 'knapp').length;
  const brokenCount = connections.filter((c) => c.status === 'gebrochen').length;
  const langCount = connections.filter((c) => c.status === 'lang').length;
  const improvedCount = connections.filter((c) => c.isImprovedByMod).length;
  const brokenByModCount = connections.filter((c) => c.isBrokenByMod).length;

  const total = connections.length;
  const qualityPercent = total > 0 ? Math.round(((optimalCount + knappCount * 0.5) / total) * 100) : 100;

  return {
    stationName,
    minTransferMinutes,
    connections,
    optimalCount,
    knappCount,
    brokenCount,
    langCount,
    improvedCount,
    brokenByModCount,
    qualityPercent,
  };
}
