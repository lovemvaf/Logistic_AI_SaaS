export type DongNaiCorridor = 'NORTH' | 'CENTRAL' | 'SOUTH';
export type ShippingServiceLevel = 'STANDARD' | 'EXPRESS' | 'SAME_DAY';

export const VOLUME_KG_PER_CBM = 167;

export const CORRIDOR_BASE_FEES: Record<DongNaiCorridor, number> = {
  CENTRAL: 35_000,
  SOUTH: 42_000,
  NORTH: 48_000,
};

export const CORRIDOR_LABELS: Record<DongNaiCorridor, string> = {
  CENTRAL: 'Trung tâm (Biên Hòa - Trảng Bom)',
  SOUTH: 'Nam (Long Thành - Nhơn Trạch - Phước An)',
  NORTH: 'Bắc (Đồng Xoài - Chơn Thành - Long Khánh)',
};

export const SERVICE_MULTIPLIERS: Record<ShippingServiceLevel, number> = {
  STANDARD: 1.0,
  EXPRESS: 1.35,
  SAME_DAY: 1.65,
};

export interface DongNaiRateInput {
  weightKg: number;
  volumeCbm?: number;
  distanceKm?: number;
  codAmount?: number;
  corridor?: DongNaiCorridor | string;
  serviceLevel?: ShippingServiceLevel | string;
}

export interface DongNaiRateBreakdown {
  baseFee: number;
  distanceSurcharge: number;
  weightSurcharge: number;
  serviceMultiplier: number;
  codCollectionFee: number;
  chargeableWeightKg: number;
  volumetricWeightKg: number;
  volumetricApplied: boolean;
}

export interface DongNaiRateResult {
  totalEstimate: number;
  currency: 'VND';
  corridor: DongNaiCorridor;
  serviceLevel: ShippingServiceLevel;
  distanceKm: number;
  breakdown: DongNaiRateBreakdown;
  formula: string;
}

export function normalizeCorridor(raw?: string | null): DongNaiCorridor {
  const up = String(raw || 'CENTRAL').trim().toUpperCase();
  if (up === 'NORTH' || up === 'SOUTH') return up;
  return 'CENTRAL';
}

export function normalizeServiceLevel(raw?: string | null): ShippingServiceLevel {
  const up = String(raw || 'STANDARD').trim().toUpperCase();
  if (up === 'EXPRESS' || up === 'SAME_DAY') return up;
  return 'STANDARD';
}

export function estimateDongNaiRate(input: DongNaiRateInput): DongNaiRateResult {
  const corridor = normalizeCorridor(input.corridor);
  const serviceLevel = normalizeServiceLevel(input.serviceLevel);
  const weightKg = Math.max(0.1, Number(input.weightKg) || 0.1);
  const volumeCbm = Math.max(0, Number(input.volumeCbm) || 0);
  const distanceKm = Math.max(0, Number(input.distanceKm) || 0);
  const codAmount = Math.max(0, Number(input.codAmount) || 0);

  const volumetricWeightKg = volumeCbm > 0 ? Math.ceil(volumeCbm * VOLUME_KG_PER_CBM) : 0;
  const chargeableWeightKg = Math.max(weightKg, volumetricWeightKg);
  const volumetricApplied = volumetricWeightKg > weightKg;

  const baseFee = CORRIDOR_BASE_FEES[corridor];
  const distanceSurcharge = distanceKm > 5 ? Math.round(distanceKm - 5) * 1_200 : 0;
  const weightSurcharge = Math.max(0, Math.ceil(chargeableWeightKg - 2)) * 4_500;
  const serviceMultiplier = SERVICE_MULTIPLIERS[serviceLevel];
  const codCollectionFee = codAmount > 0 ? Math.max(15_000, Math.round(codAmount * 0.008)) : 0;

  const rawTotal = (baseFee + distanceSurcharge + weightSurcharge) * serviceMultiplier + codCollectionFee;
  const totalEstimate = Math.round(rawTotal / 1_000) * 1_000;

  return {
    totalEstimate,
    currency: 'VND',
    corridor,
    serviceLevel,
    distanceKm,
    breakdown: {
      baseFee,
      distanceSurcharge,
      weightSurcharge,
      serviceMultiplier,
      codCollectionFee,
      chargeableWeightKg,
      volumetricWeightKg,
      volumetricApplied,
    },
    formula: `round(((${baseFee} + ${distanceSurcharge} + ${weightSurcharge}) * ${serviceMultiplier} + ${codCollectionFee}) / 1000) * 1000`,
  };
}

