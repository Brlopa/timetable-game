import React, { useMemo, useCallback, useState } from 'react';
import { MapContainer, TileLayer, Polyline, CircleMarker, Tooltip } from 'react-leaflet';
import type { LatLngExpression, PathOptions, Map as LeafletMap } from 'leaflet';
import type { NetworkEdge, Station, LineCategory, Segment, InfrastructureProject } from '../types';
import { useFahrplanStore } from '../stores/fahrplanStore';
import {
  CATEGORY_COLORS,
  CATEGORY_PRIORITY,
  SWISS_CENTER,
  SWISS_ZOOM,
  formatDuration,
  formatTime,
} from '../utils/constants';
import { getStationTaktProfile } from '../utils/knoten';

const VALID_CATEGORIES = new Set<string>(CATEGORY_PRIORITY);

function getHighestPriorityCategory(lineRefs: string[]): LineCategory | null {
  const categories = new Set<LineCategory>();
  for (const ref of lineRefs) {
    const cat = ref.split(' ')[0] as LineCategory;
    if (VALID_CATEGORIES.has(cat)) categories.add(cat);
  }
  for (const cat of CATEGORY_PRIORITY) {
    if (categories.has(cat)) return cat;
  }
  return null;
}

const NetworkMap: React.FC = () => {
  const activeYear = useFahrplanStore((s) => s.activeYear);
  const data = useFahrplanStore((s) => s.data[s.activeYear]);
  const visibleCategories = useFahrplanStore((s) => s.visibleCategories);
  const selectedLine = useFahrplanStore((s) => s.selectedLine);
  const selectedStation = useFahrplanStore((s) => s.selectedStation);
  const showHubsOnly = useFahrplanStore((s) => s.showHubsOnly);
  const travelTimeModifications = useFahrplanStore((s) => s.travelTimeModifications);
  const departureModifications = useFahrplanStore((s) => s.departureModifications);
  const infrastructureProjects = useFahrplanStore((s) => s.infrastructureProjects);
  const setSelectedStation = useFahrplanStore((s) => s.setSelectedStation);
  const setSelectedLine = useFahrplanStore((s) => s.setSelectedLine);
  const setHoveredEdge = useFahrplanStore((s) => s.setHoveredEdge);

  const [dimUnmodified, setDimUnmodified] = useState(false);
  const [isOverlayExpanded, setIsOverlayExpanded] = useState(true);
  const [mapInstance, setMapInstance] = useState<LeafletMap | null>(null);

  const { lines, stations, network } = data;

  // Build high-resolution lookup map for modified segments (by station names & IDs)
  const modifiedSegmentsMap = useMemo(() => {
    const map = new Map<string, {
      originalTime: number;
      newTime: number;
      deltaSeconds: number;
      fromName: string;
      toName: string;
      infraProject?: InfrastructureProject;
      midLat: number;
      midLon: number;
    }>();

    for (const mod of travelTimeModifications) {
      let foundSeg: Segment | null = null;
      for (const line of lines) {
        for (const s of line.segments) {
          if (`${s.fromStop}_${s.toStop}` === mod.segmentKey) {
            foundSeg = s;
            break;
          }
        }
        if (foundSeg) break;
      }

      if (foundSeg) {
        const nameKey1 = `${foundSeg.fromName}_${foundSeg.toName}`;
        const nameKey2 = `${foundSeg.toName}_${foundSeg.fromName}`;
        const infra = infrastructureProjects.find((p) => p.affectedSegments.includes(mod.segmentKey));
        const midLat = (foundSeg.fromLat + foundSeg.toLat) / 2;
        const midLon = (foundSeg.fromLon + foundSeg.toLon) / 2;

        const info = {
          originalTime: mod.originalTime,
          newTime: mod.newTime,
          deltaSeconds: mod.newTime - mod.originalTime,
          fromName: foundSeg.fromName,
          toName: foundSeg.toName,
          infraProject: infra,
          midLat,
          midLon,
        };
        map.set(nameKey1, info);
        map.set(nameKey2, info);
        map.set(mod.segmentKey, info);
      }
    }
    return map;
  }, [travelTimeModifications, infrastructureProjects, lines]);

  // Unique list of modified segments for the floating widget
  const uniqueModifiedSegments = useMemo(() => {
    const seen = new Set<string>();
    const list: {
      fromName: string;
      toName: string;
      deltaSeconds: number;
      newTime: number;
      originalTime: number;
      infraProject?: InfrastructureProject;
      midLat: number;
      midLon: number;
    }[] = [];

    for (const mod of travelTimeModifications) {
      let foundSeg: Segment | null = null;
      for (const line of lines) {
        for (const s of line.segments) {
          if (`${s.fromStop}_${s.toStop}` === mod.segmentKey) {
            foundSeg = s;
            break;
          }
        }
        if (foundSeg) break;
      }

      if (foundSeg) {
        const pairKey = [foundSeg.fromName, foundSeg.toName].sort().join('___');
        if (!seen.has(pairKey)) {
          seen.add(pairKey);
          const infra = infrastructureProjects.find((p) => p.affectedSegments.includes(mod.segmentKey));
          list.push({
            fromName: foundSeg.fromName,
            toName: foundSeg.toName,
            deltaSeconds: mod.newTime - mod.originalTime,
            newTime: mod.newTime,
            originalTime: mod.originalTime,
            infraProject: infra,
            midLat: (foundSeg.fromLat + foundSeg.toLat) / 2,
            midLon: (foundSeg.fromLon + foundSeg.toLon) / 2,
          });
        }
      }
    }
    return list;
  }, [travelTimeModifications, infrastructureProjects, lines]);

  // Total saved time across all modifications
  const totalSavedSeconds = useMemo(() => {
    return travelTimeModifications.reduce((sum, m) => {
      const diff = m.originalTime - m.newTime;
      return diff > 0 ? sum + diff : sum;
    }, 0);
  }, [travelTimeModifications]);

  // Build lookup for modified stations (departure modifications)
  const modifiedStationsMap = useMemo(() => {
    const map = new Map<string, { stopName: string; originalDep: string; newDep: string }>();
    for (const depMod of departureModifications) {
      for (const l of lines) {
        const st = l.stops.find((s) => s.id === depMod.stopId);
        if (st) {
          map.set(st.name.toLowerCase(), {
            stopName: st.name,
            originalDep: depMod.originalDeparture,
            newDep: depMod.newDeparture,
          });
          break;
        }
      }
    }
    return map;
  }, [departureModifications, lines]);

  // Set of segment keys belonging to the selected line (for highlighting)
  const selectedLineEdgeSet = useMemo(() => {
    if (!selectedLine) return null;
    const segKeys = new Set<string>();
    for (const seg of selectedLine.segments) {
      segKeys.add(`${seg.fromStop}_${seg.toStop}`);
      segKeys.add(`${seg.toStop}_${seg.fromStop}`);
      segKeys.add(`${seg.fromName}_${seg.toName}`);
      segKeys.add(`${seg.toName}_${seg.fromName}`);
    }
    return segKeys;
  }, [selectedLine]);

  // Filter edges by visible categories
  const filteredEdges = useMemo(() => {
    return network.filter((edge) => {
      const cat = getHighestPriorityCategory(edge.lines);
      return cat !== null && visibleCategories.has(cat);
    });
  }, [network, visibleCategories]);

  // Filter stations
  const filteredStations = useMemo(() => {
    return showHubsOnly ? stations.filter((s) => s.isHub) : stations;
  }, [stations, showHubsOnly]);

  // Precompute Taktknoten profiles for hub stations
  const hubTaktMap = useMemo(() => {
    const map = new Map<string, { label: string; dominant: string[]; classification: string }>();
    for (const s of stations) {
      if (s.isHub) {
        const profile = getStationTaktProfile(s.name, lines);
        const tags: string[] = [];
        if (profile.dominantNodes.includes('um')) tags.push('.00 (Um)');
        if (profile.dominantNodes.includes('halb')) tags.push('.30 (Halb)');
        if (profile.dominantNodes.includes('viertel_ab')) tags.push('.15 (Viertel ab)');
        if (profile.dominantNodes.includes('viertel_vor')) tags.push('.45 (Viertel vor)');

        map.set(s.id, {
          label: tags.length > 0 ? tags.join(' • ') : 'Taktknoten',
          dominant: profile.dominantNodes,
          classification: profile.classification,
        });
      }
    }
    return map;
  }, [stations, lines]);

  const handleStationClick = useCallback(
    (station: Station) => {
      setSelectedStation(station);
      setSelectedLine(null);
    },
    [setSelectedStation, setSelectedLine],
  );

  const handleEdgeClick = useCallback(
    (edge: NetworkEdge) => {
      const cat = getHighestPriorityCategory(edge.lines);
      if (cat) {
        const lineRef = edge.lines.find((ref) => ref.startsWith(cat + ' '));
        const lineName = lineRef ? lineRef.split(' ').slice(1).join(' ') : '';
        const line = lines.find((l) => l.category === cat && l.name === lineName);
        if (line) {
          setSelectedLine(line);
          setSelectedStation(null);
        }
      }
    },
    [lines, setSelectedLine, setSelectedStation],
  );

  const handleFlyTo = (lat: number, lon: number) => {
    if (mapInstance) {
      mapInstance.flyTo([lat, lon], 11, { duration: 1.2 });
    }
  };

  const totalModCount = travelTimeModifications.length + departureModifications.length;

  return (
    <div className="h-full w-full relative" style={{ height: '100%', width: '100%' }}>
      {/* Floating Map Legend & Changes Overlay */}
      <div className="absolute top-3 right-3 z-[1000] max-w-sm pointer-events-auto">
        <div className="bg-white/95 backdrop-blur-md rounded-xl shadow-lg border border-gray-200 overflow-hidden text-xs">
          {/* Header */}
          <div
            className="px-3 py-2 bg-gradient-to-r from-gray-900 to-gray-800 text-white flex items-center justify-between cursor-pointer select-none"
            onClick={() => setIsOverlayExpanded(!isOverlayExpanded)}
          >
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="font-bold text-sm">Fahrplan-Änderungen</span>
              {totalModCount > 0 && (
                <span className="bg-emerald-500 text-white font-bold px-1.5 py-0.2 rounded-full text-[10px]">
                  {totalModCount}
                </span>
              )}
            </div>
            <span className="text-gray-400 hover:text-white text-xs">
              {isOverlayExpanded ? '▲' : '▼'}
            </span>
          </div>

          {isOverlayExpanded && (
            <div className="p-3 space-y-2.5 max-h-[360px] overflow-y-auto">
              {totalModCount === 0 ? (
                <div className="text-gray-500 py-1">
                  <p className="font-medium text-gray-700">Noch keine Änderungen</p>
                  <p className="text-[11px] text-gray-400 mt-1">
                    Wähle im <b>Editor</b> eine Linie aus und verstelle Fahrzeiten oder Abfahrten, um die Änderungen hier live auf der Karte hervorzuheben.
                  </p>
                </div>
              ) : (
                <>
                  {/* Summary badges */}
                  <div className="flex items-center gap-2 flex-wrap pb-2 border-b border-gray-100">
                    {totalSavedSeconds > 0 && (
                      <div className="bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-1 rounded-md font-bold">
                        ⚡ −{formatDuration(totalSavedSeconds)} gespart
                      </div>
                    )}
                    <div className="bg-blue-50 text-blue-800 border border-blue-200 px-2 py-1 rounded-md font-medium">
                      {uniqueModifiedSegments.length} Strecke(n)
                    </div>
                    {infrastructureProjects.length > 0 && (
                      <div className="bg-purple-50 text-purple-800 border border-purple-200 px-2 py-1 rounded-md font-medium">
                        🏗️ {infrastructureProjects.length} Projekt(e)
                      </div>
                    )}
                  </div>

                  {/* Toggle: Dim unmodified */}
                  <label className="flex items-center gap-2 text-gray-700 cursor-pointer pt-0.5">
                    <input
                      type="checkbox"
                      checked={dimUnmodified}
                      onChange={(e) => setDimUnmodified(e.target.checked)}
                      className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                    />
                    <span className="font-medium text-[11px]">
                      Nur geänderte Strecken hervorheben
                    </span>
                  </label>

                  {/* List of modified segments */}
                  <div className="space-y-1 pt-1">
                    <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                      Aktive Abschnitte:
                    </div>
                    {uniqueModifiedSegments.map((item) => (
                      <div
                        key={`${item.fromName}_${item.toName}`}
                        onClick={() => handleFlyTo(item.midLat, item.midLon)}
                        className="flex items-center justify-between p-1.5 rounded-lg border border-gray-200 hover:border-emerald-400 hover:bg-emerald-50/50 cursor-pointer transition-all"
                        title="Auf Karte zentrieren"
                      >
                        <div className="min-w-0 pr-1">
                          <div className="font-bold text-gray-900 truncate">
                            {item.fromName} ↔ {item.toName}
                          </div>
                          {item.infraProject && (
                            <div className="text-[10px] font-semibold text-purple-700 truncate">
                              🏗️ {item.infraProject.name}
                            </div>
                          )}
                        </div>
                        <span
                          className={`px-1.5 py-0.5 rounded font-bold text-[11px] shrink-0 ${
                            item.deltaSeconds < 0
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {item.deltaSeconds < 0 ? '−' : '+'}{formatDuration(Math.abs(item.deltaSeconds))}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <MapContainer
        center={SWISS_CENTER}
        zoom={SWISS_ZOOM}
        className="h-full w-full"
        style={{ height: '100%', width: '100%' }}
        zoomControl={true}
        scrollWheelZoom={true}
        ref={setMapInstance}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* Edges / Polylines */}
        {filteredEdges.map((edge) => {
          const edgeKey = `${edge.from}_${edge.to}`;
          const reverseKey = `${edge.to}_${edge.from}`;
          const nameKey1 = `${edge.fromName}_${edge.toName}`;
          const nameKey2 = `${edge.toName}_${edge.fromName}`;

          const cat = getHighestPriorityCategory(edge.lines);
          const baseColor = cat ? CATEGORY_COLORS[cat] : '#999';

          // Look up modification info
          const modInfo =
            modifiedSegmentsMap.get(nameKey1) ||
            modifiedSegmentsMap.get(nameKey2) ||
            modifiedSegmentsMap.get(edgeKey) ||
            modifiedSegmentsMap.get(reverseKey);

          const isModified = modInfo !== undefined;

          // Check if this edge belongs to the selected line
          const isOnSelectedLine =
            selectedLineEdgeSet !== null &&
            (selectedLineEdgeSet.has(edgeKey) ||
              selectedLineEdgeSet.has(reverseKey) ||
              selectedLineEdgeSet.has(nameKey1) ||
              selectedLineEdgeSet.has(nameKey2));

          const isDimmed =
            (selectedLineEdgeSet !== null && !isOnSelectedLine) ||
            (dimUnmodified && !isModified);

          const positions: LatLngExpression[] = [
            [edge.fromLat, edge.fromLon],
            [edge.toLat, edge.toLon],
          ];

          // Styling based on modifications
          let color = baseColor;
          let weight = isOnSelectedLine ? 5 : 2.5;
          let opacity = isDimmed ? 0.08 : 0.85;
          let dashArray: string | undefined = undefined;

          if (isModified && modInfo) {
            if (modInfo.infraProject) {
              color = modInfo.infraProject.color;
              weight = 6;
              dashArray = '10 6';
            } else if (modInfo.deltaSeconds < 0) {
              color = '#059669'; // Emerald green (accelerated)
              weight = 6;
            } else {
              color = '#dc2626'; // Red (slowed down)
              weight = 6;
            }
            opacity = 1;
          }

          const pathOptions: PathOptions = {
            color,
            weight,
            opacity,
            dashArray,
          };

          return (
            <React.Fragment key={edgeKey}>
              {/* Glowing halo layer underneath modified segments */}
              {isModified && modInfo && (
                <Polyline
                  key={`halo-${edgeKey}`}
                  positions={positions}
                  pathOptions={{
                    color: modInfo.infraProject
                      ? modInfo.infraProject.color
                      : modInfo.deltaSeconds < 0
                      ? '#34d399'
                      : '#f87171',
                    weight: 14,
                    opacity: 0.4,
                  }}
                />
              )}

              {/* Foreground edge */}
              <Polyline
                positions={positions}
                pathOptions={pathOptions}
                eventHandlers={{
                  click: () => handleEdgeClick(edge),
                  mouseover: () => setHoveredEdge(edge),
                  mouseout: () => setHoveredEdge(null),
                }}
              >
                {/* Rich tooltip for modified segments */}
                {isModified && modInfo && (
                  <Tooltip sticky direction="top" opacity={0.96}>
                    <div className="p-1 text-xs min-w-[140px]">
                      <div className="font-bold flex items-center gap-1.5">
                        {modInfo.infraProject ? (
                          <span className="text-purple-700">🏗️ {modInfo.infraProject.name}</span>
                        ) : modInfo.deltaSeconds < 0 ? (
                          <span className="text-emerald-700">⚡ Fahrzeit verkürzt</span>
                        ) : (
                          <span className="text-red-600">⏱️ Fahrzeit verlängert</span>
                        )}
                      </div>
                      <div className="text-gray-900 font-semibold mt-0.5">
                        {edge.fromName} ↔ {edge.toName}
                      </div>
                      <div className="mt-1 flex items-center gap-2">
                        <span
                          className={`font-bold text-sm ${
                            modInfo.deltaSeconds < 0 ? 'text-emerald-700' : 'text-red-700'
                          }`}
                        >
                          {modInfo.deltaSeconds < 0 ? '−' : '+'}{formatDuration(Math.abs(modInfo.deltaSeconds))}
                        </span>
                        <span className="text-gray-500 text-[10px]">
                          (Neu: {formatDuration(modInfo.newTime)} | Vorher: {formatDuration(modInfo.originalTime)})
                        </span>
                      </div>
                    </div>
                  </Tooltip>
                )}
              </Polyline>
            </React.Fragment>
          );
        })}

        {/* Stations / CircleMarkers */}
        {filteredStations.map((station) => {
          const isSelected = selectedStation?.id === station.id;
          const isStationModified = modifiedStationsMap.has(station.name.toLowerCase());
          const modStationInfo = modifiedStationsMap.get(station.name.toLowerCase());

          const radius = isSelected ? 8 : station.isHub ? 6 : 3;
          const fillColor = isSelected
            ? '#f59e0b'
            : isStationModified
            ? '#10b981'
            : station.isHub
            ? '#1e293b'
            : '#64748b';
          const fillOpacity = station.isHub || isStationModified ? 0.95 : 0.6;

          return (
            <React.Fragment key={station.id}>
              {/* Pulsing ring around modified stations */}
              {isStationModified && (
                <CircleMarker
                  center={[station.lat, station.lon]}
                  radius={12}
                  pathOptions={{
                    color: '#10b981',
                    weight: 3,
                    dashArray: '4 4',
                    fillColor: '#34d399',
                    fillOpacity: 0.25,
                  }}
                />
              )}

              <CircleMarker
                center={[station.lat, station.lon]}
                radius={radius}
                pathOptions={{
                  color: isSelected ? '#f59e0b' : isStationModified ? '#059669' : '#fff',
                  weight: isSelected ? 3 : isStationModified ? 2.5 : 1,
                  fillColor,
                  fillOpacity,
                }}
                eventHandlers={{
                  click: () => handleStationClick(station),
                }}
              >
                {(station.isHub || isStationModified) && (
                  <Tooltip direction="top" offset={[0, -8]} opacity={0.95}>
                    <div className="text-xs p-1 min-w-[130px]">
                      <div className="font-bold text-gray-900">{station.name}</div>
                      <div className="text-[10px] text-gray-500 font-medium">
                        {hubTaktMap.get(station.id)?.classification || (isStationModified ? 'Angepasste Station' : 'Knotenbahnhof')}
                      </div>

                      {/* Station modification note */}
                      {isStationModified && modStationInfo && (
                        <div className="mt-1 text-[10px] bg-emerald-50 text-emerald-800 font-bold px-1.5 py-0.5 rounded border border-emerald-200">
                          ⏱️ Abfahrt neu: {formatTime(modStationInfo.newDep)} (orig. {formatTime(modStationInfo.originalDep)})
                        </div>
                      )}

                      {/* Taktknoten badges */}
                      <div className="mt-1 flex flex-wrap gap-1">
                        {hubTaktMap.get(station.id)?.dominant.map((node) => {
                          const badge =
                            node === 'um'
                              ? { text: '.00 (Um)', cls: 'bg-emerald-100 text-emerald-800 border-emerald-300' }
                              : node === 'halb'
                              ? { text: '.30 (Halb)', cls: 'bg-blue-100 text-blue-800 border-blue-300' }
                              : node === 'viertel_ab'
                              ? { text: '.15 (Viertel ab)', cls: 'bg-amber-100 text-amber-800 border-amber-300' }
                              : { text: '.45 (Viertel vor)', cls: 'bg-purple-100 text-purple-800 border-purple-300' };
                          return (
                            <span
                              key={node}
                              className={`px-1.5 py-0.2 rounded text-[10px] font-bold border ${badge.cls}`}
                            >
                              {badge.text}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  </Tooltip>
                )}
              </CircleMarker>
            </React.Fragment>
          );
        })}
      </MapContainer>
    </div>
  );
};

export default NetworkMap;
