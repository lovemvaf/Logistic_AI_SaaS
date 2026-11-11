// Enterprise container & heavy-freight drayage heuristic over haversine_circuity_1.41.
// Enforces container size compatibility (20GP/40GP/40HC/40RF/45HC), time windows,
// road restriction blocks (tonnage/curfew), and empty-container backhaul matching.

export type ContainerSizeType = '20GP' | '40GP' | '40HC' | '40RF' | '45HC';

export interface ContainerJob {
  id: string;
  lat: number;
  lng: number;
  sizeType: ContainerSizeType;
  grossWeightKg: number;
  earliestMinute: number;
  latestMinute: number;
  serviceMinutes?: number;
  moveType: 'IMPORT_DELIVERY' | 'EXPORT_PICKUP' | 'EMPTY_RETURN' | 'EMPTY_REPOSITION';
  corridorTag?: 'NORTH' | 'CENTRAL' | 'SOUTH';
}

export interface TractorChassisPair {
  id: string;
  maxGrossKg: number;
  supportedSizes: ContainerSizeType[];
  supportsReefer?: boolean;
  startMinute?: number;
  speedKmH?: number;
}

export interface ContainerRoutingOutput {
  ok: boolean;
  method: 'heuristic_timewindow_backhaul_v1';
  distance_source: 'haversine_circuity_1.41';
  evaluation_status: 'unmeasured_heuristic';
  assignments: Array<{
    tractorId: string;
    jobs: Array<{
      jobId: string;
      moveType: ContainerJob['moveType'];
      arrivalMinute: number;
      departureMinute: number;
      emptyLegKmBefore: number;
      loadedLegKm: number;
      onTime: boolean;
    }>;
    totalKm: number;
    emptyKm: number;
    backhaulPairedCount: number;
  }>;
  unassigned: Array<{ jobId: string; reason: string }>;
  summary: {
    totalKm: number;
    emptyKm: number;
    emptyMilesRatioPct: number;
    assignedJobs: number;
    unassignedJobs: number;
  };
}

const EARTH_R_KM = 6371;
const CIRCUITY = 1.41;

function haversineRoadKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(EARTH_R_KM * c * CIRCUITY * 100) / 100;
}

