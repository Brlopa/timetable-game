import React, { useState } from 'react';
import { useFahrplanStore } from '../stores/fahrplanStore';
import { formatDuration, generateId } from '../utils/constants';

const PRESET_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4',
  '#3b82f6', '#8b5cf6', '#ec4899', '#6b7280', '#14b8a6',
];

const InfrastructurePanel: React.FC = () => {
  const {
    infrastructureProjects,
    travelTimeModifications,
    addInfraProject,
    removeInfraProject,
  } = useFahrplanStore();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState(PRESET_COLORS[0]);
  const [isFormOpen, setIsFormOpen] = useState(false);

  // Calculate totals
  const totalTimeSaved = infrastructureProjects.reduce((sum, p) => sum + p.timeSavings, 0);
  const totalAffectedSegments = new Set(
    infrastructureProjects.flatMap((p) => p.affectedSegments)
  ).size;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    // Collect affected segments from current travel time modifications
    const affectedSegments = travelTimeModifications
      .filter((m) => m.newTime < m.originalTime)
      .map((m) => m.segmentKey);

    const timeSavings = travelTimeModifications
      .filter((m) => m.newTime < m.originalTime)
      .reduce((sum, m) => sum + (m.originalTime - m.newTime), 0);

    addInfraProject({
      name: name.trim(),
      description: description.trim(),
      affectedSegments,
      timeSavings,
      color,
    });

    setName('');
    setDescription('');
    setIsFormOpen(false);
  };

  return (
    <div className="bg-white p-4">
      {/* Section Header */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
          Infrastrukturprojekte
        </h3>
        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
          {infrastructureProjects.length}
        </span>
      </div>

      {/* Summary */}
      {infrastructureProjects.length > 0 && (
        <div className="mb-3 p-3 bg-green-50 rounded-lg text-sm">
          <div className="flex justify-between text-green-800">
            <span>Zeitersparnis total:</span>
            <span className="font-bold">{formatDuration(totalTimeSaved)}</span>
          </div>
          <div className="flex justify-between text-green-700 mt-1">
            <span>Betroffene Segmente:</span>
            <span className="font-medium">{totalAffectedSegments}</span>
          </div>
          {/* Simple impact bar */}
          <div className="mt-2">
            <div className="h-2 bg-green-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-green-500 rounded-full transition-all"
                style={{ width: `${Math.min(100, (totalTimeSaved / 600) * 100)}%` }}
              />
            </div>
            <p className="text-xs text-green-600 mt-0.5 text-right">
              {totalTimeSaved > 0 ? `${Math.round(totalTimeSaved / 60)} Minuten gespart` : ''}
            </p>
          </div>
        </div>
      )}

      {/* Project List */}
      {infrastructureProjects.length > 0 && (
        <div className="space-y-2 mb-3">
          {infrastructureProjects.map((project) => (
            <div
              key={project.id}
              className="border border-gray-200 rounded-lg p-3"
              style={{ borderLeftColor: project.color, borderLeftWidth: 4 }}
            >
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-gray-800">{project.name}</h4>
                <button
                  onClick={() => removeInfraProject(project.id)}
                  className="text-gray-400 hover:text-red-500 text-sm"
                  title="Projekt löschen"
                >
                  ✕
                </button>
              </div>
              {project.description && (
                <p className="text-xs text-gray-500 mt-1">{project.description}</p>
              )}
              <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
                <span>{project.affectedSegments.length} Segment(e)</span>
                <span className="text-green-600 font-medium">
                  −{formatDuration(project.timeSavings)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* New Project Form */}
      {isFormOpen ? (
        <form onSubmit={handleSubmit} className="border border-blue-200 rounded-lg p-3 bg-blue-50/50">
          <h4 className="text-sm font-semibold text-gray-700 mb-2">Neues Projekt</h4>
          <div className="space-y-2">
            <input
              type="text"
              placeholder="Projektname (z.B. Brüttener Tunnel)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-400 focus:border-transparent"
              autoFocus
            />
            <textarea
              placeholder="Beschreibung..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-400 focus:border-transparent resize-none"
            />
            <div>
              <label className="text-xs text-gray-500">Farbe:</label>
              <div className="flex gap-1 mt-1">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className={`w-5 h-5 rounded-full border-2 transition-transform ${
                      color === c ? 'border-gray-800 scale-125' : 'border-transparent'
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
            {travelTimeModifications.filter((m) => m.newTime < m.originalTime).length > 0 && (
              <p className="text-xs text-blue-600">
                {travelTimeModifications.filter((m) => m.newTime < m.originalTime).length} Fahrzeitverkürzung(en) werden als Segmente übernommen.
              </p>
            )}
            <div className="flex gap-2">
              <button
                type="submit"
                className="flex-1 px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
              >
                Erstellen
              </button>
              <button
                type="button"
                onClick={() => setIsFormOpen(false)}
                className="px-3 py-1.5 bg-gray-200 text-gray-700 text-sm rounded hover:bg-gray-300"
              >
                Abbrechen
              </button>
            </div>
          </div>
        </form>
      ) : (
        <button
          onClick={() => setIsFormOpen(true)}
          className="w-full py-2 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-500 hover:border-blue-400 hover:text-blue-600 transition-colors"
        >
          + Neues Infrastrukturprojekt
        </button>
      )}
    </div>
  );
};

export default InfrastructurePanel;
