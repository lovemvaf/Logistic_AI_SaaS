// Cloudflare-safe VRP heuristic solver: nearest-neighbour + capacity-feasible
// insertion followed by 2-opt local search.
// Route distances use haversine * 1.41 (circuity factor, integer metres).

export interface Location {
  id: string;
  lat: number;
  lng: number;
  demand?: number;
}

export interface Vehicle {
  id: string;
  capacity: number;
}

export interface UnassignedLocation {
  id: string;
  demand: number;
  reason: string;
}

export interface RoutingResult {
  ok: boolean;
  routes?: Array<{
    vehicle_id: string;
    route: Array<{ id: string; lat: number; lng: number }>;
    distance_meters: number;
    stops: number;
  }>;
  unassigned?: UnassignedLocation[];
  total_distance_meters?: number;
  total_vehicles?: number;
  distance_source?: string;
  warnings?: string[];
  error?: string;
}

const EARTH_R = 6371000; // metres

function isValidCoord(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    lat >= -90 &&
    lat <= 90 &&
    Number.isFinite(lng) &&
    lng >= -180 &&
    lng <= 180
  );
}

function haversine(a: Location, b: Location): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lng - a.lng);
  const la1 = toRad(a.lat);
  const la2 = toRad(b.lat);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLon / 2) ** 2 * Math.cos(la1) * Math.cos(la2);
  const c = 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
  return EARTH_R * c;
}

function distInt(a: Location, b: Location): number {
  return Math.floor(haversine(a, b) * 1.41);
}

function routeDistance(locs: Location[], order: number[]): number {
  if (order.length < 2) return 0;
  let d = 0;
  for (let i = 0; i < order.length - 1; i++) {
    d += distInt(locs[order[i]], locs[order[i + 1]]);
  }
  return d;
}

function twoOpt(locs: Location[], order: number[]): number[] {
  let best = order.slice();
  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 1; i < best.length - 2; i++) {
      for (let k = i + 1; k < best.length - 1; k++) {
        const a = best[i - 1];
        const b = best[i];
        const c = best[k];
        const d = best[k + 1];
        const before = distInt(locs[a], locs[b]) + distInt(locs[c], locs[d]);
        const after = distInt(locs[a], locs[c]) + distInt(locs[b], locs[d]);
        if (after < before) {
          best.splice(i, k - i + 1, ...best.slice(i, k + 1).reverse());
          improved = true;
        }
      }
    }
  }
  return best;
}

export function solveRouting(
  locations: Location[],
  vehicles: Vehicle[],
  depotIndex: number
): RoutingResult {
  const distanceSource = 'haversine_circuity_1.41';
  const warnings: string[] = [];

  if (!Array.isArray(locations) || !Array.isArray(vehicles) || locations.length === 0) {
    return { ok: false, distance_source: distanceSource, error: 'Missing locations or vehicles' };
  }
  if (!Number.isInteger(depotIndex) || depotIndex < 0 || depotIndex >= locations.length) {
    return {
      ok: false,
      distance_source: distanceSource,
      error: `Depot index ${depotIndex} out of range (0-${locations.length - 1})`,
    };
  }

  for (const loc of locations) {
    if (!loc || !isValidCoord(Number(loc.lat), Number(loc.lng))) {
      return {
        ok: false,
        distance_source: distanceSource,
        error: `Invalid coordinates for location ${loc?.id ?? 'unknown'}`,
      };
    }
    if (loc.demand !== undefined && (!Number.isFinite(Number(loc.demand)) || Number(loc.demand) < 0)) {
      return {
        ok: false,
        distance_source: distanceSource,
        error: `Invalid demand for location ${loc.id}`,
      };
    }
  }

  const usableVehicles: Vehicle[] = [];
  for (const v of vehicles) {
    if (!v || !Number.isFinite(Number(v.capacity)) || Number(v.capacity) <= 0) {
      warnings.push(`Vehicle ${v?.id ?? 'unknown'} skipped: non-positive or invalid capacity`);
      continue;
    }
    usableVehicles.push({ id: v.id, capacity: Number(v.capacity) });
  }

  // Precompute symmetric distance matrix.
  const n = locations.length;
  const matrix: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const d = distInt(locations[i], locations[j]);
      matrix[i][j] = d;
      matrix[j][i] = d;
    }
  }

  const unassigned = new Set<number>();
  for (let i = 0; i < n; i++) {
    if (i !== depotIndex) unassigned.add(i);
  }

  const routes: NonNullable<RoutingResult['routes']> = [];

  for (const vehicle of usableVehicles) {
    if (unassigned.size === 0) break;
    const cap = vehicle.capacity;
    let load = 0;
    const order: number[] = [depotIndex];
    let cur = depotIndex;

    while (unassigned.size > 0) {
      let bestIdx: number | null = null;
      let bestDist = Infinity;
      for (const j of unassigned) {
        const demand = Number(locations[j].demand || 0);
        if (load + demand > cap) continue;
        if (matrix[cur][j] < bestDist) {
          bestDist = matrix[cur][j];
          bestIdx = j;
        }
      }
      if (bestIdx === null) break;
      order.push(bestIdx);
      load += Number(locations[bestIdx].demand || 0);
      unassigned.delete(bestIdx);
      cur = bestIdx;
    }

    if (order.length <= 1) continue;
    order.push(depotIndex); // close the loop for 2-opt optimization

    const optimized = twoOpt(locations, order);
    const distance = routeDistance(locations, optimized);

    // Drop repeated closing depot while preserving [depot, stop1, ...] so 1-stop routes stay valid
    const route = optimized.slice(0, -1).map((idx) => ({
      id: locations[idx].id,
      lat: locations[idx].lat,
      lng: locations[idx].lng,
    }));

    routes.push({
      vehicle_id: vehicle.id,
      route,
      distance_meters: distance,
      stops: route.length - 1,
    });
  }

  // Keep every dispatched route with at least 1 customer stop (route length >= 2)
  const valid = routes.filter((r) => r.route.length >= 2);
  const totalDistance = valid.reduce((sum, r) => sum + r.distance_meters, 0);

  const maxCap = usableVehicles.reduce((m, v) => Math.max(m, v.capacity), 0);
  const unassignedDetails: UnassignedLocation[] = Array.from(unassigned).map((idx) => {
    const loc = locations[idx];
    const demand = Number(loc.demand || 0);
    const reason =
      usableVehicles.length === 0
        ? 'NO_AVAILABLE_VEHICLES'
        : demand > maxCap
          ? 'EXCEEDS_MAX_VEHICLE_CAPACITY'
          : 'INSUFFICIENT_FLEET_CAPACITY';
    return { id: loc.id, demand, reason };
  });

  if (unassignedDetails.length > 0) {
    return {
      ok: false,
      routes: valid,
      unassigned: unassignedDetails,
      total_distance_meters: totalDistance,
      total_vehicles: valid.length,
      distance_source: distanceSource,
      warnings: warnings.length > 0 ? warnings : undefined,
      error: `No feasible solution: ${unassignedDetails.length} location(s) unassigned`,
    };
  }

  return {
    ok: true,
    routes: valid,
    unassigned: [],
    total_distance_meters: totalDistance,
    total_vehicles: valid.length,
    distance_source: distanceSource,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}
