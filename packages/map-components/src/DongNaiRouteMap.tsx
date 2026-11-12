'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';

export type DongNaiCorridorKey = 'NORTH' | 'CENTRAL' | 'SOUTH';

export interface DongNaiMapStop {
  id: string;
  name: string;
  locality?: string;
  detail?: string;
  lat?: number | null;
  lng?: number | null;
  status?: 'COMPLETED' | 'CURRENT' | 'PENDING' | 'DELAYED' | string;
  eta?: string | null;
  outsideCity?: boolean;
  facilityType?: string;
  corridor?: DongNaiCorridorKey | string;
  waitMinutes?: number | null;
  sequence?: number;
}

export interface DongNaiMapWaypoint {
  lat: number;
  lng: number;
  label?: string;
  eta?: string;
}

export interface DongNaiMapVehicle {
  id: string;
  lat?: number | null;
  lng?: number | null;
  label?: string;
  plate?: string;
  status?: string;
  speedKmh?: number | null;
  heading?: number | null;
  driverMasked?: string;
  updatedAt?: string | null;
}

export interface DongNaiMapPolyline {
  id: string;
  label?: string;
  color?: string;
  dashed?: boolean;
  active?: boolean;
  points: Array<{ lat: number; lng: number; label?: string }>;
}

export interface DongNaiRouteMapProps {
  title?: string;
  subtitle?: string;
  stops?: DongNaiMapStop[];
  waypoints?: DongNaiMapWaypoint[];
  polylines?: DongNaiMapPolyline[];
  currentPosition?: DongNaiMapVehicle | null;
  offlinePoints?: Array<{ id?: string; lat: number; lng: number; label?: string }>;
  progressPercent?: number;
  masked?: boolean;
  precisionLabel?: string;
  isSimulatedRoute?: boolean;
  interactivePlayback?: boolean;
  showAllHubs?: boolean;
  showCorridors?: boolean;
  selectedId?: string | null;
  onSelectStop?: (id: string) => void;
  height?: number;
  className?: string;
}

interface RefHub {
  id: string;
  code: string;
  name: string;
  shortName: string;
  locality: string;
  corridor: DongNaiCorridorKey;
  lat: number;
  lng: number;
  outsideCity: boolean;
  kind: 'ICD' | 'KCN' | 'PORT' | 'AIRPORT' | 'DEPOT';
}

export const DONG_NAI_MAP_HUBS: RefHub[] = [
  {
    id: 'HUB_DONG_XOAI',
    code: 'DXO',
    name: 'Kho Trung chuyển Đồng Xoài',
    shortName: 'Đồng Xoài',
    locality: 'Phường Đồng Xoài',
    corridor: 'NORTH',
    lat: 11.5356,
    lng: 106.8935,
    outsideCity: false,
    kind: 'DEPOT',
  },
  {
    id: 'HUB_CHON_THANH',
    code: 'CTH',
    name: 'KCN Chơn Thành Gateway',
    shortName: 'Chơn Thành',
    locality: 'Phường Chơn Thành',
    corridor: 'NORTH',
    lat: 11.4302,
    lng: 106.6204,
    outsideCity: false,
    kind: 'KCN',
  },
  {
    id: 'HUB_AMATA',
    code: 'AMT',
    name: 'KCN Amata Biên Hòa',
    shortName: 'KCN Amata',
    locality: 'Phường Long Bình',
    corridor: 'CENTRAL',
    lat: 10.9478,
    lng: 106.8722,
    outsideCity: false,
    kind: 'KCN',
  },
  {
    id: 'ICD_TAN_CANG_LONG_BINH',
    code: 'ICD-LB',
    name: 'ICD Tân Cảng Long Bình',
    shortName: 'ICD Long Bình',
    locality: 'Phường Long Bình',
    corridor: 'CENTRAL',
    lat: 10.9415,
    lng: 106.8908,
    outsideCity: false,
    kind: 'ICD',
  },
  {
    id: 'HUB_LONG_KHANH',
    code: 'LKH',
    name: 'Trung chuyển Long Khánh',
    shortName: 'Long Khánh',
    locality: 'Phường Long Khánh',
    corridor: 'CENTRAL',
    lat: 10.9355,
    lng: 107.2435,
    outsideCity: false,
    kind: 'DEPOT',
  },
  {
    id: 'PORT_CAT_LAI',
    code: 'CL-EXT',
    name: 'Cảng Cát Lái (TP.HCM)',
    shortName: 'Cảng Cát Lái',
    locality: 'TP. Thủ Đức',
    corridor: 'SOUTH',
    lat: 10.7689,
    lng: 106.7944,
    outsideCity: true,
    kind: 'PORT',
  },
  {
    id: 'LTIA_GATEWAY',
    code: 'LTIA',
    name: 'Cửa ngõ Sân bay Long Thành',
    shortName: 'Sân bay Long Thành',
    locality: 'Phường Long Thành',
    corridor: 'SOUTH',
    lat: 10.7795,
    lng: 107.0182,
    outsideCity: false,
    kind: 'AIRPORT',
  },
  {
    id: 'ICD_NHON_TRACH',
    code: 'NTR',
    name: 'ICD & Depot Nhơn Trạch',
    shortName: 'Nhơn Trạch',
    locality: 'Phường Nhơn Trạch',
    corridor: 'SOUTH',
    lat: 10.7421,
    lng: 106.9068,
    outsideCity: false,
    kind: 'ICD',
  },
  {
    id: 'PORT_PHUOC_AN',
    code: 'PAP',
    name: 'Cảng Phước An',
    shortName: 'Cảng Phước An',
    locality: 'Xã Phước An',
    corridor: 'SOUTH',
    lat: 10.6789,
    lng: 106.9245,
    outsideCity: false,
    kind: 'PORT',
  },
  {
    id: 'PORT_CAI_MEP',
    code: 'CM-EXT',
    name: 'Cụm Cảng Cái Mép - Thị Vải',
    shortName: 'Cái Mép - Thị Vải',
    locality: 'Phú Mỹ, BR-VT',
    corridor: 'SOUTH',
    lat: 10.5221,
    lng: 107.0185,
    outsideCity: true,
    kind: 'PORT',
  },
];

