#!/usr/bin/env python3
"""
Fahrplan 2026 Timetable Optimizer (Ultra-fast MILP / LP Solver via HiGHS).

Optimizes Swiss railway departure times (and allows optional travel time extensions,
without shortening) to maximize connection quality at hub stations (ITF Knoten).
Solves in milliseconds using HiGHS via scipy.optimize.milp.
"""

import argparse
import csv
import json
import os
import sys
import time
from collections import defaultdict
from copy import deepcopy
from typing import Dict, List, Optional, Set, Tuple

import numpy as np
from scipy.optimize import LinearConstraint, milp
from scipy.sparse import dok_matrix

MAJOR_HUBS = [
    'Zürich HB', 'Bern', 'Olten', 'Basel SBB', 'Luzern', 'Winterthur',
    'Biel/Bienne', 'St. Gallen', 'Lausanne', 'Genève', 'Chur', 'Bellinzona',
    'Lugano', 'Aarau', 'Zug', 'Arth-Goldau', 'Thun', 'Spiez', 'Fribourg/Freiburg',
    'Neuchâtel', 'Schaffhausen', 'Baden', 'Visp', 'Brig',
]

def parse_time_to_minutes(time_str: str) -> float:
    """Converts HH:MM:SS or HH:MM to minutes from midnight."""
    if not time_str:
        return 0.0
    parts = time_str.split(':')
    h = int(parts[0])
    m = int(parts[1]) if len(parts) > 1 else 0
    s = int(parts[2]) if len(parts) > 2 else 0
    return h * 60.0 + m + s / 60.0

