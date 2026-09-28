import React, { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import MapView from './MapView';
import { haversineKm, travelMinutes, bearing } from './geo';

// SIRF DO MARKERS (real apps style):
//   ➤ green triangle = professional — ASLI travel direction mein ghoomta hai
//     (pichli position → nayi position ka bearing; rukne par last direction maintain)
//   🔴 red pin = kaam ki jagah (destination)
// Neutral white pill MAP PAR HI live doori dikhata hai (2.13 km) — arrived par hide.
// Arrival (150m) par: ➤ khud-ba-khud red pin par snap ho jata hai + map ke andar
// "🎯 Your Destination is Here" overlay + red pin sath dikhta hai.
// In dono ko AAPAS mein attach karta hai: sab se CHHOTA road rasta (OSRM alternatives
// mein se sab se kam distance wala).
export default function LiveMap({ booking, role, token, onUpdate, refreshMs = 4000 }) {
  const [sharing, setSharing] = useState(false);
  const [auto, setAuto] = useState(true);
  const [locMsg, setLocMsg] = useState('');
  const [err, setErr] = useState('');
  const [route, setRoute] = useState(null); // { coords, distKm, durMin } — shortest
  const routeCache = useRef({ key: '', data: null });
  const [liveCount, setLiveCount] = useState(0);
  const [moveDeg, setMoveDeg] = useState(null); // asli movement direction (prev → next)
  const [now, setNow] = useState(Date.now()); // stale-check ke liye har 30s tick

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
        setLocMsg('✓ Location shared — route updated');
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

  // Stale-check tick — har 30s clock aage barhta hai taake "location purani" warning
  // khud update ho (bina kisi extra API call ke)
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

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

  // Movement tracking — position change par (a) live counter, (b) ASLI direction:
  // pichli position se nayi position ka bearing = arrow ka munh us taraf jis taraf pro ja raha hai.
  // 5m se kam shift = GPS noise, direction nahi badalte.
  const prevPos = useRef(null);
  useEffect(() => {
    if (!moverLat || !moverLng) return;
    const key = `${moverLat},${moverLng}`;
    if (prevPos.current && prevPos.current.key !== key) {
      const p = prevPos.current;
      if (haversineKm(p.lat, p.lng, moverLat, moverLng) > 0.005) {
        setMoveDeg(bearing(p.lat, p.lng, moverLat, moverLng));
      }
      setLiveCount((c) => c + 1);
    }
    prevPos.current = { key, lat: moverLat, lng: moverLng };
  }, [moverLat, moverLng]);

  const straightKm = haveMover && haveDest ? haversineKm(moverLat, moverLng, destLat, destLng) : null;
  const distKm = route ? route.distKm : straightKm;
  const etaMin = route ? route.durMin : (straightKm != null ? travelMinutes(straightKm) : null);
  // Arrival seedhi doori se decide hoti hai (road one-way ho to road-distance bharak sakti hai)
  const arrivedGps = straightKm != null && straightKm <= 0.15; // 150m ke andar = pohanch gaya

  // ARRIVED: ➤ automatically red pin par snap ho jata hai
  const pinLat = arrivedGps && haveDest ? destLat : moverLat;
  const pinLng = arrivedGps && haveDest ? destLng : moverLng;

  // ➤ ki direction: pehles asli movement direction; na ho to route ka agla point
  // (ya seedhi dest ki taraf) — fallback.
  const routeDeg = (() => {
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
  const arrowDeg = moveDeg ?? routeDeg;

  // SIRF 2 points: ➤ triangle (mover — arrived par pin par snap) + 🔴 red pin (dest)
  const points = [];
  if (haveDest) points.push({ lat: destLat, lng: destLng, type: 'dest', label: `🔴 Kaam ki jagah — ${booking.dest_address || 'Service address'}` });
  if (haveMover) points.push({ lat: pinLat, lng: pinLng, type: 'pro', label: `➤ ${moverName} aa rahe hain` });

  // Neutral white pill — MAP PAR HI live doori (arrived par hide ho jata hai)
  const pill = haveMover && haveDest && !arrivedGps && distKm != null
    ? { lat: pinLat, lng: pinLng, text: `${distKm.toFixed(2)} km` }
    : null;
  // Map ke andar arrival message (red pin sath)
  const mapOverlay = arrivedGps && haveDest ? '🎯 Your Destination is Here' : null;

  // STALE GPS: mover ki last fix 3+ min purani = GPS band/weak lagta hai.
  // Mover ki APNI timestamp dekhte hain (customer view par pro_loc_at, pro view par pro_loc_at).
  const moverLocAt = booking.pro_loc_at || booking.customer_loc_at;
  const locAgeMin = moverLocAt ? Math.floor((now - new Date(moverLocAt).getTime()) / 60000) : null;
  const gpsStale = !arrivedGps && haveMover && locAgeMin != null && locAgeMin >= 3;

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

      {/* STALE GPS WARNING — location 3+ min purani ho to (real apps jaisa)
          + manual fallback: pro apna Share location dabaye, customer ko maloom de */}
      {gpsStale && (
        <div className="alert warn gps-stale-banner">
          ⚠️ <b>{isProView ? 'Aap ki' : `${moverName} ki`} location {locAgeMin} min purani hai</b> — GPS band ya weak lagta hai.{' '}
          {isProView
            ? 'Neeche “🧭 Share location” dabayen taake customer ko live position dikhe.'
            : 'Professional se location share karwayen — ya wo apna GPS on kar ke app khole.'}
        </div>
      )}

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
            <span className="hint">
              last update: {lastAt ? new Date(lastAt).toLocaleTimeString() : '—'}{liveCount > 0 && <b> · live ×{liveCount}</b>}
              {!arrivedGps && gpsStale && <b style={{ color: 'var(--danger)' }}> · ⚠ {locAgeMin}m purana</b>}
            </span>
          </div>
        </div>
      ) : (
        <div className="alert info">📍 {isProView ? 'Share your location — then your live route to the red pin will appear here.' : 'The provider will share their location — their live route to the red pin will appear here.'}</div>
      )}

      {isProView && (
        <div className="row">
          {booking.status === 'accepted' && (
            <button
              className="btn"
              onClick={async () => {
                setErr(''); setLocMsg('');
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
          <button className={`btn small secondary ${gpsStale ? 'pulse' : ''}`} disabled={sharing} onClick={share}>
            {sharing ? '⏳ Sharing…' : gpsStale ? '⚠️ GPS purana — Dobara Share Karein' : '🧭 Share location'}
          </button>
          {auto && <span className="muted" style={{ fontSize: 12.5 }}>Aap ka ➤ GPS se khud aage badhta rehta hai</span>}
        </div>
      )}

      <div className="mt">
        {points.length === 2 ? (
          <MapView
            points={points}
            height={360}
            line={{ color: '#2563eb', coords: route?.coords }}
            arrowDeg={arrowDeg}
            pill={pill}
            overlay={mapOverlay}
          />
        ) : (
          <p className="muted">Map: once the ➤ (provider) and 🔴 (service location) markers meet, the full route is shown.</p>
        )}
        <p className="muted" style={{ fontSize: 12 }}>
          ➤ {moverName} (arrow ka munh us taraf jis taraf wo asal mein ja raha hai) · 🔴 <b>Red pin = jahan kaam karna hai</b> · Green line = sab se chhota road rasta · White pill = live doori (map par hi).
        </p>
      </div>
    </div>
  );
}
