import React, { useState, useMemo, useEffect } from 'react';
import type { Line, LineCategory } from '../types';
import { useFahrplanStore } from '../stores/fahrplanStore';
import { CATEGORY_COLORS } from '../utils/constants';

interface ImprovedTransfer {
  id: string;
  hub: string;
  fromLineId: string;
  fromLineName: string;
  fromCategory: string;
  fromHeadsign: string;
  fromArrival: string;
  toLineId: string;
  toLineName: string;
  toCategory: string;
  toHeadsign: string;
  toDeparture: string;
  originalWaitMinutes: number;
  optimizedWaitMinutes: number;
  waitDeltaMinutes: number;
  statusBefore: string;
  statusAfter: string;
  isImproved: boolean;
}

interface TravelMod {
  segmentKey: string;
  lineId: string;
  lineName: string;
  fromName: string;
  toName: string;
  originalTimeSeconds: number;
  addedTimeMinutes: number;
  newTimeSeconds: number;
  reason: string;
}

interface DepMod {
  lineId: string;
  lineName: string;
  headsign: string;
  stopId: string;
  stopName: string;
  originalDeparture: string;
  newDeparture: string;
  shiftMinutes: number;
  totalAddedRuntimeMinutes: number;
}

interface OptimizationResultsData {
  success: boolean;
  solverTimeSeconds: number;
  totalDurationSeconds: number;
  linesOptimized: number;
  totalTransfers: number;
  before: {
    optimal: number;
    knapp: number;
    broken: number;
    lang: number;
    optimalPct: number;
    avgWaitMinutes: number;
  };
  after: {
    optimal: number;
    knapp: number;
    broken: number;
    lang: number;
    optimalPct: number;
    avgWaitMinutes: number;
  };
  hubStatistics: Record<string, {
    before_optimal: number;
    before_knapp: number;
    before_broken: number;
    after_optimal: number;
    after_knapp: number;
    after_broken: number;
  }>;
  improvedTransfers: ImprovedTransfer[];
  allTransfers: ImprovedTransfer[];
  travelTimeModifications: TravelMod[];
  departureModifications: DepMod[];
}

function getCatColor(cat: string): string {
  return CATEGORY_COLORS[cat as LineCategory] || '#4A5568';
}

