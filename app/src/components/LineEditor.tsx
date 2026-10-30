import React, { useState, useMemo } from 'react';
import type { Segment } from '../types';
import { useFahrplanStore } from '../stores/fahrplanStore';
import {
  CATEGORY_COLORS,
  CATEGORY_NAMES,
  formatTime,
  formatDuration,
} from '../utils/constants';
import { getTaktNode } from '../utils/knoten';

function segmentKey(seg: Segment): string {
  return `${seg.fromStop}_${seg.toStop}`;
}

const LineEditor: React.FC = () => {
  const {
    viewMode,
    selectedLine,
    taktModifications,
    addTaktMod,
    removeTaktMod,
    setStopDeparture,
    setStopArrival,
    setSegmentTravelTime,
    removeTravelTimeMod,
    removeDepartureMod,
    getModifiedLine,
    setSelectedLine,
  } = useFahrplanStore();

  const [taktInput, setTaktInput] = useState('');
  const [selectedSegmentKey, setSelectedSegmentKey] = useState<string | null>(null);

  const stations = useFahrplanStore((s) => s.data[s.activeYear].stations);
  const hubMap = useMemo(() => new Set(stations.filter(s => s.isHub).map(s => s.name.toLowerCase())), [stations]);

  if (viewMode !== 'editor' || !selectedLine) return null;

  const modifiedLine = getModifiedLine(selectedLine);
  const calculatedStops = modifiedLine.calculatedStops || [];
  const originalTotal = modifiedLine.originalTotalTravelTime;
  const modifiedTotal = modifiedLine.modifiedTotalTravelTime;
  const totalDiff = modifiedLine.totalTimeDeltaSeconds;

  const currentTakt = modifiedLine.taktMinutes ?? selectedLine.taktMinutes;
  const taktMod = taktModifications.find((m) => m.lineId === selectedLine.id);

  const catColor = CATEGORY_COLORS[selectedLine.category];
  const catName = CATEGORY_NAMES[selectedLine.category];

  const handleTaktChange = () => {
    const val = parseInt(taktInput, 10);
    if (isNaN(val) || val <= 0) return;
    addTaktMod({
      lineId: selectedLine.id,
      originalTakt: selectedLine.taktMinutes ?? 0,
      newTakt: val,
    });
    setTaktInput('');
  };

  const handleDepartureChange = (idx: number, newTimeStr: string) => {
    if (!newTimeStr) return;
    setStopDeparture(selectedLine, idx, newTimeStr);
  };

  const handleArrivalChange = (idx: number, newTimeStr: string) => {
    if (!newTimeStr || idx === 0) return;
    setStopArrival(selectedLine, idx, newTimeStr);
  };

  const handleTravelTimeChange = (seg: Segment, newSeconds: number) => {
    const key = segmentKey(seg);
    if (newSeconds <= 0) return;
    setSegmentTravelTime(key, newSeconds, seg.travelTime);
  };

  const handleResetLine = () => {
    selectedLine.segments.forEach((seg) => removeTravelTimeMod(segmentKey(seg)));
    removeTaktMod(selectedLine.id);
    selectedLine.stops.forEach((stop) => removeDepartureMod(selectedLine.id, stop.id));
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto bg-white">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200 p-4 shadow-xs">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold text-gray-900">{selectedLine.name}</h2>
            <span
              className="px-2 py-0.5 rounded text-xs font-bold text-white shadow-xs"
              style={{ backgroundColor: catColor }}
            >
              {selectedLine.category}
            </span>
          </div>
          <button
            onClick={() => setSelectedLine(null)}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none p-1"
            title="Schliessen"
          >
            ✕
          </button>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600">
          <span>
            <span className="font-medium text-gray-500">Kategorie:</span> {catName}
          </span>
          <span>
            <span className="font-medium text-gray-500">Betreiber:</span> {selectedLine.agency}
          </span>
          <span>
            <span className="font-medium text-gray-500">Richtung:</span> {selectedLine.headsign}
          </span>
        </div>
      </div>

      <div className="p-4 space-y-6">
        {/* Takt Settings */}
        <section className="bg-gray-50 rounded-lg p-4 border border-gray-200">
          <h3 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">
            Taktfahrplan & Frequenz
          </h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-500">Aktueller Takt:</span>
              <span className="ml-2 font-semibold text-gray-900">
                {currentTakt ? `${currentTakt} min` : '—'}
                {taktMod && (
                  <span className="ml-1 text-xs text-blue-600 font-normal">
                    (orig. {selectedLine.taktMinutes} min)
                  </span>
                )}
              </span>
            </div>
            <div>
              <span className="text-gray-500">Fahrten/Tag:</span>
              <span className="ml-2 font-semibold text-gray-900">{selectedLine.numTrips}</span>
            </div>
            <div>
              <span className="text-gray-500">Erste Abfahrt:</span>
              <span className="ml-2 font-mono text-gray-800">
                {calculatedStops[0]?.departure ? formatTime(calculatedStops[0].departure) : '—'}
              </span>
            </div>
            <div>
              <span className="text-gray-500">Letzte Ankunft:</span>
              <span className="ml-2 font-mono text-gray-800">
                {calculatedStops[calculatedStops.length - 1]?.arrival
                  ? formatTime(calculatedStops[calculatedStops.length - 1].arrival)
                  : '—'}
              </span>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <label className="text-sm text-gray-600 whitespace-nowrap">Neuer Takt:</label>
            <input
              type="number"
              min={1}
              value={taktInput}
              onChange={(e) => setTaktInput(e.target.value)}
              placeholder={String(currentTakt ?? '')}
              className="w-20 px-2 py-1 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-400 focus:border-transparent bg-white"
            />
            <span className="text-xs text-gray-500">min</span>
            <button
              onClick={handleTaktChange}
              className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 font-medium transition-colors"
            >
              Setzen
            </button>
            {taktMod && (
              <button
                onClick={() => removeTaktMod(selectedLine.id)}
                className="px-2 py-1 text-xs text-red-600 hover:text-red-800"
              >
                Zurücksetzen
              </button>
            )}
          </div>
        </section>

        {/* Timetable Stop / Segment synchronization section */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
              Haltestellen & Fahrzeiten (Synchronisiert)
            </h3>
            <span className="text-xs text-gray-400">
              Änderung an Zeit oder Fahrtdauer synchronisiert automatisch
            </span>
          </div>

          <div className="border border-gray-200 rounded-lg overflow-hidden shadow-xs">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-100/80 text-left text-xs text-gray-600 uppercase tracking-wider border-b border-gray-200">
                  <th className="px-3 py-2.5">Haltestelle</th>
                  <th className="px-3 py-2.5 text-center">Ankunft</th>
                  <th className="px-3 py-2.5 text-center">Abfahrt</th>
                  <th className="px-3 py-2.5 text-center">Haltezeit</th>
                </tr>
              </thead>
              <tbody>
                {calculatedStops.map((stop, idx) => {
                  const segment = idx < selectedLine.segments.length ? selectedLine.segments[idx] : null;
                  const modSeg = segment ? modifiedLine.segments[idx] : null;
                  const isModifiedSegment = segment && modSeg && modSeg.travelTime !== segment.travelTime;
                  const segDiff = segment && modSeg ? modSeg.travelTime - segment.travelTime : 0;
                  const isLastStop = idx === calculatedStops.length - 1;
                  const isHub = hubMap.has(stop.name.toLowerCase());
                  const depNode = getTaktNode(stop.departure);
                  const arrNode = getTaktNode(stop.arrival);

                  const arrDiffMinutes = Math.round(stop.arrivalDeltaSeconds / 60);
                  const depDiffMinutes = Math.round(stop.departureDeltaSeconds / 60);

                  return (
                    <React.Fragment key={stop.id}>
                      {/* Stop row */}
                      <tr className={`border-t border-gray-100 ${stop.isModified ? 'bg-amber-50/40' : 'hover:bg-gray-50'}`}>
                        <td className="px-3 py-2.5 font-medium text-gray-900">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className={`w-2 h-2 rounded-full shrink-0 ${isHub ? 'bg-amber-500 ring-2 ring-amber-200' : 'bg-gray-400'}`} />
                            <span>{stop.name}</span>
                            {isHub && (
                              <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 border border-amber-200">
                                Knoten
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Arrival Column */}
                        <td className="px-3 py-2.5 text-center">
                          {idx === 0 ? (
                            <span className="text-xs text-gray-400">Start</span>
                          ) : (
                            <div className="inline-flex flex-col items-center">
                              <input
                                type="time"
                                value={formatTime(stop.arrival)}
                                onChange={(e) => handleArrivalChange(idx, e.target.value)}
                                className={`w-22 px-1.5 py-0.5 text-center font-mono text-sm border rounded ${
                                  stop.arrivalDeltaSeconds !== 0
                                    ? 'border-blue-400 bg-blue-50/70 font-semibold text-blue-900'
                                    : 'border-gray-200 text-gray-700 bg-white'
                                }`}
                                title="Ankunftszeit ändern (passt vorherige Fahrzeit an)"
                              />
                              {arrDiffMinutes !== 0 && (
                                <span
                                  className={`text-[10px] font-bold ${
                                    arrDiffMinutes < 0 ? 'text-green-600' : 'text-red-600'
                                  }`}
                                >
                                  {arrDiffMinutes > 0 ? '+' : ''}{arrDiffMinutes} min
                                </span>
                              )}
                              {isLastStop && (
                                <span className={`mt-0.5 text-[10px] font-bold px-1.5 py-0.2 rounded border ${arrNode.bgColor} ${arrNode.textColor} ${arrNode.borderColor}`} title={arrNode.label}>
                                  {arrNode.shortLabel}
                                  {arrNode.deltaMinutes !== 0 && (
                                    <span className="ml-0.5 opacity-80 font-normal">
                                      {arrNode.deltaMinutes > 0 ? `+${arrNode.deltaMinutes}'` : `${arrNode.deltaMinutes}'`}
                                    </span>
                                  )}
                                </span>
                              )}
                            </div>
                          )}
                        </td>

                        {/* Departure Column */}
                        <td className="px-3 py-2.5 text-center">
                          {isLastStop ? (
                            <span className="text-xs text-gray-400">Endstation</span>
                          ) : (
                            <div className="inline-flex flex-col items-center">
                              <input
                                type="time"
                                value={formatTime(stop.departure)}
                                onChange={(e) => handleDepartureChange(idx, e.target.value)}
                                className={`w-22 px-1.5 py-0.5 text-center font-mono text-sm border rounded ${
                                  stop.departureDeltaSeconds !== 0
                                    ? 'border-blue-400 bg-blue-50/70 font-semibold text-blue-900'
                                    : 'border-gray-200 text-gray-700 bg-white'
                                }`}
                                title="Abfahrtszeit anpassen (passt Fahrtdauer an und synchronisiert Folgestationen)"
                              />
                              {depDiffMinutes !== 0 && (
                                <span
                                  className={`text-[10px] font-bold ${
                                    depDiffMinutes < 0 ? 'text-green-600' : 'text-red-600'
                                  }`}
                                >
                                  {depDiffMinutes > 0 ? '+' : ''}{depDiffMinutes} min
                                </span>
                              )}
                              <span className={`mt-0.5 text-[10px] font-bold px-1.5 py-0.2 rounded border ${depNode.bgColor} ${depNode.textColor} ${depNode.borderColor}`} title={depNode.label}>
                                {depNode.shortLabel}
                                {depNode.deltaMinutes !== 0 && (
                                  <span className="ml-0.5 opacity-80 font-normal">
                                    {depNode.deltaMinutes > 0 ? `+${depNode.deltaMinutes}'` : `${depNode.deltaMinutes}'`}
                                  </span>
                                )}
                              </span>
                            </div>
                          )}
                        </td>

                        {/* Dwell time */}
                        <td className="px-3 py-2.5 text-center text-xs text-gray-500 font-mono">
                          {isLastStop ? '—' : `${Math.round(stop.dwellSeconds / 60)} min (${stop.dwellSeconds}s)`}
                        </td>
                      </tr>

                      {/* Segment row between stops */}
                      {segment && modSeg && (
                        <tr
                          className={`border-t border-dashed border-gray-200 ${
                            selectedSegmentKey === segmentKey(segment)
                              ? 'bg-amber-100/50'
                              : isModifiedSegment
                              ? 'bg-blue-50/40'
                              : 'bg-gray-50/60'
                          }`}
                        >
                          <td colSpan={4} className="px-4 py-2.5">
                            <div className="flex items-center gap-3 flex-wrap">
                              <span className="text-xs font-semibold text-gray-500 shrink-0 flex items-center gap-1">
                                <span>↕ Fahrzeit:</span>
                              </span>

                              {/* Slider */}
                              <input
                                type="range"
                                min={Math.max(30, Math.floor(segment.travelTime * 0.3))}
                                max={Math.ceil(segment.travelTime * 1.6)}
                                step={30}
                                value={modSeg.travelTime}
                                onChange={(e) =>
                                  handleTravelTimeChange(segment, parseInt(e.target.value, 10))
                                }
                                className="flex-1 min-w-[120px] h-1.5 accent-blue-600 cursor-pointer"
                                title="Fahrzeit anpassen (aktualisiert Abfahrts- und Ankunftszeiten synchron)"
                              />

                              {/* Duration display */}
                              <div className="flex items-center gap-1 shrink-0 font-mono text-xs">
                                <input
                                  type="number"
                                  min={30}
                                  step={30}
                                  value={modSeg.travelTime}
                                  onChange={(e) =>
                                    handleTravelTimeChange(
                                      segment,
                                      parseInt(e.target.value, 10) || segment.travelTime
                                    )
                                  }
                                  className={`w-16 px-1.5 py-0.5 border rounded text-center text-xs ${
                                    isModifiedSegment
                                      ? 'border-blue-400 bg-blue-50 font-bold text-blue-900'
                                      : 'border-gray-300 text-gray-700 bg-white'
                                  }`}
                                />
                                <span className="text-gray-500">s</span>
                                <span className="text-gray-500">
                                  ({formatDuration(modSeg.travelTime)})
                                </span>
                              </div>

                              {/* Delta badge */}
                              {isModifiedSegment && (
                                <span
                                  className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                                    segDiff < 0
                                      ? 'bg-green-100 text-green-800'
                                      : 'bg-red-100 text-red-800'
                                  }`}
                                >
                                  {segDiff < 0 ? '−' : '+'}
                                  {formatDuration(Math.abs(segDiff))}
                                </span>
                              )}

                              {/* Revert segment button */}
                              {isModifiedSegment && (
                                <button
                                  onClick={() => removeTravelTimeMod(segmentKey(segment))}
                                  className="text-xs text-gray-400 hover:text-red-600 underline"
                                  title="Originale Fahrzeit wiederherstellen"
                                >
                                  Reset
                                </button>
                              )}

                              {/* Infrastructure Project shortcut */}
                              <button
                                onClick={() =>
                                  setSelectedSegmentKey(
                                    selectedSegmentKey === segmentKey(segment)
                                      ? null
                                      : segmentKey(segment)
                                  )
                                }
                                className={`ml-auto px-2 py-0.5 text-xs rounded transition-colors whitespace-nowrap font-medium ${
                                  selectedSegmentKey === segmentKey(segment)
                                    ? 'bg-amber-600 text-white'
                                    : 'bg-amber-100 text-amber-800 hover:bg-amber-200'
                                }`}
                                title="Infrastrukturprojekt für diese Fahrzeitverkürzung anlegen"
                              >
                                + Infrastrukturprojekt
                              </button>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* Total Travel Time Summary */}
        <section className="bg-gray-50 rounded-lg p-4 border border-gray-200">
          <h3 className="text-sm font-semibold text-gray-700 mb-2 uppercase tracking-wide">
            Gesamte Linien-Fahrzeit
          </h3>
          <div className="flex items-center gap-4 flex-wrap">
            <div className="text-2xl font-bold text-gray-900">
              {formatDuration(modifiedTotal)}
            </div>
            {totalDiff !== 0 && (
              <>
                <span className="text-gray-500 text-sm">
                  (Original: {formatDuration(originalTotal)})
                </span>
                <span
                  className={`text-sm font-bold px-2 py-0.5 rounded ${
                    totalDiff < 0
                      ? 'bg-green-100 text-green-800'
                      : 'bg-red-100 text-red-800'
                  }`}
                >
                  {totalDiff < 0 ? '−' : '+'}
                  {formatDuration(Math.abs(totalDiff))}
                </span>
              </>
            )}
          </div>
        </section>

        {/* Reset Line button */}
        <div className="pb-4">
          <button
            onClick={handleResetLine}
            className="w-full px-4 py-2.5 bg-red-50 text-red-700 border border-red-200 rounded-lg hover:bg-red-100 text-sm font-medium transition-colors"
          >
            Alle Änderungen für diese Linie zurücksetzen
          </button>
        </div>
      </div>
    </div>
  );
};

export default LineEditor;
