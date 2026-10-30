import React, { useState, useMemo, useRef } from 'react';
import type { Line, LineCategory, Segment } from '../types';
import { useFahrplanStore } from '../stores/fahrplanStore';
import {
  CATEGORY_COLORS,
  formatDuration,
  formatTime,
  timeToSeconds,
  secondsToTime,
} from '../utils/constants';

interface CorridorPreset {
  id: string;
  name: string;
  stationA: string;
  stationB: string;
}

const PRESET_CORRIDORS: CorridorPreset[] = [
  { id: 'zh-be', name: 'Zürich HB ↔ Bern', stationA: 'Zürich HB', stationB: 'Bern' },
  { id: 'zh-bs', name: 'Zürich HB ↔ Basel SBB', stationA: 'Zürich HB', stationB: 'Basel SBB' },
  { id: 'zh-sg', name: 'Zürich HB ↔ St. Gallen', stationA: 'Zürich HB', stationB: 'St. Gallen' },
  { id: 'zh-lu', name: 'Zürich HB ↔ Luzern', stationA: 'Zürich HB', stationB: 'Luzern' },
  { id: 'ge-be', name: 'Genève ↔ Lausanne ↔ Bern', stationA: 'Genève', stationB: 'Bern' },
];

const TIME_WINDOWS = [
  { label: '06:00 – 10:00 (Morgen)', start: 6, end: 10 },
  { label: '06:00 – 12:00 (Vormittag)', start: 6, end: 12 },
  { label: '12:00 – 18:00 (Nachmittag)', start: 12, end: 18 },
  { label: '16:00 – 20:00 (Abend-HVZ)', start: 16, end: 20 },
  { label: '05:00 – 24:00 (Ganztag)', start: 5, end: 24 },
];

interface Point {
  x: number;
  y: number;
  timeStr: string;
  stationName: string;
  type: 'arr' | 'dep';
}

interface TrainPath {
  id: string;
  lineId: string;
  name: string;
  category: LineCategory;
  direction: string;
  headsign: string;
  color: string;
  points: Point[];
  isModified: boolean;
  isOriginal: boolean;
  offsetMinutes: number;
}

