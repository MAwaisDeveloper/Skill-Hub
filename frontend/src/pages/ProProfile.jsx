import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { useApp } from '../context';
import Layout from '../components/Layout';
import { StatusBadge } from '../components/ui';

export default function ProProfile() {
  const { session } = useApp();
  const token = session?.token;
  const [profile, setProfile] = useState(null);
  const [categories, setCategories] = useState([]);
  const [selectedCats, setSelectedCats] = useState([]);
  const [areas, setAreas] = useState('');
  const [docs, setDocs] = useState({});
  const [uploadMsg, setUploadMsg] = useState(null);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const load = async () => {
    try {
      const d = await api.get('/professional/me/dashboard', token);
      setProfile(d.profile);
      const cats = await api.get('/customer/categories', token);
      setCategories(cats);
    } catch (e) { setError(e.message); }
  };
  useEffect(() => { load(); }, []);

  const saveProfile = async () => {
    setError(''); setMsg('');
    try {
      await api.put('/professional/me/profile', {
        bio: profile.bio,
        experience_years: Number(profile.experience_years || 0),
        payout_account: profile.payout_account,
        payout_provider: profile.payout_provider,
        available_now: !!profile.available_now,
        profile_photo: profile.profile_photo,
      }, token);
      setMsg('Profile saved');
      await load();
    } catch (e) { setError(e.message); }
  };

  const uploadDocs = async () => {
    setError(''); setUploadMsg(null);
    try {
      const fd = new FormData();
      ['cnic_front', 'cnic_back', 'selfie', 'profile_photo'].forEach((k) => {
        if (docs[k]?.[0]) fd.append(k, docs[k][0]);
      });
      const res = await fetch('/api/professional/documents/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      setUploadMsg(data);
      await load();
    } catch (e) { setError(e.message); }
  };

  const submitForVerification = async () => {
    setError(''); setMsg('');
    try {
      await api.post('/auth/professional/profile', {
        full_name: profile.full_name,
        cnic_number: profile.cnic_number,
        experience_years: Number(profile.experience_years || 0),
        bio: profile.bio,
        payout_account: profile.payout_account,
        payout_provider: profile.payout_provider,
        category_ids: selectedCats,
        areas: areas.split(',').map((a) => a.trim()).filter(Boolean),
      }, token);
      setMsg('Submitted! Admin will review your CNIC + selfie — you are notified on decision.');
      await load();
    } catch (e) { setError(e.message); }
  };

  if (!profile) return <Layout title="Loading…">{error && <div className="alert error">{error}</div>}</Layout>;

  return (
    <Layout title="Profile & Verification" subtitle="Your public profile, verification documents and payout account">
      {msg && <div className="alert success">{msg}</div>}
      {error && <div className="alert error">{error}</div>}

      <div className="grid cols-2">
        <div className="card">
          <h2>Public Profile <StatusBadge status={profile.verification_status} /></h2>
          <div className="kv">
            <span className="k">Name</span><span>{profile.full_name}</span>
            <span className="k">CNIC</span><span>{profile.cnic_number}</span>
            <span className="k">Rating</span><span>★ {profile.average_rating} · {profile.completed_jobs} jobs</span>
            <span className="k">Trust Score</span><span>{profile.trust_score} / 100</span>
          </div>
          <div className="divider" />
          <label>Experience (years)</label>
          <input type="number" value={profile.experience_years || ''} onChange={(e) => setProfile({ ...profile, experience_years: e.target.value })} />
          <label>Bio (shown to customers)</label>
          <textarea rows={3} value={profile.bio || ''} onChange={(e) => setProfile({ ...profile, bio: e.target.value })} />
          <label>Payout Account (JazzCash/Easypaisa number)</label>
          <input value={profile.payout_account || ''} onChange={(e) => setProfile({ ...profile, payout_account: e.target.value })} />
          <label>Payout Provider</label>
          <select value={profile.payout_provider || 'jazzcash'} onChange={(e) => setProfile({ ...profile, payout_provider: e.target.value })}>
            <option value="jazzcash">JazzCash</option>
            <option value="easypaisa">Easypaisa</option>
          </select>
          <label className="row" style={{ fontWeight: 600 }}>
            <input type="checkbox" style={{ width: 'auto', margin: 0 }} checked={!!profile.available_now} onChange={(e) => setProfile({ ...profile, available_now: e.target.checked ? 1 : 0 })} />
            Available Now (appears in urgent searches)
          </label>
          <button className="btn" onClick={saveProfile}>Save Profile</button>
        </div>

        <div>
          <div className="card">
            <h2>Verification Documents (image upload)</h2>
            <p className="muted mb">Sirf JPG/PNG (max 5MB). Front/Back CNIC-card ratio (landscape) hone chahiye, Selfie portrait. Front ≠ Back (same image par validation error).</p>
            <label>CNIC Front image *</label>
            <input type="file" accept="image/jpeg,image/png" onChange={(e) => setDocs({ ...docs, cnic_front: e.target.files })} />
            <label>CNIC Back image *</label>
            <input type="file" accept="image/jpeg,image/png" onChange={(e) => setDocs({ ...docs, cnic_back: e.target.files })} />
            <label>Live Selfie image *</label>
            <input type="file" accept="image/jpeg,image/png" onChange={(e) => setDocs({ ...docs, selfie: e.target.files })} />
            <label>Profile Photo (optional)</label>
            <input type="file" accept="image/jpeg,image/png" onChange={(e) => setDocs({ ...docs, profile_photo: e.target.files })} />
            <button className="btn" onClick={uploadDocs}>Upload & Validate Documents</button>
            {uploadMsg && (
              <div className="alert success mt">
                ✅ Validated!<br />
                Front: {uploadMsg.checks?.front}<br />Back: {uploadMsg.checks?.back}<br />
                Selfie: {uploadMsg.checks?.selfie}<br />{uploadMsg.checks?.duplicates}
              </div>
            )}
            {profile?.cnic_front_photo && (
              <div className="row mt">
                <span className="muted">Current:</span>
                <img src={profile.cnic_front_photo} alt="front" style={{ height: 46, borderRadius: 6, border: '1px solid var(--border)' }} />
                <img src={profile.cnic_back_photo} alt="back" style={{ height: 46, borderRadius: 6, border: '1px solid var(--border)' }} />
                <img src={profile.selfie_photo} alt="selfie" style={{ height: 46, width: 46, borderRadius: '50%', objectFit: 'cover', border: '1px solid var(--border)' }} />
              </div>
            )}

            <div className="divider" />
            <label>My Categories (re-select to update)</label>
            <div className="row" style={{ rowGap: 4 }}>
              {categories.map((c) => (
                <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 5, fontWeight: 400 }}>
                  <input type="checkbox" style={{ width: 'auto', margin: 0 }}
                    checked={selectedCats.includes(c.id)}
                    onChange={(e) => setSelectedCats(e.target.checked ? [...selectedCats, c.id] : selectedCats.filter((x) => x !== c.id))} />
                  {c.name}
                </label>
              ))}
            </div>
            <label>Areas Served (comma separated)</label>
            <input value={areas} onChange={(e) => setAreas(e.target.value)} placeholder="Gulberg III, DHA Phase 5" />

            <button className="btn gold" onClick={submitForVerification} disabled={!profile.cnic_number}>
              {profile.verification_status === 'verified' ? 'Update & Re-submit' : 'Submit for Verification'}
            </button>
            <p className="muted mt">
              <b>Rules:</b> only <b>Verified</b> professionals appear in search and receive bookings. Rejection shows a reason — you can fix and resubmit.
            </p>
          </div>
        </div>
      </div>
    </Layout>
  );
}
