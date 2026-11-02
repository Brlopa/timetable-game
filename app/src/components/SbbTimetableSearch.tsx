import React, { useState, useMemo, useEffect } from 'react';
import type { Line, Station, LineCategory } from '../types';
import { useFahrplanStore } from '../stores/fahrplanStore';
import { CATEGORY_COLORS, formatTime } from '../utils/constants';
import { findConnections, compareSchedules, type JourneyConnection, type JourneyLeg } from '../utils/routing';

const POPULAR_STATIONS = [
  'Zürich HB', 'Bern', 'Basel SBB', 'Olten', 'Luzern', 
  'Winterthur', 'St. Gallen', 'Biel/Bienne', 'Lausanne', 'Genève', 'Thun'
];

function getCatColor(cat: string): string {
  return CATEGORY_COLORS[cat as LineCategory] || '#4A5568';
}

const SbbTimetableSearch: React.FC = () => {
  const activeYear = useFahrplanStore((s) => s.activeYear);
  const data = useFahrplanStore((s) => s.data[activeYear]);
  const getModifiedLine = useFahrplanStore((s) => s.getModifiedLine);
  const selectedStation = useFahrplanStore((s) => s.selectedStation);
  const setSelectedLine = useFahrplanStore((s) => s.setSelectedLine);
  const setViewMode = useFahrplanStore((s) => s.setViewMode);

  const { stations, lines: rawLines } = data;

  // Search input state
  const [origin, setOrigin] = useState<string>(selectedStation?.name || 'Zürich HB');
  const [destination, setDestination] = useState<string>('Bern');
  const [depTime, setDepTime] = useState<string>('08:00');
  const [useOptimizedSchedule, setUseOptimizedSchedule] = useState<boolean>(true);
  const [expandedConnId, setExpandedConnId] = useState<string | null>(null);

  // Autocomplete state
  const [showOriginSuggestions, setShowOriginSuggestions] = useState<boolean>(false);
  const [showDestSuggestions, setShowDestSuggestions] = useState<boolean>(false);

  // Load optimized lines from preprocessed modifications or file
  const [optimizedLines, setOptimizedLines] = useState<Line[]>([]);
  const [optLoaded, setOptLoaded] = useState<boolean>(false);

  useEffect(() => {
    // Attempt to fetch public/data/2026/optimized_lines.json if available
    fetch('/data/2026/optimized_lines.json')
      .then((res) => {
        if (res.ok) return res.json();
        throw new Error('Not found');
      })
      .then((data: Line[]) => {
        if (Array.isArray(data) && data.length > 0) {
          setOptimizedLines(data);
          setOptLoaded(true);
        }
      })
      .catch(() => {
        // Fallback: calculate modified lines on-the-fly from store modifications
        const modified = rawLines.map((l) => getModifiedLine(l));
        setOptimizedLines(modified);
        setOptLoaded(true);
      });
  }, [rawLines, getModifiedLine]);

  // Station autocompletion
  const originSuggestions = useMemo(() => {
    if (!origin.trim()) return POPULAR_STATIONS;
    const q = origin.toLowerCase();
    return stations
      .filter((s) => s.name.toLowerCase().includes(q))
      .slice(0, 8)
      .map((s) => s.name);
  }, [origin, stations]);

  const destSuggestions = useMemo(() => {
    if (!destination.trim()) return POPULAR_STATIONS.filter((s) => s !== origin);
    const q = destination.toLowerCase();
    return stations
      .filter((s) => s.name.toLowerCase().includes(q) && s.name.toLowerCase() !== origin.toLowerCase())
      .slice(0, 8)
      .map((s) => s.name);
  }, [destination, origin, stations]);

  // Swap origin and destination
  const handleSwap = () => {
    setOrigin(destination);
    setDestination(origin);
  };

  // Compute connections
  const connections = useMemo(() => {
    if (!origin || !destination || origin === destination || !rawLines.length) {
      return [];
    }

    const activeLineSet = useOptimizedSchedule && optimizedLines.length ? optimizedLines : rawLines;

    // Search connections in active schedule
    const found = findConnections(origin, destination, `${depTime}:00`, activeLineSet, {
      stations,
      isOptimized: useOptimizedSchedule,
    });

    // If viewing optimized schedule, also run comparison against original
    if (useOptimizedSchedule && rawLines.length) {
      const origFound = findConnections(origin, destination, `${depTime}:00`, rawLines, {
        stations,
        isOptimized: false,
      });
      return compareSchedules(origFound, found);
    }

    return found;
  }, [origin, destination, depTime, useOptimizedSchedule, optimizedLines, rawLines, stations]);

  return (
    <div className="flex-1 flex flex-col h-full bg-gray-50 overflow-y-auto">
      {/* SBB Brand Header & Search Container */}
      <div className="bg-[#EB0000] text-white px-6 py-6 shadow-md">
        <div className="max-w-4xl mx-auto">
          {/* Header Title with SBB Logo Style */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="bg-white text-[#EB0000] font-black text-xs px-2 py-1 tracking-tighter rounded">
                SBB CFF FFS
              </div>
              <h2 className="text-xl font-bold tracking-tight">Fahrplan & Verbindungssuche</h2>
            </div>
            
            {/* Optimized vs Original Toggle */}
            <div className="flex items-center bg-red-900/40 p-1 rounded-lg border border-red-400/30">
              <button
                onClick={() => setUseOptimizedSchedule(true)}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all flex items-center gap-1.5 ${
                  useOptimizedSchedule
                    ? 'bg-white text-red-700 shadow-sm'
                    : 'text-red-100 hover:text-white'
                }`}
              >
                <span>⚡</span>
                <span>Optimierter Fahrplan 2026</span>
              </button>
              <button
                onClick={() => setUseOptimizedSchedule(false)}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all flex items-center gap-1.5 ${
                  !useOptimizedSchedule
                    ? 'bg-white text-red-700 shadow-sm'
                    : 'text-red-100 hover:text-white'
                }`}
              >
                <span>Original 2026</span>
              </button>
            </div>
          </div>

          {/* Search Inputs Card */}
          <div className="bg-white rounded-xl shadow-lg p-4 text-gray-800">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
              {/* Origin Station */}
              <div className="relative md:col-span-5">
                <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1">
                  Von
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-gray-400">⚪</span>
                  <input
                    type="text"
                    value={origin}
                    onChange={(e) => {
                      setOrigin(e.target.value);
                      setShowOriginSuggestions(true);
                    }}
                    onFocus={() => setShowOriginSuggestions(true)}
                    className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-300 rounded-lg text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-red-500 focus:bg-white"
                    placeholder="Abfahrtsbahnhof..."
                  />
                  {showOriginSuggestions && originSuggestions.length > 0 && (
                    <div 
                      className="absolute z-30 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-xl max-h-56 overflow-y-auto"
                      onMouseLeave={() => setShowOriginSuggestions(false)}
                    >
                      {originSuggestions.map((st) => (
                        <div
                          key={st}
                          onClick={() => {
                            setOrigin(st);
                            setShowOriginSuggestions(false);
                          }}
                          className="px-3 py-2 text-sm hover:bg-red-50 hover:text-red-700 cursor-pointer flex items-center justify-between"
                        >
                          <span className="font-medium">{st}</span>
                          <span className="text-[11px] text-gray-400">Bahnhof</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Swap Button */}
              <div className="flex justify-center md:col-span-1 pt-4 md:pt-4">
                <button
                  type="button"
                  onClick={handleSwap}
                  className="w-9 h-9 rounded-full bg-gray-100 hover:bg-red-100 hover:text-red-700 flex items-center justify-center text-gray-600 transition-colors shadow-sm"
                  title="Abfahrt und Ziel tauschen"
                >
                  ⇅
                </button>
              </div>

              {/* Destination Station */}
              <div className="relative md:col-span-4">
                <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1">
                  Nach
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-red-600">🔴</span>
                  <input
                    type="text"
                    value={destination}
                    onChange={(e) => {
                      setDestination(e.target.value);
                      setShowDestSuggestions(true);
                    }}
                    onFocus={() => setShowDestSuggestions(true)}
                    className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-300 rounded-lg text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-red-500 focus:bg-white"
                    placeholder="Zielbahnhof..."
                  />
                  {showDestSuggestions && destSuggestions.length > 0 && (
                    <div 
                      className="absolute z-30 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-xl max-h-56 overflow-y-auto"
                      onMouseLeave={() => setShowDestSuggestions(false)}
                    >
                      {destSuggestions.map((st) => (
                        <div
                          key={st}
                          onClick={() => {
                            setDestination(st);
                            setShowDestSuggestions(false);
                          }}
                          className="px-3 py-2 text-sm hover:bg-red-50 hover:text-red-700 cursor-pointer flex items-center justify-between"
                        >
                          <span className="font-medium">{st}</span>
                          <span className="text-[11px] text-gray-400">Bahnhof</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Time Picker */}
              <div className="md:col-span-2">
                <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1">
                  Abfahrt ab
                </label>
                <input
                  type="time"
                  value={depTime}
                  onChange={(e) => setDepTime(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-red-500 focus:bg-white"
                />
              </div>
            </div>

            {/* Quick Pick Hubs */}
            <div className="mt-3 pt-3 border-t border-gray-100 flex flex-wrap items-center gap-1.5 text-xs text-gray-500">
              <span className="font-medium text-gray-400">Beliebte Knoten:</span>
              {POPULAR_STATIONS.slice(0, 6).map((hub) => (
                <button
                  key={hub}
                  onClick={() => {
                    if (origin !== hub) setDestination(hub);
                  }}
                  className="px-2 py-0.5 bg-gray-100 hover:bg-red-50 hover:text-red-600 rounded text-gray-700 transition"
                >
                  {hub}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Main Connection Results List */}
      <div className="max-w-4xl mx-auto w-full px-4 py-6 flex-1">
        {/* Results Info Banner */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-base font-bold text-gray-800">
              Verbindungen: {origin} → {destination}
            </h3>
            <p className="text-xs text-gray-500">
              Fahrplan {activeYear} • Ab {depTime} Uhr • {connections.length} Verbindungen gefunden
            </p>
          </div>

          {useOptimizedSchedule && (
            <div className="bg-emerald-50 text-emerald-800 border border-emerald-200 px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1.5">
              <span>✓</span>
              <span>Knoten-Optimierung aktiv (HiGHS)</span>
            </div>
          )}
        </div>

        {/* Connections List */}
        {connections.length === 0 ? (
          <div className="bg-white rounded-xl p-10 text-center shadow-sm border border-gray-200">
            <div className="text-3xl mb-3">🚆</div>
            <h4 className="text-base font-semibold text-gray-700 mb-1">Keine direkte oder 1-Umstieg-Verbindung gefunden</h4>
            <p className="text-xs text-gray-500 max-w-md mx-auto">
              Für diese Route existieren keine Züge innerhalb des Suchzeitfensters. Bitte wähle andere Bahnhöfe oder passe die Abfahrtszeit an.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {connections.map((conn) => {
              const isExpanded = expandedConnId === conn.id;

              return (
                <div
                  key={conn.id}
                  className={`bg-white rounded-xl border transition-all shadow-sm overflow-hidden ${
                    isExpanded ? 'border-red-500 ring-2 ring-red-100' : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  {/* Connection Summary Card */}
                  <div
                    onClick={() => setExpandedConnId(isExpanded ? null : conn.id)}
                    className="p-4 cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  >
                    {/* Time & Route */}
                    <div className="flex items-center gap-6">
                      <div>
                        <div className="text-lg font-black text-gray-900 tracking-tight">
                          {conn.departureTime.slice(0, 5)} <span className="text-gray-400 font-normal">→</span> {conn.arrivalTime.slice(0, 5)}
                        </div>
                        <div className="text-xs text-gray-500 font-medium">
                          Dauer: <span className="font-semibold text-gray-700">{conn.totalDurationMinutes} Min.</span>
                          {conn.comparison && conn.comparison.durationDeltaMinutes < 0 && (
                            <span className="text-emerald-600 font-bold ml-1.5">
                              ({conn.comparison.durationDeltaMinutes} Min. schneller)
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Transfers Count */}
                      <div className="hidden sm:block text-xs">
                        {conn.transferCount === 0 ? (
                          <span className="text-emerald-700 bg-emerald-50 font-semibold px-2 py-0.5 rounded-full border border-emerald-200">
                            Direktfahrt
                          </span>
                        ) : (
                          <span className="text-gray-700 bg-gray-100 font-semibold px-2 py-0.5 rounded-full">
                            {conn.transferCount} Umstieg ({conn.transfers[0]?.station})
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Products / Line Badges & Badges */}
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {conn.legs.map((leg, lIdx) => (
                          <React.Fragment key={leg.lineId + lIdx}>
                            {lIdx > 0 && <span className="text-gray-300 text-xs">→</span>}
                            <span
                              style={{ backgroundColor: getCatColor(leg.category) }}
                              className="text-white text-xs font-bold px-2.5 py-1 rounded shadow-xs"
                            >
                              {leg.lineName}
                            </span>
                          </React.Fragment>
                        ))}
                      </div>

                      {/* Optimization Improvement Tag */}
                      {conn.comparison?.improvedTransfer && (
                        <span className="bg-amber-100 text-amber-800 text-[11px] font-bold px-2 py-0.5 rounded-full border border-amber-300">
                          ⚡ Anschluss gesichert ({conn.comparison.newTransferWait}m statt {conn.comparison.originalTransferWait}m)
                        </span>
                      )}

                      <span className="text-gray-400 text-xs ml-2">
                        {isExpanded ? '▲' : '▼'}
                      </span>
                    </div>
                  </div>

                  {/* Expanded Journey Timeline Details */}
                  {isExpanded && (
                    <div className="border-t border-gray-100 bg-gray-50/50 p-5">
                      <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-3 before:bottom-3 before:w-0.5 before:bg-gray-300">
                        {conn.legs.map((leg, idx) => {
                          const trans = conn.transfers[idx];

                          return (
                            <div key={leg.lineId + idx} className="relative">
                              {/* Leg Departure */}
                              <div className="relative flex items-start gap-3 mb-2">
                                <div className="absolute -left-6 top-1 w-3.5 h-3.5 rounded-full border-2 border-white bg-red-600 shadow-xs"></div>
                                <div>
                                  <div className="flex items-center gap-2">
                                    <span className="font-bold text-gray-900 text-sm">{leg.fromDeparture.slice(0, 5)}</span>
                                    <span className="font-bold text-gray-800 text-sm">{leg.fromStation}</span>
                                  </div>
                                  <div className="text-xs text-gray-500 flex items-center gap-2 mt-0.5">
                                    <span
                                      style={{ backgroundColor: getCatColor(leg.category) }}
                                      className="text-white font-bold px-1.5 py-0.2 rounded text-[10px]"
                                    >
                                      {leg.lineName}
                                    </span>
                                    <span>Richtung {leg.headsign}</span>
                                    <span>•</span>
                                    <span>Fahrzeit: {leg.durationMinutes} Min.</span>
                                  </div>
                                </div>
                              </div>

                              {/* Intermediate stops list */}
                              {leg.intermediateStops.length > 0 && (
                                <details className="my-2 ml-2 text-xs text-gray-500">
                                  <summary className="cursor-pointer hover:text-red-700 select-none font-medium">
                                    {leg.intermediateStops.length} Zwischenhalte anzeigen
                                  </summary>
                                  <div className="pl-3 py-1.5 border-l border-gray-300 mt-1 space-y-1">
                                    {leg.intermediateStops.map((st) => (
                                      <div key={st.name} className="flex items-center gap-3 text-gray-600">
                                        <span className="w-10 text-[11px] text-gray-400">
                                          {(st.departure || st.arrival).slice(0, 5)}
                                        </span>
                                        <span>{st.name}</span>
                                      </div>
                                    ))}
                                  </div>
                                </details>
                              )}

                              {/* Leg Arrival */}
                              <div className="relative flex items-start gap-3 mt-2">
                                <div className="absolute -left-6 top-1 w-3.5 h-3.5 rounded-full border-2 border-white bg-gray-600 shadow-xs"></div>
                                <div>
                                  <div className="flex items-center gap-2">
                                    <span className="font-bold text-gray-900 text-sm">{leg.toArrival.slice(0, 5)}</span>
                                    <span className="font-bold text-gray-800 text-sm">{leg.toStation}</span>
                                  </div>
                                </div>
                              </div>

                              {/* Transfer Node Info Box (if there is a next leg) */}
                              {trans && (
                                <div className="my-4 ml-2 p-3 bg-white rounded-lg border border-gray-200 shadow-xs">
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2 text-xs font-semibold text-gray-800">
                                      <span>🚶</span>
                                      <span>Umsteigen in {trans.station}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <span
                                        className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                                          trans.isOptimal
                                            ? 'bg-emerald-100 text-emerald-800'
                                            : trans.isKnapp
                                            ? 'bg-amber-100 text-amber-800'
                                            : 'bg-red-100 text-red-800'
                                        }`}
                                      >
                                        {trans.waitMinutes} Min. Umsteigezeit
                                      </span>
                                    </div>
                                  </div>

                                  {trans.isOptimal && (
                                    <p className="text-[11px] text-emerald-700 mt-1 flex items-center gap-1">
                                      <span>✓</span>
                                      <span>Optimaler ITF-Taktknotenanschluss (ausreichend Zeit für Gleiswechsel)</span>
                                    </p>
                                  )}
                                  {trans.isKnapp && (
                                    <p className="text-[11px] text-amber-700 mt-1">
                                      ⚠️ Knapper Anschluss (&lt; 4 Min.) – im Optimierer priorisiert für Verlängerung
                                    </p>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {/* Action buttons inside card */}
                      <div className="mt-5 pt-3 border-t border-gray-200 flex items-center justify-end gap-3">
                        <button
                          onClick={() => {
                            if (conn.legs[0]) {
                              const foundLine = rawLines.find((l) => l.id === conn.legs[0].lineId);
                              if (foundLine) {
                                setSelectedLine(foundLine);
                                setViewMode('editor');
                              }
                            }
                          }}
                          className="px-3 py-1.5 text-xs font-semibold bg-gray-100 hover:bg-gray-200 text-gray-700 rounded transition"
                        >
                          Linie im Editor öffnen
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default SbbTimetableSearch;
