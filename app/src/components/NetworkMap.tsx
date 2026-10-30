import React, { useMemo, useCallback } from 'react';
import { MapContainer, TileLayer, Polyline, CircleMarker, Tooltip } from 'react-leaflet';
import type { LatLngExpression, PathOptions } from 'leaflet';
import type { NetworkEdge, Station, LineCategory } from '../types';
import { useFahrplanStore } from '../stores/fahrplanStore';
import { CATEGORY_COLORS, CATEGORY_PRIORITY, SWISS_CENTER, SWISS_ZOOM } from '../utils/constants';
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
  const infrastructureProjects = useFahrplanStore((s) => s.infrastructureProjects);
  const setSelectedStation = useFahrplanStore((s) => s.setSelectedStation);
  const setSelectedLine = useFahrplanStore((s) => s.setSelectedLine);
  const setHoveredEdge = useFahrplanStore((s) => s.setHoveredEdge);

  const { lines, stations, network } = data;

  // Build set of modified segment keys
  const modifiedSegmentKeys = useMemo(
    () => new Set(travelTimeModifications.map((m) => m.segmentKey)),
    [travelTimeModifications],
  );

  // Build set of infrastructure-affected segment keys and their colors
  const infraSegmentMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const project of infrastructureProjects) {
      for (const segKey of project.affectedSegments) {
        map.set(segKey, project.color);
      }
    }
    return map;
  }, [infrastructureProjects]);

  // Set of line IDs belonging to the selected line (for highlighting)
  const selectedLineEdgeSet = useMemo(() => {
    if (!selectedLine) return null;
    const segKeys = new Set<string>();
    for (const seg of selectedLine.segments) {
      segKeys.add(`${seg.fromStop}_${seg.toStop}`);
      segKeys.add(`${seg.toStop}_${seg.fromStop}`);
    }
    return segKeys;
  }, [selectedLine]);

  // Filter edges by visible categories
  const filteredEdges = useMemo(() => {
    return network.filter((edge) => {
      const cat = getHighestPriorityCategory(edge.lines);
      return cat !== null && visibleCategories.has(cat);
    });
  }, [network, lines, visibleCategories]);

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
      // Select the highest-priority line on this edge
      const cat = getHighestPriorityCategory(edge.lines);
      if (cat) {
        // edge.lines are like "IC IC1", "S S10" - match by category + name
        const lineRef = edge.lines.find((ref) => ref.startsWith(cat + ' '));
        const lineName = lineRef ? lineRef.split(' ').slice(1).join(' ') : '';
        const line = lines.find(
          (l) => l.category === cat && l.name === lineName,
        );
        if (line) {
          setSelectedLine(line);
          setSelectedStation(null);
        }
      }
    },
    [lines, setSelectedLine, setSelectedStation],
  );

  return (
    <div className="h-full w-full" style={{ height: '100%', width: '100%' }}>
      <MapContainer
        center={SWISS_CENTER}
        zoom={SWISS_ZOOM}
        className="h-full w-full"
        style={{ height: '100%', width: '100%' }}
        zoomControl={true}
        scrollWheelZoom={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* Edges / Polylines */}
        {filteredEdges.map((edge) => {
          const edgeKey = `${edge.from}_${edge.to}`;
          const reverseKey = `${edge.to}_${edge.from}`;
          const cat = getHighestPriorityCategory(edge.lines);
          const baseColor = cat ? CATEGORY_COLORS[cat] : '#999';

          // Check for infrastructure project overlay
          const infraColor = infraSegmentMap.get(edgeKey) || infraSegmentMap.get(reverseKey);
          const isModified = modifiedSegmentKeys.has(edgeKey) || modifiedSegmentKeys.has(reverseKey);

          // Check if this edge belongs to the selected line
          const isOnSelectedLine =
            selectedLineEdgeSet !== null &&
            (selectedLineEdgeSet.has(edgeKey) || selectedLineEdgeSet.has(reverseKey));
          const isDimmed = selectedLineEdgeSet !== null && !isOnSelectedLine;

          const positions: LatLngExpression[] = [
            [edge.fromLat, edge.fromLon],
            [edge.toLat, edge.toLon],
          ];

          const weight = isOnSelectedLine ? 5 : isModified ? 4 : 2.5;
          const opacity = isDimmed ? 0.15 : 0.85;
          const color = infraColor || baseColor;
          const dashArray = infraColor ? '8 6' : undefined;

          const pathOptions: PathOptions = {
            color,
            weight,
            opacity,
            dashArray,
          };

          return (
            <Polyline
              key={edgeKey}
              positions={positions}
              pathOptions={pathOptions}
              eventHandlers={{
                click: () => handleEdgeClick(edge),
                mouseover: () => setHoveredEdge(edge),
                mouseout: () => setHoveredEdge(null),
              }}
            />
          );
        })}

        {/* Stations / CircleMarkers */}
        {filteredStations.map((station) => {
          const isSelected = selectedStation?.id === station.id;
          const radius = station.isHub ? 6 : 3;
          const fillColor = isSelected ? '#f59e0b' : station.isHub ? '#1e293b' : '#64748b';
          const fillOpacity = station.isHub ? 0.9 : 0.6;

          return (
            <CircleMarker
              key={station.id}
              center={[station.lat, station.lon]}
              radius={radius}
              pathOptions={{
                color: isSelected ? '#f59e0b' : '#fff',
                weight: isSelected ? 3 : 1,
                fillColor,
                fillOpacity,
              }}
              eventHandlers={{
                click: () => handleStationClick(station),
              }}
            >
              {station.isHub && (
                <Tooltip direction="top" offset={[0, -8]} opacity={0.95}>
                  <div className="text-xs p-1 min-w-[130px]">
                    <div className="font-bold text-gray-900">{station.name}</div>
                    <div className="text-[10px] text-gray-500 font-medium">
                      {hubTaktMap.get(station.id)?.classification || 'Knotenbahnhof'}
                    </div>
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
          );
        })}
      </MapContainer>
    </div>
  );
};

export default NetworkMap;
