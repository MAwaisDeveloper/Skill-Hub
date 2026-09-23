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
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

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
          {!form.latitude && <p className="muted">⚠ Location confirm karna zaroori hai — "Confirm Location" dabayein ya map par pin drop karein.</p>}
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
