import { create } from 'zustand';
import type {
  Line, Station, NetworkEdge, DataSummary,
  YearKey, ViewMode, LineCategory,
  TravelTimeModification, DepartureModification,
  TaktModification, InfrastructureProject,
} from '../types';
import { generateId } from '../utils/constants';

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

  // Computed helpers
  getModifiedLine: (line: Line) => Line;
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
    const mods = state.travelTimeModifications;
    const taktMod = state.taktModifications.find((m) => m.lineId === line.id);

    const modifiedSegments = line.segments.map((seg) => {
      const segKey = `${seg.fromStop}_${seg.toStop}`;
      const mod = mods.find((m) => m.segmentKey === segKey);
      return mod ? { ...seg, travelTime: mod.newTime } : seg;
    });

    return {
      ...line,
      segments: modifiedSegments,
      taktMinutes: taktMod ? taktMod.newTakt : line.taktMinutes,
    };
  },

  getStationLines: (stationId) => {
    const state = get();
    const lines = state.data[state.activeYear].lines;
    return lines.filter((line) =>
      line.stops.some((s) => s.id === stationId || s.id.startsWith(stationId))
    );
  },
}));
