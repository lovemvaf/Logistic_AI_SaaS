import React, { useEffect, useRef } from 'react';

export interface PolygonPoint {
  lat: number;
  lng: number;
}

export interface GeofencePolygon {
  id: string;
  name: string;
  points: PolygonPoint[];
  zoneType: 'ALLOWED' | 'RESTRICTED';
  isActive?: boolean;
}

export interface RoutePolygonProps {
  center: [number, number];
  zoom: number;
  geofences?: GeofencePolygon[];
  route?: PolygonPoint[];
  onGeofenceClick?: (geofenceId: string) => void;
}

const getZoneColor = (zoneType: string): string => {
  switch (zoneType) {
    case 'ALLOWED': return '#22c55e';
    case 'RESTRICTED': return '#ef4444';
    default: return '#3b82f6';
  }
};

const getZoneFillColor = (zoneType: string): string => {
  switch (zoneType) {
    case 'ALLOWED': return '#22c55e20';
    case 'RESTRICTED': return '#ef444420';
    default: return '#3b82f620';
  }
};

export const RoutePolygon: React.FC<RoutePolygonProps> = ({
  center,
  zoom,
  geofences = [],
  route = [],
  onGeofenceClick,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const layersRef = useRef<any[]>([]);

  useEffect(() => {
    if (!mapContainerRef.current) return;

    const loadMap = async () => {
      if (!(window as any).L) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        document.head.appendChild(link);

        const script = document.createElement('script');
        script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
        script.onload = () => initMap();
        document.head.appendChild(script);
      } else {
        initMap();
      }
    };

    const initMap = () => {
      const L = (window as any).L;
      mapRef.current = L.map(mapContainerRef.current).setView(center, zoom);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
      }).addTo(mapRef.current);
    };

    loadMap();

    return () => {
      mapRef.current?.remove();
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current) return;

    const L = (window as any).L;
    if (!L) return;

    layersRef.current.forEach((layer) => mapRef.current.removeLayer(layer));
    layersRef.current = [];

    geofences.forEach((geofence) => {
      if (!geofence.isActive && geofence.isActive !== undefined) return;

      const latLngs = geofence.points.map((p) => [p.lat, p.lng] as [number, number]);
      const color = getZoneColor(geofence.zoneType);
      const fillColor = getZoneFillColor(geofence.zoneType);

      const polygon = L.polygon(latLngs, {
        color,
        fillColor,
        fillOpacity: 0.3,
        weight: 2,
      }).addTo(mapRef.current);

      polygon.bindPopup(
        `<div>
          <strong>${geofence.name}</strong><br/>
          Zone: ${geofence.zoneType}
        </div>`
      );

      if (onGeofenceClick) {
        polygon.on('click', () => onGeofenceClick(geofence.id));
      }

      layersRef.current.push(polygon);
    });

    if (route.length > 1) {
      const routeLatLngs = route.map((p) => [p.lat, p.lng] as [number, number]);
      const routeLine = L.polyline(routeLatLngs, {
        color: '#3b82f6',
        weight: 4,
        opacity: 0.8,
        dashArray: '10, 5',
      }).addTo(mapRef.current);

      layersRef.current.push(routeLine);

      L.marker(routeLatLngs[0])
        .bindPopup('Start')
        .addTo(mapRef.current);
      L.marker(routeLatLngs[routeLatLngs.length - 1])
        .bindPopup('End')
        .addTo(mapRef.current);
    }
  }, [geofences, route, onGeofenceClick]);

  useEffect(() => {
    if (!mapRef.current) return;
    mapRef.current.setView(center, zoom);
  }, [center, zoom]);

  return (
    <div
      ref={mapContainerRef}
      style={{ width: '100%', height: '100%', position: 'relative' }}
    >
      {geofences.length > 0 && (
        <div
          style={{
            position: 'absolute',
            bottom: '10px',
            left: '10px',
            zIndex: 1000,
            background: 'white',
            padding: '8px 12px',
            borderRadius: '6px',
            boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
            fontSize: '12px',
          }}
        >
          <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>Geofences</div>
          {geofences.map((g) => (
            <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
              <span
                style={{
                  width: '10px',
                  height: '10px',
                  borderRadius: '2px',
                  background: getZoneColor(g.zoneType),
                }}
              />
              {g.name} ({g.zoneType})
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
