import type { Line } from '../types';

export type TaktNodeType = 'um' | 'viertel_ab' | 'halb' | 'viertel_vor' | 'zwischen';

export interface TaktNodeInfo {
  type: TaktNodeType;
  minute: number;
  targetMinute: number;  // 0, 15, 30, 45, or minute
  label: string;         // e.g. "Um (.00)"
  shortLabel: string;    // e.g. ".00 (Um)"
  colloquial: string;    // "um", "viertel ab", "halb", "viertel vor"
  deltaMinutes: number;  // difference to ideal node: e.g. +2 for .02
  color: string;
  bgColor: string;
  textColor: string;
  borderColor: string;
}

/**
 * Classifies an arrival/departure minute into the Swiss ITF Taktknoten system:
 * - Um (.00): 55-05
 * - Viertel ab / Viertel nach (.15): 10-20
 * - Halb (.30): 25-35
 * - Viertel vor / Dreiviertel (.45): 40-50
 * - Zwischen: 06-09, 21-24, 36-39, 51-54
 */
export function getTaktNode(timeStr?: string): TaktNodeInfo {
  if (!timeStr) {
    return {
      type: 'zwischen',
      minute: 0,
      targetMinute: 0,
      label: 'Keine Zeit',
      shortLabel: '—',
      colloquial: '—',
      deltaMinutes: 0,
      color: '#9ca3af',
      bgColor: 'bg-gray-100',
      textColor: 'text-gray-600',
      borderColor: 'border-gray-200',
    };
  }

  const parts = timeStr.split(':');
  const minute = parseInt(parts[1] || '0', 10);

  // Check Um (.00): 55-59 or 0-5
  if (minute >= 55 || minute <= 5) {
    const delta = minute >= 55 ? minute - 60 : minute;
    return {
      type: 'um',
      minute,
      targetMinute: 0,
      label: "Um (Vollknoten .00)",
      shortLabel: ".00 (Um)",
      colloquial: "um",
      deltaMinutes: delta,
      color: '#10b981',       // Emerald
      bgColor: 'bg-emerald-50',
      textColor: 'text-emerald-800',
      borderColor: 'border-emerald-300',
    };
  }

  // Check Viertel ab (.15): 10-20
  if (minute >= 10 && minute <= 20) {
    return {
      type: 'viertel_ab',
      minute,
      targetMinute: 15,
      label: "Viertel ab (.15)",
      shortLabel: ".15 (Viertel ab)",
      colloquial: "viertel ab",
      deltaMinutes: minute - 15,
      color: '#f59e0b',       // Amber
      bgColor: 'bg-amber-50',
      textColor: 'text-amber-800',
      borderColor: 'border-amber-300',
    };
  }

  // Check Halb (.30): 25-35
  if (minute >= 25 && minute <= 35) {
    return {
      type: 'halb',
      minute,
      targetMinute: 30,
      label: "Halb (Halbknoten .30)",
      shortLabel: ".30 (Halb)",
      colloquial: "halb",
      deltaMinutes: minute - 30,
      color: '#3b82f6',       // Blue
      bgColor: 'bg-blue-50',
      textColor: 'text-blue-800',
      borderColor: 'border-blue-300',
    };
  }

  // Check Viertel vor (.45): 40-50
  if (minute >= 40 && minute <= 50) {
    return {
      type: 'viertel_vor',
      minute,
      targetMinute: 45,
      label: "Viertel vor (.45)",
      shortLabel: ".45 (Viertel vor)",
      colloquial: "viertel vor",
      deltaMinutes: minute - 45,
      color: '#8b5cf6',       // Purple
      bgColor: 'bg-purple-50',
      textColor: 'text-purple-800',
      borderColor: 'border-purple-300',
    };
  }

  // Zwischenzeit
  return {
    type: 'zwischen',
    minute,
    targetMinute: minute,
    label: `Zwischentakt (: ${minute.toString().padStart(2, '0')})`,
    shortLabel: `:${minute.toString().padStart(2, '0')}`,
    colloquial: `:${minute.toString().padStart(2, '0')}`,
    deltaMinutes: 0,
    color: '#6b7280',         // Gray
    bgColor: 'bg-gray-50',
    textColor: 'text-gray-700',
    borderColor: 'border-gray-200',
  };
}

