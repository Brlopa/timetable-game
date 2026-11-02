import type { Line, Station } from '../types';
import { timeToSeconds, secondsToTime } from './constants';
import { isExactStationMatch } from './connections';

export interface JourneyLeg {
  lineId: string;
  lineName: string;
  category: string;
  headsign: string;
  fromStation: string;
  toStation: string;
  fromDeparture: string;
  toArrival: string;
  departureSeconds: number;
  arrivalSeconds: number;
  durationMinutes: number;
  intermediateStops: { name: string; arrival: string; departure: string }[];
  isOptimized?: boolean;
}

export interface JourneyTransfer {
  station: string;
  arrivalSeconds: number;
  departureSeconds: number;
  waitMinutes: number;
  isOptimal: boolean;
  isKnapp: boolean;
  isBroken: boolean;
  improvedByOptimization?: boolean;
}

export interface JourneyConnection {
  id: string;
  origin: string;
  destination: string;
  departureTime: string;
  arrivalTime: string;
  departureSeconds: number;
  arrivalSeconds: number;
  totalDurationMinutes: number;
  transferCount: number;
  legs: JourneyLeg[];
  transfers: JourneyTransfer[];
  isOptimizedSchedule: boolean;
  comparison?: {
    originalDurationMinutes: number;
    durationDeltaMinutes: number; // negative = faster
    improvedTransfer: boolean;
    originalTransferWait?: number;
    newTransferWait?: number;
  };
}

/**
 * Finds rail connections between two stations in a given set of lines.
 */
