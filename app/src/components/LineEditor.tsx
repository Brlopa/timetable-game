import React, { useState, useMemo } from 'react';
import type { Line, Segment } from '../types';
import { useFahrplanStore } from '../stores/fahrplanStore';
import {
  CATEGORY_COLORS,
  CATEGORY_NAMES,
  formatTime,
  formatDuration,
  totalTravelTime,
} from '../utils/constants';

function segmentKey(seg: Segment): string {
  return `${seg.fromStop}_${seg.toStop}`;
}

const LineEditor: React.FC = () => {
  const {
    viewMode,
    selectedLine,
    travelTimeModifications,
    departureModifications,
    taktModifications,
    addTravelTimeMod,
    removeTravelTimeMod,
    updateTravelTimeMod,
    addDepartureMod,
    removeDepartureMod,
    addTaktMod,
    removeTaktMod,
    getModifiedLine,
    setSelectedLine,
  } = useFahrplanStore();

  const [taktInput, setTaktInput] = useState('');
  const [selectedSegmentKey, setSelectedSegmentKey] = useState<string | null>(null);

  if (viewMode !== 'editor' || !selectedLine) return null;

  const modifiedLine = getModifiedLine(selectedLine);
  const originalTotal = totalTravelTime(selectedLine.segments);
  const modifiedTotal = totalTravelTime(modifiedLine.segments);
  const totalDiff = modifiedTotal - originalTotal;

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

  const handleDepartureChange = (stopId: string, originalDep: string, newDep: string) => {
    if (newDep === formatTime(originalDep)) {
      removeDepartureMod(selectedLine.id, stopId);
      return;
    }
    addDepartureMod({
      lineId: selectedLine.id,
      stopId,
      originalDeparture: originalDep,
      newDeparture: newDep + ':00',
    });
  };

  const handleTravelTimeChange = (seg: Segment, newSeconds: number) => {
    const key = segmentKey(seg);
    if (newSeconds === seg.travelTime) {
      removeTravelTimeMod(key);
      return;
    }
    const existing = travelTimeModifications.find((m) => m.segmentKey === key);
    if (existing) {
      updateTravelTimeMod(key, newSeconds);
    } else {
      addTravelTimeMod({
        segmentKey: key,
        originalTime: seg.travelTime,
        newTime: newSeconds,
        reason: '',
        isInfrastructure: false,
      });
    }
  };

  const handleResetLine = () => {
    selectedLine.segments.forEach((seg) => removeTravelTimeMod(segmentKey(seg)));
    removeTaktMod(selectedLine.id);
    selectedLine.stops.forEach((stop) => removeDepartureMod(selectedLine.id, stop.id));
  };

  const getDepartureMod = (stopId: string) =>
    departureModifications.find(
      (m) => m.lineId === selectedLine.id && m.stopId === stopId
    );

  const getTravelTimeMod = (seg: Segment) =>
    travelTimeModifications.find((m) => m.segmentKey === segmentKey(seg));

  return (
    <div className="flex flex-col h-full overflow-y-auto bg-white">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200 p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold text-gray-900">{selectedLine.name}</h2>
            <span
              className="px-2 py-0.5 rounded text-xs font-bold text-white"
              style={{ backgroundColor: catColor }}
            >
              {selectedLine.category}
            </span>
          </div>
          <button
            onClick={() => setSelectedLine(null)}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
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
          <span>
            <span className="font-medium text-gray-500">Direction ID:</span> {selectedLine.direction}
          </span>
        </div>
      </div>

      <div className="p-4 space-y-6">
        {/* Takt Settings */}
        <section className="bg-gray-50 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">
            Takt & Fahrten
          </h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-500">Aktueller Takt:</span>
              <span className="ml-2 font-semibold">
                {currentTakt ? `${currentTakt} min` : '—'}
                {taktMod && (
                  <span className="ml-1 text-xs text-blue-600">
                    (orig. {selectedLine.taktMinutes} min)
                  </span>
                )}
              </span>
            </div>
            <div>
              <span className="text-gray-500">Fahrten/Tag:</span>
              <span className="ml-2 font-semibold">{selectedLine.numTrips}</span>
            </div>
            <div>
              <span className="text-gray-500">Erste Abfahrt:</span>
              <span className="ml-2 font-mono">
                {selectedLine.firstDeparture ? formatTime(selectedLine.firstDeparture) : '—'}
              </span>
            </div>
            <div>
              <span className="text-gray-500">Letzte Abfahrt:</span>
              <span className="ml-2 font-mono">
                {selectedLine.lastDeparture ? formatTime(selectedLine.lastDeparture) : '—'}
              </span>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <label className="text-sm text-gray-500 whitespace-nowrap">Neuer Takt (min):</label>
            <input
              type="number"
              min={1}
              value={taktInput}
              onChange={(e) => setTaktInput(e.target.value)}
              placeholder={String(currentTakt ?? '')}
              className="w-20 px-2 py-1 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-400 focus:border-transparent"
            />
            <button
              onClick={handleTaktChange}
              className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
            >
              Ändern
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

        {/* Stops Table */}
        <section>
          <h3 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">
            Halte & Segmente
          </h3>
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left text-xs text-gray-500 uppercase tracking-wider">
                  <th className="px-3 py-2">Haltestelle</th>
                  <th className="px-3 py-2 text-center">Ankunft</th>
                  <th className="px-3 py-2 text-center">Abfahrt</th>
                  <th className="px-3 py-2 text-center">Haltezeit</th>
                </tr>
              </thead>
              <tbody>
                {selectedLine.stops.map((stop, idx) => {
                  const depMod = getDepartureMod(stop.id);
                  const displayDep = depMod
                    ? formatTime(depMod.newDeparture)
                    : formatTime(stop.departure);
                  const segment = idx < selectedLine.segments.length ? selectedLine.segments[idx] : null;
                  const modSeg = segment ? modifiedLine.segments[idx] : null;
                  const ttMod = segment ? getTravelTimeMod(segment) : null;

                  return (
                    <React.Fragment key={stop.id}>
                      {/* Stop row */}
                      <tr className="border-t border-gray-100 hover:bg-blue-50/50">
                        <td className="px-3 py-2 font-medium text-gray-900">{stop.name}</td>
                        <td className="px-3 py-2 text-center font-mono text-gray-600">
                          {stop.arrival ? formatTime(stop.arrival) : '—'}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {stop.departure ? (
                            <input
                              type="time"
                              value={displayDep}
                              onChange={(e) =>
                                handleDepartureChange(stop.id, stop.departure, e.target.value)
                              }
                              className={`w-24 px-1 py-0.5 text-center font-mono border rounded text-sm ${
                                depMod
                                  ? 'border-blue-400 bg-blue-50 text-blue-700'
                                  : 'border-gray-200 text-gray-600'
                              }`}
                            />
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-center text-gray-500">
                          {segment ? `${segment.dwellTime}s` : '—'}
                        </td>
                      </tr>

                      {/* Segment row between stops */}
                      {segment && modSeg && (
                        <tr
                          className={`border-t border-dashed border-gray-200 ${
                            selectedSegmentKey === segmentKey(segment)
                              ? 'bg-amber-50'
                              : 'bg-gray-50/50'
                          }`}
                        >
                          <td colSpan={4} className="px-3 py-2">
                            <div className="flex items-center gap-3 flex-wrap">
                              <span className="text-xs text-gray-400 shrink-0">
                                ↓ Fahrzeit
                              </span>
                              <input
                                type="range"
                                min={Math.max(10, Math.floor(segment.travelTime * 0.3))}
                                max={Math.ceil(segment.travelTime * 1.5)}
                                value={modSeg.travelTime}
                                onChange={(e) =>
                                  handleTravelTimeChange(segment, parseInt(e.target.value, 10))
                                }
                                className="flex-1 min-w-[80px] h-1.5 accent-blue-600"
                              />
                              <input
                                type="number"
                                min={10}
                                value={modSeg.travelTime}
                                onChange={(e) =>
                                  handleTravelTimeChange(segment, parseInt(e.target.value, 10) || segment.travelTime)
                                }
                                className={`w-16 px-1 py-0.5 border rounded text-xs text-center font-mono ${
                                  ttMod
                                    ? 'border-blue-400 bg-blue-50'
                                    : 'border-gray-200'
                                }`}
                              />
                              <span className="text-xs text-gray-500">s</span>

                              {ttMod && (
                                <span
                                  className={`text-xs font-semibold ${
                                    ttMod.newTime < ttMod.originalTime
                                      ? 'text-green-600'
                                      : 'text-red-600'
                                  }`}
                                >
                                  {ttMod.newTime < ttMod.originalTime ? '−' : '+'}
                                  {formatDuration(Math.abs(ttMod.newTime - ttMod.originalTime))}
                                </span>
                              )}

                              {!ttMod && (
                                <span className="text-xs text-gray-400">
                                  {formatDuration(segment.travelTime)}
                                </span>
                              )}

                              <button
                                onClick={() =>
                                  setSelectedSegmentKey(
                                    selectedSegmentKey === segmentKey(segment)
                                      ? null
                                      : segmentKey(segment)
                                  )
                                }
                                className="ml-auto px-2 py-0.5 text-xs bg-amber-100 text-amber-800 rounded hover:bg-amber-200 whitespace-nowrap"
                                title="Infrastrukturprojekt für dieses Segment hinzufügen"
                              >
                                Infrastrukturprojekt
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

        {/* Total travel time */}
        <section className="bg-gray-50 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-2 uppercase tracking-wide">
            Gesamtfahrzeit
          </h3>
          <div className="flex items-center gap-4">
            <div className="text-lg font-bold text-gray-900">
              {formatDuration(modifiedTotal)}
            </div>
            {totalDiff !== 0 && (
              <>
                <span className="text-gray-400 text-sm">
                  (Original: {formatDuration(originalTotal)})
                </span>
                <span
                  className={`text-sm font-semibold ${
                    totalDiff < 0 ? 'text-green-600' : 'text-red-600'
                  }`}
                >
                  {totalDiff < 0 ? '−' : '+'}
                  {formatDuration(Math.abs(totalDiff))}
                </span>
              </>
            )}
          </div>
        </section>

        {/* Reset button */}
        <div className="pb-4">
          <button
            onClick={handleResetLine}
            className="w-full px-4 py-2 bg-red-50 text-red-700 border border-red-200 rounded-lg hover:bg-red-100 text-sm font-medium"
          >
            Alle Änderungen für diese Linie zurücksetzen
          </button>
        </div>
      </div>
    </div>
  );
};

export default LineEditor;
