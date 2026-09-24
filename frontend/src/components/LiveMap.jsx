import React, { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import MapView from './MapView';
import { haversineKm, travelMinutes, bearing } from './geo';

// SIRF DO MARKERS (user ka ask):
//   ➤ green triangle = professional jis taraf se aa raha hai (rotated — raste ki direction)
//   🔴 red pin = kaam ki jagah (destination)
// In dono ko AAPAS mein attach karta hai: sab se CHHOTA road rasta (OSRM alternatives
// mein se sab se kam distance wala) + kitni doori reh gayi wo box mein.
// Customer ki apni location map par NAHI — wo involve nahi.
export default function LiveMap({ booking, role, token, onUpdate, refreshMs = 4000 }) {
  const [sharing, setSharing] = useState(false);
  const [auto, setAuto] = useState(true);
  const [locMsg, setLocMsg] = useState('');
  const [err, setErr] = useState('');
  const [route, setRoute] = useState(null); // { coords, distKm, durMin } — shortest
  const routeCache = useRef({ key: '', data: null });
  const [liveCount, setLiveCount] = useState(0);

  const myKey = role === 'professional' ? 'pro' : 'customer';
  const otherKey = role === 'professional' ? 'customer' : 'pro';
  const myLat = Number(booking[`${myKey}_lat`]);
  const myLng = Number(booking[`${myKey}_lng`]);
  const otherLat = Number(booking[`${otherKey}_lat`]);
  const otherLng = Number(booking[`${otherKey}_lng`]);
  const destLat = Number(booking.dest_lat);
  const destLng = Number(booking.dest_lng);

  // Traveler = jo destination ki taraf aa raha hai. Customer ko sirf professional dikhta hai;
  // professional ko khud ka route dikhta hai.
  const isProView = role === 'professional';
  const moverLat = isProView ? myLat : otherLat;
  const moverLng = isProView ? myLng : otherLng;
  const moverName = isProView ? 'Aap' : (booking.professional_name || 'Professional');
  const haveMover = moverLat && moverLng;
  const haveDest = destLat && destLng;

  // Mover apni GPS location share karta hai (professional apni, customer apni —
  // customer ki location sirf DB mein jaati hai, map par nahi dikhti)
  const share = async () => {
    setErr(''); setLocMsg('');
    if (!navigator.geolocation) { setErr('Geolocation is not supported in this browser'); return; }
    setSharing(true);
    navigator.geolocation.getCurrentPosition(async (pos) => {
      try {
        await api.post(`/${isProView ? 'professional' : 'customer'}/bookings/${booking.id}/location`,
          { lat: Number(pos.coords.latitude.toFixed(7)), lng: Number(pos.coords.longitude.toFixed(7)) }, token);
        setLocMsg('✓ Location share ho gayi — route update ho gaya');
        onUpdateRef.current?.();
      } catch (e) { setErr(e.message); }
      setSharing(false);
    }, (e) => { setErr('Location permission denied: ' + e.message); setSharing(false); }, { enableHighAccuracy: true, timeout: 10000 });
  };

  // Live GPS watch — mover apni chalti hui location bhejta rehta hai
  useEffect(() => {
    if (!auto || !navigator.geolocation) return;
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        api.post(`/${isProView ? 'professional' : 'customer'}/bookings/${booking.id}/location`,
          { lat: Number(pos.coords.latitude.toFixed(7)), lng: Number(pos.coords.longitude.toFixed(7)) }, token)
          .then(() => onUpdateRef.current?.())
          .catch(() => {});
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 4000, timeout: 15000 }
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [auto]);

  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;
  useEffect(() => {
    if (!auto) return;
    const t = setInterval(() => onUpdateRef.current?.(), refreshMs);
    return () => clearInterval(t);
  }, [auto, refreshMs]);

  // SAB SE CHHOTA road route (OSRM alternatives=true → sab se kam distance wala chuno)
  useEffect(() => {
    if (!haveDest || !haveMover) { setRoute(null); return; }
    const key = `${moverLat.toFixed(5)},${moverLng.toFixed(5)}|${destLat.toFixed(5)},${destLng.toFixed(5)}`;
    if (routeCache.current.key === key) return;
    let dead = false;
    (async () => {
      try {
        const url = `https://router.project-osrm.org/route/v1/driving/${moverLng},${moverLat};${destLng},${destLat}?overview=full&geometries=geojson&alternatives=true`;
        const res = await fetch(url);
        const data = await res.json();
        if (dead) return;
        if (data.code === 'Ok' && data.routes?.length) {
          const best = data.routes.reduce((a, b) => (b.distance < a.distance ? b : a)); // SHORTEST
          routeCache.current = {
            key,
            data: { coords: best.geometry.coordinates.map(([lng, lat]) => [lat, lng]), distKm: best.distance / 1000, durMin: Math.max(1, Math.round(best.duration / 60)) },
          };
        } else {
          routeCache.current = { key, data: null };
        }
        setRoute(routeCache.current.data);
      } catch {
        if (!dead) { routeCache.current = { key, data: null }; setRoute(null); }
      }
    })();
    return () => { dead = true; };
  }, [haveDest, haveMover, moverLat, moverLng, destLat, destLng]);

  // Live counter — mover ki position change
  const prevMover = useRef(null);
  useEffect(() => {
    if (!moverLat || !moverLng) return;
    const key = `${moverLat},${moverLng}`;
    if (prevMover.current && prevMover.current !== key) setLiveCount((c) => c + 1);
    prevMover.current = key;
  }, [moverLat, moverLng]);

  const straightKm = haveMover && haveDest ? haversineKm(moverLat, moverLng, destLat, destLng) : null;
  const distKm = route ? route.distKm : straightKm;
  const etaMin = route ? route.durMin : (straightKm != null ? travelMinutes(straightKm) : null);
  // Arrival seedhi doori se decide hoti hai (road one-way ho to road-distance bharak sakti hai)
  const arrivedGps = straightKm != null && straightKm <= 0.15; // 150m ke andar = pohanch gaya

  // ➤ ki direction: route ke agle point ki taraf (ya seedhi dest ki taraf)
  const arrowDeg = (() => {
    try {
      if (route?.coords?.length >= 2) {
        const [aLat, aLng] = route.coords[0];
        const [bLat, bLng] = route.coords[Math.min(5, route.coords.length - 1)];
        return bearing(aLat, aLng, bLat, bLng);
      }
      if (haveMover && haveDest) return bearing(moverLat, moverLng, destLat, destLng);
    } catch {}
    return 0;
  })();

  // SIRF 2 points: ➤ triangle (mover) + 🔴 red pin (dest)
  const points = [];
  if (haveDest) points.push({ lat: destLat, lng: destLng, type: 'dest', label: `🔴 Kaam ki jagah — ${booking.dest_address || 'Service address'}` });
  if (haveMover) points.push({ lat: moverLat, lng: moverLng, type: 'pro', label: `➤ ${moverName} aa rahe hain` });

  const lastAt = booking[`${otherKey}_loc_at`];

  return (
    <div className="card">
      {/* ARRIVAL BANNERS — GPS 150m ke andar aa gaya */}
      {arrivedGps && (
        <div className="alert success arrival-banner">
          {isProView
            ? '🎯 Your Destination is Here! Aap kaam ki jagah pohanch gaye hain — customer se OTP lein aur kaam shuru karein.'
            : `🎉 Khushkhabri! ${moverName} aap ke address pohanch gaye hain — wo aap se OTP mangen ge.`}
        </div>
      )}

      <div className="row spread">
        <h2>📍 {moverName} kitne door hain?</h2>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 400, fontSize: 13 }}>
          <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} style={{ width: 'auto', margin: 0 }} />
          Live ({refreshMs / 1000}s)
        </label>
      </div>

      {err && <div className="alert error">{err}</div>}
      {locMsg && <div className="alert success">{locMsg}</div>}

      {(haveMover || haveDest) ? (
        <div className="grid cols-2" style={{ margin: '10px 0' }}>
          <div className={`card stat ${arrivedGps ? 'arrived' : ''}`} style={{ borderLeft: `4px solid ${arrivedGps ? 'var(--green)' : 'var(--info)'}` }}>
            <span className="value" style={{ color: arrivedGps ? 'var(--green-dark)' : 'var(--info)' }}>
              {arrivedGps ? '✅ Pohanch gaye!' : distKm != null ? `${distKm.toFixed(2)} km reh gaye` : '…'}
            </span>
            <span className="label">➤ {moverName} → 🔴 kaam ki jagah (road doori)</span>
            <span className="hint">{arrivedGps ? 'destination par — 150m ke andar' : route ? 'sab se chhota rasta (OSRM) — doori live kam hoti hai' : 'andaza — rasta load ho raha'}</span>
          </div>
          <div className="card stat" style={{ borderLeft: '4px solid var(--gold)' }}>
            <span className="value">{arrivedGps ? '🎉 Ab OTP' : `⏱ ~${etaMin ?? '…'} min`}</span>
            <span className="label">{arrivedGps ? 'aap se OTP mangen ge' : 'pohanchne ka waqt'}</span>
            <span className="hint">last update: {lastAt ? new Date(lastAt).toLocaleTimeString() : '—'}{liveCount > 0 && <b> · live ×{liveCount}</b>}</span>
          </div>
        </div>
      ) : (
        <div className="alert info">📍 {isProView ? 'Apni location share karein — phir aap ka rasta red pin tak dikhenga.' : 'Professional location share karega — phir yahan uska rasta red pin tak live dikhega.'}</div>
      )}

      {isProView && (
        <div className="row">
          {booking.status === 'accepted' && (
            <button
              className="btn"
              onClick={async () => {
                setError(''); setLocMsg('');
                try {
                  await api.post(`/professional/bookings/${booking.id}/status`, { status: 'on_the_way' }, token);
                  setLocMsg('🚗 Customer ko bata diya — main aa raha hoon! Ab aap ka ➤ live move karega.');
                  onUpdateRef.current?.();
                } catch (e) { setErr(e.message); }
              }}
            >
              🚗 Main Aa Raha Hoon
            </button>
          )}
          <button className="btn small secondary" disabled={sharing} onClick={share}>{sharing ? '⏳ Sharing…' : '🧭 Share location'}</button>
          {auto && <span className="muted" style={{ fontSize: 12.5 }}>Aap ka ➤ GPS se khud aage badhta rehta hai</span>}
        </div>
      )}

      <div className="mt">
        {points.length === 2 ? (
          <MapView
            points={points}
            height={360}
            line={{ color: '#16a34a', coords: route?.coords }}
            arrowDeg={arrowDeg}
          />
        ) : (
          <p className="muted">Map: ➤ (professional) aur 🔴 (kaam ki jagah) dono milne par poora rasta dikhega.</p>
        )}
        <p className="muted" style={{ fontSize: 12 }}>
          ➤ {moverName} (jis taraf se aa rahe hain — arrow raste ki direction mein ghoomta hai) · 🔴 <b>Red pin = jahan kaam karna hai</b> · Green line = sab se chhota road rasta.
        </p>
      </div>
    </div>
  );
}
