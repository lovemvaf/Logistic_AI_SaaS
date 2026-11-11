import React, { useEffect, useRef } from 'react';

export interface VehiclePosition {
  id: string;
  lat: number;
  lng: number;
  heading?: number;
  speed?: number;
  label?: string;
  status?: 'active' | 'idle' | 'offline';
}

export interface LiveRadarProps {
  center: [number, number];
  zoom: number;
  vehicles: VehiclePosition[];
  onVehicleClick?: (vehicleId: string) => void;
  refreshInterval?: number;
}

const getStatusColor = (status?: string): string => {
  switch (status) {
    case 'active': return '#22c55e';
    case 'idle': return '#eab308';
    case 'offline': return '#6b7280';
    default: return '#3b82f6';
  }
};

const createPulsingDot = (color: string): string => {
  return `
    <svg width="24" height="24" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="8" fill="${color}" opacity="0.3">
        <animate attributeName="r" values="8;16;8" dur="2s" repeatCount="indefinite"/>
        <animate attributeName="opacity" values="0.3;0.1;0.3" dur="2s" repeatCount="indefinite"/>
      </circle>
      <circle cx="12" cy="12" r="6" fill="${color}"/>
    </svg>
  `;
};

export const LiveRadar: React.FC<LiveRadarProps> = ({
  center,
  zoom,
  vehicles,
  onVehicleClick,
  refreshInterval = 5000,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<Map<string, any>>(new Map());

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

    const currentIds = new Set(vehicles.map((v) => v.id));

    markersRef.current.forEach((marker, id) => {
      if (!currentIds.has(id)) {
        mapRef.current.removeLayer(marker);
        markersRef.current.delete(id);
      }
    });

    vehicles.forEach((vehicle) => {
      const color = getStatusColor(vehicle.status);
      const icon = L.divIcon({
        html: createPulsingDot(color),
        className: 'vehicle-radar-dot',
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      });

      if (markersRef.current.has(vehicle.id)) {
        const marker = markersRef.current.get(vehicle.id);
        marker.setLatLng([vehicle.lat, vehicle.lng]);
        marker.setIcon(icon);
      } else {
        const marker = L.marker([vehicle.lat, vehicle.lng], { icon })
          .bindPopup(
            `<div>
              <strong>${vehicle.label || vehicle.id}</strong><br/>
              Status: ${vehicle.status || 'unknown'}<br/>
              ${vehicle.speed ? `Speed: ${vehicle.speed} km/h` : ''}
            </div>`
          )
          .addTo(mapRef.current);

        if (onVehicleClick) {
          marker.on('click', () => onVehicleClick(vehicle.id));
        }

        markersRef.current.set(vehicle.id, marker);
      }
    });
  }, [vehicles, onVehicleClick]);

  useEffect(() => {
    if (!mapRef.current) return;
    mapRef.current.setView(center, zoom);
  }, [center, zoom]);

  return (
    <div
      ref={mapContainerRef}
      style={{ width: '100%', height: '100%', position: 'relative' }}
    >
      <div
        style={{
          position: 'absolute',
          top: '10px',
          right: '10px',
          zIndex: 1000,
          background: 'white',
          padding: '8px 12px',
          borderRadius: '6px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
          fontSize: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#22c55e' }} />
          Active
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#eab308' }} />
          Idle
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#6b7280' }} />
          Offline
        </div>
      </div>
    </div>
  );
};