const Bildfahrplan: React.FC = () => {
  const activeYear = useFahrplanStore((s) => s.activeYear);
  const data = useFahrplanStore((s) => s.data[activeYear]);
  const selectedLine = useFahrplanStore((s) => s.selectedLine);
  const setSelectedLine = useFahrplanStore((s) => s.setSelectedLine);
  const setViewMode = useFahrplanStore((s) => s.setViewMode);
  const getModifiedLine = useFahrplanStore((s) => s.getModifiedLine);

  const { lines, stations } = data;

  // Selected corridor / line
  const [selectedCorridorId, setSelectedCorridorId] = useState<string>('zh-be');
  const [selectedLineId, setSelectedLineId] = useState<string>(selectedLine?.id || '');
  const [timeWindowIdx, setTimeWindowIdx] = useState<number>(1); // 06:00 - 12:00

  // Display toggles
  const [showOriginal, setShowOriginal] = useState<boolean>(true);
  const [showOpposing, setShowOpposing] = useState<boolean>(true);
  const [showPeriodic, setShowPeriodic] = useState<boolean>(true);
  const [hoveredTrain, setHoveredTrain] = useState<TrainPath | null>(null);

  const timeWindow = TIME_WINDOWS[timeWindowIdx];
  const startSec = timeWindow.start * 3600;
  const endSec = timeWindow.end * 3600;

  // Find candidate lines for the selected corridor or line
  const activeCorridor = PRESET_CORRIDORS.find((c) => c.id === selectedCorridorId);

  const corridorLines = useMemo(() => {
    if (selectedLineId) {
      const target = lines.find((l) => l.id === selectedLineId);
      if (target) {
        // Also find opposing direction line of the same route
        const opposing = lines.filter((l) => l.routeId === target.routeId);
        return opposing.length > 0 ? opposing : [target];
      }
    }

    if (activeCorridor) {
      return lines.filter((l) => {
        const hasA = l.stops.some((s) => s.name.toLowerCase().includes(activeCorridor.stationA.toLowerCase()));
        const hasB = l.stops.some((s) => s.name.toLowerCase().includes(activeCorridor.stationB.toLowerCase()));
        return hasA && hasB;
      });
    }

    return lines.slice(0, 5);
  }, [selectedLineId, activeCorridor, lines]);

  // Primary reference line defining the corridor's ordered station list
  const referenceLine = useMemo(() => {
    if (selectedLineId) {
      const match = lines.find((l) => l.id === selectedLineId);
      if (match) return match;
    }
    // Prefer IC or IR lines for corridor
    const sorted = [...corridorLines].sort((a, b) => {
      const rank: Record<string, number> = { IC: 0, IR: 1, RE: 2, S: 3 };
      return (rank[a.category] ?? 4) - (rank[b.category] ?? 4);
    });
    return sorted[0] || lines[0];
  }, [corridorLines, selectedLineId, lines]);

  // Ordered station list from reference line
  const corridorStations = useMemo(() => {
    if (!referenceLine || !referenceLine.stops) return [];
    return referenceLine.stops.map((s, idx) => ({
      index: idx,
      id: s.id,
      name: s.name,
      isHub: stations.some((st) => st.name.toLowerCase() === s.name.toLowerCase() && st.isHub),
    }));
  }, [referenceLine, stations]);

  // Canvas Dimensions
  const paddingLeft = 140; // Station names
  const paddingRight = 40;
  const paddingTop = 45;   // Time axis header
  const paddingBottom = 45;

  const totalWidth = 1100;
  const totalHeight = Math.max(480, corridorStations.length * 52);

  const chartWidth = totalWidth - paddingLeft - paddingRight;
  const chartHeight = totalHeight - paddingTop - paddingBottom;

  // Station Y-coordinate mapper
  const stationYMap = useMemo(() => {
    const map = new Map<string, number>();
    const n = corridorStations.length;
    if (n <= 1) return map;

    corridorStations.forEach((st, i) => {
      const y = paddingTop + (i / (n - 1)) * chartHeight;
      map.set(st.name.toLowerCase(), y);
    });
    return map;
  }, [corridorStations, paddingTop, chartHeight]);

  // Time X-coordinate mapper
  const timeToX = (sec: number): number => {
    const normSec = ((sec % 86400) + 86400) % 86400;
    if (normSec < startSec || normSec > endSec) {
      // Allow plotting if within view window
      if (normSec < startSec) return paddingLeft;
      if (normSec > endSec) return paddingLeft + chartWidth;
    }
    const ratio = (normSec - startSec) / (endSec - startSec);
    return paddingLeft + ratio * chartWidth;
  };

  // Generate train paths across time window
  const trainPaths = useMemo(() => {
    const paths: TrainPath[] = [];

    corridorLines.forEach((rawLine) => {
      // Only include direction 1 if showOpposing is true
      if (!showOpposing && rawLine.direction === '1') return;

      const modLine = getModifiedLine(rawLine);
      const isLineModified =
        modLine.modifiedTotalTravelTime !== modLine.originalTotalTravelTime ||
        modLine.calculatedStops.some((s) => s.isModified);

      const taktMins = modLine.taktMinutes || 60;
      const taktSecs = taktMins * 60;

      // Base first departure seconds
      const firstDepSecs = timeToSeconds(
        modLine.calculatedStops[0]?.departure ||
        modLine.calculatedStops[0]?.arrival ||
        '08:00:00'
      );

      // Repeat offsets
      const repetitions: number[] = [0];
      if (showPeriodic) {
        for (let offset = -taktSecs * 6; offset <= taktSecs * 6; offset += taktSecs) {
          if (offset !== 0) repetitions.push(offset);
        }
      }

      repetitions.forEach((offsetSec) => {
        const offsetMin = Math.round(offsetSec / 60);

        // 1. Modified Path
        const modPoints: Point[] = [];
        modLine.calculatedStops.forEach((stop) => {
          const y = stationYMap.get(stop.name.toLowerCase());
          if (y !== undefined) {
            const arrSec = timeToSeconds(stop.arrival || stop.departure) + offsetSec;
            const depSec = timeToSeconds(stop.departure || stop.arrival) + offsetSec;

            modPoints.push({
              x: timeToX(arrSec),
              y,
              timeStr: secondsToTime(arrSec),
              stationName: stop.name,
              type: 'arr',
            });

            if (stop.dwellSeconds > 0) {
              modPoints.push({
                x: timeToX(depSec),
                y,
                timeStr: secondsToTime(depSec),
                stationName: stop.name,
                type: 'dep',
              });
            }
          }
        });

        // Filter if train is completely outside window
        const inWindow = modPoints.some((p) => p.x >= paddingLeft && p.x <= paddingLeft + chartWidth);
        if (inWindow && modPoints.length >= 2) {
          paths.push({
            id: `mod_${modLine.id}_${offsetMin}`,
            lineId: modLine.id,
            name: `${modLine.category} ${modLine.name}`,
            category: modLine.category,
            direction: modLine.direction,
            headsign: modLine.headsign,
            color: CATEGORY_COLORS[modLine.category] || '#2563eb',
            points: modPoints,
            isModified: isLineModified,
            isOriginal: false,
            offsetMinutes: offsetMin,
          });
        }

        // 2. Original GTFS Path (if line is modified and showOriginal is checked)
        if (showOriginal && isLineModified && offsetSec === 0) {
          const origPoints: Point[] = [];
          rawLine.stops.forEach((stop) => {
            const y = stationYMap.get(stop.name.toLowerCase());
            if (y !== undefined) {
              const arrSec = timeToSeconds(stop.arrival || stop.departure);
              const depSec = timeToSeconds(stop.departure || stop.arrival);

              origPoints.push({
                x: timeToX(arrSec),
                y,
                timeStr: stop.arrival,
                stationName: stop.name,
                type: 'arr',
              });
              origPoints.push({
                x: timeToX(depSec),
                y,
                timeStr: stop.departure,
                stationName: stop.name,
                type: 'dep',
              });
            }
          });

          if (origPoints.length >= 2) {
            paths.push({
              id: `orig_${rawLine.id}`,
              lineId: rawLine.id,
              name: `Original: ${rawLine.category} ${rawLine.name}`,
              category: rawLine.category,
              direction: rawLine.direction,
              headsign: rawLine.headsign,
              color: '#94a3b8',
              points: origPoints,
              isModified: false,
              isOriginal: true,
              offsetMinutes: 0,
            });
          }
        }
      });
    });

    return paths;
  }, [
    corridorLines,
    getModifiedLine,
    showOpposing,
    showPeriodic,
    showOriginal,
    stationYMap,
    startSec,
    endSec,
    paddingLeft,
    chartWidth,
  ]);

  // Hour tick lines
  const hourTicks = useMemo(() => {
    const list: { hour: number; x: number; isHalf: boolean }[] = [];
    for (let h = timeWindow.start; h <= timeWindow.end; h++) {
      list.push({ hour: h, x: timeToX(h * 3600), isHalf: false });
      if (h < timeWindow.end) {
        list.push({ hour: h, x: timeToX(h * 3600 + 1800), isHalf: true });
      }
    }
    return list;
  }, [timeWindow]);

  const handleSelectLineInEditor = (lineId: string) => {
    const l = lines.find((line) => line.id === lineId);
    if (l) {
      setSelectedLine(l);
      setViewMode('editor');
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-gray-50 overflow-y-auto">
      {/* Header & Controls */}
      <div className="bg-white border-b border-gray-200 p-4 shadow-xs sticky top-0 z-20">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl">📈</span>
              <h2 className="text-lg font-bold text-gray-900">
                Bildfahrplan (Grafischer Zeit-Weg-Fahrplan)
              </h2>
              <span className="bg-red-100 text-red-800 text-xs font-bold px-2 py-0.5 rounded-full">
                SBB Netzgrafik
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              Zeit-Weg-Diagramm: Waagerecht = Zeitachse, Senkrecht = Streckenverlauf. Steigung = Geschwindigkeit.
            </p>
          </div>

          {/* Preset Corridor Selector */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-medium text-gray-600">Streckenkorridor:</span>
            <div className="flex gap-1 flex-wrap">
              {PRESET_CORRIDORS.map((c) => (
                <button
                  key={c.id}
                  onClick={() => {
                    setSelectedCorridorId(c.id);
                    setSelectedLineId('');
                  }}
                  className={`px-2.5 py-1 text-xs rounded-lg font-bold transition-all ${
                    selectedCorridorId === c.id && !selectedLineId
                      ? 'bg-gray-900 text-white shadow-xs'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {c.name}
                </button>
              ))}
            </div>

            {/* Individual Line selector */}
            <select
              value={selectedLineId}
              onChange={(e) => {
                setSelectedLineId(e.target.value);
                setSelectedCorridorId('');
              }}
              className="px-2.5 py-1 text-xs font-semibold bg-white border border-gray-300 rounded-lg shadow-xs text-gray-800"
            >
              <option value="">-- Spezifische Linie wählen --</option>
              {lines.slice(0, 50).map((l) => (
                <option key={l.id} value={l.id}>
                  {l.category} {l.name} → {l.headsign}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Toolbar: Time window & Toggles */}
        <div className="mt-3 flex items-center justify-between flex-wrap gap-3 pt-3 border-t border-gray-100 text-xs">
          {/* Time window buttons */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-gray-500 font-medium">Zeitfenster:</span>
            {TIME_WINDOWS.map((tw, idx) => (
              <button
                key={tw.label}
                onClick={() => setTimeWindowIdx(idx)}
                className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                  timeWindowIdx === idx
                    ? 'bg-blue-600 text-white font-bold shadow-xs'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {tw.label}
              </button>
            ))}
          </div>

          {/* Feature toggles */}
          <div className="flex items-center gap-3 flex-wrap">
            <label className="flex items-center gap-1.5 text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={showOpposing}
                onChange={(e) => setShowOpposing(e.target.checked)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span>Gegenrichtung einblenden (Kreuzungen)</span>
            </label>

            <label className="flex items-center gap-1.5 text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={showPeriodic}
                onChange={(e) => setShowPeriodic(e.target.checked)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span>Taktfahrten wiederholen</span>
            </label>

            <label className="flex items-center gap-1.5 text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={showOriginal}
                onChange={(e) => setShowOriginal(e.target.checked)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span>Originalen Fahrplan (Vergleich)</span>
            </label>
          </div>
        </div>
      </div>

      {/* Main Bildfahrplan Canvas Section */}
      <div className="p-4 flex-1">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 overflow-x-auto">
          {/* Legend and Info bar */}
          <div className="flex items-center justify-between mb-3 text-xs flex-wrap gap-2">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="font-bold text-gray-800">
                Strecke: {referenceLine?.category} {referenceLine?.name} ({corridorStations.length} Stationen)
              </span>
              <div className="flex items-center gap-1.5 text-gray-600">
                <span className="w-3 h-0.5 bg-red-600 inline-block" />
                <span>IC Trasse</span>
                <span className="w-3 h-0.5 bg-blue-600 inline-block ml-2" />
                <span>IR Trasse</span>
                <span className="w-3 h-0.5 bg-emerald-600 inline-block ml-2" />
                <span>RE Trasse</span>
                <span className="w-3 h-0.5 bg-sky-500 inline-block ml-2" />
                <span>S-Bahn</span>
                {showOriginal && (
                  <>
                    <span className="w-3 border-t border-dashed border-gray-400 inline-block ml-3" />
                    <span className="text-gray-400">Original GTFS</span>
                  </>
                )}
              </div>
            </div>

            {/* Hovered train card */}
            {hoveredTrain && (
              <div className="flex items-center gap-2 bg-blue-50 px-2.5 py-1 rounded-md border border-blue-200 text-xs animate-fadeIn">
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: hoveredTrain.color }}
                />
                <span className="font-bold text-gray-900">{hoveredTrain.name}</span>
                <span className="text-gray-500">→ {hoveredTrain.headsign}</span>
                {hoveredTrain.isModified && (
                  <span className="bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.2 rounded text-[10px]">
                    Optimiert
                  </span>
                )}
                <button
                  onClick={() => handleSelectLineInEditor(hoveredTrain.lineId)}
                  className="text-blue-700 underline font-bold ml-1 hover:text-blue-900"
                >
                  Im Editor anpassen
                </button>
              </div>
            )}
          </div>

          {/* SVG Diagram Canvas */}
          <div className="relative overflow-x-auto border border-gray-200 rounded-lg bg-white">
            <svg
              width={totalWidth}
              height={totalHeight}
              className="select-none font-sans"
              style={{ minWidth: `${totalWidth}px` }}
            >
              <defs>
                {/* Glow filter for modified trains */}
                <filter id="glow-emerald" x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="3" result="blur" />
                  <feComposite in="SourceGraphic" in2="blur" operator="over" />
                </filter>
              </defs>

              {/* Background Grid: Hour Vertical Lines */}
              {hourTicks.map((tick, i) => (
                <g key={`hour_${tick.hour}_${i}`}>
                  <line
                    x1={tick.x}
                    y1={paddingTop}
                    x2={tick.x}
                    y2={paddingTop + chartHeight}
                    stroke={tick.isHalf ? '#e2e8f0' : '#cbd5e1'}
                    strokeWidth={tick.isHalf ? 1 : 1.5}
                    strokeDasharray={tick.isHalf ? '4 4' : undefined}
                  />
                  {/* Top Time Labels */}
                  <text
                    x={tick.x}
                    y={paddingTop - 12}
                    textAnchor="middle"
                    className={`text-[11px] font-mono ${
                      tick.isHalf ? 'fill-gray-400 font-normal' : 'fill-gray-700 font-bold'
                    }`}
                  >
                    {tick.hour.toString().padStart(2, '0')}:{tick.isHalf ? '30' : '00'}
                  </text>
                  {/* Bottom Time Labels */}
                  <text
                    x={tick.x}
                    y={paddingTop + chartHeight + 20}
                    textAnchor="middle"
                    className={`text-[11px] font-mono ${
                      tick.isHalf ? 'fill-gray-400 font-normal' : 'fill-gray-700 font-bold'
                    }`}
                  >
                    {tick.hour.toString().padStart(2, '0')}:{tick.isHalf ? '30' : '00'}
                  </text>
                </g>
              ))}

              {/* Station Horizontal Lines & Station Labels */}
              {corridorStations.map((st) => {
                const y = stationYMap.get(st.name.toLowerCase());
                if (y === undefined) return null;

                return (
                  <g key={st.id}>
                    {/* Station Horizontal Gridline */}
                    <line
                      x1={paddingLeft}
                      y1={y}
                      x2={paddingLeft + chartWidth}
                      y2={y}
                      stroke={st.isHub ? '#94a3b8' : '#e2e8f0'}
                      strokeWidth={st.isHub ? 1.5 : 1}
                      strokeDasharray={st.isHub ? undefined : '2 2'}
                    />

                    {/* Station Name Label (Left Axis) */}
                    <text
                      x={paddingLeft - 10}
                      y={y + 4}
                      textAnchor="end"
                      className={`text-xs ${
                        st.isHub ? 'font-bold fill-gray-900' : 'font-medium fill-gray-600'
                      }`}
                    >
                      {st.name} {st.isHub ? '⭐' : ''}
                    </text>
                  </g>
                );
              })}

              {/* Train Traces (Trassen) */}
              {trainPaths.map((train) => {
                const isHovered = hoveredTrain?.id === train.id;
                const pathD = train.points
                  .map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
                  .join(' ');

                const isOpposing = train.direction === '1';

                return (
                  <g
                    key={train.id}
                    onMouseEnter={() => setHoveredTrain(train)}
                    onMouseLeave={() => setHoveredTrain(null)}
                    className="cursor-pointer"
                  >
                    {/* Invisible thicker line for easy mouse hover */}
                    <path
                      d={pathD}
                      fill="none"
                      stroke="transparent"
                      strokeWidth={14}
                    />

                    {/* Background glow if hovered or modified */}
                    {isHovered && (
                      <path
                        d={pathD}
                        fill="none"
                        stroke={train.color}
                        strokeWidth={7}
                        strokeOpacity={0.3}
                      />
                    )}

                    {/* Actual Train Trasse Line */}
                    <path
                      d={pathD}
                      fill="none"
                      stroke={train.isOriginal ? '#94a3b8' : train.color}
                      strokeWidth={isHovered ? 4 : train.isOriginal ? 1.5 : 2.5}
                      strokeDasharray={
                        train.isOriginal
                          ? '5 4'
                          : isOpposing
                          ? '6 3'
                          : undefined
                      }
                      strokeOpacity={train.isOriginal ? 0.7 : isHovered ? 1 : 0.85}
                      className="transition-all duration-150"
                    />

                    {/* Station Stop Dots on Trasse */}
                    {train.points.map((pt, pIdx) => {
                      if (pt.x < paddingLeft || pt.x > paddingLeft + chartWidth) return null;
                      return (
                        <circle
                          key={`${train.id}_pt_${pIdx}`}
                          cx={pt.x}
                          cy={pt.y}
                          r={isHovered ? 3.5 : 2}
                          fill={train.isOriginal ? '#94a3b8' : train.color}
                        >
                          <title>
                            {train.name} an {pt.stationName}: {pt.timeStr}
                          </title>
                        </circle>
                      );
                    })}
                  </g>
                );
              })}
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Bildfahrplan;
