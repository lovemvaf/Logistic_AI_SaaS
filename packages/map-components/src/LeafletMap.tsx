import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

interface LeafletMapProps {
  center: [number, number];
  zoom: number;
  markers?: { id: string; lat: number; lng: number; label?: string }[];
  polylines?: { points: [number, number][]; color?: string }[];
}

export const LeafletMap: React.FC<LeafletMapProps> = ({ center, zoom, markers = [], polylines = [] }) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerLayerRef = useRef<L.LayerGroup | null>(null);
  const routeLayerRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!mapContainerRef.current) return;

    // Initialize map
    mapRef.current = L.map(mapContainerRef.current).setView(center, zoom);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(mapRef.current);

    markerLayerRef.current = L.layerGroup().addTo(mapRef.current);
    routeLayerRef.current = L.layerGroup().addTo(mapRef.current);

    return () => {
      mapRef.current?.remove();
    };
  }, []);

  // Update center/zoom if props change
  useEffect(() => {
    if (mapRef.current) {
      mapRef.current.setView(center, zoom);
    }
  }, [center, zoom]);

  const markersDictRef = useRef<{ [id: string]: L.Marker }>({});

  // Update markers (Smooth Moving Logic)
  useEffect(() => {
    if (!markerLayerRef.current) return;
    const dict = markersDictRef.current;
    const currentIds = new Set(markers.map(m => m.id));

    // Remove stale markers
    Object.keys(dict).forEach(id => {
      if (!currentIds.has(id)) {
        markerLayerRef.current?.removeLayer(dict[id]);
        delete dict[id];
      }
    });

    // Add or Update markers
    markers.forEach(m => {
      if (dict[m.id]) {
        dict[m.id].setLatLng([m.lat, m.lng]);
        if (m.label) dict[m.id].getPopup()?.setContent(m.label);
      } else {
        const marker = L.marker([m.lat, m.lng]).bindPopup(m.label || m.id);
        dict[m.id] = marker;
        markerLayerRef.current?.addLayer(marker);
      }
    });
  }, [markers]);

  // Update polylines (Routes)
  useEffect(() => {
    if (!routeLayerRef.current) return;
    routeLayerRef.current.clearLayers();

    polylines.forEach((line, index) => {
      const polyline = L.polyline(line.points as any, { 
        color: line.color || '#3b82f6',
        weight: 4,
        opacity: 0.7
      });
      routeLayerRef.current?.addLayer(polyline);
    });
  }, [polylines]);

  return <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }} />;
};
