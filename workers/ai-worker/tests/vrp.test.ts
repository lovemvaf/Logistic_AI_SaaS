import { solveRouting, type Location, type Vehicle } from '../src/lib/vrp';

let pass = 0;
let fail = 0;

function ok(name: string, cond: boolean, extra?: unknown) {
  if (cond) {
    pass++;
    console.log('  \u2713', name, extra !== undefined ? JSON.stringify(extra) : '');
  } else {
    fail++;
    console.log('  \u2717 FAIL', name, extra !== undefined ? JSON.stringify(extra) : '');
  }
}

const DEPOT: Location = { id: 'DEPOT', lat: 10.762622, lng: 106.660172, demand: 0 };
const CUST_A: Location = { id: 'CUST-A', lat: 10.782, lng: 106.695, demand: 10 };
const CUST_B: Location = { id: 'CUST-B', lat: 10.801, lng: 106.712, demand: 15 };
const CUST_C: Location = { id: 'CUST-C', lat: 10.75, lng: 106.63, demand: 25 };

function run() {
  // R01: 1-customer route must NOT be dropped
  const r1 = solveRouting([DEPOT, CUST_A], [{ id: 'V1', capacity: 50 }], 0);
  ok(
    'R01: depot + 1 customer returns 1 route with 1 stop',
    r1.ok === true &&
      r1.routes?.length === 1 &&
      r1.routes[0].stops === 1 &&
      r1.routes[0].route.length === 2 &&
      r1.routes[0].route[0].id === 'DEPOT' &&
      r1.routes[0].route[1].id === 'CUST-A',
    r1
  );

  // R02: stops, total_distance_meters, total_vehicles are internally consistent
  const r2 = solveRouting(
    [DEPOT, CUST_A, CUST_B, CUST_C],
    [
      { id: 'V1', capacity: 30 },
      { id: 'V2', capacity: 30 },
    ],
    0
  );
  const summedDist = (r2.routes || []).reduce((acc, rt) => acc + rt.distance_meters, 0);
  ok(
    'R02: stops equals route.length - 1 and total_distance_meters matches sum',
    r2.ok === true &&
      r2.total_vehicles === r2.routes?.length &&
      r2.total_distance_meters === summedDist &&
      (r2.routes || []).every((rt) => rt.stops === rt.route.length - 1 && rt.distance_meters > 0),
    { total_vehicles: r2.total_vehicles, total_distance_meters: r2.total_distance_meters }
  );

  // R03a: NO_AVAILABLE_VEHICLES
  const r3a = solveRouting([DEPOT, CUST_A], [], 0);
  ok(
    'R03a: empty fleet reports NO_AVAILABLE_VEHICLES',
    r3a.ok === false && r3a.unassigned?.[0]?.reason === 'NO_AVAILABLE_VEHICLES',
    r3a.unassigned
  );

  // R03b: non-positive capacity vehicles skipped with warning
  const r3b = solveRouting([DEPOT, CUST_A], [{ id: 'V0', capacity: 0 }], 0);
  ok(
    'R03b: zero-capacity vehicle skipped with warning + NO_AVAILABLE_VEHICLES',
    r3b.ok === false &&
      r3b.unassigned?.[0]?.reason === 'NO_AVAILABLE_VEHICLES' &&
      Array.isArray(r3b.warnings) &&
      r3b.warnings.length === 1,
    { warnings: r3b.warnings, unassigned: r3b.unassigned }
  );

  // R03c: single stop demand exceeds max vehicle capacity
  const r3c = solveRouting([DEPOT, CUST_C], [{ id: 'V1', capacity: 20 }], 0);
  ok(
    'R03c: single heavy stop reports EXCEEDS_MAX_VEHICLE_CAPACITY',
    r3c.ok === false &&
      r3c.unassigned?.length === 1 &&
      r3c.unassigned[0].reason === 'EXCEEDS_MAX_VEHICLE_CAPACITY',
    r3c.unassigned
  );

  // R03d: fleet insufficient for cumulative demand still keeps feasible partial routes
  const r3d = solveRouting(
    [DEPOT, CUST_A, CUST_B, CUST_C],
    [{ id: 'V1', capacity: 25 }],
    0
  );
  ok(
    'R03d: insufficient fleet retains feasible partial routes and reports INSUFFICIENT_FLEET_CAPACITY',
    r3d.ok === false &&
      (r3d.routes?.length ?? 0) >= 1 &&
      (r3d.unassigned || []).some((u) => u.reason === 'INSUFFICIENT_FLEET_CAPACITY' || u.reason === 'EXCEEDS_MAX_VEHICLE_CAPACITY'),
    { routes: r3d.routes?.length, unassigned: r3d.unassigned }
  );

  // R04: explicit distance_source disclosure & input validation guards
  ok(
    'R04: solver discloses haversine_circuity_1.41 distance_source',
    r1.distance_source === 'haversine_circuity_1.41' && r2.distance_source === 'haversine_circuity_1.41',
    { r1: r1.distance_source }
  );

  const badCoord = solveRouting(
    [DEPOT, { id: 'BAD', lat: 95, lng: 106.6, demand: 1 }],
    [{ id: 'V1', capacity: 10 }],
    0
  );
  ok('Input guard: rejects out-of-range latitude', badCoord.ok === false && /Invalid coordinates/i.test(badCoord.error || ''), badCoord.error);

  const badDemand = solveRouting(
    [DEPOT, { id: 'NEG', lat: 10.77, lng: 106.66, demand: -2 }],
    [{ id: 'V1', capacity: 10 }],
    0
  );
  ok('Input guard: rejects negative demand', badDemand.ok === false && /Invalid demand/i.test(badDemand.error || ''), badDemand.error);

  const badDepot = solveRouting([DEPOT, CUST_A], [{ id: 'V1', capacity: 10 }] as Vehicle[], 5);
  ok('Input guard: rejects out-of-range depotIndex', badDepot.ok === false && /Depot index/i.test(badDepot.error || ''), badDepot.error);
}

run();
console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
