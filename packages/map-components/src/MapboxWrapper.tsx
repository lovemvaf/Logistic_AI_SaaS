import React, { useEffect, useRef, useState } from 'react';

export interface MapboxMarker {
  id: string;
  lat: number;
  lng: number;
  label?: string;
  color?: string;
}

export interface MapboxPolyline {
  points: [number, number][];
  color?: string;
  width?: number;
}

export interface MapboxWrapperProps {
  center: [number, number];
  zoom: number;
  token?: string;
  markers?: MapboxMarker[];
  polylines?: MapboxPolyline[];
  style?: string;
  onMarkerClick?: (markerId: string) => void;
}

export const MapboxWrapper: React.FC<MapboxWrapperProps> = ({
  center,
  zoom,
  token,
  markers = [],
  polylines = [],
  style = 'mapbox://styles/mapbox/streets-v12',
  onMarkerClick,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const [mapboxLoaded, setMapboxLoaded] = useState(false);

  useEffect(() => {
    if (!mapContainerRef.current || !token) return;

    const loadMapbox = async () => {
      if (!(window as any).mapboxgl) {
        const script = document.createElement('script');
        script.src = 'https://api.mapbox.com/mapbox-gl-js/v3.3.0/mapbox-gl.js';
        script.onload = () => {
          const link = document.createElement('link');
          link.href = 'https://api.mapbox.com/mapbox-gl-js/v3.3.0/mapbox-gl.css';
          link.rel = 'stylesheet';
          document.head.appendChild(link);
          initMap();
        };
        document.head.appendChild(script);
      } else {
        initMap();
      }
    };

    const initMap = () => {
      const mapboxgl = (window as any).mapboxgl;
      mapboxgl.accessToken = token;

      mapRef.current = new mapboxgl.Map({
        container: mapContainerRef.current,
        style,
        center,
        zoom,
      });

      mapRef.current.on('load', () => {
        setMapboxLoaded(true);
      });
    };

    loadMapbox();

    return () => {
      mapRef.current?.remove();
    };
  }, [token]);

  useEffect(() => {
    if (!mapRef.current || !mapboxLoaded) return;

    mapRef.current.flyTo({ center, zoom, essential: true });
  }, [center, zoom, mapboxLoaded]);

  useEffect(() => {
    if (!mapRef.current || !mapboxLoaded) return;

    const existingMarkers: any[] = [];

    markers.forEach((marker) => {
      const el = document.createElement('div');
      el.style.cssText = `
        width: 24px;
        height: 24px;
        border-radius: 50%;
        background: ${marker.color || '#3b82f6'};
        border: 2px solid white;
        box-shadow: 0 2px 4px rgba(0,0,0,0.3);
        cursor: pointer;
      `;

      const mapboxgl = (window as any).mapboxgl;
      const mapboxMarker = new mapboxgl.Marker(el)
        .setLngLat([marker.lng, marker.lat])
        .setPopup(new mapboxgl.Popup().setText(marker.label || marker.id))
        .addTo(mapRef.current);

      if (onMarkerClick) {
        el.addEventListener('click', () => onMarkerClick(marker.id));
      }

      existingMarkers.push(mapboxMarker);
    });

    return () => {
      existingMarkers.forEach((m) => m.remove());
    };
  }, [markers, mapboxLoaded, onMarkerClick]);

  useEffect(() => {
    if (!mapRef.current || !mapboxLoaded) return;

    const sourceId = 'routes-source';
    const layerId = 'routes-layer';

    if (mapRef.current.getSource(sourceId)) {
      mapRef.current.removeLayer(layerId);
      mapRef.current.removeSource(sourceId);
    }

    if (polylines.length === 0) return;

    const features = polylines.map((line) => ({
      type: 'Feature' as const,
      geometry: {
        type: 'LineString' as const,
        coordinates: line.points,
      },
      properties: {
        color: line.color || '#3b82f6',
      },
    }));

    mapRef.current.addSource(sourceId, {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features,
      },
    });

    mapRef.current.addLayer({
      id: layerId,
      type: 'line',
      source: sourceId,
      layout: {
        'line-join': 'round',
        'line-cap': 'round',
      },
      paint: {
        'line-color': ['get', 'color'],
        'line-width': 4,
        'line-opacity': 0.7,
      },
    });
  }, [polylines, mapboxLoaded]);

  return (
    <div
      ref={mapContainerRef}
      style={{ width: '100%', height: '100%' }}
    />
  );
};