export interface DongNaiHubSeed {
  code: string;
  name: string;
  localityName: string;
  corridor: DongNaiCorridor;
  lat: number;
  lng: number;
  outsideCity: boolean;
  facilityType: string;
}

export const DONG_NAI_KEY_HUBS: DongNaiHubSeed[] = [
  {
    code: 'ICD_TAN_CANG_LONG_BINH',
    name: 'ICD Tân Cảng Long Bình',
    localityName: 'Phường Long Bình',
    corridor: 'CENTRAL',
    lat: 10.9415,
    lng: 106.8908,
    outsideCity: false,
    facilityType: 'ICD',
  },
  {
    code: 'HUB_AMATA',
    name: 'Trung tâm Logistics KCN Amata',
    localityName: 'Phường Long Bình',
    corridor: 'CENTRAL',
    lat: 10.9478,
    lng: 106.8722,
    outsideCity: false,
    facilityType: 'INDUSTRIAL_PARK',
  },
  {
    code: 'PORT_PHUOC_AN',
    name: 'Cảng Phước An',
    localityName: 'Xã Phước An',
    corridor: 'SOUTH',
    lat: 10.6789,
    lng: 106.9245,
    outsideCity: false,
    facilityType: 'SEAPORT',
  },
  {
    code: 'ICD_NHON_TRACH',
    name: 'ICD & Depot Nhơn Trạch',
    localityName: 'Phường Nhơn Trạch',
    corridor: 'SOUTH',
    lat: 10.7421,
    lng: 106.9068,
    outsideCity: false,
    facilityType: 'DEPOT',
  },
  {
    code: 'LTIA_GATEWAY',
    name: 'Cửa ngõ Hàng hóa Sân bay Long Thành',
    localityName: 'Phường Long Thành',
    corridor: 'SOUTH',
    lat: 10.7795,
    lng: 107.0182,
    outsideCity: false,
    facilityType: 'AIRPORT',
  },
  {
    code: 'HUB_LONG_KHANH',
    name: 'Trung tâm Trung chuyển Long Khánh',
    localityName: 'Phường Long Khánh',
    corridor: 'CENTRAL',
    lat: 10.9355,
    lng: 107.2435,
    outsideCity: false,
    facilityType: 'DEPOT',
  },
  {
    code: 'HUB_DONG_XOAI',
    name: 'Kho Trung chuyển Phía Bắc Đồng Xoài',
    localityName: 'Phường Đồng Xoài',
    corridor: 'NORTH',
    lat: 11.5356,
    lng: 106.8935,
    outsideCity: false,
    facilityType: 'DEPOT',
  },
  {
    code: 'HUB_CHON_THANH',
    name: 'KCN Chơn Thành Gateway',
    localityName: 'Phường Chơn Thành',
    corridor: 'NORTH',
    lat: 11.4302,
    lng: 106.6204,
    outsideCity: false,
    facilityType: 'INDUSTRIAL_PARK',
  },
  {
    code: 'PORT_CAT_LAI',
    name: 'Cảng Cát Lái (Ngoài ĐN)',
    localityName: 'TP. Thủ Đức, TP.HCM',
    corridor: 'SOUTH',
    lat: 10.7689,
    lng: 106.7944,
    outsideCity: true,
    facilityType: 'SEAPORT',
  },
  {
    code: 'PORT_CAI_MEP',
    name: 'Cụm Cảng Cái Mép - Thị Vải (Ngoài ĐN)',
    localityName: 'Phú Mỹ, BR-VT',
    corridor: 'SOUTH',
    lat: 10.5221,
    lng: 107.0185,
    outsideCity: true,
    facilityType: 'SEAPORT',
  },
];
