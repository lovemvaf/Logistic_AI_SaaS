'use client';

import React, { useEffect, useRef, useState } from 'react';
import type * as LeafletNS from 'leaflet';

interface LeafletMapProps {
  center: [number, number];
  zoom: number;
  markers?: { id: string; lat: number; lng: number; label?: string }[];
  polylines?: { points: [number, number][]; color?: string }[];
}

function isValidLatLng(lat: unknown, lng: unknown): boolean {
  const la = Number(lat);
  const ln = Number(lng);
  return Number.isFinite(la) && Number.isFinite(ln) && Math.abs(la) <= 90 && Math.abs(ln) <= 180;
}

function createPinIcon(L: typeof LeafletNS, color = '#2563eb') {
  return L.divIcon({
    className: 'smartlogi-div-pin',
    html: `<span style="display:block;width:14px;height:14px;border-radius:999px;background:${color};border:2px solid #ffffff;box-shadow:0 1px 4px rgba(0,0,0,0.35);"></span>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
}

export function LeafletMap({ center, zoom, markers = [], polylines = [] }: LeafletMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletNS.Map | null>(null);
  const leafletRef = useRef<typeof LeafletNS | null>(null);
  const markerLayerRef = useRef<LeafletNS.LayerGroup | null>(null);
  const routeLayerRef = useRef<LeafletNS.LayerGroup | null>(null);
  const markersDictRef = useRef<{ [id: string]: LeafletNS.Marker }>({});
  const [tileFallback, setTileFallback] = useState(false);
  const [leafletReady, setLeafletReady] = useState(false);

  const safeCenter: [number, number] = isValidLatLng(center?.[0], center?.[1])
    ? [Number(center[0]), Number(center[1])]
    : [10.9415, 106.8908];

  useEffect(() => {
    if (typeof window === 'undefined' || !mapContainerRef.current) return;
    let cancelled = false;

    void (async () => {
      const mod = await import('leaflet');
      const L = ((mod as any).default ?? mod) as typeof LeafletNS;
      if (cancelled || !mapContainerRef.current) return;

      if (!document.querySelector('link[data-smartlogi-leaflet-css="1"]')) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        link.setAttribute('data-smartlogi-leaflet-css', '1');
        document.head.appendChild(link);
      }

      leafletRef.current = L;
      mapRef.current = L.map(mapContainerRef.current).setView(safeCenter, zoom || 11);

      const tileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
      });
      tileLayer.on('tileerror', () => setTileFallback(true));
      tileLayer.addTo(mapRef.current);

      markerLayerRef.current = L.layerGroup().addTo(mapRef.current);
      routeLayerRef.current = L.layerGroup().addTo(mapRef.current);
      setLeafletReady(true);
    })();

    return () => {
      cancelled = true;
      markersDictRef.current = {};
      mapRef.current?.remove();
      mapRef.current = null;
      markerLayerRef.current = null;
      routeLayerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (mapRef.current && isValidLatLng(center?.[0], center?.[1])) {
      mapRef.current.setView([Number(center[0]), Number(center[1])], zoom || 11);
    }
  }, [center, zoom, leafletReady]);

  useEffect(() => {
    const L = leafletRef.current;
    if (!L || !markerLayerRef.current) return;
    const validMarkers = markers.filter((m) => m && isValidLatLng(m.lat, m.lng));
    const dict = markersDictRef.current;
    const currentIds = new Set(validMarkers.map((m) => m.id));

    Object.keys(dict).forEach((id) => {
      if (!currentIds.has(id)) {
        markerLayerRef.current?.removeLayer(dict[id]);
        delete dict[id];
      }
    });

    validMarkers.forEach((m) => {
      const lat = Number(m.lat);
      const lng = Number(m.lng);
      if (dict[m.id]) {
        dict[m.id].setLatLng([lat, lng]);
        if (m.label) dict[m.id].getPopup()?.setContent(m.label);
      } else {
        const marker = L.marker([lat, lng], { icon: createPinIcon(L) }).bindPopup(m.label || m.id);
        dict[m.id] = marker;
        markerLayerRef.current?.addLayer(marker);
      }
    });
  }, [markers, leafletReady]);

  useEffect(() => {
    const L = leafletRef.current;
    if (!L || !routeLayerRef.current) return;
    routeLayerRef.current.clearLayers();

    polylines.forEach((line) => {
      const validPoints = (line.points || []).filter(
        (pt) => Array.isArray(pt) && isValidLatLng(pt[0], pt[1]),
      );
      if (validPoints.length < 2) return;
      const polyline = L.polyline(validPoints, {
        color: line.color || '#3b82f6',
        weight: 4,
        opacity: 0.75,
      });
      routeLayerRef.current?.addLayer(polyline);
    });
  }, [polylines, leafletReady]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: '#f8fafc' }}>
      <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }} />
      {tileFallback ? (
        <div
          style={{
            position: 'absolute',
            top: '8px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 1000,
            background: 'rgba(255,255,255,0.95)',
            border: '1px solid #cbd5e1',
            borderRadius: '6px',
            padding: '4px 10px',
            fontSize: '11px',
            color: '#475569',
          }}
        >
          Nền bản đồ OSM đang chậm — lớp tọa độ và tuyến đường vẫn đang hoạt động.
        </div>
      ) : null}
    </div>
  );
}
