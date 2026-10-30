#!/usr/bin/env python3
"""
Preprocess GTFS data for the Fahrplan Optimization Tool.
Extracts rail-only data and creates JSON files for the web frontend.
Streams stop_times.txt to handle the massive file size.
"""

import csv
import json
import os
import sys
import zipfile
from collections import defaultdict
from io import TextIOWrapper

# Rail route categories to include
RAIL_CATEGORIES = {
    'IC', 'IR', 'RE', 'R', 'S', 'EC', 'ICE', 'TGV', 'PE', 'RJX', 'NJ',
    'SN', 'RB', 'EXT', 'CC', 'FAE', 'RER'
}

# Major Swiss hub stations (Knotenbahnhöfe) by name pattern
HUB_STATIONS = [
    'Zürich HB', 'Bern', 'Basel SBB', 'Luzern', 'Lausanne', 'Genève',
    'Winterthur', 'St. Gallen', 'Biel/Bienne', 'Thun', 'Olten', 'Aarau',
    'Baden', 'Burgdorf', 'Spiez', 'Interlaken', 'Chur', 'Visp', 'Brig',
    'Schaffhausen', 'Frauenfeld', 'Solothurn', 'Zug', 'Arth-Goldau',
    'Bellinzona', 'Lugano', 'Locarno', 'Yverdon-les-Bains', 'Neuchâtel',
    'Fribourg/Freiburg', 'Sion', 'Martigny', 'Montreux', 'Vevey',
    'Renens VD', 'Morges', 'Nyon', 'Delémont', 'Wil SG', 'Romanshorn',
    'Kreuzlingen', 'Buchs SG', 'Sargans', 'Landquart', 'Pfäffikon SZ',
    'Rapperswil SG', 'Wädenswil', 'Thalwil', 'Dietikon', 'Brugg AG',
    'Lenzburg', 'Langenthal', 'Herzogenbuchsee', 'Wettingen',
    'Zürich Oerlikon', 'Zürich Stadelhofen', 'Zürich Altstetten',
    'Basel Bad Bf', 'Genève-Aéroport', 'Bern Wankdorf',
    'Zürich Flughafen', 'Liestal', 'Ostermundigen', 'Köniz',
    'Emmenbrücke', 'Worb', 'Konolfingen', 'Münsingen', 'Lyss',
    'Ins', 'Kerzers', 'Palézieux', 'Payerne', 'Romont FR',
    'Bulle', 'Schwarzenburg', 'Flamatt', 'Wiler b. Utzenstorf',
    'Gossau SG', 'Weinfelden', 'Amriswil', 'Rorschach',
    'Herisau', 'Wattwil', 'Uznach', 'Ziegelbrücke', 'Glarus',
    'Wohlen AG', 'Muri AG', 'Rotkreuz', 'Erstfeld', 'Göschenen',
    'Airolo', 'Biasca', 'Chiasso', 'Mendrisio', 'Cadenazzo',
    'Giubiasco', 'Rivera-Bironico', 'Sissach', 'Gelterkinden',
    'Rheinfelden', 'Laufen', 'Oensingen', 'Balsthal', 'Grenchen Süd',
    'Grenchen Nord', 'Moutier', 'Tavannes', 'Biel/Bienne',
    'Burgdorf', 'Hasle-Rüegsau', 'Sumiswald-Grünen',
]


