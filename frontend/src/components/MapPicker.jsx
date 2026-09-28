import React, { useEffect, useRef, useState } from 'react';

// Free map (Leaflet + OpenStreetMap tiles — no API key, plan Section 13).
// Click on map to drop a pin; lat/lng bubble up to the parent form.
export default function MapPicker({ lat, lng, onChange, height = 280 }) {
  const divRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const leafletRef = useRef(null);
  const [ready, setReady] = useState(false);

  // load leaflet assets once
  useEffect(() => {
    if (window.L) { setReady(true); return; }
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(css);
    const js = document.createElement('script');
    js.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    js.onload = () => setReady(true);
    document.head.appendChild(js);
  }, []);

  // init map
  useEffect(() => {
    if (!ready || !divRef.current || mapRef.current) return;
    const L = window.L;
    leafletRef.current = L;
    const center = [lat || 31.5155, lng || 74.3436]; // Lahore default
    const map = L.map(divRef.current, { zoomControl: true }).setView(center, 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);
    mapRef.current = map;

    map.on('click', (e) => {
      const { lat: la, lng: ln } = e.latlng;
      if (!markerRef.current) {
        markerRef.current = L.marker([la, ln], { draggable: true }).addTo(map);
        markerRef.current.on('dragend', () => {
          const p = markerRef.current.getLatLng();
          onChange?.(Number(p.lat.toFixed(7)), Number(p.lng.toFixed(7)));
        });
      } else {
        markerRef.current.setLatLng([la, ln]);
      }
      onChange?.(Number(la.toFixed(7)), Number(ln.toFixed(7)));
    });

    setTimeout(() => map.invalidateSize(), 200);
    return () => { map.remove(); mapRef.current = null; markerRef.current = null; };
  }, [ready]);

  // sync external lat/lng -> marker + map ko pin par pan/zoom (geocode confirm par pin dikhe)
  const lastExternal = useRef(null);
  useEffect(() => {
    if (!ready || !mapRef.current || lat == null || lng == null) return;
    const L = leafletRef.current;
    if (!markerRef.current) {
      markerRef.current = L.marker([lat, lng], { draggable: true }).addTo(mapRef.current);
      markerRef.current.on('dragend', () => {
        const p = markerRef.current.getLatLng();
        onChange?.(Number(p.lat.toFixed(7)), Number(p.lng.toFixed(7)));
      });
    } else {
      markerRef.current.setLatLng([lat, lng]);
    }
    // external change (geocode/confirm) par map ko pin par le jao — sirf tab jab change humari drag se na aya ho
    const key = `${lat},${lng}`;
    if (lastExternal.current !== key) {
      lastExternal.current = key;
      mapRef.current.setView([lat, lng], 16, { animate: true });
      setTimeout(() => mapRef.current && mapRef.current.invalidateSize(), 250);
    }
  }, [lat, lng, ready]);

  return (
    <div>
      <div className="map-wrap" style={{ height }}>
        {!ready && <div style={{ padding: 20, color: 'var(--muted)' }}>Loading map…</div>}
        <div ref={divRef} style={{ height: '100%', width: '100%' }} />
      </div>
      <p className="muted">
Click on the map to drop the exact location pin (you can drag it too). Free OpenStreetMap: no API cost.
        {lat != null && <b> Selected: {lat}, {lng}</b>}
      </p>
    </div>
  );
}
