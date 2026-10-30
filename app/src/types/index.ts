// TypeScript types for the Fahrplan Optimierer

export interface Station {
  id: string;
  name: string;
  lat: number;
  lon: number;
  isHub: boolean;
  platforms: Platform[];
}

export interface Platform {
  id: string;
  name: string;
  platformCode: string;
}

export interface LineStop {
  id: string;
  name: string;
  arrival: string;
  departure: string;
  lat: number;
  lon: number;
}

export interface Segment {
  fromStop: string;
  fromName: string;
  toStop: string;
  toName: string;
  travelTime: number;     // seconds
  dwellTime: number;       // seconds (halt time at destination)
  fromLat: number;
  fromLon: number;
  toLat: number;
  toLon: number;
}

export interface Line {
  id: string;
  routeId: string;
  name: string;
  category: LineCategory;
  agency: string;
  direction: string;
  headsign: string;
  numTrips: number;
  segments: Segment[];
  stops: LineStop[];
  taktMinutes?: number;
  numDepartures?: number;
  firstDeparture?: string;
  lastDeparture?: string;
}

export interface NetworkEdge {
  from: string;
  fromName: string;
  to: string;
  toName: string;
  lines: string[];
  minTravelTime: number;
  fromLat: number;
  fromLon: number;
  toLat: number;
  toLon: number;
}

export interface DataSummary {
  year: string;
  totalRoutes: number;
  totalLines: number;
  totalStations: number;
  totalEdges: number;
  hubStations: number;
  categories: Record<string, number>;
}

export type LineCategory =
  | 'IC' | 'IR' | 'RE' | 'R' | 'S' | 'EC' | 'ICE'
  | 'TGV' | 'PE' | 'RJX' | 'NJ' | 'SN' | 'RB'
  | 'EXT' | 'CC' | 'FAE' | 'RER';

export type YearKey = '2026' | '2027';

export type ViewMode = 'map' | 'editor' | 'anschlüsse' | 'compare';

// Modification types for the optimizer
export interface TravelTimeModification {
  segmentKey: string;     // fromStop_toStop
  originalTime: number;   // seconds
  newTime: number;        // seconds
  reason: string;         // e.g., "Neuer Tunnel", "Begradigung"
  isInfrastructure: boolean;
}

export interface DepartureModification {
  lineId: string;
  stopId: string;
  originalDeparture: string;
  newDeparture: string;
}

export interface TaktModification {
  lineId: string;
  originalTakt: number;   // minutes
  newTakt: number;        // minutes
}

export interface InfrastructureProject {
  id: string;
  name: string;
  description: string;
  affectedSegments: string[];   // segment keys
  timeSavings: number;          // seconds saved
  estimatedCost?: string;
  color: string;
}

export interface OptimizationState {
  travelTimeModifications: TravelTimeModification[];
  departureModifications: DepartureModification[];
  taktModifications: TaktModification[];
  infrastructureProjects: InfrastructureProject[];
}