def process_year(gtfs_zip_path, year_label, output_dir):
    """Process a single year's GTFS data."""
    print(f"\n{'='*60}")
    print(f"Processing {year_label} from {gtfs_zip_path}")
    print(f"{'='*60}")
    
    os.makedirs(output_dir, exist_ok=True)
    
    with zipfile.ZipFile(gtfs_zip_path, 'r') as zf:
        # 1. Load agencies
        print("Loading agencies...")
        agencies = {}
        with zf.open('agency.txt') as f:
            reader = csv.DictReader(TextIOWrapper(f, encoding='utf-8-sig'))
            for row in reader:
                agencies[row['agency_id'].strip('"')] = {
                    'name': row['agency_name'].strip('"'),
                }
        print(f"  Found {len(agencies)} agencies")
        
        # 2. Load routes and filter for rail
        print("Loading routes (rail only)...")
        routes = {}
        route_ids_set = set()
        with zf.open('routes.txt') as f:
            reader = csv.DictReader(TextIOWrapper(f, encoding='utf-8-sig'))
            for row in reader:
                route_desc = row.get('route_desc', '').strip('"').strip()
                if route_desc in RAIL_CATEGORIES:
                    rid = row['route_id'].strip('"')
                    route_ids_set.add(rid)
                    agency_id = row['agency_id'].strip('"')
                    routes[rid] = {
                        'id': rid,
                        'agency': agencies.get(agency_id, {}).get('name', agency_id),
                        'shortName': row['route_short_name'].strip('"'),
                        'category': route_desc,
                        'type': int(row['route_type'].strip('"')),
                    }
        print(f"  Found {len(routes)} rail routes")
        
        # 3. Load stops
        print("Loading stops...")
        all_stops = {}
        parent_stops = {}
        with zf.open('stops.txt') as f:
            reader = csv.DictReader(TextIOWrapper(f, encoding='utf-8-sig'))
            for row in reader:
                sid = row['stop_id'].strip('"')
                loc_type = row.get('location_type', '').strip('"')
                parent = row.get('parent_station', '').strip('"')
                stop_data = {
                    'id': sid,
                    'name': row['stop_name'].strip('"'),
                    'lat': float(row['stop_lat'].strip('"')) if row['stop_lat'].strip('"') else 0,
                    'lon': float(row['stop_lon'].strip('"')) if row['stop_lon'].strip('"') else 0,
                    'locationType': loc_type,
                    'parentStation': parent,
                    'platformCode': row.get('platform_code', '').strip('"'),
                }
                all_stops[sid] = stop_data
                if loc_type == '1':
                    parent_stops[sid] = stop_data
        print(f"  Found {len(all_stops)} stops, {len(parent_stops)} parent stations")
        
        # 4. Load trips (rail only)
        print("Loading trips (rail only)...")
        trips = {}
        trip_to_route = {}
        with zf.open('trips.txt') as f:
            reader = csv.DictReader(TextIOWrapper(f, encoding='utf-8-sig'))
            for row in reader:
                rid = row['route_id'].strip('"')
                if rid in route_ids_set:
                    tid = row['trip_id'].strip('"')
                    trips[tid] = {
                        'id': tid,
                        'routeId': rid,
                        'headsign': row['trip_headsign'].strip('"'),
                        'shortName': row.get('trip_short_name', '').strip('"'),
                        'directionId': row.get('direction_id', '').strip('"'),
                        'serviceId': row.get('service_id', '').strip('"'),
                    }
                    trip_to_route[tid] = rid
        print(f"  Found {len(trips)} rail trips")
        
        # 5. Stream stop_times (the big one!)
        print("Streaming stop_times.txt (this may take a while)...")
        trip_stop_times = defaultdict(list)
        count = 0
        skipped = 0
        with zf.open('stop_times.txt') as f:
            reader = csv.DictReader(TextIOWrapper(f, encoding='utf-8-sig'))
            for row in reader:
                count += 1
                if count % 5_000_000 == 0:
                    print(f"  Processed {count:,} stop_time rows...")
                tid = row['trip_id'].strip('"')
                if tid in trip_to_route:
                    stop_id = row['stop_id'].strip('"')
                    trip_stop_times[tid].append({
                        'stopId': stop_id,
                        'arrival': row['arrival_time'].strip('"'),
                        'departure': row['departure_time'].strip('"'),
                        'sequence': int(row['stop_sequence'].strip('"')),
                        'stopName': all_stops.get(stop_id, {}).get('name', ''),
                    })
                else:
                    skipped += 1
        print(f"  Processed {count:,} total rows, kept {count - skipped:,}, skipped {skipped:,}")
        
        # Sort stop times by sequence
        for tid in trip_stop_times:
            trip_stop_times[tid].sort(key=lambda x: x['sequence'])
    
    # 6. Build line patterns (unique stop sequences per route)
    print("Building line patterns...")
    route_patterns = defaultdict(lambda: defaultdict(list))
    for tid, stops in trip_stop_times.items():
        rid = trip_to_route[tid]
        direction = trips[tid]['directionId']
        # Create pattern key from stop sequence
        pattern_key = tuple(s['stopId'] for s in stops)
        route_patterns[rid][(direction, pattern_key)].append(tid)
    
    # For each route, pick the most common pattern per direction
    lines = {}
    representative_trips = {}
    for rid, patterns in route_patterns.items():
        best_patterns = {}
        for (direction, pattern_key), trip_ids in patterns.items():
            if direction not in best_patterns or len(trip_ids) > len(best_patterns[direction][1]):
                best_patterns[direction] = (pattern_key, trip_ids)
        
        for direction, (pattern_key, trip_ids) in best_patterns.items():
            line_key = f"{rid}_d{direction}"
            rep_trip_id = trip_ids[0]
            representative_trips[line_key] = rep_trip_id
            stop_times = trip_stop_times[rep_trip_id]
            
            # Calculate segment travel times
            segments = []
            for i in range(len(stop_times) - 1):
                from_stop = stop_times[i]
                to_stop = stop_times[i + 1]
                dep_secs = time_to_seconds(from_stop['departure'])
                arr_secs = time_to_seconds(to_stop['arrival'])
                travel_time = arr_secs - dep_secs
                dwell_time = time_to_seconds(to_stop['departure']) - arr_secs if i + 1 < len(stop_times) - 1 else 0
                
                segments.append({
                    'fromStop': from_stop['stopId'],
                    'fromName': from_stop['stopName'],
                    'toStop': to_stop['stopId'],
                    'toName': to_stop['stopName'],
                    'travelTime': max(0, travel_time),
                    'dwellTime': max(0, dwell_time),
                    'fromLat': all_stops.get(from_stop['stopId'], {}).get('lat', 0),
                    'fromLon': all_stops.get(from_stop['stopId'], {}).get('lon', 0),
                    'toLat': all_stops.get(to_stop['stopId'], {}).get('lat', 0),
                    'toLon': all_stops.get(to_stop['stopId'], {}).get('lon', 0),
                })
            
            route_info = routes.get(rid, {})
            lines[line_key] = {
                'id': line_key,
                'routeId': rid,
                'name': route_info.get('shortName', rid),
                'category': route_info.get('category', ''),
                'agency': route_info.get('agency', ''),
                'direction': direction,
                'headsign': trips[rep_trip_id]['headsign'],
                'numTrips': len(trip_ids),
                'segments': segments,
                'stops': [
                    {
                        'id': st['stopId'],
                        'name': st['stopName'],
                        'arrival': st['arrival'],
                        'departure': st['departure'],
                        'lat': all_stops.get(st['stopId'], {}).get('lat', 0),
                        'lon': all_stops.get(st['stopId'], {}).get('lon', 0),
                    }
                    for st in stop_times
                ],
            }
    
    print(f"  Built {len(lines)} line patterns")
    
    # 7. Collect all example departure times for each line (for takt detection)
    print("Detecting takt intervals...")
    line_departures = defaultdict(list)
    for line_key, rep_tid in representative_trips.items():
        rid = trip_to_route[rep_tid]
        direction = lines[line_key]['direction']
        # Find all trips with same route and direction
        for tid, trip_info in trips.items():
            if trip_info['routeId'] == rid and trip_info['directionId'] == direction:
                if tid in trip_stop_times and trip_stop_times[tid]:
                    first_dep = trip_stop_times[tid][0]['departure']
                    dep_secs = time_to_seconds(first_dep)
                    if 0 <= dep_secs < 86400:  # Only keep normal hours
                        line_departures[line_key].append(dep_secs)
    
    for line_key in line_departures:
        deps = sorted(line_departures[line_key])
        if len(deps) >= 2:
            intervals = [deps[i+1] - deps[i] for i in range(len(deps)-1)]
            # Find most common interval (takt)
            interval_counts = defaultdict(int)
            for iv in intervals:
                # Round to nearest 5 minutes
                rounded = round(iv / 300) * 300
                if rounded > 0:
                    interval_counts[rounded] += 1
            if interval_counts:
                most_common = max(interval_counts, key=interval_counts.get)
                lines[line_key]['taktMinutes'] = most_common // 60
                lines[line_key]['numDepartures'] = len(deps)
                lines[line_key]['firstDeparture'] = seconds_to_time(deps[0])
                lines[line_key]['lastDeparture'] = seconds_to_time(deps[-1])
    
    # 8. Identify used stations (only those that appear in rail lines)
    print("Filtering stations used by rail...")
    used_stop_ids = set()
    for line in lines.values():
        for stop in line['stops']:
            used_stop_ids.add(stop['id'])
    
    # Resolve parent stations for used stops
    stations = {}
    for sid in used_stop_ids:
        stop = all_stops.get(sid, {})
        parent_id = stop.get('parentStation', '')
        if parent_id and parent_id in all_stops:
            parent = all_stops[parent_id]
            station_id = parent_id
            station_name = parent['name']
            lat = parent['lat']
            lon = parent['lon']
        else:
            station_id = sid
            station_name = stop.get('name', sid)
            lat = stop.get('lat', 0)
            lon = stop.get('lon', 0)
        
        if station_id not in stations:
            is_hub = any(hub.lower() in station_name.lower() for hub in HUB_STATIONS)
            stations[station_id] = {
                'id': station_id,
                'name': station_name,
                'lat': lat,
                'lon': lon,
                'isHub': is_hub,
                'platforms': [],
            }
        if sid not in [p['id'] for p in stations[station_id]['platforms']]:
            stations[station_id]['platforms'].append({
                'id': sid,
                'name': stop.get('name', sid),
                'platformCode': stop.get('platformCode', ''),
            })
    
    print(f"  Found {len(stations)} stations used by rail")
    hubs = [s for s in stations.values() if s['isHub']]
    print(f"  Identified {len(hubs)} hub stations")
    
    # 9. Build network edges (unique station-to-station connections)
    print("Building network graph...")
    edges = {}
    for line in lines.values():
        for seg in line['segments']:
            from_parent = resolve_parent(seg['fromStop'], all_stops)
            to_parent = resolve_parent(seg['toStop'], all_stops)
            edge_key = f"{from_parent}_{to_parent}"
            rev_key = f"{to_parent}_{from_parent}"
            
            if edge_key not in edges and rev_key not in edges:
                edges[edge_key] = {
                    'from': from_parent,
                    'fromName': stations.get(from_parent, {}).get('name', from_parent),
                    'to': to_parent,
                    'toName': stations.get(to_parent, {}).get('name', to_parent),
                    'lines': [],
                    'minTravelTime': seg['travelTime'],
                    'fromLat': stations.get(from_parent, {}).get('lat', seg['fromLat']),
                    'fromLon': stations.get(from_parent, {}).get('lon', seg['fromLon']),
                    'toLat': stations.get(to_parent, {}).get('lat', seg['toLat']),
                    'toLon': stations.get(to_parent, {}).get('lon', seg['toLon']),
                }
            
            key = edge_key if edge_key in edges else rev_key
            if key in edges:
                line_ref = f"{line['category']} {line['name']}"
                if line_ref not in edges[key]['lines']:
                    edges[key]['lines'].append(line_ref)
                edges[key]['minTravelTime'] = min(edges[key]['minTravelTime'], seg['travelTime'])
    
    print(f"  Built {len(edges)} network edges")
    
    # 10. Save JSON files
    print("Saving JSON files...")
    
    # Save lines (split into categories for frontend)
    lines_by_category = defaultdict(list)
    for line in lines.values():
        lines_by_category[line['category']].append(line)
    
    with open(os.path.join(output_dir, 'lines.json'), 'w', encoding='utf-8') as f:
        json.dump(list(lines.values()), f, ensure_ascii=False)
    print(f"  Saved lines.json ({len(lines)} lines)")
    
    with open(os.path.join(output_dir, 'stations.json'), 'w', encoding='utf-8') as f:
        json.dump(list(stations.values()), f, ensure_ascii=False)
    print(f"  Saved stations.json ({len(stations)} stations)")
    
    with open(os.path.join(output_dir, 'network.json'), 'w', encoding='utf-8') as f:
        json.dump(list(edges.values()), f, ensure_ascii=False)
    print(f"  Saved network.json ({len(edges)} edges)")
    
    # Save summary
    summary = {
        'year': year_label,
        'totalRoutes': len(routes),
        'totalLines': len(lines),
        'totalStations': len(stations),
        'totalEdges': len(edges),
        'hubStations': len(hubs),
        'categories': {cat: len(items) for cat, items in lines_by_category.items()},
    }
    with open(os.path.join(output_dir, 'summary.json'), 'w', encoding='utf-8') as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)
    print(f"  Saved summary.json")
    
    print(f"\n✅ {year_label} processing complete!")
    return summary