export function findConnections(
  originName: string,
  destinationName: string,
  departureTimeStr: string,
  lines: Line[],
  options: {
    maxConnections?: number;
    minTransferMinutes?: number;
    maxTransferMinutes?: number;
    isOptimized?: boolean;
    stations?: Station[];
  } = {}
): JourneyConnection[] {
  const maxConn = options.maxConnections ?? 8;
  const minTransSecs = (options.minTransferMinutes ?? 3) * 60;
  const maxTransSecs = (options.maxTransferMinutes ?? 35) * 60;
  const targetDepSecs = timeToSeconds(departureTimeStr || '08:00:00');

  const origLower = originName.trim().toLowerCase();
  const destLower = destinationName.trim().toLowerCase();

  if (!origLower || !destLower || origLower === destLower) {
    return [];
  }

  const results: JourneyConnection[] = [];

  // Helper map for station lookups
  const stationMap = new Map<string, Station>();
  if (options.stations) {
    for (const s of options.stations) {
      stationMap.set(s.name.toLowerCase(), s);
    }
  }

  // Helper to match station name
  const matchStop = (stopName: string, targetName: string) => {
    const stObj = stationMap.get(targetName.toLowerCase());
    return isExactStationMatch({ name: stopName }, targetName, stObj);
  };

  // Pre-filter lines passing through origin or destination
  interface LineStopInfo {
    line: Line;
    origIdx: number;
    destIdx: number;
  }

  const linesWithOrig: { line: Line; idx: number }[] = [];
  const linesWithDest: { line: Line; idx: number }[] = [];

  for (const line of lines) {
    if (!line.stops || line.stops.length < 2) continue;

    let oIdx = -1;
    let dIdx = -1;

    for (let i = 0; i < line.stops.length; i++) {
      const s = line.stops[i];
      if (oIdx === -1 && matchStop(s.name, originName)) {
        oIdx = i;
      }
      if (dIdx === -1 && matchStop(s.name, destinationName)) {
        dIdx = i;
      }
    }

    if (oIdx !== -1) {
      linesWithOrig.push({ line, idx: oIdx });
    }
    if (dIdx !== -1) {
      linesWithDest.push({ line, idx: dIdx });
    }

    // 1. Check for DIRECT line
    if (oIdx !== -1 && dIdx !== -1 && oIdx < dIdx) {
      const depStop = line.stops[oIdx];
      const arrStop = line.stops[dIdx];
      const depSecs = timeToSeconds(depStop.departure || depStop.arrival || '00:00:00');
      const arrSecs = timeToSeconds(arrStop.arrival || arrStop.departure || '00:00:00');

      // Intermediate stops
      const intermediateStops = line.stops.slice(oIdx + 1, dIdx).map((st) => ({
        name: st.name,
        arrival: st.arrival || '',
        departure: st.departure || '',
      }));

      // Calculate periodic difference relative to target time
      let diffFromTarget = depSecs - targetDepSecs;
      if (diffFromTarget < -300) diffFromTarget += 86400; // allow if next day or periodic

      let travelDuration = arrSecs - depSecs;
      if (travelDuration < 0) travelDuration += 86400;

      const leg: JourneyLeg = {
        lineId: line.id,
        lineName: line.name,
        category: line.category,
        headsign: line.headsign || arrStop.name,
        fromStation: depStop.name,
        toStation: arrStop.name,
        fromDeparture: depStop.departure || depStop.arrival || '',
        toArrival: arrStop.arrival || arrStop.departure || '',
        departureSeconds: depSecs,
        arrivalSeconds: arrSecs,
        durationMinutes: Math.round(travelDuration / 60),
        intermediateStops,
        isOptimized: options.isOptimized,
      };

      results.push({
        id: `direct_${line.id}_${depSecs}`,
        origin: depStop.name,
        destination: arrStop.name,
        departureTime: leg.fromDeparture,
        arrivalTime: leg.toArrival,
        departureSeconds: depSecs,
        arrivalSeconds: arrSecs,
        totalDurationMinutes: Math.round(travelDuration / 60),
        transferCount: 0,
        legs: [leg],
        transfers: [],
        isOptimizedSchedule: !!options.isOptimized,
      });
    }
  }

  // 2. Check for 1-TRANSFER connections via transfer stations
  const origLineMap = new Map<string, { line: Line; origIdx: number; stopNames: Set<string> }>();
  for (const { line, idx } of linesWithOrig) {
    const stopsAfter = new Set<string>();
    for (let k = idx + 1; k < line.stops.length; k++) {
      stopsAfter.add(line.stops[k].name.trim().toLowerCase());
    }
    origLineMap.set(line.id, { line, origIdx: idx, stopNames: stopsAfter });
  }

  for (const { line: l2, idx: l2DestIdx } of linesWithDest) {
    // Check which stops before dest in l2 are also in any l1
    for (let t2Idx = 0; t2Idx < l2DestIdx; t2Idx++) {
      const transStop2 = l2.stops[t2Idx];
      const transNameLower = transStop2.name.trim().toLowerCase();

      // Find compatible l1s that stop here
      for (const { line: l1, origIdx: l1OrigIdx, stopNames } of origLineMap.values()) {
        if (l1.id === l2.id) continue;
        if (!stopNames.has(transNameLower)) continue;

        // Find exact transfer stop index in l1
        const t1Idx = l1.stops.findIndex((s, idx) => idx > l1OrigIdx && matchStop(s.name, transStop2.name));
        if (t1Idx === -1) continue;

        const stop1Orig = l1.stops[l1OrigIdx];
        const stop1Trans = l1.stops[t1Idx];
        const stop2Trans = l2.stops[t2Idx];
        const stop2Dest = l2.stops[l2DestIdx];

        const l1DepSecs = timeToSeconds(stop1Orig.departure || stop1Orig.arrival || '00:00:00');
        const l1ArrSecs = timeToSeconds(stop1Trans.arrival || stop1Trans.departure || '00:00:00');
        const l2DepSecs = timeToSeconds(stop2Trans.departure || stop2Trans.arrival || '00:00:00');
        const l2ArrSecs = timeToSeconds(stop2Dest.arrival || stop2Dest.departure || '00:00:00');

        // Check transfer time
        let waitSecs = l2DepSecs - l1ArrSecs;
        if (waitSecs < 0 && waitSecs > -43200) {
          // periodic hour wrap
          waitSecs += 3600;
        }
        if (waitSecs < -120) continue; // broken

        // Only keep if within valid transfer window
        if (waitSecs < minTransSecs || waitSecs > maxTransSecs) continue;

        let totalDuration = (l2ArrSecs >= l1DepSecs ? l2ArrSecs - l1DepSecs : (l2ArrSecs + 86400) - l1DepSecs);
        if (totalDuration > 86400) totalDuration %= 86400;

        const leg1: JourneyLeg = {
          lineId: l1.id,
          lineName: l1.name,
          category: l1.category,
          headsign: l1.headsign || stop1Trans.name,
          fromStation: stop1Orig.name,
          toStation: stop1Trans.name,
          fromDeparture: stop1Orig.departure || stop1Orig.arrival || '',
          toArrival: stop1Trans.arrival || stop1Trans.departure || '',
          departureSeconds: l1DepSecs,
          arrivalSeconds: l1ArrSecs,
          durationMinutes: Math.round((l1ArrSecs - l1DepSecs + (l1ArrSecs < l1DepSecs ? 86400 : 0)) / 60),
          intermediateStops: l1.stops.slice(l1OrigIdx + 1, t1Idx).map((s) => ({
            name: s.name,
            arrival: s.arrival || '',
            departure: s.departure || '',
          })),
          isOptimized: options.isOptimized,
        };

        const leg2: JourneyLeg = {
          lineId: l2.id,
          lineName: l2.name,
          category: l2.category,
          headsign: l2.headsign || stop2Dest.name,
          fromStation: stop2Trans.name,
          toStation: stop2Dest.name,
          fromDeparture: stop2Trans.departure || stop2Trans.arrival || '',
          toArrival: stop2Dest.arrival || stop2Dest.departure || '',
          departureSeconds: l2DepSecs,
          arrivalSeconds: l2ArrSecs,
          durationMinutes: Math.round((l2ArrSecs - l2DepSecs + (l2ArrSecs < l2DepSecs ? 86400 : 0)) / 60),
          intermediateStops: l2.stops.slice(t2Idx + 1, l2DestIdx).map((s) => ({
            name: s.name,
            arrival: s.arrival || '',
            departure: s.departure || '',
          })),
          isOptimized: options.isOptimized,
        };

        const waitMin = Math.round(waitSecs / 60);
        const transInfo: JourneyTransfer = {
          station: transStop2.name,
          arrivalSeconds: l1ArrSecs,
          departureSeconds: l2DepSecs,
          waitMinutes: waitMin,
          isOptimal: waitMin >= 4 && waitMin <= 15,
          isKnapp: waitMin < 4 && waitMin >= 1,
          isBroken: waitMin < 1,
        };

        results.push({
          id: `trans_${l1.id}_${l2.id}_${l1DepSecs}`,
          origin: stop1Orig.name,
          destination: stop2Dest.name,
          departureTime: leg1.fromDeparture,
          arrivalTime: leg2.toArrival,
          departureSeconds: l1DepSecs,
          arrivalSeconds: l2ArrSecs,
          totalDurationMinutes: Math.round(totalDuration / 60),
          transferCount: 1,
          legs: [leg1, leg2],
          transfers: [transInfo],
          isOptimizedSchedule: !!options.isOptimized,
        });
      }
    }
  }

  // Deduplicate and rank connections
  // Sort by: departure time closest to (and after) target, then duration, then transfer count
  const sorted = results.sort((a, b) => {
    let diffA = a.departureSeconds - targetDepSecs;
    if (diffA < -120) diffA += 86400;
    let diffB = b.departureSeconds - targetDepSecs;
    if (diffB < -120) diffB += 86400;

    if (Math.abs(diffA - diffB) > 120) {
      return diffA - diffB;
    }
    return a.totalDurationMinutes - b.totalDurationMinutes;
  });

  // Keep unique departure/arrival combinations
  const seen = new Set<string>();
  const filtered: JourneyConnection[] = [];

  for (const conn of sorted) {
    const key = `${conn.departureTime}_${conn.arrivalTime}_${conn.transferCount}`;
    if (!seen.has(key)) {
      seen.add(key);
      filtered.push(conn);
      if (filtered.length >= maxConn) break;
    }
  }

  return filtered;
}

/**
 * Compares connections from original and optimized timetables to highlight improvements.
 */
export function compareSchedules(
  origConnections: JourneyConnection[],
  optConnections: JourneyConnection[]
): JourneyConnection[] {
  return optConnections.map((opt) => {
    // Find matching original connection (same origin line or similar departure)
    const match = origConnections.find((orig) => {
      if (orig.transferCount !== opt.transferCount) return false;
      const timeDiff = Math.abs(orig.departureSeconds - opt.departureSeconds);
      return timeDiff <= 900; // within 15 min
    });

    if (match) {
      const durDelta = opt.totalDurationMinutes - match.totalDurationMinutes;
      const origWait = match.transfers[0]?.waitMinutes;
      const newWait = opt.transfers[0]?.waitMinutes;
      const improvedTransfer =
        origWait !== undefined &&
        newWait !== undefined &&
        (origWait < 4 && newWait >= 4 && newWait <= 15);

      return {
        ...opt,
        comparison: {
          originalDurationMinutes: match.totalDurationMinutes,
          durationDeltaMinutes: durDelta,
          improvedTransfer,
          originalTransferWait: origWait,
          newTransferWait: newWait,
        },
      };
    }
    return opt;
  });
}
