import React, { useState, useMemo } from 'react';
import type { Line, Station, LineCategory } from '../types';
import { useFahrplanStore } from '../stores/fahrplanStore';
import { CATEGORY_COLORS, formatDuration, formatTime } from '../utils/constants';

function getCatColor(cat: string): string {
  return CATEGORY_COLORS[cat as LineCategory] || '#666';
}
import { analyzeStationConnections, type StationConnection } from '../utils/connections';
import { getStationTaktProfile, type TaktNodeType } from '../utils/knoten';

const MAJOR_HUBS = [
  'Zürich HB', 'Bern', 'Olten', 'Basel SBB', 'Luzern', 'Winterthur',
  'Biel/Bienne', 'St. Gallen', 'Lausanne', 'Genève', 'Chur', 'Bellinzona',
  'Lugano', 'Aarau', 'Zug', 'Arth-Goldau', 'Thun', 'Spiez', 'Fribourg/Freiburg',
  'Neuchâtel', 'Schaffhausen', 'Baden', 'Visp', 'Brig',
];

const ConnectionChecker: React.FC = () => {
  const activeYear = useFahrplanStore((s) => s.activeYear);
  const data = useFahrplanStore((s) => s.data[activeYear]);
  const selectedStation = useFahrplanStore((s) => s.selectedStation);
  const setSelectedStation = useFahrplanStore((s) => s.setSelectedStation);
  const setSelectedLine = useFahrplanStore((s) => s.setSelectedLine);
  const setViewMode = useFahrplanStore((s) => s.setViewMode);
  const getModifiedLine = useFahrplanStore((s) => s.getModifiedLine);

  const { stations, lines: rawLines } = data;

  // Selected station for analysis (defaults to selectedStation or Olten)
  const [activeStationName, setActiveStationName] = useState<string>(
    selectedStation?.name || 'Olten'
  );

  const [minTransferTime, setMinTransferTime] = useState<number>(4);
  const [nodeFilter, setNodeFilter] = useState<TaktNodeType | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'gebrochen' | 'knapp' | 'optimal'>('all');
  const [stationSearch, setStationSearch] = useState<string>('');

  // Compute calculated (modified) lines so user modifications reflect live!
  const modifiedLines = useMemo(() => {
    return rawLines.map((l) => getModifiedLine(l));
  }, [rawLines, getModifiedLine]);

  // Available hub stations for dropdown / selector
  const availableHubs = useMemo(() => {
    const list = stations.filter((s) => s.isHub);
    if (list.length > 0) return list;
    return stations.filter((s) => MAJOR_HUBS.some((h) => s.name.toLowerCase().includes(h.toLowerCase())));
  }, [stations]);

  // Run the connection analysis
  const analysis = useMemo(() => {
    return analyzeStationConnections(
      activeStationName,
      modifiedLines,
      rawLines,
      minTransferTime,
      nodeFilter
    );
  }, [activeStationName, modifiedLines, rawLines, minTransferTime, nodeFilter]);

  // Station Takt profile
  const stationProfile = useMemo(() => {
    return getStationTaktProfile(activeStationName, modifiedLines);
  }, [activeStationName, modifiedLines]);

  // Filtered connections by status
  const displayedConnections = useMemo(() => {
    if (statusFilter === 'all') return analysis.connections;
    return analysis.connections.filter((c) => c.status === statusFilter);
  }, [analysis.connections, statusFilter]);

  const handleSelectStation = (name: string) => {
    setActiveStationName(name);
    const st = stations.find((s) => s.name.toLowerCase() === name.toLowerCase());
    if (st) setSelectedStation(st);
  };

  const handleOpenLineInEditor = (lineId: string) => {
    const l = modifiedLines.find((line) => line.id === lineId);
    if (l) {
      setSelectedLine(l);
      setViewMode('editor');
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-gray-50 overflow-y-auto">
      {/* Top Header & Station Picker */}
      <div className="bg-white border-b border-gray-200 p-4 shadow-xs sticky top-0 z-20">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl">🔄</span>
              <h2 className="text-lg font-bold text-gray-900">
                Anschluss-Prüfung an Knotenbahnhöfen
              </h2>
              <span className="bg-blue-100 text-blue-800 text-xs font-bold px-2 py-0.5 rounded-full">
                {activeYear}
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              Prüfe Umsteigezeiten und Taktanschlüsse zwischen eintreffenden und abfahrenden Zügen am Knoten
            </p>
          </div>

          {/* Station selector */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-medium text-gray-600">Knotenbahnhof:</span>
            <div className="relative">
              <select
                value={activeStationName}
                onChange={(e) => handleSelectStation(e.target.value)}
                className="px-3 py-1.5 text-sm font-bold bg-white border border-gray-300 rounded-lg shadow-xs focus:ring-2 focus:ring-blue-400 focus:border-transparent text-gray-900"
              >
                <optgroup label="Hauptknoten">
                  {MAJOR_HUBS.map((hub) => (
                    <option key={hub} value={hub}>
                      {hub}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Weitere Stationen">
                  {availableHubs
                    .filter((h) => !MAJOR_HUBS.includes(h.name))
                    .slice(0, 40)
                    .map((h) => (
                      <option key={h.id} value={h.name}>
                        {h.name}
                      </option>
                    ))}
                </optgroup>
              </select>
            </div>

            {/* Quick quick-select buttons for frequent hubs */}
            <div className="flex gap-1">
              {['Olten', 'Zürich HB', 'Bern', 'Basel SBB'].map((hub) => (
                <button
                  key={hub}
                  onClick={() => handleSelectStation(hub)}
                  className={`px-2 py-1 text-xs rounded-md font-medium transition-colors ${
                    activeStationName === hub
                      ? 'bg-gray-900 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {hub}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Takt Profile & Settings Bar */}
        <div className="mt-4 flex items-center justify-between flex-wrap gap-3 pt-3 border-t border-gray-100 text-xs">
          {/* Classification */}
          <div className="flex items-center gap-2">
            <span className="font-bold text-gray-800 text-sm">{activeStationName}</span>
            <span className="bg-amber-100 text-amber-900 font-bold px-2 py-0.5 rounded text-[11px] border border-amber-200">
              {stationProfile.classification}
            </span>
          </div>

          {/* Node Filter Pills */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-gray-500 font-medium">Knotenzeit:</span>
            <button
              onClick={() => setNodeFilter('all')}
              className={`px-2 py-1 rounded text-xs font-semibold ${
                nodeFilter === 'all'
                  ? 'bg-gray-800 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              Alle ({analysis.connections.length})
            </button>
            <button
              onClick={() => setNodeFilter('um')}
              className={`px-2 py-1 rounded text-xs font-bold border ${
                nodeFilter === 'um'
                  ? 'bg-emerald-600 text-white border-emerald-700 shadow-xs'
                  : 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
              }`}
            >
              .00 Um ({stationProfile.nodeCounts.um})
            </button>
            <button
              onClick={() => setNodeFilter('halb')}
              className={`px-2 py-1 rounded text-xs font-bold border ${
                nodeFilter === 'halb'
                  ? 'bg-blue-600 text-white border-blue-700 shadow-xs'
                  : 'bg-blue-50 text-blue-800 border-blue-200 hover:bg-blue-100'
              }`}
            >
              .30 Halb ({stationProfile.nodeCounts.halb})
            </button>
            <button
              onClick={() => setNodeFilter('viertel_ab')}
              className={`px-2 py-1 rounded text-xs font-bold border ${
                nodeFilter === 'viertel_ab'
                  ? 'bg-amber-600 text-white border-amber-700 shadow-xs'
                  : 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100'
              }`}
            >
              .15 Viertel ab ({stationProfile.nodeCounts.viertel_ab})
            </button>
            <button
              onClick={() => setNodeFilter('viertel_vor')}
              className={`px-2 py-1 rounded text-xs font-bold border ${
                nodeFilter === 'viertel_vor'
                  ? 'bg-purple-600 text-white border-purple-700 shadow-xs'
                  : 'bg-purple-50 text-purple-800 border-purple-200 hover:bg-purple-100'
              }`}
            >
              .45 Viertel vor ({stationProfile.nodeCounts.viertel_vor})
            </button>
          </div>

          {/* Minimum Transfer Time Slider */}
          <div className="flex items-center gap-2 bg-gray-100 px-3 py-1.5 rounded-lg">
            <span className="text-gray-600 font-medium">Mindestumsteigezeit:</span>
            <input
              type="range"
              min={2}
              max={8}
              step={1}
              value={minTransferTime}
              onChange={(e) => setMinTransferTime(parseInt(e.target.value, 10))}
              className="w-20 accent-blue-600 cursor-pointer"
            />
            <span className="font-bold text-gray-900 w-8">{minTransferTime} min</span>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-4 max-w-7xl mx-auto w-full">
        {/* KPI Scorecard */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
          {/* Quality */}
          <div className="bg-white p-3 rounded-xl border border-gray-200 shadow-xs">
            <div className="text-xs text-gray-500 font-medium">Anschluss-Qualität</div>
            <div className="text-2xl font-black text-gray-900 mt-1">
              {analysis.qualityPercent}%
            </div>
            <div className="w-full bg-gray-200 h-1.5 rounded-full mt-2 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  analysis.qualityPercent >= 85
                    ? 'bg-emerald-500'
                    : analysis.qualityPercent >= 70
                    ? 'bg-amber-500'
                    : 'bg-red-500'
                }`}
                style={{ width: `${analysis.qualityPercent}%` }}
              />
            </div>
          </div>

          {/* Optimal */}
          <div
            onClick={() => setStatusFilter(statusFilter === 'optimal' ? 'all' : 'optimal')}
            className={`p-3 rounded-xl border cursor-pointer transition-all ${
              statusFilter === 'optimal'
                ? 'bg-emerald-100 border-emerald-400 ring-2 ring-emerald-300'
                : 'bg-white border-emerald-200 hover:bg-emerald-50/50'
            }`}
          >
            <div className="text-xs text-emerald-700 font-bold flex items-center justify-between">
              <span>Optimal ({minTransferTime}–15 min)</span>
              <span>✅</span>
            </div>
            <div className="text-2xl font-black text-emerald-800 mt-1">
              {analysis.optimalCount}
            </div>
            <div className="text-[10px] text-emerald-600 mt-1">Garantierter Umstieg</div>
          </div>

          {/* Knapp */}
          <div
            onClick={() => setStatusFilter(statusFilter === 'knapp' ? 'all' : 'knapp')}
            className={`p-3 rounded-xl border cursor-pointer transition-all ${
              statusFilter === 'knapp'
                ? 'bg-amber-100 border-amber-400 ring-2 ring-amber-300'
                : 'bg-white border-amber-200 hover:bg-amber-50/50'
            }`}
          >
            <div className="text-xs text-amber-700 font-bold flex items-center justify-between">
              <span>Knapp (1–{minTransferTime - 1} min)</span>
              <span>⚠️</span>
            </div>
            <div className="text-2xl font-black text-amber-800 mt-1">
              {analysis.knappCount}
            </div>
            <div className="text-[10px] text-amber-600 mt-1">Verspätungsgefährdet</div>
          </div>

          {/* Gebrochen */}
          <div
            onClick={() => setStatusFilter(statusFilter === 'gebrochen' ? 'all' : 'gebrochen')}
            className={`p-3 rounded-xl border cursor-pointer transition-all ${
              statusFilter === 'gebrochen'
                ? 'bg-red-100 border-red-400 ring-2 ring-red-300'
                : 'bg-white border-red-200 hover:bg-red-50/50'
            }`}
          >
            <div className="text-xs text-red-700 font-bold flex items-center justify-between">
              <span>Gebrochen / Verpasst</span>
              <span>❌</span>
            </div>
            <div className="text-2xl font-black text-red-800 mt-1">
              {analysis.brokenCount}
            </div>
            <div className="text-[10px] text-red-600 mt-1">Abfahrt vor Ankunft</div>
          </div>

          {/* Saved by Mods */}
          <div className="bg-white p-3 rounded-xl border border-emerald-300 bg-emerald-50/30">
            <div className="text-xs text-emerald-800 font-bold">Durch Modifikation gerettet</div>
            <div className="text-2xl font-black text-emerald-700 mt-1">
              +{analysis.improvedCount}
            </div>
            <div className="text-[10px] text-emerald-600 mt-1">Neu erreichte Anschlüsse</div>
          </div>

          {/* Broken by Mods */}
          <div className="bg-white p-3 rounded-xl border border-red-200 bg-red-50/30">
            <div className="text-xs text-red-800 font-bold">Durch Modifikation verloren</div>
            <div className="text-2xl font-black text-red-700 mt-1">
              {analysis.brokenByModCount}
            </div>
            <div className="text-[10px] text-red-600 mt-1">Zuvor bestehende Anschlüsse</div>
          </div>
        </div>

        {/* Visual Bildfahrplan / Zeitleiste (Grafischer Anschluss-Fahrplan) */}
        <section className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide flex items-center gap-2">
                <span>Grafischer Anschluss-Fahrplan (Zeitscheibe {nodeFilter === 'all' ? 'Taktstunde' : nodeFilter.toUpperCase()})</span>
              </h3>
              <p className="text-xs text-gray-500">
                Visualisierung der Ankünfte (links) und Abfahrten (rechts) am Knoten {activeStationName}
              </p>
            </div>
          </div>

          {/* Timeline visualization */}
          <div className="relative border border-gray-200 rounded-lg p-3 bg-gradient-to-b from-gray-50 to-white overflow-x-auto">
            <div className="min-w-[700px]">
              {/* Hour marker scale :00 to :59 */}
              <div className="flex justify-between text-[11px] text-gray-400 font-mono border-b border-gray-200 pb-1 mb-3">
                <span className="font-bold text-emerald-700">:00 (Um)</span>
                <span>:10</span>
                <span className="font-bold text-amber-700">:15 (Viertel ab)</span>
                <span>:20</span>
                <span className="font-bold text-blue-700">:30 (Halb)</span>
                <span>:40</span>
                <span className="font-bold text-purple-700">:45 (Viertel vor)</span>
                <span>:55</span>
                <span className="font-bold text-emerald-700">:00</span>
              </div>

              {/* Sample visual connection bars */}
              <div className="space-y-2 max-h-60 overflow-y-auto pr-2">
                {displayedConnections.slice(0, 15).map((conn) => {
                  const arrPct = Math.max(0, Math.min(100, (conn.fromArrivalMinute / 60) * 100));
                  const depPct = Math.max(0, Math.min(100, (conn.toDepartureMinute / 60) * 100));
                  const leftPct = Math.min(arrPct, depPct);
                  const widthPct = Math.max(2, Math.abs(depPct - arrPct));

                  const barColor =
                    conn.status === 'optimal'
                      ? 'bg-emerald-500 text-emerald-950'
                      : conn.status === 'knapp'
                      ? 'bg-amber-400 text-amber-950'
                      : conn.status === 'gebrochen'
                      ? 'bg-red-500 text-white'
                      : 'bg-blue-300 text-blue-950';

                  return (
                    <div
                      key={conn.id}
                      className="group flex items-center text-xs py-1 hover:bg-blue-50/60 rounded px-1.5 transition-colors"
                    >
                      {/* From Line info (Arrival: Where it came from!) */}
                      <div className="w-56 shrink-0 flex items-center gap-1.5 truncate">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: getCatColor(conn.fromCategory) }}
                        />
                        <button
                          type="button"
                          onClick={() => handleOpenLineInEditor(conn.fromLineId)}
                          className="font-bold text-gray-900 hover:text-blue-600 hover:underline cursor-pointer"
                          title="Ankommende Linie im Editor öffnen"
                        >
                          {conn.fromCategory} {conn.fromLineName}
                        </button>
                        <span className="text-[11px] text-gray-500 truncate" title={`Start: ${conn.fromOrigin}`}>
                          (von {conn.fromOrigin})
                        </span>
                        <span className="text-[10px] text-gray-600 font-mono ml-auto">
                          {formatTime(conn.fromArrivalTime)}
                        </span>
                      </div>

                      {/* Visual Time Bar */}
                      <div className="flex-1 relative h-5 mx-2 bg-gray-100 rounded overflow-hidden">
                        <div
                          className={`absolute top-0 bottom-0 rounded flex items-center justify-center font-bold text-[10px] px-1 ${barColor}`}
                          style={{
                            left: `${leftPct}%`,
                            width: `${widthPct}%`,
                            minWidth: '24px',
                          }}
                          title={`Umsteigezeit: ${conn.transferMinutes} min (${conn.status})`}
                        >
                          {conn.transferMinutes}m
                        </div>
                      </div>

                      {/* To Line info (Departure: Where it is heading!) */}
                      <div className="w-56 shrink-0 flex items-center justify-end gap-1.5 truncate text-right">
                        <span className="text-[10px] text-gray-600 font-mono mr-auto">
                          {formatTime(conn.toDepartureTime)}
                        </span>
                        <span className="text-[11px] text-gray-500 truncate" title={`Ziel: ${conn.toDestination}`}>
                          (nach {conn.toDestination})
                        </span>
                        <button
                          type="button"
                          onClick={() => handleOpenLineInEditor(conn.toLineId)}
                          className="font-bold text-gray-900 hover:text-blue-600 hover:underline cursor-pointer"
                          title="Abfahrende Linie im Editor öffnen"
                        >
                          {conn.toCategory} {conn.toLineName}
                        </button>
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: getCatColor(conn.toCategory) }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        {/* Detailed Connections Table */}
        <section className="bg-white rounded-xl border border-gray-200 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-gray-200 flex items-center justify-between flex-wrap gap-2">
            <div>
              <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide">
                Verbindungs-Matrix ({displayedConnections.length} von {analysis.connections.length})
              </h3>
              <p className="text-xs text-gray-500">
                Wähle die ankommende oder abfahrende Linie zur gezielten Optimierung im Fahrplan-Editor
              </p>
            </div>

            {/* Status Filter buttons */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => setStatusFilter('all')}
                className={`px-2.5 py-1 text-xs rounded-lg font-medium transition-colors ${
                  statusFilter === 'all'
                    ? 'bg-gray-800 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                Alle
              </button>
              <button
                onClick={() => setStatusFilter('gebrochen')}
                className={`px-2.5 py-1 text-xs rounded-lg font-bold border transition-colors ${
                  statusFilter === 'gebrochen'
                    ? 'bg-red-600 text-white border-red-700'
                    : 'bg-red-50 text-red-800 border-red-200 hover:bg-red-100'
                }`}
              >
                ❌ Nur Gebrochen ({analysis.brokenCount})
              </button>
              <button
                onClick={() => setStatusFilter('knapp')}
                className={`px-2.5 py-1 text-xs rounded-lg font-bold border transition-colors ${
                  statusFilter === 'knapp'
                    ? 'bg-amber-600 text-white border-amber-700'
                    : 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100'
                }`}
              >
                ⚠️ Nur Knapp ({analysis.knappCount})
              </button>
              <button
                onClick={() => setStatusFilter('optimal')}
                className={`px-2.5 py-1 text-xs rounded-lg font-bold border transition-colors ${
                  statusFilter === 'optimal'
                    ? 'bg-emerald-600 text-white border-emerald-700'
                    : 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
                }`}
              >
                ✅ Nur Optimal ({analysis.optimalCount})
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wider border-b border-gray-200">
                  <th className="px-4 py-3">
                    <div>Ankunft (Einfahrt)</div>
                    <div className="text-[10px] font-normal text-gray-400 capitalize">
                      Woher der Zug kommt
                    </div>
                  </th>
                  <th className="px-4 py-3">
                    <div>Abfahrt (Ausfahrt / Weiterreise)</div>
                    <div className="text-[10px] font-normal text-gray-400 capitalize">
                      Wohin der Anschlusszug fährt
                    </div>
                  </th>
                  <th className="px-4 py-3 text-center">Umsteigezeit</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-4 py-3 text-right">Fahrplan bearbeiten</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {displayedConnections.map((conn) => {
                  return (
                    <tr
                      key={conn.id}
                      className={`hover:bg-blue-50/40 transition-colors ${
                        conn.isImprovedByMod
                          ? 'bg-emerald-50/40'
                          : conn.isBrokenByMod
                          ? 'bg-red-50/40'
                          : ''
                      }`}
                    >
                      {/* Arriving Line (Einfahrt) */}
                      <td className="px-4 py-3">
                        <div className="flex items-start gap-2.5">
                          <span
                            className="w-3 h-3 rounded-full shrink-0 mt-1"
                            style={{ backgroundColor: getCatColor(conn.fromCategory) }}
                          />
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleOpenLineInEditor(conn.fromLineId)}
                                className="font-bold text-gray-900 hover:text-blue-600 hover:underline cursor-pointer"
                                title="Linie im Editor öffnen"
                              >
                                {conn.fromCategory} {conn.fromLineName}
                              </button>
                              <span className="font-mono text-xs font-bold bg-gray-100 px-1.5 py-0.5 rounded text-gray-800">
                                Ankunft {formatTime(conn.fromArrivalTime)}
                              </span>
                            </div>
                            <div className="text-xs text-gray-700 mt-0.5 flex items-center gap-1">
                              <span className="text-gray-400 font-medium">Von:</span>
                              <span className="font-semibold text-gray-900">{conn.fromOrigin}</span>
                            </div>
                            <div className="text-[11px] text-gray-500 truncate max-w-[220px]">
                              {conn.fromIsTerminating ? (
                                <span className="text-gray-500 italic">Endet in {activeStationName}</span>
                              ) : (
                                <span>weiter nach <strong className="font-medium text-gray-700">{conn.fromDestination}</strong></span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Departing Line (Ausfahrt) */}
                      <td className="px-4 py-3">
                        <div className="flex items-start gap-2.5">
                          <span
                            className="w-3 h-3 rounded-full shrink-0 mt-1"
                            style={{ backgroundColor: getCatColor(conn.toCategory) }}
                          />
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleOpenLineInEditor(conn.toLineId)}
                                className="font-bold text-gray-900 hover:text-blue-600 hover:underline cursor-pointer"
                                title="Linie im Editor öffnen"
                              >
                                {conn.toCategory} {conn.toLineName}
                              </button>
                              <span className="font-mono text-xs font-bold bg-blue-50 px-1.5 py-0.5 rounded text-blue-900 border border-blue-200">
                                Abfahrt {formatTime(conn.toDepartureTime)}
                              </span>
                            </div>
                            <div className="text-xs text-gray-700 mt-0.5 flex items-center gap-1">
                              <span className="text-gray-400 font-medium">Nach:</span>
                              <span className="font-semibold text-gray-900">{conn.toDestination}</span>
                            </div>
                            <div className="text-[11px] text-gray-500 truncate max-w-[220px]">
                              {conn.toIsOriginating ? (
                                <span className="text-gray-500 italic">Beginnt in {activeStationName}</span>
                              ) : (
                                <span>aus <strong className="font-medium text-gray-700">{conn.toOrigin}</strong></span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Transfer Time */}
                      <td className="px-4 py-3 text-center">
                        <div className="inline-flex flex-col items-center">
                          <span
                            className={`text-base font-black font-mono ${
                              conn.status === 'optimal'
                                ? 'text-emerald-700'
                                : conn.status === 'knapp'
                                ? 'text-amber-700'
                                : conn.status === 'gebrochen'
                                ? 'text-red-700'
                                : 'text-blue-700'
                            }`}
                          >
                            {conn.transferMinutes} min
                          </span>
                          {conn.originalTransferMinutes !== undefined &&
                            conn.originalTransferMinutes !== conn.transferMinutes && (
                              <span className="text-[10px] text-gray-400">
                                Vorher: {conn.originalTransferMinutes} min
                              </span>
                            )}
                        </div>
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3 text-center">
                        {conn.status === 'optimal' && (
                          <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                            ✅ Optimal
                          </span>
                        )}
                        {conn.status === 'knapp' && (
                          <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">
                            ⚠️ Knapp (&lt; {minTransferTime}m)
                          </span>
                        )}
                        {conn.status === 'gebrochen' && (
                          <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-800 border border-red-200">
                            ❌ Gebrochen (&lt; 1m)
                          </span>
                        )}
                        {conn.status === 'lang' && (
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700 border border-gray-200">
                            Lange Wartezeit
                          </span>
                        )}

                        {conn.isImprovedByMod && (
                          <div className="mt-0.5 text-[10px] font-bold text-emerald-600">
                            ⚡ Neu gerettet!
                          </div>
                        )}
                        {conn.isBrokenByMod && (
                          <div className="mt-0.5 text-[10px] font-bold text-red-600">
                            ⚠️ Durch Modifikation verloren!
                          </div>
                        )}
                      </td>

                      {/* Action: Two distinct buttons for Ankunft vs Abfahrt */}
                      <td className="px-4 py-3 text-right">
                        <div className="flex flex-col sm:flex-row items-end sm:items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleOpenLineInEditor(conn.fromLineId)}
                            className="flex items-center gap-1 px-2 py-1 text-xs font-medium bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-md transition-colors"
                            title={`Ankommende Linie ${conn.fromCategory} ${conn.fromLineName} aus ${conn.fromOrigin} im Editor anpassen`}
                          >
                            <span>⬇️</span>
                            <span>{conn.fromLineName} (Ankunft)</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenLineInEditor(conn.toLineId)}
                            className="flex items-center gap-1 px-2 py-1 text-xs font-bold bg-blue-50 hover:bg-blue-600 hover:text-white text-blue-700 border border-blue-200 hover:border-transparent rounded-md transition-colors shadow-xs"
                            title={`Abfahrende Linie ${conn.toCategory} ${conn.toLineName} nach ${conn.toDestination} im Editor anpassen`}
                          >
                            <span>⬆️</span>
                            <span>{conn.toLineName} (Abfahrt)</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
};

export default ConnectionChecker;
