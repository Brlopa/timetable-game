import type { Line } from '../types';
import { timeToSeconds, formatTime } from './constants';
import { getTaktNode, type TaktNodeType } from './knoten';

export interface StationConnection {
  id: string;
  fromLineId: string;
  fromLineName: string;
  fromCategory: string;
  fromHeadsign: string;
  fromArrivalTime: string;
  fromArrivalMinute: number;

  toLineId: string;
  toLineName: string;
  toCategory: string;
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
 * Calculates transfer connections at a given station across lines.
 * Can evaluate both current (modified) and original timetables to see improvements or breaks.
 */
export function analyzeStationConnections(
  stationName: string,
  lines: Line[],
  originalLines: Line[],
  minTransferMinutes: number = 4,
  nodeFilter?: TaktNodeType | 'all'
): HubConnectionAnalysis {
  // 1. Find all train stops at this station for both current and original lines
  interface StopInfo {
    line: Line;
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
      const idx = l.stops.findIndex(
        (s) =>
          s.name.toLowerCase() === stationName.toLowerCase() ||
          s.name.toLowerCase().includes(stationName.toLowerCase()) ||
          stationName.toLowerCase().includes(s.name.toLowerCase())
      );

      if (idx !== -1) {
        const s = l.stops[idx];
        const arrStr = s.arrival || '';
        const depStr = s.departure || '';
        const arrMinute = arrStr ? parseInt(arrStr.split(':')[1] || '0', 10) : -1;
        const depMinute = depStr ? parseInt(depStr.split(':')[1] || '0', 10) : -1;

        list.push({
          line: l,
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
    // Only trains that actually arrive here (not the first departure if it has no incoming trip)
    if (!arrStop.arrStr || arrStop.arrMinute === -1) continue;

    for (const depStop of currentStops) {
      // Cannot transfer to the exact same line/trip
      if (arrStop.line.id === depStop.line.id) continue;
      // Train must depart from here (not terminating here)
      if (!depStop.depStr || depStop.depMinute === -1 || depStop.isEnd) continue;

      // Filter by node window if requested
      const arrNode = getTaktNode(arrStop.arrStr);
      const depNode = getTaktNode(depStop.depStr);

      // Check if both roughly belong to the same node (or within transfer range)
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

      if (origArr && origDep && origArr.arrMinute !== -1 && origDep.depMinute !== -1) {
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

      connections.push({
        id: `${arrStop.line.id}_to_${depStop.line.id}`,
        fromLineId: arrStop.line.id,
        fromLineName: arrStop.line.name,
        fromCategory: arrStop.line.category,
        fromHeadsign: arrStop.line.headsign,
        fromArrivalTime: arrStop.arrStr,
        fromArrivalMinute: arrStop.arrMinute,

        toLineId: depStop.line.id,
        toLineName: depStop.line.name,
        toCategory: depStop.line.category,
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