const OptimizedConnectionsView: React.FC = () => {
  const activeYear = useFahrplanStore((s) => s.activeYear);
  const data = useFahrplanStore((s) => s.data[activeYear]);
  const setSelectedLine = useFahrplanStore((s) => s.setSelectedLine);
  const setViewMode = useFahrplanStore((s) => s.setViewMode);
  const setStopDeparture = useFahrplanStore((s) => s.setStopDeparture);
  const setSegmentTravelTime = useFahrplanStore((s) => s.setSegmentTravelTime);

  const [optData, setOptData] = useState<OptimizationResultsData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [activeTab, setActiveTab] = useState<'improved' | 'travelMods' | 'depMods' | 'all'>('improved');
  const [selectedHub, setSelectedHub] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [appliedToStore, setAppliedToStore] = useState<boolean>(false);

  // Fetch optimization results
  useEffect(() => {
    setLoading(true);
    fetch('/data/2026/optimization_results.json')
      .then((res) => {
        if (!res.ok) throw new Error('Optimierungsdaten nicht gefunden');
        return res.json();
      })
      .then((json: OptimizationResultsData) => {
        setOptData(json);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  // Unique list of hubs in results
  const hubsList = useMemo(() => {
    if (!optData?.hubStatistics) return [];
    return Object.keys(optData.hubStatistics).sort();
  }, [optData]);

  // Filtered improved transfers
  const filteredImproved = useMemo(() => {
    if (!optData?.improvedTransfers) return [];
    let list = optData.improvedTransfers;

    if (selectedHub !== 'all') {
      list = list.filter((t) => t.hub.toLowerCase() === selectedHub.toLowerCase());
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (t) =>
          t.fromLineName.toLowerCase().includes(q) ||
          t.toLineName.toLowerCase().includes(q) ||
          t.hub.toLowerCase().includes(q) ||
          t.fromHeadsign.toLowerCase().includes(q) ||
          t.toHeadsign.toLowerCase().includes(q)
      );
    }
    return list;
  }, [optData, selectedHub, searchQuery]);

  // Filtered all transfers
  const filteredAll = useMemo(() => {
    if (!optData?.allTransfers) return [];
    let list = optData.allTransfers;

    if (selectedHub !== 'all') {
      list = list.filter((t) => t.hub.toLowerCase() === selectedHub.toLowerCase());
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (t) =>
          t.fromLineName.toLowerCase().includes(q) ||
          t.toLineName.toLowerCase().includes(q) ||
          t.hub.toLowerCase().includes(q) ||
          t.fromHeadsign.toLowerCase().includes(q) ||
          t.toHeadsign.toLowerCase().includes(q)
      );
    }
    return list;
  }, [optData, selectedHub, searchQuery]);

  // Filtered travel time modifications (Fahrzeitverlängerungen)
  const filteredTravelMods = useMemo(() => {
    if (!optData?.travelTimeModifications) return [];
    let list = optData.travelTimeModifications;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (m) =>
          m.lineName.toLowerCase().includes(q) ||
          m.fromName.toLowerCase().includes(q) ||
          m.toName.toLowerCase().includes(q)
      );
    }
    return list;
  }, [optData, searchQuery]);

  // Filtered departure modifications
  const filteredDepMods = useMemo(() => {
    if (!optData?.departureModifications) return [];
    let list = optData.departureModifications;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (m) =>
          m.lineName.toLowerCase().includes(q) ||
          m.stopName.toLowerCase().includes(q) ||
          m.headsign.toLowerCase().includes(q)
      );
    }
    return list;
  }, [optData, searchQuery]);

  // Load into live store
  const handleApplyToLiveStore = () => {
    if (!optData) return;
    
    // Apply departure mods to store
    for (const d of optData.departureModifications) {
      useFahrplanStore.getState().addDepartureMod({
        lineId: d.lineId,
        stopId: d.stopId,
        originalDeparture: d.originalDeparture,
        newDeparture: d.newDeparture,
      });
    }

    // Apply travel time mods to store
    for (const t of optData.travelTimeModifications) {
      useFahrplanStore.getState().addTravelTimeMod({
        segmentKey: t.segmentKey,
        originalTime: t.originalTimeSeconds,
        newTime: t.newTimeSeconds,
        reason: t.reason,
        isInfrastructure: false,
      });
    }

    setAppliedToStore(true);
  };

  const handleOpenLine = (lineId: string) => {
    const l = data.lines.find((line) => line.id === lineId);
    if (l) {
      setSelectedLine(l);
      setViewMode('editor');
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600 mx-auto mb-3"></div>
          <p className="text-gray-600 font-medium">Optimierte Verbindungen werden geladen...</p>
        </div>
      </div>
    );
  }

  if (error || !optData) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50 p-6">
        <div className="bg-white p-8 rounded-xl shadow-md max-w-lg text-center border border-gray-200">
          <div className="text-3xl mb-3">⚠️</div>
          <h3 className="text-lg font-bold text-gray-800 mb-2">Keine Optimierungsdaten gefunden</h3>
          <p className="text-sm text-gray-600 mb-4">
            Die Datei <code>public/data/2026/optimization_results.json</code> wurde noch nicht generiert.
            Führe das Skript aus:
          </p>
          <pre className="bg-gray-900 text-green-400 p-3 rounded text-xs text-left overflow-x-auto mb-4">
            python3 optimize_timetable.py --categories "IC,IR,RE"
          </pre>
        </div>
      </div>
    );
  }

  const { before, after, linesOptimized, totalTransfers, solverTimeSeconds } = optData;
  const gainedOptimal = after.optimal - before.optimal;

  return (
    <div className="flex-1 flex flex-col h-full bg-gray-50 overflow-y-auto">
      {/* Top Banner & KPI Executive Summary */}
      <div className="bg-gradient-to-r from-red-700 via-red-800 to-red-900 text-white px-6 py-6 shadow-md">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="bg-amber-400 text-gray-950 text-xs font-black px-2 py-0.5 rounded tracking-wide uppercase">
                  HiGHS MIP Solver
                </span>
                <span className="text-xs text-red-200 font-medium">
                  Berechnet in {solverTimeSeconds}s • Fahrplan {activeYear}
                </span>
              </div>
              <h2 className="text-2xl font-black tracking-tight text-white">
                Optimierte Verbindungen & Taktknoten Schweiz
              </h2>
              <p className="text-xs text-red-100 max-w-2xl mt-1">
                Visualisierung aller optimierten Zuganschlüsse, Linienverschiebungen und Fahrzeitpuffer ohne Fahrzeitverkürzungen.
              </p>
            </div>

            {/* Apply to live app button */}
            <div>
              <button
                onClick={handleApplyToLiveStore}
                disabled={appliedToStore}
                className={`px-4 py-2 rounded-lg text-xs font-bold transition shadow-md flex items-center gap-2 ${
                  appliedToStore
                    ? 'bg-emerald-500 text-white cursor-default'
                    : 'bg-white text-red-800 hover:bg-red-50 hover:shadow-lg'
                }`}
              >
                <span>{appliedToStore ? '✓' : '⚡'}</span>
                <span>{appliedToStore ? 'In Live-Fahrplan aktiv' : 'In Live-Fahrplan übernehmen'}</span>
              </button>
            </div>
          </div>

          {/* 4 KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-gray-900">
            {/* KPI 1 */}
            <div className="bg-white rounded-xl p-3.5 shadow-sm border border-red-200/40">
              <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider block mb-1">
                Optimale Taktanschlüsse
              </span>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-black text-gray-900">{after.optimal}</span>
                <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">
                  +{gainedOptimal} (+{((after.optimalPct - before.optimalPct)).toFixed(1)}%)
                </span>
              </div>
              <div className="text-[11px] text-gray-500 mt-1">
                Erfolgsquote: <span className="font-semibold text-gray-700">{after.optimalPct}%</span> (vorher {before.optimalPct}%)
              </div>
            </div>

            {/* KPI 2 */}
            <div className="bg-white rounded-xl p-3.5 shadow-sm border border-red-200/40">
              <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider block mb-1">
                Knappe Anschlüsse behoben
              </span>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-black text-gray-900">{after.knapp}</span>
                <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">
                  -{before.knapp - after.knapp} (-{Math.round(((before.knapp - after.knapp)/before.knapp)*100)}%)
                </span>
              </div>
              <div className="text-[11px] text-gray-500 mt-1">
                Von {before.knapp} kritischen Anschlüssen auf {after.knapp} gesenkt
              </div>
            </div>

            {/* KPI 3 */}
            <div className="bg-white rounded-xl p-3.5 shadow-sm border border-red-200/40">
              <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider block mb-1">
                Mittlere Umsteigezeit
              </span>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-black text-gray-900">{after.avgWaitMinutes} min</span>
                <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">
                  -{(before.avgWaitMinutes - after.avgWaitMinutes).toFixed(1)} min
                </span>
              </div>
              <div className="text-[11px] text-gray-500 mt-1">
                Vorher: {before.avgWaitMinutes} min durchschnittlich
              </div>
            </div>

            {/* KPI 4 */}
            <div className="bg-white rounded-xl p-3.5 shadow-sm border border-red-200/40">
              <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider block mb-1">
                Fahrzeitpuffer & Shifts
              </span>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-black text-gray-900">{optData.travelTimeModifications.length}</span>
                <span className="text-xs text-gray-500">Puffer</span>
              </div>
              <div className="text-[11px] text-gray-500 mt-1">
                {optData.departureModifications.length} Abfahrtszeiten feinjustiert
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="max-w-6xl mx-auto w-full px-4 py-6 flex-1 flex flex-col">
        {/* Hub Selector Pills */}
        <div className="mb-5 bg-white p-3 rounded-xl border border-gray-200 shadow-xs">
          <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
            <span className="text-xs font-bold text-gray-700 uppercase tracking-wide">
              Knotenbahnhof filtern:
            </span>
            <span className="text-xs text-gray-400">
              {hubsList.length} analysierte Hauptknoten
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setSelectedHub('all')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
                selectedHub === 'all'
                  ? 'bg-red-600 text-white shadow-xs'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Alle Bahnhöfe ({optData.improvedTransfers.length} Verbesserungen)
            </button>
            {hubsList.map((h) => {
              const stats = optData.hubStatistics[h];
              const gained = stats ? stats.after_optimal - stats.before_optimal : 0;
              return (
                <button
                  key={h}
                  onClick={() => setSelectedHub(h)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition flex items-center gap-1.5 ${
                    selectedHub === h
                      ? 'bg-red-600 text-white shadow-xs font-semibold'
                      : 'bg-gray-50 text-gray-700 hover:bg-gray-100 border border-gray-200'
                  }`}
                >
                  <span>{h}</span>
                  {gained > 0 && (
                    <span className={`text-[10px] px-1 py-0.2 rounded font-bold ${
                      selectedHub === h ? 'bg-white/20 text-white' : 'bg-emerald-100 text-emerald-800'
                    }`}>
                      +{gained}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* View Tabs & Search Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          {/* Tabs */}
          <div className="flex bg-gray-200 p-1 rounded-lg text-xs font-semibold">
            <button
              onClick={() => setActiveTab('improved')}
              className={`px-3 py-1.5 rounded-md transition flex items-center gap-1.5 ${
                activeTab === 'improved' ? 'bg-white text-gray-900 shadow-xs' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <span>⚡</span>
              <span>Neu gesicherte Anschlüsse ({filteredImproved.length})</span>
            </button>
            <button
              onClick={() => setActiveTab('travelMods')}
              className={`px-3 py-1.5 rounded-md transition flex items-center gap-1.5 ${
                activeTab === 'travelMods' ? 'bg-white text-gray-900 shadow-xs' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <span>🕒</span>
              <span>Fahrzeitpuffer ({filteredTravelMods.length})</span>
            </button>
            <button
              onClick={() => setActiveTab('depMods')}
              className={`px-3 py-1.5 rounded-md transition flex items-center gap-1.5 ${
                activeTab === 'depMods' ? 'bg-white text-gray-900 shadow-xs' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <span>↔</span>
              <span>Abfahrtsverschiebungen ({filteredDepMods.length})</span>
            </button>
            <button
              onClick={() => setActiveTab('all')}
              className={`px-3 py-1.5 rounded-md transition flex items-center gap-1.5 ${
                activeTab === 'all' ? 'bg-white text-gray-900 shadow-xs' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <span>Alle Anschlüsse ({filteredAll.length})</span>
            </button>
          </div>

          {/* Search box */}
          <div className="relative w-full sm:w-64">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Linie oder Bahnhof suchen..."
              className="w-full pl-8 pr-3 py-1.5 bg-white border border-gray-300 rounded-lg text-xs font-medium focus:outline-none focus:ring-2 focus:ring-red-500"
            />
            <span className="absolute left-2.5 top-1.5 text-gray-400 text-xs">🔍</span>
          </div>
        </div>

        {/* Tab 1: Improved Connections List */}
        {activeTab === 'improved' && (
          <div className="space-y-2.5">
            {filteredImproved.length === 0 ? (
              <div className="bg-white p-8 rounded-xl text-center border border-gray-200">
                <p className="text-gray-500 text-sm">Keine Anschlüsse für diese Filterkriterien gefunden.</p>
              </div>
            ) : (
              filteredImproved.map((t) => (
                <div
                  key={t.id}
                  className="bg-white rounded-xl border border-gray-200 hover:border-red-400 transition-all p-4 shadow-xs"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    {/* Left: Hub badge & Connection details */}
                    <div className="flex items-start sm:items-center gap-3">
                      <div className="bg-gray-100 text-gray-800 font-bold text-xs px-2.5 py-1 rounded-md border border-gray-200 min-w-24 text-center">
                        {t.hub}
                      </div>

                      <div className="flex items-center gap-2 flex-wrap">
                        {/* Arriving Line */}
                        <div className="flex items-center gap-1.5">
                          <span
                            style={{ backgroundColor: getCatColor(t.fromCategory) }}
                            className="text-white text-xs font-black px-2 py-0.5 rounded shadow-2xs"
                          >
                            {t.fromLineName}
                          </span>
                          <span className="text-xs text-gray-600">
                            (an <span className="font-bold text-gray-800">{t.fromArrival.slice(0, 5)}</span>)
                          </span>
                        </div>

                        <span className="text-gray-400 font-bold">➔</span>

                        {/* Departing Line */}
                        <div className="flex items-center gap-1.5">
                          <span
                            style={{ backgroundColor: getCatColor(t.toCategory) }}
                            className="text-white text-xs font-black px-2 py-0.5 rounded shadow-2xs"
                          >
                            {t.toLineName}
                          </span>
                          <span className="text-xs text-gray-600">
                            (ab <span className="font-bold text-gray-800">{t.toDeparture.slice(0, 5)}</span> nach {t.toHeadsign})
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Right: Before vs After Badge & Gains */}
                    <div className="flex items-center gap-3 self-end sm:self-auto">
                      <div className="text-right">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-400 line-through">
                            {t.originalWaitMinutes}m ({t.statusBefore})
                          </span>
                          <span className="text-xs font-bold text-emerald-800 bg-emerald-100 border border-emerald-300 px-2 py-0.5 rounded-full flex items-center gap-1">
                            <span>✓</span>
                            <span>{t.optimizedWaitMinutes} min optimal</span>
                          </span>
                        </div>
                        <div className="text-[11px] text-emerald-600 font-semibold mt-0.5">
                          +{t.waitDeltaMinutes} Min. Pufferzeit
                        </div>
                      </div>

                      <button
                        onClick={() => handleOpenLine(t.fromLineId)}
                        className="px-2.5 py-1 bg-gray-50 hover:bg-gray-100 text-gray-700 text-xs font-medium rounded border border-gray-200 transition"
                        title="Im Editor öffnen"
                      >
                        Editor
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Tab 2: Travel Time Modifications (Puffer) */}
        {activeTab === 'travelMods' && (
          <div className="space-y-2">
            <div className="bg-amber-50 border border-amber-200 text-amber-900 p-3 rounded-lg text-xs font-medium mb-3">
              💡 Diese Fahrzeitverlängerungen wurden gezielt als Pufferzeiten eingefügt, um die Züge exakt zur ITF-Knotenminute eintreffen zu lassen.
            </div>
            {filteredTravelMods.map((m, idx) => (
              <div key={idx} className="bg-white p-3.5 rounded-xl border border-gray-200 shadow-xs flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="bg-gray-800 text-white text-xs font-bold px-2 py-0.5 rounded">
                    {m.lineName}
                  </span>
                  <div>
                    <div className="text-xs font-bold text-gray-800">
                      {m.fromName} ➔ {m.toName}
                    </div>
                    <div className="text-[11px] text-gray-500">
                      {m.reason}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <span className="text-xs font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full border border-amber-300">
                      +{m.addedTimeMinutes} Min. Fahrzeitpuffer
                    </span>
                    <div className="text-[11px] text-gray-400 mt-0.5">
                      {Math.round(m.originalTimeSeconds / 60)} min ➔ {Math.round(m.newTimeSeconds / 60)} min
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Tab 3: Departure Modifications */}
        {activeTab === 'depMods' && (
          <div className="space-y-2">
            {filteredDepMods.map((m, idx) => (
              <div key={idx} className="bg-white p-3.5 rounded-xl border border-gray-200 shadow-xs flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="bg-gray-800 text-white text-xs font-bold px-2 py-0.5 rounded">
                    {m.lineName}
                  </span>
                  <div>
                    <div className="text-xs font-bold text-gray-800">
                      {m.stopName} (Richtung {m.headsign})
                    </div>
                    <div className="text-[11px] text-gray-500">
                      Abfahrt: {m.originalDeparture} ➔ <span className="font-bold text-gray-700">{m.newDeparture}</span>
                    </div>
                  </div>
                </div>
                <div>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                    m.shiftMinutes > 0
                      ? 'bg-blue-100 text-blue-800'
                      : m.shiftMinutes < 0
                      ? 'bg-purple-100 text-purple-800'
                      : 'bg-gray-100 text-gray-800'
                  }`}>
                    {m.shiftMinutes > 0 ? `+${m.shiftMinutes}` : m.shiftMinutes} min Shift
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Tab 4: All Analyzed Transfers */}
        {activeTab === 'all' && (
          <div className="space-y-2">
            {filteredAll.slice(0, 100).map((t) => (
              <div key={t.id} className="bg-white p-3 rounded-xl border border-gray-200 text-xs flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-gray-600 w-24">{t.hub}</span>
                  <span className="font-bold text-gray-900">{t.fromLineName}</span>
                  <span className="text-gray-400">➔</span>
                  <span className="font-bold text-gray-900">{t.toLineName}</span>
                  <span className="text-gray-500">({t.toHeadsign})</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded-full font-bold text-[11px] ${
                    t.statusAfter === 'optimal'
                      ? 'bg-emerald-100 text-emerald-800'
                      : t.statusAfter === 'knapp'
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-gray-100 text-gray-700'
                  }`}>
                    {t.optimizedWaitMinutes} Min ({t.statusAfter})
                  </span>
                </div>
              </div>
            ))}
            {filteredAll.length > 100 && (
              <p className="text-center text-xs text-gray-400 py-2">
                ... und {filteredAll.length - 100} weitere Anschlüsse
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default OptimizedConnectionsView;