def format_minutes_to_time(total_minutes: float) -> str:
    """Converts minutes to HH:MM:SS string."""
    m_val = total_minutes % 1440.0
    h = int(m_val // 60)
    m = int(m_val % 60)
    s = int(round((m_val - int(m_val)) * 60))
    if s >= 60:
        s = 0
        m += 1
    if m >= 60:
        m = 0
        h = (h + 1) % 24
    return f"{h:02d}:{m:02d}:{s:02d}"

def is_station_match(stop_name: str, hub_name: str) -> bool:
    """Exact or bilingual match for station names."""
    s = stop_name.strip().lower()
    h = hub_name.strip().lower()
    if s == h:
        return True
    s_parts = [p.strip() for p in s.split('/')]
    h_parts = [p.strip() for p in h.split('/')]
    return any(p in h_parts for p in s_parts) or any(p in s_parts for p in h_parts)

class TimetableOptimizer:
    def __init__(
        self,
        lines_data: List[dict],
        hubs: List[str] = MAJOR_HUBS,
        categories: Optional[List[str]] = None,
        max_runtime_ext: float = 3.0,
        max_shift: float = 8.0,
        min_transfer: float = 4.0,
        ideal_transfer: float = 6.0,
        max_transfer: float = 15.0,
        min_headway: float = 2.0,
        weight_transfer: float = 1.0,
        weight_runtime: float = 1.5,
        weight_deviation: float = 0.2,
        weight_broken: float = 30.0,
        weight_headway: float = 50.0,
        time_limit: float = 15.0,
    ):
        self.raw_lines = lines_data
        self.hubs = hubs
        self.categories = set(categories) if categories else {'IC', 'IR', 'RE'}
        self.max_runtime_ext = max(0.0, max_runtime_ext)
        self.max_shift = max_shift
        self.min_transfer = min_transfer
        self.ideal_transfer = ideal_transfer
        self.max_transfer = max_transfer
        self.min_headway = min_headway
        
        # Objective weights
        self.weight_transfer = weight_transfer
        self.weight_runtime = weight_runtime
        self.weight_deviation = weight_deviation
        self.weight_broken = weight_broken
        self.weight_headway = weight_headway
        self.time_limit = time_limit

        self.filtered_lines: List[dict] = []
        self._filter_lines()

    def _filter_lines(self):
        """Filter lines by category and hub touchpoints."""
        for l in self.raw_lines:
            cat = l.get('category')
            if self.categories and cat not in self.categories:
                continue
            stops = l.get('stops', [])
            if len(stops) < 2:
                continue
            
            touches_hub = any(
                any(is_station_match(s.get('name', ''), h) for h in self.hubs)
                for s in stops
            )
            if touches_hub:
                self.filtered_lines.append(l)

    def build_and_solve(self) -> dict:
        """Formulate and solve the retiming model."""
        start_time = time.time()
        print(f"Loaded {len(self.filtered_lines)} lines for optimization.")
        if not self.filtered_lines:
            return {"error": "No lines match the filtering criteria."}

        # 1. Variables mapping
        var_map: Dict[str, int] = {}
        var_names: List[str] = []
        lb: List[float] = []
        ub: List[float] = []
        c: List[float] = []
        integrality: List[int] = []

        def add_var(name: str, lower: float, upper: float, cost: float, is_int: bool = False) -> int:
            idx = len(var_names)
            var_map[name] = idx
            var_names.append(name)
            lb.append(lower)
            ub.append(upper)
            c.append(cost)
            integrality.append(1 if is_int else 0)
            return idx

        # Line shift and deviation variables
        for l in self.filtered_lines:
            lid = l['id']
            add_var(f"shift_{lid}", -self.max_shift, self.max_shift, cost=0.0)
            add_var(f"dev_{lid}", 0.0, self.max_shift, cost=self.weight_deviation)

            stops = l.get('stops', [])
            for k in range(len(stops) - 1):
                add_var(f"drun_{lid}_{k}", 0.0, self.max_runtime_ext, cost=self.weight_runtime)

        # 2. Hub arrivals and departures
        hub_arrs = defaultdict(list)
        hub_deps = defaultdict(list)

        for l_idx, l in enumerate(self.filtered_lines):
            stops = l.get('stops', [])
            for s_idx, s in enumerate(stops):
                s_name = s.get('name', '')
                for h in self.hubs:
                    if is_station_match(s_name, h):
                        arr_str = s.get('arrival')
                        dep_str = s.get('departure')
                        is_start = (s_idx == 0)
                        is_end = (s_idx == len(stops) - 1)
                        if arr_str and not is_start:
                            arr_min = parse_time_to_minutes(arr_str) % 60.0
                            hub_arrs[h].append((l_idx, s_idx, arr_min))
                        if dep_str and not is_end:
                            dep_min = parse_time_to_minutes(dep_str) % 60.0
                            hub_deps[h].append((l_idx, s_idx, dep_min))

        # 3. Candidate transfers (connections with baseline wait between 1.5 and 18 minutes)
        transfers: List[dict] = []
        for h, arr_list in hub_arrs.items():
            dep_list = hub_deps[h]
            for a_l_idx, a_s_idx, a_min in arr_list:
                for d_l_idx, d_s_idx, d_min in dep_list:
                    if a_l_idx == d_l_idx:
                        continue  # Cannot transfer to self
                    
                    base_wait = (d_min - a_min) % 60.0
                    if 1.5 <= base_wait <= 18.0:
                        transfers.append({
                            'id': f"trans_{len(transfers)}",
                            'hub': h,
                            'from_line_idx': a_l_idx,
                            'from_stop_idx': a_s_idx,
                            'to_line_idx': d_l_idx,
                            'to_stop_idx': d_s_idx,
                            'base_wait': base_wait,
                        })

        print(f"Identified {len(transfers)} candidate connections across {len(self.hubs)} hubs.")

        for t_idx in range(len(transfers)):
            add_var(f"slack_broken_{t_idx}", 0.0, 30.0, cost=self.weight_broken)
            add_var(f"slack_long_{t_idx}", 0.0, 30.0, cost=self.weight_transfer)

        # 4. Constraints
        row_list = []
        rhs_lb = []
        rhs_ub = []

        def add_con(coeffs: Dict[int, float], lower: float, upper: float):
            row_list.append(coeffs)
            rhs_lb.append(lower)
            rhs_ub.append(upper)

        for l in self.filtered_lines:
            lid = l['id']
            i_delta = var_map[f"shift_{lid}"]
            i_dev = var_map[f"dev_{lid}"]
            add_con({i_dev: 1.0, i_delta: -1.0}, 0.0, np.inf)
            add_con({i_dev: 1.0, i_delta: 1.0}, 0.0, np.inf)

        def get_time_expr(l_idx: int, stop_idx: int) -> Dict[int, float]:
            l = self.filtered_lines[l_idx]
            lid = l['id']
            coeffs = {var_map[f"shift_{lid}"]: 1.0}
            if self.max_runtime_ext > 0:
                for k in range(stop_idx):
                    var_name = f"drun_{lid}_{k}"
                    if var_name in var_map:
                        coeffs[var_map[var_name]] = 1.0
            return coeffs

        for t_idx, t in enumerate(transfers):
            a_l = t['from_line_idx']
            a_s = t['from_stop_idx']
            d_l = t['to_line_idx']
            d_s = t['to_stop_idx']
            bw = t['base_wait']

            arr_expr = get_time_expr(a_l, a_s)
            dep_expr = get_time_expr(d_l, d_s)

            diff_expr = defaultdict(float)
            for v, val in dep_expr.items():
                diff_expr[v] += val
            for v, val in arr_expr.items():
                diff_expr[v] -= val

            i_broken = var_map[f"slack_broken_{t_idx}"]
            i_long = var_map[f"slack_long_{t_idx}"]

            c_br = dict(diff_expr)
            c_br[i_broken] = 1.0
            add_con(c_br, self.min_transfer - bw, np.inf)

            c_lg = {k: -v for k, v in diff_expr.items()}
            c_lg[i_long] = 1.0
            add_con(c_lg, bw - self.ideal_transfer, np.inf)

        # 5. Track corridor headway constraints
        seg_deps = defaultdict(list)
        for l_idx, l in enumerate(self.filtered_lines):
            stops = l.get('stops', [])
            for s_idx in range(len(stops) - 1):
                from_n = stops[s_idx].get('name')
                to_n = stops[s_idx + 1].get('name')
                dep_str = stops[s_idx].get('departure')
                if from_n and to_n and dep_str:
                    dep_min = parse_time_to_minutes(dep_str) % 60.0
                    seg_deps[(from_n, to_n)].append((l_idx, s_idx, dep_min))

        headway_slack_count = 0
        for (from_n, to_n), deps in seg_deps.items():
            if len(deps) < 2:
                continue
            deps_sorted = sorted(deps, key=lambda x: x[2])
            for i in range(len(deps_sorted) - 1):
                l1_idx, s1_idx, m1 = deps_sorted[i]
                l2_idx, s2_idx, m2 = deps_sorted[i+1]
                if l1_idx == l2_idx:
                    continue
                diff = m2 - m1
                if 2.0 <= diff < 12.0:
                    i_h_slack = add_var(f"slack_hw_{headway_slack_count}", 0.0, 10.0, cost=self.weight_headway)
                    headway_slack_count += 1
                    
                    e1 = get_time_expr(l1_idx, s1_idx)
                    e2 = get_time_expr(l2_idx, s2_idx)
                    h_expr = defaultdict(float)
                    for v, val in e2.items():
                        h_expr[v] += val
                    for v, val in e1.items():
                        h_expr[v] -= val
                    h_expr[i_h_slack] = 1.0
                    add_con(dict(h_expr), self.min_headway - diff, np.inf)

        print(f"Constructed {len(row_list)} constraints across {len(var_names)} variables (incl. {headway_slack_count} corridor headways).")

        n_rows = len(row_list)
        n_cols = len(var_names)
        A = dok_matrix((n_rows, n_cols), dtype=float)
        for r_idx, r_dict in enumerate(row_list):
            for c_idx, val in r_dict.items():
                A[r_idx, c_idx] = val

        sparse_A = A.tocsc()
        constraints = LinearConstraint(sparse_A, rhs_lb, rhs_ub)

        print(f"Solving with HiGHS (time limit: {self.time_limit}s)...")
        t_solver_start = time.time()
        sol = milp(
            c=np.array(c, dtype=float),
            integrality=np.array(integrality, dtype=int),
            bounds=(np.array(lb, dtype=float), np.array(ub, dtype=float)),
            constraints=constraints,
            options={'time_limit': self.time_limit, 'mip_rel_gap': 0.01}
        )
        solve_duration = time.time() - t_solver_start
        total_duration = time.time() - start_time

        if not sol.success:
            print(f"Solver ended with: {sol.status} - {sol.message}")
            return {"success": False, "status": sol.status, "message": sol.message}

        print(f"Solved in {solve_duration:.3f}s! Objective value: {sol.fun:.2f}")

        x = sol.x
        return self._build_results(x, var_map, transfers, solve_duration, total_duration, sol.fun)

    def _build_results(
        self,
        x: np.ndarray,
        var_map: Dict[str, int],
        transfers: List[dict],
        solver_time: float,
        total_time: float,
        obj_val: float,
    ) -> dict:
        line_shifts = {}
        runtime_extensions = defaultdict(dict)
        dep_mods = []
        travel_mods = []

        for l in self.filtered_lines:
            lid = l['id']
            shift_idx = var_map.get(f"shift_{lid}")
            shift_val = round(float(x[shift_idx]), 2) if shift_idx is not None else 0.0
            line_shifts[lid] = shift_val

            stops = l.get('stops', [])
            total_added_runtime = 0.0
            for k in range(len(stops) - 1):
                drun_idx = var_map.get(f"drun_{lid}_{k}")
                if drun_idx is not None:
                    drun_val = round(float(x[drun_idx]), 2)
                    if drun_val > 0.05:
                        runtime_extensions[lid][k] = drun_val
                        total_added_runtime += drun_val
                        s_from = stops[k]
                        s_to = stops[k+1]
                        seg_key = f"{s_from.get('id', '')}_{s_to.get('id', '')}"
                        orig_secs = int((parse_time_to_minutes(s_to.get('arrival', '0:00')) - parse_time_to_minutes(s_from.get('departure', '0:00'))) * 60)
                        travel_mods.append({
                            "segmentKey": seg_key,
                            "lineId": lid,
                            "lineName": l.get('name'),
                            "fromName": s_from.get('name'),
                            "toName": s_to.get('name'),
                            "originalTimeSeconds": max(60, orig_secs),
                            "addedTimeMinutes": drun_val,
                            "newTimeSeconds": max(60, orig_secs) + int(drun_val * 60),
                            "reason": "ITF Knotenpufferung (Fahrzeitverlängerung)",
                        })

            if abs(shift_val) > 0.05 or total_added_runtime > 0.05:
                orig_dep = stops[0].get('departure', '12:00:00')
                orig_min = parse_time_to_minutes(orig_dep)
                new_dep = format_minutes_to_time(orig_min + shift_val)
                dep_mods.append({
                    "lineId": lid,
                    "lineName": l.get('name'),
                    "headsign": l.get('headsign'),
                    "stopId": stops[0].get('id', ''),
                    "stopName": stops[0].get('name', ''),
                    "originalDeparture": orig_dep,
                    "newDeparture": new_dep,
                    "shiftMinutes": shift_val,
                    "totalAddedRuntimeMinutes": round(total_added_runtime, 2),
                })

        # Calculate transfer quality
        before_optimal = 0
        before_knapp = 0
        before_broken = 0
        before_lang = 0
        before_waits = []

        after_optimal = 0
        after_knapp = 0
        after_broken = 0
        after_lang = 0
        after_waits = []

        hub_stats = defaultdict(lambda: {
            "before_optimal": 0, "before_knapp": 0, "before_broken": 0,
            "after_optimal": 0, "after_knapp": 0, "after_broken": 0,
        })

        for t in transfers:
            h = t['hub']
            bw = t['base_wait']
            before_waits.append(bw)
            if bw < 1.0:
                before_broken += 1
                hub_stats[h]["before_broken"] += 1
            elif bw < self.min_transfer:
                before_knapp += 1
                hub_stats[h]["before_knapp"] += 1
            elif bw <= self.max_transfer:
                before_optimal += 1
                hub_stats[h]["before_optimal"] += 1
            else:
                before_lang += 1

            l1 = self.filtered_lines[t['from_line_idx']]
            l2 = self.filtered_lines[t['to_line_idx']]
            s1 = line_shifts.get(l1['id'], 0.0)
            s2 = line_shifts.get(l2['id'], 0.0)
            
            rt1 = sum(runtime_extensions[l1['id']].get(k, 0.0) for k in range(t['from_stop_idx']))
            rt2 = sum(runtime_extensions[l2['id']].get(k, 0.0) for k in range(t['to_stop_idx']))

            aw = bw + (s2 + rt2) - (s1 + rt1)
            after_waits.append(aw)

            if aw < 1.0:
                after_broken += 1
                hub_stats[h]["after_broken"] += 1
            elif aw < self.min_transfer:
                after_knapp += 1
                hub_stats[h]["after_knapp"] += 1
            elif aw <= self.max_transfer:
                after_optimal += 1
                hub_stats[h]["after_optimal"] += 1
            else:
                after_lang += 1

        total_t = len(transfers)
        return {
            "success": True,
            "solverTimeSeconds": round(solver_time, 3),
            "totalDurationSeconds": round(total_time, 2),
            "objectiveValue": round(obj_val, 2),
            "linesOptimized": len(self.filtered_lines),
            "totalTransfers": total_t,
            "before": {
                "optimal": before_optimal,
                "knapp": before_knapp,
                "broken": before_broken,
                "lang": before_lang,
                "optimalPct": round(before_optimal / max(1, total_t) * 100, 1),
                "avgWaitMinutes": round(float(np.mean(before_waits)), 1) if before_waits else 0,
            },
            "after": {
                "optimal": after_optimal,
                "knapp": after_knapp,
                "broken": after_broken,
                "lang": after_lang,
                "optimalPct": round(after_optimal / max(1, total_t) * 100, 1),
                "avgWaitMinutes": round(float(np.mean(after_waits)), 1) if after_waits else 0,
            },
            "hubStatistics": dict(hub_stats),
            "departureModifications": dep_mods,
            "travelTimeModifications": travel_mods,
            "lineShifts": line_shifts,
            "runtimeExtensions": dict(runtime_extensions),
        }

    def generate_updated_lines(self, results: dict) -> List[dict]:
        """Creates a complete new lines dataset with all optimized times baked in."""
        line_shifts = results.get("lineShifts", {})
        runtime_exts = results.get("runtimeExtensions", {})

        updated_lines = []
        for orig_line in self.raw_lines:
            l = deepcopy(orig_line)
            lid = l['id']

            if lid in line_shifts or lid in runtime_exts:
                shift_val = line_shifts.get(lid, 0.0)
                rt_map = runtime_exts.get(lid, {})

                stops = l.get('stops', [])
                segments = l.get('segments', [])

                if stops:
                    # Update origin departure
                    orig_dep = stops[0].get('departure')
                    curr_dep_min = parse_time_to_minutes(orig_dep) + shift_val
                    stops[0]['departure'] = format_minutes_to_time(curr_dep_min)
                    stops[0]['arrival'] = stops[0]['departure']

                    # Update subsequent stops and segments
                    for k in range(len(stops) - 1):
                        added_rt = rt_map.get(k, 0.0)
                        
                        # Update segment travel time
                        if k < len(segments):
                            segments[k]['travelTime'] = int(segments[k]['travelTime'] + added_rt * 60)

                        # Arrival at destination of segment
                        dwell = segments[k]['dwellTime'] / 60.0 if k < len(segments) else 0.0
                        travel_min = (segments[k]['travelTime'] / 60.0) if k < len(segments) else 0.0
                        arr_min = curr_dep_min + travel_min
                        stops[k+1]['arrival'] = format_minutes_to_time(arr_min)

                        # Departure from destination stop
                        if k + 1 == len(stops) - 1:
                            stops[k+1]['departure'] = stops[k+1]['arrival']
                        else:
                            curr_dep_min = arr_min + dwell
                            stops[k+1]['departure'] = format_minutes_to_time(curr_dep_min)

                    if l.get('firstDeparture'):
                        f_min = parse_time_to_minutes(l['firstDeparture']) + shift_val
                        l['firstDeparture'] = format_minutes_to_time(f_min)

            updated_lines.append(l)
        return updated_lines

    def export_csv(self, results: dict, filepath: str):
        """Export modified lines table as CSV."""
        os.makedirs(os.path.dirname(filepath), exist_ok=True)
        dep_mods = results.get("departureModifications", [])
        rt_mods = results.get("travelTimeModifications", [])

        with open(filepath, 'w', newline='', encoding='utf-8') as f:
            writer = csv.writer(f)
            writer.writerow([
                "Linie", "Kategorie", "Richtung", "Startbahnhof", 
                "Original_Abfahrt", "Optimierte_Abfahrt", "Verschiebung_Minuten", 
                "Zusaetzliche_Puffer_Minuten"
            ])
            for m in dep_mods:
                writer.writerow([
                    m['lineName'],
                    m.get('category', ''),
                    m.get('headsign', ''),
                    m['stopName'],
                    m['originalDeparture'],
                    m['newDeparture'],
                    f"{m['shiftMinutes']:+.1f}",
                    f"{m.get('totalAddedRuntimeMinutes', 0.0):.1f}"
                ])
        print(f"Exported CSV timetable report to: {filepath}")

def main():
    parser = argparse.ArgumentParser(description="Fahrplan 2026 Timetable Optimizer (MILP / HiGHS)")
    parser.add_argument("--lines-file", default="public/data/2026/lines.json", help="Path to lines.json")
    parser.add_argument("--categories", default="IC,IR", help="Categories to include (e.g. IC,IR or IC,IR,RE)")
    parser.add_argument("--hubs", default="Zürich HB,Bern,Olten,Basel SBB,Luzern,Winterthur, Biel/Bienne, Lausanne", help="Hub stations to focus on")
    parser.add_argument("--max-runtime-extension", type=float, default=2.0, help="Max allowed runtime extension per segment in minutes")
    parser.add_argument("--max-shift", type=float, default=6.0, help="Max departure shift in minutes")
    parser.add_argument("--output", default="public/data/2026/optimization_results.json", help="Output JSON path")
    parser.add_argument("--export-lines", default="public/data/2026/optimized_lines.json", help="Export full updated lines.json path")
    parser.add_argument("--export-csv", default="public/data/2026/optimized_timetable.csv", help="Export CSV path")
    parser.add_argument("--apply-to-2026", action="store_true", help="Directly overwrite public/data/2026/lines.json (creates backup)")
    args = parser.parse_args()

    if not os.path.exists(args.lines_file):
        print(f"Error: {args.lines_file} not found.")
        sys.exit(1)

    with open(args.lines_file, 'r', encoding='utf-8') as f:
        lines_data = json.load(f)

    cats = [c.strip() for c in args.categories.split(',') if c.strip()]
    hubs = [h.strip() for h in args.hubs.split(',') if h.strip()]

    print(f"Configuring optimizer for {len(cats)} categories ({cats}) and {len(hubs)} hubs ({hubs})...")
    optimizer = TimetableOptimizer(
        lines_data=lines_data,
        hubs=hubs,
        categories=cats,
        max_runtime_ext=args.max_runtime_extension,
        max_shift=args.max_shift,
    )

    res = optimizer.build_and_solve()

    if res.get("success"):
        # 1. Save optimization metrics JSON
        os.makedirs(os.path.dirname(args.output), exist_ok=True)
        with open(args.output, 'w', encoding='utf-8') as f:
            json.dump(res, f, indent=2, ensure_ascii=False)
        print(f"\nSaved optimization results to: {args.output}")

        # 2. Export full updated lines.json
        updated_lines = optimizer.generate_updated_lines(res)
        if args.export_lines:
            os.makedirs(os.path.dirname(args.export_lines), exist_ok=True)
            with open(args.export_lines, 'w', encoding='utf-8') as f:
                json.dump(updated_lines, f, indent=2, ensure_ascii=False)
            print(f"Exported complete updated lines dataset to: {args.export_lines}")

        # 3. Export CSV table
        if args.export_csv:
            optimizer.export_csv(res, args.export_csv)

        # 4. Optional: Directly overwrite active lines.json
        if args.apply_to_2026:
            backup_path = args.lines_file + ".bak"
            if not os.path.exists(backup_path):
                import shutil
                shutil.copyfile(args.lines_file, backup_path)
                print(f"Created backup of original lines at: {backup_path}")
            with open(args.lines_file, 'w', encoding='utf-8') as f:
                json.dump(updated_lines, f, indent=2, ensure_ascii=False)
            print(f"Updated active Fahrplan {args.lines_file} directly!")

        print("\n" + "="*62)
        print("          FAHRPLAN 2026 OPTIMIERUNGSERGEBNISSE          ")
        print("="*62)
        print(f"Rechenzeit (HiGHS Solver): {res['solverTimeSeconds']}s (Gesamt: {res['totalDurationSeconds']}s)")
        print(f"Optimierte Linien:        {res['linesOptimized']}")
        print(f"Analysierte Anschlüsse:   {res['totalTransfers']}")
        print("-" * 62)
        print(f"{'Metrik':<28} | {'Vorher (2026)':<14} | {'Nachher (Opt.)':<14}")
        print("-" * 62)
        print(f"{'Optimale Anschlüsse (4-15m)':<28} | {res['before']['optimal']:>4} ({res['before']['optimalPct']}%)    | {res['after']['optimal']:>4} ({res['after']['optimalPct']}%)")
        print(f"{'Knappe Anschlüsse (1-4m)':<28} | {res['before']['knapp']:>4}             | {res['after']['knapp']:>4}")
        print(f"{'Gebrochene Anschlüsse (<1m)':<28} | {res['before']['broken']:>4}             | {res['after']['broken']:>4}")
        print(f"{'Lange Wartezeiten (>15m)':<28} | {res['before']['lang']:>4}             | {res['after']['lang']:>4}")
        print(f"{'Durchschnittliche Wartezeit':<28} | {res['before']['avgWaitMinutes']:>5} min        | {res['after']['avgWaitMinutes']:>5} min")
        print("=" * 62)

if __name__ == '__main__':
    main()