export interface StationTaktProfile {
  stationName: string;
  totalLines: number;
  nodeCounts: Record<TaktNodeType, number>;
  nodeLines: Record<TaktNodeType, { line: Line; time: string; minute: number }[]>;
  dominantNodes: TaktNodeType[];
  classification: string;
}

/**
 * Computes the full Taktknoten profile for a station given all lines passing through it.
 */
export function getStationTaktProfile(stationName: string, lines: Line[]): StationTaktProfile {
  const nodeCounts: Record<TaktNodeType, number> = {
    um: 0,
    viertel_ab: 0,
    halb: 0,
    viertel_vor: 0,
    zwischen: 0,
  };

  const nodeLines: Record<TaktNodeType, { line: Line; time: string; minute: number }[]> = {
    um: [],
    viertel_ab: [],
    halb: [],
    viertel_vor: [],
    zwischen: [],
  };

  for (const line of lines) {
    const stop = line.stops.find((s) =>
      s.name.toLowerCase() === stationName.toLowerCase() ||
      s.name.toLowerCase().includes(stationName.toLowerCase()) ||
      stationName.toLowerCase().includes(s.name.toLowerCase())
    );

    if (stop) {
      const timeStr = stop.departure || stop.arrival;
      if (timeStr) {
        const nodeInfo = getTaktNode(timeStr);
        nodeCounts[nodeInfo.type]++;
        nodeLines[nodeInfo.type].push({
          line,
          time: timeStr,
          minute: nodeInfo.minute,
        });
      }
    }
  }

  const totalLines = Object.values(nodeCounts).reduce((a, b) => a + b, 0);

  // Determine dominant nodes (nodes with significant share)
  const dominantNodes: TaktNodeType[] = [];
  if (nodeCounts.um >= 3 || (totalLines > 0 && nodeCounts.um / totalLines >= 0.2)) {
    dominantNodes.push('um');
  }
  if (nodeCounts.halb >= 3 || (totalLines > 0 && nodeCounts.halb / totalLines >= 0.2)) {
    dominantNodes.push('halb');
  }
  if (nodeCounts.viertel_ab >= 3 || (totalLines > 0 && nodeCounts.viertel_ab / totalLines >= 0.2)) {
    dominantNodes.push('viertel_ab');
  }
  if (nodeCounts.viertel_vor >= 3 || (totalLines > 0 && nodeCounts.viertel_vor / totalLines >= 0.2)) {
    dominantNodes.push('viertel_vor');
  }

  // Classification string
  let classification = 'Haltestelle';
  const hasUm = dominantNodes.includes('um');
  const hasHalb = dominantNodes.includes('halb');
  const hasViertel = dominantNodes.includes('viertel_ab') || dominantNodes.includes('viertel_vor');

  if (hasUm && hasHalb && hasViertel) {
    classification = 'Grosser Voll- & Viertelknoten (alle 15 Min)';
  } else if (hasUm && hasHalb) {
    classification = 'Voll- & Halbknoten (.00 Um / .30 Halb)';
  } else if (hasUm) {
    classification = 'Vollknoten (.00 Um)';
  } else if (hasHalb) {
    classification = 'Halbknoten (.30 Halb)';
  } else if (dominantNodes.includes('viertel_ab') && dominantNodes.includes('viertel_vor')) {
    classification = 'Viertelknoten (.15 / .45)';
  } else if (dominantNodes.length > 0) {
    classification = `Knoten (${dominantNodes.map((n) => n === 'um' ? '.00' : n === 'halb' ? '.30' : n === 'viertel_ab' ? '.15' : '.45').join(', ')})`;
  }

  return {
    stationName,
    totalLines,
    nodeCounts,
    nodeLines,
    dominantNodes,
    classification,
  };
}
