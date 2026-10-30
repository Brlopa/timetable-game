import React, { useMemo, useState } from 'react';
import type { LineCategory, ViewMode } from '../types';
import { useFahrplanStore } from '../stores/fahrplanStore';
import { CATEGORY_COLORS, CATEGORY_NAMES, CATEGORY_PRIORITY, formatDuration, formatTime } from '../utils/constants';
import { getTaktNode, getStationTaktProfile, type TaktNodeType } from '../utils/knoten';

const VIEW_MODES: { key: ViewMode; label: string }[] = [
  { key: 'map', label: 'Karte' },
  { key: 'editor', label: 'Editor' },
  { key: 'compare', label: 'Vergleich' },
];

const Sidebar: React.FC = () => {
  const activeYear = useFahrplanStore((s) => s.activeYear);
  const setActiveYear = useFahrplanStore((s) => s.setActiveYear);
  const viewMode = useFahrplanStore((s) => s.viewMode);
  const setViewMode = useFahrplanStore((s) => s.setViewMode);
  const searchQuery = useFahrplanStore((s) => s.searchQuery);
  const setSearchQuery = useFahrplanStore((s) => s.setSearchQuery);
  const visibleCategories = useFahrplanStore((s) => s.visibleCategories);
  const toggleCategory = useFahrplanStore((s) => s.toggleCategory);
  const showHubsOnly = useFahrplanStore((s) => s.showHubsOnly);
  const setShowHubsOnly = useFahrplanStore((s) => s.setShowHubsOnly);
  const data = useFahrplanStore((s) => s.data[s.activeYear]);
  const selectedStation = useFahrplanStore((s) => s.selectedStation);
  const selectedLine = useFahrplanStore((s) => s.selectedLine);
  const setSelectedStation = useFahrplanStore((s) => s.setSelectedStation);
  const setSelectedLine = useFahrplanStore((s) => s.setSelectedLine);
  const getStationLines = useFahrplanStore((s) => s.getStationLines);
  const travelTimeModifications = useFahrplanStore((s) => s.travelTimeModifications);
  const departureModifications = useFahrplanStore((s) => s.departureModifications);
  const taktModifications = useFahrplanStore((s) => s.taktModifications);
  const resetModifications = useFahrplanStore((s) => s.resetModifications);

  const setCompareYear = useFahrplanStore((s) => s.setCompareYear);

  const { lines, stations, summary } = data;
  const totalMods =
    travelTimeModifications.length +
    departureModifications.length +
    taktModifications.length;

  const stationLines = selectedStation ? getStationLines(selectedStation.id) : [];
  const [stationNodeFilter, setStationNodeFilter] = useState<TaktNodeType | null>(null);

  const stationProfile = useMemo(() => {
    if (!selectedStation) return null;
    return getStationTaktProfile(selectedStation.name, stationLines);
  }, [selectedStation, stationLines]);

  const filteredStationLines = useMemo(() => {
    if (!stationNodeFilter || !stationProfile) return stationLines;
    const allowedLineIds = new Set(stationProfile.nodeLines[stationNodeFilter].map((item) => item.line.id));
    return stationLines.filter((l) => allowedLineIds.has(l.id));
  }, [stationLines, stationNodeFilter, stationProfile]);

  return (
    <aside className="w-80 h-full flex flex-col bg-white shadow-lg border-r border-gray-200 overflow-y-auto">
      {/* Title */}
      <div className="px-4 py-3 border-b border-gray-100">
        <h1 className="text-lg font-bold text-gray-900">🚂 Fahrplan Optimierer</h1>
      </div>

      {/* Year Selector */}
      <div className="px-4 py-3 border-b border-gray-100">
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          Fahrplanjahr
        </label>
        <div className="mt-1.5 flex rounded-lg overflow-hidden border border-gray-300">
          {(['2026', '2027'] as const).map((year) => (
            <button
              key={year}
              onClick={() => setActiveYear(year)}
              className={`flex-1 py-1.5 text-sm font-medium transition-colors ${
                activeYear === year
                  ? 'bg-red-600 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              {year}
            </button>
          ))}
        </div>
      </div>

      {/* View Mode Tabs */}
      <div className="px-4 py-3 border-b border-gray-100">
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          Ansicht
        </label>
        <div className="mt-1.5 flex gap-1">
          {VIEW_MODES.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => {
                setViewMode(key);
                if (key === 'compare') {
                  setCompareYear(activeYear === '2026' ? '2027' : '2026');
                }
              }}
              className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${
                viewMode === key
                  ? 'bg-gray-800 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Search */}
      <div className="px-4 py-3 border-b border-gray-100">
        <input
          type="text"
          placeholder="Suche Bahnhof / Linie…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-400 focus:border-transparent"
        />
        {searchQuery.length >= 2 && (
          <SearchResults
            query={searchQuery}
            lines={lines}
            stations={stations}
            onSelectLine={(line) => { setSelectedLine(line); setSelectedStation(null); setSearchQuery(''); }}
            onSelectStation={(station) => { setSelectedStation(station); setSelectedLine(null); setSearchQuery(''); }}
          />
        )}
      </div>

      {/* Category Filters */}
      <div className="px-4 py-3 border-b border-gray-100">
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          Kategorien
        </label>
        <div className="mt-2 space-y-1 max-h-48 overflow-y-auto">
          {CATEGORY_PRIORITY.map((cat) => {
            const count = summary?.categories?.[cat] ?? 0;
            if (count === 0 && !visibleCategories.has(cat)) return null;
            return (
              <label
                key={cat}
                className="flex items-center gap-2 py-0.5 cursor-pointer text-sm text-gray-700 hover:bg-gray-50 rounded px-1"
              >
                <input
                  type="checkbox"
                  checked={visibleCategories.has(cat)}
                  onChange={() => toggleCategory(cat)}
                  className="rounded border-gray-300 text-red-600 focus:ring-red-500"
                />
                <span
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: CATEGORY_COLORS[cat] }}
                />
                <span className="flex-1">{CATEGORY_NAMES[cat]}</span>
                {count > 0 && (
                  <span className="text-xs text-gray-400">{count}</span>
                )}
              </label>
            );
          })}
        </div>
      </div>

      {/* Hub Toggle */}
      <div className="px-4 py-3 border-b border-gray-100">
        <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
          <input
            type="checkbox"
            checked={showHubsOnly}
            onChange={(e) => setShowHubsOnly(e.target.checked)}
            className="rounded border-gray-300 text-red-600 focus:ring-red-500"
          />
          Nur Knotenbahnhöfe
        </label>
      </div>

      {/* Summary Stats */}
      {summary && (
        <div className="px-4 py-3 border-b border-gray-100">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            Übersicht
          </label>
          <div className="mt-1.5 grid grid-cols-2 gap-1 text-sm">
            <span className="text-gray-500">Linien</span>
            <span className="text-right font-medium text-gray-800">{summary.totalLines}</span>
            <span className="text-gray-500">Bahnhöfe</span>
            <span className="text-right font-medium text-gray-800">{summary.totalStations}</span>
            <span className="text-gray-500">Kanten</span>
            <span className="text-right font-medium text-gray-800">{summary.totalEdges}</span>
            <span className="text-gray-500">Knoten</span>
            <span className="text-right font-medium text-gray-800">{summary.hubStations}</span>
          </div>
        </div>
      )}

      {/* Selected Station */}
      {selectedStation && (
        <div className="px-4 py-3 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Bahnhof
            </label>
            <button
              onClick={() => {
                setSelectedStation(null);
                setStationNodeFilter(null);
              }}
              className="text-gray-400 hover:text-gray-600 text-lg leading-none"
              title="Auswahl aufheben"
            >
              ×
            </button>
          </div>
          <div className="mt-1 flex items-center gap-1.5 flex-wrap">
            <p className="font-bold text-gray-900 text-base">{selectedStation.name}</p>
            {selectedStation.isHub && (
              <span className="text-[10px] bg-amber-100 text-amber-800 font-bold px-1.5 py-0.5 rounded-full border border-amber-200">
                Knotenbahnhof
              </span>
            )}
          </div>

          {/* Taktknoten Profile & Quadranten */}
          {stationProfile && (
            <div className="mt-2.5">
              <div className="text-[11px] font-semibold text-gray-600 mb-1.5">
                {stationProfile.classification}
              </div>

              {/* 4 Taktknoten Buttons (Filter) */}
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  onClick={() => setStationNodeFilter(stationNodeFilter === 'um' ? null : 'um')}
                  className={`flex items-center justify-between px-2 py-1.5 rounded text-xs font-medium border transition-all ${
                    stationNodeFilter === 'um'
                      ? 'bg-emerald-600 text-white border-emerald-700 shadow-xs'
                      : 'bg-emerald-50 text-emerald-900 border-emerald-200 hover:bg-emerald-100'
                  }`}
                  title="Linien zur vollen Stunde (.00 Um)"
                >
                  <span className="font-bold">.00 (Um)</span>
                  <span className={`text-[11px] px-1.5 py-0.2 rounded-full ${stationNodeFilter === 'um' ? 'bg-white/20' : 'bg-emerald-200/60'}`}>
                    {stationProfile.nodeCounts.um}
                  </span>
                </button>

                <button
                  onClick={() => setStationNodeFilter(stationNodeFilter === 'halb' ? null : 'halb')}
                  className={`flex items-center justify-between px-2 py-1.5 rounded text-xs font-medium border transition-all ${
                    stationNodeFilter === 'halb'
                      ? 'bg-blue-600 text-white border-blue-700 shadow-xs'
                      : 'bg-blue-50 text-blue-900 border-blue-200 hover:bg-blue-100'
                  }`}
                  title="Linien zur halben Stunde (.30 Halb)"
                >
                  <span className="font-bold">.30 (Halb)</span>
                  <span className={`text-[11px] px-1.5 py-0.2 rounded-full ${stationNodeFilter === 'halb' ? 'bg-white/20' : 'bg-blue-200/60'}`}>
                    {stationProfile.nodeCounts.halb}
                  </span>
                </button>

                <button
                  onClick={() => setStationNodeFilter(stationNodeFilter === 'viertel_ab' ? null : 'viertel_ab')}
                  className={`flex items-center justify-between px-2 py-1.5 rounded text-xs font-medium border transition-all ${
                    stationNodeFilter === 'viertel_ab'
                      ? 'bg-amber-600 text-white border-amber-700 shadow-xs'
                      : 'bg-amber-50 text-amber-900 border-amber-200 hover:bg-amber-100'
                  }`}
                  title="Linien um Viertel nach (.15 Viertel ab)"
                >
                  <span className="font-bold">.15 (Viertel ab)</span>
                  <span className={`text-[11px] px-1.5 py-0.2 rounded-full ${stationNodeFilter === 'viertel_ab' ? 'bg-white/20' : 'bg-amber-200/60'}`}>
                    {stationProfile.nodeCounts.viertel_ab}
                  </span>
                </button>

                <button
                  onClick={() => setStationNodeFilter(stationNodeFilter === 'viertel_vor' ? null : 'viertel_vor')}
                  className={`flex items-center justify-between px-2 py-1.5 rounded text-xs font-medium border transition-all ${
                    stationNodeFilter === 'viertel_vor'
                      ? 'bg-purple-600 text-white border-purple-700 shadow-xs'
                      : 'bg-purple-50 text-purple-900 border-purple-200 hover:bg-purple-100'
                  }`}
                  title="Linien um Dreiviertel (.45 Viertel vor)"
                >
                  <span className="font-bold">.45 (Viertel vor)</span>
                  <span className={`text-[11px] px-1.5 py-0.2 rounded-full ${stationNodeFilter === 'viertel_vor' ? 'bg-white/20' : 'bg-purple-200/60'}`}>
                    {stationProfile.nodeCounts.viertel_vor}
                  </span>
                </button>
              </div>

              {stationNodeFilter && (
                <div className="flex items-center justify-between mt-1 text-[11px] text-gray-500">
                  <span>Filter aktiv: <b>{stationNodeFilter === 'um' ? 'Um (.00)' : stationNodeFilter === 'halb' ? 'Halb (.30)' : stationNodeFilter === 'viertel_ab' ? 'Viertel ab (.15)' : 'Viertel vor (.45)'}</b></span>
                  <button onClick={() => setStationNodeFilter(null)} className="text-blue-600 hover:underline">
                    Alle anzeigen
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Lines list with Takt badge */}
          {filteredStationLines.length > 0 ? (
            <div className="mt-3 space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {filteredStationLines.map((line) => {
                const stop = line.stops.find((s) =>
                  s.name.toLowerCase() === selectedStation.name.toLowerCase() ||
                  s.name.toLowerCase().includes(selectedStation.name.toLowerCase()) ||
                  selectedStation.name.toLowerCase().includes(s.name.toLowerCase())
                );
                const timeStr = stop?.departure || stop?.arrival || '';
                const nodeInfo = getTaktNode(timeStr);

                return (
                  <button
                    key={line.id}
                    onClick={() => {
                      setSelectedLine(line);
                      setSelectedStation(null);
                    }}
                    className="w-full text-left flex items-center justify-between p-1.5 rounded-md text-xs hover:bg-gray-100 border border-transparent hover:border-gray-200 transition-colors"
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: CATEGORY_COLORS[line.category] }}
                      />
                      <span className="font-semibold text-gray-900">{line.name}</span>
                      <span className="text-gray-400 truncate max-w-[100px]">{line.headsign}</span>
                    </div>

                    {timeStr ? (
                      <span
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded border shrink-0 ${nodeInfo.bgColor} ${nodeInfo.textColor} ${nodeInfo.borderColor}`}
                        title={`${formatTime(timeStr)} - ${nodeInfo.label}`}
                      >
                        {formatTime(timeStr)} ({nodeInfo.shortLabel})
                      </span>
                    ) : (
                      <span className="text-gray-300 text-[10px]">—</span>
                    )}
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="mt-2 text-xs text-gray-400">Keine Linien für diesen Knoten.</p>
          )}
        </div>
      )}

      {/* Selected Line */}
      {selectedLine && (
        <div className="px-4 py-3 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Linie
            </label>
            <button
              onClick={() => setSelectedLine(null)}
              className="text-gray-400 hover:text-gray-600 text-lg leading-none"
              title="Auswahl aufheben"
            >
              ×
            </button>
          </div>
          <div className="mt-1 flex items-center gap-2">
            <span
              className="w-3 h-3 rounded-full flex-shrink-0"
              style={{ backgroundColor: CATEGORY_COLORS[selectedLine.category] }}
            />
            <span className="font-semibold text-gray-900">{selectedLine.name}</span>
          </div>
          <div className="mt-2 space-y-0.5 text-sm text-gray-600">
            <p>
              <span className="text-gray-400">Kategorie:</span>{' '}
              {CATEGORY_NAMES[selectedLine.category]}
            </p>
            <p>
              <span className="text-gray-400">Betreiber:</span> {selectedLine.agency}
            </p>
            <p>
              <span className="text-gray-400">Richtung:</span> {selectedLine.headsign}
            </p>
            {selectedLine.taktMinutes && (
              <p>
                <span className="text-gray-400">Takt:</span> {selectedLine.taktMinutes} min
              </p>
            )}
            {selectedLine.numDepartures && (
              <p>
                <span className="text-gray-400">Fahrten:</span> {selectedLine.numDepartures}
              </p>
            )}
            <p>
              <span className="text-gray-400">Halte:</span> {selectedLine.stops.length}
            </p>
          </div>
        </div>
      )}

      {/* Modifications */}
      <div className="px-4 py-3">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            Änderungen
          </label>
          {totalMods > 0 && (
            <span className="text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full font-medium">
              {totalMods}
            </span>
          )}
        </div>
        {totalMods === 0 ? (
          <p className="mt-1 text-sm text-gray-400">Keine Änderungen</p>
        ) : (
          <div className="mt-2 space-y-1 text-sm text-gray-600">
            {travelTimeModifications.length > 0 && (
              <p>{travelTimeModifications.length} Fahrzeitänderung(en)</p>
            )}
            {departureModifications.length > 0 && (
              <p>{departureModifications.length} Abfahrtsänderung(en)</p>
            )}
            {taktModifications.length > 0 && (
              <p>{taktModifications.length} Taktänderung(en)</p>
            )}
            <button
              onClick={resetModifications}
              className="mt-2 w-full py-1.5 text-xs font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
            >
              Alle zurücksetzen
            </button>
          </div>
        )}
      </div>
    </aside>
  );
};

