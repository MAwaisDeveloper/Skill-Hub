import React, { useEffect, useRef, useState } from 'react';

// Display-only Leaflet map with markers, optional route line + direction arrow (free OSM tiles).
// props: points: [{ lat, lng, label, color }], height, zoom, line: { color } | null, arrow: { from:[lat,lng], to:[lat,lng] } | null
export function useLeaflet(setReady) {
  useEffect(() => {
    if (window.L) { setReady(true); return; }
    if (!document.getElementById('leaflet-css')) {
      const css = document.createElement('link');
      css.id = 'leaflet-css';
      css.rel = 'stylesheet';
      css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(css);
    }
    if (!window.leafletLoading) {
      window.leafletLoading = new Promise((resolve) => {
        const js = document.createElement('script');
        js.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
        js.onload = () => resolve(true);
        document.head.appendChild(js);
      });
    }
    window.leafletLoading.then(() => setReady(true));
  }, []);
}

const ICONS = {
  green: '🟢', red: '🔴', blue: '🔵', home: '🏠', tool: '🛠',
};

export default function MapView({ points = [], height = 260, zoom = 13, line = null, arrow = null }) {
  const divRef = useRef(null);
  const mapRef = useRef(null);
  const layerRef = useRef(null);
  const [ready, setReady] = useState(false);
  useLeaflet(setReady);

  useEffect(() => {
    if (!ready || !divRef.current || mapRef.current) return;
    const L = window.L;
    const map = L.map(divRef.current, { zoomControl: true });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors', maxZoom: 19,
    }).addTo(map);
    mapRef.current = map;
    layerRef.current = L.layerGroup().addTo(map);
    setTimeout(() => map.invalidateSize(), 200);
    return () => { map.remove(); mapRef.current = null; };
  }, [ready]);

  useEffect(() => {
    if (!ready || !mapRef.current || !layerRef.current) return;
    const L = window.L;
    layerRef.current.clearLayers();
    const valid = points.filter((p) => Number(p.lat) && Number(p.lng));
    if (!valid.length) return;
    const bounds = [];
    // Route line dono points ke darmiyan (inDrive-style)
    if (line && valid.length >= 2) {
      L.polyline(valid.map((p) => [Number(p.lat), Number(p.lng)]), {
        color: line.color || '#16a34a', weight: 4, opacity: 0.7, dashArray: '8 8',
      }).addTo(layerRef.current);
    }
    // Direction arrow midpoint par (jis taraf ja raha hai)
    if (arrow && arrow.from && arrow.to) {
      const [fLat, fLng] = arrow.from; const [tLat, tLng] = arrow.to;
      if (Number(fLat) && Number(tLat)) {
        const toRad = (d) => (d * Math.PI) / 180;
        const y = Math.sin(toRad(tLng - fLng)) * Math.cos(toRad(tLat));
        const x = Math.cos(toRad(fLat)) * Math.sin(toRad(tLat)) - Math.sin(toRad(fLat)) * Math.cos(toRad(tLat)) * Math.cos(toRad(tLng - fLng));
        const deg = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
        const mLat = (Number(fLat) + Number(tLat)) / 2; const mLng = (Number(fLng) + Number(tLng)) / 2;
        const arrowIcon = L.divIcon({
          className: 'pin-icon',
          html: `<div style="font-size:20px;transform:rotate(${deg}deg);line-height:20px;color:#16a34a;text-shadow:0 1px 2px rgba(0,0,0,.35)">➤</div>`,
          iconSize: [20, 20], iconAnchor: [10, 10],
        });
        L.marker([mLat, mLng], { icon: arrowIcon, interactive: false }).addTo(layerRef.current);
      }
    }
    valid.forEach((p) => {
      const icon = L.divIcon({
        className: 'pin-icon',
        html: `<div style="font-size:22px;line-height:22px;filter:drop-shadow(0 1px 2px rgba(0,0,0,.4))">${ICONS[p.color] || '📍'}</div>`,
        iconSize: [22, 22], iconAnchor: [11, 20],
      });
      L.marker([Number(p.lat), Number(p.lng)], { icon }).addTo(layerRef.current)
        .bindPopup(`<b>${p.label || 'Location'}</b>`);
      bounds.push([Number(p.lat), Number(p.lng)]);
    });
    mapRef.current.fitBounds(bounds, { padding: [40, 40], maxZoom: zoom + 3 });
  }, [points, ready, line, arrow]);

  return (
    <div>
      <div className="map-wrap" style={{ height }}>
        {!ready && <div style={{ padding: 20, color: 'var(--muted)' }}>Loading map…</div>}
        <div ref={divRef} style={{ height: '100%', width: '100%' }} />
      </div>
    </div>
  );
}