const ARTERY_PATHS: Array<{
  id: string;
  label: string;
  coords: Array<[number, number]>;
  stroke: string;
  width: number;
  dashed?: boolean;
}> = [
  {
    id: 'QL1A',
    label: 'QL1A',
    coords: [
      [10.892, 106.775],
      [10.945, 106.842],
      [10.9478, 106.8722],
      [10.9415, 106.8908],
      [10.949, 107.02],
      [10.9355, 107.2435],
    ],
    stroke: '#cbd5e1',
    width: 2.2,
  },
  {
    id: 'QL51',
    label: 'QL51',
    coords: [
      [10.915, 106.862],
      [10.858, 106.928],
      [10.7795, 107.0182],
      [10.6789, 106.9245],
      [10.5221, 107.0185],
    ],
    stroke: '#cbd5e1',
    width: 2.2,
  },
  {
    id: 'CT_LT_DG',
    label: 'Cao tốc LT-DG',
    coords: [
      [10.7689, 106.7944],
      [10.798, 106.915],
      [10.7795, 107.0182],
      [10.942, 107.145],
    ],
    stroke: '#bfdbfe',
    width: 2.4,
    dashed: true,
  },
  {
    id: 'NORTH_LINK',
    label: 'ĐT741 / QL13',
    coords: [
      [10.9478, 106.8722],
      [11.095, 106.835],
      [11.28, 106.76],
      [11.4302, 106.6204],
      [11.5356, 106.8935],
    ],
    stroke: '#e2e8f0',
    width: 1.8,
  },
];

const RIVER_COORDS: Array<[number, number]> = [
  [11.12, 106.99],
  [11.03, 106.94],
  [10.948, 106.845],
  [10.865, 106.828],
  [10.765, 106.815],
  [10.668, 106.875],
  [10.53, 106.965],
];

function finiteNum(val: unknown): number | null {
  if (val === null || val === undefined || val === '') return null;
  const n = Number(val);
  return Number.isFinite(n) ? n : null;
}

function interpolateAlongPath(
  points: Array<{ lat: number; lng: number; label?: string }>,
  tRaw: number,
): { lat: number; lng: number; heading: number; segmentLabel: string } | null {
  if (points.length === 0) return null;
  if (points.length === 1) {
    return {
      lat: points[0].lat,
      lng: points[0].lng,
      heading: 0,
      segmentLabel: points[0].label || '',
    };
  }
  const t = Math.max(0, Math.min(1, tRaw));
  const segLengths: number[] = [];
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const dLat = points[i + 1].lat - points[i].lat;
    const dLng = points[i + 1].lng - points[i].lng;
    const len = Math.hypot(dLat, dLng) || 0.0001;
    segLengths.push(len);
    total += len;
  }
  let target = t * total;
  for (let i = 0; i < segLengths.length; i++) {
    const len = segLengths[i];
    if (target <= len || i === segLengths.length - 1) {
      const localT = len > 0 ? Math.max(0, Math.min(1, target / len)) : 0;
      const a = points[i];
      const b = points[i + 1];
      const angleRad = Math.atan2(b.lng - a.lng, b.lat - a.lat);
      return {
        lat: a.lat + (b.lat - a.lat) * localT,
        lng: a.lng + (b.lng - a.lng) * localT,
        heading: Math.round(((angleRad * 180) / Math.PI + 360) % 360),
        segmentLabel: `${a.label || `Chặng ${i + 1}`} -> ${b.label || `Điểm ${i + 2}`}`,
      };
    }
    target -= len;
  }
  const last = points[points.length - 1];
  return { lat: last.lat, lng: last.lng, heading: 0, segmentLabel: last.label || '' };
}

function hubFill(kind: RefHub['kind'], outsideCity?: boolean): string {
  if (outsideCity) return '#d97706';
  switch (kind) {
    case 'ICD':
      return '#0f766e';
    case 'PORT':
      return '#0369a1';
    case 'AIRPORT':
      return '#4f46e5';
    case 'KCN':
      return '#15803d';
    default:
      return '#334155';
  }
}

