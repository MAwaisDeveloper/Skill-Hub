import React, { useEffect, useState } from 'react';
import { api } from '../api';
import MapView from './MapView';
import { haversineKm, travelMinutes, compassArrow, bearing } from './geo';

// InDrive-style live tracking (100% free OpenStreetMap):
// - dono parties browser GPS se location share karte hain
// - 5s auto-refresh se dusre party ka pin + distance + direction arrow
// - route line (green) dono pins ke darmiyan + ETA estimate
export default function LiveMap({ booking, role, token, onUpdate, refreshMs = 5000 }) {
  const [sharing, setSharing] = useState(false);
  const [auto, setAuto] = useState(true);
  const [locMsg, setLocMsg] = useState('');
  const [err, setErr] = useState('');

  const myKey = role === 'professional' ? 'pro' : 'customer';
  const otherKey = role === 'professional' ? 'customer' : 'pro';
  const myLat = Number(booking[`${myKey}_lat`]);
  const myLng = Number(booking[`${myKey}_lng`]);
  const otherLat = Number(booking[`${otherKey}_lat`]);
  const otherLng = Number(booking[`${otherKey}_lng`]);

  const share = async () => {
    setErr(''); setLocMsg('');
    if (!navigator.geolocation) { setErr('Geolocation is not supported in this browser'); return; }
    setSharing(true);
    navigator.geolocation.getCurrentPosition(async (pos) => {
      try {
        await api.post(`/${role === 'professional' ? 'professional' : 'customer'}/bookings/${booking.id}/location`,
          { lat: Number(pos.coords.latitude.toFixed(7)), lng: Number(pos.coords.longitude.toFixed(7)) }, token);
        setLocMsg(`✓ Location share ho gayi (${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)})`);
        onUpdate?.();
      } catch (e) { setErr(e.message); }
      setSharing(false);
    }, (e) => { setErr('Location permission denied: ' + e.message); setSharing(false); }, { enableHighAccuracy: true, timeout: 10000 });
  };

  // 5s auto-refresh (inDrive-style) jab tak auto on hai
  useEffect(() => {
    if (!auto) return;
    const t = setInterval(() => onUpdate?.(), refreshMs);
    return () => clearInterval(t);
  }, [auto, onUpdate, refreshMs]);

  const both = myLat && myLng && otherLat && otherLng;
  const distKm = both ? haversineKm(myLat, myLng, otherLat, otherLng) : null;
  const etaMin = distKm != null ? travelMinutes(distKm) : null;
  const arrow = both ? compassArrow(bearing(myLat, myLng, otherLat, otherLng)) : null;

  const points = [];
  if (otherLat && otherLng) points.push({ lat: otherLat, lng: otherLng, label: role === 'professional' ? 'Customer ki location' : 'Professional ki location', color: role === 'professional' ? 'home' : 'tool' });
  if (myLat && myLng) points.push({ lat: myLat, lng: myLng, label: 'Your shared location', color: 'green' });

  const otherName = role === 'professional' ? 'Customer' : 'Professional';
  const lastAt = booking[`${otherKey}_loc_at`];
  const myLastAt = booking[`${myKey}_loc_at`];

  return (
    <div className="card">
      <div className="row spread">
        <h2>📍 Live Tracking</h2>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 400, fontSize: 13 }}>
          <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} style={{ width: 'auto', margin: 0 }} />
          Auto-refresh ({refreshMs / 1000}s)
        </label>
      </div>
      <p className="muted">After the deal is finalized, both parties see each other's live location — free OpenStreetMap, no paid API.</p>
      {err && <div className="alert error">{err}</div>}
      {locMsg && <div className="alert success">{locMsg}</div>}

      {both && (
        <div className="grid cols-3" style={{ margin: '10px 0' }}>
          <div className="card stat"><span className="value" style={{ color: 'var(--green)' }}>{arrow} {distKm.toFixed(2)} km</span><span className="label">Distance (aap → {otherName})</span></div>
          <div className="card stat"><span className="value">⏱ ~{etaMin} min</span><span className="label">Estimated travel time</span></div>
          <div className="card stat"><span className="value" style={{ fontSize: 15, paddingTop: 6 }}>{otherName} ki location: {lastAt ? new Date(lastAt).toLocaleTimeString() : '—'}</span><span className="label">Aap ki update: {myLastAt ? new Date(myLastAt).toLocaleTimeString() : '—'}</span></div>
        </div>
      )}

      <div className="row">
        <button className="btn small" disabled={sharing} onClick={share}>{sharing ? '⏳ Sharing…' : '🧭 Share my current location'}</button>
        {!lastAt && both && <span className="muted" style={{ fontSize: 13 }}>{otherName} ki purani location dikh rahi hai</span>}
      </div>

      <div className="mt">
        {points.length ? (
          <MapView points={points} height={300} line={both ? { color: '#16a34a' } : null} arrow={both ? { from: [myLat, myLng], to: [otherLat, otherLng] } : null} />
        ) : (
          <p className="muted">Map: no location shared yet — both parties press the share button to bring live pins onto the map.</p>
        )}
        <p className="muted" style={{ fontSize: 12 }}>🏠 {otherName} · 🟢 You — if GPS is unavailable, you can also type the location in chat.</p>
      </div>
    </div>
  );
}
