import React from 'react';
import { useFahrplanStore } from '../stores/fahrplanStore';

const VIEW_LABELS: Record<string, string> = {
  map: 'Karte',
  editor: 'Editor',
  anschlüsse: 'Anschlüsse',
  compare: 'Vergleich',
};

const Header: React.FC = () => {
  const activeYear = useFahrplanStore((s) => s.activeYear);
  const compareYear = useFahrplanStore((s) => s.compareYear);
  const viewMode = useFahrplanStore((s) => s.viewMode);
  const summary = useFahrplanStore((s) => s.data[s.activeYear].summary);

  return (
    <header className="h-12 flex items-center justify-between px-4 bg-gradient-to-r from-red-700 to-red-900 text-white shadow-md flex-shrink-0">
      {/* Left: Title */}
      <div className="flex items-center gap-3">
        <h1 className="text-sm font-bold tracking-wide">
          Taktfahrplan Optimierer Schweiz
        </h1>
      </div>

      {/* Center: View & Year Badges */}
      <div className="flex items-center gap-2">
        <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full">
          {VIEW_LABELS[viewMode] ?? viewMode}
        </span>
        <span className="text-xs font-semibold bg-white text-red-800 px-2 py-0.5 rounded-full">
          {activeYear}
        </span>
        {viewMode === 'compare' && compareYear && (
          <>
            <span className="text-xs text-white/70">↔</span>
            <span className="text-xs font-semibold bg-white/80 text-red-800 px-2 py-0.5 rounded-full">
              {compareYear}
            </span>
          </>
        )}
      </div>

      {/* Right: Data Summary */}
      <div className="flex items-center gap-3 text-xs text-white/80">
        {summary && (
          <>
            <span>{summary.totalLines} Linien</span>
            <span className="text-white/40">|</span>
            <span>{summary.totalStations} Bahnhöfe</span>
          </>
        )}
      </div>
    </header>
  );
};

export default Header;