def resolve_parent(stop_id, all_stops):
    """Resolve a stop to its parent station."""
    stop = all_stops.get(stop_id, {})
    parent = stop.get('parentStation', '')
    return parent if parent else stop_id


def time_to_seconds(time_str):
    """Convert HH:MM:SS to seconds."""
    try:
        parts = time_str.split(':')
        return int(parts[0]) * 3600 + int(parts[1]) * 60 + int(parts[2])
    except (ValueError, IndexError):
        return 0


def seconds_to_time(secs):
    """Convert seconds to HH:MM:SS."""
    h = secs // 3600
    m = (secs % 3600) // 60
    s = secs % 60
    return f"{h:02d}:{m:02d}:{s:02d}"


if __name__ == '__main__':
    base_dir = os.path.dirname(os.path.abspath(__file__))
    output_base = os.path.join(base_dir, 'public', 'data')
    
    # Process 2026
    zip_2026 = os.path.join(base_dir, 'gtfs_fp2026.zip')
    if os.path.exists(zip_2026):
        summary_2026 = process_year(zip_2026, '2026', os.path.join(output_base, '2026'))
    
    # Process 2027
    zip_2027 = os.path.join(base_dir, 'gtfs_fp2027_20261028.zip')
    if os.path.exists(zip_2027):
        summary_2027 = process_year(zip_2027, '2027', os.path.join(output_base, '2027'))
    
    print("\n" + "="*60)
    print("All processing complete!")
    print("="*60)
