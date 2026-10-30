import React, { useState, useMemo, useEffect } from 'react';
import type { Line, LineCategory, DataSummary } from '../types';
import { useFahrplanStore } from '../stores/fahrplanStore';
import {
  CATEGORY_COLORS,
  CATEGORY_NAMES,
  CATEGORY_PRIORITY,
  formatDuration,
  totalTravelTime,
} from '../utils/constants';

interface LineComparison {
  name: string;
  category: LineCategory;
  line2026: Line | null;
  line2027: Line | null;
  travelTimeDiff: number;
  stopsDiff: number;
  taktDiff: number;
  absDiff: number;
}

const CompareView: React.FC = () => {
  const { viewMode, data, loadData } = useFahrplanStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState<LineCategory | 'all'>('all');
  const [showOnlyChanged, setShowOnlyChanged] = useState(false);

  useEffect(() => {
    if (viewMode === 'compare') {
      loadData('2026');
      loadData('2027');
    }
  }, [viewMode, loadData]);

  const data2026 = data['2026'];
  const data2027 = data['2027'];

  const comparisons = useMemo(() => {
    const lines26 = data2026.lines;
    const lines27 = data2027.lines;

    const lineKey = (l: Line) => `${l.name}_${l.category}`;

    const map26 = new Map<string, Line>();
    const map27 = new Map<string, Line>();
    lines26.forEach((l) => map26.set(lineKey(l), l));
    lines27.forEach((l) => map27.set(lineKey(l), l));

    const allKeys = new Set([...map26.keys(), ...map27.keys()]);
    const result: LineComparison[] = [];

    allKeys.forEach((key) => {
      const l26 = map26.get(key) ?? null;
      const l27 = map27.get(key) ?? null;

      const tt26 = l26 ? totalTravelTime(l26.segments) : 0;
      const tt27 = l27 ? totalTravelTime(l27.segments) : 0;
      const travelTimeDiff = l26 && l27 ? tt27 - tt26 : 0;

      const stopsDiff = l26 && l27 ? l27.stops.length - l26.stops.length : 0;

      const takt26 = l26?.taktMinutes ?? 0;
      const takt27 = l27?.taktMinutes ?? 0;
      const taktDiff = l26 && l27 ? takt27 - takt26 : 0;

      const name = (l26 ?? l27)!.name;
      const category = (l26 ?? l27)!.category;
      const absDiff = Math.abs(travelTimeDiff) + Math.abs(stopsDiff) * 60 + Math.abs(taktDiff) * 30;

      result.push({ name, category, line2026: l26, line2027: l27, travelTimeDiff, stopsDiff, taktDiff, absDiff });
    });

    return result;
  }, [data2026.lines, data2027.lines]);

  const filteredComparisons = useMemo(() => {
    let filtered = comparisons;

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter((c) => c.name.toLowerCase().includes(q));
    }

    if (filterCategory !== 'all') {
      filtered = filtered.filter((c) => c.category === filterCategory);
    }

    if (showOnlyChanged) {
      filtered = filtered.filter(
        (c) => !c.line2026 || !c.line2027 || c.travelTimeDiff !== 0 || c.stopsDiff !== 0 || c.taktDiff !== 0
      );
    }

    return filtered.sort((a, b) => b.absDiff - a.absDiff);
  }, [comparisons, searchQuery, filterCategory, showOnlyChanged]);

  const categorySummary = useMemo(() => {
    const cats = CATEGORY_PRIORITY.filter(
      (cat) =>
        (data2026.summary?.categories[cat] ?? 0) > 0 ||
        (data2027.summary?.categories[cat] ?? 0) > 0
    );
    return cats.map((cat) => ({
      category: cat,
      count2026: data2026.summary?.categories[cat] ?? 0,
      count2027: data2027.summary?.categories[cat] ?? 0,
    }));
  }, [data2026.summary, data2027.summary]);

  const maxCatCount = useMemo(
    () => Math.max(...categorySummary.map((c) => Math.max(c.count2026, c.count2027)), 1),
    [categorySummary]
  );

  if (viewMode !== 'compare') return null;

  if (!data2026.summary || !data2027.summary) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full mx-auto mb-3" />
          Daten werden geladen…
        </div>
      </div>
    );
  }

  const s26 = data2026.summary;
  const s27 = data2027.summary;

  const onlyIn2026 = filteredComparisons.filter((c) => c.line2026 && !c.line2027);
  const onlyIn2027 = filteredComparisons.filter((c) => !c.line2026 && c.line2027);
  const inBoth = filteredComparisons.filter((c) => c.line2026 && c.line2027);

  return (
    <div className="flex flex-col h-full overflow-y-auto bg-white">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200 p-4">
        <h2 className="text-xl font-bold text-gray-900 mb-3">
          Vergleich 2026 ↔ 2027
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="text"
            placeholder="Linie suchen…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-400 focus:border-transparent flex-1 min-w-[150px]"
          />
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value as LineCategory | 'all')}
            className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm bg-white"
          >
            <option value="all">Alle Kategorien</option>
            {CATEGORY_PRIORITY.map((cat) => (
              <option key={cat} value={cat}>
                {cat} – {CATEGORY_NAMES[cat]}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer">
            <input
              type="checkbox"
              checked={showOnlyChanged}
              onChange={(e) => setShowOnlyChanged(e.target.checked)}
              className="rounded border-gray-300"
            />
            Nur Änderungen
          </label>
        </div>
      </div>

      <div className="p-4 space-y-6">
        {/* Summary stats side-by-side */}
        <section>
          <h3 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">
            Übersicht
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <SummaryCard year="2026" summary={s26} />
            <SummaryCard year="2027" summary={s27} />
          </div>
        </section>

        {/* Category breakdown */}
        <section>
          <h3 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">
            Kategorien
          </h3>
          <div className="space-y-2">
            {categorySummary.map(({ category, count2026, count2027 }) => (
              <div key={category} className="flex items-center gap-2 text-sm">
                <span
                  className="w-10 text-xs font-bold text-white text-center py-0.5 rounded"
                  style={{ backgroundColor: CATEGORY_COLORS[category] }}
                >
                  {category}
                </span>
                <div className="flex-1 flex items-center gap-1">
                  <div className="flex-1 flex items-center gap-1">
                    <span className="w-10 text-right text-gray-500 text-xs">{count2026}</span>
                    <div className="flex-1 h-4 bg-gray-100 rounded overflow-hidden relative">
                      <div
                        className="absolute inset-y-0 left-0 bg-blue-400/60 rounded-l"
                        style={{ width: `${(count2026 / maxCatCount) * 100}%` }}
                      />
                      <div
                        className="absolute inset-y-0 left-0 bg-emerald-500/60 rounded-l"
                        style={{ width: `${(count2027 / maxCatCount) * 100}%`, opacity: 0.6 }}
                      />
                    </div>
                    <span className="w-10 text-left text-gray-500 text-xs">{count2027}</span>
                  </div>
                </div>
                {count2027 !== count2026 && (
                  <span
                    className={`text-xs font-semibold ${
                      count2027 > count2026 ? 'text-green-600' : 'text-red-600'
                    }`}
                  >
                    {count2027 > count2026 ? '+' : ''}
                    {count2027 - count2026}
                  </span>
                )}
              </div>
            ))}
            <div className="flex items-center gap-3 text-xs text-gray-400 mt-1 pl-12">
              <span className="flex items-center gap-1">
                <span className="inline-block w-3 h-3 bg-blue-400/60 rounded" /> 2026
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block w-3 h-3 bg-emerald-500/60 rounded" /> 2027
              </span>
            </div>
          </div>
        </section>

        {/* Lines only in one year */}
        {onlyIn2027.length > 0 && (
          <section>
            <h3 className="text-sm font-semibold text-green-700 mb-2 uppercase tracking-wide">
              Neu in 2027 ({onlyIn2027.length})
            </h3>
            <div className="space-y-1">
              {onlyIn2027.map((c) => (
                <div
                  key={`new-${c.name}-${c.category}`}
                  className="flex items-center gap-2 text-sm bg-green-50 rounded px-3 py-1.5"
                >
                  <span
                    className="px-1.5 py-0.5 text-xs font-bold text-white rounded"
                    style={{ backgroundColor: CATEGORY_COLORS[c.category] }}
                  >
                    {c.category}
                  </span>
                  <span className="font-medium text-gray-900">{c.name}</span>
                  <span className="text-gray-500 text-xs ml-auto">
                    {c.line2027!.stops.length} Halte
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {onlyIn2026.length > 0 && (
          <section>
            <h3 className="text-sm font-semibold text-red-700 mb-2 uppercase tracking-wide">
              Entfallen in 2027 ({onlyIn2026.length})
            </h3>
            <div className="space-y-1">
              {onlyIn2026.map((c) => (
                <div
                  key={`rem-${c.name}-${c.category}`}
                  className="flex items-center gap-2 text-sm bg-red-50 rounded px-3 py-1.5"
                >
                  <span
                    className="px-1.5 py-0.5 text-xs font-bold text-white rounded"
                    style={{ backgroundColor: CATEGORY_COLORS[c.category] }}
                  >
                    {c.category}
                  </span>
                  <span className="font-medium text-gray-900">{c.name}</span>
                  <span className="text-gray-500 text-xs ml-auto">
                    {c.line2026!.stops.length} Halte
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Lines in both years with changes */}
        <section>
          <h3 className="text-sm font-semibold text-gray-700 mb-2 uppercase tracking-wide">
            Vergleich gemeinsamer Linien ({inBoth.length})
          </h3>
          {inBoth.length === 0 ? (
            <p className="text-sm text-gray-400">Keine Ergebnisse.</p>
          ) : (
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left text-xs text-gray-500 uppercase tracking-wider">
                    <th className="px-3 py-2">Linie</th>
                    <th className="px-3 py-2 text-center">Fahrzeit Δ</th>
                    <th className="px-3 py-2 text-center">Halte Δ</th>
                    <th className="px-3 py-2 text-center">Takt Δ</th>
                  </tr>
                </thead>
                <tbody>
                  {inBoth.map((c) => {
                    const hasChange = c.travelTimeDiff !== 0 || c.stopsDiff !== 0 || c.taktDiff !== 0;
                    return (
                      <tr
                        key={`both-${c.name}-${c.category}`}
                        className={`border-t border-gray-100 ${hasChange ? 'bg-yellow-50/40' : ''}`}
                      >
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <span
                              className="px-1.5 py-0.5 text-xs font-bold text-white rounded"
                              style={{ backgroundColor: CATEGORY_COLORS[c.category] }}
                            >
                              {c.category}
                            </span>
                            <span className="font-medium text-gray-900">{c.name}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2 text-center">
                          {c.travelTimeDiff !== 0 ? (
                            <span
                              className={`font-semibold ${
                                c.travelTimeDiff < 0 ? 'text-green-600' : 'text-red-600'
                              }`}
                            >
                              {c.travelTimeDiff < 0 ? '−' : '+'}
                              {formatDuration(Math.abs(c.travelTimeDiff))}
                            </span>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {c.stopsDiff !== 0 ? (
                            <span
                              className={`font-semibold ${
                                c.stopsDiff > 0 ? 'text-green-600' : 'text-red-600'
                              }`}
                            >
                              {c.stopsDiff > 0 ? '+' : ''}
                              {c.stopsDiff}
                            </span>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {c.taktDiff !== 0 ? (
                            <span
                              className={`font-semibold ${
                                c.taktDiff < 0 ? 'text-green-600' : 'text-red-600'
                              }`}
                            >
                              {c.taktDiff > 0 ? '+' : ''}
                              {c.taktDiff} min
                            </span>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

const SummaryCard: React.FC<{ year: string; summary: DataSummary }> = ({ year, summary }) => (
  <div className="bg-gray-50 rounded-lg p-4">
    <h4 className="text-lg font-bold text-gray-900 mb-2">{year}</h4>
    <div className="space-y-1 text-sm">
      <div className="flex justify-between">
        <span className="text-gray-500">Linien:</span>
        <span className="font-semibold">{summary.totalLines}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-gray-500">Stationen:</span>
        <span className="font-semibold">{summary.totalStations}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-gray-500">Kanten:</span>
        <span className="font-semibold">{summary.totalEdges}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-gray-500">Knoten:</span>
        <span className="font-semibold">{summary.hubStations}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-gray-500">Routen:</span>
        <span className="font-semibold">{summary.totalRoutes}</span>
      </div>
    </div>
  </div>
);

export default CompareView;
