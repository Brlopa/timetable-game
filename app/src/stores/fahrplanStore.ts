import { create } from 'zustand';
import type {
  Line, Station, NetworkEdge, DataSummary,
  YearKey, ViewMode, LineCategory,
  TravelTimeModification, DepartureModification,
  TaktModification, InfrastructureProject,
} from '../types';
import { generateId, timeToSeconds } from '../utils/constants';
import { calculateSynchronizedLine, calculateSegmentTimeFromTimes, type CalculatedLine } from '../utils/timetable';

interface FahrplanState {
  // Data loading
  loading: boolean;
  error: string | null;

  // Selected year
  activeYear: YearKey;
  compareYear: YearKey | null;

  // Data per year
  data: Record<YearKey, {
    lines: Line[];
    stations: Station[];
    network: NetworkEdge[];
    summary: DataSummary | null;
  }>;

  // View state
  viewMode: ViewMode;
  selectedLine: Line | null;
  selectedStation: Station | null;
  hoveredEdge: NetworkEdge | null;

  // Filters
  visibleCategories: Set<LineCategory>;
  searchQuery: string;
  showHubsOnly: boolean;

  // Optimizations (only for active year)
  travelTimeModifications: TravelTimeModification[];
  departureModifications: DepartureModification[];
  taktModifications: TaktModification[];
  infrastructureProjects: InfrastructureProject[];

  // Actions
  setActiveYear: (year: YearKey) => void;
  setCompareYear: (year: YearKey | null) => void;
  setViewMode: (mode: ViewMode) => void;
  setSelectedLine: (line: Line | null) => void;
  setSelectedStation: (station: Station | null) => void;
  setHoveredEdge: (edge: NetworkEdge | null) => void;
  toggleCategory: (cat: LineCategory) => void;
  setSearchQuery: (query: string) => void;
  setShowHubsOnly: (val: boolean) => void;
  loadData: (year: YearKey) => Promise<void>;

  // Modification actions
  addTravelTimeMod: (mod: Omit<TravelTimeModification, 'segmentKey'> & { segmentKey: string }) => void;
  removeTravelTimeMod: (segmentKey: string) => void;
  updateTravelTimeMod: (segmentKey: string, newTime: number) => void;
  addDepartureMod: (mod: DepartureModification) => void;
  removeDepartureMod: (lineId: string, stopId: string) => void;
  addTaktMod: (mod: TaktModification) => void;
  removeTaktMod: (lineId: string) => void;
  addInfraProject: (project: Omit<InfrastructureProject, 'id'>) => void;
  removeInfraProject: (id: string) => void;
  resetModifications: () => void;

  // Synchronized modification actions
  setStopDeparture: (line: Line, stopIndex: number, newDepartureTime: string) => void;
  setStopArrival: (line: Line, stopIndex: number, newArrivalTime: string) => void;
  setSegmentTravelTime: (segmentKey: string, newTime: number, originalTime?: number) => void;

  // Computed helpers
  getModifiedLine: (line: Line) => CalculatedLine;
  getStationLines: (stationId: string) => Line[];
}

const ALL_CATEGORIES: LineCategory[] = [
  'IC', 'IR', 'RE', 'R', 'S', 'EC', 'ICE', 'TGV', 'PE', 'RJX', 'NJ', 'SN', 'RB', 'EXT', 'CC', 'FAE', 'RER',
];