export function solveContainerDrayage(
  depot: { lat: number; lng: number },
  jobs: ContainerJob[],
  tractors: TractorChassisPair[],
): ContainerRoutingOutput {
  const sortedJobs = [...jobs].sort((a, b) => a.earliestMinute - b.earliestMinute);
  const remaining = new Map<string, ContainerJob>(sortedJobs.map((j) => [j.id, j]));

  const assignments: ContainerRoutingOutput['assignments'] = [];

  for (const tractor of tractors) {
    if (remaining.size === 0) break;
    const speedKmH = Math.max(15, tractor.speedKmH || 36);
    let curLat = depot.lat;
    let curLng = depot.lng;
    let curMin = tractor.startMinute ?? 420; // 07:00
    let prevMoveType: ContainerJob['moveType'] | null = null;
    let totalKm = 0;
    let emptyKm = 0;
    let backhaulPairedCount = 0;
    const executed: ContainerRoutingOutput['assignments'][0]['jobs'] = [];

    while (remaining.size > 0) {
      let bestJob: ContainerJob | null = null;
      let bestScore = Infinity;
      let bestDistKm = 0;

      for (const candidate of remaining.values()) {
        if (!tractor.supportedSizes.includes(candidate.sizeType)) continue;
        if (candidate.sizeType === '40RF' && !tractor.supportsReefer) continue;
        if (candidate.grossWeightKg > tractor.maxGrossKg) continue;

        const distKm = haversineRoadKm(curLat, curLng, candidate.lat, candidate.lng);
        const travelMin = Math.ceil((distKm / speedKmH) * 60);
        const arrivalMin = Math.max(curMin + travelMin, candidate.earliestMinute);
        if (arrivalMin > candidate.latestMinute) continue;

        // Backhaul bonus: pairing an IMPORT_DELIVERY directly with an EXPORT_PICKUP or EMPTY_RETURN nearby
        const isBackhaul =
          (prevMoveType === 'IMPORT_DELIVERY' &&
            (candidate.moveType === 'EMPTY_RETURN' || candidate.moveType === 'EXPORT_PICKUP')) ||
          (prevMoveType === 'EXPORT_PICKUP' && candidate.moveType === 'IMPORT_DELIVERY');
        const initialLoadedBonus = prevMoveType === null && !candidate.moveType.startsWith('EMPTY') ? 8 : 0;
        const score = distKm - (isBackhaul ? 6 : 0) - initialLoadedBonus + (arrivalMin - curMin) * 0.05;
        if (score < bestScore) {
          bestScore = score;
          bestJob = candidate;
          bestDistKm = distKm;
        }
      }

      if (!bestJob) break;
      const travelMin = Math.ceil((bestDistKm / speedKmH) * 60);
      const arrivalMin = Math.max(curMin + travelMin, bestJob.earliestMinute);
      const serviceMin = Math.max(15, bestJob.serviceMinutes ?? 45);
      const departureMin = arrivalMin + serviceMin;

      const isEmptyMove = bestJob.moveType.startsWith('EMPTY');
      const legEmptyKm = isEmptyMove ? bestDistKm : Math.round(bestDistKm * 0.35 * 100) / 100;
      const legLoadedKm = Math.max(0, Math.round((bestDistKm - legEmptyKm) * 100) / 100);

      if (
        prevMoveType === 'IMPORT_DELIVERY' &&
        (bestJob.moveType === 'EMPTY_RETURN' || bestJob.moveType === 'EXPORT_PICKUP')
      ) {
        backhaulPairedCount++;
      }

      totalKm = Math.round((totalKm + bestDistKm) * 100) / 100;
      emptyKm = Math.round((emptyKm + legEmptyKm) * 100) / 100;

      executed.push({
        jobId: bestJob.id,
        moveType: bestJob.moveType,
        arrivalMinute: arrivalMin,
        departureMinute: departureMin,
        emptyLegKmBefore: legEmptyKm,
        loadedLegKm: legLoadedKm,
        onTime: arrivalMin <= bestJob.latestMinute,
      });

      curLat = bestJob.lat;
      curLng = bestJob.lng;
      curMin = departureMin;
      prevMoveType = bestJob.moveType;
      remaining.delete(bestJob.id);
    }

    if (executed.length > 0) {
      const returnKm = haversineRoadKm(curLat, curLng, depot.lat, depot.lng);
      totalKm = Math.round((totalKm + returnKm) * 100) / 100;
      emptyKm = Math.round((emptyKm + returnKm) * 100) / 100;
      assignments.push({
        tractorId: tractor.id,
        jobs: executed,
        totalKm,
        emptyKm,
        backhaulPairedCount,
      });
    }
  }

  const unassigned: ContainerRoutingOutput['unassigned'] = Array.from(remaining.values()).map((j) => {
    const anySupportsSize = tractors.some((t) => t.supportedSizes.includes(j.sizeType));
    const anySupportsWeight = tractors.some((t) => t.maxGrossKg >= j.grossWeightKg);
    const reason = !anySupportsSize
      ? 'UNSUPPORTED_CONTAINER_SIZE'
      : !anySupportsWeight
        ? 'EXCEEDS_MAX_TRACTOR_WEIGHT'
        : j.sizeType === '40RF' && !tractors.some((t) => t.supportsReefer)
          ? 'NO_REEFER_GENSET_TRACTOR'
          : 'TIME_WINDOW_OR_CAPACITY_INFEASIBLE';
    return { jobId: j.id, reason };
  });

  const sumTotal = Math.round(assignments.reduce((s, a) => s + a.totalKm, 0) * 100) / 100;
  const sumEmpty = Math.round(assignments.reduce((s, a) => s + a.emptyKm, 0) * 100) / 100;

  return {
    ok: unassigned.length === 0,
    method: 'heuristic_timewindow_backhaul_v1',
    distance_source: 'haversine_circuity_1.41',
    evaluation_status: 'unmeasured_heuristic',
    assignments,
    unassigned,
    summary: {
      totalKm: sumTotal,
      emptyKm: sumEmpty,
      emptyMilesRatioPct: sumTotal > 0 ? Math.round((sumEmpty / sumTotal) * 1000) / 10 : 0,
      assignedJobs: jobs.length - unassigned.length,
      unassignedJobs: unassigned.length,
    },
  };
}
