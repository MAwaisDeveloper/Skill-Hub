import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { useApp } from '../context';
import Layout from '../components/Layout';
import MapPicker from '../components/MapPicker';

export default function CustomerProfile() {
  const { session } = useApp();
  const token = session?.token;
  const [profile, setProfile] = useState({});
  const [addresses, setAddresses] = useState([]);
  const [form, setForm] = useState({ label: 'home', area: '', full_address: '', latitude: '', longitude: '' });
  const [locating, setLocating] = useState(false);
  const [geoMsg, setGeoMsg] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  // Free geocoding chain (no API key, sara free):
  // 1) Photon (komoot) — fuzzy/partial addresses behtar samajhta hai (PK par strong)
  // 2) Nominatim fallback — countrycodes=pk ke sath
  // 3) Area-only fallback — sirf area search (e.g. "Johar Town Lahore")
  const confirmLocation = async () => {
    setError(''); setGeoMsg('');
    if (!form.full_address?.trim()) { setError('Enter the Full Address first'); return; }
    setLocating(true);
    const pick = (p) => {
      const lat = Number(p.lat ?? p.geometry?.coordinates?.[1]);
      const lng = Number(p.lon ?? p.geometry?.coordinates?.[0]);
      return lat && lng ? { lat: lat.toFixed(7), lng: lng.toFixed(7), label: p.display_name || [p.name, p.city, p.state].filter(Boolean).join(', ') } : null;
    };
    try {
      let hit = null;
      const full = form.full_address.trim();
      const area = (form.area || '').trim();
      const fromFeature = (f, suffix = '') => {
        if (!f?.geometry?.coordinates) return null;
        const [lng, lat] = f.geometry.coordinates;
        if (!lat || !lng) return null;
        const p = f.properties || {};
        return { lat: lat.toFixed(7), lng: lng.toFixed(7), label: [p.name, p.street, p.city, p.state].filter(Boolean).join(', ') + suffix };
      };
      const photon = async (q) => {
        try {
          const r = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=1&lat=31.5155&lon=74.3436`);
          const d = await r.json();
          return d.features?.length ? d.features[0] : null;
        } catch { return null; }
      };
      // 1) Full address (area ke sath)
      let f = await photon([full, area].filter(Boolean).join(', ') + ', Lahore, Pakistan');
      // 2) Sirf full address
      if (!f) f = await photon(full + ', Lahore, Pakistan');
      // 3) Area-only (full address bohat specific/typo ho to) — user ka exact case
      if (!f && area) f = await photon(area + ' Lahore Pakistan');
      // 4) Area ke pehle 3 words
      if (!f && area) f = await photon(area.split(/\s+/).slice(0, 3).join(' ') + ' Lahore Pakistan');
      if (f) {
        hit = fromFeature(f);
        // agar ye area-level result hai (full address se match nahi hua) to note
        const usedAreaFallback = area && f.properties?.name && !full.toLowerCase().includes(String(f.properties.name).toLowerCase());
        if (hit && usedAreaFallback) hit.label += ' (area-level pin — drag on the map to fine-tune)';
      }
      if (hit) {
        setForm((prev) => ({ ...prev, latitude: String(hit.lat), longitude: String(hit.lng) }));
        setGeoMsg(`✓ Location found: ${hit.label?.slice(0, 100)} — the pin is on the map; drag it to adjust, then press Add Address`);
      } else {
        setGeoMsg('✗ Exact match not found — click on the map to drop the pin manually, then press Add Address.');
      }
    } catch {
      setGeoMsg('Could not reach the location service — drop the pin manually on the map.');
    }
    setLocating(false);
  };

  const load = async () => {
    try {
      setProfile(await api.get('/customer/me/profile', token));
      setAddresses(await api.get('/customer/me/addresses', token));
    } catch (e) { setError(e.message); }
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    setError(''); setMsg('');
    try {
      await api.put('/customer/me/profile', profile, token);
      setMsg('Profile saved');
      await load();
    } catch (e) { setError(e.message); }
  };

  const addAddress = async () => {
    setError(''); setMsg('');
    try {
      await api.post('/customer/me/addresses', {
        ...form,
        latitude: form.latitude ? Number(form.latitude) : null,
        longitude: form.longitude ? Number(form.longitude) : null,
      }, token);
      setMsg('Address added');
      setForm({ label: 'home', area: '', full_address: '', latitude: '', longitude: '' });
      await load();
    } catch (e) { setError(e.message); }
  };

  return (
    <Layout title="Profile & Addresses" subtitle="Your account details, trust score and saved service locations">
      {msg && <div className="alert success">{msg}</div>}
      {error && <div className="alert error">{error}</div>}
      {geoMsg && <div className="alert info">{geoMsg}</div>}

      <div className="grid cols-2">
        <div className="card">
          <h2>My Details</h2>
          <div className="kv mb">
            <span className="k">Full Name</span><span><input style={{ margin: 0 }} value={profile.full_name || ''} onChange={(e) => setProfile({ ...profile, full_name: e.target.value })} /></span>
            <span className="k">Phone (login)</span><span>{session?.user?.phone}</span>
            <span className="k">Trust Score</span><span><b>{profile.trust_score ?? '100'}</b> / 100 — drops on late cancellations/disputes</span>
            <span className="k">Language</span><span>
              <select style={{ margin: 0 }} value={session?.user?.preferred_language || 'en'} onChange={(e) => setProfile({ ...profile, preferred_language: e.target.value })}>
                <option value="en">English</option>
                <option value="ur">اردو (Urdu)</option>
              </select>
            </span>
          </div>
          <button className="btn" onClick={save}>Save Profile</button>
        </div>

        <div className="card">
          <h2>Add Service Address</h2>
          <label>Label</label>
          <select value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })}>
            <option value="home">Home</option>
            <option value="office">Office</option>
            <option value="other">Other</option>
          </select>
          <label>Area (required)</label>
          <input value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })} placeholder="e.g. Gulberg III" />
          <label>Full Address (required)</label>
          <textarea rows={2} value={form.full_address} onChange={(e) => setForm({ ...form, full_address: e.target.value })} placeholder="e.g. Hafeez Center, Main Boulevard" />
          <button
            className="btn"
            disabled={!form.full_address?.trim() || locating}
            onClick={confirmLocation}
            title="Address text se map par location dhoondo (free Nominatim/OSM)"
          >
            {locating ? '🔍 Searching…' : '📍 Confirm Location on Map'}
          </button>
          <label>Pin on Map (click/drag to adjust)</label>
          <MapPicker
            lat={form.latitude ? Number(form.latitude) : null}
            lng={form.longitude ? Number(form.longitude) : null}
            onChange={(la, ln) => setForm((f) => ({ ...f, latitude: String(la), longitude: String(ln) }))}
 />
          {!form.latitude && <p className="muted">⚠ Confirming the location is required: press "Confirm Location" or drop a pin on the map.</p>}
          <button className="btn" disabled={!form.area?.trim() || !form.full_address?.trim() || !form.latitude} onClick={addAddress}>Add Address</button>
        </div>
      </div>

      <div className="card">
        <h2>Saved Addresses</h2>
        {addresses.length === 0 && <p className="muted">No saved addresses yet.</p>}
        <table>
          <thead><tr><th>Label</th><th>City</th><th>Area</th><th>Full Address</th><th>Map Pin</th></tr></thead>
          <tbody>
            {addresses.map((a) => (
              <tr key={a.id}>
                <td><span className="badge status">{a.label}</span></td>
                <td>{a.city}</td>
                <td>{a.area || '—'}</td>
                <td>{a.full_address}</td>
                <td className="muted">{a.latitude ? `${Number(a.latitude).toFixed(4)}, ${Number(a.longitude).toFixed(4)}` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Layout>
  );
}
