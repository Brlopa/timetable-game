import type { Line, LineStop, Segment, TravelTimeModification, DepartureModification, TaktModification } from '../types';
import { timeToSeconds, secondsToTime, formatTime } from './constants';

export interface CalculatedStop extends LineStop {
  originalArrival: string;
  originalDeparture: string;
  arrivalSeconds: number;
  departureSeconds: number;
  dwellSeconds: number;
  arrivalDeltaSeconds: number;
  departureDeltaSeconds: number;
  isModified: boolean;
}

export interface CalculatedLine extends Line {
  calculatedStops: CalculatedStop[];
  originalTotalTravelTime: number;
  modifiedTotalTravelTime: number;
  totalTimeDeltaSeconds: number;
}

/**
 * Calculates a fully synchronized timetable for a line.
 * Any change in segment travel time ripples through all downstream stops.
 * Any change in departure time at a stop recalculates the preceding segment's travel time
 * (or shifts the whole schedule if at the first stop).
 */
export function calculateSynchronizedLine(
  line: Line,
  travelTimeMods: TravelTimeModification[],
  departureMods: DepartureModification[],
  taktMods: TaktModification[]
): CalculatedLine {
  const taktMod = taktMods.find((m) => m.lineId === line.id);
  const taktMinutes = taktMod ? taktMod.newTakt : line.taktMinutes;

  // Build quick lookup maps
  const travelModsMap = new Map<string, number>();
  for (const m of travelTimeMods) {
    travelModsMap.set(m.segmentKey, m.newTime);
  }

  const depModsMap = new Map<string, string>();
  for (const m of departureMods) {
    if (m.lineId === line.id) {
      depModsMap.set(m.stopId, m.newDeparture);
    }
  }

  const numStops = line.stops.length;
  if (numStops === 0) {
    return {
      ...line,
      taktMinutes,
      calculatedStops: [],
      originalTotalTravelTime: 0,
      modifiedTotalTravelTime: 0,
      totalTimeDeltaSeconds: 0,
    };
  }

  // 1. Calculate modified segments first
  const modifiedSegments: Segment[] = line.segments.map((seg) => {
    const key = `${seg.fromStop}_${seg.toStop}`;
    const modTime = travelModsMap.get(key);
    return {
      ...seg,
      travelTime: modTime !== undefined ? modTime : seg.travelTime,
    };
  });

  // 2. Synchronize stops and times
  const calculatedStops: CalculatedStop[] = [];

  // Determine starting departure time at stop 0
  const firstStop = line.stops[0];
  const firstDepMod = depModsMap.get(firstStop.id);
  const initialDepSeconds = firstDepMod
    ? timeToSeconds(firstDepMod)
    : timeToSeconds(firstStop.departure || firstStop.arrival || '08:00:00');

  let currentDepartureSeconds = initialDepSeconds;

  for (let i = 0; i < numStops; i++) {
    const stop = line.stops[i];
    const origArrSecs = timeToSeconds(stop.arrival || stop.departure || '00:00:00');
    const origDepSecs = timeToSeconds(stop.departure || stop.arrival || '00:00:00');
    const origDwell = Math.max(0, origDepSecs - origArrSecs);

    if (i === 0) {
      // First stop: arrival = departure (or original arrival offset)
      const depSecs = currentDepartureSeconds;
      const arrSecs = Math.max(0, depSecs - origDwell);

      calculatedStops.push({
        ...stop,
        originalArrival: stop.arrival,
        originalDeparture: stop.departure,
        arrival: secondsToTime(arrSecs),
        departure: secondsToTime(depSecs),
        arrivalSeconds: arrSecs,
        departureSeconds: depSecs,
        dwellSeconds: origDwell,
        arrivalDeltaSeconds: arrSecs - origArrSecs,
        departureDeltaSeconds: depSecs - origDepSecs,
        isModified: firstDepMod !== undefined || depSecs !== origDepSecs,
      });
    } else {
      // Stop i (i > 0): arrival = previous departure + segment travel time
      const prevSeg = modifiedSegments[i - 1];
      const arrSecs = currentDepartureSeconds + prevSeg.travelTime;

      // Dwell time: keep original dwell time unless it's the last stop (dwell = 0)
      const isLastStop = i === numStops - 1;
      const dwell = isLastStop ? 0 : Math.max(0, prevSeg.dwellTime || origDwell);
      const depSecs = isLastStop ? arrSecs : arrSecs + dwell;

      currentDepartureSeconds = depSecs;

      const hasDepMod = depModsMap.has(stop.id);
      const arrDelta = arrSecs - origArrSecs;
      const depDelta = depSecs - origDepSecs;
      const isModified =
        hasDepMod ||
        arrDelta !== 0 ||
        depDelta !== 0 ||
        travelModsMap.has(`${prevSeg.fromStop}_${prevSeg.toStop}`);

      calculatedStops.push({
        ...stop,
        originalArrival: stop.arrival,
        originalDeparture: stop.departure,
        arrival: secondsToTime(arrSecs),
        departure: isLastStop ? '' : secondsToTime(depSecs),
        arrivalSeconds: arrSecs,
        departureSeconds: depSecs,
        dwellSeconds: dwell,
        arrivalDeltaSeconds: arrDelta,
        departureDeltaSeconds: isLastStop ? arrDelta : depDelta,
        isModified,
      });
    }
  }

  const origTotal = line.segments.reduce((acc, s) => acc + s.travelTime + s.dwellTime, 0);
  const modTotal = modifiedSegments.reduce((acc, s) => acc + s.travelTime + s.dwellTime, 0);

  return {
    ...line,
    segments: modifiedSegments,
    stops: calculatedStops,
    calculatedStops,
    taktMinutes,
    originalTotalTravelTime: origTotal,
    modifiedTotalTravelTime: modTotal,
    totalTimeDeltaSeconds: modTotal - origTotal,
  };
}

/**
 * Recalculates segment travel time when a user edits an arrival or departure time.
 */
export function calculateSegmentTimeFromTimes(
  fromDepSeconds: number,
  toTargetSeconds: number,
  dwellSeconds: number = 0
): number {
  let diff = toTargetSeconds - fromDepSeconds - dwellSeconds;
  // Handle midnight wrap if train travels past midnight
  if (diff < 0 && diff > -43200) {
    // If negative by less than 12h, could be wrap
    diff += 86400;
  }
  // Minimum travel time: at least 30 seconds
  return Math.max(30, diff);
}
