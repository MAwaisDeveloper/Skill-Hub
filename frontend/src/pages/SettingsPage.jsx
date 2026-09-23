import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { useApp } from '../context';
import Layout from '../components/Layout';

export default function SettingsPage() {
  const { session } = useApp();
  const token = session?.token;
  const role = session?.user?.role;
  const [me, setMe] = useState(null);
  const [account, setAccount] = useState({ email: '', preferred_language: '' });
  const [pwd, setPwd] = useState({ current_password: '', new_password: '', confirm: '' });
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const load = async () => {
    try { setMe(await api.get('/auth/me', token)); } catch (e) { setError(e.message); }
  };
  useEffect(() => { load(); }, []);

  const saveAccount = async () => {
    setError(''); setMsg('');
    try {
      await api.put('/auth/me', account, token);
      setMsg('Account updated');
      await load();
    } catch (e) { setError(e.message); }
  };

  const changePassword = async () => {
    setError(''); setMsg('');
    try {
      if (pwd.new_password !== pwd.confirm) throw new Error('Confirm password does not match');
      await api.post('/auth/change-password', { current_password: pwd.current_password, new_password: pwd.new_password }, token);
      setMsg('Password saved ✓ — ab phone + password se bhi login ho sakta hai');
      setPwd({ current_password: '', new_password: '', confirm: '' });
    } catch (e) { setError(e.message); }
  };

  const p = me?.profile;
  return (
    <Layout title="Settings & Profile" subtitle="Your personal details, work info and password">
      {msg && <div className="alert success">{msg}</div>}
      {error && <div className="alert error">{error}</div>}

      <div className="grid cols-2">
        <div className="card">
          <h2>👤 Account</h2>
          <div className="kv mb">
            <span className="k">Name</span><span><b>{me?.profile?.full_name || session?.user?.phone}</b></span>
            <span className="k">Phone (login)</span><span>{me?.phone}</span>
            <span className="k">Role</span><span><span className="badge status">{role}</span></span>
            <span className="k">{role === 'professional' ? 'Verification' : 'Trust Score'}</span>
            <span>{role === 'professional' ? (p?.verification_status || 'pending') : `${p?.trust_score ?? 100} / 100`}</span>
          </div>
          <label>Email</label>
          <input value={account.email !== '' ? account.email : (me?.email || '')} onChange={(e) => setAccount({ ...account, email: e.target.value })} placeholder="email@example.com" />
          <label>Preferred Language</label>
          <select value={account.preferred_language || me?.preferred_language || 'en'} onChange={(e) => setAccount({ ...account, preferred_language: e.target.value })}>
            <option value="en">English</option>
            <option value="ur">اردو (Urdu)</option>
          </select>
          <button className="btn" onClick={saveAccount}>Save Account</button>
        </div>

        {role === 'professional' && (
          <div className="card">
            <h2>🛠 Work Info</h2>
            <div className="kv">
              <span className="k">Experience</span><span>{p?.experience_years} years</span>
              <span className="k">Rating</span><span>★ {p?.average_rating} · {p?.completed_jobs} jobs</span>
              <span className="k">CNIC</span><span>{p?.cnic_number}</span>
              <span className="k">Payout</span><span>{p?.payout_account || '—'} ({p?.payout_provider || '—'})</span>
              <span className="k">Documents</span><span>{p?.cnic_front_photo ? 'Uploaded ✓' : 'Pending ✗'}</span>
            </div>
            <p className="muted mt">To edit work details, use the <b>Profile & Verification</b> page.</p>
          </div>
        )}

        {role === 'customer' && (
          <div className="card">
            <h2>📍 Saved Addresses</h2>
            <p className="muted">Manage from the Profile & Addresses page (with map pins).</p>
          </div>
        )}

        <div className="card">
          <h2>🔒 Password</h2>
          {me?.password_hash !== undefined && !me?.password_hash && (
            <div className="alert info">You currently log in with OTP only — setting a password also enables phone + password login.</div>
          )}
          <label>Current Password (agar set hai)</label>
          <input type="password" value={pwd.current_password} onChange={(e) => setPwd({ ...pwd, current_password: e.target.value })} />
          <label>New Password (min 8)</label>
          <input type="password" value={pwd.new_password} onChange={(e) => setPwd({ ...pwd, new_password: e.target.value })} />
          <label>Confirm New Password</label>
          <input type="password" value={pwd.confirm} onChange={(e) => setPwd({ ...pwd, confirm: e.target.value })} />
          <button className="btn" onClick={changePassword} disabled={!pwd.new_password}>Save Password</button>
        </div>
      </div>
    </Layout>
  );
}
