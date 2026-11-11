import { solveContainerDrayage, type ContainerJob, type TractorChassisPair } from '../src/lib/container-routing';

// Synthetic 5-scenario Dong Nai corridor benchmark (NOT production telemetry).
const DEPOT_BIEN_HOA = { lat: 10.9465, lng: 106.8428 };

const TRACTORS: TractorChassisPair[] = [
  { id: 'TRC-01', maxGrossKg: 34000, supportedSizes: ['20GP', '40GP', '40HC'], startMinute: 360, speedKmH: 38 },
  { id: 'TRC-02', maxGrossKg: 34000, supportedSizes: ['20GP', '40GP', '40HC', '40RF'], supportsReefer: true, startMinute: 360, speedKmH: 38 },
  { id: 'TRC-03', maxGrossKg: 30000, supportedSizes: ['20GP', '40HC'], startMinute: 420, speedKmH: 35 },
];

const SCENARIOS: Array<{ name: string; jobs: ContainerJob[] }> = [
  {
    name: 'S1_South_Amata_CatLai_Exports',
    jobs: [
      { id: 'J1', lat: 10.935, lng: 106.875, sizeType: '40HC', grossWeightKg: 21000, earliestMinute: 420, latestMinute: 720, moveType: 'EXPORT_PICKUP', corridorTag: 'SOUTH' },
      { id: 'J2', lat: 10.761, lng: 106.794, sizeType: '40HC', grossWeightKg: 23000, earliestMinute: 480, latestMinute: 840, moveType: 'IMPORT_DELIVERY', corridorTag: 'SOUTH' },
      { id: 'J3', lat: 10.772, lng: 106.815, sizeType: '40HC', grossWeightKg: 3800, earliestMinute: 540, latestMinute: 960, moveType: 'EMPTY_RETURN', corridorTag: 'SOUTH' },
    ],
  },
  {
    name: 'S2_South_LongThanh_CaiMep',
    jobs: [
      { id: 'J1', lat: 10.793, lng: 106.955, sizeType: '40HC', grossWeightKg: 25000, earliestMinute: 420, latestMinute: 780, moveType: 'EXPORT_PICKUP', corridorTag: 'SOUTH' },
      { id: 'J2', lat: 10.525, lng: 107.018, sizeType: '40HC', grossWeightKg: 24000, earliestMinute: 540, latestMinute: 960, moveType: 'IMPORT_DELIVERY', corridorTag: 'SOUTH' },
    ],
  },
  {
    name: 'S3_Central_TrangBom_DauGiay_FTL',
    jobs: [
      { id: 'J1', lat: 10.954, lng: 107.005, sizeType: '20GP', grossWeightKg: 18000, earliestMinute: 450, latestMinute: 780, moveType: 'EXPORT_PICKUP', corridorTag: 'CENTRAL' },
      { id: 'J2', lat: 10.941, lng: 107.142, sizeType: '20GP', grossWeightKg: 16000, earliestMinute: 500, latestMinute: 900, moveType: 'IMPORT_DELIVERY', corridorTag: 'CENTRAL' },
    ],
  },
  {
    name: 'S4_North_ChonThanh_DongXoai_Backhaul',
    jobs: [
      { id: 'J1', lat: 11.434, lng: 106.621, sizeType: '40HC', grossWeightKg: 22000, earliestMinute: 420, latestMinute: 840, moveType: 'IMPORT_DELIVERY', corridorTag: 'NORTH' },
      { id: 'J2', lat: 11.535, lng: 106.892, sizeType: '40HC', grossWeightKg: 3800, earliestMinute: 540, latestMinute: 960, moveType: 'EMPTY_RETURN', corridorTag: 'NORTH' },
    ],
  },
  {
    name: 'S5_Reefer_Mixed_Corridor',
    jobs: [
      { id: 'J1', lat: 10.728, lng: 106.895, sizeType: '40RF', grossWeightKg: 22500, earliestMinute: 420, latestMinute: 720, moveType: 'EXPORT_PICKUP', corridorTag: 'SOUTH' },
      { id: 'J2', lat: 10.927, lng: 107.235, sizeType: '20GP', grossWeightKg: 14000, earliestMinute: 480, latestMinute: 900, moveType: 'IMPORT_DELIVERY', corridorTag: 'CENTRAL' },
    ],
  },
];

let allOk = true;
console.log('=== Synthetic Dong Nai Corridor Container Routing Benchmark ===');
for (const sc of SCENARIOS) {
  const res = solveContainerDrayage(DEPOT_BIEN_HOA, sc.jobs, TRACTORS);
  console.log(
    `  ${sc.name}: ok=${res.ok}, totalKm=${res.summary.totalKm}, emptyKm=${res.summary.emptyKm} (${res.summary.emptyMilesRatioPct}%), assigned=${res.summary.assignedJobs}/${sc.jobs.length}`,
  );
  if (!res.ok) allOk = false;
}
if (!allOk) process.exit(1);