export const useFahrplanStore = create<FahrplanState>((set, get) => ({
  loading: false,
  error: null,
  activeYear: '2026',
  compareYear: null,
  data: {
    '2026': { lines: [], stations: [], network: [], summary: null },
    '2027': { lines: [], stations: [], network: [], summary: null },
  },
  viewMode: 'map',
  selectedLine: null,
  selectedStation: null,
  hoveredEdge: null,
  visibleCategories: new Set(ALL_CATEGORIES),
  searchQuery: '',
  showHubsOnly: false,
  travelTimeModifications: [],
  departureModifications: [],
  taktModifications: [],
  infrastructureProjects: [],

  setActiveYear: (year) => set({ activeYear: year }),
  setCompareYear: (year) => set({ compareYear: year }),
  setViewMode: (mode) => set({ viewMode: mode }),
  setSelectedLine: (line) => set({ selectedLine: line }),
  setSelectedStation: (station) => set({ selectedStation: station }),
  setHoveredEdge: (edge) => set({ hoveredEdge: edge }),

  toggleCategory: (cat) => set((state) => {
    const next = new Set(state.visibleCategories);
    if (next.has(cat)) next.delete(cat);
    else next.add(cat);
    return { visibleCategories: next };
  }),

  setSearchQuery: (query) => set({ searchQuery: query }),
  setShowHubsOnly: (val) => set({ showHubsOnly: val }),

  loadData: async (year) => {
    const state = get();
    if (state.data[year].summary) return; // already loaded

    set({ loading: true, error: null });
    try {
      const [linesRes, stationsRes, networkRes, summaryRes] = await Promise.all([
        fetch(`/data/${year}/lines.json`),
        fetch(`/data/${year}/stations.json`),
        fetch(`/data/${year}/network.json`),
        fetch(`/data/${year}/summary.json`),
      ]);

      const [lines, stations, network, summary] = await Promise.all([
        linesRes.json(),
        stationsRes.json(),
        networkRes.json(),
        summaryRes.json(),
      ]);

      set((state) => ({
        loading: false,
        data: {
          ...state.data,
          [year]: { lines, stations, network, summary },
        },
      }));
    } catch (err) {
      set({ loading: false, error: `Fehler beim Laden der Daten für ${year}: ${err}` });
    }
  },

  addTravelTimeMod: (mod) => set((state) => ({
    travelTimeModifications: [
      ...state.travelTimeModifications.filter((m) => m.segmentKey !== mod.segmentKey),
      mod,
    ],
  })),
  removeTravelTimeMod: (key) => set((state) => ({
    travelTimeModifications: state.travelTimeModifications.filter((m) => m.segmentKey !== key),
  })),
  updateTravelTimeMod: (key, newTime) => set((state) => ({
    travelTimeModifications: state.travelTimeModifications.map((m) =>
      m.segmentKey === key ? { ...m, newTime } : m
    ),
  })),
  addDepartureMod: (mod) => set((state) => ({
    departureModifications: [
      ...state.departureModifications.filter(
        (m) => !(m.lineId === mod.lineId && m.stopId === mod.stopId)
      ),
      mod,
    ],
  })),
  removeDepartureMod: (lineId, stopId) => set((state) => ({
    departureModifications: state.departureModifications.filter(
      (m) => !(m.lineId === lineId && m.stopId === stopId)
    ),
  })),
  addTaktMod: (mod) => set((state) => ({
    taktModifications: [
      ...state.taktModifications.filter((m) => m.lineId !== mod.lineId),
      mod,
    ],
  })),
  removeTaktMod: (lineId) => set((state) => ({
    taktModifications: state.taktModifications.filter((m) => m.lineId !== lineId),
  })),
  addInfraProject: (project) => set((state) => ({
    infrastructureProjects: [
      ...state.infrastructureProjects,
      { ...project, id: generateId() },
    ],
  })),
  removeInfraProject: (id) => set((state) => ({
    infrastructureProjects: state.infrastructureProjects.filter((p) => p.id !== id),
  })),
  resetModifications: () => set({
    travelTimeModifications: [],
    departureModifications: [],
    taktModifications: [],
    infrastructureProjects: [],
  }),

  getModifiedLine: (line) => {
    const state = get();
    return calculateSynchronizedLine(
      line,
      state.travelTimeModifications,
      state.departureModifications,
      state.taktModifications
    );
  },

  setStopDeparture: (line, stopIndex, newDepartureTime) => {
    const state = get();
    const calculated = calculateSynchronizedLine(
      line,
      state.travelTimeModifications,
      state.departureModifications,
      state.taktModifications
    );

    const stop = calculated.calculatedStops[stopIndex];
    if (!stop) return;

    const targetDeparture = newDepartureTime.length === 5 ? newDepartureTime + ':00' : newDepartureTime;
    const targetDepSecs = timeToSeconds(targetDeparture);

    if (stopIndex === 0) {
      set((s) => ({
        departureModifications: [
          ...s.departureModifications.filter((m) => !(m.lineId === line.id && m.stopId === stop.id)),
          {
            lineId: line.id,
            stopId: stop.id,
            originalDeparture: stop.originalDeparture || stop.departure,
            newDeparture: targetDeparture,
          },
        ],
      }));
    } else {
      const prevStop = calculated.calculatedStops[stopIndex - 1];
      const prevDepSecs = prevStop.departureSeconds;
      const dwellSecs = stop.dwellSeconds;
      const prevSeg = line.segments[stopIndex - 1];
      const segKey = `${prevSeg.fromStop}_${prevSeg.toStop}`;

      const newTravelTime = calculateSegmentTimeFromTimes(prevDepSecs, targetDepSecs, dwellSecs);

      set((s) => ({
        travelTimeModifications: [
          ...s.travelTimeModifications.filter((m) => m.segmentKey !== segKey),
          {
            segmentKey: segKey,
            originalTime: prevSeg.travelTime,
            newTime: newTravelTime,
            reason: 'Abfahrtszeit angepasst',
            isInfrastructure: false,
          },
        ],
        departureModifications: [
          ...s.departureModifications.filter((m) => !(m.lineId === line.id && m.stopId === stop.id)),
          {
            lineId: line.id,
            stopId: stop.id,
            originalDeparture: stop.originalDeparture || stop.departure,
            newDeparture: targetDeparture,
          },
        ],
      }));
    }
  },

  setStopArrival: (line, stopIndex, newArrivalTime) => {
    if (stopIndex === 0) return;
    const state = get();
    const calculated = calculateSynchronizedLine(
      line,
      state.travelTimeModifications,
      state.departureModifications,
      state.taktModifications
    );

    const stop = calculated.calculatedStops[stopIndex];
    if (!stop) return;

    const targetArrival = newArrivalTime.length === 5 ? newArrivalTime + ':00' : newArrivalTime;
    const targetArrSecs = timeToSeconds(targetArrival);

    const prevStop = calculated.calculatedStops[stopIndex - 1];
    const prevDepSecs = prevStop.departureSeconds;
    const prevSeg = line.segments[stopIndex - 1];
    const segKey = `${prevSeg.fromStop}_${prevSeg.toStop}`;

    const newTravelTime = calculateSegmentTimeFromTimes(prevDepSecs, targetArrSecs, 0);

    set((s) => ({
      travelTimeModifications: [
        ...s.travelTimeModifications.filter((m) => m.segmentKey !== segKey),
        {
          segmentKey: segKey,
          originalTime: prevSeg.travelTime,
          newTime: newTravelTime,
          reason: 'Ankunftszeit angepasst',
          isInfrastructure: false,
        },
      ],
    }));
  },

  setSegmentTravelTime: (segmentKey, newTime, originalTime) => {
    set((s) => {
      const existing = s.travelTimeModifications.find((m) => m.segmentKey === segmentKey);
      const orig = existing ? existing.originalTime : (originalTime ?? newTime);

      return {
        travelTimeModifications: [
          ...s.travelTimeModifications.filter((m) => m.segmentKey !== segmentKey),
          {
            segmentKey,
            originalTime: orig,
            newTime,
            reason: existing?.reason || '',
            isInfrastructure: existing?.isInfrastructure || false,
          },
        ],
      };
    });
  },

  getStationLines: (stationId) => {
    const state = get();
    const lines = state.data[state.activeYear].lines;
    return lines.filter((line) =>
      line.stops.some((s) => s.id === stationId || s.id.startsWith(stationId))
    );
  },
}));