export default Sidebar;

// --- Search Results sub-component ---
import type { Line, Station } from '../types';

const SearchResults: React.FC<{
  query: string;
  lines: Line[];
  stations: Station[];
  onSelectLine: (line: Line) => void;
  onSelectStation: (station: Station) => void;
}> = ({ query, lines, stations, onSelectLine, onSelectStation }) => {
  const q = query.toLowerCase();

  const matchedLines = useMemo(
    () => lines.filter((l) =>
      l.name.toLowerCase().includes(q) ||
      l.headsign.toLowerCase().includes(q) ||
      l.category.toLowerCase().includes(q)
    ).slice(0, 15),
    [lines, q]
  );

  const matchedStations = useMemo(
    () => stations.filter((s) => s.name.toLowerCase().includes(q)).slice(0, 10),
    [stations, q]
  );

  if (matchedLines.length === 0 && matchedStations.length === 0) {
    return <p className="mt-2 text-xs text-gray-400">Keine Ergebnisse</p>;
  }

  return (
    <div className="mt-2 max-h-64 overflow-y-auto border border-gray-200 rounded-lg bg-white shadow-sm">
      {matchedStations.length > 0 && (
        <div>
          <div className="px-2 py-1 text-xs font-semibold text-gray-400 bg-gray-50 sticky top-0">
            Bahnhöfe
          </div>
          {matchedStations.map((s) => (
            <button
              key={s.id}
              onClick={() => onSelectStation(s)}
              className="w-full text-left px-3 py-1.5 text-sm hover:bg-blue-50 flex items-center gap-2"
            >
              <span className={`w-2 h-2 rounded-full ${s.isHub ? 'bg-yellow-500' : 'bg-gray-400'}`} />
              {s.name}
            </button>
          ))}
        </div>
      )}
      {matchedLines.length > 0 && (
        <div>
          <div className="px-2 py-1 text-xs font-semibold text-gray-400 bg-gray-50 sticky top-0">
            Linien
          </div>
          {matchedLines.map((l) => (
            <button
              key={l.id}
              onClick={() => onSelectLine(l)}
              className="w-full text-left px-3 py-1.5 text-sm hover:bg-blue-50 flex items-center gap-2"
            >
              <span
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: CATEGORY_COLORS[l.category] }}
              />
              <span className="font-medium">{l.category} {l.name}</span>
              <span className="text-xs text-gray-400 ml-auto truncate max-w-[120px]">{l.headsign}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