function stopStatusFill(status?: string): string {
  const s = String(status || '').toUpperCase();
  if (s === 'COMPLETED' || s === 'DELIVERED') return '#15803d';
  if (s === 'CURRENT' || s === 'IN_TRANSIT' || s === 'IN_PROGRESS') return '#2563eb';
  if (s === 'DELAYED' || s === 'FAILED' || s === 'SOS') return '#dc2626';
  return '#475569';
}

export function DongNaiRouteMap({
  title = 'Bản đồ Hành lang Logistics TP Đồng Nai',
  subtitle,
  stops = [],
  waypoints = [],
  polylines = [],
  currentPosition = null,
  offlinePoints = [],
  progressPercent,
  masked = false,
  precisionLabel,
  isSimulatedRoute = true,
  interactivePlayback = false,
  showAllHubs = true,
  showCorridors = true,
  selectedId = null,
  onSelectStop,
  height = 380,
  className = '',
}: DongNaiRouteMapProps) {
  const initialProgress =
    typeof progressPercent === 'number' && Number.isFinite(progressPercent)
      ? Math.max(0, Math.min(100, progressPercent))
      : 56;

  const [simProgress, setSimProgress] = useState<number>(initialProgress);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [speedMultiplier, setSpeedMultiplier] = useState<1 | 4>(1);
  const [reducedMotion, setReducedMotion] = useState<boolean>(false);
  const [zoomScale, setZoomScale] = useState<number>(1);
  const [expanded, setExpanded] = useState<boolean>(false);
  const [focusedItem, setFocusedItem] = useState<{
    title: string;
    detail: string;
    badge?: string;
    coords?: string;
  } | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setSimProgress(initialProgress);
  }, [initialProgress]);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => {
      setReducedMotion(mq.matches);
      if (mq.matches) {
        setIsPlaying(false);
      }
    };
    apply();
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', apply);
      return () => mq.removeEventListener('change', apply);
    }
    return undefined;
  }, []);

  useEffect(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (!interactivePlayback || !isPlaying || masked) return;
    timerRef.current = setInterval(() => {
      setSimProgress((prev) => {
        const next = prev + (speedMultiplier === 4 ? 2.4 : 0.8);
        return next >= 100 ? 0 : Number(next.toFixed(1));
      });
    }, 180);
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [interactivePlayback, isPlaying, speedMultiplier, masked]);

  const validStops = useMemo(
    () =>
      stops
        .map((s) => ({
          ...s,
          lat: finiteNum(s.lat),
          lng: finiteNum(s.lng),
        }))
        .filter((s): s is DongNaiMapStop & { lat: number; lng: number } => s.lat !== null && s.lng !== null),
    [stops],
  );

  const primaryRoutePoints = useMemo(() => {
    const cleanWp = waypoints
      .map((w) => ({ lat: finiteNum(w.lat), lng: finiteNum(w.lng), label: w.label }))
      .filter((w): w is { lat: number; lng: number; label: string | undefined } => w.lat !== null && w.lng !== null);
    if (cleanWp.length >= 2) return cleanWp;
    if (validStops.length >= 2) {
      return validStops.map((s) => ({ lat: s.lat, lng: s.lng, label: s.name }));
    }
    if (polylines.length > 0 && polylines[0].points.length >= 2) {
      return polylines[0].points
        .map((p) => ({ lat: finiteNum(p.lat), lng: finiteNum(p.lng), label: p.label }))
        .filter((p): p is { lat: number; lng: number; label: string | undefined } => p.lat !== null && p.lng !== null);
    }
    return [];
  }, [waypoints, validStops, polylines]);

  const cleanCurrent = useMemo(() => {
    if (!currentPosition) return null;
    const lat = finiteNum(currentPosition.lat);
    const lng = finiteNum(currentPosition.lng);
    if (lat === null || lng === null) return null;
    return { ...currentPosition, lat, lng };
  }, [currentPosition]);

  const simulatedPos = useMemo(() => {
    if (masked) return null;
    if (interactivePlayback && primaryRoutePoints.length >= 2) {
      return interpolateAlongPath(primaryRoutePoints, simProgress / 100);
    }
    if (cleanCurrent) {
      return {
        lat: cleanCurrent.lat,
        lng: cleanCurrent.lng,
        heading: finiteNum(cleanCurrent.heading) ?? 0,
        segmentLabel: cleanCurrent.label || 'Vị trí hiện tại',
      };
    }
    if (primaryRoutePoints.length >= 2) {
      return interpolateAlongPath(primaryRoutePoints, simProgress / 100);
    }
    return null;
  }, [masked, interactivePlayback, primaryRoutePoints, simProgress, cleanCurrent]);

  // Determine geographic bounding box adaptively so North hubs (11.54) never clip,
  // while dense South-Central corridors remain crisp and readable.
  const bounds = useMemo(() => {
    const lats: number[] = [];
    const lngs: number[] = [];

    validStops.forEach((s) => {
      lats.push(s.lat);
      lngs.push(s.lng);
    });
    primaryRoutePoints.forEach((p) => {
      lats.push(p.lat);
      lngs.push(p.lng);
    });
    polylines.forEach((line) =>
      line.points.forEach((p) => {
        const la = finiteNum(p.lat);
        const ln = finiteNum(p.lng);
        if (la !== null && ln !== null) {
          lats.push(la);
          lngs.push(ln);
        }
      }),
    );
    if (cleanCurrent) {
      lats.push(cleanCurrent.lat);
      lngs.push(cleanCurrent.lng);
    }
    if (showAllHubs || lats.length === 0) {
      DONG_NAI_MAP_HUBS.forEach((h) => {
        if (h.corridor !== 'NORTH' || lats.length === 0 || lats.some((v) => v > 11.1)) {
          lats.push(h.lat);
          lngs.push(h.lng);
        }
      });
    }

    const baseMinLat = Math.min(...lats, 10.50);
    const baseMaxLat = Math.max(...lats, 10.99);
    const baseMinLng = Math.min(...lngs, 106.76);
    const baseMaxLng = Math.max(...lngs, 107.18);

    const latSpan = Math.max(0.24, baseMaxLat - baseMinLat);
    const lngSpan = Math.max(0.28, baseMaxLng - baseMinLng);
    const centerLat = (baseMinLat + baseMaxLat) / 2;
    const centerLng = (baseMinLng + baseMaxLng) / 2;

    const padLat = (latSpan * 0.24) / zoomScale;
    const padLng = (lngSpan * 0.24) / zoomScale;

    return {
      minLat: centerLat - (latSpan / 2) / zoomScale - padLat,
      maxLat: centerLat + (latSpan / 2) / zoomScale + padLat,
      minLng: centerLng - (lngSpan / 2) / zoomScale - padLng,
      maxLng: centerLng + (lngSpan / 2) / zoomScale + padLng,
    };
  }, [validStops, primaryRoutePoints, polylines, cleanCurrent, showAllHubs, zoomScale]);

  const W = 760;
  const H = 430;

  const project = (lat: number, lng: number): [number, number] => {
    const xRatio = (lng - bounds.minLng) / Math.max(0.01, bounds.maxLng - bounds.minLng);
    const yRatio = (bounds.maxLat - lat) / Math.max(0.01, bounds.maxLat - bounds.minLat);
    return [
      Number((36 + xRatio * (W - 72)).toFixed(1)),
      Number((28 + yRatio * (H - 56)).toFixed(1)),
    ];
  };

  const riverPath = useMemo(() => {
    const pts = RIVER_COORDS.map(([la, ln]) => project(la, ln));
    return pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0]},${p[1]}`).join(' ');
  }, [bounds]);

  if (masked) {
    return (
      <div
        className={className}
        style={{
          border: '1px solid var(--line, #e4e4e7)',
          borderRadius: '10px',
          background: 'var(--surface, #ffffff)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '8px',
            padding: '10px 14px',
            borderBottom: '1px solid var(--line, #e4e4e7)',
            background: 'var(--surface-alt, #f8fafc)',
          }}
        >
          <div>
            <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ink, #18181b)' }}>
              {title}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--ink-faint, #71717a)' }}>
              {precisionLabel || 'STATUS_ONLY'} · Bảo vệ riêng tư dữ liệu vị trí
            </div>
          </div>
          <span
            style={{
              fontSize: '10px',
              fontFamily: 'monospace',
              fontWeight: 600,
              padding: '2px 8px',
              borderRadius: '999px',
              border: '1px solid #cbd5e1',
              background: '#f1f5f9',
              color: '#334155',
            }}
          >
            STATUS_ONLY · MASKED
          </span>
        </div>
        <div
          style={{
            padding: '28px 18px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            gap: '8px',
            minHeight: Math.min(height, 220),
            background:
              'radial-gradient(circle at 50% 45%, rgba(100,116,139,0.08), transparent 68%), var(--surface-alt, #f8fafc)',
          }}
        >
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="1.6">
            <rect x="4" y="11" width="16" height="9" rx="2" />
            <path d="M8 11V7a4 4 0 0 1 8 0v4" />
          </svg>
          <p style={{ margin: 0, fontSize: '13px', fontWeight: 600, color: 'var(--ink, #18181b)' }}>
            Không hiển thị tọa độ chi tiết
          </p>
          <p style={{ margin: 0, maxWidth: '460px', fontSize: '12px', color: 'var(--ink-soft, #52525b)', lineHeight: 1.5 }}>
            Liên kết chia sẻ này chỉ cấp quyền <strong>STATUS_ONLY</strong>. Vị trí GPS thời gian thực, tuyến đường và thông tin người nhận được ẩn theo chính sách bảo mật.
          </p>
        </div>
      </div>
    );
  }

  const effectiveHeight = expanded ? Math.max(520, height + 140) : height;
  const completedCount = Math.max(
    1,
    Math.round((primaryRoutePoints.length - 1) * (simProgress / 100)) + 1,
  );
  const completedPts =
    primaryRoutePoints.length >= 2 && simulatedPos
      ? [
          ...primaryRoutePoints.slice(0, completedCount),
          { lat: simulatedPos.lat, lng: simulatedPos.lng, label: simulatedPos.segmentLabel },
        ]
      : [];

  return (
    <div
      className={className}
      style={{
        border: '1px solid var(--line, #e4e4e7)',
        borderRadius: '10px',
        background: 'var(--surface, #ffffff)',
        overflow: 'hidden',
      }}
    >
      {/* Top Toolbar */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '8px',
          padding: '10px 14px',
          borderBottom: '1px solid var(--line, #e4e4e7)',
          background: 'var(--surface-alt, #f8fafc)',
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink, #18181b)' }}>
              {title}
            </span>
            {precisionLabel ? (
              <span
                style={{
                  fontSize: '10px',
                  fontFamily: 'monospace',
                  fontWeight: 600,
                  padding: '2px 6px',
                  borderRadius: '4px',
                  background: '#eff6ff',
                  color: '#1d4ed8',
                  border: '1px solid #bfdbfe',
                }}
              >
                {precisionLabel}
              </span>
            ) : null}
            {isSimulatedRoute ? (
              <span
                style={{
                  fontSize: '10px',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  background: '#f1f5f9',
                  color: '#475569',
                  border: '1px solid #e2e8f0',
                }}
              >
                Hành trình mô phỏng
              </span>
            ) : null}
          </div>
          {subtitle ? (
            <div style={{ marginTop: '2px', fontSize: '11px', color: 'var(--ink-soft, #52525b)' }}>
              {subtitle}
            </div>
          ) : null}
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px' }}>
          <button
            type="button"
            onClick={() => setZoomScale((z) => Math.min(2.2, Number((z + 0.25).toFixed(2))))}
            aria-label="Phóng to bản đồ"
            style={{
              height: '26px',
              width: '26px',
              borderRadius: '5px',
              border: '1px solid var(--line, #d4d4d8)',
              background: 'var(--surface, #ffffff)',
              color: 'var(--ink, #18181b)',
              fontSize: '13px',
              cursor: 'pointer',
            }}
          >
            +
          </button>
          <button
            type="button"
            onClick={() => setZoomScale((z) => Math.max(0.8, Number((z - 0.25).toFixed(2))))}
            aria-label="Thu nhỏ bản đồ"
            style={{
              height: '26px',
              width: '26px',
              borderRadius: '5px',
              border: '1px solid var(--line, #d4d4d8)',
              background: 'var(--surface, #ffffff)',
              color: 'var(--ink, #18181b)',
              fontSize: '13px',
              cursor: 'pointer',
            }}
          >
            -
          </button>
          <button
            type="button"
            onClick={() => setZoomScale(1)}
            style={{
              height: '26px',
              padding: '0 8px',
              borderRadius: '5px',
              border: '1px solid var(--line, #d4d4d8)',
              background: 'var(--surface, #ffffff)',
              color: 'var(--ink-soft, #52525b)',
              fontSize: '11px',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Toàn tuyến
          </button>
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            style={{
              height: '26px',
              padding: '0 8px',
              borderRadius: '5px',
              border: '1px solid var(--line, #d4d4d8)',
              background: 'var(--surface, #ffffff)',
              color: 'var(--ink-soft, #52525b)',
              fontSize: '11px',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            {expanded ? 'Thu gọn' : 'Mở rộng'}
          </button>
        </div>
      </div>

      {/* Playback controls */}
      {interactivePlayback && primaryRoutePoints.length >= 2 ? (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '10px',
            padding: '8px 14px',
            borderBottom: '1px solid var(--line, #e4e4e7)',
            background: '#fafafa',
          }}
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px' }}>
            <button
              type="button"
              onClick={() => setIsPlaying((p) => !p)}
              style={{
                height: '28px',
                padding: '0 10px',
                borderRadius: '6px',
                border: '1px solid var(--accent, #2563eb)',
                background: isPlaying ? '#eff6ff' : 'var(--accent, #2563eb)',
                color: isPlaying ? 'var(--accent, #2563eb)' : '#ffffff',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {isPlaying ? 'Tạm dừng' : 'Phát mô phỏng'}
            </button>
            <button
              type="button"
              onClick={() => setSpeedMultiplier((s) => (s === 1 ? 4 : 1))}
              style={{
                height: '28px',
                padding: '0 8px',
                borderRadius: '6px',
                border: '1px solid var(--line, #d4d4d8)',
                background: '#ffffff',
                color: 'var(--ink, #18181b)',
                fontSize: '11px',
                fontFamily: 'monospace',
                cursor: 'pointer',
              }}
            >
              Tốc độ {speedMultiplier}x
            </button>
            <button
              type="button"
              onClick={() => {
                setIsPlaying(false);
                setSimProgress(0);
              }}
              style={{
                height: '28px',
                padding: '0 8px',
                borderRadius: '6px',
                border: '1px solid var(--line, #d4d4d8)',
                background: '#ffffff',
                color: 'var(--ink-soft, #52525b)',
                fontSize: '11px',
                cursor: 'pointer',
              }}
            >
              Đặt lại
            </button>
          </div>

          <div style={{ display: 'flex', flex: 1, minWidth: '180px', alignItems: 'center', gap: '8px' }}>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              aria-label="Tiến độ mô phỏng lộ trình"
              value={Math.round(simProgress)}
              onChange={(e) => setSimProgress(Number(e.target.value))}
              style={{ flex: 1, accentColor: '#2563eb' }}
            />
            <span
              style={{
                fontSize: '11px',
                fontFamily: 'monospace',
                fontWeight: 600,
                color: 'var(--ink, #18181b)',
                minWidth: '38px',
                textAlign: 'right',
              }}
            >
              {Math.round(simProgress)}%
            </span>
          </div>
          {reducedMotion ? (
            <span style={{ fontSize: '10px', color: '#64748b' }}>
              Đã giữ tĩnh theo prefers-reduced-motion
            </span>
          ) : null}
        </div>
      ) : null}

      {/* Main SVG Viewport */}
      <div style={{ position: 'relative', width: '100%', height: `${effectiveHeight}px`, background: '#f8fafc' }}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="xMidYMid meet"
          style={{ width: '100%', height: '100%', display: 'block' }}
          role="img"
          aria-label={title}
        >
          <defs>
            <pattern id="dn-grid" width="38" height="38" patternUnits="userSpaceOnUse">
              <path d="M 38 0 L 0 0 0 38" fill="none" stroke="#e2e8f0" strokeWidth="0.6" strokeDasharray="2 4" />
            </pattern>
            <linearGradient id="dn-bg" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#f8fafc" />
              <stop offset="100%" stopColor="#f1f5f9" />
            </linearGradient>
          </defs>

          <rect x={0} y={0} width={W} height={H} fill="url(#dn-bg)" />
          <rect x={0} y={0} width={W} height={H} fill="url(#dn-grid)" />

          {/* Corridor Sector Watermarks */}
          <text x={44} y={32} fontSize="10" fontWeight="700" fill="#94a3b8" letterSpacing="1.2">
            HÀNH LANG BẮC · ĐỒNG XOÀI - CHƠN THÀNH
          </text>
          <text x={44} y={H / 2 - 20} fontSize="10" fontWeight="700" fill="#94a3b8" letterSpacing="1.2">
            TRUNG TÂM · BIÊN HÒA - AMATA - LONG BÌNH
          </text>
          <text x={44} y={H - 54} fontSize="10" fontWeight="700" fill="#94a3b8" letterSpacing="1.2">
            HÀNH LANG NAM · LONG THÀNH - NHƠN TRẠCH - PHƯỚC AN
          </text>

          {/* Stylized Dong Nai River Hydrography */}
          <path d={riverPath} fill="none" stroke="#dbeafe" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />

          {/* Major Artery Highways */}
          {showCorridors
            ? ARTERY_PATHS.map((road) => {
                const d = road.coords
                  .map(([la, ln], i) => {
                    const [px, py] = project(la, ln);
                    return `${i === 0 ? 'M' : 'L'}${px},${py}`;
                  })
                  .join(' ');
                const mid = road.coords[Math.floor(road.coords.length / 2)];
                const [mx, my] = project(mid[0], mid[1]);
                return (
                  <g key={road.id}>
                    <path
                      d={d}
                      fill="none"
                      stroke={road.stroke}
                      strokeWidth={road.width}
                      strokeDasharray={road.dashed ? '6 4' : undefined}
                      strokeLinecap="round"
                    />
                    <text x={mx + 4} y={my - 5} fontSize="9" fontWeight="600" fill="#64748b">
                      {road.label}
                    </text>
                  </g>
                );
              })
            : null}

          {/* Reference Hubs (10 key Đồng Nai + External Gateways) */}
          {showAllHubs
            ? DONG_NAI_MAP_HUBS.map((hub) => {
                const [hx, hy] = project(hub.lat, hub.lng);
                const color = hubFill(hub.kind, hub.outsideCity);
                return (
                  <g
                    key={hub.id}
                    style={{ cursor: 'pointer' }}
                    onClick={() =>
                      setFocusedItem({
                        title: hub.name,
                        detail: `${hub.locality} · Hành lang ${hub.corridor}`,
                        badge: hub.outsideCity ? 'Ngoài TP Đồng Nai' : hub.kind,
                        coords: `${hub.lat.toFixed(4)}, ${hub.lng.toFixed(4)}`,
                      })
                    }
                  >
                    <circle cx={hx} cy={hy} r={4.8} fill="#ffffff" stroke={color} strokeWidth={2} />
                    <circle cx={hx} cy={hy} r={2.1} fill={color} />
                    <text
                      x={hx + 7}
                      y={hy + 3}
                      fontSize="9.5"
                      fontWeight={hub.outsideCity ? '600' : '500'}
                      fill={hub.outsideCity ? '#b45309' : '#334155'}
                    >
                      {hub.shortName}
                      {hub.outsideCity ? ' [Ngoài TP]' : ''}
                    </text>
                  </g>
                );
              })
            : null}

          {/* Additional Multi-Trip Polylines (e.g. Dispatch) */}
          {polylines.map((line) => {
            const validPts = line.points
              .map((p) => ({ lat: finiteNum(p.lat), lng: finiteNum(p.lng) }))
              .filter((p): p is { lat: number; lng: number } => p.lat !== null && p.lng !== null);
            if (validPts.length < 2) return null;
            const d = validPts
              .map((p, idx) => {
                const [px, py] = project(p.lat, p.lng);
                return `${idx === 0 ? 'M' : 'L'}${px},${py}`;
              })
              .join(' ');
            return (
              <path
                key={line.id}
                d={d}
                fill="none"
                stroke={line.color || '#2563eb'}
                strokeWidth={line.active ? 3.5 : 2}
                strokeOpacity={line.active === false ? 0.45 : 0.85}
                strokeDasharray={line.dashed ? '6 4' : undefined}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            );
          })}

          {/* Primary Active Corridor Route */}
          {primaryRoutePoints.length >= 2 ? (
            <>
              <path
                d={primaryRoutePoints
                  .map((p, idx) => {
                    const [px, py] = project(p.lat, p.lng);
                    return `${idx === 0 ? 'M' : 'L'}${px},${py}`;
                  })
                  .join(' ')}
                fill="none"
                stroke="#93c5fd"
                strokeWidth="4"
                strokeDasharray="7 5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {completedPts.length >= 2 ? (
                <path
                  d={completedPts
                    .map((p, idx) => {
                      const [px, py] = project(p.lat, p.lng);
                      return `${idx === 0 ? 'M' : 'L'}${px},${py}`;
                    })
                    .join(' ')}
                  fill="none"
                  stroke="#2563eb"
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ) : null}
            </>
          ) : null}

          {/* Offline Cached Breadcrumbs (Driver Sim) */}
          {offlinePoints.map((pt, idx) => {
            const la = finiteNum(pt.lat);
            const ln = finiteNum(pt.lng);
            if (la === null || ln === null) return null;
            const [ox, oy] = project(la, ln);
            return (
              <g key={pt.id || idx}>
                <circle cx={ox} cy={oy} r={4} fill="#f59e0b" stroke="#ffffff" strokeWidth={1.5} />
              </g>
            );
          })}

          {/* Stop Pins */}
          {validStops.map((stop, idx) => {
            const [sx, sy] = project(stop.lat, stop.lng);
            const fill = stopStatusFill(stop.status);
            const isSel = selectedId && stop.id === selectedId;
            return (
              <g
                key={stop.id}
                style={{ cursor: 'pointer' }}
                onClick={() => {
                  setFocusedItem({
                    title: stop.name,
                    detail: stop.detail || stop.locality || 'Điểm dừng tuyến vận tải',
                    badge: stop.outsideCity ? 'Ngoài TP' : stop.status || 'STOP',
                    coords: `${stop.lat.toFixed(4)}, ${stop.lng.toFixed(4)}`,
                  });
                  onSelectStop?.(stop.id);
                }}
              >
                {isSel ? <circle cx={sx} cy={sy} r={12} fill="rgba(37,99,235,0.16)" /> : null}
                <circle cx={sx} cy={sy} r={7.5} fill={fill} stroke="#ffffff" strokeWidth={2} />
                <text x={sx} y={sy + 3} fontSize="8.5" fontWeight="700" fill="#ffffff" textAnchor="middle">
                  {stop.sequence ?? idx + 1}
                </text>
                <g transform={`translate(${sx + 10}, ${sy - 9})`}>
                  <rect
                    x={0}
                    y={0}
                    width={Math.min(148, Math.max(66, stop.name.length * 5.8 + 14))}
                    height={18}
                    rx={4}
                    fill="#ffffff"
                    fillOpacity={0.94}
                    stroke="#cbd5e1"
                    strokeWidth={0.8}
                  />
                  <text x={6} y={12} fontSize="9.5" fontWeight="600" fill="#0f172a">
                    {stop.name.length > 22 ? `${stop.name.slice(0, 21)}...` : stop.name}
                  </text>
                </g>
              </g>
            );
          })}

          {/* Live / Simulated Vehicle Marker */}
          {simulatedPos ? (
            (() => {
              const [vx, vy] = project(simulatedPos.lat, simulatedPos.lng);
              return (
                <g
                  style={{ cursor: 'pointer' }}
                  onClick={() =>
                    setFocusedItem({
                      title: cleanCurrent?.label || 'Xe đang vận hành',
                      detail: simulatedPos.segmentLabel || 'Đang di chuyển trên hành lang Đồng Nai',
                      badge: cleanCurrent?.plate || `${cleanCurrent?.speedKmh ?? 46} km/h`,
                      coords: `${simulatedPos.lat.toFixed(4)}, ${simulatedPos.lng.toFixed(4)}`,
                    })
                  }
                >
                  {!reducedMotion ? (
                    <circle cx={vx} cy={vy} r={15} fill="rgba(37,99,235,0.18)">
                      <animate attributeName="r" values="10;18;10" dur="2.2s" repeatCount="indefinite" />
                      <animate attributeName="opacity" values="0.35;0.08;0.35" dur="2.2s" repeatCount="indefinite" />
                    </circle>
                  ) : null}
                  <circle cx={vx} cy={vy} r={9} fill="#2563eb" stroke="#ffffff" strokeWidth={2.5} />
                  <path
                    d={`M ${vx} ${vy - 5} L ${vx + 4} ${vy + 4} L ${vx} ${vy + 1.8} L ${vx - 4} ${vy + 4} Z`}
                    fill="#ffffff"
                    transform={`rotate(${simulatedPos.heading || 0}, ${vx}, ${vy})`}
                  />
                </g>
              );
            })()
          ) : null}
        </svg>

        {/* Bottom-Left Compact Legend */}
        <div
          style={{
            position: 'absolute',
            left: '10px',
            bottom: '10px',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: '10px',
            padding: '5px 10px',
            borderRadius: '6px',
            background: 'rgba(255,255,255,0.92)',
            border: '1px solid #e2e8f0',
            fontSize: '10px',
            color: '#475569',
          }}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '99px', background: '#2563eb' }} />
            Xe / Tuyến đang chạy
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '99px', background: '#0f766e' }} />
            ICD / KCN Đồng Nai
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '99px', background: '#d97706' }} />
            Cửa ngõ Ngoài TP
          </span>
        </div>

        {/* Bottom-Right Provenance Note */}
        <div
          style={{
            position: 'absolute',
            right: '10px',
            bottom: '10px',
            padding: '4px 8px',
            borderRadius: '6px',
            background: 'rgba(255,255,255,0.9)',
            border: '1px solid #e2e8f0',
            fontSize: '10px',
            color: '#64748b',
          }}
        >
          Địa giới ĐN 2026 (NO_OFFICIAL_POLYGON) · Lộ trình minh họa
        </div>

        {/* Interactive Focus Popover */}
        {focusedItem ? (
          <div
            style={{
              position: 'absolute',
              top: '12px',
              right: '12px',
              maxWidth: '250px',
              padding: '10px 12px',
              borderRadius: '8px',
              background: '#ffffff',
              border: '1px solid #cbd5e1',
              boxShadow: '0 8px 20px rgba(15, 23, 42, 0.08)',
              fontSize: '11px',
              zIndex: 5,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: '8px' }}>
              <strong style={{ color: '#0f172a', fontSize: '12px' }}>{focusedItem.title}</strong>
              <button
                type="button"
                onClick={() => setFocusedItem(null)}
                aria-label="Đóng chi tiết điểm"
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: '#64748b',
                  cursor: 'pointer',
                  fontSize: '12px',
                  lineHeight: 1,
                }}
              >
                x
              </button>
            </div>
            <p style={{ margin: '4px 0 0', color: '#475569' }}>{focusedItem.detail}</p>
            <div style={{ marginTop: '6px', display: 'flex', flexWrap: 'wrap', gap: '6px', fontFamily: 'monospace', fontSize: '10px', color: '#64748b' }}>
              {focusedItem.badge ? (
                <span style={{ padding: '1px 5px', background: '#f1f5f9', borderRadius: '4px', color: '#1e293b' }}>
                  {focusedItem.badge}
                </span>
              ) : null}
              {focusedItem.coords ? <span>{focusedItem.coords}</span> : null}
            </div>
          </div>
        ) : null}
      </div>

      {/* Accessible Text Stop Strip */}
      {validStops.length > 0 ? (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '6px',
            padding: '10px 14px',
            borderTop: '1px solid var(--line, #e4e4e7)',
            background: 'var(--surface, #ffffff)',
          }}
        >
          {validStops.map((s, idx) => (
            <button
              key={s.id}
              type="button"
              onClick={() => {
                setFocusedItem({
                  title: s.name,
                  detail: s.detail || s.locality || 'Điểm dừng tuyến',
                  badge: s.outsideCity ? 'Ngoài TP' : s.status || 'STOP',
                  coords: `${s.lat.toFixed(4)}, ${s.lng.toFixed(4)}`,
                });
                onSelectStop?.(s.id);
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '4px 8px',
                borderRadius: '6px',
                border: selectedId === s.id ? '1px solid #2563eb' : '1px solid var(--line, #e4e4e7)',
                background: selectedId === s.id ? '#eff6ff' : '#fafafa',
                fontSize: '11px',
                color: '#18181b',
                cursor: 'pointer',
              }}
            >
              <span
                style={{
                  width: '16px',
                  height: '16px',
                  borderRadius: '999px',
                  background: stopStatusFill(s.status),
                  color: '#ffffff',
                  fontSize: '10px',
                  fontWeight: 700,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {s.sequence ?? idx + 1}
              </span>
              <span style={{ fontWeight: 500 }}>{s.name}</span>
              {s.outsideCity ? (
                <span style={{ fontSize: '9px', color: '#b45309', fontWeight: 600 }}>[Ngoài TP]</span>
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
