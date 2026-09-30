import React, { useEffect, useRef, useState } from 'react';

// Display-only Leaflet map — sirf 2 cheezein (user ne bola: mujhe involve na karo):
//   ➤ GREEN TRIANGLE (rotated) = professional — direction real travel direction (movement-bearing)
//   🔴 RED PIN = destination (kaam ki jagah — fixed)
// Route line = sab se chhota road rasta (OSRM), dono ko aapas mein attach karta hai
// props:
//   points: [{ lat, lng, type: 'pro' | 'dest', label }]
//   line: { color, coords? } | null   — road polyline
//   arrowDeg: number — ➤ marker ka rotation (asli travel direction, LiveMap calculate karti hai)
//   pill: { lat, lng, text } | null  — neutral white distance pill MAP PAR (arrived par null)
//   overlay: string | null           — map ke andar center-top message (arrival par "Your Destination is Here")
const MARKER_HTML = {
  pro: (lbl, deg = 0) => `
    <div class="live-marker">
      <div class="nav-arrow" style="transform:rotate(${deg}deg)">➤</div>
      <div class="marker-tag">${lbl || 'Professional'}</div>
    </div>`,
  dest: (lbl) => `
    <div class="live-marker">
      <div class="dest-pin" title="${lbl || 'Destination'}">
        <svg width="34" height="42" viewBox="0 0 24 30">
          <path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 18 12 18s12-9 12-18C24 5.4 18.6 0 12 0z" fill="#dc2626"/>
          <circle cx="12" cy="12" r="5" fill="#fff"/>
        </svg>
      </div>
      <div class="marker-tag dest-tag">${lbl || 'Kaam ki jagah'}</div>
    </div>`,
};

const PILL_HTML = (text) => `
  <div class="map-dist-pill"><span class="dot"></span>${text}</div>`;

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

export default function MapView({ points = [], height = 260, zoom = 13, line = null, rotateArrow = null, arrowDeg = 0, pill = null, overlay = null }) {
  const divRef = useRef(null);
  const mapRef = useRef(null);
  const layerRef = useRef(null);
  const pillRef = useRef(null); // distance pill — bina poore layer reset ke update hota hai
  const overlayRef = useRef(null); // HTML overlay (map ke andar message)
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
    return () => { map.remove(); mapRef.current = null; pillRef.current = null; };
  }, [ready]);

  useEffect(() => {
    if (!ready || !mapRef.current || !layerRef.current) return;
    const L = window.L;
    layerRef.current.clearLayers();
    const valid = points.filter((p) => Number(p.lat) && Number(p.lng));
    if (!valid.length) return;
    // eslint-disable-next-line no-unused-vars
    const bounds = [];

    // Road route polyline (OSRM coords) ya simple straight line
    if (line && line.coords && line.coords.length >= 2) {
      L.polyline(line.coords, { color: '#064e3b', weight: 9, opacity: 0.3 }).addTo(layerRef.current);
      L.polyline(line.coords, { color: line.color || '#16a34a', weight: 5, opacity: 0.95 }).addTo(layerRef.current);
      line.coords.forEach(([la, ln]) => bounds.push([la, ln]));
    } else if (line && valid.length >= 2) {
      L.polyline(valid.map((p) => [Number(p.lat), Number(p.lng)]), {
        color: line.color || '#16a34a', weight: 4, opacity: 0.7, dashArray: '8 8',
      }).addTo(layerRef.current);
    }

    valid.forEach((p) => {
      const type = p.type || 'dest';
      const html = (MARKER_HTML[type] || MARKER_HTML.dest)(p.label, arrowDeg);
      const anchor = type === 'dest' ? [17, 40] : [10, 10];
      const marker = L.marker([Number(p.lat), Number(p.lng)], {
        icon: L.divIcon({ className: 'live-pin-icon', html, iconSize: [40, 48], iconAnchor: anchor }),
        zIndexOffset: type === 'dest' ? 500 : 600,
      }).addTo(layerRef.current);
      if (p.label) marker.bindPopup(`<b>${p.label}</b>`);
      bounds.push([Number(p.lat), Number(p.lng)]);
    });

    // Distance pill — ➤ ke UPAR float karta hai (neutral white, real apps jaisa)
    if (pillRef.current) { pillRef.current.remove(); pillRef.current = null; }
    if (pill && Number(pill.lat) && Number(pill.lng)) {
      pillRef.current = L.marker([Number(pill.lat), Number(pill.lng)], {
        icon: L.divIcon({ className: 'live-pill-icon', html: PILL_HTML(pill.text), iconSize: [0, 0], iconAnchor: [0, 34] }),
        interactive: false,
        zIndexOffset: 900,
      }).addTo(layerRef.current);
    }

    mapRef.current.fitBounds(bounds, { padding: [45, 45], maxZoom: zoom + 3 });
  }, [points, ready, line, arrowDeg, pill]);

  // Arrival overlay — map ke andar center-top message (HTML overlay, Leaflet pane ke upar)
  useEffect(() => {
    const wrap = divRef.current?.parentElement; // .map-wrap
    if (!wrap) return;
    if (overlayRef.current) { overlayRef.current.remove(); overlayRef.current = null; }
    if (overlay) {
      const el = document.createElement('div');
      el.className = 'map-arrived-overlay';
      el.textContent = overlay;
      wrap.appendChild(el);
      overlayRef.current = el;
    }
    return () => { if (overlayRef.current) { overlayRef.current.remove(); overlayRef.current = null; } };
  }, [overlay, ready]);

  return (
    <div>
      <div className="map-wrap" style={{ height }}>
        {!ready && <div style={{ padding: 20, color: 'var(--muted)' }}>Loading map…</div>}
        <div ref={divRef} style={{ height: '100%', width: '100%' }} />
      </div>
    </div>
  );
}
